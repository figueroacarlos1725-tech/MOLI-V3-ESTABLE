import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from fastapi import HTTPException
from routes import admin,marketplace

def test_settings_masks_all_private_service_credentials(monkeypatch):
    keys=['mercadopago_access_token','astropay_api_key','astropay_secret_key','firebase_server_key','expo_push_token','google_maps_key','mapbox_key']
    settings={key:'private-test-value' for key in keys}
    monkeypatch.setattr(admin,'get_settings',AsyncMock(return_value=settings))
    result=asyncio.run(admin.get_admin_settings({'user_type':'admin'}))
    assert all(result[key].startswith('****') for key in keys)
    assert all('private-test' not in value for value in result.values())
    assert settings[keys[0]]=='private-test-value'

@pytest.mark.parametrize('role',['rider','driver','dispatcher'])
def test_commerce_review_list_requires_admin(role):
    with pytest.raises(HTTPException) as err:asyncio.run(marketplace.admin_merchants({'user_type':role}))
    assert err.value.status_code==403

def setup_order(monkeypatch,fulfilment='pickup',status='ready'):
    orders=SimpleNamespace(find_one=AsyncMock(return_value={'order_id':'o','merchant_id':'m','customer_id':'client','status':status,'fulfilment':fulfilment}),find_one_and_update=AsyncMock(return_value={'order_id':'o','status':'completed'}))
    merchants=SimpleNamespace(find_one=AsyncMock(return_value={'owner_id':'merchant'}))
    monkeypatch.setattr(marketplace,'db',SimpleNamespace(marketplace_orders=orders,marketplace_merchants=merchants))
    async def atomic(operation):return await operation(object())
    monkeypatch.setattr(marketplace,'atomic_inventory_operation',atomic)
    return orders

def test_merchant_can_confirm_own_ready_pickup(monkeypatch):
    orders=setup_order(monkeypatch)
    result=asyncio.run(marketplace.transition_order('o',marketplace.TransitionInput(status='completed'),{'user_id':'merchant','user_type':'rider'}))
    assert result['status']=='completed'
    orders.find_one_and_update.assert_awaited_once()

@pytest.mark.parametrize('fulfilment,status,code',[('delivery','ready',403),('pickup','pending_merchant',409)])
def test_merchant_cannot_skip_delivery_or_pickup_stages(monkeypatch,fulfilment,status,code):
    orders=setup_order(monkeypatch,fulfilment,status)
    with pytest.raises(HTTPException) as err:asyncio.run(marketplace.transition_order('o',marketplace.TransitionInput(status='completed'),{'user_id':'merchant','user_type':'rider'}))
    assert err.value.status_code==code
    orders.find_one_and_update.assert_not_awaited()
