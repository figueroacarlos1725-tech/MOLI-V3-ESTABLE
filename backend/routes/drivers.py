"""Driver routes"""
from fastapi import APIRouter, HTTPException, Depends, Query, File, UploadFile, Body
from typing import Optional
from datetime import datetime, timezone
import base64

from database import db
from websocket_manager import manager
from utils import generate_id, get_current_user, get_nearby_drivers, calculate_distance, get_settings, REQUIRED_DOCUMENTS
from notifications import notify_document_status

router = APIRouter()


@router.put("/api/drivers/availability")
async def update_availability(
    is_online: bool,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    user: dict = Depends(get_current_user)
):
    if user["user_type"] != "driver":
        raise HTTPException(status_code=403, detail="Only drivers can update availability")
    
    # BLOCK CHECK: Prevent blocked drivers from going online
    if is_online:
        driver_doc = await db.drivers.find_one({"driver_id": user["user_id"]}, {"_id": 0})
        if driver_doc and driver_doc.get("is_blocked"):
            # Check if time-based block expired
            blocked_until = driver_doc.get("blocked_until")
            block_expired = False
            if blocked_until:
                if isinstance(blocked_until, str):
                    blocked_until = datetime.fromisoformat(blocked_until.replace("Z", "+00:00"))
                if isinstance(blocked_until, datetime) and blocked_until <= datetime.now(timezone.utc):
                    # Block expired, unblock
                    await db.drivers.update_one(
                        {"driver_id": user["user_id"]},
                        {"$set": {"is_blocked": False, "block_reason": None, "blocked_at": None, "blocked_until": None}}
                    )
                    block_expired = True
            
            if not block_expired:
                reason = driver_doc.get("block_reason", "unknown")
                msg = "Tu saldo es muy negativo. Recarga para continuar trabajando." if reason == "negative_balance" else "Tu cuenta está bloqueada por cancelaciones excesivas."
                raise HTTPException(
                    status_code=403,
                    detail={
                        "error": "driver_blocked",
                        "reason": reason,
                        "message": msg,
                        "blocked_until": blocked_until.isoformat() if isinstance(blocked_until, datetime) else str(blocked_until) if blocked_until else None,
                        "balance": user.get("wallet_balance", 0),
                    }
                )
    
    update_data = {
        "is_online": is_online,
        "is_available": is_online,
        "updated_at": datetime.now(timezone.utc)
    }
    
    if latitude and longitude:
        update_data["current_location"] = {
            "latitude": latitude,
            "longitude": longitude,
            "updated_at": datetime.now(timezone.utc)
        }
    
    await db.drivers.update_one({"driver_id": user["user_id"]}, {"$set": update_data})
    
    # When driver comes online, check for pending ride requests without active dispatch
    if is_online:
        try:
            pending_requests = await db.ride_requests.find({
                "status": {"$in": ["pending", "searching"]},
                "expires_at": {"$gt": datetime.now(timezone.utc)}
            }, {"_id": 0}).to_list(20)
            
            for req in pending_requests:
                req_id = req["request_id"]
                # Only start dispatch if no active task exists for this request
                if req_id not in assignment_tasks or assignment_tasks[req_id].done():
                    rider_id = req["rider_id"]
                    pickup = req.get("pickup_location", {})
                    # Get nearby drivers AFTER driver is marked online
                    nearby = await get_nearby_drivers(
                        pickup.get("latitude", 0), pickup.get("longitude", 0),
                        radius_km=50,
                        vehicle_type=req.get("vehicle_type")
                    )
                    drivers_found = nearby.get("drivers", [])
                    # Always start dispatch even if no drivers found initially (loop will wait)
                    print(f"Driver {user['user_id']} came online - dispatching pending ride {req_id}")
                    task = asyncio.create_task(
                        assign_ride_to_drivers(req_id, rider_id, drivers_found, req)
                    )
                    assignment_tasks[req_id] = task
        except Exception as e:
            print(f"Error checking pending rides for new driver: {e}")
    
    return {"status": "success", "is_online": is_online}


