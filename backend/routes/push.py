"""Push notification routes"""
from fastapi import APIRouter, HTTPException, Depends, Query, Body
from datetime import datetime, timezone

from database import db
from utils import get_current_user
from notifications import send_push_notification, send_push_to_multiple

router = APIRouter()


@router.get("/api/notifications/me")
async def get_my_notifications(limit: int = Query(30, ge=1, le=100), user: dict = Depends(get_current_user)):
    items = await db.app_notifications.find(
        {"user_id": user["user_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(limit)
    unread = await db.app_notifications.count_documents({"user_id": user["user_id"], "read": False})
    return {"notifications": items, "unread_count": unread}


@router.put("/api/notifications/read-all")
async def read_all_notifications(user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    result = await db.app_notifications.update_many(
        {"user_id": user["user_id"], "read": False},
        {"$set": {"read": True, "read_at": now}},
    )
    return {"status": "updated", "modified": result.modified_count}


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
