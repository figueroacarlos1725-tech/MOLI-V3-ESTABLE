import asyncio, json
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from fastapi import HTTPException
import opportunity_notifications as notices
from routes import jobs, marketplace

@pytest.mark.parametrize('reviewing',[True,False])
def test_job_withdrawal_only_other_original_recipients(monkeypatch,reviewing):
    db=SimpleNamespace(job_opportunity_audiences=SimpleNamespace(find_one=AsyncMock(return_value={
        'recipient_ids':['winner','client','other','other',None]})))
    monkeypatch.setattr(notices,'db',db)
    send=AsyncMock();monkeypatch.setattr(notices.manager,'send_personal_message',send)
    asyncio.run(notices.notify_job_unavailable({'job_id':'job_qa','client_id':'client'},'winner',
        reviewing=reviewing,until=datetime(2026,10,11,tzinfo=timezone.utc)))
    send.assert_awaited_once()
    payload,recipient=send.call_args.args
    assert recipient=='other'
    assert payload['type']==('job_under_review' if reviewing else 'job_opportunity_taken')
    json.dumps(payload)
    assert 'client_id' not in payload and 'professional_id' not in payload


def test_delivery_withdrawal_only_offered_other_drivers(monkeypatch):
    send=AsyncMock();monkeypatch.setattr(notices.manager,'send_personal_message',send)
    asyncio.run(notices.notify_delivery_taken({'delivery_id':'del_qa','offers':[
        {'driver_id':'winner'},{'driver_id':'other'},{'driver_id':'other'},{}]},'winner'))
    send.assert_awaited_once()
    assert send.call_args.args==({'type':'delivery_opportunity_taken','delivery_id':'del_qa',
        'status':'assigned','message':'Otro repartidor aceptó esta entrega.'},'other')


def test_recipient_failure_does_not_hide_notice_from_others(monkeypatch):
    async def send(payload,recipient):
        if recipient=='offline':raise RuntimeError('offline')
    mock=AsyncMock(side_effect=send);monkeypatch.setattr(notices.manager,'send_personal_message',mock)
    asyncio.run(notices.notify_delivery_taken({'delivery_id':'del_qa','offers':[
        {'driver_id':'offline'},{'driver_id':'other'}]},'winner'))
    assert mock.await_count==2

@pytest.mark.parametrize('wins',[True,False])
def test_delivery_claim_winner_alone_sends_withdrawal(monkeypatch,wins):
    delivery={'delivery_id':'del_qa','order_id':'order_qa','offers':[{'driver_id':'winner'},{'driver_id':'other'}]}
    db=SimpleNamespace(marketplace_deliveries=SimpleNamespace(find_one=AsyncMock(return_value=delivery),
        find_one_and_update=AsyncMock(return_value=delivery if wins else None)),
        marketplace_orders=SimpleNamespace(find_one_and_update=AsyncMock(return_value={'order_id':'order_qa'})))
    monkeypatch.setattr(marketplace,'db',db)
    import provider_management
    monkeypatch.setattr(provider_management,'working_vehicle',AsyncMock(return_value={'vehicle_type':'moto'}))
    delivery['offers'][0]['vehicle_type']='moto'
    notification=AsyncMock();monkeypatch.setattr(marketplace,'notify_delivery_taken',notification)
    if wins:
        asyncio.run(marketplace.accept_delivery('del_qa',{'user_type':'driver','user_id':'winner'}))
        notification.assert_awaited_once_with(delivery,'winner')
    else:
        with pytest.raises(HTTPException) as error:
            asyncio.run(marketplace.accept_delivery('del_qa',{'user_type':'driver','user_id':'winner'}))
        assert error.value.status_code==409
        notification.assert_not_awaited()

@pytest.mark.parametrize('wins',[True,False])
def test_review_claim_winner_alone_sends_withdrawal(monkeypatch,wins):
    job={'job_id':'job_qa','client_id':'client'}
    monkeypatch.setattr(jobs,'db',SimpleNamespace(job_posts=SimpleNamespace(find_one=AsyncMock(return_value=job),
        find_one_and_update=AsyncMock(return_value=job if wins else None))))
    monkeypatch.setattr(jobs,'_require_professional',AsyncMock())
    monkeypatch.setattr(jobs,'_store_client_notification',AsyncMock())
    notification=AsyncMock();monkeypatch.setattr(jobs,'notify_job_unavailable',notification)
    monkeypatch.setattr(jobs.manager,'send_personal_message',AsyncMock())
    import notifications
    monkeypatch.setattr(notifications,'send_push_notification',AsyncMock())
    if wins:
        asyncio.run(jobs.start_job_review('job_qa',{'user_id':'winner'}))
        notification.assert_awaited_once()
        assert notification.call_args.kwargs['reviewing'] is True
    else:
        with pytest.raises(HTTPException) as error:
            asyncio.run(jobs.start_job_review('job_qa',{'user_id':'winner'}))
        assert error.value.status_code==409
        notification.assert_not_awaited()


@pytest.mark.parametrize('wins',[True,False])
def test_job_accept_claim_winner_alone_sends_withdrawal(monkeypatch,wins):
    job={'job_id':'job_qa','client_id':'client','budget':100}
    db=SimpleNamespace(job_posts=SimpleNamespace(find_one=AsyncMock(return_value=job),
        find_one_and_update=AsyncMock(return_value=job if wins else None)),
        professional_profiles=SimpleNamespace(find_one=AsyncMock(return_value={})))
    monkeypatch.setattr(jobs,'db',db)
    monkeypatch.setattr(jobs,'_require_professional',AsyncMock())
    monkeypatch.setattr(jobs,'_store_client_notification',AsyncMock())
    notification=AsyncMock();monkeypatch.setattr(jobs,'notify_job_unavailable',notification)
    monkeypatch.setattr(jobs.manager,'send_personal_message',AsyncMock())
    import notifications
    monkeypatch.setattr(notifications,'send_push_notification',AsyncMock())
    if wins:
        asyncio.run(jobs.accept_job_after_review('job_qa',{'user_id':'winner'}))
        notification.assert_awaited_once_with(job,'winner')
    else:
        with pytest.raises(HTTPException) as error:
            asyncio.run(jobs.accept_job_after_review('job_qa',{'user_id':'winner'}))
        assert error.value.status_code==409
        notification.assert_not_awaited()
