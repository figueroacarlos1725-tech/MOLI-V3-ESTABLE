"""Auth & User routes"""
from fastapi import APIRouter, HTTPException, Depends, Header, Body
from typing import Optional
from datetime import datetime, timezone

from database import db
from utils import generate_id, hash_password, verify_password, create_access_token, get_current_user
from models import UserCreate, UserLogin, UserResponse, TokenResponse, LocationPoint

router = APIRouter()


@router.post("/api/auth/register", response_model=TokenResponse)
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


@router.post("/api/auth/login", response_model=TokenResponse)
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


@router.post("/api/auth/social-login")
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


@router.get("/api/auth/me", response_model=UserResponse)
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


@router.put("/api/users/profile")
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


@router.get("/api/users/saved-locations")
async def get_saved_locations(user: dict = Depends(get_current_user)):
    locations = await db.saved_locations.find(
        {"user_id": user["user_id"]}, {"_id": 0}
    ).to_list(100)
    return {"locations": locations}


@router.post("/api/users/saved-locations")
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
