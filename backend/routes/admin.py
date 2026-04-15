"""Admin routes"""
from fastapi import APIRouter, HTTPException, Depends, Query, Body, File, UploadFile
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import os
import uuid
import math
import base64

from database import db
from websocket_manager import manager
from utils import (
    generate_id, hash_password, get_current_user, get_settings, calculate_distance,
    DEFAULT_FARES, REQUIRED_DOCUMENTS, adjust_wallet_balance, set_wallet_balance,
)
from models import (
    SettingsUpdate, VehicleIconUpdate, AdminUserUpdate, AdminCreateUser,
    BalanceUpdate, BannerCreate, FareUpdate, AdminCouponCreate,
    CommissionUpdate, DriverBlock, PriorityUpdate, ServiceTypesUpdate,
    ManualTripCreate, PaymentConfigUpdate, CouponCreate,
)
from notifications import (
    send_push_notification, send_push_to_multiple,
    notify_document_status, notify_admin_message,
)

router = APIRouter()


@router.get("/api/admin/dashboard")
async def get_admin_dashboard(user: dict = Depends(get_current_user)):
    if user["user_type"] not in ["admin", "dispatcher"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Stats
    total_users = await db.users.count_documents({"user_type": "rider"})
    total_drivers = await db.users.count_documents({"user_type": "driver"})
    online_drivers = await db.drivers.count_documents({"is_online": True})
    
    today_rides = await db.rides.count_documents({"created_at": {"$gte": today_start}})
    active_rides = await db.rides.count_documents({"status": {"$in": ["accepted", "started"]}})
    
    # Revenue
    completed_today = await db.rides.find(
        {"status": "completed", "completed_at": {"$gte": today_start}},
        {"fare": 1, "commission": 1}
    ).to_list(1000)
    
    today_revenue = sum(r.get("fare", 0) for r in completed_today)
    today_commission = sum(r.get("commission", 0) for r in completed_today)
    
    return {
        "stats": {
            "total_users": total_users,
            "total_drivers": total_drivers,
            "online_drivers": online_drivers,
            "today_rides": today_rides,
            "active_rides": active_rides,
            "today_revenue": round(today_revenue, 2),
            "today_commission": round(today_commission, 2)
        }
    }


@router.get("/api/admin/users")
async def get_all_users(
    user_type: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 50,
    skip: int = 0,
    user: dict = Depends(get_current_user)
):
    if user["user_type"] not in ["admin", "dispatcher"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    query = {}
    if user_type:
        query["user_type"] = user_type
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}}
        ]
    
    users = await db.users.find(query, {"_id": 0, "password_hash": 0}).skip(skip).limit(limit).to_list(limit)
    total = await db.users.count_documents(query)
    
    return {"users": users, "total": total}


