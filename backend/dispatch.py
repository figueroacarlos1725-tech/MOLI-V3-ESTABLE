"""
Ride Assignment / Dispatch System
Background task that offers rides to drivers in sequence until one accepts.
"""
import asyncio
from typing import Dict
from datetime import datetime, timezone

from database import db
from websocket_manager import manager
from utils import get_settings, get_nearby_drivers
from notifications import notify_new_ride_offer


# Track active assignment tasks and driver response events
assignment_events: Dict[str, asyncio.Event] = {}  # request_id -> Event (set when driver responds)
assignment_tasks: Dict[str, asyncio.Task] = {}  # request_id -> Task

# Default dispatch settings (overridden by DB config)
DEFAULT_ACCEPT_SECONDS = 8
DEFAULT_MAX_BEFORE_ASK = 15


async def get_dispatch_config():
    """Get configurable dispatch settings from DB"""
    settings = await get_settings()
    return {
        "accept_seconds": settings.get("driver_accept_seconds", DEFAULT_ACCEPT_SECONDS),
        "max_before_ask": settings.get("max_dispatch_attempts", DEFAULT_MAX_BEFORE_ASK),
        "broadcast_enabled": settings.get("broadcast_enabled", True),
        "broadcast_after_rounds": settings.get("broadcast_after_rounds", 3),
    }


