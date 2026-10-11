"""Launch promotion: separate, non-withdrawable credits; server-only eligible rides."""
from datetime import datetime, timedelta, timezone
from typing import Literal
from decimal import Decimal, ROUND_HALF_UP
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from pymongo import ReturnDocument
from database import db
from utils import get_current_user

router = APIRouter()
DURATION_DAYS = 30
DAILY_RIDES = 2
CAP = 4000
RATE = Decimal('0.15')

def money(value):
    return float(Decimal(str(value)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))

def utc(value):
    if isinstance(value, str): value = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if isinstance(value, datetime): return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value
    return None

async def campaign():
    return await db.promotion_campaigns.find_one({'_id': 'launch'}) or {'phase': 'beta'}

def plan_status(user, config, now=None):
    now = now or datetime.now(timezone.utc)
    launched = utc(config.get('launched_at'))
    registered = utc(user.get('created_at')) or launched
    start = max(launched, registered) if launched and registered else None
    end = start + timedelta(days=DURATION_DAYS) if start else None
    active = user.get('promotion_plan') == 'barter_30' and launched is not None and start <= now < end
    return {'plan': user.get('promotion_plan'), 'phase': config.get('phase', 'beta'),
            'duration_days': DURATION_DAYS, 'starts_at': start, 'ends_at': end, 'active': active,
            'daily_rides': DAILY_RIDES, 'coverage_cap': CAP}

@router.get('/api/promotions/plan')
async def get_plan():
    config = await campaign()
    return {**plan_status({}, config), 'launched_at': config.get('launched_at'), 'commission_rate': float(RATE)}

class Enrollment(BaseModel):
    plan: Literal['barter_30', 'standard_15']

@router.post('/api/promotions/enroll')
async def enroll(data: Enrollment, user=Depends(get_current_user)):
    if user.get('user_type') != 'driver': raise HTTPException(403, 'Solo conductores pueden elegir este plan')
    config = await campaign()
    if data.plan == 'barter_30' and config.get('launched_at') and not plan_status({**user, 'promotion_plan': 'barter_30'}, config)['active']:
        raise HTTPException(409, 'La promoción de lanzamiento terminó')
    result = await db.users.update_one({'user_id': user['user_id'], 'promotion_plan_selected_at': {'$exists': False}},
        {'$set': {'promotion_plan': data.plan, 'promotion_plan_selected_at': datetime.now(timezone.utc)}})
    if result.modified_count != 1: raise HTTPException(409, 'El plan ya fue elegido')
    return plan_status({**user, 'promotion_plan': data.plan}, config)

class Launch(BaseModel):
    launch: bool

@router.put('/api/admin/promotions/launch')
async def launch(data: Launch, user=Depends(get_current_user)):
    if user.get('user_type') != 'admin': raise HTTPException(403, 'Solo administración')
    if not data.launch: raise HTTPException(409, 'El lanzamiento no puede retroceder ni reiniciar plazos')
    now = datetime.now(timezone.utc)
    await db.promotion_campaigns.update_one({'_id': 'launch'}, {'$setOnInsert':
        {'phase': 'launched', 'launched_at': now, 'launched_by': user['user_id']}}, upsert=True)
    return await get_plan()

@router.post('/api/admin/promotions/rides/{ride_id}')
async def mark_ride(ride_id: str, user=Depends(get_current_user)):
    if user.get('user_type') != 'admin': raise HTTPException(403, 'Solo administración')
    ride = await db.rides.find_one({'ride_id': ride_id})
    if not ride: raise HTTPException(404, 'Viaje inexistente')
    if ride.get('payment_method', 'cash') != 'cash':
        raise HTTPException(409, 'El canje admite efectivo; pagos externos requieren integración de descuento')
    driver = await db.users.find_one({'user_id': ride.get('driver_id')})
    if not driver or not plan_status(driver, await campaign())['active']:
        raise HTTPException(409, 'El conductor no tiene el canje activo')
    now = datetime.now(timezone.utc)
    day = now.astimezone(timezone(timedelta(hours=-3))).date().isoformat()
    key = f"{ride['driver_id']}:{day}"
    async def reserve(session):
        await db.promotion_daily.update_one({'_id': key}, {'$setOnInsert': {'reserved': 0, 'completed': 0}}, upsert=True, session=session)
        slot = await db.promotion_daily.update_one({'_id': key, 'reserved': {'$lt': DAILY_RIDES}}, {'$inc': {'reserved': 1}}, session=session)
        if slot.modified_count != 1: raise HTTPException(409, 'Los dos cupos promocionales del día ya están reservados')
        result = await db.rides.update_one({'ride_id': ride_id, 'status': {'$in': ['accepted', 'arrived', 'started']},
            'status_update_claim': {'$exists': False}, 'promotion': {'$exists': False}}, {'$set':
            {'promotion': {'campaign_id': 'launch', 'coverage_cap': CAP, 'credit_rate': float(RATE),
                           'authorized_by': user['user_id'], 'authorized_at': now, 'reserved_day': day}}}, session=session)
        if result.modified_count != 1: raise HTTPException(409, 'Viaje cerrado, liquidando o ya promocional')
        return {'status': 'promotional', 'coverage_cap': CAP}
    async with await db.client.start_session() as session:
        result = await session.with_transaction(reserve)
    from websocket_manager import manager
    for participant in (ride['rider_id'], ride['driver_id']):
        await manager.send_personal_message({'type': 'ride_promotion_changed', 'ride_id': ride_id}, participant)
    return result