@router.get("/api/admin/drivers")
async def get_all_drivers(
    status: Optional[str] = None,  # online, offline, all
    verified: Optional[bool] = None,
    limit: int = 50,
    user: dict = Depends(get_current_user)
):
    if user["user_type"] not in ["admin", "dispatcher"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    query = {}
    if status == "online":
        query["is_online"] = True
    elif status == "offline":
        query["is_online"] = False
    
    if verified is not None:
        query["documents_verified"] = verified
    
    drivers = await db.drivers.find(query, {"_id": 0}).to_list(limit)
    
    # Enrich with user data
    for driver in drivers:
        user_data = await db.users.find_one(
            {"user_id": driver["driver_id"]},
            {"_id": 0, "name": 1, "email": 1, "phone": 1, "rating": 1, "profile_picture": 1}
        )
        driver["user_info"] = user_data
        
        vehicles = await db.vehicles.find(
            {"driver_id": driver["driver_id"]},
            {"_id": 0}
        ).to_list(5)
        driver["vehicles"] = vehicles
    
    return {"drivers": drivers}


@router.put("/api/admin/drivers/{driver_id}/verify")
async def verify_driver(
    driver_id: str,
    verified: bool,
    user: dict = Depends(get_current_user)
):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    now = datetime.now(timezone.utc)
    await db.drivers.update_one(
        {"driver_id": driver_id},
        {"$set": {"documents_verified": verified, "is_verified": verified}}
    )
    # Also update users.is_verified
    await db.users.update_one(
        {"user_id": driver_id},
        {"$set": {"is_verified": verified, "verified_at": now if verified else None}}
    )
    
    if verified:
        # Send welcome inbox message
        await db.inbox_messages.insert_one({
            "message_id": generate_id("inbox_"),
            "sender_id": "system",
            "sender_name": "Moli - Equipo",
            "sender_type": "admin",
            "recipient_id": driver_id,
            "subject": "¡Bienvenido a Moli! Tu cuenta fue verificada",
            "body": "¡Felicitaciones! Tu cuenta de conductor fue verificada exitosamente. Ya podés ponerte en línea y empezar a recibir viajes. ¡Buena ruta!",
            "is_read": False,
            "created_at": now,
        })
        
        # Send push notification
        try:
            from notifications import send_push_notification
            await send_push_notification(
                driver_id,
                "✅ ¡Cuenta verificada!",
                "Tu cuenta fue aprobada. Ya podés recibir viajes en Moli.",
                {"type": "verification_approved"}
            )
        except Exception as e:
            print(f"Push notification error: {e}")
        
        # Send WebSocket notification
        try:
            from websocket_manager import manager
            await manager.send_personal_message({
                "type": "account_verified",
                "message": "¡Tu cuenta fue verificada! Ya podés recibir viajes.",
            }, driver_id)
        except: pass
    
    return {"status": "success", "verified": verified}


@router.get("/api/admin/rides")
async def get_all_rides(
    status: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    limit: int = 50,
    skip: int = 0,
    user: dict = Depends(get_current_user)
):
    if user["user_type"] not in ["admin", "dispatcher"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    query = {}
    if status:
        query["status"] = status
    if date_from:
        query["created_at"] = {"$gte": date_from}
    if date_to:
        if "created_at" in query:
            query["created_at"]["$lte"] = date_to
        else:
            query["created_at"] = {"$lte": date_to}
    
    rides = await db.rides.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.rides.count_documents(query)
    
    return {"rides": rides, "total": total}


@router.get("/api/admin/settings")
async def get_admin_settings(user: dict = Depends(get_current_user)):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    settings = await get_settings()
    
    # Mask sensitive keys
    masked_settings = settings.copy()
    sensitive_keys = ["mercadopago_access_token", "astropay_secret_key", "google_maps_key", "mapbox_key"]
    for key in sensitive_keys:
        if key in masked_settings and masked_settings[key]:
            masked_settings[key] = "****" + masked_settings[key][-4:] if len(masked_settings.get(key, "")) > 4 else "****"
    
    return masked_settings


@router.put("/api/admin/settings")
async def update_admin_settings(
    settings_update: SettingsUpdate,
    user: dict = Depends(get_current_user)
):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    update_data = {k: v for k, v in settings_update.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    await db.settings.update_one(
        {"setting_id": "global"},
        {"$set": update_data},
        upsert=True
    )
    
    return {"status": "success", "message": "Settings updated"}


@router.get("/api/admin/vehicle-icons")
async def get_vehicle_icons_admin(user: dict = Depends(get_current_user)):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    icons = await db.vehicle_icons.find({}, {"_id": 0}).to_list(20)
    if not icons:
        for icon in DEFAULT_VEHICLE_ICONS:
            icon["updated_at"] = datetime.now(timezone.utc).isoformat()
            await db.vehicle_icons.update_one(
                {"vehicle_type": icon["vehicle_type"]},
                {"$set": icon},
                upsert=True
            )
        icons = DEFAULT_VEHICLE_ICONS
    return {"icons": icons}


@router.put("/api/admin/vehicle-icons/{vehicle_type}")
async def update_vehicle_icon(
    vehicle_type: str,
    update: VehicleIconUpdate,
    user: dict = Depends(get_current_user)
):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    valid_types = ["economy", "comfort", "premium", "xl"]
    if vehicle_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid vehicle type. Must be one of: {valid_types}")
    
    update_data = {
        "vehicle_type": vehicle_type,
        "icon_type": update.icon_type,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    if update.icon_type == "emoji":
        if not update.emoji_value:
            raise HTTPException(status_code=400, detail="emoji_value required for emoji icon type")
        update_data["emoji_value"] = update.emoji_value
        update_data["image_data"] = None
    elif update.icon_type == "image":
        if not update.image_data:
            raise HTTPException(status_code=400, detail="image_data (base64) required for image icon type")
        # Validate base64 size (max 500KB)
        if len(update.image_data) > 700000:
            raise HTTPException(status_code=400, detail="Image too large. Max 500KB")
        update_data["image_data"] = update.image_data
        update_data["emoji_value"] = None
    else:
        raise HTTPException(status_code=400, detail="icon_type must be 'emoji' or 'image'")
    
    # Get display name
    display_names = {"economy": "Económico", "comfort": "Confort", "premium": "Premium", "xl": "XL"}
    update_data["display_name"] = display_names.get(vehicle_type, vehicle_type)
    
    await db.vehicle_icons.update_one(
        {"vehicle_type": vehicle_type},
        {"$set": update_data},
        upsert=True
    )
    
    return {"status": "success", "message": f"Icon for {vehicle_type} updated", "icon": update_data}


@router.post("/api/admin/coupons")
async def create_coupon(
    coupon: CouponCreate,
    user: dict = Depends(get_current_user)
):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Check if code exists
    existing = await db.coupons.find_one({"code": coupon.code.upper()})
    if existing:
        raise HTTPException(status_code=400, detail="Coupon code already exists")
    
    coupon_doc = {
        "coupon_id": generate_id("coup_"),
        "code": coupon.code.upper(),
        "discount_type": coupon.discount_type,
        "discount_value": coupon.discount_value,
        "min_order_amount": coupon.min_order_amount,
        "max_uses": coupon.max_uses,
        "current_uses": 0,
        "is_active": True,
        "expires_at": coupon.expires_at,
        "created_at": datetime.now(timezone.utc)
    }
    
    await db.coupons.insert_one(coupon_doc)
    return {"status": "success", "coupon_id": coupon_doc["coupon_id"]}


@router.get("/api/dispatcher/tickets")
async def get_support_tickets(
    status: Optional[str] = None,  # waiting, active, resolved
    user: dict = Depends(get_current_user)
):
    if user["user_type"] not in ["admin", "dispatcher"]:
        raise HTTPException(status_code=403, detail="Dispatcher access required")
    
    query = {}
    if status:
        query["status"] = status
    
    tickets = await db.support_tickets.find(query, {"_id": 0}).sort("created_at", -1).to_list(50)
    
    # Enrich with user data
    for ticket in tickets:
        ticket_user = await db.users.find_one(
            {"user_id": ticket["user_id"]},
            {"_id": 0, "name": 1, "email": 1, "phone": 1, "user_type": 1}
        )
        ticket["user_info"] = ticket_user
    
    return {"tickets": tickets}


@router.post("/api/dispatcher/tickets/{ticket_id}/take")
async def take_support_ticket(
    ticket_id: str,
    user: dict = Depends(get_current_user)
):
    if user["user_type"] not in ["admin", "dispatcher"]:
        raise HTTPException(status_code=403, detail="Dispatcher access required")
    
    await db.support_tickets.update_one(
        {"ticket_id": ticket_id},
        {"$set": {
            "status": "active",
            "dispatcher_id": user["user_id"],
            "taken_at": datetime.now(timezone.utc)
        }}
    )
    
    ticket = await db.support_tickets.find_one({"ticket_id": ticket_id}, {"_id": 0})
    
    # Notify user
    await manager.send_personal_message(
        {"type": "dispatcher_connected", "dispatcher_name": user["name"]},
        ticket["user_id"]
    )
    
    return {"status": "success", "ticket": ticket}


@router.get("/api/admin/users")
async def admin_list_users(
    user_type: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
    user: dict = Depends(get_current_user)
):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    query: dict = {}
    if user_type:
        query["user_type"] = user_type
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}},
        ]
    
    skip = (page - 1) * limit
    total = await db.users.count_documents(query)
    users = await db.users.find(query, {"_id": 0, "password": 0}).skip(skip).limit(limit).sort("created_at", -1).to_list(limit)
    
    # Enrich with balance info
    for u in users:
        balance = await db.user_balances.find_one({"user_id": u["user_id"]}, {"_id": 0})
        wallet_bal = u.get("wallet_balance", 0.0)
        bal_amount = balance.get("amount", 0.0) if balance else 0.0
        # Sync: prefer users.wallet_balance as source of truth
        actual_balance = wallet_bal if wallet_bal != 0 else bal_amount
        u["balance"] = actual_balance
        u["wallet_balance"] = actual_balance
        u["debt"] = balance.get("debt", 0.0) if balance else 0.0
        # Driver status
        if u["user_type"] == "driver":
            driver = await db.drivers.find_one({"driver_id": u["user_id"]}, {"_id": 0})
            u["is_online"] = driver.get("is_online", False) if driver else False
            u["is_blocked"] = driver.get("is_blocked", False) if driver else False
            u["block_type"] = driver.get("block_type", None) if driver else None
            u["priority"] = driver.get("priority", 0) if driver else 0
    
    return {"users": users, "total": total, "page": page, "pages": (total + limit - 1) // limit}


@router.get("/api/admin/users/{user_id}")
async def admin_get_user(user_id: str, user: dict = Depends(get_current_user)):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Use users.wallet_balance as primary source; fallback to user_balances
    balance_doc = await db.user_balances.find_one({"user_id": user_id}, {"_id": 0})
    wallet_bal = target.get("wallet_balance", 0.0)
    target["balance"] = wallet_bal
    target["wallet_balance"] = wallet_bal
    target["debt"] = balance_doc.get("debt", 0.0) if balance_doc else 0.0
    
    if target["user_type"] == "driver":
        driver = await db.drivers.find_one({"driver_id": user_id}, {"_id": 0})
        if driver:
            target["is_online"] = driver.get("is_online", False)
            target["is_blocked"] = driver.get("is_blocked", False)
            target["block_type"] = driver.get("block_type")
            target["block_until"] = driver.get("block_until")
            target["priority"] = driver.get("priority", 0)
            target["commission_type"] = driver.get("commission_type", "percentage")
            target["commission_value"] = driver.get("commission_value", 15)
            target["service_types"] = driver.get("service_types", ["economy"])
            target["vehicle"] = await db.vehicles.find_one({"driver_id": user_id}, {"_id": 0})
    
    # Ride stats
    target["total_rides"] = await db.rides.count_documents({
        "$or": [{"rider_id": user_id}, {"driver_id": user_id}],
        "status": "completed"
    })
    
    return target


@router.put("/api/admin/users/{user_id}")
async def admin_update_user(
    user_id: str,
    update: AdminUserUpdate,
    user: dict = Depends(get_current_user)
):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    target = await db.users.find_one({"user_id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    
    update_data = {k: v for k, v in update.dict().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    # Log modification
    await db.audit_log.insert_one({
        "action": "user_update",
        "target_user_id": user_id,
        "admin_id": user["user_id"],
        "changes": update_data,
        "previous_values": {k: target.get(k) for k in update_data if k != "updated_at"},
        "created_at": datetime.now(timezone.utc),
        "source": "admin"
    })
    
    await db.users.update_one({"user_id": user_id}, {"$set": update_data})
    return {"status": "success", "message": "User updated"}


@router.post("/api/admin/users")
async def admin_create_user(data: AdminCreateUser, user: dict = Depends(get_current_user)):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    existing = await db.users.find_one({"email": data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already exists")
    
    hashed = hash_password(data.password)
    new_user_id = str(uuid.uuid4())
    new_user = {
        "user_id": new_user_id,
        "name": data.name,
        "email": data.email,
        "phone": data.phone,
        "password": hashed,
        "user_type": data.user_type,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    
    await db.users.insert_one(new_user)
    
    # Create balance
    await db.user_balances.insert_one({
        "user_id": new_user_id,
        "amount": 0.0,
        "debt": 0.0,
        "updated_at": datetime.now(timezone.utc).isoformat()
    })
    
    # If driver, create driver record
    if data.user_type == "driver":
        await db.drivers.insert_one({
            "driver_id": new_user_id,
            "is_online": False,
            "is_blocked": False,
            "priority": 0,
            "commission_type": "percentage",
            "commission_value": 15,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
    
    # If dispatcher, create default permissions
    if data.user_type == "dispatcher":
        default_permissions = {
            "create_rides": True,
            "view_live_map": True,
            "edit_rides": True,
            "cancel_rides": True,
            "view_drivers": True,
            "edit_drivers": False,
            "create_drivers": False,
            "block_drivers": False,
            "add_driver_balance": False,
            "remove_driver_balance": False,
            "view_realtime_rides": True,
            "view_completed_rides": True,
            "view_statistics": False,
            "manage_clients": False,
        }
        await db.users.update_one(
            {"user_id": new_user_id},
            {"$set": {"dispatcher_permissions": default_permissions}}
        )
    
    # Audit log
    await db.audit_log.insert_one({
        "action": "user_create",
        "target_user_id": new_user_id,
        "admin_id": user["user_id"],
        "changes": {"name": data.name, "email": data.email, "user_type": data.user_type},
        "created_at": datetime.now(timezone.utc),
        "source": "admin"
    })
    
    del new_user["password"]
    del new_user["_id"]
    return {"status": "success", "user": new_user}



@router.get("/api/admin/dispatchers")
async def get_dispatchers(user: dict = Depends(get_current_user)):
    """List all dispatcher users with their permissions"""
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    dispatchers = await db.users.find(
        {"user_type": "dispatcher"},
        {"_id": 0, "password": 0}
    ).to_list(100)
    
    return {"dispatchers": dispatchers}


@router.put("/api/admin/dispatchers/{user_id}/permissions")
async def update_dispatcher_permissions(
    user_id: str,
    permissions: dict = Body(...),
    user: dict = Depends(get_current_user)
):
    """Update dispatcher permissions (admin only)"""
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    target = await db.users.find_one({"user_id": user_id})
    if not target or target.get("user_type") != "dispatcher":
        raise HTTPException(status_code=404, detail="Dispatcher not found")
    
    valid_permissions = [
        "create_rides", "view_live_map", "edit_rides", "cancel_rides",
        "view_drivers", "edit_drivers", "create_drivers", "block_drivers",
        "add_driver_balance", "remove_driver_balance", "view_realtime_rides",
        "view_completed_rides", "view_statistics", "manage_clients",
    ]
    
    clean = {k: bool(v) for k, v in permissions.items() if k in valid_permissions}
    
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"dispatcher_permissions": clean}}
    )
    
    return {"status": "success", "permissions": clean}


@router.get("/api/dispatch/rides")
async def get_dispatch_rides(
    tab: str = Query("new"),
    user: dict = Depends(get_current_user)
):
    """Get rides for dispatch dashboard. Tabs: new, active, completed, cancelled"""
    if user["user_type"] not in ("admin", "dispatcher"):
        raise HTTPException(status_code=403, detail="Dispatch access required")
    
    if tab == "new":
        # Rides being dispatched (pending/searching)
        rides = await db.ride_requests.find(
            {"status": {"$in": ["pending", "searching"]}},
            {"_id": 0}
        ).sort("created_at", -1).to_list(50)
        
        # Also get active offers info
        for ride in rides:
            ride_doc = await db.rides.find_one(
                {"request_id": ride.get("request_id")},
                {"_id": 0}
            )
            if ride_doc:
                ride["ride"] = ride_doc
        
        return {"rides": rides, "count": len(rides)}
    
    elif tab == "active":
        # Rides in progress
        rides = await db.rides.find(
            {"status": {"$in": ["accepted", "arrived", "started"]}},
            {"_id": 0}
        ).sort("created_at", -1).to_list(50)
        
        # Enrich with driver info
        for ride in rides:
            if ride.get("driver_id"):
                driver = await db.users.find_one(
                    {"user_id": ride["driver_id"]},
                    {"_id": 0, "password": 0}
                )
                if driver:
                    ride["driver_name"] = driver.get("name", "")
                    ride["driver_phone"] = driver.get("phone", "")
        
        return {"rides": rides, "count": len(rides)}
    
    elif tab == "completed":
        rides = await db.rides.find(
            {"status": "completed"},
            {"_id": 0}
        ).sort("completed_at", -1).to_list(100)
        return {"rides": rides, "count": len(rides)}
    
    elif tab == "cancelled":
        rides = await db.rides.find(
            {"status": "cancelled"},
            {"_id": 0}
        ).sort("cancelled_at", -1).to_list(100)
        
        # Also include cancelled requests without rides
        cancelled_requests = await db.ride_requests.find(
            {"status": "cancelled"},
            {"_id": 0}
        ).sort("created_at", -1).to_list(50)
        
        return {"rides": rides, "requests": cancelled_requests, "count": len(rides) + len(cancelled_requests)}
    
    return {"rides": [], "count": 0}


@router.post("/api/dispatch/cancel/{request_id}")
async def dispatch_cancel_ride(request_id: str, reason: str = Query("Cancelado por despacho"), user: dict = Depends(get_current_user)):
    """Cancel a ride from dispatch"""
    if user["user_type"] not in ("admin", "dispatcher"):
        raise HTTPException(status_code=403, detail="Dispatch access required")
    
    now = datetime.now(timezone.utc)
    
    # Cancel the request
    await db.ride_requests.update_one(
        {"request_id": request_id},
        {"$set": {"status": "cancelled", "cancelled_at": now, "cancel_reason": reason}}
    )
    
    # Cancel associated ride if exists
    ride = await db.rides.find_one({"request_id": request_id})
    if ride:
        driver_id = ride.get("driver_id")
        await db.rides.update_one(
            {"request_id": request_id},
            {"$set": {"status": "cancelled", "cancelled_at": now, "cancel_reason": reason}}
        )
        # Notify driver
        if driver_id:
            await manager.send_personal_message({
                "type": "ride_cancelled",
                "ride_id": ride.get("ride_id"),
                "reason": reason,
            }, driver_id)
    
    return {"status": "cancelled", "request_id": request_id}


@router.post("/api/dispatch/assign/{request_id}")
async def dispatch_assign_driver(
    request_id: str,
    driver_id: str = Body(..., embed=True),
    pin: str = Body(..., embed=True),
    user: dict = Depends(get_current_user)
):
    """Manually assign a driver to a ride from dispatch. Requires supervisor PIN."""
    if user["user_type"] not in ("admin", "dispatcher"):
        raise HTTPException(status_code=403, detail="Dispatch access required")
    
    if pin != "0725":
        raise HTTPException(status_code=403, detail="PIN de supervisión incorrecto")
    
    # Get the request
    request_doc = await db.ride_requests.find_one({"request_id": request_id})
    if not request_doc:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    
    # Get driver
    driver = await db.users.find_one({"user_id": driver_id, "user_type": "driver"})
    if not driver:
        raise HTTPException(status_code=404, detail="Conductor no encontrado")
    
    now = datetime.now(timezone.utc)
    
    # Update request status
    await db.ride_requests.update_one(
        {"request_id": request_id},
        {"$set": {"status": "accepted", "assigned_driver": driver_id}}
    )
    
    # Get or create ride
    existing_ride = await db.rides.find_one({"request_id": request_id})
    vehicle = await db.vehicles.find_one({"driver_id": driver_id, "is_active": True}, {"_id": 0})
    
    if existing_ride:
        await db.rides.update_one(
            {"request_id": request_id},
            {"$set": {
                "driver_id": driver_id,
                "status": "accepted",
                "accepted_at": now,
                "vehicle_info": {
                    "make": vehicle.get("make", "") if vehicle else "",
                    "model": vehicle.get("model", "") if vehicle else "",
                    "plate_number": vehicle.get("plate_number", "") if vehicle else "",
                } if vehicle else None,
            }}
        )
        ride_id = existing_ride["ride_id"]
    else:
        ride_id = f"ride_{uuid.uuid4().hex[:12]}"
        ride_doc = {
            "ride_id": ride_id,
            "request_id": request_id,
            "rider_id": request_doc.get("rider_id", "dispatch"),
            "driver_id": driver_id,
            "pickup_location": request_doc.get("pickup_location"),
            "dropoff_location": request_doc.get("dropoff_location"),
            "vehicle_type": request_doc.get("vehicle_type", "economy"),
            "status": "accepted",
            "fare": request_doc.get("estimated_fare", 0),
            "accepted_at": now,
            "created_at": now,
        }
        await db.rides.insert_one(ride_doc)
    
    # Notify driver
    await manager.send_personal_message({
        "type": "ride_assigned",
        "ride_id": ride_id,
        "request_id": request_id,
        "message": f"Viaje asignado por despacho. Dirígete al punto de recogida.",
        "pickup": request_doc.get("pickup_location"),
    }, driver_id)
    
    # Send push notification
    try:
        await send_push_notification(
            driver_id,
            "Viaje asignado",
            "Se te ha asignado un viaje desde despacho. Dirígete al punto de recogida.",
            data={"type": "ride_assigned", "ride_id": ride_id}
        )
    except:
        pass
    
    return {"status": "assigned", "ride_id": ride_id, "driver": driver.get("name", "")}



@router.put("/api/admin/users/{user_id}/balance")
async def admin_update_balance(
    user_id: str,
    update: BalanceUpdate,
    user: dict = Depends(get_current_user)
):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Read current balance from users.wallet_balance (primary source of truth)
    target_user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "wallet_balance": 1})
    old_amount = target_user.get("wallet_balance", 0.0) if target_user else 0.0
    
    if update.operation == "add":
        new_amount = old_amount + update.amount
    elif update.operation == "subtract":
        new_amount = old_amount - update.amount
    else:
        new_amount = update.amount
    
    # Use unified setter that syncs BOTH collections
    await set_wallet_balance(user_id, new_amount)
    
    # Record transaction
    await db.wallet_transactions.insert_one({
        "user_id": user_id,
        "type": "admin_" + update.operation,
        "amount": update.amount if update.operation == "add" else -update.amount,
        "balance_after": new_amount,
        "description": update.reason or f"Ajuste por admin ({update.operation})",
        "created_at": datetime.now(timezone.utc),
    })
    
    await db.audit_log.insert_one({
        "action": "balance_update",
        "target_user_id": user_id,
        "admin_id": user["user_id"],
        "changes": {"amount": new_amount, "operation": update.operation},
        "previous_values": {"amount": old_amount},
        "reason": update.reason,
        "created_at": datetime.now(timezone.utc),
        "source": "admin"
    })
    
    return {"status": "success", "balance": new_amount, "previous": old_amount}


@router.put("/api/admin/users/{user_id}/debt")
async def admin_update_debt(
    user_id: str,
    update: BalanceUpdate,
    user: dict = Depends(get_current_user)
):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    current = await db.user_balances.find_one({"user_id": user_id})
    old_debt = current.get("debt", 0.0) if current else 0.0
    
    if update.operation == "add":
        new_debt = old_debt + update.amount
    elif update.operation == "subtract":
        new_debt = max(0, old_debt - update.amount)
    else:
        new_debt = update.amount
    
    await db.user_balances.update_one(
        {"user_id": user_id},
        {"$set": {"debt": new_debt, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )
    
    await db.audit_log.insert_one({
        "action": "debt_update",
        "target_user_id": user_id,
        "admin_id": user["user_id"],
        "changes": {"debt": new_debt, "operation": update.operation},
        "previous_values": {"debt": old_debt},
        "reason": update.reason,
        "created_at": datetime.now(timezone.utc),
        "source": "admin"
    })
    
    return {"status": "success", "debt": new_debt, "previous": old_debt}


@router.get("/api/admin/audit-log")
async def admin_get_audit_log(
    target_user_id: Optional[str] = None,
    action: Optional[str] = None,
    page: int = 1,
    limit: int = 30,
    user: dict = Depends(get_current_user)
):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    query: dict = {}
    if target_user_id:
        query["target_user_id"] = target_user_id
    if action:
        query["action"] = action
    
    skip = (page - 1) * limit
    total = await db.audit_log.count_documents(query)
    
    logs = []
    cursor = db.audit_log.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit)
    async for log in cursor:
        if isinstance(log.get("created_at"), datetime):
            log["created_at"] = log["created_at"].isoformat()
        # Get admin name
        admin = await db.users.find_one({"user_id": log.get("admin_id", "")}, {"name": 1, "_id": 0})
        log["admin_name"] = admin["name"] if admin else "Sistema"
        # Get target name
        target = await db.users.find_one({"user_id": log.get("target_user_id", "")}, {"name": 1, "_id": 0})
        log["target_name"] = target["name"] if target else "Desconocido"
        logs.append(log)
    
    return {"logs": logs, "total": total, "page": page, "pages": (total + limit - 1) // limit}


@router.get("/api/admin/fares")
async def admin_get_fares(user: dict = Depends(get_current_user)):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    fares = await db.fare_config.find({}, {"_id": 0}).to_list(20)
    if not fares:
        for vtype, config in DEFAULT_FARES.items():
            fare = {
                "vehicle_type": vtype,
                **config,
                "dynamic_pricing": False,
                "dynamic_multiplier": 1.5,
                "night_surcharge": 0,
                "night_start_hour": 22,
                "night_end_hour": 6,
                "day_surcharge": 0,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            await db.fare_config.update_one({"vehicle_type": vtype}, {"$set": fare}, upsert=True)
            fares.append(fare)
    return {"fares": fares}


@router.get("/api/admin/banners")
async def admin_list_banners(user: dict = Depends(get_current_user)):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    banners = await db.banners.find({}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return {"banners": banners}


@router.post("/api/admin/banners")
async def admin_create_banner(data: BannerCreate, user: dict = Depends(get_current_user)):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    banner = {
        "banner_id": str(uuid.uuid4()),
        **data.dict(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.banners.insert_one(banner)
    return {"message": "Banner creado", "banner_id": banner["banner_id"]}


@router.put("/api/admin/banners/{banner_id}")
async def admin_update_banner(banner_id: str, data: BannerCreate, user: dict = Depends(get_current_user)):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    result = await db.banners.update_one(
        {"banner_id": banner_id},
        {"$set": {**data.dict(), "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Banner no encontrado")
    return {"message": "Banner actualizado"}


@router.delete("/api/admin/banners/{banner_id}")
async def admin_delete_banner(banner_id: str, user: dict = Depends(get_current_user)):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    result = await db.banners.delete_one({"banner_id": banner_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Banner no encontrado")
    return {"message": "Banner eliminado"}


@router.put("/api/admin/fares/{vehicle_type}")
async def admin_update_fare(
    vehicle_type: str,
    update: FareUpdate,
    user: dict = Depends(get_current_user)
):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    valid = ["economy", "comfort", "premium", "xl"]
    if vehicle_type not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid type. Must be: {valid}")
    
    update_data = {k: v for k, v in update.dict().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    old = await db.fare_config.find_one({"vehicle_type": vehicle_type}, {"_id": 0})
    
    await db.fare_config.update_one(
        {"vehicle_type": vehicle_type},
        {"$set": update_data},
        upsert=True
    )
    
    await db.audit_log.insert_one({
        "action": "fare_update",
        "target_user_id": vehicle_type,
        "admin_id": user["user_id"],
        "changes": update_data,
        "previous_values": {k: old.get(k) for k in update_data if old and k != "updated_at"} if old else {},
        "created_at": datetime.now(timezone.utc),
        "source": "admin"
    })
    
    return {"status": "success", "message": f"Fare for {vehicle_type} updated"}


@router.get("/api/admin/coupons")
async def admin_list_coupons(user: dict = Depends(get_current_user)):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    coupons = await db.coupons.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"coupons": coupons}


@router.post("/api/admin/coupons")
async def admin_create_coupon(data: CouponCreate, user: dict = Depends(get_current_user)):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    existing = await db.coupons.find_one({"code": data.code.upper()})
    if existing:
        raise HTTPException(status_code=400, detail="Coupon code already exists")
    
    coupon = {
        "coupon_id": str(uuid.uuid4()),
        "code": data.code.upper(),
        "discount_type": data.discount_type,
        "discount_value": data.discount_value,
        "max_uses": data.max_uses,
        "current_uses": 0,
        "min_fare": data.min_fare,
        "max_discount": data.max_discount,
        "valid_from": data.valid_from or datetime.now(timezone.utc).isoformat(),
        "valid_until": data.valid_until,
        "active": data.active,
        "description": data.description,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user["user_id"]
    }
    
    await db.coupons.insert_one(coupon)
    del coupon["_id"]
    
    await db.audit_log.insert_one({
        "action": "coupon_create",
        "target_user_id": coupon["coupon_id"],
        "admin_id": user["user_id"],
        "changes": {"code": coupon["code"], "discount_type": coupon["discount_type"], "discount_value": coupon["discount_value"]},
        "created_at": datetime.now(timezone.utc),
        "source": "admin"
    })
    
    return {"status": "success", "coupon": coupon}


@router.put("/api/admin/coupons/{coupon_id}")
async def admin_update_coupon(coupon_id: str, data: CouponCreate, user: dict = Depends(get_current_user)):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    existing = await db.coupons.find_one({"coupon_id": coupon_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Coupon not found")
    
    update_data = data.dict()
    update_data["code"] = data.code.upper()
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.coupons.update_one({"coupon_id": coupon_id}, {"$set": update_data})
    
    return {"status": "success", "message": "Coupon updated"}


@router.delete("/api/admin/coupons/{coupon_id}")
async def admin_delete_coupon(coupon_id: str, user: dict = Depends(get_current_user)):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    result = await db.coupons.delete_one({"coupon_id": coupon_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Coupon not found")
    
    return {"status": "success", "message": "Coupon deleted"}


@router.put("/api/admin/drivers/{driver_id}/commission")
async def admin_update_commission(
    driver_id: str,
    update: CommissionUpdate,
    user: dict = Depends(get_current_user)
):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    old = await db.drivers.find_one({"driver_id": driver_id}, {"_id": 0})
    
    await db.drivers.update_one(
        {"driver_id": driver_id},
        {"$set": {
            "commission_type": update.commission_type,
            "commission_value": update.commission_value,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }},
        upsert=True
    )
    
    await db.audit_log.insert_one({
        "action": "commission_update",
        "target_user_id": driver_id,
        "admin_id": user["user_id"],
        "changes": {"commission_type": update.commission_type, "commission_value": update.commission_value},
        "previous_values": {"commission_type": old.get("commission_type"), "commission_value": old.get("commission_value")} if old else {},
        "created_at": datetime.now(timezone.utc),
        "source": "admin"
    })
    
    return {"status": "success", "message": "Commission updated"}


@router.put("/api/admin/drivers/{driver_id}/block")
async def admin_block_driver(
    driver_id: str,
    data: DriverBlock,
    user: dict = Depends(get_current_user)
):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    block_until = None
    if data.block_type == "hours" and data.block_duration:
        block_until = (datetime.now(timezone.utc) + timedelta(hours=data.block_duration)).isoformat()
    elif data.block_type == "days" and data.block_duration:
        block_until = (datetime.now(timezone.utc) + timedelta(days=data.block_duration)).isoformat()
    
    await db.drivers.update_one(
        {"driver_id": driver_id},
        {"$set": {
            "is_blocked": True,
            "block_type": data.block_type,
            "block_until": block_until,
            "block_reason": data.reason,
            "blocked_at": datetime.now(timezone.utc).isoformat()
        }},
        upsert=True
    )
    
    await db.audit_log.insert_one({
        "action": "driver_block",
        "target_user_id": driver_id,
        "admin_id": user["user_id"],
        "changes": {"is_blocked": True, "block_type": data.block_type, "block_until": block_until},
        "reason": data.reason,
        "created_at": datetime.now(timezone.utc),
        "source": "admin"
    })
    
    return {"status": "success", "message": "Driver blocked", "block_until": block_until}


@router.put("/api/admin/drivers/{driver_id}/unblock")
async def admin_unblock_driver(driver_id: str, user: dict = Depends(get_current_user)):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    await db.drivers.update_one(
        {"driver_id": driver_id},
        {"$set": {
            "is_blocked": False,
            "block_type": None,
            "block_until": None,
            "block_reason": None,
            "unblocked_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    await db.audit_log.insert_one({
        "action": "driver_unblock",
        "target_user_id": driver_id,
        "admin_id": user["user_id"],
        "changes": {"is_blocked": False},
        "created_at": datetime.now(timezone.utc),
        "source": "admin"
    })
    
    return {"status": "success", "message": "Driver unblocked"}


@router.put("/api/admin/drivers/{driver_id}/priority")
async def admin_update_priority(
    driver_id: str,
    update: PriorityUpdate,
    user: dict = Depends(get_current_user)
):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    await db.drivers.update_one(
        {"driver_id": driver_id},
        {"$set": {"priority": update.priority, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )
    
    await db.audit_log.insert_one({
        "action": "priority_update",
        "target_user_id": driver_id,
        "admin_id": user["user_id"],
        "changes": {"priority": update.priority},
        "created_at": datetime.now(timezone.utc),
        "source": "admin"
    })
    
    return {"status": "success", "message": "Priority updated"}


@router.put("/api/admin/drivers/{driver_id}/services")
async def admin_update_services(
    driver_id: str,
    update: ServiceTypesUpdate,
    user: dict = Depends(get_current_user)
):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    valid = ["economy", "comfort", "premium", "xl"]
    service_types = [s for s in update.service_types if s in valid]
    if not service_types:
        raise HTTPException(status_code=400, detail="At least one valid service type required")
    
    old = await db.drivers.find_one({"driver_id": driver_id}, {"_id": 0})
    old_services = old.get("service_types", []) if old else []
    
    await db.drivers.update_one(
        {"driver_id": driver_id},
        {"$set": {
            "service_types": service_types,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }},
        upsert=True
    )
    
    await db.audit_log.insert_one({
        "action": "service_types_update",
        "target_user_id": driver_id,
        "admin_id": user["user_id"],
        "changes": {"service_types": service_types},
        "previous_values": {"service_types": old_services},
        "created_at": datetime.now(timezone.utc),
        "source": "admin"
    })
    
    return {"status": "success", "message": "Service types updated", "service_types": service_types}


@router.get("/api/admin/drivers/live")
async def admin_get_live_drivers(user: dict = Depends(get_current_user)):
    """Get all drivers with their current locations for the God's Eye view"""
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    drivers = await db.drivers.find({}, {"_id": 0}).to_list(500)
    result = []
    for d in drivers:
        driver_user = await db.users.find_one({"user_id": d["driver_id"]}, {"_id": 0, "password": 0})
        if driver_user:
            loc = d.get("current_location", {})
            result.append({
                "driver_id": d["driver_id"],
                "name": driver_user.get("name", "Sin nombre"),
                "phone": driver_user.get("phone", ""),
                "is_online": d.get("is_online", False),
                "is_available": d.get("is_available", True),
                "is_blocked": d.get("is_blocked", False),
                "service_types": d.get("service_types", ["economy"]),
                "priority": d.get("priority", 0),
                "latitude": loc.get("latitude"),
                "longitude": loc.get("longitude"),
                "location_updated": loc.get("updated_at"),
                # Check active ride
                "active_ride": None
            })
            # Check if driver has active ride
            active = await db.rides.find_one({
                "driver_id": d["driver_id"],
                "status": {"$in": ["accepted", "arrived", "started"]}
            }, {"_id": 0, "ride_id": 1, "status": 1, "rider_id": 1})
            if active:
                result[-1]["active_ride"] = active
    
    return {"drivers": result, "total": len(result), "online": sum(1 for d in result if d["is_online"])}


@router.post("/api/admin/trips/manual")
async def admin_create_manual_trip(
    data: ManualTripCreate,
    user: dict = Depends(get_current_user)
):
    if user["user_type"] not in ("admin", "dispatcher"):
        raise HTTPException(status_code=403, detail="Dispatch access required")
    
    ride_id = f"ride_{uuid.uuid4().hex[:12]}"
    
    # Calculate fare for full trips
    fare_config = await db.fare_config.find_one({"vehicle_type": data.vehicle_type}, {"_id": 0})
    if not fare_config:
        fare_config = DEFAULT_FARES.get(data.vehicle_type, DEFAULT_FARES["economy"])
    
    base_fare = fare_config.get("base_fare", 500)
    min_fare = fare_config.get("min_fare", 800)
    fare = base_fare  # Minimum fare is always the base fare
    
    if data.trip_type == "full" and data.pickup_latitude and data.dropoff_latitude:
        # Calculate distance and estimated fare
        import math
        R = 6371
        lat1, lat2 = math.radians(data.pickup_latitude), math.radians(data.dropoff_latitude)
        dlat = math.radians(data.dropoff_latitude - data.pickup_latitude)
        dlng = math.radians(data.dropoff_longitude - data.pickup_longitude)
        a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng/2)**2
        distance_km = R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        
        per_km = fare_config.get("per_km", 150)
        fare = max(base_fare + (distance_km * per_km), min_fare)
    
    ride = {
        "ride_id": ride_id,
        "rider_id": data.rider_id or f"walkin_{uuid.uuid4().hex[:8]}",
        "rider_name": data.rider_name,
        "rider_phone": data.rider_phone,
        "driver_id": data.assigned_driver_id,
        "trip_type": data.trip_type,  # "full" or "destination_only"
        "is_manual": True,
        "source": "admin",  # created by admin (phone/whatsapp)
        "pickup_location": {
            "address": data.pickup_address,
            "latitude": data.pickup_latitude or -28.4696,
            "longitude": data.pickup_longitude or -65.7852,
        },
        "dropoff_location": {
            "address": data.dropoff_address,
            "latitude": data.dropoff_latitude,
            "longitude": data.dropoff_longitude,
        } if data.dropoff_latitude else None,
        "vehicle_type": data.vehicle_type,
        "status": "accepted" if data.assigned_driver_id else "requested",
        "fare": round(fare, 0) if fare else None,
        "is_ticketera": data.trip_type == "destination_only",
        "notes": data.notes,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user["user_id"],
    }
    
    await db.rides.insert_one(ride)
    del ride["_id"]
    
    # If no driver assigned, create a ride_request and trigger dispatch
    if not data.assigned_driver_id:
        import asyncio
        from dispatch import assign_ride_to_drivers, assignment_tasks
        
        request_id = f"req_{uuid.uuid4().hex[:12]}"
        ride_request = {
            "request_id": request_id,
            "rider_id": ride["rider_id"],
            "rider_name": data.rider_name,
            "rider_phone": data.rider_phone,
            "pickup_location": ride["pickup_location"],
            "dropoff_location": ride["dropoff_location"],
            "vehicle_type": data.vehicle_type,
            "estimated_fare": ride.get("fare", 0),
            "status": "searching",
            "is_manual": True,
            "source": "dispatch",
            "created_at": datetime.now(timezone.utc),
            "expires_at": datetime.now(timezone.utc) + timedelta(minutes=10),
        }
        await db.ride_requests.insert_one(ride_request)
        
        # Update ride with request_id
        await db.rides.update_one(
            {"ride_id": ride_id},
            {"$set": {"request_id": request_id, "status": "searching"}}
        )
        ride["request_id"] = request_id
        ride["status"] = "searching"
        
        # Get nearby drivers and trigger dispatch
        from utils import get_nearby_drivers
        pickup_lat = data.pickup_latitude or -28.4696
        pickup_lng = data.pickup_longitude or -65.7852
        
        result = await get_nearby_drivers(pickup_lat, pickup_lng, radius_km=50, vehicle_type=data.vehicle_type)
        sorted_drivers = result.get("drivers", [])
        
        # Start dispatch in background
        task = asyncio.create_task(
            assign_ride_to_drivers(request_id, ride["rider_id"], sorted_drivers, ride_request)
        )
        assignment_tasks[request_id] = task
    elif data.assigned_driver_id:
        # Notify the assigned driver via WebSocket
        await manager.send_personal_message({
            "type": "ride_assigned",
            "ride": ride,
        }, data.assigned_driver_id)
    
    # Audit
    await db.audit_log.insert_one({
        "action": "manual_trip_create",
        "target_user_id": ride_id,
        "admin_id": user["user_id"],
        "changes": {
            "trip_type": data.trip_type,
            "rider_name": data.rider_name,
            "fare": fare,
            "driver_id": data.assigned_driver_id
        },
        "created_at": datetime.now(timezone.utc),
        "source": "admin"
    })
    
    return {
        "status": "success",
        "ride": ride,
        "message": f"Viaje {'de ticketera' if data.trip_type == 'destination_only' else 'con precio fijo $' + str(round(fare))} creado"
    }


@router.get("/api/admin/trips")
async def admin_list_trips(
    status: Optional[str] = None,
    is_manual: Optional[bool] = None,
    page: int = 1,
    limit: int = 20,
    user: dict = Depends(get_current_user)
):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    query: dict = {}
    if status:
        query["status"] = status
    if is_manual is not None:
        query["is_manual"] = is_manual
    
    skip = (page - 1) * limit
    total = await db.rides.count_documents(query)
    rides = await db.rides.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    # Enrich with names
    for ride in rides:
        if ride.get("rider_id") and not ride["rider_id"].startswith("walkin_"):
            rider = await db.users.find_one({"user_id": ride["rider_id"]}, {"name": 1, "_id": 0})
            ride["rider_name"] = ride.get("rider_name") or (rider["name"] if rider else "Desconocido")
        if ride.get("driver_id"):
            driver = await db.users.find_one({"user_id": ride["driver_id"]}, {"name": 1, "_id": 0})
            ride["driver_name"] = driver["name"] if driver else "Sin asignar"
    
    return {"rides": rides, "total": total, "page": page, "pages": (total + limit - 1) // limit}


@router.get("/api/admin/payment-config")
async def admin_get_payment_config(user: dict = Depends(get_current_user)):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    config = await db.payment_config.find_one({"config_id": "main"}, {"_id": 0})
    if not config:
        config = {
            "config_id": "main",
            "mercadopago_enabled": False,
            "mercadopago_public_key": "",
            "mercadopago_access_token": "",
            "astropay_enabled": False,
            "astropay_api_key": "",
            "astropay_secret": "",
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        await db.payment_config.insert_one(config)
    
    # Mask sensitive keys
    safe = {**config}
    for key in ["mercadopago_access_token", "astropay_api_key", "astropay_secret"]:
        if safe.get(key):
            safe[key] = safe[key][:8] + "..." + safe[key][-4:] if len(safe.get(key, "")) > 12 else "***"
    safe["mercadopago_configured"] = bool(config.get("mercadopago_access_token"))
    safe["astropay_configured"] = bool(config.get("astropay_api_key"))
    
    return safe


@router.put("/api/admin/payment-config")
async def admin_update_payment_config(
    update: PaymentConfigUpdate,
    user: dict = Depends(get_current_user)
):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    update_data = {k: v for k, v in update.dict().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.payment_config.update_one(
        {"config_id": "main"},
        {"$set": update_data},
        upsert=True
    )
    
    await db.audit_log.insert_one({
        "action": "payment_config_update",
        "target_user_id": "payment_config",
        "admin_id": user["user_id"],
        "changes": {k: "***" if "key" in k or "token" in k or "secret" in k else v for k, v in update_data.items()},
        "created_at": datetime.now(timezone.utc),
        "source": "admin"
    })
    
    return {"status": "success", "message": "Payment configuration updated"}


@router.put("/api/admin/config/dispatch")
async def update_dispatch_config(
    driver_accept_seconds: int = Query(None),
    max_dispatch_attempts: int = Query(None),
    user: dict = Depends(get_current_user)
):
    """Update dispatch configuration (admin only)"""
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Solo administradores")
    
    update = {}
    if driver_accept_seconds is not None:
        update["driver_accept_seconds"] = max(5, min(30, driver_accept_seconds))
    if max_dispatch_attempts is not None:
        update["max_dispatch_attempts"] = max(3, min(50, max_dispatch_attempts))
    
    if update:
        await db.settings.update_one(
            {"key": "app_settings"},
            {"$set": update},
            upsert=True
        )
    
    return {"status": "success", "updated": update}


@router.get("/api/admin/support/sessions")
async def get_admin_support_sessions(user: dict = Depends(get_current_user)):
    """Admin: Get all support sessions with their latest messages"""
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Solo administradores")
    
    sessions = await db.support_sessions.find({}, {"_id": 0}).sort("escalated_at", -1).to_list(50)
    
    result = []
    for s in sessions:
        # Get last message for this session
        last_msg = await db.support_messages.find(
            {"session_id": s["session_id"]},
            {"_id": 0}
        ).sort("created_at", -1).to_list(1)
        
        # Get user info
        target_user = await db.users.find_one(
            {"user_id": s.get("user_id")},
            {"_id": 0, "name": 1, "email": 1, "user_type": 1}
        )
        
        result.append({
            "session_id": s["session_id"],
            "user_id": s.get("user_id", ""),
            "user_name": target_user.get("name", target_user.get("email", "")) if target_user else s.get("user_id", ""),
            "user_type": target_user.get("user_type", "") if target_user else "",
            "escalated": s.get("escalated", False),
            "last_message": last_msg[0].get("message", "") if last_msg else "",
            "created_at": s.get("escalated_at", ""),
        })
    
    # Also get non-escalated active support chats (unique sessions from messages)
    active_sessions = await db.support_messages.aggregate([
        {"$group": {"_id": "$session_id", "last_msg": {"$last": "$message"}, "user_id": {"$first": "$user_id"}, "last_at": {"$max": "$created_at"}}},
        {"$sort": {"last_at": -1}},
        {"$limit": 50}
    ]).to_list(50)
    
    existing_ids = {r["session_id"] for r in result}
    for a in active_sessions:
        if a["_id"] not in existing_ids:
            target_user = await db.users.find_one(
                {"user_id": a.get("user_id")},
                {"_id": 0, "name": 1, "email": 1, "user_type": 1}
            )
            result.append({
                "session_id": a["_id"],
                "user_id": a.get("user_id", ""),
                "user_name": target_user.get("name", target_user.get("email", "")) if target_user else "",
                "user_type": target_user.get("user_type", "") if target_user else "",
                "escalated": False,
                "last_message": a.get("last_msg", ""),
                "created_at": a.get("last_at").isoformat() if isinstance(a.get("last_at"), datetime) else "",
            })
    
    return {"sessions": result}


@router.post("/api/admin/support/reply")
async def admin_reply_to_support(
    session_id: str = Query(...),
    message: str = Query(...),
    user: dict = Depends(get_current_user)
):
    """Admin replies to a support session - sends to user directly"""
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Solo administradores")
    
    session = await db.support_sessions.find_one({"session_id": session_id})
    target_user_id = session["user_id"] if session else session_id.replace("support_", "")
    
    msg_doc = {
        "message_id": generate_id("smsg_"),
        "session_id": session_id,
        "user_id": target_user_id,
        "sender": "admin",
        "admin_id": user["user_id"],
        "admin_name": user.get("name", "Soporte"),
        "message": message,
        "created_at": datetime.now(timezone.utc),
    }
    await db.support_messages.insert_one(msg_doc)
    
    # Send via WebSocket to user
    await manager.send_personal_message({
        "type": "support_reply",
        "session_id": session_id,
        "message": message,
        "sender_name": user.get("name", "Soporte Molí"),
    }, target_user_id)
    
    return {"status": "sent"}


@router.post("/api/admin/direct-message")
async def admin_direct_message(
    target_user_id: str = Query(...),
    message: str = Query(...),
    user: dict = Depends(get_current_user)
):
    """Admin/dispatch sends direct message to any user (driver or rider)"""
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Solo administradores")
    
    msg_doc = {
        "message_id": generate_id("dmsg_"),
        "sender_id": user["user_id"],
        "sender_name": user.get("name", "Despacho"),
        "receiver_id": target_user_id,
        "message": message,
        "type": "direct",
        "created_at": datetime.now(timezone.utc),
    }
    await db.direct_messages.insert_one(msg_doc)
    
    # Send via WebSocket
    await manager.send_personal_message({
        "type": "direct_message",
        "sender_name": user.get("name", "Despacho Molí"),
        "message": message,
        "message_id": msg_doc["message_id"],
    }, target_user_id)
    
    return {"status": "sent", "message_id": msg_doc["message_id"]}


@router.put("/api/admin/config/support-hours")
async def update_support_hours(
    start_hour: int = Query(...),
    end_hour: int = Query(...),
    user: dict = Depends(get_current_user)
):
    """Configure support hours (admin only). Set start=0, end=24 for 24/7"""
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Solo administradores")
    await db.settings.update_one(
        {"key": "app_settings"},
        {"$set": {"support_hours_start": start_hour, "support_hours_end": end_hour}},
        upsert=True
    )
    return {"status": "updated", "hours": f"{start_hour}:00 - {end_hour}:00"}


@router.get("/api/admin/drivers/pending-verification")
async def get_pending_verifications(user: dict = Depends(get_current_user)):
    """Admin: Get all unverified drivers (with or without documents)"""
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Solo administradores")
    
    # Get ALL drivers who are not verified
    all_drivers = await db.users.find(
        {"user_type": "driver", "$or": [{"is_verified": False}, {"is_verified": {"$exists": False}}]},
        {"_id": 0, "password": 0}
    ).to_list(100)
    
    drivers_data = []
    for driver_user in all_drivers:
        did = driver_user["user_id"]
        driver_docs = await db.driver_documents.find(
            {"driver_id": did}, {"_id": 0, "file_data": 0}
        ).to_list(20)
        
        pending_count = sum(1 for d in driver_docs if d.get("status") == "pending")
        
        drivers_data.append({
            "driver_id": did,
            "name": driver_user.get("name", "Sin nombre"),
            "email": driver_user.get("email", ""),
            "phone": driver_user.get("phone", ""),
            "documents": [{
                **doc,
                "uploaded_at": doc["uploaded_at"].isoformat() if isinstance(doc.get("uploaded_at"), datetime) else str(doc.get("uploaded_at", "")),
            } for doc in driver_docs],
            "pending_count": pending_count,
            "total_docs": len(driver_docs),
            "has_no_docs": len(driver_docs) == 0,
        })
    
    return {"drivers": drivers_data}


@router.get("/api/admin/drivers/{driver_id}/documents")
async def get_driver_documents_admin(driver_id: str, user: dict = Depends(get_current_user)):
    """Admin: Get all documents for a specific driver (with image data)"""
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Solo administradores")
    
    docs = await db.driver_documents.find(
        {"driver_id": driver_id}, {"_id": 0}
    ).to_list(20)
    
    driver_user = await db.users.find_one({"user_id": driver_id}, {"_id": 0, "password": 0})
    
    for d in docs:
        if isinstance(d.get("uploaded_at"), datetime):
            d["uploaded_at"] = d["uploaded_at"].isoformat()
    
    return {
        "driver": {"name": driver_user.get("name", ""), "email": driver_user.get("email", "")} if driver_user else {},
        "documents": docs,
    }


@router.post("/api/admin/documents/{document_id}/review")
async def review_driver_document(
    document_id: str,
    action: str = Query(...),  # approve or reject
    reason: str = Query(""),
    user: dict = Depends(get_current_user)
):
    """Admin: Approve or reject a driver document"""
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Solo administradores")
    
    doc = await db.driver_documents.find_one({"document_id": document_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    
    now = datetime.now(timezone.utc)
    update = {
        "status": "approved" if action == "approve" else "rejected",
        "reviewed_at": now,
        "reviewed_by": user["user_id"],
    }
    if action == "reject":
        update["reject_reason"] = reason
    
    await db.driver_documents.update_one(
        {"document_id": document_id},
        {"$set": update}
    )
    
    # Check if ALL documents are now approved
    driver_id = doc["driver_id"]
    all_docs = await db.driver_documents.find(
        {"driver_id": driver_id}, {"_id": 0, "file_data": 0}
    ).to_list(20)
    
    required_types = {d["key"] for d in REQUIRED_DOCUMENTS}
    uploaded_types = {d["doc_type"] for d in all_docs}
    all_approved = required_types.issubset(uploaded_types) and all(
        d.get("status") == "approved" for d in all_docs if d["doc_type"] in required_types
    )
    
    # Update driver verification status
    await db.drivers.update_one(
        {"driver_id": driver_id},
        {"$set": {"is_verified": all_approved, "verified_at": now if all_approved else None}}
    )
    
    # Notify driver
    status_text = "aprobado" if action == "approve" else "rechazado"
    doc_label = next((d["label"] for d in REQUIRED_DOCUMENTS if d["key"] == doc["doc_type"]), doc["doc_type"])
    notify_msg = f"Tu documento '{doc_label}' fue {status_text}."
    if action == "reject" and reason:
        notify_msg += f" Motivo: {reason}"
    if all_approved:
        notify_msg = "¡Todos tus documentos fueron aprobados! Ya puedes aceptar viajes."
    
    await manager.send_personal_message({
        "type": "document_review",
        "document_id": document_id,
        "doc_type": doc["doc_type"],
        "status": update["status"],
        "message": notify_msg,
        "all_verified": all_approved,
    }, driver_id)
    
    # Send push notification for verification approval
    if all_approved:
        await send_push_notification(
            driver_id,
            "¡Cuenta aprobada! 🎉",
            "Todos tus documentos fueron verificados. Ya podés empezar a conducir y generar ingresos con Moli.",
            data={"type": "verification_approved"}
        )
    elif action == "reject":
        await send_push_notification(
            driver_id,
            "Documento rechazado",
            notify_msg,
            data={"type": "document_rejected", "doc_type": doc["doc_type"]}
        )
    
    return {"status": update["status"], "all_verified": all_approved}


@router.post("/api/admin/banners")
async def create_banner(
    data: dict = Body(None),
    title: str = Query(None),
    description: str = Query(None),
    banner_type: str = Query("image_text"),
    image_url: str = Query(None),
    video_url: str = Query(None),
    button_text: str = Query(None),
    button_link: str = Query(None),
    target: str = Query("both"),
    active: bool = Query(True),
    user: dict = Depends(get_current_user)
):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Solo administradores")
    
    # Support both query params and JSON body
    if data:
        title = data.get("title", title)
        description = data.get("description", description)
        banner_type = data.get("banner_type", banner_type)
        image_url = data.get("image_url", image_url)
        video_url = data.get("video_url", video_url)
        button_text = data.get("button_text", button_text)
        button_link = data.get("button_link", button_link)
        target = data.get("target", target)
        active = data.get("active", active)
    
    banner = {
        "banner_id": generate_id("banner_"),
        "title": title,
        "description": description,
        "banner_type": banner_type,
        "image_url": image_url,
        "video_url": video_url,
        "button_text": button_text,
        "button_link": button_link,
        "target": target,
        "active": active if isinstance(active, bool) else str(active).lower() == 'true',
        "created_at": datetime.now(timezone.utc),
    }
    await db.banners.insert_one(banner)
    banner.pop("_id", None)
    return {"status": "created", "banner": banner}


@router.get("/api/admin/banners")
async def list_banners(user: dict = Depends(get_current_user)):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Solo administradores")
    banners = await db.banners.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    for b in banners:
        if isinstance(b.get("created_at"), datetime):
            b["created_at"] = b["created_at"].isoformat()
    return {"banners": banners}


@router.put("/api/admin/banners/{banner_id}")
async def update_banner(
    banner_id: str,
    data: dict = Body(None),
    title: str = Query(None),
    description: str = Query(None),
    banner_type: str = Query(None),
    image_url: str = Query(None),
    video_url: str = Query(None),
    button_text: str = Query(None),
    button_link: str = Query(None),
    target: str = Query(None),
    active: bool = Query(None),
    user: dict = Depends(get_current_user)
):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Solo administradores")
    
    update = {}
    # Support JSON body
    if data:
        for field in ["title", "description", "banner_type", "image_url", "video_url", "button_text", "button_link", "target", "active"]:
            if field in data and data[field] is not None:
                update[field] = data[field]
    else:
        for field, val in [("title", title), ("description", description), ("banner_type", banner_type), ("image_url", image_url), ("video_url", video_url), ("button_text", button_text), ("button_link", button_link), ("target", target), ("active", active)]:
            if val is not None:
                update[field] = val
    
    if update:
        if "active" in update and isinstance(update["active"], str):
            update["active"] = update["active"].lower() == 'true'
        await db.banners.update_one({"banner_id": banner_id}, {"$set": update})
    return {"status": "updated"}


@router.delete("/api/admin/banners/{banner_id}")
async def delete_banner(banner_id: str, user: dict = Depends(get_current_user)):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Solo administradores")
    await db.banners.delete_one({"banner_id": banner_id})
    return {"status": "deleted"}


@router.post("/api/admin/banners/upload-image")
async def upload_banner_image(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user)
):
    """Upload banner image, returns URL"""
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Solo administradores")
    
    import base64
    content = await file.read()
    b64 = base64.b64encode(content).decode()
    ext = file.filename.split(".")[-1] if file.filename else "png"
    data_uri = f"data:image/{ext};base64,{b64}"
    return {"url": data_uri}


@router.get("/api/admin/cache/stats")
async def get_cache_stats(user: dict = Depends(get_current_user)):
    if user.get("user_type") not in ("admin", "dispatcher"):
        raise HTTPException(403, "Solo admin")
    
    search_count = await db.cached_searches.count_documents({})
    reverse_count = await db.cached_reverse.count_documents({})
    total_hits_search = 0
    total_hits_reverse = 0
    
    async for doc in db.cached_searches.find({}, {"hit_count": 1}):
        total_hits_search += doc.get("hit_count", 0)
    async for doc in db.cached_reverse.find({}, {"hit_count": 1}):
        total_hits_reverse += doc.get("hit_count", 0)
    
    return {
        "search_cache_entries": search_count,
        "reverse_cache_entries": reverse_count,
        "total_search_hits": total_hits_search,
        "total_reverse_hits": total_hits_reverse,
        "estimated_api_calls_saved": total_hits_search + total_hits_reverse,
    }


@router.delete("/api/admin/cache/clear")
async def clear_cache(user: dict = Depends(get_current_user)):
    if user.get("user_type") not in ("admin", "dispatcher"):
        raise HTTPException(403, "Solo admin")
    
    r1 = await db.cached_searches.delete_many({})
    r2 = await db.cached_reverse.delete_many({})
    return {"cleared_searches": r1.deleted_count, "cleared_reverse": r2.deleted_count}


@router.get("/api/admin/places")
async def get_custom_places(user: dict = Depends(get_current_user)):
    if user.get("user_type") not in ("admin", "dispatcher"):
        raise HTTPException(403, "Solo admin")
    
    places = await db.custom_places.find({}, {"_id": 0}).sort("name", 1).to_list(100)
    return {"places": places}


@router.post("/api/admin/places")
async def create_custom_place(place: dict = Body(...), user: dict = Depends(get_current_user)):
    if user.get("user_type") not in ("admin", "dispatcher"):
        raise HTTPException(403, "Solo admin")
    
    place_id = f"custom_{uuid.uuid4().hex[:10]}"
    doc = {
        "place_id": place_id,
        "name": place.get("name", ""),
        "address": place.get("address", ""),
        "latitude": float(place.get("latitude", 0)),
        "longitude": float(place.get("longitude", 0)),
        "category": place.get("category", ""),
        "icon": place.get("icon", "📍"),
        "keywords": place.get("keywords", ""),
        "is_active": True,
        "created_by": user["user_id"],
        "created_at": datetime.now(timezone.utc),
    }
    await db.custom_places.insert_one(doc)
    doc.pop("_id", None)
    return {"status": "created", "place": doc}


@router.put("/api/admin/places/{place_id}")
async def update_custom_place(place_id: str, updates: dict = Body(...), user: dict = Depends(get_current_user)):
    if user.get("user_type") not in ("admin", "dispatcher"):
        raise HTTPException(403, "Solo admin")
    
    allowed = {"name", "address", "latitude", "longitude", "category", "icon", "keywords", "is_active"}
    update_data = {k: v for k, v in updates.items() if k in allowed}
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    result = await db.custom_places.update_one({"place_id": place_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(404, "Lugar no encontrado")
    
    return {"status": "updated"}


@router.delete("/api/admin/places/{place_id}")
async def delete_custom_place(place_id: str, user: dict = Depends(get_current_user)):
    if user.get("user_type") not in ("admin", "dispatcher"):
        raise HTTPException(403, "Solo admin")
    
    result = await db.custom_places.delete_one({"place_id": place_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Lugar no encontrado")
    
    return {"status": "deleted"}


@router.put("/api/admin/app-version")
async def set_min_version(data: dict = Body(...), user: dict = Depends(get_current_user)):
    """Admin sets minimum required app version"""
    if user.get("user_type") not in ("admin", "dispatcher"):
        raise HTTPException(403, "Solo admin")
    
    update = {}
    if "min_app_version" in data:
        update["min_app_version"] = data["min_app_version"]
    if "update_message" in data:
        update["update_message"] = data["update_message"]
    
    if update:
        await db.settings.update_one(
            {"setting_id": "global"},
            {"$set": update},
            upsert=True
        )
    
    return {"status": "updated", **update}


@router.post("/api/admin/notifications/send")
async def admin_send_notification(data: dict = Body(...), user: dict = Depends(get_current_user)):
    """Admin sends push notification to users"""
    if user.get("user_type") not in ("admin", "dispatcher"):
        raise HTTPException(403, "Solo admin")
    
    title = data.get("title", "Moli")
    body = data.get("body", "")
    target = data.get("target", "all")  # all, riders, drivers, specific
    user_ids = data.get("user_ids", [])
    
    if not body:
        raise HTTPException(400, "Mensaje requerido")
    
    if target == "specific" and user_ids:
        from notifications import send_push_to_multiple
        result = await send_push_to_multiple(user_ids, title, body)
    elif target == "riders":
        riders = await db.users.find(
            {"user_type": "rider", "push_token": {"$exists": True}},
            {"user_id": 1}
        ).to_list(1000)
        ids = [r["user_id"] for r in riders]
        from notifications import send_push_to_multiple
        result = await send_push_to_multiple(ids, title, body)
    elif target == "drivers":
        drivers = await db.users.find(
            {"user_type": "driver", "push_token": {"$exists": True}},
            {"user_id": 1}
        ).to_list(1000)
        ids = [d["user_id"] for d in drivers]
        from notifications import send_push_to_multiple
        result = await send_push_to_multiple(ids, title, body)
    else:
        # Send to all users with tokens
        all_users = await db.users.find(
            {"push_token": {"$exists": True}},
            {"user_id": 1}
        ).to_list(5000)
        ids = [u["user_id"] for u in all_users]
        from notifications import send_push_to_multiple
        result = await send_push_to_multiple(ids, title, body)
    
    return result


@router.get("/api/admin/notifications/logs")
async def get_notification_logs(user: dict = Depends(get_current_user), limit: int = 50):
    """Get recent notification logs"""
    if user.get("user_type") not in ("admin", "dispatcher"):
        raise HTTPException(403, "Solo admin")
    
    logs = await db.notification_logs.find(
        {}, {"_id": 0}
    ).sort("_id", -1).limit(limit).to_list(limit)
    
    return {"logs": logs, "count": len(logs)}


# ─── ADMIN: VIEW RATINGS ────────────────

@router.get("/api/admin/ratings")
async def admin_get_ratings(
    user: dict = Depends(get_current_user),
    limit: int = 50
):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    ratings = await db.ratings.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    
    # Enrich with user names
    for r in ratings:
        rater = await db.users.find_one({"user_id": r.get("rater_id")}, {"_id": 0, "name": 1})
        rated = await db.users.find_one({"user_id": r.get("rated_user_id")}, {"_id": 0, "name": 1})
        r["rater_name"] = rater.get("name", "Desconocido") if rater else "Desconocido"
        r["rated_name"] = rated.get("name", "Desconocido") if rated else "Desconocido"
        if isinstance(r.get("created_at"), datetime):
            r["created_at"] = r["created_at"].isoformat()
    
    return {"ratings": ratings, "count": len(ratings)}

