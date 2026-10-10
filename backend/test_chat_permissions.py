import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from routes import chat, marketplace, misc
from models import ChatMessageCreate


@pytest.mark.parametrize('text', ['', '   ', 'x' * 501, None, 123])
def test_message_input_rejects_empty_large_and_nontext(text):
    with pytest.raises(HTTPException) as error:
        chat.validate_message(text)
    assert error.value.status_code == 422


def test_message_input_trims_and_keeps_operational_details():
    assert chat.validate_message('  Llegaré a las 10  ') == 'Llegaré a las 10'
    assert chat.validate_message('x' * 500) == 'x' * 500


@pytest.mark.parametrize('path_user, authenticated', [('victim', 'attacker'), ('victim', None)])
def test_websocket_rejects_missing_token_or_other_identity(monkeypatch, path_user, authenticated):
    async def auth(header):
        if authenticated is None:
            raise HTTPException(401)
        return {'user_id': authenticated}
    monkeypatch.setattr(misc, 'get_current_user', auth)
    manager = SimpleNamespace(connect=AsyncMock())
    monkeypatch.setattr(misc, 'manager', manager)
    ws = SimpleNamespace(query_params={'token': 'test'} if authenticated else {}, close=AsyncMock())
    asyncio.run(misc.websocket_endpoint(ws, path_user))
    ws.close.assert_awaited_once_with(code=1008)
    manager.connect.assert_not_awaited()


@pytest.mark.parametrize('status', ['open', 'completed', 'cancelled'])
def test_job_chat_cannot_send_before_assignment_or_after_finish(monkeypatch, status):
    collection = SimpleNamespace(find_one=AsyncMock(return_value={'job_id':'j', 'client_id':'client', 'assigned_to':'provider', 'status':status}))
    messages = SimpleNamespace(insert_one=AsyncMock())
    monkeypatch.setattr(chat, 'db', SimpleNamespace(job_posts=collection, chat_messages=messages))
    with pytest.raises(HTTPException) as error:
        asyncio.run(chat.send_job_chat_message({'job_id':'j','message':'Hola'}, {'user_id':'client','user_type':'rider'}))
    assert error.value.status_code == 409
    messages.insert_one.assert_not_awaited()


def test_generic_chat_requires_an_active_shared_service(monkeypatch):
    none = SimpleNamespace(find_one=AsyncMock(return_value=None))
    messages = SimpleNamespace(insert_one=AsyncMock())
    monkeypatch.setattr(chat, 'db', SimpleNamespace(job_posts=none, rides=none, chat_messages=messages))
    with pytest.raises(HTTPException) as error:
        asyncio.run(chat.send_message(ChatMessageCreate(receiver_id='victim',message='Hola'), {'user_id':'attacker'}))
    assert error.value.status_code == 403
    messages.insert_one.assert_not_awaited()


def test_generic_chat_emits_canonical_service_event_with_filtered_content(monkeypatch):
    job=SimpleNamespace(find_one=AsyncMock(return_value={'job_id':'j'}))
    rides=SimpleNamespace(find_one=AsyncMock(return_value=None))
    messages=SimpleNamespace(insert_one=AsyncMock())
    manager=SimpleNamespace(send_personal_message=AsyncMock())
    monkeypatch.setattr(chat,'db',SimpleNamespace(job_posts=job,rides=rides,chat_messages=messages))
    monkeypatch.setattr(chat,'manager',manager)
    result=asyncio.run(chat.send_message(ChatMessageCreate(receiver_id='provider',message='Contactame qa@example.com'),{'user_id':'client','name':'Cliente QA'}))
    event,recipient=manager.send_personal_message.call_args.args
    assert recipient=='provider' and event['job_id']=='j'
    assert event['message_id']==result.message_id and event['sender_name']=='Cliente QA'
    assert isinstance(event['message'],str) and 'qa@example.com' not in event['message']
    assert result.job_id=='j' and result.is_filtered


def test_customer_cannot_accept_own_marketplace_order(monkeypatch):
    orders=SimpleNamespace(find_one=AsyncMock(return_value={'order_id':'o','customer_id':'client','merchant_id':'m','status':'pending_merchant','fulfilment':'pickup'}))
    merchants=SimpleNamespace(find_one=AsyncMock(return_value={'owner_id':'merchant'}))
    monkeypatch.setattr(marketplace,'db',SimpleNamespace(marketplace_orders=orders,marketplace_merchants=merchants))
    with pytest.raises(HTTPException) as error:
        asyncio.run(marketplace.transition_order('o',marketplace.TransitionInput(status='accepted'),{'user_id':'client','user_type':'rider'}))
    assert error.value.status_code==403


def test_inventory_rejects_standalone_without_unsafe_fallback(monkeypatch):
    from pymongo.errors import OperationFailure
    session=SimpleNamespace()
    class Session:
        async def __aenter__(self):return session
        async def __aexit__(self,*args):pass
    session.with_transaction=AsyncMock(side_effect=OperationFailure('unsupported transactions',code=20))
    monkeypatch.setattr(marketplace,'client',SimpleNamespace(start_session=AsyncMock(return_value=Session())))
    with pytest.raises(HTTPException) as error:
        asyncio.run(marketplace.atomic_inventory_operation(AsyncMock()))
    assert error.value.status_code==503


def test_checkout_concurrent_repeat_returns_order_after_cart_was_cleared(monkeypatch):
    prior={'order_id':'existing','customer_id':'client','idempotency_key':'same'}
    orders=SimpleNamespace(find_one=AsyncMock(side_effect=[None,prior]))
    carts=SimpleNamespace(find_one=AsyncMock(return_value=None))
    monkeypatch.setattr(marketplace,'db',SimpleNamespace(marketplace_orders=orders,marketplace_carts=carts))
    result=asyncio.run(marketplace.checkout(marketplace.CheckoutInput(fulfilment='pickup',payment_method='cash'),'same',{'user_id':'client'}))
    assert result['order_id']=='existing'


def test_old_socket_disconnect_does_not_remove_reconnected_user():
    from websocket_manager import ConnectionManager
    manager = ConnectionManager()
    old_socket, new_socket = object(), object()
    manager.active_connections['client'] = new_socket
    manager.disconnect('client', old_socket)
    assert manager.active_connections['client'] is new_socket
    manager.disconnect('client', new_socket)
    assert 'client' not in manager.active_connections
