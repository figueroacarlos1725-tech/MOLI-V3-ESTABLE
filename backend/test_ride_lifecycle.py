import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from fastapi import HTTPException
from routes import rides


def fixture(monkeypatch,state='accepted',claim=True):
    db=SimpleNamespace(rides=SimpleNamespace(
        find_one=AsyncMock(return_value={'ride_id':'ride_qa','rider_id':'client','driver_id':'driver','status':state}),
        update_one=AsyncMock(return_value=SimpleNamespace(modified_count=int(claim))),
    ))
    monkeypatch.setattr(rides,'db',db)
    effects=AsyncMock(return_value={'status':'updated'})
    monkeypatch.setattr(rides,'_apply_ride_status',effects)
    return db,effects


def run(status,user='driver'):
    return asyncio.run(rides.update_ride_status('ride_qa',status,None,None,None,None,False,{'user_id':user}))


@pytest.mark.parametrize('current,target,user,code', [
    ('accepted','completed','driver',409), ('accepted','started','driver',409),
    ('completed','completed','driver',409), ('cancelled','arrived','driver',409),
    ('accepted','arrived','client',403), ('arrived','started','client',403),
    ('started','completed','client',403), ('accepted','arrived','other',403),
])
def test_invalid_stage_or_actor_never_runs_effects(monkeypatch,current,target,user,code):
    db,effects=fixture(monkeypatch,current)
    with pytest.raises(HTTPException) as error: run(target,user)
    assert error.value.status_code==code
    effects.assert_not_awaited(); db.rides.update_one.assert_not_awaited()


def test_concurrent_state_claim_loser_never_settles(monkeypatch):
    db,effects=fixture(monkeypatch,'started',False)
    with pytest.raises(HTTPException) as error: run('completed')
    assert error.value.status_code==409
    effects.assert_not_awaited()


def test_successful_transition_releases_claim(monkeypatch):
    db,effects=fixture(monkeypatch,'started')
    assert run('completed')['status']=='updated'
    effects.assert_awaited_once()
    assert '$unset' in db.rides.update_one.call_args.args[1]


def test_failed_settlement_retains_claim_for_reconciliation(monkeypatch):
    db,effects=fixture(monkeypatch,'started')
    effects.side_effect=RuntimeError('QA injected failure')
    with pytest.raises(RuntimeError): run('completed')
    assert db.rides.update_one.call_args.args[1]=={'$set':{'status_update_error':True}}
