"""
Pydantic models for the Moli API
"""
from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime


class UserBase(BaseModel):
    email: EmailStr
    name: str
    phone: Optional[str] = None
    profile_picture: Optional[str] = None

class UserCreate(UserBase):
    password: str
    user_type: str = "rider"

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
    vehicle_type: str
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
    stops: Optional[List[LocationPoint]] = None
    ride_type: str = "standard"
    vehicle_type: str = "economy"
    scheduled_time: Optional[datetime] = None
    notes: Optional[str] = None
    payment_method: str = "cash"

class RideRequestResponse(BaseModel):
    request_id: str
    rider_id: str
    pickup_location: dict
    dropoff_location: dict
    stops: Optional[List[dict]] = None
    ride_type: str
    vehicle_type: str
    status: str
    estimated_fare: float
    estimated_distance: float
    estimated_duration: int
    created_at: datetime
    expires_at: Optional[datetime] = None
    bids: List[dict] = []

class BidCreate(BaseModel):
    request_id: str
    fare_amount: float
    estimated_arrival: int

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
    message_type: str = "text"

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
    transaction_type: str
    payment_method: str
    description: Optional[str] = None

class CouponCreate(BaseModel):
    code: str
    discount_type: str
    discount_value: float
    min_order_amount: float = 0
    max_uses: int = 100
    expires_at: datetime

class SettingsUpdate(BaseModel):
    map_provider: Optional[str] = None
    google_maps_key: Optional[str] = None
    mapbox_key: Optional[str] = None
    mercadopago_public_key: Optional[str] = None
    mercadopago_access_token: Optional[str] = None
    astropay_api_key: Optional[str] = None
    astropay_secret_key: Optional[str] = None
    firebase_config: Optional[dict] = None
    firebase_server_key: Optional[str] = None
    firebase_project_id: Optional[str] = None
    expo_push_token: Optional[str] = None
    base_fare: Optional[float] = None
    per_km_rate: Optional[float] = None
    per_minute_rate: Optional[float] = None
    commission_rate: Optional[float] = None
    currency: Optional[str] = None
    cancel_free_minutes: Optional[int] = None
    rider_cancel_penalty: Optional[float] = None
    driver_cancel_penalty: Optional[float] = None
    driver_max_negative_balance: Optional[float] = None
    driver_block_after_cancels: Optional[int] = None
    driver_block_hours: Optional[int] = None
    rider_max_pending_penalties: Optional[int] = None
    min_app_version: Optional[str] = None
    update_message: Optional[str] = None