@router.put("/api/drivers/location")
async def update_location(
    latitude: float,
    longitude: float,
    radius_km: float = 4.0,
    user: dict = Depends(get_current_user)
):
    if user["user_type"] != "driver":
        raise HTTPException(status_code=403, detail="Only drivers can update location")
    
    await db.drivers.update_one(
        {"driver_id": user["user_id"]},
        {"$set": {
            "current_location": {
                "latitude": latitude,
                "longitude": longitude,
                "updated_at": datetime.now(timezone.utc)
            },
            "radius_km": radius_km
        }}
    )
    return {"status": "success"}


@router.get("/api/drivers/nearby")
async def get_nearby_drivers(
    latitude: float,
    longitude: float,
    radius_km: float = 5.0,
    vehicle_type: Optional[str] = None,
    ignore_driver_radius: bool = False
):
    """Get available drivers near a location"""
    drivers = await db.drivers.find({
        "is_online": True,
        "is_available": True,
        "current_location": {"$ne": None}
    }, {"_id": 0}).to_list(100)
    
    nearby = []
    for driver in drivers:
        loc = driver.get("current_location", {})
        if loc:
            distance = calculate_distance(
                latitude, longitude,
                loc.get("latitude", 0), loc.get("longitude", 0)
            )
            if distance <= radius_km:
                # Also check driver's own radius preference (unless in broadcast mode)
                driver_radius = driver.get("radius_km", 50)
                if not ignore_driver_radius and distance > driver_radius:
                    continue
                # Get driver's vehicle
                vehicle = await db.vehicles.find_one(
                    {"driver_id": driver["driver_id"], "is_active": True},
                    {"_id": 0}
                )
                if vehicle:
                    if vehicle_type and vehicle["vehicle_type"] != vehicle_type:
                        continue
                    
                    # Get driver user info
                    driver_user = await db.users.find_one(
                        {"user_id": driver["driver_id"]},
                        {"_id": 0, "name": 1, "rating": 1, "profile_picture": 1}
                    )
                    
                    nearby.append({
                        "driver_id": driver["driver_id"],
                        "name": driver_user.get("name", "Driver"),
                        "rating": driver_user.get("rating", 5.0),
                        "profile_picture": driver_user.get("profile_picture"),
                        "distance_km": round(distance, 2),
                        "location": loc,
                        "vehicle": vehicle
                    })
    
    nearby.sort(key=lambda x: x["distance_km"])
    return {"drivers": nearby[:20]}


@router.get("/api/drivers/earnings")
async def get_driver_earnings(
    period: str = "today",  # today, week, month, all
    user: dict = Depends(get_current_user)
):
    if user["user_type"] != "driver":
        raise HTTPException(status_code=403, detail="Only drivers can view earnings")
    
    now = datetime.now(timezone.utc)
    if period == "today":
        start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "week":
        start_date = now - timedelta(days=7)
    elif period == "month":
        start_date = now - timedelta(days=30)
    else:
        start_date = datetime.min.replace(tzinfo=timezone.utc)
    
    # Try both datetime and string formats for completed_at
    try:
        rides = await db.rides.find({
            "driver_id": user["user_id"],
            "status": "completed",
            "completed_at": {"$gte": start_date}
        }, {"_id": 0}).to_list(1000)
    except Exception:
        # Fallback: get all completed rides and filter in Python
        all_rides = await db.rides.find({
            "driver_id": user["user_id"],
            "status": "completed",
        }, {"_id": 0}).to_list(1000)
        rides = []
        for r in all_rides:
            cat = r.get("completed_at")
            if cat:
                if isinstance(cat, str):
                    try:
                        cat = datetime.fromisoformat(cat.replace("Z", "+00:00"))
                    except: continue
                if isinstance(cat, datetime) and cat >= start_date:
                    rides.append(r)
    
    total_earnings = sum(r.get("driver_earnings", 0) for r in rides)
    total_rides = len(rides)
    
    return {
        "period": period,
        "total_earnings": round(total_earnings, 2),
        "total_rides": total_rides,
        "average_per_ride": round(total_earnings / total_rides, 2) if total_rides > 0 else 0
    }


