"""Authenticated operational fleet snapshot and immediate administrator events."""
import math, logging, os
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.encoders import jsonable_encoder
from database import db
from utils import get_current_user
from websocket_manager import manager
router = APIRouter()

def valid_location(location):
    if not isinstance(location,dict): return False
    lat,lng=location.get('latitude'),location.get('longitude')
    return (isinstance(lat,(int,float)) and not isinstance(lat,bool) and isinstance(lng,(int,float))
        and not isinstance(lng,bool) and math.isfinite(lat) and math.isfinite(lng)
        and -90<=lat<=90 and -180<=lng<=180)

async def fleet_snapshot(provider_id=None):
    dq={'driver_id':provider_id} if provider_id else {}
    pq={'user_id':provider_id} if provider_id else {}
    drivers=await db.drivers.find(dq,{'_id':0}).to_list(1000)
    profiles=await db.professional_profiles.find(pq,{'_id':0}).to_list(1000)
    driver_by={d['driver_id']:d for d in drivers if d.get('driver_id')}
    pro_by={p['user_id']:p for p in profiles if p.get('user_id')}
    ids=list(set(driver_by)|set(pro_by))
    accounts=await db.users.find({'user_id':{'$in':ids}}, {'_id':0,'user_id':1,'name':1,'is_blocked':1}).to_list(1000)
    vehicles=await db.vehicles.find({'driver_id':{'$in':ids},'is_active':True},{'_id':0,'driver_id':1,'vehicle_type':1,'vehicle_id':1,'plate_number':1}).to_list(1000)
    vehicle_by={v['driver_id']:v for v in vehicles}
    rides=await db.rides.find({'driver_id':{'$in':ids},'status':{'$in':['accepted','arrived','started']}},
        {'_id':0,'driver_id':1,'ride_id':1,'status':1,'service_type':1}).to_list(1000)
    jobs=await db.job_posts.find({'assigned_to':{'$in':ids},'status':{'$in':['assigned','in_progress','pending_completion']}},
        {'_id':0,'assigned_to':1,'job_id':1,'status':1,'category':1,'service_type':1}).to_list(1000)
    deliveries=await db.marketplace_deliveries.find({'assigned_driver_id':{'$in':ids},'status':{'$in':['assigned','picked_up','delivering']}},
        {'_id':0,'assigned_driver_id':1,'delivery_id':1,'status':1}).to_list(1000)
    ride_by={r['driver_id']:r for r in rides};job_by={j['assigned_to']:j for j in jobs};delivery_by={d['assigned_driver_id']:d for d in deliveries}
    result=[]
    for account in accounts:
        uid=account['user_id'];driver=driver_by.get(uid,{});pro=pro_by.get(uid,{})
        online=bool(driver.get('is_online') or pro.get('is_available'))
        loc=driver.get('current_location') if driver.get('is_online') else pro.get('location')
        if not valid_location(loc): loc=driver.get('current_location') or pro.get('location') or {}
        if not valid_location(loc): loc={}
        active_ride=ride_by.get(uid);active_job=job_by.get(uid);active_delivery=delivery_by.get(uid)
        activity='driver' if driver else 'professional'
        if active_ride:activity='delivery' if active_ride.get('service_type')=='delivery' else 'ride'
        elif active_delivery:activity='delivery'
        elif active_job:activity='tramite' if active_job.get('category')=='tramites' or active_job.get('service_type')=='tramite' else 'job'
        elif pro and not driver.get('is_online'):activity='tramite' if pro.get('categories')==['tramites'] else 'professional'
        capabilities=[]
        if driver:capabilities+=['rides','deliveries']
        if pro:capabilities+=pro.get('accepted_services') or ['jobs','paperwork']
        blocked=bool(account.get('is_blocked') or driver.get('is_blocked') or pro.get('is_blocked'))
        result.append({'provider_id':uid,'driver_id':uid,'name':account.get('name','Prestador'),
            'provider_type':'driver' if driver and driver.get('is_online') else 'professional' if pro else 'driver',
            'is_driver':bool(driver),'is_professional':bool(pro),'capabilities':list(dict.fromkeys(capabilities)),
            'activity':activity,'vehicle_type':vehicle_by.get(uid,{}).get('vehicle_type'),'vehicle_id':vehicle_by.get(uid,{}).get('vehicle_id'),'plate_number':vehicle_by.get(uid,{}).get('plate_number'),'category':active_job.get('category') if active_job else (pro.get('categories') or [None])[0],
            'latitude':loc.get('latitude'),'longitude':loc.get('longitude'),
            'updated_at':loc.get('updated_at'),
            'is_online':online,'is_available':online and not blocked and not any((active_ride,active_job,active_delivery)) and bool(driver.get('is_available',True) if driver.get('is_online') else pro.get('is_available')),
            'is_blocked':blocked,'active_ride':active_ride,'active_job':active_job,'active_delivery':active_delivery})
    return jsonable_encoder({'providers':result,'total':len(result),'online':sum(p['is_online'] for p in result),'updated_at':datetime.now(timezone.utc)})

@router.get('/api/admin/fleet/live')
async def get_live_fleet(user=Depends(get_current_user)):
    if user.get('user_type')!='admin':raise HTTPException(403,'Admin access required')
    return await fleet_snapshot()

