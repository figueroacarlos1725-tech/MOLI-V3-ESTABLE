from datetime import datetime, timezone
from typing import Literal, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, ConfigDict
from database import db
from utils import get_current_user
from provider_management import document_check, mobility_verified, VEHICLE_DOCS, select_working_vehicle, vehicle_capability
router=APIRouter(prefix='/api/admin/providers',tags=['provider-management'])

def admin(user):
    if user.get('user_type')!='admin':raise HTTPException(403,'Solo administración')

def overall(approvals):
    states=[v.get('status') for v in approvals.values()]
    return 'approved' if states and all(s=='approved' for s in states) else 'rejected' if states and all(s=='rejected' for s in states) else 'pending' if any(s in ('pending','provisional') for s in states) else 'partial'

async def summary(user_id,session=None):
    person=await db.users.find_one({'user_id':user_id},{'_id':0,'user_id':1,'name':1,'email':1,'phone':1,'user_type':1,'capabilities':1,'capability_approvals':1,'approval_status':1,'wallet_balance':1,'promotional_credit_balance':1,'promotion_plan':1,'created_at':1},session=session)
    if not person:raise HTTPException(404,'Cuenta inexistente')
    vehicles=await db.vehicles.find({'driver_id':user_id},{'_id':0},session=session).to_list(100)
    documents=await db.driver_documents.find({'driver_id':user_id},{'_id':0},session=session).to_list(200)
    for vehicle in vehicles:
        required,latest,missing=document_check(documents,vehicle['vehicle_id'],len(vehicles)==1)
        vehicle['missing_documents']=missing
    _,_,identity_missing=document_check(documents,professional=True)
    merchant=await db.marketplace_merchants.find_one({'owner_id':user_id},{'_id':0},session=session)
    professional=await db.professional_profiles.find_one({'user_id':user_id},{'_id':0,'categories':1,'bio':1,'description':1,'experience_years':1,'is_available':1,'rating':1},session=session)
    if not person.get('capability_approvals'):
        legacy_caps=set(person.get('capabilities') or [])
        legacy_caps.update(vehicle_capability(v) for v in vehicles)
        if professional is not None:
            categories=professional.get('categories') or []
            if 'tramites' in categories:legacy_caps.add('tramites')
            if not categories or any(c!='tramites' for c in categories):legacy_caps.add('professional')
        if merchant is not None:legacy_caps.add('merchant')
        if legacy_caps:
            person['legacy_capabilities']=True
            person['capabilities']=sorted(legacy_caps)
            person['capability_approvals']={cap:{'status':'pending','submitted_at':datetime.now(timezone.utc)} for cap in legacy_caps}
    changes=await db.vehicle_changes.find({'driver_id':user_id,'status':'pending'},{'_id':0},session=session).to_list(100)
    profile=await db.drivers.find_one({'driver_id':user_id},{'_id':0,'active_vehicle_id':1,'is_online':1,'is_blocked':1},session=session)
    return {'person':person,'vehicles':vehicles,'documents':documents,'identity_missing':identity_missing,'merchant':merchant,'professional':professional,'driver':profile,'vehicle_changes':changes,'phase':(await db.promotion_campaigns.find_one({'_id':'launch'},session=session) or {}).get('phase','beta')}

@router.get('/{user_id}')
async def get_provider(user_id:str,user=Depends(get_current_user)):
    admin(user);return await summary(user_id)

class Review(BaseModel):
    model_config=ConfigDict(extra='forbid')
    target:Literal['all','capability','vehicle','merchant','document']
    target_id:Optional[str]=None
    decision:Literal['approve','reject']
    reason:str=Field(default='',max_length=1000)