@router.get("/api/driver/block-status")
async def get_driver_block_status(user: dict = Depends(get_current_user)):
    """Check if driver is blocked and why"""
    if user["user_type"] != "driver":
        raise HTTPException(status_code=403, detail="Solo conductores")
    
    driver = await db.drivers.find_one({"driver_id": user["user_id"]}, {"_id": 0})
    if not driver:
        return {"is_blocked": False}
    
    is_blocked = driver.get("is_blocked", False)
    
    # Auto-unblock if time expired
    if is_blocked and driver.get("blocked_until"):
        blocked_until = driver["blocked_until"]
        if isinstance(blocked_until, datetime) and blocked_until <= datetime.now(timezone.utc):
            await db.drivers.update_one(
                {"driver_id": user["user_id"]},
                {"$set": {"is_blocked": False, "block_reason": None, "blocked_at": None, "blocked_until": None}}
            )
            return {"is_blocked": False}
    
    if not is_blocked:
        # Also check wallet limit - AUTO-BLOCK if below threshold
        settings = await get_settings()
        max_neg = settings.get("driver_max_negative_balance", -15000)
        if user.get("wallet_balance", 0) <= max_neg:
            # Actually block the driver in DB so availability check catches it too
            now = datetime.now(timezone.utc)
            await db.drivers.update_one(
                {"driver_id": user["user_id"]},
                {"$set": {
                    "is_blocked": True,
                    "block_reason": "negative_balance",
                    "blocked_at": now,
                    "blocked_until": None,
                    "is_available": False,
                    "is_online": False,
                }}
            )
            return {
                "is_blocked": True,
                "reason": "negative_balance",
                "message": f"Tu saldo llegó al límite de ${max_neg}. Recarga tu billetera para continuar trabajando.",
                "balance": user.get("wallet_balance", 0),
                "blocked_until": None,
            }
        return {"is_blocked": False}
    
    blocked_until = driver.get("blocked_until")
    return {
        "is_blocked": True,
        "reason": driver.get("block_reason", "unknown"),
        "message": "Fuiste bloqueado por cancelaciones excesivas." if driver.get("block_reason") == "cancellations" else "Tu saldo es muy negativo. Recarga para continuar.",
        "balance": user.get("wallet_balance", 0),
        "blocked_until": blocked_until.isoformat() if isinstance(blocked_until, datetime) else str(blocked_until) if blocked_until else None,
    }


@router.get("/api/drivers/{driver_id}/services")
async def get_driver_services(driver_id: str):
    """Public endpoint to get a driver's service types"""
    driver = await db.drivers.find_one({"driver_id": driver_id}, {"_id": 0})
    return {"service_types": driver.get("service_types", ["economy"]) if driver else ["economy"]}


@router.get("/api/driver/documents/required")
async def get_required_documents(user: dict = Depends(get_current_user)):
    """Get list of required documents and their upload status"""
    if user["user_type"] != "driver":
        raise HTTPException(status_code=403, detail="Solo conductores")
    
    uploaded = await db.driver_documents.find(
        {"driver_id": user["user_id"]}, {"_id": 0}
    ).to_list(20)
    uploaded_map = {d["doc_type"]: d for d in uploaded}
    
    result = []
    for doc in REQUIRED_DOCUMENTS:
        entry = {
            "key": doc["key"],
            "label": doc["label"],
            "description": doc["description"],
            "status": "not_uploaded",
        }
        if doc["key"] in uploaded_map:
            d = uploaded_map[doc["key"]]
            entry["status"] = d.get("status", "pending")  # pending, approved, rejected
            entry["uploaded_at"] = d.get("uploaded_at").isoformat() if isinstance(d.get("uploaded_at"), datetime) else str(d.get("uploaded_at", ""))
            entry["reject_reason"] = d.get("reject_reason", "")
            entry["document_id"] = d.get("document_id", "")
        result.append(entry)
    
    # Overall status
    all_approved = all(r["status"] == "approved" for r in result)
    any_rejected = any(r["status"] == "rejected" for r in result)
    all_uploaded = all(r["status"] != "not_uploaded" for r in result)
    
    return {
        "documents": result,
        "verification_status": "approved" if all_approved else "rejected" if any_rejected else "pending" if all_uploaded else "incomplete",
        "is_verified": all_approved,
    }


