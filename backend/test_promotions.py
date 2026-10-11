import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from fastapi import HTTPException
import promotions as p

NOW=datetime(2026,10,11,tzinfo=timezone.utc)
@pytest.mark.parametrize('created,launch,expected',[(NOW-timedelta(days=10),NOW,NOW),(NOW+timedelta(days=7),NOW,NOW+timedelta(days=7))])
def test_individual_clock(created,launch,expected):
    state=p.plan_status({'promotion_plan':'barter_30','created_at':created},{'phase':'launched','launched_at':launch},expected)
    assert state['active'] and state['starts_at']==expected and state['ends_at']==expected+timedelta(days=30)
    assert not p.plan_status({'promotion_plan':'barter_30','created_at':created},{'launched_at':launch},expected+timedelta(days=30))['active']

def test_beta_never_starts_clock():
    s=p.plan_status({'promotion_plan':'barter_30','created_at':NOW-timedelta(days=100)},{'phase':'beta'},NOW)
    assert not s['active'] and s['ends_at'] is None

@pytest.mark.parametrize('fare,covered,due,earned',[(3000,3000,0,450),(4000,4000,0,600),(5000,4000,1000,600)])
def test_only_covered_amount_earns_credit(fare,covered,due,earned):
    s=p.settlement_amounts(fare,0,True,True,0)
    assert (s['promotional_coverage'],s['customer_amount_due'],s['promotional_credit_earned'])==(covered,due,earned)
    assert s['commission']==0 and s['driver_earnings']==due

def test_normal_free_period_does_not_earn_credit():
    s=p.settlement_amounts(4000,0,True,False,600)
    assert s['commission']==0 and s['promotional_credit_earned']==0 and s['promotional_credit_used']==0

def test_after_period_credit_pays_commission_only():
    s=p.settlement_amounts(5000,0,False,False,600)
    assert s['commission_before_credit']==750 and s['commission']==150 and s['driver_earnings']==4850
    assert s['promotional_credit_used']==600 and s['promotional_credit_earned']==0

def test_credit_never_pays_penalty_commission():
    s=p.settlement_amounts(4500,500,False,False,10000)
    assert s['promotional_credit_used']==600 and s['commission']==75

@pytest.mark.parametrize('role',['driver','rider','dispatcher'])
def test_launch_denied_nonadmin(role):
    with pytest.raises(HTTPException) as e: asyncio.run(p.launch(p.Launch(launch=True),{'user_type':role}))
    assert e.value.status_code==403

def test_cannot_reset_launch():
    with pytest.raises(HTTPException) as e: asyncio.run(p.launch(p.Launch(launch=False),{'user_type':'admin'}))
    assert e.value.status_code==409

def test_enrollment_once(monkeypatch):
    monkeypatch.setattr(p,'campaign',AsyncMock(return_value={'phase':'beta'}))
    db=SimpleNamespace(users=SimpleNamespace(update_one=AsyncMock(return_value=SimpleNamespace(modified_count=0))))
    monkeypatch.setattr(p,'db',db)
    with pytest.raises(HTTPException) as e: asyncio.run(p.enroll(p.Enrollment(plan='barter_30'),{'user_id':'qa','user_type':'driver'}))
    assert e.value.status_code==409

def test_client_cannot_mark_promotion():
    with pytest.raises(HTTPException) as e: asyncio.run(p.mark_ride('ride_qa',{'user_type':'rider'}))
    assert e.value.status_code==403