@router.post('/{user_id}/review')
async def review_provider(user_id:str,data:Review,user=Depends(get_current_user)):
    admin(user)
    if data.decision=='reject' and not data.reason.strip():raise HTTPException(400,'Indicá el motivo del rechazo')
    async def review(session):
        info=await summary(user_id,session)
        now=datetime.now(timezone.utc);status='approved' if data.decision=='approve' else 'rejected'
        approvals=info['person'].get('capability_approvals') or {cap:{'status':'pending'} for cap in info['person'].get('capabilities',[])}
        caps=list(approvals) if data.target=='all' else [data.target_id] if data.target=='capability' else ['merchant'] if data.target=='merchant' and 'merchant' in approvals else []
        selected_vehicles=info['vehicles'] if data.target=='all' else [v for v in info['vehicles'] if v['vehicle_id']==data.target_id] if data.target=='vehicle' else []
        merchant=info['merchant'] if data.target in ('all','merchant') else None
        if data.target=='all' and not caps and not selected_vehicles and not merchant:raise HTTPException(409,'Esta cuenta todavía no registró capacidades, vehículos ni comercio para revisar')
        if status=='approved' and 'merchant' in caps and not info['merchant']:raise HTTPException(409,'Falta registrar el comercio')
        if status=='approved' and any(c in ('professional','tramites') for c in caps) and (not info['professional'] or not info['professional'].get('categories')):raise HTTPException(409,'Falta completar el perfil profesional y sus categorías')
        if data.target=='capability' and data.target_id not in approvals:raise HTTPException(400,'Capacidad ajena o inexistente')
        if data.target=='vehicle' and not selected_vehicles:raise HTTPException(404,'Vehículo ajeno o inexistente')
        if data.target=='merchant' and not merchant:raise HTTPException(404,'Comercio inexistente')
        if data.target=='document':
            docs=[d for d in info['documents'] if d['document_id']==data.target_id]
            if not docs:raise HTTPException(404,'Documento ajeno o inexistente')
        else:
            docs=[]
            needed=set()
            for vehicle in selected_vehicles:
                required,latest,missing=document_check(info['documents'],vehicle['vehicle_id'],len(info['vehicles'])==1)
                if status=='approved' and missing:raise HTTPException(409,{'message':'Faltan documentos del vehículo','vehicle_id':vehicle['vehicle_id'],'missing':missing})
                needed.update(d['document_id'] for d in latest.values() if d.get('doc_type') in required)
            if any(c in ('professional','tramites') for c in caps):
                required,latest,missing=document_check(info['documents'],professional=True)
                if status=='approved' and missing:raise HTTPException(409,{'message':'Falta documentación de identidad','missing':missing})
                needed.update(d['document_id'] for d in latest.values() if d.get('doc_type') in required)
            if any(c in ('ride_driver','moto_driver','taxi_driver','parcel','delivery') for c in caps):
                applicable=[v for v in info['vehicles'] if v.get('vehicle_type') in ('moto','motorcycle')] if caps==['moto_driver'] else [v for v in info['vehicles'] if v.get('vehicle_type') not in ('moto','motorcycle')] if caps in (['ride_driver'],['taxi_driver']) else info['vehicles']
                if status=='approved' and not applicable:raise HTTPException(409,'Registrá un vehículo para aprobar movilidad')
                for v in applicable:
                    required,latest,missing=document_check(info['documents'],v['vehicle_id'],len(info['vehicles'])==1)
                    if status=='approved' and missing:raise HTTPException(409,{'message':'Faltan documentos de movilidad','vehicle_id':v['vehicle_id'],'missing':missing})
                    needed.update(d['document_id'] for d in latest.values() if d.get('doc_type') in required)
            docs=[d for d in info['documents'] if d['document_id'] in needed]
        # Approve-all never silently reverses an earlier explicit rejection.
        if data.target=='all' and status=='approved':
            if any(a.get('status')=='rejected' for a in approvals.values()) or any(v.get('approval_status')=='rejected' for v in selected_vehicles) or any(d.get('status')=='rejected' for d in docs) or (merchant and merchant.get('approval_status')=='rejected'):
                raise HTTPException(409,'Hay un rechazo previo: revisalo individualmente antes de aprobar todo')
        if merchant and status=='approved' and (not merchant.get('name') or not merchant.get('address')):raise HTTPException(409,'Faltan nombre o domicilio del comercio')
        # Rejecting a capability does not revoke shared identity documents of other services.
        if status=='approved' or data.target=='document':
            for doc in docs:
                await db.driver_documents.update_one({'document_id':doc['document_id'],'driver_id':user_id},{'$set':{'status':status,'reject_reason':data.reason.strip() if status=='rejected' else '', 'reviewed_by':user['user_id'],'reviewed_at':now}},session=session)
        if data.target=='document' and status=='rejected':
            for doc in docs:
                if doc.get('doc_type') in VEHICLE_DOCS:
                    query={'driver_id':user_id}
                    if doc.get('vehicle_id'):query['vehicle_id']=doc['vehicle_id']
                    elif len(info['vehicles'])!=1:continue
                    await db.vehicles.update_many(query,{'$set':{'approval_status':'pending','documents_verified':False}},session=session)
        if info['person'].get('legacy_capabilities'):
            await db.users.update_one({'user_id':user_id},{'$set':{'capabilities':info['person']['capabilities'],'capability_approvals':approvals}},session=session)
        for cap in caps:
            await db.users.update_one({'user_id':user_id},{'$set':{f'capability_approvals.{cap}':{**approvals.get(cap,{}),'status':status,'reason':data.reason.strip(),'reviewed_at':now,'reviewed_by':user['user_id']}}},session=session)
            approvals[cap]={**approvals.get(cap,{}),'status':status}
        if caps:
            await db.users.update_one({'user_id':user_id},{'$set':{'approval_status':overall(approvals),'is_verified':any(a.get('status')=='approved' for a in approvals.values())}},session=session)
            await db.drivers.update_one({'driver_id':user_id},{'$set':{'documents_verified':mobility_verified(approvals),'is_verified':mobility_verified(approvals)}},session=session)
        for vehicle in selected_vehicles:
            await db.vehicles.update_one({'vehicle_id':vehicle['vehicle_id'],'driver_id':user_id},{'$set':{'approval_status':status,'documents_verified':status=='approved','approval_reason':data.reason.strip(),'reviewed_by':user['user_id'],'reviewed_at':now}},session=session)
        if not approvals and selected_vehicles:
            selected_ids={v['vehicle_id'] for v in selected_vehicles}
            legacy_verified=any((status if v['vehicle_id'] in selected_ids else v.get('approval_status'))=='approved' for v in info['vehicles'])
            await db.users.update_one({'user_id':user_id},{'$set':{'is_verified':legacy_verified}},session=session)
            await db.drivers.update_one({'driver_id':user_id},{'$set':{'documents_verified':legacy_verified,'is_verified':legacy_verified}},session=session)
        if merchant:
            await db.marketplace_merchants.update_one({'merchant_id':merchant['merchant_id'],'owner_id':user_id},{'$set':{'approval_status':status,'approval_reason':data.reason.strip(),'reviewed_by':user['user_id'],'reviewed_at':now}},session=session)
        await db.audit_log.insert_one({'action':'provider_review','target_user_id':user_id,'admin_id':user['user_id'],'target':data.target,'target_id':data.target_id,'decision':data.decision,'reason':data.reason.strip(),'created_at':now},session=session)
        return {'status':status}
    async with await db.client.start_session() as session:result=await session.with_transaction(review)
    return result

