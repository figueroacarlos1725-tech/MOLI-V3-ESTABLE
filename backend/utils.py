"""
Shared utility functions for Moli API
"""
import os
import uuid
import math
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict
from fastapi import Header, HTTPException
from passlib.context import CryptContext
from jose import JWTError, jwt
from database import db

# JWT Configuration
SECRET_KEY = os.getenv("SECRET_KEY", "taxiride-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def generate_id(prefix: str = "") -> str:
    return f"{prefix}{uuid.uuid4().hex[:12]}"


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        token = authorization.replace("Bearer ", "")
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def get_settings() -> dict:
    settings = await db.settings.find_one({"setting_id": "global"}, {"_id": 0})
    if not settings:
        settings = {
            "setting_id": "global",
            "map_provider": "google",
            "base_fare": 2.50,
            "per_km_rate": 1.20,
            "per_minute_rate": 0.15,
            "commission_rate": 0.20,
            "currency": "USD",
            "currency_symbol": "$",
            "cancel_free_minutes": 1,
            "rider_cancel_penalty": 500,
            "driver_cancel_penalty": 500,
            "driver_max_negative_balance": -15000,
            "driver_block_after_cancels": 3,
            "driver_block_hours": 24,
            "rider_max_pending_penalties": 2,
        }
        await db.settings.insert_one(settings)
    defaults = {
        "cancel_free_minutes": 1,
        "rider_cancel_penalty": 500,
        "driver_cancel_penalty": 500,
        "driver_max_negative_balance": -15000,
        "driver_block_after_cancels": 3,
        "driver_block_hours": 24,
        "rider_max_pending_penalties": 2,
    }
    for k, v in defaults.items():
        if k not in settings:
            settings[k] = v
    return settings


def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance in km using Haversine formula"""
    R = 6371
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)
    a = math.sin(delta_lat/2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c


async def calculate_fare(distance_km: float, duration_min: int, vehicle_type: str) -> float:
    settings = await get_settings()
    base_fare = settings.get("base_fare", 2.50)
    per_km = settings.get("per_km_rate", 1.20)
    per_min = settings.get("per_minute_rate", 0.15)
    multipliers = {
        "economy": 1.0,
        "comfort": 1.3,
        "premium": 1.8,
        "xl": 1.5
    }
    multiplier = multipliers.get(vehicle_type, 1.0)
    fare = (base_fare + (distance_km * per_km) + (duration_min * per_min)) * multiplier
    return round(fare, 2)


async def get_nearby_drivers(lat: float, lng: float, radius_km: float = 50, vehicle_type: str = None) -> dict:
    """Find nearby available drivers"""
    query = {"is_online": True, "current_location": {"$exists": True}}
    if vehicle_type:
        pipeline_vtype = [
            {"$match": query},
            {"$lookup": {
                "from": "vehicles",
                "localField": "driver_id",
                "foreignField": "driver_id",
                "as": "vehicle"
            }},
            {"$match": {"vehicle.vehicle_type": vehicle_type}}
        ]
    
    drivers = await db.drivers.find(query, {"_id": 0}).to_list(100)
    nearby = []
    for d in drivers:
        loc = d.get("current_location", {})
        dlat = loc.get("latitude", 0)
        dlng = loc.get("longitude", 0)
        dist = calculate_distance(lat, lng, dlat, dlng)
        if dist <= radius_km:
            # Check if driver has vehicle of required type
            if vehicle_type:
                vehicle = await db.vehicles.find_one(
                    {"driver_id": d["driver_id"], "vehicle_type": vehicle_type, "is_active": True},
                    {"_id": 0}
                )
                if not vehicle:
                    continue
            d["distance_km"] = round(dist, 2)
            nearby.append(d)
    
    nearby.sort(key=lambda x: x.get("distance_km", 999))
    return {"drivers": nearby, "count": len(nearby)}


# ─── Shared constants ───────────────────────────────────────

DEFAULT_FARES = {
    "economy": {"base_fare": 500, "per_km": 150, "per_min": 50, "min_fare": 800, "multiplier": 1.0},
    "comfort": {"base_fare": 700, "per_km": 200, "per_min": 70, "min_fare": 1200, "multiplier": 1.3},
    "premium": {"base_fare": 1000, "per_km": 300, "per_min": 100, "min_fare": 1800, "multiplier": 1.8},
    "xl": {"base_fare": 800, "per_km": 250, "per_min": 80, "min_fare": 1500, "multiplier": 1.5},
}

DISPLAY_NAMES = {
    "economy": "Económico",
    "comfort": "Confort",
    "premium": "Premium",
    "xl": "XL",
}

REQUIRED_DOCUMENTS = [
    {"key": "license", "label": "Licencia de conducir", "description": "Foto legible de tu licencia vigente"},
    {"key": "id_front", "label": "DNI frente", "description": "Foto del frente de tu documento de identidad"},
    {"key": "id_back", "label": "DNI dorso", "description": "Foto del dorso de tu documento de identidad"},
    {"key": "vehicle_registration", "label": "Tarjeta de circulación", "description": "Registro del vehículo"},
    {"key": "insurance", "label": "Seguro del vehículo", "description": "Póliza de seguro vigente"},
    {"key": "criminal_record", "label": "Antecedentes penales", "description": "Certificado de antecedentes penales"},
]

async def adjust_wallet_balance(user_id: str, delta: float) -> float:
    """Atomically adjust wallet balance in BOTH users.wallet_balance and user_balances.amount.
    Returns the new balance after adjustment.
    """
    # Update users.wallet_balance
    await db.users.update_one(
        {"user_id": user_id},
        {"$inc": {"wallet_balance": delta}}
    )
    # Also update user_balances.amount (secondary source)
    await db.user_balances.update_one(
        {"user_id": user_id},
        {"$inc": {"amount": delta}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )
    # Return the new balance
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "wallet_balance": 1})
    return user.get("wallet_balance", 0.0) if user else 0.0


async def set_wallet_balance(user_id: str, new_amount: float) -> float:
    """Set wallet balance to an absolute value in BOTH collections.
    Returns the new balance.
    """
    now_str = datetime.now(timezone.utc).isoformat()
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"wallet_balance": new_amount}}
    )
    await db.user_balances.update_one(
        {"user_id": user_id},
        {"$set": {"amount": new_amount, "updated_at": now_str}},
        upsert=True
    )
    return new_amount


def normalize_commission_rate(rate) -> float:
    """Normalize commission rate: if > 1, treat as percentage (e.g., 15 → 0.15).
    If <= 1, treat as decimal (e.g., 0.15 → 0.15).
    """
    if rate is None:
        return 0.20
    rate = float(rate)
    if rate > 1:
        return rate / 100.0
    return rate


SUPPORT_SYSTEM_PROMPT = """Eres el asistente de soporte de Molí (Move Libre), una app de transporte tipo Uber.
Tu trabajo es ayudar a pasajeros y conductores con sus problemas.
Responde SIEMPRE en español. Sé amable, breve y directo.
Si NO puedes resolver el problema (temas de pagos reales, accidentes, quejas graves, problemas técnicos complejos),
responde EXACTAMENTE con el texto: [ESCALAR_AGENTE] al final de tu mensaje para que un agente humano atienda.
Problemas comunes que SÍ puedes resolver: cómo usar la app, cómo solicitar viaje, cómo funciona el pago, preguntas sobre tarifas, cómo contactar conductor."""
