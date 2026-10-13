import asyncio
from unittest.mock import AsyncMock, MagicMock
import httpx
import pytest
from fastapi import HTTPException
from routes import registration

def configure(monkeypatch):
    monkeypatch.setenv('EMAIL_PROVIDER', 'resend')
    monkeypatch.setenv('RESEND_API_KEY', 'fake-qa-key')
    monkeypatch.setenv('RESEND_FROM', 'Moli <onboarding@resend.dev>')
    monkeypatch.setenv('RESEND_TEST_RECIPIENT', 'owner@example.com')

def test_shared_sender_blocks_other_users_without_network(monkeypatch):
    configure(monkeypatch)
    factory = MagicMock()
    monkeypatch.setattr(registration.httpx, 'AsyncClient', factory)
    with pytest.raises(HTTPException) as error:
        asyncio.run(registration._send_email_otp('other@example.com', '123456'))
    assert error.value.status_code == 503
    factory.assert_not_called()

@pytest.mark.parametrize('failure', [False, True])
def test_resend_delivery_and_failure(monkeypatch, failure):
    configure(monkeypatch)
    response = httpx.Response(429 if failure else 200, json={'id': 'qa'} if not failure else {}, request=httpx.Request('POST', 'https://api.resend.com/emails'))
    client = AsyncMock()
    client.post.return_value = response
    context = AsyncMock()
    context.__aenter__.return_value = client
    monkeypatch.setattr(registration.httpx, 'AsyncClient', lambda **kwargs: context)
    if failure:
        with pytest.raises(HTTPException) as error:
            asyncio.run(registration._send_email_otp('owner@example.com', '123456'))
        assert error.value.status_code == 502
    else:
        asyncio.run(registration._send_email_otp('owner@example.com', '123456'))
        payload = client.post.call_args.kwargs['json']
        assert payload['to'] == ['owner@example.com']
        assert '123456' in payload['text']

def test_missing_key_rejected(monkeypatch):
    configure(monkeypatch)
    monkeypatch.delenv('RESEND_API_KEY')
    with pytest.raises(HTTPException) as error:
        asyncio.run(registration._send_email_otp('owner@example.com', '123456'))
    assert error.value.status_code == 503
