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
        vehicles=SimpleNamespace(find_one=AsyncMock(return_value={'vehicle_type':'economy'} if vehicle else None),find=lambda *args: SimpleNamespace(to_list=AsyncMock(return_value=[{'vehicle_type':'economy'}] if vehicle else []))),
        rides=SimpleNamespace(find_one=AsyncMock(return_value=None),insert_one=AsyncMock()),
        drivers=SimpleNamespace(find_one=AsyncMock(return_value={'driver_id':'driver'}),find_one_and_update=AsyncMock(return_value={'driver_id':'driver'} if available else None),update_one=AsyncMock()),
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


def test_manual_trip_existing_searching_can_be_assigned(monkeypatch):
    db=fixtures(monkeypatch)
    db.rides.find_one.return_value={'ride_id':'ride_qa','status':'searching'}
    db.rides.update_one=AsyncMock(return_value=SimpleNamespace(modified_count=1))
    result=asyncio.run(admin.dispatch_assign_driver('req_qa','driver','0725',{'user_type':'dispatcher'}))
    assert result['ride_id']=='ride_qa'
    db.rides.insert_one.assert_not_awaited()
    assert db.rides.update_one.call_args.args[0]['status']=={'$in':['requested','searching']}


@pytest.mark.parametrize('status',['completed','cancelled'])
def test_dispatch_cannot_cancel_closed_ride(monkeypatch,status):
    db=fixtures(monkeypatch)
    db.rides.find_one.return_value={'ride_id':'ride_qa','status':status}
    with pytest.raises(HTTPException) as error:
        asyncio.run(admin.dispatch_cancel_ride('req_qa','QA',{'user_type':'dispatcher'}))
    assert error.value.status_code==409
    db.ride_requests.find_one_and_update.assert_not_awaited()


def test_dispatch_cancel_releases_driver(monkeypatch):
    db=fixtures(monkeypatch,status='accepted')
    db.rides.find_one.return_value={'ride_id':'ride_qa','status':'accepted','driver_id':'driver'}
    db.rides.update_one=AsyncMock(return_value=SimpleNamespace(modified_count=1))
    result=asyncio.run(admin.dispatch_cancel_ride('req_qa','QA',{'user_type':'dispatcher'}))
    assert result['status']=='cancelled'
    assert db.drivers.update_one.call_args.args[1]['$set']['is_available'] is True
    assert admin.manager.send_personal_message.await_count==2


def test_dispatch_cancel_missing_request_is_404(monkeypatch):
    db=fixtures(monkeypatch)
    db.ride_requests.find_one.return_value=None
    with pytest.raises(HTTPException) as error:
        asyncio.run(admin.dispatch_cancel_ride('missing','QA',{'user_type':'dispatcher'}))
    assert error.value.status_code==404


@pytest.mark.parametrize('role',['rider','driver','professional'])
def test_dispatch_fleet_blocks_non_operator(monkeypatch,role):
    with pytest.raises(HTTPException) as error:
        asyncio.run(admin.get_dispatch_drivers({'user_type':role}))
    assert error.value.status_code==403


def test_dispatch_fleet_is_operational_not_account_data(monkeypatch):
    class Cursor:
        async def to_list(self,n):
            return [{'driver_id':'driver','is_online':True,'service_types':['economy'],
                     'current_location':{'latitude':1,'longitude':2},'is_available':True}]
    db=SimpleNamespace(drivers=SimpleNamespace(find=lambda *a:Cursor()),
        users=SimpleNamespace(find_one=AsyncMock(return_value={'name':'QA','rating':4,'phone':'private','balance':123})),
        rides=SimpleNamespace(find_one=AsyncMock(return_value=None)))
    monkeypatch.setattr(admin,'db',db)
    result=asyncio.run(admin.get_dispatch_drivers({'user_type':'dispatcher'}))
    driver=result['drivers'][0]
    assert driver['driver_id']=='driver' and driver['latitude']==1
    assert 'phone' not in driver and 'balance' not in driver and 'user_id' not in driver


def test_manual_trip_direct_assignment_cannot_bypass_supervisor(monkeypatch):
    from models import ManualTripCreate
    with pytest.raises(HTTPException) as error:
        asyncio.run(admin.admin_create_manual_trip(ManualTripCreate(rider_name='QA',pickup_address='QA',
            assigned_driver_id='driver'),{'user_type':'dispatcher','user_id':'qa'}))
    assert error.value.status_code==422


@pytest.mark.parametrize('coords',[{}, {'pickup_latitude':91,'pickup_longitude':0},
    {'pickup_latitude':0,'pickup_longitude':181}, {'pickup_latitude':float('nan'),'pickup_longitude':0}])
def test_manual_trip_rejects_missing_or_invalid_pickup(monkeypatch,coords):
    from models import ManualTripCreate
    with pytest.raises(HTTPException) as error:
        asyncio.run(admin.admin_create_manual_trip(ManualTripCreate(rider_name='QA',pickup_address='QA',
            trip_type='destination_only',**coords),{'user_type':'dispatcher','user_id':'qa'}))
    assert error.value.status_code==422


def test_dispatch_cancellation_cannot_race_settlement(monkeypatch):
    db=fixtures(monkeypatch,status='accepted')
    db.rides.find_one.return_value={'ride_id':'ride_qa','status':'started','driver_id':'driver'}
    db.rides.update_one=AsyncMock(return_value=SimpleNamespace(modified_count=0))
    db.ride_requests.update_one=AsyncMock()
    with pytest.raises(HTTPException) as error:
        asyncio.run(admin.dispatch_cancel_ride('req_qa','QA',{'user_type':'dispatcher'}))
    assert error.value.status_code==409
    db.drivers.update_one.assert_not_awaited()
    db.ride_requests.update_one.assert_awaited_once()
