import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from marketplace_core import driver_delivery_view, require_delivery_transition
from routes import wallet


def test_delivery_view_redacts_destination_until_driver_accepts():
    order = {
        "delivery_address": "Calle privada 123",
        "delivery_latitude": -34.6,
        "delivery_longitude": -58.4,
        "delivery_zone": "Palermo",
        "payment_method": "cash",
        "pricing": {"delivery_fee_cents": 250000, "currency": "ARS"},
    }
    merchant = {"name": "Tienda QA", "address": "Local 10"}
    offer = {"delivery_id": "del_1", "order_id": "ord_1", "status": "offering"}
    redacted = driver_delivery_view(offer, order, merchant, "driver_1")
    assert redacted["destination"] == {"zone": "Palermo"}
    assert "payment_method" not in redacted

    assigned = {**offer, "status": "assigned", "assigned_driver_id": "driver_1"}
    visible = driver_delivery_view(assigned, order, merchant, "driver_1")
    assert visible["destination"]["address"] == "Calle privada 123"
    assert visible["payment_method"] == "cash"


def test_delivery_transition_is_strict():
    require_delivery_transition("assigned", "picked_up")
    require_delivery_transition("picked_up", "delivering")
    require_delivery_transition("delivering", "completed")
    with pytest.raises(ValueError):
        require_delivery_transition("assigned", "completed")


class _Cursor:
    def __init__(self, docs): self.docs = docs
    async def to_list(self, _limit): return list(self.docs)


class _Withdrawals:
    def __init__(self): self.docs = []
    async def find_one(self, query, _projection=None):
        return next((dict(x) for x in self.docs if all(x.get(k) == v for k, v in query.items())), None)
    def find(self, query, _projection=None):
        return _Cursor([x for x in self.docs if all(x.get(k) == v for k, v in query.items())])
    async def insert_one(self, doc): self.docs.append(dict(doc))


def test_withdrawal_is_idempotent_and_respects_available_balance(monkeypatch):
    collection = _Withdrawals()
    monkeypatch.setattr(wallet, "db", SimpleNamespace(wallet_withdrawals=collection))
    user = {"user_id": "driver_1", "user_type": "driver", "wallet_balance": 1000.0}
    payload = wallet.WithdrawalInput(amount=600, transfer_alias="moli.qa")
    first = asyncio.run(wallet.request_withdrawal(payload, "withdraw-key-1", user))
    again = asyncio.run(wallet.request_withdrawal(payload, "withdraw-key-1", user))
    assert first["withdrawal_id"] == again["withdrawal_id"]
    assert len(collection.docs) == 1

    with pytest.raises(HTTPException) as exc:
        asyncio.run(wallet.request_withdrawal(
            wallet.WithdrawalInput(amount=500, transfer_alias="moli.qa"),
            "withdraw-key-2", user))
    assert exc.value.status_code == 409
