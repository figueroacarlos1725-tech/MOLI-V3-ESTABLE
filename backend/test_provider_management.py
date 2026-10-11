import asyncio
from datetime import datetime,timedelta,timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from fastapi import HTTPException
from pydantic import ValidationError
import provider_management as management
from routes import provider_admin
from utils import effective_capability_user,has_active_capability
from models import BalanceUpdate

NOW=datetime(2026,10,11,tzinfo=timezone.utc)
def test_beta_and_launch_review_clock_preserve_rejections():
    user={'created_at':NOW-timedelta(days=20),'capability_approvals':{'ride_driver':{'status':'approved'},'professional':{'status':'provisional','submitted_at':NOW-timedelta(days=20)},'moto_driver':{'status':'rejected'}}}
    beta=asyncio.run(effective_capability_user(user,{'phase':'beta'}))
    assert has_active_capability(beta,'professional') and not has_active_capability(beta,'moto_driver')
    expired=asyncio.run(effective_capability_user(user,{'phase':'launched','launched_at':datetime.now(timezone.utc)-timedelta(hours=25)}))
    assert has_active_capability(expired,'ride_driver') and not has_active_capability(expired,'professional')
    assert user['capability_approvals']['professional']['status']=='provisional'

def test_insurance_of_car_never_covers_motorcycle():
    common=[{'document_id':k,'doc_type':k,'status':'approved'} for k in management.COMMON_DOCS]
    docs=common+[{'document_id':'insurance','doc_type':'insurance','vehicle_id':'car','status':'approved'},{'document_id':'reg','doc_type':'vehicle_registration','vehicle_id':'car','status':'approved'}]
    assert management.document_check(docs,'car',False)[2]==[]
    assert management.document_check(docs,'moto',False)[2]==['insurance','vehicle_registration']

def test_old_unscoped_vehicle_documents_only_apply_to_single_vehicle():
    docs=[{'doc_type':k,'status':'approved'} for k in management.COMMON_DOCS|management.VEHICLE_DOCS]
    assert management.document_check(docs,'car',True)[2]==[]
    assert management.document_check(docs,'car',False)[2]==['insurance','vehicle_registration']

def test_professional_review_only_needs_identity_document_set():
    required,_,missing=management.document_check([{'doc_type':'id_front'},{'doc_type':'id_back'}],professional=True)
    assert required=={'id_front','id_back'} and not missing

@pytest.mark.parametrize('role',['rider','driver','dispatcher'])
def test_provider_fiche_and_reviews_admin_only(role):
    with pytest.raises(HTTPException) as e:asyncio.run(provider_admin.get_provider('other',{'user_type':role}))
    assert e.value.status_code==403
    with pytest.raises(HTTPException) as e:asyncio.run(provider_admin.review_provider('other',provider_admin.Review(target='all',decision='approve'),{'user_type':role}))
    assert e.value.status_code==403

def test_rejection_requires_reason_before_any_database_write():
    with pytest.raises(HTTPException) as e:asyncio.run(provider_admin.review_provider('qa',provider_admin.Review(target='capability',target_id='professional',decision='reject'),{'user_type':'admin'}))
    assert e.value.status_code==400

@pytest.mark.parametrize('value',[float('inf'),float('nan')])
def test_nonfinite_wallet_adjustments_are_rejected(value):
    with pytest.raises(ValidationError):BalanceUpdate(amount=value)

def test_invalid_financial_operation_is_rejected():
    with pytest.raises(ValidationError):BalanceUpdate(amount=1,operation='unknown')

@pytest.mark.parametrize('vehicles,selected,requested,expected',[
    ([{'vehicle_id':'car','vehicle_type':'economy'},{'vehicle_id':'moto','vehicle_type':'moto'}],None,None,None),
    ([{'vehicle_id':'moto','vehicle_type':'moto'}],'moto','economy',None),
    ([{'vehicle_id':'moto','vehicle_type':'moto','approval_status':'rejected'}],'moto','moto',None),
    ([{'vehicle_id':'moto','vehicle_type':'moto'}],'moto','moto','moto')])
def test_ambiguous_wrong_type_and_rejected_vehicles_never_dispatch(vehicles,selected,requested,expected):
    db=SimpleNamespace(drivers=SimpleNamespace(find_one=AsyncMock(return_value={'active_vehicle_id':selected})),vehicles=SimpleNamespace(find=lambda *args:SimpleNamespace(to_list=AsyncMock(return_value=vehicles))))
    result=asyncio.run(management.working_vehicle('qa',requested,db))
    assert (result or {}).get('vehicle_id')==expected

def test_nonfinite_vehicle_edit_cannot_inject_balance_fields():
    with pytest.raises(ValidationError):provider_admin.VehicleEdit(make='QA',model='QA',year=2026,color='QA',plate_number='QA001',wallet_balance=5000)

@pytest.mark.parametrize('category,professional,paperwork,allowed',[
 ('electricista','approved','rejected',True),('tramites','approved','rejected',False),
 ('electricista','rejected','approved',False),('tramites','rejected','approved',True),
])
def test_rejected_capacity_does_not_disable_another_or_grant_the_rejected_service(monkeypatch,category,professional,paperwork,allowed):
    from routes import jobs
    user={'capability_approvals':{'professional':{'status':professional},'tramites':{'status':paperwork}}}
    monkeypatch.setattr(jobs,'effective_capability_user',AsyncMock(return_value=user))
    if allowed:asyncio.run(jobs._require_job_capability(user,{'category':category}))
    else:
        with pytest.raises(HTTPException) as e:asyncio.run(jobs._require_job_capability(user,{'category':category}))
        assert e.value.status_code==403
