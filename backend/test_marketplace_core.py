import pytest

from marketplace_core import (
    commission_amount, dispatch_vehicle_order, price_snapshot, require_transition,
    settlement_snapshot,
)


def test_price_snapshot_uses_integer_cents():
    result = price_snapshot([
        {"product_id": "p1", "name": "Uno", "quantity": 3, "unit_price_cents": 1999},
        {"product_id": "p2", "name": "Dos", "quantity": 1, "unit_price_cents": 501},
    ], 100000)
    assert result["subtotal_cents"] == 6498
    assert result["total_cents"] == 106498


def test_marketplace_driver_and_merchant_commissions_are_separate_bases():
    pricing = {"currency": "ARS", "subtotal_cents": 100000, "delivery_fee_cents": 10000}
    rules = [
        {"rule_id": "driver", "party": "driver", "mode": "percentage", "rate_percent": 10},
        {"rule_id": "merchant", "party": "merchant", "mode": "percentage", "rate_percent": 15},
    ]
    result = settlement_snapshot(pricing, rules)
    assert result["charges"][0]["commission_cents"] == 1000
    assert result["charges"][1]["commission_cents"] == 15000
    assert result["platform_commission_cents"] == 16000


def test_driver_only_mode_does_not_charge_merchant():
    result = settlement_snapshot(
        {"currency": "ARS", "subtotal_cents": 100000, "delivery_fee_cents": 10000},
        [{"rule_id": "driver", "party": "driver", "mode": "fixed", "fixed_cents": 750}],
    )
    assert [x["party"] for x in result["charges"]] == ["driver"]
    assert result["platform_commission_cents"] == 750


def test_commission_limits_and_rounding():
    assert commission_amount(999, {"mode": "percentage", "rate_percent": 12.5}) == 125
    assert commission_amount(10000, {"mode": "percentage", "rate_percent": 1, "min_cents": 500}) == 500
    assert commission_amount(10000, {"mode": "fixed", "fixed_cents": 5000, "max_cents": 900}) == 900


def test_fsm_distinguishes_pickup_and_delivery():
    require_transition("ready", "completed", "pickup")
    require_transition("ready", "picked_up", "delivery")
    with pytest.raises(ValueError):
        require_transition("ready", "completed", "delivery")
    with pytest.raises(ValueError):
        require_transition("completed", "preparing", "pickup")


def test_dispatch_prioritizes_motorcycle_before_fallback():
    assert dispatch_vehicle_order(1) == ["motorcycle"]
    assert dispatch_vehicle_order(2) == ["motorcycle", "car", "taxi", "other"]
