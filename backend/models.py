"""
Pydantic models for the Moli API
"""
from pydantic import BaseModel, Field, EmailStr, FiniteFloat
from typing import Optional, List, Dict, Any, Literal
from datetime import datetime


class UserBase(BaseModel):
    email: EmailStr
    name: str
    phone: Optional[str] = None
    profile_picture: Optional[str] = None

class UserCreate(UserBase):
    password: str
    user_type: str = "rider"
    is_professional: Optional[bool] = False
    vehicle_make: Optional[str] = None
    vehicle_model: Optional[str] = None
    vehicle_year: Optional[str] = None
    vehicle_color: Optional[str] = None
    plate_number: Optional[str] = None

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
    is_professional: bool = False
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
    service_type: str = "ride"  # "ride" or "delivery"

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
    sender_name: Optional[str] = None
    receiver_id: str
    ride_id: Optional[str] = None
    job_id: Optional[str] = None
    is_filtered: bool = False
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
    rider_block_after_cancels: Optional[int] = None
    rider_block_hours: Optional[int] = None
    cancellation_window_days: Optional[int] = None
    min_app_version: Optional[str] = None
    update_message: Optional[str] = None
    trabajos_mode: Optional[str] = None
    broadcast_enabled: Optional[bool] = None
    broadcast_after_rounds: Optional[int] = None


# ─── Admin inline models ─────────────────────────────────

class VehicleIconUpdate(BaseModel):
    icon_type: str = "emoji"
    emoji_value: Optional[str] = None
    image_data: Optional[str] = None

class AdminUserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    user_type: Optional[str] = None

class AdminCreateUser(BaseModel):
    name: str
    email: str
    phone: Optional[str] = ""
    password: str
    user_type: str = "rider"
    is_professional: bool = False

class BalanceUpdate(BaseModel):
    amount: FiniteFloat
    operation: Literal["set", "add", "subtract"] = "set"
    reason: str = ""

class EstimateRequest(BaseModel):
    distance_km: float
    duration_min: int

class BannerCreate(BaseModel):
    title: str
    description: str = ""
    image_url: str = ""
    link_url: str = ""
    bg_color: str = "#6B21A8"
    position: int = 0
    is_active: bool = True
    target_audience: str = "all"

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

class AdminCouponCreate(BaseModel):
    code: str
    discount_type: str = "percentage"
    discount_value: float = 10
    max_uses: int = 100
    min_fare: float = 0
    max_discount: float = 0
    valid_from: Optional[str] = None
    valid_until: Optional[str] = None
    active: bool = True

class CommissionUpdate(BaseModel):
    commission_type: str = "percentage"
    commission_value: float = 15

class DriverBlock(BaseModel):
    block_type: str = "permanent"
    block_duration: Optional[int] = None
    reason: str = ""

class PriorityUpdate(BaseModel):
    priority: int = 0

class ServiceTypesUpdate(BaseModel):
    service_types: list = ["economy"]

class ManualTripCreate(BaseModel):
    trip_type: str = "full"
    rider_name: str = ""
    rider_phone: str = ""
    rider_id: Optional[str] = None
    pickup_address: str = ""
    pickup_latitude: Optional[float] = None
    pickup_longitude: Optional[float] = None
    dropoff_address: str = ""
    dropoff_latitude: Optional[float] = None
    dropoff_longitude: Optional[float] = None
    vehicle_type: str = "economy"
    assigned_driver_id: Optional[str] = None
    notes: str = ""

class PaymentConfigUpdate(BaseModel):
    mercadopago_enabled: Optional[bool] = None
    mercadopago_public_key: Optional[str] = None
    mercadopago_access_token: Optional[str] = None
    astropay_enabled: Optional[bool] = None
    astropay_api_key: Optional[str] = None
    astropay_secret: Optional[str] = None
