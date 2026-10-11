"""One working vehicle per account, independent capabilities and scoped documents."""
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException
from database import db
from utils import has_active_capability, effective_capability_user

MOBILITY = ('ride_driver', 'moto_driver', 'taxi_driver', 'parcel', 'delivery')
VEHICLE_DOCS = {'vehicle_registration', 'insurance'}
COMMON_DOCS = {'license', 'id_front', 'id_back', 'criminal_record'}

def vehicle_capability(vehicle):
    return 'moto_driver' if vehicle.get('vehicle_type') in ('moto','motorcycle') else 'taxi_driver' if vehicle.get('vehicle_type')=='taxi' else 'ride_driver'

def mobility_verified(approvals):
    return any(approvals.get(cap, {}).get('status')=='approved' for cap in MOBILITY)

async def working_vehicle(driver_id, vehicle_type=None, database=None):
    database = database if database is not None else db
    profile = await database.drivers.find_one({'driver_id': driver_id}) or {}
    query = {'driver_id': driver_id, 'is_active': True}
    if profile.get('active_vehicle_id'): query['vehicle_id'] = profile['active_vehicle_id']
    vehicles = await database.vehicles.find(query, {'_id': 0}).to_list(2)
    if len(vehicles)!=1: return None
    vehicle = vehicles[0]
    if vehicle_type and vehicle.get('vehicle_type')!=vehicle_type: return None
    if vehicle.get('approval_status')=='rejected': return None
    return vehicle

async def ensure_vehicle_capacity(user, vehicle):
    user=await effective_capability_user(user)
    approvals=user.get('capability_approvals') or {}
    physical_caps = ('moto_driver',) if vehicle_capability(vehicle)=='moto_driver' else ('ride_driver','taxi_driver')
    applicable = tuple(cap for cap in physical_caps if cap in approvals) or ('parcel','delivery')
    if approvals and not has_active_capability(user, *applicable):
        raise HTTPException(403, 'La capacidad correspondiente a este vehículo no está habilitada')
    if user.get('user_id') and approvals:
        docs=await db.driver_documents.find({'driver_id':user['user_id']},{'_id':0,'doc_type':1,'status':1,'vehicle_id':1,'uploaded_at':1}).to_list(200)
        single=await db.vehicles.count_documents({'driver_id':user['user_id']},limit=2)==1
        _,latest,_=document_check(docs,vehicle.get('vehicle_id'),single)
        if any(d.get('status')=='rejected' for d in latest.values()):raise HTTPException(403, {'error':'document_rejected','message':'Corregí la documentación rechazada de esta cuenta o vehículo'})
    if vehicle.get('approval_status') == 'rejected': raise HTTPException(403, 'Este vehículo fue rechazado')
    if vehicle.get('approval_status') == 'pending':
        # New vehicles have their own review; existing approved capability is not a vehicle approval.
        config = await db.promotion_campaigns.find_one({'_id':'launch'}) or {}
        if config.get('phase','beta')=='launched':
            launched=config.get('launched_at'); submitted=vehicle.get('review_submitted_at') or vehicle.get('created_at')
            def utc(v):
                if isinstance(v,str):v=datetime.fromisoformat(v.replace('Z','+00:00'))
                return v.replace(tzinfo=timezone.utc) if isinstance(v,datetime) and v.tzinfo is None else v
            launched=utc(launched); submitted=utc(submitted)
            if not launched or not submitted or datetime.now(timezone.utc)>=max(launched,submitted)+timedelta(hours=24):
                raise HTTPException(403,'La revisión de este vehículo está pendiente y venció su acceso provisorio')

async def select_working_vehicle(driver_id, vehicle_id, actor_id):
    async def select(session):
        profile=await db.drivers.find_one({'driver_id':driver_id},session=session)
        if not profile:raise HTTPException(404,'Conductor inexistente')
        if profile.get('is_online'):raise HTTPException(409,'Desconectate antes de cambiar de vehículo')
        for collection,query in [(db.rides,{'driver_id':driver_id,'status':{'$in':['accepted','arrived','started']}}),
            (db.marketplace_deliveries,{'assigned_driver_id':driver_id,'status':{'$in':['assigned','picked_up','delivering']}}),
            (db.job_posts,{'assigned_to':driver_id,'status':{'$in':['assigned','in_progress','pending_completion']}})]:
            if await collection.find_one(query,session=session):raise HTTPException(409,'Finalizá el servicio activo antes de cambiar de vehículo')
        vehicle=await db.vehicles.find_one({'vehicle_id':vehicle_id,'driver_id':driver_id},session=session)
        if not vehicle:raise HTTPException(404,'Vehículo ajeno o inexistente')
        user=await db.users.find_one({'user_id':driver_id},session=session) or {}
        await ensure_vehicle_capacity(user,vehicle)
        await db.vehicles.update_many({'driver_id':driver_id},{'$set':{'is_active':False}},session=session)
        await db.vehicles.update_one({'vehicle_id':vehicle_id,'driver_id':driver_id},{'$set':{'is_active':True}},session=session)
        await db.drivers.update_one({'driver_id':driver_id},{'$set':{'active_vehicle_id':vehicle_id,
            'vehicle_make':vehicle.get('make',''),'vehicle_model':vehicle.get('model',''),'vehicle_year':vehicle.get('year'),
            'vehicle_color':vehicle.get('color',''),'plate_number':vehicle.get('plate_number',''),
            'service_types':[vehicle.get('vehicle_type','economy')]}},session=session)
        await db.audit_log.insert_one({'action':'working_vehicle_changed','admin_id':actor_id,'target_user_id':driver_id,
            'vehicle_id':vehicle_id,'created_at':datetime.now(timezone.utc)},session=session)
    async with await db.client.start_session() as session:await session.with_transaction(select)
    from fleet_live import emit_fleet_changed
    await emit_fleet_changed(driver_id)
    return {'status':'selected','vehicle_id':vehicle_id}

def document_check(documents, vehicle_id=None, single_vehicle=False, professional=False):
    required={'id_front','id_back'} if professional else COMMON_DOCS | VEHICLE_DOCS
    eligible=[d for d in documents if d.get('doc_type') not in VEHICLE_DOCS or d.get('vehicle_id')==vehicle_id or (single_vehicle and not d.get('vehicle_id'))]
    latest={}
    for doc in eligible:
        key=doc.get('doc_type')
        if key not in latest or str(doc.get('uploaded_at','')) > str(latest[key].get('uploaded_at','')):latest[key]=doc
    missing=sorted(required-set(latest))
    return required,latest,missing
