import asyncio,json
from types import SimpleNamespace
from datetime import datetime,timezone
from unittest.mock import AsyncMock
import pytest
from fastapi import HTTPException
import fleet_live as fleet

class Cursor:
    def __init__(self,rows):self.rows=rows
    def sort(self,*args):return self
    async def to_list(self,n):return self.rows[:n]

def collection(rows):
    return SimpleNamespace(find=lambda *a:Cursor(rows),find_one=AsyncMock(return_value=rows[0] if rows else None))

@pytest.mark.parametrize('role',['dispatcher','rider','driver'])
def test_full_snapshot_and_history_admin_only(role):
    with pytest.raises(HTTPException) as error:
        asyncio.run(fleet.get_live_fleet({'user_type':role}))
    assert error.value.status_code==403
    with pytest.raises(HTTPException) as error:
        asyncio.run(fleet.get_trajectory('qa','2026-10-11T00:00:00Z','2026-10-12T00:00:00Z',{'user_type':role}))
    assert error.value.status_code==403


def test_snapshot_combined_provider_deduplicated_private_fields_absent(monkeypatch):
    db=SimpleNamespace(drivers=collection([{'driver_id':'qa','is_online':True,'is_available':True,
        'current_location':{'latitude':0,'longitude':0,'updated_at':datetime.now(timezone.utc)}}]),
        professional_profiles=collection([{'user_id':'qa','is_available':True,'categories':['electricista']}]),
        users=collection([{'user_id':'qa','name':'QA','password':'private','phone':'private','wallet_balance':123}]),
        vehicles=collection([{'driver_id':'qa','vehicle_type':'moto'}]),rides=collection([]),
        job_posts=collection([{'assigned_to':'qa','job_id':'job_qa','category':'tramites','status':'in_progress'}]),
        marketplace_deliveries=collection([]))
    monkeypatch.setattr(fleet,'db',db)
    snapshot=asyncio.run(fleet.fleet_snapshot())
    assert len(snapshot['providers'])==1
    provider=snapshot['providers'][0]
    assert provider['is_driver'] and provider['is_professional']
    assert provider['activity']=='tramite' and provider['vehicle_type']=='moto'
    assert provider['latitude']==0 and provider['is_available'] is False
    assert 'password' not in provider and 'phone' not in provider and 'wallet_balance' not in provider
    json.dumps(snapshot)

@pytest.mark.parametrize('value',['2026-10-11','bad','2026-10-11T00:00:00','10000-01-01T00:00:00Z'])
def test_trajectory_rejects_naive_invalid_dates(value):
    with pytest.raises(HTTPException):fleet.parse_utc(value)


def test_offset_normalized_utc():
    assert fleet.parse_utc('2026-10-11T08:00:00-03:00').isoformat()=='2026-10-11T11:00:00+00:00'

@pytest.mark.parametrize('end',['2026-10-11T00:00:00Z','2026-10-10T00:00:00Z','2026-10-19T00:00:00Z'])
def test_trajectory_invalid_range(end):
    with pytest.raises(HTTPException) as error:
        asyncio.run(fleet.get_trajectory('qa','2026-10-11T00:00:00Z',end,{'user_type':'admin'}))
    assert error.value.status_code==422


def test_history_unknown_provider_404(monkeypatch):
    monkeypatch.setattr(fleet,'db',SimpleNamespace(drivers=collection([]),professional_profiles=collection([]),users=collection([])))
    with pytest.raises(HTTPException) as error:
        asyncio.run(fleet.get_trajectory('missing','2026-10-11T00:00:00Z','2026-10-12T00:00:00Z',{'user_type':'admin'}))
    assert error.value.status_code==404


def test_history_truncates_and_reports_scope(monkeypatch):
    rows=[{'latitude':1,'longitude':2,'occurred_at':datetime.now(timezone.utc)}]*10001
    queries=[]
    def find(query,projection):queries.append(query);return Cursor(rows)
    db=SimpleNamespace(drivers=collection([{'driver_id':'qa'}]),professional_profiles=collection([]),
        users=collection([{'user_id':'qa'}]),provider_location_history=SimpleNamespace(find=find))
    monkeypatch.setattr(fleet,'db',db)
    result=asyncio.run(fleet.get_trajectory('qa','2026-10-11T00:00:00Z','2026-10-12T00:00:00Z',{'user_type':'admin'}))
    assert result['count']==10000 and result['truncated'] and len(result['points'])==10000
    assert queries[0]['provider_id']=='qa' and '$gt' in queries[0]['expires_at']


