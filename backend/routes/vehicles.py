"""Vehicle routes"""
from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone

from database import db
from utils import generate_id, get_current_user, DEFAULT_VEHICLE_ICONS
from models import VehicleCreate, VehicleResponse

router = APIRouter()


@router.post("/api/vehicles", response_model=VehicleResponse)
async def register_vehicle(vehicle: VehicleCreate, user: dict = Depends(get_current_user)):
    if user["user_type"] != "driver":
        raise HTTPException(status_code=403, detail="Only drivers can register vehicles")
    
    vehicle_id = generate_id("veh_")
    vehicle_doc = {
        "vehicle_id": vehicle_id,
        "driver_id": user["user_id"],
        "make": vehicle.make,
        "model": vehicle.model,
        "year": vehicle.year,
        "color": vehicle.color,
        "plate_number": vehicle.plate_number,
        "vehicle_type": vehicle.vehicle_type,
        "capacity": vehicle.capacity,
        "is_active": True,
        "documents_verified": False,
        "created_at": datetime.now(timezone.utc)
    }
    
    await db.vehicles.insert_one(vehicle_doc)
    return VehicleResponse(**{k: v for k, v in vehicle_doc.items() if k != "_id"})


@router.get("/api/vehicles")
async def get_my_vehicles(user: dict = Depends(get_current_user)):
    if user["user_type"] != "driver":
        raise HTTPException(status_code=403, detail="Only drivers can view vehicles")
    
    vehicles = await db.vehicles.find(
        {"driver_id": user["user_id"]}, {"_id": 0}
    ).to_list(10)
    return {"vehicles": vehicles}


@router.get("/api/vehicle-icons")
async def get_vehicle_icons_public():
    """Public endpoint - get vehicle icons for map rendering"""
    icons = await db.vehicle_icons.find({}, {"_id": 0}).to_list(20)
    if not icons:
        # Seed defaults
        for icon in DEFAULT_VEHICLE_ICONS:
            icon["updated_at"] = datetime.now(timezone.utc).isoformat()
            await db.vehicle_icons.update_one(
                {"vehicle_type": icon["vehicle_type"]},
                {"$set": icon},
                upsert=True
            )
        icons = DEFAULT_VEHICLE_ICONS
    return {"icons": icons}
