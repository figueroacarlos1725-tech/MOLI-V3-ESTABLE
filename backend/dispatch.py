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


# Track active assignment tasks and driver response events
assignment_events: Dict[str, asyncio.Event] = {}  # request_id -> Event (set when driver responds)
assignment_tasks: Dict[str, asyncio.Task] = {}  # request_id -> Task

# Default dispatch settings (overridden by DB config)
DEFAULT_ACCEPT_SECONDS = 8
DEFAULT_MAX_BEFORE_ASK = 10


async def get_dispatch_config():
    """Get configurable dispatch settings from DB"""
    settings = await get_settings()
    return {
        "accept_seconds": settings.get("driver_accept_seconds", DEFAULT_ACCEPT_SECONDS),
        "max_before_ask": settings.get("max_dispatch_attempts", DEFAULT_MAX_BEFORE_ASK),
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
    total_attempts = 0

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
                    result = await get_nearby_drivers(
                        pickup.get("latitude", 0), pickup.get("longitude", 0),
                        radius_km=50,
                        vehicle_type=request_doc.get("vehicle_type")
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
                offer_msg = {
                    "type": "ride_offer",
                    "request_id": request_id,
                    "countdown": accept_seconds,
                    "pickup": request_doc.get("pickup_location", {}),
                    "dropoff": request_doc.get("dropoff_location", {}),
                    "fare": request_doc.get("estimated_fare", 0),
                    "distance_km": request_doc.get("estimated_distance", 0),
                    "duration_min": request_doc.get("estimated_duration", 0),
                    "vehicle_type": request_doc.get("vehicle_type", "economy"),
                    "rider_name": "Pasajero",
                }
                await manager.send_personal_message(offer_msg, driver_id)

                # Notify rider
                await manager.send_personal_message({
                    "type": "searching_driver",
                    "request_id": request_id,
                    "driver_index": total_attempts,
                    "total_drivers": max(len(fresh_drivers), total_attempts),
                    "message": f"Ofreciendo viaje a conductor {total_attempts}..."
                }, rider_id)

                # Wait for configurable seconds for response
                event.clear()
                try:
                    await asyncio.wait_for(event.wait(), timeout=float(accept_seconds))
                except asyncio.TimeoutError:
                    pass

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
