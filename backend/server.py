"""
TaxiRide Clone - Complete Backend API
Full taxi booking system with rider, driver, and admin functionality
"""

from fastapi import FastAPI, HTTPException, Depends, Query, Header, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone, timedelta
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient
import os
import uuid
import json
import asyncio
from dotenv import load_dotenv
from passlib.context import CryptContext
from jose import JWTError, jwt
import httpx

load_dotenv()

# JWT Configuration
SECRET_KEY = os.getenv("SECRET_KEY", "taxiride-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

app = FastAPI(title="TaxiRide API", version="1.0.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# MongoDB
MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "test_database")
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# WebSocket connections manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.user_rooms: Dict[str, List[str]] = {}
    
    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        self.active_connections[user_id] = websocket
    
    def disconnect(self, user_id: str):
        if user_id in self.active_connections:
            del self.active_connections[user_id]
    
    async def send_personal_message(self, message: dict, user_id: str):
        if user_id in self.active_connections:
            await self.active_connections[user_id].send_json(message)
    
    async def broadcast_to_drivers(self, message: dict, driver_ids: List[str]):
        for driver_id in driver_ids:
            if driver_id in self.active_connections:
                await self.active_connections[driver_id].send_json(message)

manager = ConnectionManager()

# ======================= RIDE ASSIGNMENT SYSTEM =======================

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
            # Re-fetch available drivers each round (they may come online)
            fresh_drivers = sorted_drivers if total_attempts == 0 else None
            if total_attempts > 0:
                try:
                    pickup = request_doc.get("pickup_location", {})
                    result = await get_nearby_drivers(
                        pickup.get("latitude", 0), pickup.get("longitude", 0),
                        radius_km=50,
                        vehicle_type=request_doc.get("vehicle_type")
                    )
                    fresh_drivers = result.get("drivers", [])
                except Exception:
                    fresh_drivers = sorted_drivers
            
            if not fresh_drivers or len(fresh_drivers) == 0:
                fresh_drivers = sorted_drivers  # fallback to original list
            
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
    finally:
        assignment_events.pop(request_id, None)
        assignment_tasks.pop(request_id, None)
        assignment_tasks.pop(request_id, None)

# ======================= PYDANTIC MODELS =======================

class UserBase(BaseModel):
    email: EmailStr
    name: str
    phone: Optional[str] = None
    profile_picture: Optional[str] = None

class UserCreate(UserBase):
    password: str
    user_type: str = "rider"  # rider, driver, admin, dispatcher

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    user_id: str
    email: str
    name: str
    phone: Optional[str] = None
    profile_picture: Optional[str] = None
    user_type: str
    wallet_balance: float = 0.0
    rating: float = 5.0
    is_verified: bool = False
    created_at: datetime

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class VehicleCreate(BaseModel):
    make: str
    model: str
    year: int
    color: str
    plate_number: str
    vehicle_type: str  # economy, comfort, premium, xl
    capacity: int = 4

class VehicleResponse(BaseModel):
    vehicle_id: str
    driver_id: str
    make: str
    model: str
    year: int
    color: str
    plate_number: str
    vehicle_type: str
    capacity: int
    is_active: bool = True
    documents_verified: bool = False

class LocationPoint(BaseModel):
    latitude: float
    longitude: float
    address: Optional[str] = None

class RideRequestCreate(BaseModel):
    pickup_location: LocationPoint
    dropoff_location: LocationPoint
    stops: Optional[List[LocationPoint]] = None  # Up to 4 intermediate stops
    ride_type: str = "standard"  # standard, scheduled, parcel, freight, rental
    vehicle_type: str = "economy"
    scheduled_time: Optional[datetime] = None
    notes: Optional[str] = None
    payment_method: str = "cash"  # cash, wallet, card

class RideRequestResponse(BaseModel):
    request_id: str
    rider_id: str
    pickup_location: dict
    dropoff_location: dict
    stops: Optional[List[dict]] = None
    ride_type: str
    vehicle_type: str
    status: str  # pending, bidding, accepted, in_progress, completed, cancelled
    estimated_fare: float
    estimated_distance: float
    estimated_duration: int
    created_at: datetime
    bids: List[dict] = []

class BidCreate(BaseModel):
    request_id: str
    fare_amount: float
    estimated_arrival: int  # minutes

class BidResponse(BaseModel):
    bid_id: str
    request_id: str
    driver_id: str
    driver_name: str
    driver_rating: float
    vehicle_info: dict
    fare_amount: float
    estimated_arrival: int
    created_at: datetime

class ChatMessageCreate(BaseModel):
    receiver_id: str
    message: str
    message_type: str = "text"  # text, image, location, system

class ChatMessageResponse(BaseModel):
    message_id: str
    sender_id: str
    receiver_id: str
    message: str
    message_type: str
    is_read: bool = False
    created_at: datetime

class SupportTicketCreate(BaseModel):
    subject: str
    message: str
    ride_id: Optional[str] = None

class WalletTransactionCreate(BaseModel):
    amount: float
    transaction_type: str  # deposit, withdrawal, payment, refund
    payment_method: str  # mercadopago, astropay, cash
    description: Optional[str] = None

class CouponCreate(BaseModel):
    code: str
    discount_type: str  # percentage, fixed
    discount_value: float
    min_order_amount: float = 0
    max_uses: int = 100
    expires_at: datetime

class SettingsUpdate(BaseModel):
    google_maps_key: Optional[str] = None
    mapbox_key: Optional[str] = None
    mercadopago_public_key: Optional[str] = None
    mercadopago_access_token: Optional[str] = None
    astropay_api_key: Optional[str] = None
    astropay_secret_key: Optional[str] = None
    firebase_config: Optional[dict] = None
    base_fare: Optional[float] = None
    per_km_rate: Optional[float] = None
    per_minute_rate: Optional[float] = None
    commission_rate: Optional[float] = None
    # Cancellation & Wallet settings
    cancel_free_minutes: Optional[int] = None
    rider_cancel_penalty: Optional[float] = None
    driver_cancel_penalty: Optional[float] = None
    driver_max_negative_balance: Optional[float] = None
    driver_block_after_cancels: Optional[int] = None
    driver_block_hours: Optional[int] = None  # 0 = permanent
    rider_max_pending_penalties: Optional[int] = None

# ======================= HELPER FUNCTIONS =======================

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
        # Default settings
        settings = {
            "setting_id": "global",
            "map_provider": "google",  # osm, google, mapbox
            "base_fare": 2.50,
            "per_km_rate": 1.20,
            "per_minute_rate": 0.15,
            "commission_rate": 0.20,
            "currency": "USD",
            "currency_symbol": "$",
            # Cancellation & Wallet defaults
            "cancel_free_minutes": 1,
            "rider_cancel_penalty": 500,
            "driver_cancel_penalty": 500,
            "driver_max_negative_balance": -15000,
            "driver_block_after_cancels": 3,
            "driver_block_hours": 24,
            "rider_max_pending_penalties": 2,
        }
        await db.settings.insert_one(settings)
    # Ensure cancellation defaults exist even if settings were created before
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
    import math
    R = 6371  # Earth's radius in km
    
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
    
    # Vehicle type multipliers
    multipliers = {
        "economy": 1.0,
        "comfort": 1.3,
        "premium": 1.8,
        "xl": 1.5
    }
    
    multiplier = multipliers.get(vehicle_type, 1.0)
    fare = (base_fare + (distance_km * per_km) + (duration_min * per_min)) * multiplier
    return round(fare, 2)

# ======================= AUTH ENDPOINTS =======================

@app.post("/api/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    # Check if user exists
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = generate_id("user_")
    now = datetime.now(timezone.utc)
    
    user_doc = {
        "user_id": user_id,
        "email": user_data.email,
        "name": user_data.name,
        "phone": user_data.phone,
        "profile_picture": user_data.profile_picture,
        "password_hash": hash_password(user_data.password),
        "user_type": user_data.user_type,
        "wallet_balance": 0.0,
        "rating": 5.0,
        "total_rides": 0,
        "is_verified": False,
        "is_active": True,
        "created_at": now,
        "updated_at": now
    }
    
    await db.users.insert_one(user_doc)
    
    # If driver, create driver profile
    if user_data.user_type == "driver":
        driver_doc = {
            "driver_id": user_id,
            "user_id": user_id,
            "is_online": False,
            "is_available": False,
            "current_location": None,
            "total_earnings": 0.0,
            "completed_rides": 0,
            "acceptance_rate": 100.0,
            "documents_verified": False,
            "subscription_plan": "free",
            "subscription_expires": None,
            "created_at": now
        }
        await db.drivers.insert_one(driver_doc)
    
    token = create_access_token({"sub": user_id})
    
    user_response = UserResponse(
        user_id=user_id,
        email=user_data.email,
        name=user_data.name,
        phone=user_data.phone,
        profile_picture=user_data.profile_picture,
        user_type=user_data.user_type,
        wallet_balance=0.0,
        rating=5.0,
        is_verified=False,
        created_at=now
    )
    
    return TokenResponse(access_token=token, user=user_response)

@app.post("/api/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if not verify_password(credentials.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_access_token({"sub": user["user_id"]})
    
    user_response = UserResponse(
        user_id=user["user_id"],
        email=user["email"],
        name=user["name"],
        phone=user.get("phone"),
        profile_picture=user.get("profile_picture"),
        user_type=user["user_type"],
        wallet_balance=user.get("wallet_balance", 0.0),
        rating=user.get("rating", 5.0),
        is_verified=user.get("is_verified", False),
        created_at=user["created_at"]
    )
    
    return TokenResponse(access_token=token, user=user_response)

@app.post("/api/auth/social-login")
async def social_login(session_id: str = Header(..., alias="X-Session-ID")):
    """Handle Emergent Google OAuth callback"""
    try:
        async with httpx.AsyncClient() as client_http:
            response = await client_http.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": session_id}
            )
            
            if response.status_code != 200:
                raise HTTPException(status_code=401, detail="Invalid session")
            
            oauth_data = response.json()
            email = oauth_data.get("email")
            name = oauth_data.get("name")
            picture = oauth_data.get("picture")
            
            # Check if user exists
            user = await db.users.find_one({"email": email}, {"_id": 0})
            
            if not user:
                # Create new user
                user_id = generate_id("user_")
                now = datetime.now(timezone.utc)
                
                user = {
                    "user_id": user_id,
                    "email": email,
                    "name": name,
                    "profile_picture": picture,
                    "user_type": "rider",
                    "wallet_balance": 0.0,
                    "rating": 5.0,
                    "is_verified": True,
                    "is_active": True,
                    "created_at": now,
                    "updated_at": now
                }
                await db.users.insert_one(user)
            
            token = create_access_token({"sub": user["user_id"]})
            
            user_response = UserResponse(
                user_id=user["user_id"],
                email=user["email"],
                name=user["name"],
                phone=user.get("phone"),
                profile_picture=user.get("profile_picture"),
                user_type=user["user_type"],
                wallet_balance=user.get("wallet_balance", 0.0),
                rating=user.get("rating", 5.0),
                is_verified=user.get("is_verified", False),
                created_at=user["created_at"]
            )
            
            return TokenResponse(access_token=token, user=user_response)
            
    except httpx.HTTPError as e:
        raise HTTPException(status_code=500, detail=f"OAuth error: {str(e)}")

@app.get("/api/auth/me", response_model=UserResponse)
async def get_me(user: dict = Depends(get_current_user)):
    return UserResponse(
        user_id=user["user_id"],
        email=user["email"],
        name=user["name"],
        phone=user.get("phone"),
        profile_picture=user.get("profile_picture"),
        user_type=user["user_type"],
        wallet_balance=user.get("wallet_balance", 0.0),
        rating=user.get("rating", 5.0),
        is_verified=user.get("is_verified", False),
        created_at=user["created_at"]
    )

# ======================= USER ENDPOINTS =======================

@app.put("/api/users/profile")
async def update_profile(
    name: Optional[str] = None,
    phone: Optional[str] = None,
    profile_picture: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    update_data = {"updated_at": datetime.now(timezone.utc)}
    if name:
        update_data["name"] = name
    if phone:
        update_data["phone"] = phone
    if profile_picture:
        update_data["profile_picture"] = profile_picture
    
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": update_data})
    return {"status": "success", "message": "Profile updated"}

@app.get("/api/users/saved-locations")
async def get_saved_locations(user: dict = Depends(get_current_user)):
    locations = await db.saved_locations.find(
        {"user_id": user["user_id"]}, {"_id": 0}
    ).to_list(100)
    return {"locations": locations}

@app.post("/api/users/saved-locations")
async def save_location(
    name: str,
    location: LocationPoint,
    location_type: str = "other",  # home, work, other
    user: dict = Depends(get_current_user)
):
    location_doc = {
        "location_id": generate_id("loc_"),
        "user_id": user["user_id"],
        "name": name,
        "location_type": location_type,
        "latitude": location.latitude,
        "longitude": location.longitude,
        "address": location.address,
        "created_at": datetime.now(timezone.utc)
    }
    await db.saved_locations.insert_one(location_doc)
    return {"status": "success", "location_id": location_doc["location_id"]}

# ======================= VEHICLE ENDPOINTS =======================

@app.post("/api/vehicles", response_model=VehicleResponse)
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

@app.get("/api/vehicles")
async def get_my_vehicles(user: dict = Depends(get_current_user)):
    if user["user_type"] != "driver":
        raise HTTPException(status_code=403, detail="Only drivers can view vehicles")
    
    vehicles = await db.vehicles.find(
        {"driver_id": user["user_id"]}, {"_id": 0}
    ).to_list(10)
    return {"vehicles": vehicles}

# ======================= DRIVER ENDPOINTS =======================

@app.put("/api/drivers/availability")
async def update_availability(
    is_online: bool,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    user: dict = Depends(get_current_user)
):
    if user["user_type"] != "driver":
        raise HTTPException(status_code=403, detail="Only drivers can update availability")
    
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
    return {"status": "success", "is_online": is_online}

@app.put("/api/drivers/location")
async def update_location(
    latitude: float,
    longitude: float,
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
            }
        }}
    )
    return {"status": "success"}