async def assign_ride_to_drivers(request_id: str, rider_id: str, sorted_drivers: list, request_doc: dict):
    """Background task: offer ride to drivers in loop until one accepts or rider cancels.
    After configurable attempts without acceptance, asks rider if they want to continue."""
    event = asyncio.Event()
    assignment_events[request_id] = event

    # Get configurable settings
    dispatch_config = await get_dispatch_config()
    accept_seconds = dispatch_config["accept_seconds"]
    MAX_BEFORE_ASK = dispatch_config["max_before_ask"]
    broadcast_enabled = dispatch_config["broadcast_enabled"]
    broadcast_after = dispatch_config["broadcast_after_rounds"]
    total_attempts = 0
    broadcast_mode = broadcast_enabled and broadcast_after == 0  # Start in broadcast if 0 rounds

    try:
        while True:
            # Check if request has expired (5 min timeout)
            req_check_exp = await db.ride_requests.find_one({"request_id": request_id}, {"_id": 0})
            if req_check_exp:
                expires_at = req_check_exp.get("expires_at")
                if expires_at:
                    # Ensure expires_at is timezone-aware
                    if isinstance(expires_at, str):
                        expires_at = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
                    elif expires_at.tzinfo is None:
                        expires_at = expires_at.replace(tzinfo=timezone.utc)

                    if datetime.now(timezone.utc) > expires_at:
                        await db.ride_requests.update_one(
                            {"request_id": request_id},
                            {"$set": {"status": "expired"}}
                        )
                        await manager.send_personal_message({
                            "type": "no_drivers_available",
                            "request_id": request_id,
                            "message": "No se encontraron conductores disponibles. Intenta de nuevo."
                        }, rider_id)
                        return

            # Re-fetch available drivers each round (they may come online)
            fresh_drivers = sorted_drivers if total_attempts == 0 else None
            if total_attempts > 0 or not sorted_drivers or len(sorted_drivers) == 0:
                try:
                    pickup = request_doc.get("pickup_location", {})
                    # Check if broadcast mode should activate
                    if broadcast_enabled and not broadcast_mode and broadcast_after > 0 and total_attempts >= broadcast_after:
                        broadcast_mode = True
                        await manager.send_personal_message({
                            "type": "searching_driver",
                            "request_id": request_id,
                            "driver_index": total_attempts,
                            "total_drivers": 0,
                            "message": "Modo auxilio: buscando todos los conductores disponibles..."
                        }, rider_id)
                    
                    result = await get_nearby_drivers(
                        pickup.get("latitude", 0), pickup.get("longitude", 0),
                        radius_km=50,
                        vehicle_type=request_doc.get("vehicle_type"),
                        ignore_driver_radius=broadcast_mode
                    )
                    fresh_drivers = result.get("drivers", [])
                except Exception:
                    fresh_drivers = sorted_drivers or []

            if not fresh_drivers or len(fresh_drivers) == 0:
                # No drivers available yet - notify rider and wait before retrying
                await manager.send_personal_message({
                    "type": "searching_driver",
                    "request_id": request_id,
                    "driver_index": 0,
                    "total_drivers": 0,
                    "message": "Buscando conductores disponibles..."
                }, rider_id)
                await asyncio.sleep(5)  # Wait 5 seconds before checking again
                # Re-check if cancelled
                req_recheck = await db.ride_requests.find_one({"request_id": request_id}, {"_id": 0})
                if not req_recheck or req_recheck.get("status") in ("accepted", "cancelled", "completed", "expired"):
                    return
                continue  # Try fetching drivers again

            for i, driver in enumerate(fresh_drivers):
                # Check if request was cancelled by rider
                req_check = await db.ride_requests.find_one({"request_id": request_id}, {"_id": 0})
                if not req_check or req_check.get("status") in ("accepted", "cancelled", "completed"):
                    return

                driver_id = driver["driver_id"]
                total_attempts += 1
                now = datetime.now(timezone.utc)
                driver_user = await db.users.find_one(
                    {"user_id": driver_id},
                    {"_id": 0, "name": 1, "profile_picture": 1},
                ) or {}
                driver_vehicle = await db.vehicles.find_one(
                    {"driver_id": driver_id, "is_active": True},
                    {"_id": 0, "vehicle_type": 1, "make": 1, "model": 1},
                ) or {}

                # Mark current offer
                await db.ride_requests.update_one(
                    {"request_id": request_id},
                    {"$set": {
                        "current_offer_driver": driver_id,
                        "offer_index": total_attempts,
                        "offer_sent_at": now,
                    }}
                )

                # Send offer to driver via WebSocket
                # SECURITY: Only send approximate location, not exact addresses
                pickup_loc = request_doc.get("pickup_location", {})
                dropoff_loc = request_doc.get("dropoff_location") or {}
                offer_msg = {
                    "type": "ride_offer",
                    "request_id": request_id,
                    "countdown": accept_seconds,
                    "pickup": {
                        "latitude": round(float(pickup_loc.get("latitude", 0)), 2),
                        "longitude": round(float(pickup_loc.get("longitude", 0)), 2),
                    },
                    "dropoff": {
                        "latitude": round(float(dropoff_loc.get("latitude", 0)), 2) if dropoff_loc else 0,
                        "longitude": round(float(dropoff_loc.get("longitude", 0)), 2) if dropoff_loc else 0,
                    } if dropoff_loc else None,
                    "fare": request_doc.get("estimated_fare", 0),
                    "distance_km": request_doc.get("estimated_distance", 0),
                    "duration_min": request_doc.get("estimated_duration", 0),
                    "vehicle_type": request_doc.get("vehicle_type", "economy"),
                    "service_type": request_doc.get("service_type", "ride"),
                    "rider_name": "Pasajero",
                    "is_taximeter": dropoff_loc is None or not dropoff_loc,
                }
                await manager.send_personal_message(offer_msg, driver_id)

                # Send PUSH NOTIFICATION to driver (works even if app is in background)
                try:
                    pickup_addr = "Recogida en tu zona"
                    fare_amount = request_doc.get("estimated_fare", 0)
                    svc = request_doc.get("service_type", "ride")
                    push_title = "📦 ¡Nuevo envío!" if svc == "delivery" else "🚗 ¡Nuevo viaje!"
                    push_body = f"${fare_amount:,.0f} · {pickup_addr[:50]}"
                    await notify_new_ride_offer(driver_id, pickup_addr, fare_amount, request_id)
                except Exception as push_err:
                    print(f"Push notification error: {push_err}")

                # Notify rider
                await manager.send_personal_message({
                    "type": "driver_reviewing",
                    "request_id": request_id,
                    "driver_name": (driver_user.get("name") or "Un conductor").split(" ")[0],
                    "driver_photo": driver_user.get("profile_picture"),
                    "vehicle_type": driver_vehicle.get("vehicle_type") or request_doc.get("vehicle_type"),
                    "vehicle_label": " ".join(filter(None, [driver_vehicle.get("make"), driver_vehicle.get("model")])),
                    "countdown": accept_seconds,
                    "message": f"{(driver_user.get('name') or 'Un conductor').split(' ')[0]} está viendo tu viaje"
                }, rider_id)

                # Wait for configurable seconds for response
                event.clear()
                try:
                    await asyncio.wait_for(event.wait(), timeout=float(accept_seconds))
                except asyncio.TimeoutError:
                    await manager.send_personal_message({
                        "type": "driver_review_ended",
                        "request_id": request_id,
                        "message": "Buscando otro conductor...",
                    }, rider_id)

                # Check result
                updated = await db.ride_requests.find_one({"request_id": request_id}, {"_id": 0})
                if not updated:
                    return

                if updated.get("status") == "accepted":
                    # Success! Notify rider
                    ride = await db.rides.find_one({"request_id": request_id}, {"_id": 0})
                    if ride:
                        ride_data = {}
                        for k, v in ride.items():
                            if isinstance(v, datetime):
                                ride_data[k] = v.isoformat()
                            elif isinstance(v, dict):
                                ride_data[k] = {kk: (vv.isoformat() if isinstance(vv, datetime) else vv) for kk, vv in v.items()}
                            else:
                                ride_data[k] = v
                        driver_info = await db.users.find_one({"user_id": ride["driver_id"]}, {"_id": 0, "password_hash": 0})
                        # Serialize driver_info datetime fields
                        if driver_info:
                            driver_data = {}
                            for k, v in driver_info.items():
                                if isinstance(v, datetime):
                                    driver_data[k] = v.isoformat()
                                else:
                                    driver_data[k] = v
                        else:
                            driver_data = None
                        await manager.send_personal_message({
                            "type": "ride_accepted",
                            "ride": ride_data,
                            "driver": driver_data
                        }, rider_id)
                    return  # Done!

                if updated.get("status") in ("cancelled", "completed"):
                    return  # Rider cancelled

                # Tell driver their offer expired
                await manager.send_personal_message({
                    "type": "ride_offer_expired",
                    "request_id": request_id,
                }, driver_id)

                # After MAX_BEFORE_ASK attempts, notify rider it's taking long
                if total_attempts == MAX_BEFORE_ASK:
                    await manager.send_personal_message({
                        "type": "search_taking_long",
                        "request_id": request_id,
                        "attempts": total_attempts,
                        "message": "Está tardando más de lo normal en conseguir conductor. ¿Deseas seguir buscando?"
                    }, rider_id)

            # Finished one round of all drivers - small pause before retrying
            await asyncio.sleep(2)

            # Re-check request status
            req_final = await db.ride_requests.find_one({"request_id": request_id}, {"_id": 0})
            if not req_final or req_final.get("status") in ("accepted", "cancelled", "completed"):
                return

    except Exception as e:
        print(f"Assignment error for {request_id}: {e}")
        import traceback
        traceback.print_exc()
    finally:
        assignment_events.pop(request_id, None)
        assignment_tasks.pop(request_id, None)