def settlement_amounts(fare, penalty, active, promo, credit):
    fare = money(fare)
    penalty = money(penalty)
    covered = money(min(max(fare - penalty, 0), CAP)) if promo else 0.0
    customer_due = money(fare - covered)
    eligible_commission = 0.0 if active else money(Decimal(str(max(customer_due - penalty, 0))) * RATE)
    commission = money(Decimal(str(eligible_commission)) + Decimal(str(penalty)) * RATE)
    used = money(min(max(credit, 0), eligible_commission))
    return {'customer_amount_due': customer_due, 'promotional_coverage': covered,
            'commission_before_credit': commission, 'promotional_credit_used': used,
            'promotional_credit_earned': money(Decimal(str(covered)) * RATE),
            'commission': money(commission - used), 'driver_earnings': money(customer_due - commission + used)}

async def settle_promotion(ride, fare, penalty=0):
    """Financial credit ledger and daily count share one Mongo transaction.
    Outer ride status claim prevents replay of ordinary wallet effects.
    """
    async def apply(session):
        previous = await db.promotion_settlements.find_one({'_id': ride['ride_id']}, session=session)
        if previous:
            raise HTTPException(409, 'Liquidación promocional ya registrada; requiere conciliación')
        driver = await db.users.find_one({'user_id': ride['driver_id']}, session=session) or {}
        config = await db.promotion_campaigns.find_one({'_id': 'launch'}, session=session) or {}
        state = plan_status(driver, config)
        promo = bool(ride.get('promotion', {}).get('authorized_by'))
        if promo:
            authorized = utc(ride['promotion'].get('authorized_at'))
            if not authorized or not state['starts_at'] or not state['starts_at'] <= authorized < state['ends_at']:
                raise HTTPException(409, 'El viaje no fue autorizado dentro del período promocional')
        if promo:
            reserved_day = ride['promotion'].get('reserved_day')
            if not reserved_day: raise HTTPException(409, 'El viaje no tiene un cupo promocional reservado')
            key = f"{ride['driver_id']}:{reserved_day}"
            limit = await db.promotion_daily.update_one({'_id': key, 'reserved': {'$lte': DAILY_RIDES}, 'completed': {'$lt': DAILY_RIDES}},
                {'$inc': {'completed': 1}}, session=session)
            if limit.modified_count != 1: raise HTTPException(409, 'Cupo promocional inválido; requiere revisión')
        amounts = settlement_amounts(fare, penalty, state['active'] or promo, promo, driver.get('promotional_credit_balance', 0))
        delta = money(amounts['promotional_credit_earned'] - amounts['promotional_credit_used'])
        await db.users.update_one({'user_id': ride['driver_id']}, {'$inc': {'promotional_credit_balance': delta}}, session=session)
        await db.promotion_settlements.insert_one({'_id': ride['ride_id'], 'ride_id': ride['ride_id'], 'user_id': ride['driver_id'],
            'created_at': datetime.now(timezone.utc), **amounts}, session=session)
        return amounts
    async with await db.client.start_session() as session:
        return await session.with_transaction(apply)

async def get_wallet_promotion(user):
    return plan_status(user, await campaign())

@router.get('/api/wallet/promotion-transactions')
async def promotion_transactions(user=Depends(get_current_user)):
    entries = await db.promotion_settlements.find({'user_id': user['user_id']}, {'_id': 0}).sort('created_at', -1).to_list(100)
    return {'transactions': entries}

async def release_promotion_reservation(ride):
    if not ride.get('promotion', {}).get('reserved_day'): return
    async def release(session):
        result = await db.rides.update_one({'ride_id': ride['ride_id'], 'promotion.reservation_released': {'$ne': True}},
            {'$set': {'promotion.reservation_released': True}}, session=session)
        if result.modified_count == 1:
            await db.promotion_daily.update_one({'_id': f"{ride['driver_id']}:{ride['promotion']['reserved_day']}", 'reserved': {'$gt': 0}},
                {'$inc': {'reserved': -1}}, session=session)
    async with await db.client.start_session() as session:
        await session.with_transaction(release)
