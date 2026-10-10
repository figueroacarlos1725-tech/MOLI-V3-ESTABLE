import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from routes import rides


def fixture(monkeypatch, state='completed', claim=True):
    ride={'ride_id':'ride_qa','rider_id':'client','driver_id':'driver','status':state}
    db=SimpleNamespace(
        rides=SimpleNamespace(find_one=AsyncMock(return_value=ride),update_one=AsyncMock(return_value=SimpleNamespace(modified_count=int(claim)))),
        ratings=SimpleNamespace(insert_one=AsyncMock(),find=lambda *_: SimpleNamespace(to_list=AsyncMock(return_value=[{'rating':4}]))),
        users=SimpleNamespace(update_one=AsyncMock()),
    )
    monkeypatch.setattr(rides,'db',db)
    return db


@pytest.mark.parametrize('mode', ['json','query'])
def test_rating_route_accepts_both_real_frontend_contracts(monkeypatch,mode):
    db=fixture(monkeypatch)
    app=FastAPI(); app.include_router(rides.router)
    app.dependency_overrides[rides.get_current_user]=lambda:{'user_id':'client'}
    assert sum(r.path=='/api/rides/{ride_id}/rate' for r in app.routes)==1
    client=TestClient(app)
    response=client.post('/api/rides/ride_qa/rate',json={'rating':4,'rated_user_type':'rider'}) if mode=='json' else client.post('/api/rides/ride_qa/rate?rating=4&comment=QA')
    assert response.status_code==200
    assert db.ratings.insert_one.call_args.args[0]['rated_user_id']=='driver'
    assert db.rides.update_one.call_args.args[0]['driver_rating'] is None


@pytest.mark.parametrize('value',[True,0,6,float('nan'),None,'5'])
def test_rating_invalid_value_rejected(monkeypatch,value):
    db=fixture(monkeypatch)
    with pytest.raises(HTTPException) as error:
        asyncio.run(rides.rate_ride('ride_qa',{'rating':value},None,None,{'user_id':'client'}))
    assert error.value.status_code==400
    db.ratings.insert_one.assert_not_awaited()


@pytest.mark.parametrize('state,uid,claim,code', [('started','client',True,409),('completed','other',True,403),('completed','client',False,409)])
def test_rating_permissions_and_duplicate_claim(monkeypatch,state,uid,claim,code):
    db=fixture(monkeypatch,state,claim)
    with pytest.raises(HTTPException) as error:
        asyncio.run(rides.rate_ride('ride_qa',{'rating':5},None,None,{'user_id':uid}))
    assert error.value.status_code==code
    db.ratings.insert_one.assert_not_awaited()
