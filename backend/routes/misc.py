"""Misc routes: health, config, banners, premium, websocket"""
from fastapi import APIRouter, HTTPException, Depends, Query, WebSocket, WebSocketDisconnect
from typing import Optional
from datetime import datetime, timezone
import os

from database import db
from websocket_manager import manager
from utils import get_current_user, get_settings, DEFAULT_FARES
from dispatch import get_dispatch_config

router = APIRouter()


@router.get("/api/rides")
async def get_rides(
    status: Optional[str] = None,
    limit: int = 20,
    user: dict = Depends(get_current_user)
):
    query = {}
    
    if user["user_type"] == "rider":
        query["rider_id"] = user["user_id"]
    elif user["user_type"] == "driver":
        query["driver_id"] = user["user_id"]
    
    if status:
        query["status"] = status
    
    rides = await db.rides.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return {"rides": rides}


@router.get("/api/fares")
async def get_fares_public():
    """Public endpoint for fare display"""
    fares = await db.fare_config.find({}, {"_id": 0}).to_list(20)
    if not fares:
        for vtype, config in DEFAULT_FARES.items():
            fare = {"vehicle_type": vtype, **config, "dynamic_pricing": False, "night_surcharge": 0, "day_surcharge": 0}
            fares.append(fare)
    return {"fares": fares}

    return {"fares": fares}


@router.get("/api/banners")
async def get_active_banners():
    """Public endpoint - returns active banners for rider app"""
    banners = await db.banners.find({"is_active": True}, {"_id": 0}).sort("position", 1).to_list(10)
    return {"banners": banners}


@router.post("/api/user/premium/toggle")
async def toggle_premium(user: dict = Depends(get_current_user)):
    """Toggle Molí+ premium status"""
    current = user.get("is_premium", False)
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"is_premium": not current}}
    )
    return {"is_premium": not current, "message": "Molí+ activado" if not current else "Molí+ desactivado"}


@router.get("/api/user/premium/status")
async def get_premium_status(user: dict = Depends(get_current_user)):
    return {"is_premium": user.get("is_premium", False)}


@router.websocket("/api/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    await manager.connect(websocket, user_id)
    try:
        while True:
            data = await websocket.receive_json()
            
            # Handle different message types
            msg_type = data.get("type")
            
            if msg_type == "location_update":
                # Driver location update
                await db.drivers.update_one(
                    {"driver_id": user_id},
                    {"$set": {
                        "current_location": {
                            "latitude": data.get("latitude"),
                            "longitude": data.get("longitude"),
                            "updated_at": datetime.now(timezone.utc)
                        }
                    }}
                )
                
                # If driver has active ride, notify rider
                active_ride = await db.rides.find_one({
                    "driver_id": user_id,
                    "status": {"$in": ["accepted", "arrived", "started"]}
                }, {"_id": 0})
                
                if active_ride:
                    await manager.send_personal_message(
                        {
                            "type": "driver_location",
                            "latitude": data.get("latitude"),
                            "longitude": data.get("longitude")
                        },
                        active_ride["rider_id"]
                    )
            
            elif msg_type == "ping":
                # Keep-alive ping, respond with pong
                try:
                    await websocket.send_json({"type": "pong"})
                except Exception:
                    pass
            
            elif msg_type == "chat_message":
                # Real-time chat
                await manager.send_personal_message(
                    {
                        "type": "new_message",
                        "message": data.get("message"),
                        "sender_id": user_id
                    },
                    data.get("receiver_id")
                )
    
    except WebSocketDisconnect:
        manager.disconnect(user_id)
        # DO NOT mark driver offline on WebSocket disconnect
        # K8s proxy drops connections frequently - driver manages online state explicitly
        # Only update last_seen timestamp
        await db.drivers.update_one(
            {"driver_id": user_id},
            {"$set": {"last_seen": datetime.now(timezone.utc)}}
        )
    except Exception:
        manager.disconnect(user_id)


@router.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": "1.0.0"
    }


@router.get("/api/config/dispatch")
async def get_dispatch_config_endpoint():
    """Get dispatch configuration"""
    config = await get_dispatch_config()
    return config


@router.get("/api/banners")
async def get_banners_for_user(target: str = Query("both"), user: dict = Depends(get_current_user)):
    """Get random active banners for rider or driver"""
    pipeline = [
        {"$match": {"active": True, "target": {"$in": [target, "both"]}}},
        {"$sample": {"size": 3}},
        {"$project": {"_id": 0}}
    ]
    banners = await db.banners.aggregate(pipeline).to_list(3)
    for b in banners:
        if isinstance(b.get("created_at"), datetime):
            b["created_at"] = b["created_at"].isoformat()
    return {"banners": banners}


@router.get("/api/config/maps")
async def get_maps_config():
    """Get map configuration for frontend"""
    settings = await get_settings()
    
    config = {
        "provider": settings.get("map_provider", "osm"),
        "google_key": os.getenv("GOOGLE_MAPS_KEY", "") if settings.get("map_provider") == "google" else "",
        "osm": {
            "tile_url": "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
            "attribution": "© OpenStreetMap contributors"
        }
    }
    
    if os.getenv("GOOGLE_MAPS_KEY"):
        config["google_available"] = True
    if os.getenv("MAPBOX_TOKEN") or settings.get("mapbox_key"):
        config["mapbox_available"] = True
    
    return config


@router.get("/api/app/version-check")
async def version_check(current_version: str = "1.0.0"):
    """Check if app version is acceptable. Admin can set min_version in settings."""
    settings = await get_settings()
    min_version = settings.get("min_app_version", "1.0.0")
    update_message = settings.get("update_message", "Hay una nueva versión disponible con mejoras importantes.")
    
    # Compare versions
    def parse_ver(v):
        try:
            return tuple(int(x) for x in v.split('.'))
        except:
            return (0, 0, 0)
    
    current = parse_ver(current_version)
    minimum = parse_ver(min_version)
    force_update = current < minimum
    
    return {
        "force_update": force_update,
        "min_version": min_version,
        "current_version": current_version,
        "message": update_message if force_update else "",
    }
