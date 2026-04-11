"""Push notification routes"""
from fastapi import APIRouter, HTTPException, Depends, Query, Body
from datetime import datetime, timezone

from database import db
from utils import get_current_user
from notifications import send_push_notification, send_push_to_multiple

router = APIRouter()


@router.post("/api/push-token")
async def register_push_token(data: dict = Body(...), user: dict = Depends(get_current_user)):
    """Register Expo push token for the current user"""
    token = data.get("token")
    if not token:
        raise HTTPException(400, "Token requerido")
    
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"push_token": token}}
    )
    return {"status": "registered"}
