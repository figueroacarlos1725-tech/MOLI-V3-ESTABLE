import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from fastapi import HTTPException
from routes import jobs
import utils


def fixture(monkeypatch, claimed=True, agreed_price=16000):
    job={'job_id':'job_qa','client_id':'client','assigned_to':'pro',
         'status':'pending_completion','completed_by':'pro','budget':15000,
         'agreed_price':agreed_price}
    db=SimpleNamespace(
        job_posts=SimpleNamespace(find_one=AsyncMock(return_value=job),
            update_one=AsyncMock(return_value=SimpleNamespace(modified_count=int(claimed)))),
        professional_profiles=SimpleNamespace(update_one=AsyncMock()),
    )
    monkeypatch.setattr(jobs,'db',db)
    wallet=AsyncMock()
    monkeypatch.setattr(utils,'adjust_wallet_balance',wallet)
    monkeypatch.setattr(jobs.manager,'send_personal_message',AsyncMock())
    return db, wallet


@pytest.mark.parametrize('price,commission', [(16000,2400),(None,2250),(0,0)])
def test_completion_uses_agreed_price_after_claim(monkeypatch,price,commission):
    db,wallet=fixture(monkeypatch,agreed_price=price)
    result=asyncio.run(jobs.update_job_status('job_qa',{'status':'confirm_completed'},{'user_id':'client','user_type':'rider'}))
    assert result['job_status']=='completed'
    assert db.job_posts.update_one.call_args.args[1]['$set']['commission']==commission
    if commission:
        wallet.assert_awaited_once_with('pro',-commission)
    else:
        wallet.assert_not_awaited()
    db.professional_profiles.update_one.assert_awaited_once()


def test_losing_completion_claim_never_charges_or_counts(monkeypatch):
    db,wallet=fixture(monkeypatch,claimed=False)
    with pytest.raises(HTTPException) as error:
        asyncio.run(jobs.update_job_status('job_qa',{'status':'confirm_completed'},{'user_id':'client','user_type':'rider'}))
    assert error.value.status_code==409
    wallet.assert_not_awaited()
    db.professional_profiles.update_one.assert_not_awaited()
    jobs.manager.send_personal_message.assert_not_awaited()