@router.post("/api/driver/documents/upload")
async def upload_driver_document(
    doc_type: str = Query(...),
    file: UploadFile = File(None),
    user: dict = Depends(get_current_user)
):
    """Upload via FormData"""
    if user["user_type"] != "driver":
        raise HTTPException(status_code=403, detail="Solo conductores")
    valid_types = [d["key"] for d in REQUIRED_DOCUMENTS] + ["selfie"]
    if doc_type not in valid_types:
        raise HTTPException(status_code=400, detail="Tipo inválido")
    if not file:
        raise HTTPException(status_code=400, detail="No se recibió archivo")
    import base64
    content = await file.read()
    b64 = base64.b64encode(content).decode("utf-8")
    mime = file.content_type or "image/jpeg"
    data_uri = f"data:{mime};base64,{b64}"
    return await _save_document(user, doc_type, data_uri)


@router.post("/api/driver/documents/upload-base64")
async def upload_driver_document_base64(
    data: dict = Body(...),
    user: dict = Depends(get_current_user)
):
    """Upload via JSON base64"""
    if user["user_type"] != "driver":
        raise HTTPException(status_code=403, detail="Solo conductores")
    doc_type = data.get("doc_type", "")
    file_base64 = data.get("file_base64", "")
    valid_types = [d["key"] for d in REQUIRED_DOCUMENTS] + ["selfie"]
    if doc_type not in valid_types:
        raise HTTPException(status_code=400, detail="Tipo inválido")
    if not file_base64:
        raise HTTPException(status_code=400, detail="No se recibió imagen")
    return await _save_document(user, doc_type, file_base64)


async def _save_document(user: dict, doc_type: str, data_uri: str):
    """Shared save logic for document uploads"""
    now = datetime.now(timezone.utc)
    doc_id = generate_id("doc_")
    
    if doc_type == "selfie":
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"profile_photo": data_uri, "updated_at": now}}
        )
        return {"status": "uploaded", "document_id": doc_id, "type": "selfie"}
    
    await db.driver_documents.update_one(
        {"driver_id": user["user_id"], "doc_type": doc_type},
        {"$set": {
            "document_id": doc_id, "driver_id": user["user_id"], "doc_type": doc_type,
            "file_data": data_uri, "file_name": f"{doc_type}.jpg",
            "status": "pending", "uploaded_at": now, "reject_reason": "",
        }},
        upsert=True
    )
    try:
        admins = await db.users.find({"user_type": "admin"}, {"user_id": 1}).to_list(10)
        for admin in admins:
            await manager.send_personal_message({
                "type": "new_document_upload", "driver_id": user["user_id"],
                "driver_name": user.get("name", "Conductor"), "doc_type": doc_type,
            }, admin["user_id"])
    except: pass
    return {"status": "uploaded", "document_id": doc_id}


@router.get("/api/driver/verification-status")
async def get_driver_verification_status(user: dict = Depends(get_current_user)):
    """Check if driver is fully verified"""
    if user["user_type"] != "driver":
        raise HTTPException(status_code=403, detail="Solo conductores")
    
    # First check if admin has directly verified this driver
    driver_rec = await db.drivers.find_one({"driver_id": user["user_id"]}, {"_id": 0})
    user_rec = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "is_verified": 1})
    
    admin_verified = (
        (driver_rec and driver_rec.get("documents_verified")) or
        (driver_rec and driver_rec.get("is_verified")) or
        (user_rec and user_rec.get("is_verified"))
    )
    
    if admin_verified:
        return {
            "is_verified": True,
            "status": "approved",
            "uploaded_count": len(REQUIRED_DOCUMENTS),
            "required_count": len(REQUIRED_DOCUMENTS),
        }
    
    # Otherwise check individual documents
    docs = await db.driver_documents.find(
        {"driver_id": user["user_id"]}, {"_id": 0, "file_data": 0}
    ).to_list(20)
    
    uploaded_types = {d["doc_type"] for d in docs}
    required_types = {d["key"] for d in REQUIRED_DOCUMENTS}
    
    all_uploaded = required_types.issubset(uploaded_types)
    all_approved = all_uploaded and all(d.get("status") == "approved" for d in docs if d["doc_type"] in required_types)
    any_rejected = any(d.get("status") == "rejected" for d in docs)
    
    return {
        "is_verified": all_approved,
        "status": "approved" if all_approved else "rejected" if any_rejected else "pending" if all_uploaded else "incomplete",
        "uploaded_count": len(uploaded_types & required_types),
        "required_count": len(required_types),
    }
