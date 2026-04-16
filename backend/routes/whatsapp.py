"""
WhatsApp Integration API - External endpoints for Wingman/WhatsApp Bot
These endpoints DO NOT modify any existing logic. They are a clean layer
that calls internal functions to provide ride services via WhatsApp.

Authentication: API Key via X-API-Key header
"""

import math
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Header, Body
from pydantic import BaseModel, Field
from typing import Optional, List

from database import db
from utils import generate_id, calculate_distance, calculate_fare, DEFAULT_FARES, DISPLAY_NAMES

router = APIRouter()

# ─── API Key Authentication ──────────────────────────────
async def verify_api_key(x_api_key: str = Header(..., alias="X-API-Key")):
    """Verify the WhatsApp integration API key"""
    settings = await db.settings.find_one({"setting_id": "global"}) or {}
    valid_key = settings.get("whatsapp_api_key", "moli-whatsapp-2025")
    if x_api_key != valid_key:
        raise HTTPException(status_code=401, detail="Invalid API Key")
    return True


# ─── Models ──────────────────────────────────────────────
class LocationInput(BaseModel):
    latitude: float
    longitude: float
    address: Optional[str] = ""

class EstimateInput(BaseModel):
    pickup: LocationInput
    dropoff: LocationInput

class RideRequestInput(BaseModel):
    phone: str = Field(..., description="WhatsApp phone number E.164 format")
    passenger_name: str = Field(..., description="Passenger display name")
    pickup: LocationInput
    dropoff: LocationInput
    vehicle_type: str = Field(default="economy", description="economy|moto|comfort|premium|xl")
    payment_method: str = Field(default="cash", description="cash|wallet|card")
    notes: Optional[str] = ""

class CancelInput(BaseModel):
    phone: str
    reason: Optional[str] = "Cancelado via WhatsApp"


# ─── 1. ESTIMATE: Get fare estimates ─────────────────────
@router.post("/api/whatsapp/estimate")
async def whatsapp_estimate(data: EstimateInput, x_api_key: str = Header(..., alias="X-API-Key")):
    """
    Get fare estimates for all vehicle types.
    No authentication required beyond API key.
    Returns prices, distance, and duration.
    """
    await verify_api_key(x_api_key)
    
    straight_distance = calculate_distance(
        data.pickup.latitude, data.pickup.longitude,
        data.dropoff.latitude, data.dropoff.longitude
    )
    ROAD_CORRECTION = 1.4
    distance_km = round(straight_distance * ROAD_CORRECTION, 2)
    avg_speed = 50 if distance_km > 15 else 30
    duration_min = max(5, int(math.ceil((distance_km / avg_speed) * 60)))
    
    fares = await db.fare_config.find({}, {"_id": 0}).to_list(20)
    if not fares:
        fares = [{"vehicle_type": k, **v} for k, v in DEFAULT_FARES.items()]
    
    estimates = []
    for fare in fares:
        price = fare.get("base_fare", 500) + (distance_km * fare.get("per_km", 150)) + (duration_min * fare.get("per_min", 50))
        min_fare = fare.get("min_fare", 0)
        price = max(price, min_fare)
        estimates.append({
            "vehicle_type": fare["vehicle_type"],
            "display_name": DISPLAY_NAMES.get(fare["vehicle_type"], fare["vehicle_type"].capitalize()),
            "price": round(price, 0),
            "currency": "ARS",
        })
    
    estimates.sort(key=lambda x: x["price"])
    
    return {
        "status": "ok",
        "distance_km": distance_km,
        "duration_min": duration_min,
        "estimates": estimates,
        "pickup_address": data.pickup.address,
        "dropoff_address": data.dropoff.address,
    }