def test_event_only_connected_admin_query(monkeypatch):
    queries=[]
    def find(query,projection):queries.append(query);return Cursor([{'user_id':'admin'}])
    monkeypatch.setattr(fleet,'db',SimpleNamespace(users=SimpleNamespace(find=find)))
    monkeypatch.setattr(fleet.manager,'active_connections',{'admin':object(),'client':object(),'dispatcher':object()})
    send=AsyncMock();monkeypatch.setattr(fleet.manager,'send_personal_message',send)
    asyncio.run(fleet.emit_fleet_changed('qa'))
    assert queries[0]['user_type']=='admin'
    send.assert_awaited_once();assert send.call_args.args[1]=='admin'


def test_location_history_persisted_without_connected_admin_server_clock(monkeypatch):
    monkeypatch.setattr(fleet,'_admin_ids',AsyncMock(return_value=[]))
    provider={'provider_id':'qa','provider_type':'professional','vehicle_type':None,'activity':'professional',
        'category':'electricista','capabilities':['jobs'],'latitude':0,'longitude':0,'updated_at':'old',
        'is_online':True,'is_available':True,'is_blocked':False}
    monkeypatch.setattr(fleet,'fleet_snapshot',AsyncMock(return_value={'providers':[provider]}))
    insert=AsyncMock();monkeypatch.setattr(fleet,'db',SimpleNamespace(provider_location_history=SimpleNamespace(insert_one=insert),professional_profiles=SimpleNamespace(update_one=AsyncMock()),drivers=SimpleNamespace(update_one=AsyncMock())))
    asyncio.run(fleet.emit_provider_location('qa',reported_location={'latitude':1,'longitude':2,
        'occurred_at':'1900-01-01'},source='professional_rest'))
    recorded=insert.call_args.args[0]
    assert recorded['latitude']==1 and recorded['occurred_at'].year>=2026
    assert (recorded['expires_at']-recorded['occurred_at']).days==30
    assert 'name' not in recorded

@pytest.mark.parametrize('location',[{'latitude':True,'longitude':1},{'latitude':float('nan'),'longitude':1},
    {'latitude':91,'longitude':0},{'latitude':0,'longitude':181}])
def test_invalid_coordinates(location):assert not fleet.valid_location(location)

def test_legacy_coordinate_does_not_invent_gps_time_from_profile_edit(monkeypatch):
    db=SimpleNamespace(drivers=collection([]),professional_profiles=collection([{'user_id':'qa','is_available':True,'categories':['electricista'],'location':{'latitude':1,'longitude':2},'updated_at':datetime.now(timezone.utc)}]),users=collection([{'user_id':'qa','name':'QA'}]),vehicles=collection([]),rides=collection([]),job_posts=collection([]),marketplace_deliveries=collection([]))
    monkeypatch.setattr(fleet,'db',db)
    result=asyncio.run(fleet.fleet_snapshot())['providers'][0]
    assert result['latitude']==1 and result['updated_at'] is None

def test_trajectory_vehicle_filter_is_scoped_to_its_provider(monkeypatch):
    found=AsyncMock(return_value={'vehicle_id':'vehicle_qa'})
    captured=[]
    def history(query,projection):captured.append(query);return Cursor([])
    db=SimpleNamespace(drivers=SimpleNamespace(find_one=AsyncMock(return_value={'driver_id':'qa'})),professional_profiles=SimpleNamespace(find_one=AsyncMock(return_value=None)),users=SimpleNamespace(find_one=AsyncMock(return_value={'user_id':'qa'})),vehicles=SimpleNamespace(find_one=found),provider_location_history=SimpleNamespace(find=history))
    monkeypatch.setattr(fleet,'db',db)
    result=asyncio.run(fleet.get_trajectory('qa','2026-10-11T00:00:00-03:00','2026-10-11T23:59:59-03:00',{'user_type':'admin'},'vehicle_qa'))
    assert captured[0]['provider_id']=='qa' and captured[0]['vehicle_id']=='vehicle_qa'
    assert found.call_args.args[0]=={'driver_id':'qa','vehicle_id':'vehicle_qa'}
    assert result['vehicle_id']=='vehicle_qa'

def test_trajectory_rejects_vehicle_owned_by_another_provider(monkeypatch):
    db=SimpleNamespace(drivers=SimpleNamespace(find_one=AsyncMock(return_value={'driver_id':'qa'})),professional_profiles=SimpleNamespace(find_one=AsyncMock(return_value=None)),users=SimpleNamespace(find_one=AsyncMock(return_value={'user_id':'qa'})),vehicles=SimpleNamespace(find_one=AsyncMock(return_value=None)))
    monkeypatch.setattr(fleet,'db',db)
    with pytest.raises(HTTPException) as error:asyncio.run(fleet.get_trajectory('qa','2026-10-11T00:00:00-03:00','2026-10-11T23:59:59-03:00',{'user_type':'admin'},'other'))
    assert error.value.status_code==404
