"""Pure marketplace rules shared by the API and focused tests.

Money is represented as integer cents.  This module deliberately has no database
dependency, making pricing and state transition rules deterministic.
"""
from decimal import Decimal, ROUND_HALF_UP
from typing import Iterable


ORDER_TRANSITIONS = {
    "pending_merchant": {"accepted", "rejected", "cancelled"},
    "accepted": {"preparing", "cancelled"},
    "preparing": {"ready", "cancelled"},
    "ready": {"picked_up", "completed", "cancelled"},
    "picked_up": {"delivering", "cancelled"},
    "delivering": {"completed", "cancelled"},
    "rejected": set(),
    "cancelled": set(),
    "completed": set(),
}


def cents(value) -> int:
    return int((Decimal(str(value)) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def money(cents_value: int) -> float:
    return float((Decimal(cents_value) / 100).quantize(Decimal("0.01")))


def require_transition(current: str, target: str, fulfilment: str) -> None:
    if target not in ORDER_TRANSITIONS.get(current, set()):
        raise ValueError(f"invalid order transition: {current} -> {target}")
    if current == "ready" and target == "completed" and fulfilment != "pickup":
        raise ValueError("delivery orders must be picked up before completion")
    if current == "ready" and target == "picked_up" and fulfilment != "delivery":
        raise ValueError("pickup orders complete directly from ready")


def price_snapshot(items: Iterable[dict], delivery_fee_cents: int = 0) -> dict:
    lines = []
    subtotal = 0
    for item in items:
        qty = int(item["quantity"])
        unit = int(item["unit_price_cents"])
        if qty <= 0 or unit < 0:
            raise ValueError("invalid quantity or price")
        total = qty * unit
        subtotal += total
        lines.append({
            "product_id": item["product_id"], "name": item["name"],
            "quantity": qty, "unit_price_cents": unit, "line_total_cents": total,
        })
    return {
        "currency": "ARS", "items": lines, "subtotal_cents": subtotal,
        "delivery_fee_cents": int(delivery_fee_cents),
        "total_cents": subtotal + int(delivery_fee_cents),
    }


def commission_amount(base_cents: int, rule: dict) -> int:
    mode = rule.get("mode", "percentage")
    if mode == "fixed":
        amount = int(rule.get("fixed_cents", 0))
    elif mode == "percentage":
        rate = Decimal(str(rule.get("rate_percent", 0))) / Decimal("100")
        amount = int((Decimal(base_cents) * rate).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    else:
        raise ValueError("unsupported commission mode")
    if rule.get("min_cents") is not None:
        amount = max(amount, int(rule["min_cents"]))
    if rule.get("max_cents") is not None:
        amount = min(amount, int(rule["max_cents"]))
    return min(max(amount, 0), max(base_cents, 0))


def settlement_snapshot(pricing: dict, rules: Iterable[dict]) -> dict:
    charges = []
    for rule in rules:
        party = rule["party"]
        base = pricing["delivery_fee_cents"] if party == "driver" else pricing["subtotal_cents"]
        fee = commission_amount(base, rule)
        charges.append({
            "rule_id": rule["rule_id"], "rule_version": rule.get("version", 1),
            "party": party, "base_cents": base, "commission_cents": fee,
            "net_cents": base - fee,
        })
    return {"currency": pricing["currency"], "charges": charges,
            "platform_commission_cents": sum(x["commission_cents"] for x in charges)}


def latest_rule_versions(rows: Iterable[dict]) -> dict:
    """Collapse rules sorted newest-first into the current admin projection."""
    latest = {}
    for row in rows:
        latest.setdefault(row["party"], row)
    return latest


def dispatch_vehicle_order(round_number: int) -> list[str]:
    return ["motorcycle"] if round_number <= 1 else ["motorcycle", "car", "taxi", "other"]


def public_merchant_query(current_time=None) -> dict:
    """Canonical visibility filter; pending/rejected shops must never leak."""
    if current_time is None:
        return {"approval_status": "approved"}
    return {"$or": [
        {"approval_status": "approved"},
        {"approval_status": "provisional", "provisional_until": {"$gt": current_time}},
    ]}


def merchant_orders_query(merchant_id: str, status: str | None = None) -> dict:
    query = {"merchant_id": merchant_id}
    if status:
        query["status"] = status
    return query


DELIVERY_TRANSITIONS = {
    "assigned": {"picked_up"},
    "picked_up": {"delivering"},
    "delivering": {"completed"},
    "completed": set(),
}


def require_delivery_transition(current: str, target: str) -> None:
    if target not in DELIVERY_TRANSITIONS.get(current, set()):
        raise ValueError(f"invalid delivery transition: {current} -> {target}")


def driver_delivery_view(delivery: dict, order: dict, merchant: dict,
                         driver_id: str) -> dict:
    """Return a delivery card without exposing a customer's address pre-acceptance."""
    assigned = delivery.get("assigned_driver_id") == driver_id
    view = {
        "delivery_id": delivery["delivery_id"],
        "order_id": delivery["order_id"],
        "status": delivery.get("status", "offering"),
        "round": delivery.get("round", 1),
        "merchant": {
            "name": merchant.get("name", "Comercio"),
            "address": merchant.get("address", ""),
            "latitude": merchant.get("latitude"),
            "longitude": merchant.get("longitude"),
        },
        "pricing": {
            "delivery_fee_cents": order.get("pricing", {}).get("delivery_fee_cents", 0),
            "currency": order.get("pricing", {}).get("currency", "ARS"),
        },
        "assigned_to_me": assigned,
    }
    if assigned:
        view["destination"] = {
            "address": order.get("delivery_address", ""),
            "latitude": order.get("delivery_latitude"),
            "longitude": order.get("delivery_longitude"),
        }
        view["payment_method"] = order.get("payment_method")
    else:
        view["destination"] = {"zone": order.get("delivery_zone", "Zona de entrega")}
    return view