class VehicleEdit(BaseModel):
    model_config=ConfigDict(extra='forbid')
    make:str=Field(min_length=1,max_length=80)
    model:str=Field(min_length=1,max_length=80)
    year:int=Field(ge=1900,le=2100)
    color:str=Field(min_length=1,max_length=60)
    plate_number:str=Field(min_length=3,max_length=20)

@router.put('/{user_id}/vehicles/{vehicle_id}')
async def edit_vehicle(user_id:str,vehicle_id:str,data:VehicleEdit,user=Depends(get_current_user)):
    admin(user)
    async def edit(session):
        profile=await db.drivers.find_one({'driver_id':user_id},session=session) or {}
        if profile.get('is_online') or await db.rides.find_one({'driver_id':user_id,'status':{'$in':['accepted','arrived','started']}},session=session):raise HTTPException(409,'El conductor debe estar desconectado y sin viaje activo')
        vehicle=await db.vehicles.find_one({'driver_id':user_id,'vehicle_id':vehicle_id},session=session)
        if not vehicle:raise HTTPException(404,'Vehículo ajeno o inexistente')
        fields=data.model_dump();fields['plate_number']=fields['plate_number'].strip().upper()
        if fields['plate_number'] != vehicle.get('plate_number'):
            fields.update(approval_status='pending',documents_verified=False,review_submitted_at=datetime.now(timezone.utc))
            await db.driver_documents.update_many({'driver_id':user_id,'vehicle_id':vehicle_id,'doc_type':{'$in':list(VEHICLE_DOCS)}},{'$set':{'status':'pending'}},session=session)
        await db.vehicles.update_one({'driver_id':user_id,'vehicle_id':vehicle_id},{'$set':fields},session=session)
        if profile.get('active_vehicle_id')==vehicle_id or vehicle.get('is_active'):
            await db.drivers.update_one({'driver_id':user_id},{'$set':{'vehicle_make':data.make,'vehicle_model':data.model,'vehicle_year':data.year,'vehicle_color':data.color,'plate_number':fields['plate_number']}},session=session)
        await db.audit_log.insert_one({'action':'admin_vehicle_edit','target_user_id':user_id,'admin_id':user['user_id'],'vehicle_id':vehicle_id,'changes':fields,'created_at':datetime.now(timezone.utc)},session=session)
    async with await db.client.start_session() as session:await session.with_transaction(edit)
    return {'status':'updated'}

