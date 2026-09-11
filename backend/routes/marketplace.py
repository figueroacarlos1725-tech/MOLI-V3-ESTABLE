"""Isolated MVP router for merchants, catalog, cart, orders and settlement."""
from datetime import datetime, timezone, timedelta
from typing import Literal, Optional
import uuid

from fastapi import APIRouter, Body, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from database import db
from utils import get_current_user
from marketplace_core import (
    dispatch_vehicle_order, driver_delivery_view, merchant_orders_query, price_snapshot,
    public_merchant_query, require_delivery_transition, require_transition, settlement_snapshot,
    latest_rule_versions,
)

router = APIRouter(prefix="/api/marketplace", tags=["marketplace"])


def uid(prefix: str) -> str:
    return prefix + uuid.uuid4().hex


def now():
    return datetime.now(timezone.utc)


def public(doc):
    if doc:
        doc.pop("_id", None)
    return doc


def admin(user):
    if user.get("user_type") not in ("admin", "dispatcher"):
        raise HTTPException(403, "Admin access required")


class MerchantInput(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: str = ""
    address: str
    latitude: float
    longitude: float
    transfer_alias: Optional[str] = Field(None, min_length=3, max_length=80)


class ProductInput(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str = ""
    price_cents: int = Field(ge=0)
    stock: int = Field(ge=0)
    image_url: str = ""
    active: bool = True


class CartItemInput(BaseModel):
    product_id: str
    quantity: int = Field(ge=1, le=99)


class CheckoutInput(BaseModel):
    fulfilment: Literal["pickup", "delivery"]
    payment_method: Literal["cash", "transfer", "mercadopago"]
    delivery_address: Optional[str] = None
    delivery_latitude: Optional[float] = None
    delivery_longitude: Optional[float] = None
    transfer_alias: Optional[str] = None


class TransitionInput(BaseModel):
    status: str


class PaymentTransitionInput(BaseModel):
    status: Literal["instructions_pending", "pending_provider", "reported", "approved", "rejected", "refunded"]
    provider_reference: Optional[str] = None


class DeliveryTransitionInput(BaseModel):
    status: Literal["picked_up", "delivering", "completed"]


class CommissionRuleInput(BaseModel):
    party: Literal["driver", "merchant"]
    mode: Literal["percentage", "fixed"] = "percentage"
    rate_percent: float = Field(default=0, ge=0, le=100)
    fixed_cents: int = Field(default=0, ge=0)
    min_cents: Optional[int] = Field(None, ge=0)
    max_cents: Optional[int] = Field(None, ge=0)
    active: bool = True


@router.post("/merchants")
async def apply_merchant(data: MerchantInput, user=Depends(get_current_user)):
    existing = await db.marketplace_merchants.find_one({"owner_id": user["user_id"]})
    if existing:
        raise HTTPException(409, "Merchant application already exists")
    provisional_until = now() + timedelta(hours=24)
    doc = {"merchant_id": uid("mer_"), "owner_id": user["user_id"], **data.model_dump(),
           "approval_status": "provisional", "provisional_until": provisional_until,
           "capabilities": {"pickup": True, "delivery": False},
           "created_at": now(), "updated_at": now()}
    await db.marketplace_merchants.insert_one(doc)
    return public(doc)


@router.put("/admin/merchants/{merchant_id}/approval")
async def approve_merchant(merchant_id: str, approved: bool = Body(embed=True),
                           pickup: bool = Body(True), delivery: bool = Body(False),
                           delivery_fee_cents: int = Body(0, ge=0),
                           user=Depends(get_current_user)):
    admin(user)
    doc = await db.marketplace_merchants.find_one_and_update(
        {"merchant_id": merchant_id}, {"$set": {"approval_status": "approved" if approved else "rejected",
        "capabilities": {"pickup": pickup, "delivery": delivery},
        "delivery_fee_cents": delivery_fee_cents, "approved_by": user["user_id"],
        "updated_at": now()}}, return_document=ReturnDocument.AFTER, projection={"_id": 0})
    if not doc:
        raise HTTPException(404, "Merchant not found")
    return doc


async def owned_merchant(user):
    merchant = await db.marketplace_merchants.find_one({"owner_id": user["user_id"], "$or": [
        {"approval_status": "approved"},
        {"approval_status": "provisional", "provisional_until": {"$gt": now()}},
    ]}, {"_id": 0})
    if not merchant:
        raise HTTPException(403, "Approved merchant required")
    return merchant


@router.get("/merchants")
async def list_merchants(limit: int = Query(100, ge=1, le=200),
                         skip: int = Query(0, ge=0)):
    """Public storefront discovery; operational and payout data stay private."""
    projection = {
        "_id": 0, "merchant_id": 1, "name": 1, "description": 1,
        "address": 1, "latitude": 1, "longitude": 1, "image_url": 1,
        "approval_status": 1, "capabilities": 1, "delivery_fee_cents": 1,
    }
    merchants = await db.marketplace_merchants.find(
        public_merchant_query(now()), projection
    ).sort("name", 1).skip(skip).limit(limit).to_list(limit)
    return {"merchants": merchants, "limit": limit, "skip": skip}


@router.get("/merchant/orders")
async def list_owned_merchant_orders(
    status: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=200),
    skip: int = Query(0, ge=0),
    user=Depends(get_current_user),
):
    """Operational inbox scoped to the authenticated approved merchant."""
    merchant = await owned_merchant(user)
    allowed_statuses = {
        "pending_merchant", "accepted", "preparing", "ready", "picked_up",
        "delivering", "completed", "cancelled", "rejected",
    }
    if status and status not in allowed_statuses:
        raise HTTPException(422, "Invalid order status")
    query = merchant_orders_query(merchant["merchant_id"], status)
    orders = await db.marketplace_orders.find(query, {"_id": 0}).sort(
        "created_at", -1
    ).skip(skip).limit(limit).to_list(limit)
    return {
        "merchant_id": merchant["merchant_id"], "orders": orders,
        "limit": limit, "skip": skip,
    }


@router.post("/products")
async def create_product(data: ProductInput, user=Depends(get_current_user)):
    merchant = await owned_merchant(user)
    doc = {"product_id": uid("prd_"), "merchant_id": merchant["merchant_id"], **data.model_dump(),
           "created_at": now(), "updated_at": now()}
    await db.marketplace_products.insert_one(doc)
    return public(doc)


@router.put("/products/{product_id}")
async def update_product(product_id: str, data: ProductInput, user=Depends(get_current_user)):
    merchant = await owned_merchant(user)
    doc = await db.marketplace_products.find_one_and_update(
        {"product_id": product_id, "merchant_id": merchant["merchant_id"]},
        {"$set": {**data.model_dump(), "updated_at": now()}},
        return_document=ReturnDocument.AFTER, projection={"_id": 0})
    if not doc:
        raise HTTPException(404, "Product not found")
    return doc


@router.get("/merchants/{merchant_id}/products")
async def products(merchant_id: str):
    merchant = await db.marketplace_merchants.find_one({"merchant_id": merchant_id, "approval_status": "approved"}, {"_id": 0})
    if not merchant:
        raise HTTPException(404, "Merchant not found")
    rows = await db.marketplace_products.find({"merchant_id": merchant_id, "active": True}, {"_id": 0}).to_list(500)
    return {"merchant": merchant, "products": rows}


@router.put("/cart/items")
async def put_cart_item(data: CartItemInput, user=Depends(get_current_user)):
    product = await db.marketplace_products.find_one({"product_id": data.product_id, "active": True}, {"_id": 0})
    if not product or product.get("stock", 0) < data.quantity:
        raise HTTPException(409, "Product unavailable or insufficient stock")
    cart = await db.marketplace_carts.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if cart and cart.get("items") and cart["merchant_id"] != product["merchant_id"]:
        raise HTTPException(409, "A cart can contain products from one merchant only")
    items = [x for x in (cart or {}).get("items", []) if x["product_id"] != data.product_id]
    items.append({"product_id": data.product_id, "quantity": data.quantity})
    await db.marketplace_carts.update_one({"user_id": user["user_id"]}, {"$set": {
        "user_id": user["user_id"], "merchant_id": product["merchant_id"], "items": items, "updated_at": now()}}, upsert=True)
    return {"merchant_id": product["merchant_id"], "items": items}


@router.get("/cart")
async def get_cart(user=Depends(get_current_user)):
    return {"cart": await db.marketplace_carts.find_one({"user_id": user["user_id"]}, {"_id": 0})}


@router.post("/orders")
async def checkout(data: CheckoutInput, idempotency_key: str = Header(..., alias="Idempotency-Key"),
                   user=Depends(get_current_user)):
    prior = await db.marketplace_orders.find_one({"customer_id": user["user_id"], "idempotency_key": idempotency_key}, {"_id": 0})
    if prior:
        return prior
    cart = await db.marketplace_carts.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not cart or not cart.get("items"):
        raise HTTPException(409, "Cart is empty")
    merchant = await db.marketplace_merchants.find_one({"merchant_id": cart["merchant_id"], "approval_status": "approved"}, {"_id": 0})
    if not merchant or not merchant.get("capabilities", {}).get(data.fulfilment):
        raise HTTPException(409, "Fulfilment method unavailable")
    if data.fulfilment == "delivery" and not all((data.delivery_address, data.delivery_latitude is not None, data.delivery_longitude is not None)):
        raise HTTPException(422, "Delivery destination is required")
    ids = [x["product_id"] for x in cart["items"]]
    products = await db.marketplace_products.find({"product_id": {"$in": ids}, "merchant_id": cart["merchant_id"], "active": True}, {"_id": 0}).to_list(len(ids))
    by_id = {x["product_id"]: x for x in products}
    lines = []
    for item in cart["items"]:
        p = by_id.get(item["product_id"])
        if not p or p["stock"] < item["quantity"]:
            raise HTTPException(409, "Cart changed; review availability")
        lines.append({"product_id": p["product_id"], "name": p["name"], "quantity": item["quantity"], "unit_price_cents": p["price_cents"]})
    delivery_fee = int(merchant.get("delivery_fee_cents", 0)) if data.fulfilment == "delivery" else 0
    pricing = price_snapshot(lines, delivery_fee)
    payment_status = "instructions_pending" if data.payment_method in ("cash", "transfer") else "pending_provider"
    order = {"order_id": uid("ord_"), "customer_id": user["user_id"], "merchant_id": cart["merchant_id"],
             "idempotency_key": idempotency_key, **data.model_dump(), "pricing": pricing,
             "status": "pending_merchant", "payment_status": payment_status, "settlement_status": "pending",
             "created_at": now(), "updated_at": now()}
    try:
        await db.marketplace_orders.insert_one(order)
    except DuplicateKeyError:
        return await db.marketplace_orders.find_one({"customer_id": user["user_id"], "idempotency_key": idempotency_key}, {"_id": 0})
    await db.marketplace_carts.delete_one({"user_id": user["user_id"]})
    return public(order)


@router.get("/orders")
async def list_customer_orders(limit: int = Query(30, ge=1, le=100),
                               user=Depends(get_current_user)):
    orders = await db.marketplace_orders.find(
        {"customer_id": user["user_id"]}, {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    return {"orders": orders}


@router.get("/orders/{order_id}")
async def get_customer_order(order_id: str, user=Depends(get_current_user)):
    order = await db.marketplace_orders.find_one(
        {"order_id": order_id, "customer_id": user["user_id"]}, {"_id": 0}
    )
    if not order:
        raise HTTPException(404, "Order not found")
    return order


@router.put("/orders/{order_id}/status")
async def transition_order(order_id: str, data: TransitionInput, user=Depends(get_current_user)):
    order = await db.marketplace_orders.find_one({"order_id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")
    merchant = await db.marketplace_merchants.find_one({"merchant_id": order["merchant_id"]}, {"_id": 0})
    allowed = user["user_id"] in (order["customer_id"], (merchant or {}).get("owner_id"), order.get("driver_id")) or user.get("user_type") in ("admin", "dispatcher")
    if not allowed:
        raise HTTPException(403, "Not authorized")
    try:
        require_transition(order["status"], data.status, order["fulfilment"])
    except ValueError as exc:
        raise HTTPException(409, str(exc))
    updated = await db.marketplace_orders.find_one_and_update(
        {"order_id": order_id, "status": order["status"]}, {"$set": {"status": data.status, "updated_at": now(), f"{data.status}_at": now()}},
        return_document=ReturnDocument.AFTER, projection={"_id": 0})
    if not updated:
        raise HTTPException(409, "Order changed concurrently")
    return updated


@router.put("/orders/{order_id}/payment-status")
async def transition_payment(order_id: str, data: PaymentTransitionInput,
                             user=Depends(get_current_user)):
    """Record payment evidence/state; no provider secret or implicit approval."""
    order = await db.marketplace_orders.find_one({"order_id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")
    merchant = await db.marketplace_merchants.find_one({"merchant_id": order["merchant_id"]}, {"_id": 0})
    is_admin = user.get("user_type") in ("admin", "dispatcher")
    is_customer = user["user_id"] == order["customer_id"]
    is_recipient = user["user_id"] in ((merchant or {}).get("owner_id"), order.get("driver_id"))
    current = order["payment_status"]
    allowed = {
        "instructions_pending": {"reported", "rejected"},
        "pending_provider": {"approved", "rejected"},
        "reported": {"approved", "rejected"},
        "approved": {"refunded"},
        "rejected": set(), "refunded": set(),
    }
    if data.status not in allowed.get(current, set()):
        raise HTTPException(409, f"Invalid payment transition: {current} -> {data.status}")
    if data.status == "reported" and not is_customer:
        raise HTTPException(403, "Only the customer can report a direct payment")
    if data.status in ("approved", "rejected", "refunded") and not (is_admin or is_recipient):
        raise HTTPException(403, "Recipient or admin confirmation required")
    updated = await db.marketplace_orders.find_one_and_update(
        {"order_id": order_id, "payment_status": current},
        {"$set": {"payment_status": data.status, "payment_provider_reference": data.provider_reference,
                  "payment_updated_at": now(), "payment_updated_by": user["user_id"]}},
        return_document=ReturnDocument.AFTER, projection={"_id": 0})
    if not updated:
        raise HTTPException(409, "Payment changed concurrently")
    return updated


@router.post("/orders/{order_id}/dispatch")
async def dispatch(order_id: str, round_number: int = Query(1, ge=1), user=Depends(get_current_user)):
    order = await db.marketplace_orders.find_one({"order_id": order_id, "fulfilment": "delivery", "status": "ready"}, {"_id": 0})
    if not order:
        raise HTTPException(409, "Delivery order is not ready")
    merchant = await db.marketplace_merchants.find_one({"merchant_id": order["merchant_id"]}, {"_id": 0})
    if user.get("user_type") not in ("admin", "dispatcher") and user["user_id"] != (merchant or {}).get("owner_id"):
        raise HTTPException(403, "Not authorized")
    types = dispatch_vehicle_order(round_number)
    drivers = await db.drivers.find({"is_online": True, "is_available": True, "is_blocked": {"$ne": True}}, {"_id": 0}).to_list(500)
    offers = []
    for driver in drivers:
        vehicle = await db.vehicles.find_one({"driver_id": driver["driver_id"], "is_active": True}, {"_id": 0})
        vehicle_type = (vehicle or {}).get("vehicle_type")
        if vehicle_type in types:
            offers.append({"driver_id": driver["driver_id"], "vehicle_type": vehicle_type})
    offers.sort(key=lambda x: types.index(x["vehicle_type"]))
    delivery = {"delivery_id": uid("del_"), "order_id": order_id, "round": round_number,
                "vehicle_types": types, "offers": offers, "status": "offering" if offers else "queued", "created_at": now()}
    await db.marketplace_deliveries.update_one({"order_id": order_id, "status": {"$in": ["offering", "queued"]}}, {"$setOnInsert": delivery}, upsert=True)
    return delivery


@router.post("/deliveries/{delivery_id}/accept")
async def accept_delivery(delivery_id: str, user=Depends(get_current_user)):
    if user.get("user_type") != "driver":
        raise HTTPException(403, "Driver access required")
    delivery = await db.marketplace_deliveries.find_one(
        {"delivery_id": delivery_id, "status": "offering", "offers.driver_id": user["user_id"]}, {"_id": 0})
    if not delivery:
        raise HTTPException(409, "Delivery offer unavailable")
    claimed = await db.marketplace_deliveries.find_one_and_update(
        {"delivery_id": delivery_id, "status": "offering", "assigned_driver_id": {"$exists": False}},
        {"$set": {"status": "assigned", "assigned_driver_id": user["user_id"], "assigned_at": now()}},
        return_document=ReturnDocument.AFTER, projection={"_id": 0})
    if not claimed:
        raise HTTPException(409, "Delivery already assigned")
    order = await db.marketplace_orders.find_one_and_update(
        {"order_id": delivery["order_id"], "driver_id": {"$exists": False}},
        {"$set": {"driver_id": user["user_id"], "delivery_id": delivery_id, "updated_at": now()}},
        return_document=ReturnDocument.AFTER, projection={"_id": 0})
    if not order:
        # Compensate the claim if another active delivery won a legacy/index race.
        await db.marketplace_deliveries.update_one(
            {"delivery_id": delivery_id, "assigned_driver_id": user["user_id"]},
            {"$set": {"status": "cancelled", "cancel_reason": "order_already_assigned"}})
        raise HTTPException(409, "Order already assigned")
    return {"delivery": claimed, "order": order}


@router.get("/deliveries/driver/inbox")
async def driver_delivery_inbox(user=Depends(get_current_user)):
    """Unified delivery inbox: offers plus deliveries assigned to this driver."""
    if user.get("user_type") != "driver":
        raise HTTPException(403, "Driver access required")
    driver_id = user["user_id"]
    deliveries = await db.marketplace_deliveries.find({
        "$or": [
            {"status": "offering", "offers.driver_id": driver_id},
            {"assigned_driver_id": driver_id, "status": {"$in": ["assigned", "picked_up", "delivering"]}},
        ]
    }, {"_id": 0}).sort("created_at", -1).to_list(100)
    cards = []
    for delivery in deliveries:
        order = await db.marketplace_orders.find_one({"order_id": delivery["order_id"]}, {"_id": 0}) or {}
        merchant = await db.marketplace_merchants.find_one({"merchant_id": order.get("merchant_id")}, {"_id": 0}) or {}
        cards.append(driver_delivery_view(delivery, order, merchant, driver_id))
    return {"deliveries": cards}


@router.put("/deliveries/{delivery_id}/status")
async def transition_delivery(delivery_id: str, data: DeliveryTransitionInput,
                              user=Depends(get_current_user)):
    if user.get("user_type") != "driver":
        raise HTTPException(403, "Driver access required")
    delivery = await db.marketplace_deliveries.find_one(
        {"delivery_id": delivery_id, "assigned_driver_id": user["user_id"]}, {"_id": 0})
    if not delivery:
        raise HTTPException(404, "Assigned delivery not found")
    try:
        require_delivery_transition(delivery["status"], data.status)
    except ValueError as exc:
        raise HTTPException(409, str(exc))
    updated = await db.marketplace_deliveries.find_one_and_update(
        {"delivery_id": delivery_id, "assigned_driver_id": user["user_id"], "status": delivery["status"]},
        {"$set": {"status": data.status, "updated_at": now(), f"{data.status}_at": now()}},
        return_document=ReturnDocument.AFTER, projection={"_id": 0})
    if not updated:
        raise HTTPException(409, "Delivery changed concurrently")
    order_status = data.status
    await db.marketplace_orders.update_one(
        {"order_id": delivery["order_id"], "driver_id": user["user_id"]},
        {"$set": {"status": order_status, "updated_at": now(), f"{order_status}_at": now()}})
    return updated


@router.put("/admin/commission-rules/{party}")
async def upsert_rule(party: str, data: CommissionRuleInput, user=Depends(get_current_user)):
    admin(user)
    if party != data.party:
        raise HTTPException(422, "Party mismatch")
    previous = await db.marketplace_commission_rules.find_one({"party": party}, sort=[("version", -1)])
    doc = {"rule_id": uid("rule_"), **data.model_dump(), "version": int((previous or {}).get("version", 0)) + 1,
           "created_by": user["user_id"], "created_at": now()}
    await db.marketplace_commission_rules.insert_one(doc)
    return public(doc)


@router.get("/admin/commission-rules")
async def list_current_commission_rules(user=Depends(get_current_user)):
    """Return only the latest version for each marketplace party.

    The admin UI uses this projection instead of guessing defaults. Historical
    versions remain immutable in Mongo for settlement auditability.
    """
    admin(user)
    rows = await db.marketplace_commission_rules.find(
        {}, {"_id": 0}
    ).sort([("party", 1), ("version", -1)]).to_list(200)
    return {"rules": latest_rule_versions(rows)}


@router.post("/orders/{order_id}/settle")
async def settle(order_id: str, user=Depends(get_current_user)):
    order = await db.marketplace_orders.find_one({"order_id": order_id, "status": "completed"}, {"_id": 0})
    if not order:
        raise HTTPException(409, "Only completed orders can settle")
    if order.get("payment_status") != "approved":
        raise HTTPException(409, "Payment must be approved before settlement")
    merchant = await db.marketplace_merchants.find_one({"merchant_id": order["merchant_id"]}, {"_id": 0})
    if user.get("user_type") not in ("admin", "dispatcher") and user["user_id"] not in (order["customer_id"], order.get("driver_id"), (merchant or {}).get("owner_id")):
        raise HTTPException(403, "Not authorized")
    prior = await db.marketplace_settlements.find_one({"order_id": order_id}, {"_id": 0})
    if prior:
        return prior
    rules = await db.marketplace_commission_rules.find({"active": True}, {"_id": 0}).sort("version", -1).to_list(20)
    latest = {}
    for rule in rules:
        latest.setdefault(rule["party"], rule)
    snapshot = settlement_snapshot(order["pricing"], latest.values())
    doc = {"settlement_id": uid("set_"), "order_id": order_id, "idempotency_key": f"marketplace:order:{order_id}:settlement:v1",
           "payment_method": order["payment_method"], "payment_status": order["payment_status"], **snapshot,
           "status": "recorded", "created_at": now()}
    try:
        await db.marketplace_settlements.insert_one(doc)
    except DuplicateKeyError:
        return await db.marketplace_settlements.find_one({"order_id": order_id}, {"_id": 0})
    await db.marketplace_orders.update_one({"order_id": order_id, "settlement_status": "pending"}, {"$set": {"settlement_status": "recorded", "settlement_id": doc["settlement_id"]}})
    return public(doc)