# ─── 2. REQUEST RIDE: Create a ride from WhatsApp ────────
@router.post("/api/whatsapp/request-ride")
async def whatsapp_request_ride(data: RideRequestInput, x_api_key: str = Header(..., alias="X-API-Key")):
    """
    Create a ride request from WhatsApp.
    Creates or finds a rider user by phone number.
    Dispatches to nearby drivers using existing dispatch logic.
    """
    await verify_api_key(x_api_key)
    
    # Validate vehicle type
    valid_types = ["economy", "moto", "comfort", "premium", "xl"]
    if data.vehicle_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"vehicle_type must be one of: {valid_types}")
    
    # Find or create user by phone
    user = await db.users.find_one({"phone": data.phone})
    if not user:
        user_id = generate_id("user_")
        user = {
            "user_id": user_id,
            "name": data.passenger_name,
            "phone": data.phone,
            "email": f"wa_{data.phone}@whatsapp.local",
            "user_type": "rider",
            "source": "whatsapp",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.users.insert_one(user)
    
    rider_id = user["user_id"]
    
    # Calculate distance & fare
    straight_distance = calculate_distance(
        data.pickup.latitude, data.pickup.longitude,
        data.dropoff.latitude, data.dropoff.longitude
    )
    ROAD_CORRECTION = 1.4
    distance_km = round(straight_distance * ROAD_CORRECTION, 2)
    avg_speed = 50 if distance_km > 15 else 30
    duration_min = max(5, int(math.ceil((distance_km / avg_speed) * 60)))
    estimated_fare = await calculate_fare(distance_km, duration_min, data.vehicle_type)
    
    # Create ride request
    request_id = generate_id("req_")
    now = datetime.now(timezone.utc)
    
    request_doc = {
        "request_id": request_id,
        "rider_id": rider_id,
        "pickup_location": {
            "latitude": data.pickup.latitude,
            "longitude": data.pickup.longitude,
            "address": data.pickup.address,
        },
        "dropoff_location": {
            "latitude": data.dropoff.latitude,
            "longitude": data.dropoff.longitude,
            "address": data.dropoff.address,
        },
        "stops": [],
        "ride_type": "standard",
        "service_type": "ride",
        "vehicle_type": data.vehicle_type,
        "status": "pending",
        "estimated_fare": estimated_fare,
        "estimated_distance": distance_km,
        "estimated_duration": duration_min,
        "scheduled_time": None,
        "notes": data.notes or f"Viaje via WhatsApp - {data.passenger_name}",
        "payment_method": data.payment_method,
        "source": "whatsapp",
        "whatsapp_phone": data.phone,
        "bids": [],
        "created_at": now,
        "expires_at": now + timedelta(minutes=5),
    }
    
    await db.ride_requests.insert_one(request_doc)
    
    # Start dispatch (import here to avoid circular)
    from dispatch import assign_ride_to_drivers, assignment_tasks
    from utils import get_nearby_drivers
    import asyncio
    
    # Get nearby drivers for dispatch
    try:
        nearby = await get_nearby_drivers(
            data.pickup.latitude, data.pickup.longitude,
            radius_km=50,
            vehicle_type=data.vehicle_type
        )
        sorted_drivers = nearby.get("drivers", [])
    except Exception:
        sorted_drivers = []
    
    # Start automatic assignment in background (even with 0 drivers, loop will wait for new ones)
    task = asyncio.create_task(
        assign_ride_to_drivers(request_id, rider_id, sorted_drivers, request_doc)
    )
    assignment_tasks[request_id] = task
    
    return {
        "status": "ok",
        "request_id": request_id,
        "rider_id": rider_id,
        "estimated_fare": estimated_fare,
        "estimated_distance_km": distance_km,
        "estimated_duration_min": duration_min,
        "vehicle_type": data.vehicle_type,
        "message": f"Viaje solicitado. Buscando conductor {DISPLAY_NAMES.get(data.vehicle_type, 'Auto')}...",
    }


# ─── 3. RIDE STATUS: Check ride status ───────────────────
@router.get("/api/whatsapp/ride-status/{request_id}")
async def whatsapp_ride_status(request_id: str, x_api_key: str = Header(..., alias="X-API-Key")):
    """
    Get current status of a ride request or active ride.
    Returns driver info, ETA, fare, and current status.
    """
    await verify_api_key(x_api_key)
    
    # Check ride request first
    request = await db.ride_requests.find_one({"request_id": request_id}, {"_id": 0})
    
    # Check if there's an active ride from this request
    ride = await db.rides.find_one({"request_id": request_id}, {"_id": 0})
    
    if not ride and not request:
        raise HTTPException(status_code=404, detail="Viaje no encontrado")
    
    result = {
        "status": "ok",
        "request_id": request_id,
    }
    
    if ride:
        # Active ride exists
        driver = await db.users.find_one({"user_id": ride.get("driver_id")}, {"_id": 0, "name": 1, "phone": 1, "rating": 1})
        vehicle = await db.drivers.find_one({"driver_id": ride.get("driver_id")}, {"_id": 0, "vehicle_make": 1, "vehicle_model": 1, "vehicle_color": 1, "plate_number": 1})
        
        result["ride_id"] = ride.get("ride_id")
        result["ride_status"] = ride.get("status", "unknown")
        result["fare"] = ride.get("fare", ride.get("estimated_fare", 0))
        result["driver"] = {
            "name": driver.get("name", "Conductor") if driver else "Conductor",
            "phone": driver.get("phone", "") if driver else "",
            "rating": driver.get("rating", 5.0) if driver else 5.0,
            "vehicle": f"{vehicle.get('vehicle_color', '')} {vehicle.get('vehicle_make', '')} {vehicle.get('vehicle_model', '')}".strip() if vehicle else "",
            "plate": vehicle.get("plate_number", "") if vehicle else "",
        }
        
        # Driver location for ETA
        driver_loc = await db.drivers.find_one({"driver_id": ride.get("driver_id")}, {"current_location": 1})
        if driver_loc and driver_loc.get("current_location"):
            loc = driver_loc["current_location"]
            pickup = ride.get("pickup_location", {})
            if pickup:
                dist = calculate_distance(loc.get("latitude", 0), loc.get("longitude", 0), pickup.get("latitude", 0), pickup.get("longitude", 0))
                eta_min = max(1, int(math.ceil((dist * 1.4 / 30) * 60)))
                result["driver"]["eta_min"] = eta_min
                result["driver"]["current_location"] = {"latitude": loc.get("latitude"), "longitude": loc.get("longitude")}
    
    elif request:
        # Still searching for driver
        result["request_status"] = request.get("status", "pending")
        result["estimated_fare"] = request.get("estimated_fare", 0)
        result["estimated_distance_km"] = request.get("estimated_distance", 0)
        result["estimated_duration_min"] = request.get("estimated_duration", 0)
        result["vehicle_type"] = request.get("vehicle_type", "economy")
        
        if request.get("status") == "expired":
            result["message"] = "No se encontró conductor disponible. Intentá de nuevo."
        elif request.get("status") == "cancelled":
            result["message"] = "Viaje cancelado."
        else:
            result["message"] = "Buscando conductor..."
    
    return result


# ─── 4. CANCEL RIDE: Cancel from WhatsApp ─────────────────
@router.post("/api/whatsapp/cancel/{request_id}")
async def whatsapp_cancel_ride(request_id: str, data: CancelInput, x_api_key: str = Header(..., alias="X-API-Key")):
    """
    Cancel a ride request or active ride.
    """
    await verify_api_key(x_api_key)
    
    # Try cancelling ride request
    req = await db.ride_requests.find_one({"request_id": request_id})
    if req and req.get("status") == "pending":
        await db.ride_requests.update_one(
            {"request_id": request_id},
            {"$set": {"status": "cancelled", "cancel_reason": data.reason}}
        )
        return {"status": "ok", "message": "Solicitud cancelada."}
    
    # Try cancelling active ride
    ride = await db.rides.find_one({"request_id": request_id})
    if ride and ride.get("status") in ["accepted", "arrived", "in_progress"]:
        await db.rides.update_one(
            {"ride_id": ride["ride_id"]},
            {"$set": {"status": "cancelled", "cancel_reason": data.reason, "cancelled_at": datetime.now(timezone.utc).isoformat()}}
        )
        return {"status": "ok", "message": "Viaje cancelado.", "ride_id": ride["ride_id"]}
    
    raise HTTPException(status_code=400, detail="No se puede cancelar este viaje (ya finalizado o no encontrado)")


# ─── 5. RIDES BY PHONE: Get rides for a phone number ──────
@router.get("/api/whatsapp/rides-by-phone/{phone}")
async def whatsapp_rides_by_phone(phone: str, x_api_key: str = Header(..., alias="X-API-Key")):
    """
    Get active/recent rides for a WhatsApp phone number.
    Useful to check if there's an ongoing ride.
    """
    await verify_api_key(x_api_key)
    
    user = await db.users.find_one({"phone": phone})
    if not user:
        return {"status": "ok", "rides": [], "active_request": None}
    
    rider_id = user["user_id"]
    
    # Check active ride
    active_ride = await db.rides.find_one(
        {"rider_id": rider_id, "status": {"$in": ["accepted", "arrived", "in_progress"]}},
        {"_id": 0}
    )
    
    # Check pending request
    active_request = await db.ride_requests.find_one(
        {"rider_id": rider_id, "status": "pending"},
        {"_id": 0}
    )
    
    # Recent completed rides (last 5)
    recent = await db.rides.find(
        {"rider_id": rider_id, "status": "completed"},
        {"_id": 0, "ride_id": 1, "fare": 1, "created_at": 1, "pickup_location": 1, "dropoff_location": 1}
    ).sort("created_at", -1).limit(5).to_list(5)
    
    result = {"status": "ok", "rider_id": rider_id}
    
    if active_ride:
        result["active_ride"] = {
            "ride_id": active_ride.get("ride_id"),
            "request_id": active_ride.get("request_id"),
            "status": active_ride.get("status"),
            "fare": active_ride.get("fare", active_ride.get("estimated_fare", 0)),
        }
    
    if active_request:
        result["active_request"] = {
            "request_id": active_request.get("request_id"),
            "status": active_request.get("status"),
            "estimated_fare": active_request.get("estimated_fare", 0),
        }
    
    result["recent_rides"] = recent
    
    return result


# ─── 6. GEOCODE: Convert address text to coordinates ──────
@router.get("/api/whatsapp/geocode")
async def whatsapp_geocode(address: str, x_api_key: str = Header(..., alias="X-API-Key")):
    """
    Geocode an address to coordinates.
    Uses the existing places search logic.
    """
    await verify_api_key(x_api_key)
    
    import httpx
    
    # Use Nominatim for geocoding
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={"q": address, "format": "json", "limit": 3, "countrycodes": "ar"},
                headers={"User-Agent": "MoliApp/1.0"},
                timeout=10
            )
            results = resp.json()
            
            if not results:
                return {"status": "ok", "results": [], "message": "No se encontró la dirección"}
            
            places = []
            for r in results:
                places.append({
                    "latitude": float(r["lat"]),
                    "longitude": float(r["lon"]),
                    "address": r.get("display_name", address),
                })
            
            return {"status": "ok", "results": places}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error geocoding: {str(e)}")


# ─── 7. WEBHOOK CONFIG: Get/Set WhatsApp API key ─────────
@router.get("/api/whatsapp/config")
async def whatsapp_get_config(x_api_key: str = Header(..., alias="X-API-Key")):
    """Get WhatsApp integration config (for admin/debugging)"""
    await verify_api_key(x_api_key)
    settings = await db.settings.find_one({"setting_id": "global"}) or {}
    return {
        "status": "ok",
        "broadcast_enabled": settings.get("broadcast_enabled", True),
        "broadcast_after_rounds": settings.get("broadcast_after_rounds", 3),
        "whatsapp_api_key": "***configured***",
    }