async def _admin_ids():
    connected=list(manager.active_connections)
    if not connected:return []
    admins=await db.users.find({'user_id':{'$in':connected},'user_type':'admin'},{'_id':0,'user_id':1}).to_list(1000)
    return [admin['user_id'] for admin in admins]

async def emit_fleet_changed(provider_id=None):
    try:
        for uid in await _admin_ids():
            await manager.send_personal_message({'type':'fleet_changed','provider_id':provider_id,
                'updated_at':datetime.now(timezone.utc).isoformat()},uid)
    except Exception:logging.getLogger(__name__).warning('Fleet change delivery failed')

async def emit_provider_location(provider_id, *, reported_location=None, source=None):
    try:
        admins=await _admin_ids()
        if not admins and reported_location is None:return
        occurred_at=datetime.now(timezone.utc)
        if valid_location(reported_location):
            if source=='professional_rest':
                await db.professional_profiles.update_one({'user_id':provider_id},{'$set':{'location.updated_at':occurred_at}})
            else:
                await db.drivers.update_one({'driver_id':provider_id},{'$set':{'current_location.updated_at':occurred_at}})
        snapshot=await fleet_snapshot(provider_id)
        if not snapshot['providers']:return
        provider=snapshot['providers'][0]
        if reported_location is not None and valid_location(reported_location):
            await db.provider_location_history.insert_one({'provider_id':provider_id,
                'provider_type':provider['provider_type'],'latitude':reported_location['latitude'],
                'longitude':reported_location['longitude'],'vehicle_type':provider['vehicle_type'],
                'vehicle_id':provider.get('vehicle_id'),'plate_number':provider.get('plate_number'),
                'activity':provider['activity'],'occurred_at':occurred_at,
                'expires_at':occurred_at+timedelta(days=retention_days()),'source':source or 'rest'})
            provider.update({'latitude':reported_location['latitude'],'longitude':reported_location['longitude'],
                'updated_at':occurred_at.isoformat()})
        keys=('provider_id','provider_type','latitude','longitude','activity','vehicle_type','vehicle_id','plate_number','category','capabilities','updated_at','is_online','is_available','is_blocked')
        event={'type':'fleet_location',**{key:provider.get(key) for key in keys}}
        for uid in admins:await manager.send_personal_message(event,uid)
    except Exception:logging.getLogger(__name__).warning('Fleet location delivery failed')


def retention_days():
    try:return max(1,min(365,int(os.getenv('PROVIDER_LOCATION_RETENTION_DAYS','30'))))
    except ValueError:return 30

async def ensure_fleet_indexes():
    await db.provider_location_history.create_index([('provider_id',1),('occurred_at',1)])
    await db.provider_location_history.create_index('expires_at',expireAfterSeconds=0)

def parse_utc(value):
    try:
        parsed=datetime.fromisoformat(value.replace('Z','+00:00'))
        if parsed.tzinfo is None:raise ValueError('Timezone required')
        return parsed.astimezone(timezone.utc)
    except (ValueError,TypeError,OverflowError):
        raise HTTPException(422,'Usá fecha y hora ISO con zona horaria')

@router.get('/api/admin/fleet/{provider_id}/trajectory')
async def get_trajectory(provider_id:str,from_time:str=Query(...),to_time:str=Query(...),user=Depends(get_current_user),vehicle_id:str|None=None):
    if user.get('user_type')!='admin':raise HTTPException(403,'Admin access required')
    start,end=parse_utc(from_time),parse_utc(to_time)
    if end<=start or end-start>timedelta(days=7):
        raise HTTPException(422,'El intervalo debe ser mayor a cero y de hasta 7 días')
    driver=await db.drivers.find_one({'driver_id':provider_id},{'_id':0,'driver_id':1})
    professional=await db.professional_profiles.find_one({'user_id':provider_id},{'_id':0,'user_id':1})
    account=await db.users.find_one({'user_id':provider_id},{'_id':0,'user_id':1})
    if not account or not (driver or professional):raise HTTPException(404,'Prestador no encontrado')
    query={'provider_id':provider_id,'occurred_at':{'$gte':start,'$lte':end},'expires_at':{'$gt':datetime.now(timezone.utc)}}
    if vehicle_id:
        if len(vehicle_id)>120:raise HTTPException(422,'Identificador de vehículo inválido')
        vehicle=await db.vehicles.find_one({'vehicle_id':vehicle_id,'driver_id':provider_id},{'_id':0,'vehicle_id':1})
        if not vehicle:raise HTTPException(404,'Vehículo no encontrado para ese prestador')
        query['vehicle_id']=vehicle_id
    rows=await db.provider_location_history.find(query,
        {'_id':0,'latitude':1,'longitude':1,'occurred_at':1,'provider_type':1,'vehicle_type':1,'vehicle_id':1,'plate_number':1,'activity':1,'source':1}).sort('occurred_at',1).to_list(10001)
    return jsonable_encoder({'provider_id':provider_id,'from_time':start,'to_time':end,
        'vehicle_id':vehicle_id,'points':rows[:10000],'count':min(len(rows),10000),'truncated':len(rows)>10000,
        'retention_days':retention_days(),'history_started_at':None if not rows else rows[0]['occurred_at'],
        'note':'Sólo ubicaciones recibidas desde que se activó este registro; no prueba movimiento durante desconexión.'})
