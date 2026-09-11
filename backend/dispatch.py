"""Competitive, proximity-ranked ride dispatch."""
import asyncio
from typing import Dict
from datetime import datetime, timezone

from database import db
from websocket_manager import manager
from utils import get_nearby_drivers, get_settings
from notifications import notify_new_ride_offer

assignment_events: Dict[str, asyncio.Event] = {}
assignment_tasks: Dict[str, asyncio.Task] = {}
REVIEW_SECONDS = 35
COHORT_SIZE = 50


async def get_dispatch_config():
    """Public/admin-compatible view of the competitive dispatch settings."""
    settings = await get_settings()
    return {
        "accept_seconds": REVIEW_SECONDS,
        "max_before_ask": settings.get("max_dispatch_attempts", 15),
        "broadcast_enabled": True,
        "broadcast_after_rounds": 0,
        "cohort_size": COHORT_SIZE,
    }


async def assign_ride_to_drivers(request_id: str, rider_id: str, sorted_drivers: list, request_doc: dict):
    """Broadcast to all nearby compatible drivers while preserving exact-location privacy."""
    event = asyncio.Event()
    assignment_events[request_id] = event
    notified: set[str] = set()
    try:
        while True:
            current = await db.ride_requests.find_one({"request_id": request_id}, {"_id": 0})
            if not current or current.get("status") in ("accepted", "cancelled", "completed", "expired"):
                return
            expires_at = current.get("expires_at")
            if isinstance(expires_at, str):
                expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            if isinstance(expires_at, datetime) and expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if expires_at and datetime.now(timezone.utc) > expires_at:
                await db.ride_requests.update_one({"request_id": request_id}, {"$set": {"status": "expired"}})
                await manager.send_personal_message({"type": "no_drivers_available", "request_id": request_id,
                    "message": "No se encontraron conductores disponibles. Intentá nuevamente."}, rider_id)
                return

            pickup = current.get("pickup_location", {})
            result = await get_nearby_drivers(float(pickup.get("latitude", 0)), float(pickup.get("longitude", 0)),
                radius_km=50, vehicle_type=current.get("vehicle_type"))
            excluded = set(current.get("excluded_drivers", [])) | set(current.get("declined_driver_ids", []))
            drivers = [driver for driver in (result.get("drivers") or sorted_drivers or []) if driver.get("driver_id") not in excluded][:COHORT_SIZE]
            candidate_ids = [d["driver_id"] for d in drivers]
            await db.ride_requests.update_one({"request_id": request_id}, {"$set": {"candidate_driver_ids": candidate_ids}})
            for driver in drivers:
                driver_id = driver["driver_id"]
                if driver_id in notified:
                    continue
                notified.add(driver_id)
                dropoff = current.get("dropoff_location") or {}
                offer = {"type": "ride_offer", "request_id": request_id, "countdown": REVIEW_SECONDS,
                    "requires_review": True,
                    "pickup": {"latitude": round(float(pickup.get("latitude", 0)), 2), "longitude": round(float(pickup.get("longitude", 0)), 2)},
                    "dropoff": {"latitude": round(float(dropoff.get("latitude", 0)), 2), "longitude": round(float(dropoff.get("longitude", 0)), 2)} if dropoff else None,
                    "fare": current.get("estimated_fare", 0), "distance_km": current.get("estimated_distance", 0),
                    "duration_min": current.get("estimated_duration", 0), "vehicle_type": current.get("vehicle_type", "economy"),
                    "service_type": current.get("service_type", "ride"), "rider_name": "Pasajero", "is_taximeter": not bool(dropoff)}
                await manager.send_personal_message(offer, driver_id)
                try:
                    await notify_new_ride_offer(driver_id, "Recogida en tu zona", current.get("estimated_fare", 0), request_id)
                except Exception:
                    pass
            await manager.send_personal_message({"type": "searching_driver", "request_id": request_id,
                "total_drivers": len(candidate_ids), "message": f"Buscando entre {len(candidate_ids)} conductores cercanos..."}, rider_id)
            event.clear()
            try:
                await asyncio.wait_for(event.wait(), timeout=5)
            except asyncio.TimeoutError:
                pass
    except Exception as exc:
        print(f"Assignment error for {request_id}: {exc}")
    finally:
        assignment_events.pop(request_id, None)
        assignment_tasks.pop(request_id, None)