@app.get("/api/drivers/nearby")
async def get_nearby_drivers(
    latitude: float,
    longitude: float,
    radius_km: float = 5.0,
    vehicle_type: Optional[str] = None
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

@app.get("/api/drivers/earnings")
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
    
    rides = await db.rides.find({
        "driver_id": user["user_id"],
        "status": "completed",
        "completed_at": {"$gte": start_date}
    }, {"_id": 0}).to_list(1000)
    
    total_earnings = sum(r.get("driver_earnings", 0) for r in rides)
    total_rides = len(rides)
    
    return {
        "period": period,
        "total_earnings": round(total_earnings, 2),
        "total_rides": total_rides,
        "average_per_ride": round(total_earnings / total_rides, 2) if total_rides > 0 else 0
    }

# ======================= RIDE ENDPOINTS =======================

@app.post("/api/rides/request", response_model=RideRequestResponse)
async def create_ride_request(request: RideRequestCreate, user: dict = Depends(get_current_user)):
    if user["user_type"] not in ["rider", "admin"]:
        raise HTTPException(status_code=403, detail="Only riders can request rides")
    
    # Calculate total distance including intermediate stops
    total_distance_km = 0.0
    waypoints = []
    
    if request.stops and len(request.stops) > 0:
        # Build full route: pickup -> stop1 -> stop2 -> ... -> dropoff
        all_points = [request.pickup_location] + request.stops + [request.dropoff_location]
        for i in range(len(all_points) - 1):
            seg_dist = calculate_distance(
                all_points[i].latitude, all_points[i].longitude,
                all_points[i+1].latitude, all_points[i+1].longitude
            )
            total_distance_km += seg_dist
        waypoints = [s.model_dump() for s in request.stops]
    else:
        total_distance_km = calculate_distance(
            request.pickup_location.latitude, request.pickup_location.longitude,
            request.dropoff_location.latitude, request.dropoff_location.longitude
        )
    
    distance_km = total_distance_km
    
    # Estimate duration (average 30 km/h in city)
    duration_min = int((distance_km / 30) * 60)
    if duration_min < 5:
        duration_min = 5
    
    estimated_fare = await calculate_fare(distance_km, duration_min, request.vehicle_type)
    
    request_id = generate_id("req_")
    now = datetime.now(timezone.utc)
    
    request_doc = {
        "request_id": request_id,
        "rider_id": user["user_id"],
        "pickup_location": request.pickup_location.model_dump(),
        "dropoff_location": request.dropoff_location.model_dump(),
        "stops": waypoints,
        "ride_type": request.ride_type,
        "vehicle_type": request.vehicle_type,
        "status": "pending",
        "estimated_fare": estimated_fare,
        "estimated_distance": round(distance_km, 2),
        "estimated_duration": duration_min,
        "scheduled_time": request.scheduled_time,
        "notes": request.notes,
        "payment_method": request.payment_method,
        "bids": [],
        "created_at": now,
        "expires_at": now + timedelta(minutes=5)
    }
    
    await db.ride_requests.insert_one(request_doc)
    
    # Get nearby drivers sorted by distance (closest first)
    nearby = await get_nearby_drivers(
        request.pickup_location.latitude,
        request.pickup_location.longitude,
        radius_km=15.0,
        vehicle_type=request.vehicle_type
    )
    
    sorted_drivers = nearby.get("drivers", [])
    
    # Start automatic assignment in background
    if sorted_drivers:
        task = asyncio.create_task(
            assign_ride_to_drivers(request_id, user["user_id"], sorted_drivers, request_doc)
        )
        assignment_tasks[request_id] = task
    
    return RideRequestResponse(
        request_id=request_id,
        rider_id=user["user_id"],
        pickup_location=request.pickup_location.model_dump(),
        dropoff_location=request.dropoff_location.model_dump(),
        stops=waypoints if waypoints else None,
        ride_type=request.ride_type,
        vehicle_type=request.vehicle_type,
        status="pending",
        estimated_fare=estimated_fare,
        estimated_distance=round(distance_km, 2),
        estimated_duration=duration_min,
        created_at=now,
        bids=[]
    )

@app.post("/api/rides/bid", response_model=BidResponse)
async def submit_bid(bid: BidCreate, user: dict = Depends(get_current_user)):
    if user["user_type"] != "driver":
        raise HTTPException(status_code=403, detail="Only drivers can submit bids")
    
    # Get request
    request = await db.ride_requests.find_one({"request_id": bid.request_id}, {"_id": 0})
    if not request:
        raise HTTPException(status_code=404, detail="Ride request not found")
    
    if request["status"] not in ["pending", "bidding"]:
        raise HTTPException(status_code=400, detail="Request is no longer accepting bids")
    
    # Get driver's vehicle
    vehicle = await db.vehicles.find_one(
        {"driver_id": user["user_id"], "is_active": True},
        {"_id": 0}
    )
    if not vehicle:
        raise HTTPException(status_code=400, detail="No active vehicle found")
    
    bid_id = generate_id("bid_")
    now = datetime.now(timezone.utc)
    
    bid_doc = {
        "bid_id": bid_id,
        "request_id": bid.request_id,
        "driver_id": user["user_id"],
        "driver_name": user["name"],
        "driver_rating": user.get("rating", 5.0),
        "vehicle_info": {
            "vehicle_id": vehicle["vehicle_id"],
            "make": vehicle["make"],
            "model": vehicle["model"],
            "color": vehicle["color"],
            "plate_number": vehicle["plate_number"],
            "vehicle_type": vehicle["vehicle_type"]
        },
        "fare_amount": bid.fare_amount,
        "estimated_arrival": bid.estimated_arrival,
        "status": "pending",
        "created_at": now
    }
    
    await db.bids.insert_one(bid_doc)
    
    # Update request status to bidding
    await db.ride_requests.update_one(
        {"request_id": bid.request_id},
        {
            "$set": {"status": "bidding"},
            "$push": {"bids": bid_doc}
        }
    )
    
    # Notify rider
    await manager.send_personal_message(
        {"type": "new_bid", "bid": {k: v for k, v in bid_doc.items() if k != "_id"}},
        request["rider_id"]
    )
    
    return BidResponse(
        bid_id=bid_id,
        request_id=bid.request_id,
        driver_id=user["user_id"],
        driver_name=user["name"],
        driver_rating=user.get("rating", 5.0),
        vehicle_info=bid_doc["vehicle_info"],
        fare_amount=bid.fare_amount,
        estimated_arrival=bid.estimated_arrival,
        created_at=now
    )


@app.post("/api/rides/request/{request_id}/cancel")
async def cancel_ride_request(request_id: str, user: dict = Depends(get_current_user)):
    """Rider cancels a pending ride request - stops the dispatch loop"""
    request_doc = await db.ride_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not request_doc:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    
    if request_doc.get("rider_id") != user["user_id"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    
    await db.ride_requests.update_one(
        {"request_id": request_id},
        {"$set": {"status": "cancelled", "current_offer_driver": None}}
    )
    
    # Signal the assignment event so background task stops
    if request_id in assignment_events:
        assignment_events[request_id].set()
    
    return {"status": "cancelled", "message": "Búsqueda cancelada"}


@app.post("/api/rides/{request_id}/driver-response")
async def driver_respond_to_offer(
    request_id: str,
    action: str = Query(..., description="accept or reject"),
    user: dict = Depends(get_current_user)
):
    """Driver accepts or rejects an automatic dispatch offer"""
    if user["user_type"] != "driver":
        raise HTTPException(status_code=403, detail="Solo conductores pueden responder ofertas")
    
    request_doc = await db.ride_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not request_doc:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    
    if request_doc.get("status") not in ["pending", "bidding"]:
        raise HTTPException(status_code=400, detail="Esta solicitud ya no está disponible")
    
    # Verify this driver is the one being offered
    if request_doc.get("current_offer_driver") != user["user_id"]:
        raise HTTPException(status_code=400, detail="Esta oferta no está asignada a ti")
    
    if action == "accept":
        # Create ride (similar to accept_bid logic)
        ride_id = generate_id("ride_")
        now = datetime.now(timezone.utc)
        
        settings = await get_settings()
        fare = request_doc.get("estimated_fare", 0)
        commission = fare * settings.get("commission_rate", 0.20)
        driver_earnings = fare - commission
        
        # Get driver vehicle
        vehicle = await db.vehicles.find_one(
            {"driver_id": user["user_id"], "is_active": True},
            {"_id": 0}
        )
        
        ride_doc = {
            "ride_id": ride_id,
            "request_id": request_id,
            "rider_id": request_doc["rider_id"],
            "driver_id": user["user_id"],
            "pickup_location": request_doc["pickup_location"],
            "dropoff_location": request_doc["dropoff_location"],
            "ride_type": request_doc.get("ride_type", "standard"),
            "vehicle_type": request_doc.get("vehicle_type", "economy"),
            "status": "accepted",
            "fare": fare,
            "commission": round(commission, 2),
            "driver_earnings": round(driver_earnings, 2),
            "payment_method": request_doc.get("payment_method", "cash"),
            "payment_status": "pending",
            "driver_location": None,
            "vehicle_info": {
                "make": vehicle.get("make", "") if vehicle else "",
                "model": vehicle.get("model", "") if vehicle else "",
                "color": vehicle.get("color", "") if vehicle else "",
                "plate_number": vehicle.get("plate_number", "") if vehicle else "",
                "vehicle_type": vehicle.get("vehicle_type", "economy") if vehicle else "economy",
            } if vehicle else None,
            "accepted_at": now,
            "started_at": None,
            "completed_at": None,
            "cancelled_at": None,
            "created_at": now
        }
        
        await db.rides.insert_one(ride_doc)
        
        # Update request status
        await db.ride_requests.update_one(
            {"request_id": request_id},
            {"$set": {"status": "accepted", "accepted_by": user["user_id"]}}
        )
        
        # Mark driver unavailable
        await db.drivers.update_one(
            {"driver_id": user["user_id"]},
            {"$set": {"is_available": False}}
        )
        
        # Signal the assignment event so the background task knows
        if request_id in assignment_events:
            assignment_events[request_id].set()
        
        # ALSO directly notify rider via WebSocket (don't rely only on background task)
        rider_id = request_doc["rider_id"]
        try:
            ride_data = {k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in ride_doc.items() if k != "_id"}
            await manager.send_personal_message({
                "type": "ride_accepted",
                "ride": ride_data,
                "driver": {
                    "user_id": user["user_id"],
                    "name": user.get("name", "Conductor"),
                    "phone": user.get("phone"),
                    "rating": user.get("rating", 5.0),
                }
            }, rider_id)
        except Exception as e:
            print(f"Could not notify rider {rider_id} via WS: {e}")
        
        # Build response with driver/vehicle info
        driver_info = {
            "user_id": user["user_id"],
            "name": user.get("name", "Conductor"),
            "phone": user.get("phone"),
            "rating": user.get("rating", 5.0),
        }
        
        ride_response = {k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in ride_doc.items() if k != "_id"}
        ride_response["driver_info"] = driver_info
        
        return {
            "status": "accepted",
            "ride_id": ride_id,
            "ride": ride_response
        }
    
    elif action == "reject":
        # Signal event so background task moves to the next driver
        if request_id in assignment_events:
            assignment_events[request_id].set()
        
        return {"status": "rejected", "message": "Oferta rechazada, se notificará al siguiente conductor"}
    
    else:
        raise HTTPException(status_code=400, detail="Acción inválida. Usa 'accept' o 'reject'")


@app.post("/api/rides/accept-bid/{bid_id}")
async def accept_bid(bid_id: str, user: dict = Depends(get_current_user)):
    bid = await db.bids.find_one({"bid_id": bid_id}, {"_id": 0})
    if not bid:
        raise HTTPException(status_code=404, detail="Bid not found")
    
    request = await db.ride_requests.find_one({"request_id": bid["request_id"]}, {"_id": 0})
    if not request:
        raise HTTPException(status_code=404, detail="Ride request not found")
    
    if request["rider_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Create ride
    ride_id = generate_id("ride_")
    now = datetime.now(timezone.utc)
    
    settings = await get_settings()
    commission = bid["fare_amount"] * settings.get("commission_rate", 0.20)
    driver_earnings = bid["fare_amount"] - commission
    
    ride_doc = {
        "ride_id": ride_id,
        "request_id": request["request_id"],
        "rider_id": request["rider_id"],
        "driver_id": bid["driver_id"],
        "pickup_location": request["pickup_location"],
        "dropoff_location": request["dropoff_location"],
        "ride_type": request["ride_type"],
        "vehicle_type": request["vehicle_type"],
        "status": "accepted",
        "fare": bid["fare_amount"],
        "commission": round(commission, 2),
        "driver_earnings": round(driver_earnings, 2),
        "payment_method": request["payment_method"],
        "payment_status": "pending",
        "driver_location": None,
        "accepted_at": now,
        "started_at": None,
        "completed_at": None,
        "cancelled_at": None,
        "created_at": now
    }
    
    await db.rides.insert_one(ride_doc)
    
    # Update request and bid status
    await db.ride_requests.update_one(
        {"request_id": request["request_id"]},
        {"$set": {"status": "accepted"}}
    )
    await db.bids.update_one(
        {"bid_id": bid_id},
        {"$set": {"status": "accepted"}}
    )
    
    # Reject other bids
    await db.bids.update_many(
        {"request_id": request["request_id"], "bid_id": {"$ne": bid_id}},
        {"$set": {"status": "rejected"}}
    )
    
    # Update driver availability
    await db.drivers.update_one(
        {"driver_id": bid["driver_id"]},
        {"$set": {"is_available": False}}
    )
    
    # Notify driver
    await manager.send_personal_message(
        {"type": "bid_accepted", "ride": {k: v for k, v in ride_doc.items() if k != "_id"}},
        bid["driver_id"]
    )
    
    return {"status": "success", "ride_id": ride_id, "ride": {
        "ride_id": ride_id,
        "request_id": request["request_id"],
        "rider_id": request["rider_id"],
        "driver_id": bid["driver_id"],
        "pickup_location": request["pickup_location"],
        "dropoff_location": request["dropoff_location"],
        "ride_type": request["ride_type"],
        "vehicle_type": request["vehicle_type"],
        "status": "accepted",
        "fare": bid["fare_amount"],
        "commission": round(commission, 2),
        "driver_earnings": round(driver_earnings, 2),
        "payment_method": request["payment_method"],
        "payment_status": "pending",
        "accepted_at": now.isoformat(),
        "created_at": now.isoformat()
    }}

@app.put("/api/rides/{ride_id}/status")
async def update_ride_status(
    ride_id: str,
    status: str,  # arrived, started, completed, cancelled
    user: dict = Depends(get_current_user)
):
    ride = await db.rides.find_one({"ride_id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    
    # Check authorization
    if user["user_id"] not in [ride["rider_id"], ride["driver_id"]]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    now = datetime.now(timezone.utc)
    update_data = {"status": status, "updated_at": now}
    penalty_info = None
    
    if status == "started":
        update_data["started_at"] = now
    elif status == "completed":
        update_data["completed_at"] = now
        update_data["payment_status"] = "completed"
        
        # Check if rider has pending penalties -> add to fare
        settings = await get_settings()
        pending_penalties = await db.cancellation_records.find(
            {"user_id": ride["rider_id"], "status": "pending"}
        ).to_list(10)
        
        total_penalty = sum(p.get("penalty_amount", 0) for p in pending_penalties)
        if total_penalty > 0:
            # Add penalty to fare
            new_fare = ride.get("fare", 0) + total_penalty
            new_commission = new_fare * settings.get("commission_rate", 0.20)
            new_driver_earnings = new_fare - new_commission
            update_data["fare"] = round(new_fare, 2)
            update_data["commission"] = round(new_commission, 2)
            update_data["driver_earnings"] = round(new_driver_earnings, 2)
            update_data["penalty_surcharge"] = round(total_penalty, 2)
            
            # Mark penalties as paid
            for p in pending_penalties:
                await db.cancellation_records.update_one(
                    {"record_id": p["record_id"]},
                    {"$set": {"status": "collected", "collected_ride_id": ride_id, "collected_at": now}}
                )
            
            # Update rider wallet (clear the negative from penalties)
            await db.users.update_one(
                {"user_id": ride["rider_id"]},
                {"$inc": {"wallet_balance": total_penalty}}
            )
            
            # Record rider wallet transaction
            await db.wallet_transactions.insert_one({
                "transaction_id": generate_id("txn_"),
                "user_id": ride["rider_id"],
                "amount": total_penalty,
                "transaction_type": "penalty_collection",
                "description": f"Multas pendientes cobradas en viaje {ride_id}",
                "ride_id": ride_id,
                "status": "completed",
                "created_at": now,
            })
        
        # Determine payment method
        payment_method = ride.get("payment_method", "cash")
        final_fare = update_data.get("fare", ride.get("fare", 0))
        commission_rate = settings.get("commission_rate", 0.20)
        final_commission = round(final_fare * commission_rate, 2)
        final_driver_earnings = round(final_fare - final_commission, 2)
        update_data["commission"] = final_commission
        update_data["driver_earnings"] = final_driver_earnings
        
        if payment_method == "cash":
            # CASH: Driver collected full fare from rider physically
            # Driver OWES the system the commission → wallet goes NEGATIVE by commission
            await db.users.update_one(
                {"user_id": ride["driver_id"]},
                {"$inc": {"wallet_balance": -final_commission}}
            )
            await db.wallet_transactions.insert_one({
                "transaction_id": generate_id("txn_"),
                "user_id": ride["driver_id"],
                "amount": -final_commission,
                "transaction_type": "commission_debit",
                "description": f"Comisión por viaje (efectivo) - debes ${final_commission} al sistema",
                "ride_id": ride_id,
                "status": "completed",
                "created_at": now,
            })
        else:
            # CARD: System collected the money → Driver gets earnings credited
            await db.users.update_one(
                {"user_id": ride["driver_id"]},
                {"$inc": {"wallet_balance": final_driver_earnings}}
            )
            await db.wallet_transactions.insert_one({
                "transaction_id": generate_id("txn_"),
                "user_id": ride["driver_id"],
                "amount": final_driver_earnings,
                "transaction_type": "ride_earnings",
                "description": f"Ganancia del viaje (tarjeta) - ${final_driver_earnings}",
                "ride_id": ride_id,
                "status": "completed",
                "created_at": now,
            })
        
        # Update driver stats
        await db.drivers.update_one(
            {"driver_id": ride["driver_id"]},
            {
                "$set": {"is_available": True},
                "$inc": {
                    "completed_rides": 1,
                    "total_earnings": final_driver_earnings
                }
            }
        )
        
        # Check if driver wallet hit max negative after commission
        driver_user = await db.users.find_one({"user_id": ride["driver_id"]})
        max_neg = settings.get("driver_max_negative_balance", -15000)
        if driver_user and driver_user.get("wallet_balance", 0) <= max_neg:
            await db.drivers.update_one(
                {"driver_id": ride["driver_id"]},
                {"$set": {
                    "is_blocked": True,
                    "block_reason": "negative_balance",
                    "blocked_at": now,
                    "blocked_until": None,
                    "is_available": False,
                    "is_online": False,
                }}
            )
        
        # Update user stats
        await db.users.update_one(
            {"user_id": ride["rider_id"]},
            {"$inc": {"total_rides": 1}}
        )
        await db.users.update_one(
            {"user_id": ride["driver_id"]},
            {"$inc": {"total_rides": 1}}
        )
        
    elif status == "cancelled":
        update_data["cancelled_at"] = now
        update_data["cancelled_by"] = user["user_id"]
        
        # Make driver available again
        await db.drivers.update_one(
            {"driver_id": ride["driver_id"]},
            {"$set": {"is_available": True}}
        )
        
        # Check if cancellation is within free window
        settings = await get_settings()
        free_minutes = settings.get("cancel_free_minutes", 1)
        accepted_at = ride.get("accepted_at")
        
        is_free_cancel = False
        if accepted_at:
            if isinstance(accepted_at, str):
                accepted_at = datetime.fromisoformat(accepted_at.replace("Z", "+00:00"))
            # Ensure both datetimes are timezone-aware
            if accepted_at.tzinfo is None:
                accepted_at = accepted_at.replace(tzinfo=timezone.utc)
            elapsed = (now - accepted_at).total_seconds() / 60.0
            is_free_cancel = elapsed <= free_minutes
        
        canceller_type = "rider" if user["user_id"] == ride["rider_id"] else "driver"
        
        if not is_free_cancel and accepted_at:
            
            if canceller_type == "rider":
                penalty_amount = settings.get("rider_cancel_penalty", 500)
                
                # Count existing pending penalties for rider
                existing_pending = await db.cancellation_records.count_documents(
                    {"user_id": user["user_id"], "status": "pending"}
                )
                
                # Record penalty
                record = {
                    "record_id": generate_id("cancel_"),
                    "user_id": user["user_id"],
                    "user_type": "rider",
                    "ride_id": ride_id,
                    "penalty_amount": penalty_amount,
                    "status": "pending",
                    "created_at": now,
                }
                await db.cancellation_records.insert_one(record)
                
                # Deduct from rider wallet
                await db.users.update_one(
                    {"user_id": user["user_id"]},
                    {"$inc": {"wallet_balance": -penalty_amount}}
                )
                
                # Record rider wallet transaction
                await db.wallet_transactions.insert_one({
                    "transaction_id": generate_id("txn_"),
                    "user_id": user["user_id"],
                    "amount": -penalty_amount,
                    "transaction_type": "cancel_penalty",
                    "description": "Multa por cancelación tardía del viaje",
                    "ride_id": ride_id,
                    "status": "completed",
                    "created_at": now,
                })
                
                # CREDIT driver as compensation for wasted time
                driver_compensation = penalty_amount
                await db.users.update_one(
                    {"user_id": ride["driver_id"]},
                    {"$inc": {"wallet_balance": driver_compensation}}
                )
                await db.wallet_transactions.insert_one({
                    "transaction_id": generate_id("txn_"),
                    "user_id": ride["driver_id"],
                    "amount": driver_compensation,
                    "transaction_type": "cancel_compensation",
                    "description": f"Compensación por cancelación del pasajero (+${driver_compensation})",
                    "ride_id": ride_id,
                    "status": "completed",
                    "created_at": now,
                })
                
                # Notify driver about the compensation
                await manager.send_personal_message({
                    "type": "ride_cancelled_by_rider",
                    "ride_id": ride_id,
                    "message": f"El pasajero canceló. Recibiste ${driver_compensation} de compensación.",
                    "compensation": driver_compensation,
                }, ride["driver_id"])
                
                penalty_info = {
                    "penalty_applied": True,
                    "penalty_amount": penalty_amount,
                    "message": f"Se aplicó una multa de ${penalty_amount} por cancelación tardía. Se sumará a tu próximo viaje.",
                    "pending_penalties": existing_pending + 1,
                }
                
            elif canceller_type == "driver":
                penalty_amount = settings.get("driver_cancel_penalty", 500)
                block_after = settings.get("driver_block_after_cancels", 3)
                block_hours = settings.get("driver_block_hours", 24)
                
                # Count driver cancellations in last 30 days
                thirty_days_ago = now - timedelta(days=30)
                recent_cancels = await db.cancellation_records.count_documents(
                    {"user_id": user["user_id"], "user_type": "driver", "created_at": {"$gte": thirty_days_ago}}
                )
                cancel_number = recent_cancels + 1  # this is the current one
                
                # Record penalty
                record = {
                    "record_id": generate_id("cancel_"),
                    "user_id": user["user_id"],
                    "user_type": "driver",
                    "ride_id": ride_id,
                    "penalty_amount": penalty_amount,
                    "cancel_number": cancel_number,
                    "status": "charged",
                    "created_at": now,
                }
                
                if cancel_number >= block_after:
                    # Block the driver
                    block_until = None
                    if block_hours > 0:
                        block_until = now + timedelta(hours=block_hours)
                    
                    await db.drivers.update_one(
                        {"driver_id": user["user_id"]},
                        {"$set": {
                            "is_blocked": True,
                            "block_reason": "cancellations",
                            "blocked_at": now,
                            "blocked_until": block_until,
                            "is_available": False,
                            "is_online": False,
                        }}
                    )
                    record["block_applied"] = True
                    record["blocked_until"] = block_until
                    
                    penalty_info = {
                        "penalty_applied": True,
                        "penalty_amount": penalty_amount,
                        "blocked": True,
                        "blocked_until": block_until.isoformat() if block_until else None,
                        "message": f"Has sido bloqueado por {block_hours}h debido a {cancel_number} cancelaciones." if block_hours > 0 else "Has sido bloqueado permanentemente por cancelaciones excesivas.",
                    }
                else:
                    penalty_info = {
                        "penalty_applied": True,
                        "penalty_amount": penalty_amount,
                        "blocked": False,
                        "cancel_count": cancel_number,
                        "cancels_before_block": block_after - cancel_number,
                        "message": f"Multa de ${penalty_amount}. Cancelación {cancel_number}/{block_after} antes de bloqueo.",
                    }
                
                await db.cancellation_records.insert_one(record)
                
                # Deduct from driver wallet
                await db.users.update_one(
                    {"user_id": user["user_id"]},
                    {"$inc": {"wallet_balance": -penalty_amount}}
                )
                
                # Record wallet transaction
                await db.wallet_transactions.insert_one({
                    "transaction_id": generate_id("txn_"),
                    "user_id": user["user_id"],
                    "amount": -penalty_amount,
                    "transaction_type": "cancel_penalty",
                    "description": f"Multa por cancelación tardía #{cancel_number}",
                    "ride_id": ride_id,
                    "status": "completed",
                    "created_at": now,
                })
                
                # Check if driver wallet is below max negative
                updated_user = await db.users.find_one({"user_id": user["user_id"]})
                max_neg = settings.get("driver_max_negative_balance", -15000)
                if updated_user and updated_user.get("wallet_balance", 0) <= max_neg:
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
                    if penalty_info:
                        penalty_info["blocked"] = True
                        penalty_info["block_reason"] = "negative_balance"
                        penalty_info["message"] = f"Tu saldo llegó al límite de ${max_neg}. No puedes trabajar hasta recargar."
                
                # AUTO RE-DISPATCH: Notify rider and search for another driver
                await manager.send_personal_message({
                    "type": "driver_cancelled_redispatching",
                    "ride_id": ride_id,
                    "message": "Tu conductor canceló. Buscando otro conductor...",
                }, ride["rider_id"])
                
                # Re-create ride request for dispatch
                try:
                    pickup = ride.get("pickup", {})
                    dropoff = ride.get("dropoff", {})
                    new_req_id = generate_id("req_")
                    new_request_doc = {
                        "request_id": new_req_id,
                        "rider_id": ride["rider_id"],
                        "pickup_location": pickup,
                        "dropoff_location": dropoff,
                        "stops": ride.get("stops", []),
                        "ride_type": "instant",
                        "vehicle_type": ride.get("vehicle_type", "standard"),
                        "status": "pending",
                        "estimated_fare": ride.get("fare", 0),
                        "estimated_distance": ride.get("distance_km", 0),
                        "estimated_duration": ride.get("duration_min", 0),
                        "payment_method": ride.get("payment_method", "cash"),
                        "bids": [],
                        "created_at": now,
                        "expires_at": now + timedelta(minutes=5),
                        "excluded_drivers": [ride["driver_id"]],
                        "redispatch_from": ride_id,
                    }
                    await db.ride_requests.insert_one(new_request_doc)
                    
                    nearby = await get_nearby_drivers(
                        pickup.get("latitude", pickup.get("lat", 0)),
                        pickup.get("longitude", pickup.get("lng", 0)),
                        radius_km=15.0,
                        vehicle_type=ride.get("vehicle_type"),
                    )
                    sorted_drivers = [d for d in nearby.get("drivers", []) if d["driver_id"] != ride["driver_id"]]
                    
                    if sorted_drivers:
                        import asyncio as _aio
                        task = _aio.create_task(
                            assign_ride_to_drivers(new_req_id, ride["rider_id"], sorted_drivers, new_request_doc)
                        )
                        assignment_tasks[new_req_id] = task
                    else:
                        await manager.send_personal_message({
                            "type": "no_drivers_available",
                            "ride_id": ride_id,
                            "message": "No hay conductores disponibles en este momento. Intenta de nuevo.",
                        }, ride["rider_id"])
                except Exception as e:
                    print(f"Error re-dispatching ride: {e}")
                    await manager.send_personal_message({
                        "type": "redispatch_failed",
                        "ride_id": ride_id,
                        "message": "No se pudo buscar otro conductor. Intenta solicitar un nuevo viaje.",
                    }, ride["rider_id"])
        else:
            penalty_info = {"penalty_applied": False, "message": "Cancelación sin cargo (dentro del tiempo libre)."}
            
            # Even free cancels: notify the other party and re-dispatch if driver cancelled
            if canceller_type == "driver":
                await manager.send_personal_message({
                    "type": "driver_cancelled_redispatching",
                    "ride_id": ride_id,
                    "message": "Tu conductor canceló. Buscando otro conductor...",
                }, ride["rider_id"])
                
                # Re-dispatch
                try:
                    pickup = ride.get("pickup", {})
                    new_req_id = generate_id("req_")
                    new_request_doc = {
                        "request_id": new_req_id,
                        "rider_id": ride["rider_id"],
                        "pickup_location": pickup,
                        "dropoff_location": ride.get("dropoff", {}),
                        "stops": ride.get("stops", []),
                        "ride_type": "instant",
                        "vehicle_type": ride.get("vehicle_type", "standard"),
                        "status": "pending",
                        "estimated_fare": ride.get("fare", 0),
                        "estimated_distance": ride.get("distance_km", 0),
                        "estimated_duration": ride.get("duration_min", 0),
                        "payment_method": ride.get("payment_method", "cash"),
                        "bids": [],
                        "created_at": now,
                        "expires_at": now + timedelta(minutes=5),
                        "excluded_drivers": [ride["driver_id"]],
                        "redispatch_from": ride_id,
                    }
                    await db.ride_requests.insert_one(new_request_doc)
                    
                    nearby = await get_nearby_drivers(
                        pickup.get("latitude", pickup.get("lat", 0)),
                        pickup.get("longitude", pickup.get("lng", 0)),
                        radius_km=15.0,
                        vehicle_type=ride.get("vehicle_type"),
                    )
                    sorted_drivers = [d for d in nearby.get("drivers", []) if d["driver_id"] != ride["driver_id"]]
                    
                    if sorted_drivers:
                        import asyncio as _aio
                        task = _aio.create_task(
                            assign_ride_to_drivers(new_req_id, ride["rider_id"], sorted_drivers, new_request_doc)
                        )
                        assignment_tasks[new_req_id] = task
                    else:
                        await manager.send_personal_message({
                            "type": "no_drivers_available",
                            "ride_id": ride_id,
                            "message": "No hay conductores disponibles. Intenta de nuevo.",
                        }, ride["rider_id"])
                except Exception as e:
                    print(f"Error re-dispatching ride: {e}")
            elif canceller_type == "rider":
                await manager.send_personal_message({
                    "type": "ride_cancelled_by_rider",
                    "ride_id": ride_id,
                    "message": "El pasajero canceló el viaje (sin cargo).",
                    "compensation": 0,
                }, ride["driver_id"])
    
    await db.rides.update_one({"ride_id": ride_id}, {"$set": update_data})
    
    # Notify both parties
    other_user_id = ride["driver_id"] if user["user_id"] == ride["rider_id"] else ride["rider_id"]
    ws_data = {"type": "ride_status_update", "ride_id": ride_id, "status": status}
    if penalty_info:
        ws_data["penalty_info"] = {k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in penalty_info.items()} if penalty_info else None
    await manager.send_personal_message(ws_data, other_user_id)
    
    response = {"status": "success", "ride_status": status}
    if penalty_info:
        response["penalty"] = penalty_info
    if status == "completed" and update_data.get("penalty_surcharge"):
        response["penalty_surcharge"] = update_data["penalty_surcharge"]
        response["new_fare"] = update_data["fare"]
    return response

@app.get("/api/rides/active")
async def get_active_ride(user: dict = Depends(get_current_user)):
    """Get active ride OR recently completed ride (within 2 min)"""
    query = {"status": {"$in": ["accepted", "arrived", "started"]}}
    
    if user["user_type"] == "rider":
        query["rider_id"] = user["user_id"]
    elif user["user_type"] == "driver":
        query["driver_id"] = user["user_id"]
    
    ride = await db.rides.find_one(query, {"_id": 0})
    
    # If no active ride, check recently completed (so rider can see completion screen)
    if not ride:
        from datetime import timedelta
        two_min_ago = datetime.now(timezone.utc) - timedelta(minutes=2)
        completed_query = {
            "status": "completed",
            "completed_at": {"$gte": two_min_ago}
        }
        if user["user_type"] == "rider":
            completed_query["rider_id"] = user["user_id"]
        elif user["user_type"] == "driver":
            completed_query["driver_id"] = user["user_id"]
        ride = await db.rides.find_one(completed_query, {"_id": 0}, sort=[("completed_at", -1)])
    
    if ride:
        # Get additional info
        driver = await db.users.find_one(
            {"user_id": ride["driver_id"]},
            {"_id": 0, "name": 1, "phone": 1, "rating": 1, "profile_picture": 1}
        )
        rider = await db.users.find_one(
            {"user_id": ride["rider_id"]},
            {"_id": 0, "name": 1, "phone": 1, "rating": 1, "profile_picture": 1}
        )
        vehicle = await db.vehicles.find_one(
            {"driver_id": ride["driver_id"], "is_active": True},
            {"_id": 0}
        )
        driver_location = await db.drivers.find_one(
            {"driver_id": ride["driver_id"]},
            {"_id": 0, "current_location": 1}
        )
        
        ride["driver_info"] = driver
        ride["rider_info"] = rider
        ride["vehicle_info"] = vehicle
        ride["driver_location"] = driver_location.get("current_location") if driver_location else None
    
    return {"ride": ride}

@app.get("/api/rides")
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

@app.get("/api/rides/{ride_id}")
async def get_ride(ride_id: str, user: dict = Depends(get_current_user)):
    ride = await db.rides.find_one({"ride_id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    
    if user["user_id"] not in [ride["rider_id"], ride["driver_id"]] and user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get driver and rider info
    driver = await db.users.find_one(
        {"user_id": ride["driver_id"]},
        {"_id": 0, "name": 1, "phone": 1, "rating": 1, "profile_picture": 1}
    )
    rider = await db.users.find_one(
        {"user_id": ride["rider_id"]},
        {"_id": 0, "name": 1, "phone": 1, "rating": 1, "profile_picture": 1}
    )
    vehicle = await db.vehicles.find_one(
        {"driver_id": ride["driver_id"], "is_active": True},
        {"_id": 0}
    )
    
    ride["driver_info"] = driver
    ride["rider_info"] = rider
    ride["vehicle_info"] = vehicle
    
    return ride

@app.post("/api/rides/{ride_id}/rate")
async def rate_ride(
    ride_id: str,
    rating: float,
    comment: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    ride = await db.rides.find_one({"ride_id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    
    if ride["status"] != "completed":
        raise HTTPException(status_code=400, detail="Can only rate completed rides")
    
    # Determine who is being rated
    if user["user_id"] == ride["rider_id"]:
        rated_user_id = ride["driver_id"]
        rating_field = "driver_rating"
    else:
        rated_user_id = ride["rider_id"]
        rating_field = "rider_rating"
    
    # Save rating
    rating_doc = {
        "rating_id": generate_id("rat_"),
        "ride_id": ride_id,
        "rater_id": user["user_id"],
        "rated_id": rated_user_id,
        "rating": rating,
        "comment": comment,
        "created_at": datetime.now(timezone.utc)
    }
    await db.ratings.insert_one(rating_doc)
    
    # Update ride
    await db.rides.update_one(
        {"ride_id": ride_id},
        {"$set": {rating_field: rating}}
    )
    
    # Update user's average rating
    all_ratings = await db.ratings.find({"rated_id": rated_user_id}, {"rating": 1}).to_list(1000)
    avg_rating = sum(r["rating"] for r in all_ratings) / len(all_ratings) if all_ratings else 5.0
    
    await db.users.update_one(
        {"user_id": rated_user_id},
        {"$set": {"rating": round(avg_rating, 2)}}
    )
    
    return {"status": "success", "message": "Rating submitted"}

# ======================= PENDING REQUESTS (for drivers) =======================

@app.get("/api/rides/requests/pending")
async def get_pending_requests(
    latitude: float,
    longitude: float,
    radius_km: float = 10.0,
    user: dict = Depends(get_current_user)
):
    if user["user_type"] != "driver":
        raise HTTPException(status_code=403, detail="Only drivers can view requests")
    
    # Get driver's vehicle type
    vehicle = await db.vehicles.find_one(
        {"driver_id": user["user_id"], "is_active": True},
        {"_id": 0}
    )
    if not vehicle:
        return {"requests": []}
    
    now = datetime.now(timezone.utc)
    requests = await db.ride_requests.find({
        "status": {"$in": ["pending", "bidding"]},
        "expires_at": {"$gt": now}
    }, {"_id": 0}).to_list(50)
    
    # Filter by distance and vehicle type
    nearby_requests = []
    for req in requests:
        pickup = req.get("pickup_location", {})
        distance = calculate_distance(
            latitude, longitude,
            pickup.get("latitude", 0), pickup.get("longitude", 0)
        )
        
        if distance <= radius_km:
            # Check if driver already bid
            already_bid = any(
                b.get("driver_id") == user["user_id"]
                for b in req.get("bids", [])
            )
            
            if not already_bid:
                req["distance_to_pickup"] = round(distance, 2)
                nearby_requests.append(req)
    
    nearby_requests.sort(key=lambda x: x["distance_to_pickup"])
    return {"requests": nearby_requests}

# ======================= CHAT ENDPOINTS =======================

@app.post("/api/chat/messages", response_model=ChatMessageResponse)
async def send_message(message: ChatMessageCreate, user: dict = Depends(get_current_user)):
    message_id = generate_id("msg_")
    now = datetime.now(timezone.utc)
    
    message_doc = {
        "message_id": message_id,
        "sender_id": user["user_id"],
        "receiver_id": message.receiver_id,
        "message": message.message,
        "message_type": message.message_type,
        "is_read": False,
        "created_at": now
    }
    
    await db.chat_messages.insert_one(message_doc)
    
    # Send via WebSocket
    await manager.send_personal_message(
        {"type": "new_message", "message": {k: v for k, v in message_doc.items() if k != "_id"}},
        message.receiver_id
    )
    
    return ChatMessageResponse(**{k: v for k, v in message_doc.items() if k != "_id"})

@app.get("/api/chat/messages/{other_user_id}")
async def get_messages(
    other_user_id: str,
    limit: int = 50,
    user: dict = Depends(get_current_user)
):
    messages = await db.chat_messages.find({
        "$or": [
            {"sender_id": user["user_id"], "receiver_id": other_user_id},
            {"sender_id": other_user_id, "receiver_id": user["user_id"]}
        ]
    }, {"_id": 0}).sort("created_at", -1).to_list(limit)
    
    # Mark as read
    await db.chat_messages.update_many(
        {"sender_id": other_user_id, "receiver_id": user["user_id"], "is_read": False},
        {"$set": {"is_read": True}}
    )
    
    return {"messages": list(reversed(messages))}

@app.get("/api/chat/conversations")
async def get_conversations(user: dict = Depends(get_current_user)):
    # Get all unique conversation partners
    pipeline = [
        {"$match": {
            "$or": [
                {"sender_id": user["user_id"]},
                {"receiver_id": user["user_id"]}
            ]
        }},
        {"$sort": {"created_at": -1}},
        {"$group": {
            "_id": {
                "$cond": [
                    {"$eq": ["$sender_id", user["user_id"]]},
                    "$receiver_id",
                    "$sender_id"
                ]
            },
            "last_message": {"$first": "$$ROOT"},
            "unread_count": {
                "$sum": {
                    "$cond": [
                        {"$and": [
                            {"$eq": ["$receiver_id", user["user_id"]]},
                            {"$eq": ["$is_read", False]}
                        ]},
                        1, 0
                    ]
                }
            }
        }}
    ]
    
    conversations_raw = await db.chat_messages.aggregate(pipeline).to_list(50)
    
    conversations = []
    for conv in conversations_raw:
        other_user = await db.users.find_one(
            {"user_id": conv["_id"]},
            {"_id": 0, "user_id": 1, "name": 1, "profile_picture": 1}
        )
        if other_user:
            conversations.append({
                "user": other_user,
                "last_message": {
                    "message": conv["last_message"]["message"],
                    "created_at": conv["last_message"]["created_at"],
                    "is_mine": conv["last_message"]["sender_id"] == user["user_id"]
                },
                "unread_count": conv["unread_count"]
            })
    
    return {"conversations": conversations}

# ======================= WALLET STATUS & CANCELLATION RECORDS =======================

@app.get("/api/wallet/status")
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

@app.get("/api/driver/block-status")
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
        # Also check wallet limit
        settings = await get_settings()
        max_neg = settings.get("driver_max_negative_balance", -15000)
        if user.get("wallet_balance", 0) <= max_neg:
            return {
                "is_blocked": True,
                "reason": "negative_balance",
                "message": f"Tu saldo llegó al límite de ${max_neg}. Recarga tu billetera para continuar.",
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

@app.get("/api/cancellation/config")
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

@app.get("/api/cancellation/history")
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

# ======================= AI CHATBOT SUPPORT =======================

@app.post("/api/support/chat")
async def ai_support_chat(
    message: str,
    session_id: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    """AI-powered support chat with access to user/driver data"""
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    
    EMERGENT_LLM_KEY = os.getenv("EMERGENT_LLM_KEY")
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="AI support not configured")
    
    if not session_id:
        session_id = generate_id("chat_")
    
    # Get user context
    user_context = f"""
User Information:
- Name: {user['name']}
- Email: {user['email']}
- User Type: {user['user_type']}
- Rating: {user.get('rating', 5.0)}
- Wallet Balance: ${user.get('wallet_balance', 0):.2f}
- Total Rides: {user.get('total_rides', 0)}
"""
    
    # Get recent rides
    recent_rides = await db.rides.find(
        {"$or": [{"rider_id": user["user_id"]}, {"driver_id": user["user_id"]}]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(5)
    
    if recent_rides:
        user_context += "\nRecent Rides:\n"
        for ride in recent_rides:
            user_context += f"- Ride {ride['ride_id']}: {ride['status']}, Fare: ${ride.get('fare', 0):.2f}\n"
    
    # If driver, get additional info
    if user["user_type"] == "driver":
        driver = await db.drivers.find_one({"driver_id": user["user_id"]}, {"_id": 0})
        if driver:
            user_context += f"""
Driver Information:
- Online Status: {'Online' if driver.get('is_online') else 'Offline'}
- Available: {'Yes' if driver.get('is_available') else 'No'}
- Total Earnings: ${driver.get('total_earnings', 0):.2f}
- Completed Rides: {driver.get('completed_rides', 0)}
- Documents Verified: {'Yes' if driver.get('documents_verified') else 'No'}
"""
    
    system_message = f"""Eres Moli Asistente, el chatbot de soporte de la app de taxi Moli.
Responde SIEMPRE en español. Sé amable, conciso y útil.

Puedes ayudar con:
1. Preguntas sobre cuenta y perfil
2. Estado e historial de viajes
3. Problemas con pagos y billetera
4. Ayuda general con la app
5. Preguntas de conductores (ganancias, disponibilidad, etc.)

{user_context}

Si no puedes resolver un problema, ofrece conectar con un despachador humano.
Usa la información del usuario proporcionada para dar respuestas personalizadas.
"""
    
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=session_id,
            system_message=system_message
        ).with_model("openai", "gpt-4.1-mini")
        
        user_message = UserMessage(text=message)
        response = await chat.send_message(user_message)
        
        # Save to support chat history
        await db.support_chats.insert_one({
            "chat_id": generate_id("sup_"),
            "session_id": session_id,
            "user_id": user["user_id"],
            "user_message": message,
            "ai_response": response,
            "created_at": datetime.now(timezone.utc)
        })
        
        return {
            "session_id": session_id,
            "response": response,
            "is_ai": True
        }
        
    except Exception as e:
        return {
            "session_id": session_id,
            "response": "I'm sorry, I'm having trouble right now. Would you like to connect with a human dispatcher?",
            "is_ai": True,
            "error": str(e)
        }

@app.post("/api/support/connect-dispatcher")
async def connect_to_dispatcher(
    session_id: str,
    user: dict = Depends(get_current_user)
):
    """Request connection to human dispatcher"""
    ticket_id = generate_id("tkt_")
    
    ticket = {
        "ticket_id": ticket_id,
        "user_id": user["user_id"],
        "session_id": session_id,
        "status": "waiting",
        "dispatcher_id": None,
        "created_at": datetime.now(timezone.utc)
    }
    
    await db.support_tickets.insert_one(ticket)
    
    # Notify dispatchers via WebSocket
    dispatchers = await db.users.find({"user_type": "dispatcher"}, {"user_id": 1}).to_list(100)
    for d in dispatchers:
        await manager.send_personal_message(
            {"type": "new_support_ticket", "ticket": ticket},
            d["user_id"]
        )
    
    return {"status": "success", "ticket_id": ticket_id, "message": "Connecting you with a dispatcher..."}

# ======================= WALLET & PAYMENTS =======================

@app.get("/api/wallet/balance")
async def get_wallet_balance(user: dict = Depends(get_current_user)):
    return {"balance": user.get("wallet_balance", 0.0)}

@app.get("/api/wallet/transactions")
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

@app.post("/api/wallet/add-funds")
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

@app.post("/api/wallet/callback/{status}")
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
        
        # Add to wallet
        await db.users.update_one(
            {"user_id": transaction["user_id"]},
            {"$inc": {"wallet_balance": transaction["amount"]}}
        )
        
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

# ======================= COUPONS =======================

@app.get("/api/coupons")
async def get_available_coupons(user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    coupons = await db.coupons.find({
        "is_active": True,
        "expires_at": {"$gt": now},
        "current_uses": {"$lt": "$max_uses"}
    }, {"_id": 0}).to_list(20)
    
    return {"coupons": coupons}

@app.post("/api/coupons/apply")
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

# ======================= ADMIN ENDPOINTS =======================

@app.get("/api/admin/dashboard")
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

@app.get("/api/admin/users")
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

@app.get("/api/admin/drivers")
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

@app.put("/api/admin/drivers/{driver_id}/verify")
async def verify_driver(
    driver_id: str,
    verified: bool,
    user: dict = Depends(get_current_user)
):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    await db.drivers.update_one(
        {"driver_id": driver_id},
        {"$set": {"documents_verified": verified}}
    )
    
    return {"status": "success", "verified": verified}

@app.get("/api/admin/rides")
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

@app.get("/api/admin/settings")
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

@app.put("/api/admin/settings")
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

# ======================= VEHICLE ICONS ENDPOINTS =======================

# Default vehicle icons
DEFAULT_VEHICLE_ICONS = [
    {"vehicle_type": "economy", "display_name": "Económico", "icon_type": "emoji", "emoji_value": "🚗", "image_data": None},
    {"vehicle_type": "comfort", "display_name": "Confort", "icon_type": "emoji", "emoji_value": "🚙", "image_data": None},
    {"vehicle_type": "premium", "display_name": "Premium", "icon_type": "emoji", "emoji_value": "🏎️", "image_data": None},
    {"vehicle_type": "xl", "display_name": "XL", "icon_type": "emoji", "emoji_value": "🚐", "image_data": None},
]

@app.get("/api/vehicle-icons")
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

@app.get("/api/admin/vehicle-icons")
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

class VehicleIconUpdate(BaseModel):
    icon_type: str = "emoji"  # "emoji" or "image"
    emoji_value: Optional[str] = None
    image_data: Optional[str] = None  # base64 PNG

@app.put("/api/admin/vehicle-icons/{vehicle_type}")
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



@app.post("/api/admin/coupons")
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

# ======================= DISPATCHER ENDPOINTS =======================

@app.get("/api/dispatcher/tickets")
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

@app.post("/api/dispatcher/tickets/{ticket_id}/take")
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

# ======================= RIDE CHAT =======================

@app.post("/api/chat/send")
async def send_chat_message(
    ride_id: str = Query(...),
    message: str = Query(...),
    user: dict = Depends(get_current_user)
):
    """Send a chat message within an active ride"""
    ride = await db.rides.find_one({"ride_id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Viaje no encontrado")
    
    if user["user_id"] not in [ride["rider_id"], ride.get("driver_id")]:
        raise HTTPException(status_code=403, detail="No autorizado")
    
    receiver_id = ride["driver_id"] if user["user_id"] == ride["rider_id"] else ride["rider_id"]
    
    msg = {
        "message_id": f"msg_{uuid.uuid4().hex[:12]}",
        "ride_id": ride_id,
        "sender_id": user["user_id"],
        "sender_name": user.get("name", "Usuario"),
        "receiver_id": receiver_id,
        "message": message,
        "is_ai": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.chat_messages.insert_one(msg)
    
    # Send via WebSocket to receiver
    ws_msg = {k: v for k, v in msg.items() if k != "_id"}
    await manager.send_personal_message(
        {"type": "new_message", **ws_msg},
        receiver_id
    )
    
    return {"status": "sent", "message_id": msg["message_id"], "message": ws_msg}

@app.get("/api/chat/ride/{ride_id}")
async def get_chat_messages(
    ride_id: str,
    user: dict = Depends(get_current_user)
):
    """Get chat messages for a ride"""
    ride = await db.rides.find_one({"ride_id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Viaje no encontrado")
    
    if user["user_id"] not in [ride["rider_id"], ride.get("driver_id")] and user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="No autorizado")
    
    messages = await db.chat_messages.find(
        {"ride_id": ride_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(200)
    
    return {"messages": messages}

@app.get("/api/support/history")
async def get_support_history_v2(
    session_id: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    """Get support chat history from support_chats collection"""
    query = {"user_id": user["user_id"]}
    if session_id:
        query["session_id"] = session_id
    
    chats = await db.support_chats.find(
        query, {"_id": 0}
    ).sort("created_at", 1).to_list(100)
    
    # Convert to message format for frontend
    messages = []
    for chat in chats:
        messages.append({
            "message_id": f"usr_{chat.get('chat_id', '')}",
            "session_id": chat["session_id"],
            "sender_id": chat["user_id"],
            "sender_name": "Tu",
            "message": chat["user_message"],
            "is_ai": False,
            "is_dispatcher": False,
            "created_at": chat.get("created_at", "").isoformat() if hasattr(chat.get("created_at", ""), 'isoformat') else str(chat.get("created_at", ""))
        })
        messages.append({
            "message_id": f"ai_{chat.get('chat_id', '')}",
            "session_id": chat["session_id"],
            "sender_id": "ai_assistant",
            "sender_name": "Moli Asistente",
            "message": chat["ai_response"],
            "is_ai": True,
            "is_dispatcher": False,
            "created_at": chat.get("created_at", "").isoformat() if hasattr(chat.get("created_at", ""), 'isoformat') else str(chat.get("created_at", ""))
        })
    
    sessions = await db.support_tickets.find(
        {"user_id": user["user_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(10)
    
    # Also check for active sessions from support_chats
    if not sessions:
        session_ids = list(set(c["session_id"] for c in chats))
        sessions = [{"session_id": sid, "status": "ai_active"} for sid in session_ids]
    
    return {"messages": messages, "sessions": sessions}


# ======================= ADMIN: USER MANAGEMENT =======================

@app.get("/api/admin/users")
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
        u["balance"] = balance.get("amount", 0.0) if balance else 0.0
        u["debt"] = balance.get("debt", 0.0) if balance else 0.0
        # Driver status
        if u["user_type"] == "driver":
            driver = await db.drivers.find_one({"driver_id": u["user_id"]}, {"_id": 0})
            u["is_online"] = driver.get("is_online", False) if driver else False
            u["is_blocked"] = driver.get("is_blocked", False) if driver else False
            u["block_type"] = driver.get("block_type", None) if driver else None
            u["priority"] = driver.get("priority", 0) if driver else 0
    
    return {"users": users, "total": total, "page": page, "pages": (total + limit - 1) // limit}

@app.get("/api/admin/users/{user_id}")
async def admin_get_user(user_id: str, user: dict = Depends(get_current_user)):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    
    balance = await db.user_balances.find_one({"user_id": user_id}, {"_id": 0})
    target["balance"] = balance.get("amount", 0.0) if balance else 0.0
    target["debt"] = balance.get("debt", 0.0) if balance else 0.0
    
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

class AdminUserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    user_type: Optional[str] = None

@app.put("/api/admin/users/{user_id}")
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

class AdminCreateUser(BaseModel):
    name: str
    email: str
    phone: Optional[str] = ""
    password: str
    user_type: str = "rider"

@app.post("/api/admin/users")
async def admin_create_user(data: AdminCreateUser, user: dict = Depends(get_current_user)):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    existing = await db.users.find_one({"email": data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already exists")
    
    hashed = pwd_context.hash(data.password)
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

# ======================= ADMIN: BALANCE MANAGEMENT =======================

class BalanceUpdate(BaseModel):
    amount: float
    operation: str = "set"  # "set", "add", "subtract"
    reason: str = ""

@app.put("/api/admin/users/{user_id}/balance")
async def admin_update_balance(
    user_id: str,
    update: BalanceUpdate,
    user: dict = Depends(get_current_user)
):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    current = await db.user_balances.find_one({"user_id": user_id})
    old_amount = current.get("amount", 0.0) if current else 0.0
    
    if update.operation == "add":
        new_amount = old_amount + update.amount
    elif update.operation == "subtract":
        new_amount = old_amount - update.amount
    else:
        new_amount = update.amount
    
    await db.user_balances.update_one(
        {"user_id": user_id},
        {"$set": {"amount": new_amount, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )
    
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

@app.put("/api/admin/users/{user_id}/debt")
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

# ======================= ADMIN: AUDIT LOG =======================

@app.get("/api/admin/audit-log")
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

# ======================= ADMIN: FARE CONFIGURATION =======================

DEFAULT_FARES = {
    "economy": {"base_fare": 500, "per_km": 150, "per_min": 50, "min_fare": 800, "multiplier": 1.0},
    "comfort": {"base_fare": 700, "per_km": 200, "per_min": 70, "min_fare": 1200, "multiplier": 1.3},
    "premium": {"base_fare": 1000, "per_km": 300, "per_min": 100, "min_fare": 1800, "multiplier": 1.8},
    "xl": {"base_fare": 800, "per_km": 250, "per_min": 80, "min_fare": 1500, "multiplier": 1.5},
}

@app.get("/api/admin/fares")
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

@app.get("/api/fares")
async def get_fares_public():
    """Public endpoint for fare display"""
    fares = await db.fare_config.find({}, {"_id": 0}).to_list(20)
    if not fares:
        for vtype, config in DEFAULT_FARES.items():
            fare = {"vehicle_type": vtype, **config, "dynamic_pricing": False, "night_surcharge": 0, "day_surcharge": 0}
            fares.append(fare)
    return {"fares": fares}

    return {"fares": fares}

# ======================= FARE ESTIMATION =======================

DISPLAY_NAMES = {"economy": "Económico", "comfort": "Confort", "premium": "Premium", "xl": "XL"}

class EstimateRequest(BaseModel):
    distance_km: float
    duration_min: int

@app.post("/api/rides/estimate")
async def estimate_fares(data: EstimateRequest):
    """Calculate fare estimates for all vehicle types"""
    fares = await db.fare_config.find({}, {"_id": 0}).to_list(20)
    if not fares:
        fares = [{"vehicle_type": k, **v} for k, v in DEFAULT_FARES.items()]
    
    estimates = []
    for fare in fares:
        price = fare.get("base_fare", 500) + (data.distance_km * fare.get("per_km", 150)) + (data.duration_min * fare.get("per_min", 50))
        min_fare = fare.get("min_fare", 0)
        price = max(price, min_fare)
        estimates.append({
            "vehicle_type": fare["vehicle_type"],
            "display_name": DISPLAY_NAMES.get(fare["vehicle_type"], fare["vehicle_type"].capitalize()),
            "estimated_fare": round(price, 2),
            "min_fare": min_fare,
        })
    
    estimates.sort(key=lambda x: x["estimated_fare"])
    return {"estimates": estimates, "distance_km": round(data.distance_km, 2), "duration_min": data.duration_min}

# ======================= BANNERS & ADVERTISING =======================

@app.get("/api/banners")
async def get_active_banners():
    """Public endpoint - returns active banners for rider app"""
    banners = await db.banners.find({"is_active": True}, {"_id": 0}).sort("position", 1).to_list(10)
    return {"banners": banners}

@app.get("/api/admin/banners")
async def admin_list_banners(user: dict = Depends(get_current_user)):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    banners = await db.banners.find({}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return {"banners": banners}

class BannerCreate(BaseModel):
    title: str
    description: str = ""
    image_url: str = ""
    link_url: str = ""
    bg_color: str = "#6B21A8"
    text_color: str = "#FFFFFF"
    position: int = 0
    is_active: bool = True

@app.post("/api/admin/banners")
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

@app.put("/api/admin/banners/{banner_id}")
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

@app.delete("/api/admin/banners/{banner_id}")
async def admin_delete_banner(banner_id: str, user: dict = Depends(get_current_user)):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    result = await db.banners.delete_one({"banner_id": banner_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Banner no encontrado")
    return {"message": "Banner eliminado"}

# ======================= MOLÍ+ PREMIUM =======================

@app.post("/api/user/premium/toggle")
async def toggle_premium(user: dict = Depends(get_current_user)):
    """Toggle Molí+ premium status"""
    current = user.get("is_premium", False)
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"is_premium": not current}}
    )
    return {"is_premium": not current, "message": "Molí+ activado" if not current else "Molí+ desactivado"}

@app.get("/api/user/premium/status")
async def get_premium_status(user: dict = Depends(get_current_user)):
    return {"is_premium": user.get("is_premium", False)}

class FareUpdate(BaseModel):
    base_fare: Optional[float] = None
    per_km: Optional[float] = None
    per_min: Optional[float] = None
    min_fare: Optional[float] = None
    multiplier: Optional[float] = None
    dynamic_pricing: Optional[bool] = None
    dynamic_multiplier: Optional[float] = None
    night_surcharge: Optional[float] = None
    night_start_hour: Optional[int] = None
    night_end_hour: Optional[int] = None
    day_surcharge: Optional[float] = None

@app.put("/api/admin/fares/{vehicle_type}")
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

# ======================= ADMIN: COUPONS =======================

@app.get("/api/admin/coupons")
async def admin_list_coupons(user: dict = Depends(get_current_user)):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    coupons = await db.coupons.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"coupons": coupons}

class CouponCreate(BaseModel):
    code: str
    discount_type: str = "percentage"  # "percentage" or "fixed"
    discount_value: float = 10
    max_uses: int = 100
    min_fare: float = 0
    max_discount: float = 0  # 0 = no limit
    valid_from: Optional[str] = None
    valid_until: Optional[str] = None
    active: bool = True
    description: str = ""

@app.post("/api/admin/coupons")
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

@app.put("/api/admin/coupons/{coupon_id}")
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

@app.delete("/api/admin/coupons/{coupon_id}")
async def admin_delete_coupon(coupon_id: str, user: dict = Depends(get_current_user)):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    result = await db.coupons.delete_one({"coupon_id": coupon_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Coupon not found")
    
    return {"status": "success", "message": "Coupon deleted"}

# ======================= ADMIN: COMMISSION CONFIG =======================

class CommissionUpdate(BaseModel):
    commission_type: str = "percentage"  # "percentage", "fixed_per_ride", "fixed_price"
    commission_value: float = 15

@app.put("/api/admin/drivers/{driver_id}/commission")
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

# ======================= ADMIN: DRIVER BLOCKING =======================

class DriverBlock(BaseModel):
    block_type: str = "permanent"  # "permanent", "hours", "days"
    block_duration: Optional[int] = None  # hours or days depending on type
    reason: str = ""

@app.put("/api/admin/drivers/{driver_id}/block")
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

@app.put("/api/admin/drivers/{driver_id}/unblock")
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

# ======================= ADMIN: DRIVER PRIORITY =======================

class PriorityUpdate(BaseModel):
    priority: int = 0  # 0=normal, 1-10=priority (higher=more priority)

@app.put("/api/admin/drivers/{driver_id}/priority")
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


# ======================= ADMIN: DRIVER SERVICE TYPES =======================

class ServiceTypesUpdate(BaseModel):
    service_types: list = ["economy"]  # list of: economy, comfort, premium, xl

@app.put("/api/admin/drivers/{driver_id}/services")
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

@app.get("/api/drivers/{driver_id}/services")
async def get_driver_services(driver_id: str):
    """Public endpoint to get a driver's service types"""
    driver = await db.drivers.find_one({"driver_id": driver_id}, {"_id": 0})
    return {"service_types": driver.get("service_types", ["economy"]) if driver else ["economy"]}


# ======================= ADMIN: EYE OF GOD (LIVE DRIVERS MAP) =======================

@app.get("/api/admin/drivers/live")
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

# ======================= ADMIN: MANUAL TRIP CREATION =======================

class ManualTripCreate(BaseModel):
    trip_type: str = "full"  # "full" (origin+destination) or "destination_only" (ticketera)
    rider_name: str = ""
    rider_phone: str = ""
    rider_id: Optional[str] = None  # existing rider or null for walk-in
    pickup_address: str = ""
    pickup_latitude: Optional[float] = None
    pickup_longitude: Optional[float] = None
    dropoff_address: str = ""
    dropoff_latitude: Optional[float] = None
    dropoff_longitude: Optional[float] = None
    vehicle_type: str = "economy"
    assigned_driver_id: Optional[str] = None  # optionally assign directly
    notes: str = ""

@app.post("/api/admin/trips/manual")
async def admin_create_manual_trip(
    data: ManualTripCreate,
    user: dict = Depends(get_current_user)
):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    ride_id = f"ride_{uuid.uuid4().hex[:12]}"
    
    # Calculate fare for full trips
    fare = 0
    if data.trip_type == "full" and data.pickup_latitude and data.dropoff_latitude:
        # Calculate distance and estimated fare
        fare_config = await db.fare_config.find_one({"vehicle_type": data.vehicle_type}, {"_id": 0})
        if not fare_config:
            fare_config = DEFAULT_FARES.get(data.vehicle_type, DEFAULT_FARES["economy"])
        
        # Haversine distance
        import math
        R = 6371
        lat1, lat2 = math.radians(data.pickup_latitude), math.radians(data.dropoff_latitude)
        dlat = math.radians(data.dropoff_latitude - data.pickup_latitude)
        dlng = math.radians(data.dropoff_longitude - data.pickup_longitude)
        a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng/2)**2
        distance_km = R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        
        base = fare_config.get("base_fare", 500)
        per_km = fare_config.get("per_km", 150)
        min_fare = fare_config.get("min_fare", 800)
        fare = max(base + (distance_km * per_km), min_fare)
    
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

@app.get("/api/admin/trips")
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



# ======================= ADMIN: PAYMENT GATEWAY CONFIG =======================

@app.get("/api/admin/payment-config")
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

class PaymentConfigUpdate(BaseModel):
    mercadopago_enabled: Optional[bool] = None
    mercadopago_public_key: Optional[str] = None
    mercadopago_access_token: Optional[str] = None
    astropay_enabled: Optional[bool] = None
    astropay_api_key: Optional[str] = None
    astropay_secret: Optional[str] = None

@app.put("/api/admin/payment-config")
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

# ======================= WEBSOCKET =======================

@app.websocket("/api/ws/{user_id}")
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

# ======================= HEALTH CHECK =======================

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": "1.0.0"
    }

@app.get("/api/config/dispatch")
async def get_dispatch_config_endpoint():
    """Get dispatch configuration"""
    config = await get_dispatch_config()
    return config

@app.put("/api/admin/config/dispatch")
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



# ======================= SUPPORT CHAT + AI =======================
from emergentintegrations.llm.chat import LlmChat, UserMessage

SUPPORT_SYSTEM_PROMPT = """Eres el asistente de soporte de Molí (Move Libre), una app de transporte tipo Uber.
Tu trabajo es ayudar a pasajeros y conductores con sus problemas.
Responde SIEMPRE en español. Sé amable, breve y directo.
Si NO puedes resolver el problema (temas de pagos reales, accidentes, quejas graves, problemas técnicos complejos),
responde EXACTAMENTE con el texto: [ESCALAR_AGENTE] al final de tu mensaje para que un agente humano atienda.
Problemas comunes que SÍ puedes resolver: cómo usar la app, cómo solicitar viaje, cómo funciona el pago, preguntas sobre tarifas, cómo contactar conductor."""

@app.post("/api/support/message")
async def support_chat_message(
    message: str = Query(...),
    session_id: str = Query(None),
    user: dict = Depends(get_current_user)
):
    """AI support chat - handles user messages and escalates when needed"""
    user_id = user["user_id"]
    if not session_id:
        session_id = f"support_{user_id}"
    
    # Check support hours
    settings = await get_settings()
    support_start = settings.get("support_hours_start", 0)  # 0 = 24/7
    support_end = settings.get("support_hours_end", 24)
    
    import pytz
    now_utc = datetime.now(timezone.utc)
    # Default timezone Argentina
    tz = pytz.timezone(settings.get("timezone", "America/Argentina/Buenos_Aires"))
    now_local = now_utc.astimezone(tz)
    current_hour = now_local.hour
    
    is_within_hours = support_start == 0 or (support_start <= current_hour < support_end)
    
    # Save user message to DB
    msg_doc = {
        "message_id": generate_id("smsg_"),
        "session_id": session_id,
        "user_id": user_id,
        "sender": "user",
        "message": message,
        "created_at": now_utc,
    }
    await db.support_messages.insert_one(msg_doc)
    
    # Check if already escalated
    escalated = await db.support_sessions.find_one({"session_id": session_id, "escalated": True})
    
    if escalated:
        # Notify admin via WebSocket
        admins = await db.users.find({"user_type": "admin"}, {"user_id": 1}).to_list(10)
        for admin in admins:
            await manager.send_personal_message({
                "type": "support_message",
                "session_id": session_id,
                "user_id": user_id,
                "user_name": user.get("name", "Usuario"),
                "message": message,
                "needs_response": True,
            }, admin["user_id"])
        
        return {
            "response": "Tu mensaje fue enviado al agente de soporte. Te responderá pronto.",
            "escalated": True,
            "session_id": session_id,
        }
    
    # Get recent history for context
    history = await db.support_messages.find(
        {"session_id": session_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(10)
    history.reverse()
    
    # Build context for AI
    extra_context = ""
    if not is_within_hours:
        extra_context = f"\nNOTA: Estamos fuera de horario de atención ({support_start}:00 - {support_end}:00). Intenta resolver el problema por tu cuenta o deja tu consulta para cuando un agente esté disponible. Insiste en ayudar al usuario con lo que puedas."
    
    try:
        llm_key = os.getenv("EMERGENT_LLM_KEY")
        chat = LlmChat(
            api_key=llm_key,
            session_id=session_id,
            system_message=SUPPORT_SYSTEM_PROMPT + extra_context
        ).with_model("openai", "gpt-4.1-mini")
        
        # Build conversation context
        context_msgs = []
        for h in history[-6:]:
            if h["sender"] == "user":
                context_msgs.append(f"Usuario: {h['message']}")
            else:
                context_msgs.append(f"Asistente: {h['message']}")
        
        full_message = "\n".join(context_msgs[-4:]) + f"\nUsuario: {message}" if context_msgs else message
        
        user_msg = UserMessage(text=full_message)
        ai_response = await chat.send_message(user_msg)
        
        # Check if AI wants to escalate
        needs_escalation = "[ESCALAR_AGENTE]" in ai_response
        clean_response = ai_response.replace("[ESCALAR_AGENTE]", "").strip()
        
        if needs_escalation:
            clean_response += "\n\nHe notificado a un agente de soporte. Te contactará pronto."
            await db.support_sessions.update_one(
                {"session_id": session_id},
                {"$set": {"session_id": session_id, "user_id": user_id, "escalated": True, "escalated_at": now_utc}},
                upsert=True
            )
            # Notify admins
            admins = await db.users.find({"user_type": "admin"}, {"user_id": 1}).to_list(10)
            for admin in admins:
                await manager.send_personal_message({
                    "type": "support_escalation",
                    "session_id": session_id,
                    "user_id": user_id,
                    "user_name": user.get("name", "Usuario"),
                    "message": message,
                    "ai_response": clean_response,
                }, admin["user_id"])
        
        # Save AI response
        ai_doc = {
            "message_id": generate_id("smsg_"),
            "session_id": session_id,
            "user_id": user_id,
            "sender": "ai",
            "message": clean_response,
            "created_at": datetime.now(timezone.utc),
        }
        await db.support_messages.insert_one(ai_doc)
        
        return {
            "response": clean_response,
            "escalated": needs_escalation,
            "session_id": session_id,
        }
    except Exception:
        return {
            "response": "Disculpa, tuve un problema procesando tu consulta. Por favor intenta de nuevo.",
            "escalated": False,
            "session_id": session_id,
        }

@app.get("/api/support/history")
async def get_support_history(session_id: str = Query(None), user: dict = Depends(get_current_user)):
    """Get support chat history"""
    if not session_id:
        session_id = f"support_{user['user_id']}"
    msgs = await db.support_messages.find(
        {"session_id": session_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(50)
    for m in msgs:
        if isinstance(m.get("created_at"), datetime):
            m["created_at"] = m["created_at"].isoformat()
    return {"messages": msgs, "session_id": session_id}

@app.post("/api/admin/support/reply")
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

@app.post("/api/admin/direct-message")
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

@app.put("/api/admin/config/support-hours")
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


# ======================= BANNER / AD SYSTEM =======================

@app.post("/api/admin/banners")
async def create_banner(
    title: str = Query(None),
    description: str = Query(None),
    banner_type: str = Query("image_text"),  # image_text, image_only, text_only, video_text, video_only
    image_url: str = Query(None),
    video_url: str = Query(None),
    button_text: str = Query(None),
    button_link: str = Query(None),
    target: str = Query("both"),  # rider, driver, both
    active: bool = Query(True),
    user: dict = Depends(get_current_user)
):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Solo administradores")
    
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
        "active": active,
        "created_at": datetime.now(timezone.utc),
    }
    await db.banners.insert_one(banner)
    banner.pop("_id", None)
    return {"status": "created", "banner": banner}

@app.get("/api/admin/banners")
async def list_banners(user: dict = Depends(get_current_user)):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Solo administradores")
    banners = await db.banners.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    for b in banners:
        if isinstance(b.get("created_at"), datetime):
            b["created_at"] = b["created_at"].isoformat()
    return {"banners": banners}

@app.put("/api/admin/banners/{banner_id}")
async def update_banner(
    banner_id: str,
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
    for field in ["title", "description", "banner_type", "image_url", "video_url", "button_text", "button_link", "target", "active"]:
        val = locals().get(field)
        if val is not None:
            update[field] = val
    if update:
        await db.banners.update_one({"banner_id": banner_id}, {"$set": update})
    return {"status": "updated"}

@app.delete("/api/admin/banners/{banner_id}")
async def delete_banner(banner_id: str, user: dict = Depends(get_current_user)):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Solo administradores")
    await db.banners.delete_one({"banner_id": banner_id})
    return {"status": "deleted"}

@app.get("/api/banners")
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

@app.post("/api/admin/banners/upload-image")
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



@app.get("/api/config/maps")
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

# ======================= PLACES SEARCH (MULTI-PROVIDER) =======================


@app.get("/api/places/search")
async def places_search(q: str, lat: float = -28.4696, lng: float = -65.7852):
    """Search places using current map provider"""
    settings = await get_settings()
    provider = settings.get("map_provider", "osm")
    
    if provider == "google":
        return await _google_places_search(q, lat, lng)
    else:
        return await _nominatim_search(q, lat, lng)

@app.get("/api/places/reverse")
async def places_reverse(lat: float, lng: float):
    """Reverse geocode using current map provider"""
    settings = await get_settings()
    provider = settings.get("map_provider", "osm")
    
    if provider == "google":
        return await _google_reverse(lat, lng)
    else:
        return await _nominatim_reverse(lat, lng)

async def _google_places_search(q: str, lat: float, lng: float):
    key = os.getenv("GOOGLE_MAPS_KEY", "")
    if not key:
        return {"results": []}
    
    async with httpx.AsyncClient(timeout=8) as client:
        # Use Text Search for simplicity (returns coords directly)
        url = f"https://maps.googleapis.com/maps/api/place/textsearch/json?query={q}&key={key}&language=es&region=ar&location={lat},{lng}&radius=100000"
        resp = await client.get(url)
        data = resp.json()
        
        results = []
        for p in (data.get("results") or [])[:6]:
            loc = p.get("geometry", {}).get("location", {})
            results.append({
                "id": p.get("place_id", ""),
                "name": p.get("name", ""),
                "address": p.get("formatted_address", ""),
                "latitude": loc.get("lat", 0),
                "longitude": loc.get("lng", 0),
            })
        return {"results": results}

async def _nominatim_search(q: str, lat: float, lng: float):
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            # Catamarca bbox first
            url = f"https://nominatim.openstreetmap.org/search?format=json&q={q}&countrycodes=ar&limit=5&accept-language=es&viewbox=-68.5,-25.5,-64.5,-30.0&bounded=1"
            resp = await client.get(url, headers={"User-Agent": "MoliApp/1.0"})
            local = resp.json() if resp.status_code == 200 else []
            
            results = []
            ids = set()
            for f in (local or []):
                ids.add(str(f.get("place_id")))
                results.append({
                    "id": str(f.get("place_id")),
                    "name": (f.get("display_name") or "").split(",")[0],
                    "address": f.get("display_name", ""),
                    "latitude": float(f.get("lat", 0)),
                    "longitude": float(f.get("lon", 0)),
                })
            
            if len(results) < 3:
                url2 = f"https://nominatim.openstreetmap.org/search?format=json&q={q}&countrycodes=ar&limit=4&accept-language=es"
                resp2 = await client.get(url2, headers={"User-Agent": "MoliApp/1.0"})
                broad = resp2.json() if resp2.status_code == 200 else []
                for f in (broad or []):
                    pid = str(f.get("place_id"))
                    if pid not in ids:
                        results.append({
                            "id": pid,
                            "name": (f.get("display_name") or "").split(",")[0],
                            "address": f.get("display_name", ""),
                            "latitude": float(f.get("lat", 0)),
                            "longitude": float(f.get("lon", 0)),
                        })
            
            return {"results": results[:6]}
    except Exception as e:
        print(f"Nominatim search error: {e}")
        return {"results": []}

async def _google_reverse(lat: float, lng: float):
    key = os.getenv("GOOGLE_MAPS_KEY", "")
    if not key:
        return {"address": "Ubicación desconocida"}
    
    async with httpx.AsyncClient(timeout=8) as client:
        url = f"https://maps.googleapis.com/maps/api/geocode/json?latlng={lat},{lng}&key={key}&language=es"
        resp = await client.get(url)
        data = resp.json()
        
        if data.get("results"):
            r = data["results"][0]
            addr = r.get("formatted_address", "Ubicación desconocida")
            # Shorten: take first 2 parts
            parts = addr.split(",")
            short = ", ".join(p.strip() for p in parts[:2]) if len(parts) > 2 else addr
            return {"address": short}
        return {"address": "Ubicación desconocida"}

async def _nominatim_reverse(lat: float, lng: float):
    async with httpx.AsyncClient(timeout=8) as client:
        url = f"https://nominatim.openstreetmap.org/reverse?format=json&lat={lat}&lon={lng}&accept-language=es&zoom=18"
        resp = await client.get(url, headers={"User-Agent": "MoliApp/1.0"})
        data = resp.json()
        
        if data.get("address"):
            a = data["address"]
            street = a.get("road") or a.get("pedestrian") or ""
            number = a.get("house_number") or ""
            city = a.get("city") or a.get("town") or a.get("village") or ""
            parts = [p for p in [street, number, city] if p]
            return {"address": ", ".join(parts) or "Ubicación desconocida"}
        return {"address": (data.get("display_name") or "Ubicación desconocida").split(",")[0]}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
