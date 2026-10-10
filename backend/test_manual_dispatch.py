import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from fastapi import HTTPException
from routes import admin

def fixtures(monkeypatch, status='searching', vehicle=True, available=True, claim=True):
    request={'request_id':'req_qa','status':status,'vehicle_type':'economy','rider_id':'client','pickup_location':{},'dropoff_location':{}}
    driver={'user_id':'driver','user_type':'driver','name':'QA'}
    db=SimpleNamespace(
        ride_requests=SimpleNamespace(find_one=AsyncMock(return_value=request),find_one_and_update=AsyncMock(return_value=request if claim else None)),
        users=SimpleNamespace(find_one=AsyncMock(return_value=driver)),
        vehicles=SimpleNamespace(find_one=AsyncMock(return_value={'vehicle_type':'economy'} if vehicle else None)),
        rides=SimpleNamespace(find_one=AsyncMock(return_value=None),insert_one=AsyncMock()),
        drivers=SimpleNamespace(find_one_and_update=AsyncMock(return_value={'driver_id':'driver'} if available else None),update_one=AsyncMock()),
    )
    monkeypatch.setattr(admin,'db',db)
    monkeypatch.setattr(admin.manager,'send_personal_message',AsyncMock())
    monkeypatch.setattr(admin,'send_push_notification',AsyncMock())
    return db

@pytest.mark.parametrize('option', ['closed','vehicle','unavailable','race'])
def test_manual_dispatch_rejects_invalid_claim(monkeypatch,option):
    db=fixtures(monkeypatch,status='completed' if option=='closed' else 'searching',vehicle=option!='vehicle',available=option!='unavailable',claim=option!='race')
    with pytest.raises(HTTPException) as error:
        asyncio.run(admin.dispatch_assign_driver('req_qa','driver','0725',{'user_type':'dispatcher'}))
    assert error.value.status_code==409
    db.rides.insert_one.assert_not_awaited()
    if option=='race':
        db.drivers.update_one.assert_awaited_once()
        assert db.drivers.update_one.call_args.args[0]['dispatch_claim_request_id']=='req_qa'

def test_manual_dispatch_claims_request_and_driver(monkeypatch):
    db=fixtures(monkeypatch)
    result=asyncio.run(admin.dispatch_assign_driver('req_qa','driver','0725',{'user_type':'dispatcher'}))
    assert result['status']=='assigned'
    assert db.drivers.find_one_and_update.call_args.args[0]['is_available'] is True
    assert db.ride_requests.find_one_and_update.call_args.args[0]['status']=={'$in':['pending','bidding','searching']}
    db.rides.insert_one.assert_awaited_once()
