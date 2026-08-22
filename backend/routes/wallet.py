"""Wallet, cancellation & coupon routes"""
from fastapi import APIRouter, HTTPException, Depends, Query, Body, Header
from typing import Optional
from datetime import datetime, timezone, timedelta
import uuid

from database import db
from utils import generate_id, get_current_user, get_settings, adjust_wallet_balance
from models import CouponCreate
from pydantic import BaseModel, Field, field_validator

router = APIRouter()


class WithdrawalInput(BaseModel):
    amount: float = Field(gt=0)
    transfer_alias: str = Field(min_length=6, max_length=80)

    @field_validator("transfer_alias")
    @classmethod
    def normalize_alias(cls, value: str) -> str:
        alias = value.strip().lower()
        if any(ch.isspace() for ch in alias):
            raise ValueError("El alias no puede contener espacios")
        return alias


@router.get("/api/wallet/status")
async def get_wallet_status(user: dict = Depends(get_current_user)):
    """Get full wallet status including pending penalties"""
    settings = await get_settings()
    balance = user.get("wallet_balance", 0.0)
    
    # Get pending penalties for riders
    pending_penalties = []
    if user["user_type"] == "rider":
        pens = await db.cancellation_records.find(
            {"user_id": user["user_id"], "status": "pending"},
            {"_id": 0}
        ).to_list(10)
        for p in pens:
            if isinstance(p.get("created_at"), datetime):
                p["created_at"] = p["created_at"].isoformat()
            pending_penalties.append(p)
    
    # Get driver block status
    driver_block = None
    if user["user_type"] == "driver":
        driver = await db.drivers.find_one({"driver_id": user["user_id"]}, {"_id": 0})
        if driver and driver.get("is_blocked"):
            blocked_until = driver.get("blocked_until")
            if blocked_until and isinstance(blocked_until, datetime):
                # Check if block expired
                if blocked_until <= datetime.now(timezone.utc):
                    await db.drivers.update_one(
                        {"driver_id": user["user_id"]},
                        {"$set": {"is_blocked": False, "block_reason": None, "blocked_at": None, "blocked_until": None}}
                    )
                else:
                    driver_block = {
                        "is_blocked": True,
                        "reason": driver.get("block_reason", "unknown"),
                        "blocked_until": blocked_until.isoformat() if isinstance(blocked_until, datetime) else str(blocked_until),
                    }
            elif driver.get("is_blocked"):
                driver_block = {
                    "is_blocked": True,
                    "reason": driver.get("block_reason", "unknown"),
                    "blocked_until": None,  # permanent or until admin unblocks
                }
        
        # Get recent cancel count
        thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
        cancel_count = await db.cancellation_records.count_documents(
            {"user_id": user["user_id"], "user_type": "driver", "created_at": {"$gte": thirty_days_ago}}
        )
        max_neg = settings.get("driver_max_negative_balance", -15000)
        
        return {
            "balance": balance,
            "driver_block": driver_block,
            "cancel_count_30d": cancel_count,
            "max_cancels_before_block": settings.get("driver_block_after_cancels", 3),
            "max_negative_balance": max_neg,
            "cancel_penalty": settings.get("driver_cancel_penalty", 500),
        }
    
    # Rider response
    return {
        "balance": balance,
        "pending_penalties": pending_penalties,
        "total_pending": sum(p.get("penalty_amount", 0) for p in pending_penalties),
        "max_pending_penalties": settings.get("rider_max_pending_penalties", 2),
        "cancel_penalty": settings.get("rider_cancel_penalty", 500),
    }


@router.get("/api/cancellation/config")
async def get_cancellation_config(user: dict = Depends(get_current_user)):
    """Get cancellation configuration (public for users to know penalties)"""
    settings = await get_settings()
    return {
        "cancel_free_minutes": settings.get("cancel_free_minutes", 1),
        "rider_cancel_penalty": settings.get("rider_cancel_penalty", 500),
        "driver_cancel_penalty": settings.get("driver_cancel_penalty", 500),
        "driver_max_negative_balance": settings.get("driver_max_negative_balance", -15000),
        "driver_block_after_cancels": settings.get("driver_block_after_cancels", 3),
        "driver_block_hours": settings.get("driver_block_hours", 24),
        "currency_symbol": settings.get("currency_symbol", "$"),
    }