@router.put('/{user_id}/vehicles/{vehicle_id}/select')
async def select_vehicle(user_id:str,vehicle_id:str,user=Depends(get_current_user)):
    admin(user);return await select_working_vehicle(user_id,vehicle_id,user['user_id'])

class ProfessionalEdit(BaseModel):
    model_config=ConfigDict(extra='forbid')
    categories:list[str]=Field(max_length=20)
    description:str=Field(max_length=2000)

@router.put('/{user_id}/professional')
async def edit_professional(user_id:str,data:ProfessionalEdit,user=Depends(get_current_user)):
    admin(user)
    result=await db.professional_profiles.update_one({'user_id':user_id},{'$set':data.model_dump()})
    if result.matched_count!=1:raise HTTPException(404,'Perfil profesional inexistente')
    await db.audit_log.insert_one({'action':'admin_professional_edit','target_user_id':user_id,'admin_id':user['user_id'],'changes':data.model_dump(),'created_at':datetime.now(timezone.utc)})
    return {'status':'updated'}

class MerchantEdit(BaseModel):
    model_config=ConfigDict(extra='forbid')
    name:str=Field(min_length=2,max_length=120)
    address:str=Field(min_length=2,max_length=300)
    description:str=Field(max_length=2000)

@router.put('/{user_id}/merchant')
async def edit_merchant(user_id:str,data:MerchantEdit,user=Depends(get_current_user)):
    admin(user)
    result=await db.marketplace_merchants.update_one({'owner_id':user_id},{'$set':data.model_dump()})
    if result.matched_count!=1:raise HTTPException(404,'Comercio inexistente')
    await db.audit_log.insert_one({'action':'admin_merchant_edit','target_user_id':user_id,'admin_id':user['user_id'],'changes':data.model_dump(),'created_at':datetime.now(timezone.utc)})
    return {'status':'updated'}
@router.get('/pending/list')
async def list_pending_providers(user=Depends(get_current_user)):
    admin(user)
    vehicles=await db.vehicles.find({'approval_status':'pending'},{'_id':0,'driver_id':1}).to_list(1000)
    documents=await db.driver_documents.find({'status':'pending'},{'_id':0,'driver_id':1}).to_list(1000)
    ids=list({v['driver_id'] for v in vehicles+documents})
    providers=await db.users.find({'user_id':{'$in':ids}},{'_id':0,'user_id':1,'name':1,'email':1}).to_list(1000)
    return {'providers':providers}