@router.get("/api/cancellation/history")
async def get_cancellation_history(user: dict = Depends(get_current_user)):
    """Get user's cancellation records"""
    records = await db.cancellation_records.find(
        {"user_id": user["user_id"]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(20)
    for r in records:
        if isinstance(r.get("created_at"), datetime):
            r["created_at"] = r["created_at"].isoformat()
        if isinstance(r.get("blocked_until"), datetime):
            r["blocked_until"] = r["blocked_until"].isoformat()
        if isinstance(r.get("collected_at"), datetime):
            r["collected_at"] = r["collected_at"].isoformat()
    return {"records": records}


@router.get("/api/wallet/balance")
async def get_wallet_balance(user: dict = Depends(get_current_user)):
    return {"balance": user.get("wallet_balance", 0.0)}


@router.get("/api/wallet/transactions")
async def get_wallet_transactions(
    limit: int = 20,
    user: dict = Depends(get_current_user)
):
    transactions = await db.wallet_transactions.find(
        {"user_id": user["user_id"]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(limit)
    
    # Serialize datetimes
    for t in transactions:
        if isinstance(t.get("created_at"), datetime):
            t["created_at"] = t["created_at"].isoformat()
    
    return {"transactions": transactions}


@router.post("/api/wallet/withdrawals")
async def request_withdrawal(
    data: WithdrawalInput,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=120),
    user: dict = Depends(get_current_user),
):
    """Create an auditable payout request; funds move only after admin approval."""
    if user.get("user_type") != "driver" and not user.get("is_professional"):
        raise HTTPException(403, "Solo prestadores pueden solicitar retiros")
    previous = await db.wallet_withdrawals.find_one(
        {"user_id": user["user_id"], "idempotency_key": idempotency_key}, {"_id": 0})
    if previous:
        return previous
    amount = round(float(data.amount), 2)
    pending = await db.wallet_withdrawals.find(
        {"user_id": user["user_id"], "status": "pending"}, {"_id": 0, "amount": 1}).to_list(100)
    if pending:
        raise HTTPException(409, "Ya tenés una solicitud de retiro pendiente")
    available = round(float(user.get("wallet_balance", 0)), 2)
    if amount > available:
        raise HTTPException(409, "Saldo disponible insuficiente")
    request = {
        "withdrawal_id": generate_id("wdr_"), "user_id": user["user_id"],
        "amount": amount, "currency": "ARS", "transfer_alias": data.transfer_alias,
        "status": "pending", "idempotency_key": idempotency_key,
        "created_at": datetime.now(timezone.utc),
    }
    try:
        await db.wallet_withdrawals.insert_one(request)
    except Exception:
        previous = await db.wallet_withdrawals.find_one(
            {"user_id": user["user_id"], "idempotency_key": idempotency_key}, {"_id": 0})
        if previous:
            return previous
        raise
    request.pop("_id", None)
    return request


@router.post("/api/wallet/add-funds")
async def add_wallet_funds(
    amount: float,
    payment_method: str,  # mercadopago, astropay
    user: dict = Depends(get_current_user)
):
    """Initiate wallet top-up"""
    settings = await get_settings()
    
    transaction_id = generate_id("txn_")
    
    if payment_method == "mercadopago":
        # Create MercadoPago preference
        mp_token = settings.get("mercadopago_access_token")
        if not mp_token:
            return {
                "status": "pending_config",
                "message": "MercadoPago not configured. Please configure in admin panel.",
                "transaction_id": transaction_id
            }
        
        try:
            import mercadopago
            sdk = mercadopago.SDK(mp_token)
            
            preference_data = {
                "items": [{
                    "title": "TaxiRide Wallet Top-up",
                    "quantity": 1,
                    "currency_id": settings.get("currency", "USD"),
                    "unit_price": amount
                }],
                "payer": {"email": user["email"]},
                "external_reference": transaction_id,
                "back_urls": {
                    "success": f"{os.getenv('BACKEND_URL', '')}/api/wallet/callback/success",
                    "pending": f"{os.getenv('BACKEND_URL', '')}/api/wallet/callback/pending",
                    "failure": f"{os.getenv('BACKEND_URL', '')}/api/wallet/callback/failure"
                },
                "auto_return": "approved"
            }
            
            result = sdk.preference().create(preference_data)
            
            if result["status"] == 201:
                checkout_url = result["response"].get("init_point") or result["response"].get("sandbox_init_point")
                
                # Save pending transaction
                await db.wallet_transactions.insert_one({
                    "transaction_id": transaction_id,
                    "user_id": user["user_id"],
                    "amount": amount,
                    "transaction_type": "deposit",
                    "payment_method": payment_method,
                    "status": "pending",
                    "external_id": result["response"].get("id"),
                    "created_at": datetime.now(timezone.utc)
                })
                
                return {
                    "status": "success",
                    "checkout_url": checkout_url,
                    "transaction_id": transaction_id
                }
        except Exception as e:
            return {"status": "error", "message": str(e)}
    
    elif payment_method == "astropay":
        # AstroPay integration
        api_key = settings.get("astropay_api_key")
        secret_key = settings.get("astropay_secret_key")
        
        if not api_key or not secret_key:
            return {
                "status": "pending_config",
                "message": "AstroPay not configured. Please configure in admin panel.",
                "transaction_id": transaction_id
            }
        
        # Save pending transaction
        await db.wallet_transactions.insert_one({
            "transaction_id": transaction_id,
            "user_id": user["user_id"],
            "amount": amount,
            "transaction_type": "deposit",
            "payment_method": payment_method,
            "status": "pending",
            "created_at": datetime.now(timezone.utc)
        })
        
        return {
            "status": "pending_integration",
            "message": "AstroPay checkout - API keys configured",
            "transaction_id": transaction_id
        }
    
    return {"status": "error", "message": "Invalid payment method"}


@router.post("/api/wallet/callback/{status}")
async def wallet_payment_callback(
    status: str,
    external_reference: Optional[str] = None,
    payment_id: Optional[str] = None
):
    """Handle payment gateway callbacks"""
    if not external_reference:
        return {"status": "error", "message": "Missing reference"}
    
    transaction = await db.wallet_transactions.find_one(
        {"transaction_id": external_reference},
        {"_id": 0}
    )
    
    if not transaction:
        return {"status": "error", "message": "Transaction not found"}
    
    if status == "success":
        # Update transaction
        await db.wallet_transactions.update_one(
            {"transaction_id": external_reference},
            {"$set": {"status": "completed", "external_payment_id": payment_id}}
        )
        
        # Add to wallet (sync both collections)
        await adjust_wallet_balance(transaction["user_id"], transaction["amount"])
        
        return {"status": "success", "message": "Funds added to wallet"}
    
    elif status == "pending":
        await db.wallet_transactions.update_one(
            {"transaction_id": external_reference},
            {"$set": {"status": "pending"}}
        )
        return {"status": "pending", "message": "Payment is being processed"}
    
    else:
        await db.wallet_transactions.update_one(
            {"transaction_id": external_reference},
            {"$set": {"status": "failed"}}
        )
        return {"status": "failed", "message": "Payment failed"}


@router.get("/api/coupons")
async def get_available_coupons(user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    coupons = await db.coupons.find({
        "is_active": True,
        "expires_at": {"$gt": now},
        "current_uses": {"$lt": "$max_uses"}
    }, {"_id": 0}).to_list(20)
    
    return {"coupons": coupons}


@router.post("/api/coupons/apply")
async def apply_coupon(
    code: str,
    amount: float,
    user: dict = Depends(get_current_user)
):
    now = datetime.now(timezone.utc)
    coupon = await db.coupons.find_one({
        "code": code.upper(),
        "is_active": True,
        "expires_at": {"$gt": now}
    }, {"_id": 0})
    
    if not coupon:
        raise HTTPException(status_code=404, detail="Invalid or expired coupon")
    
    if coupon.get("current_uses", 0) >= coupon.get("max_uses", 100):
        raise HTTPException(status_code=400, detail="Coupon usage limit reached")
    
    if amount < coupon.get("min_order_amount", 0):
        raise HTTPException(
            status_code=400,
            detail=f"Minimum order amount is ${coupon['min_order_amount']}"
        )
    
    # Check if user already used this coupon
    usage = await db.coupon_usages.find_one({
        "coupon_id": coupon["coupon_id"],
        "user_id": user["user_id"]
    })
    if usage:
        raise HTTPException(status_code=400, detail="You have already used this coupon")
    
    # Calculate discount
    if coupon["discount_type"] == "percentage":
        discount = amount * (coupon["discount_value"] / 100)
    else:
        discount = coupon["discount_value"]
    
    discount = min(discount, amount)  # Can't discount more than total
    
    return {
        "coupon_id": coupon["coupon_id"],
        "discount": round(discount, 2),
        "final_amount": round(amount - discount, 2)
    }
