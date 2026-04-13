"""Chat routes"""
from fastapi import APIRouter, HTTPException, Depends, Query, Body
from typing import Optional
from datetime import datetime, timezone

from database import db
from websocket_manager import manager
from utils import generate_id, get_current_user
from models import ChatMessageCreate, ChatMessageResponse

router = APIRouter()


@router.post("/api/chat/messages", response_model=ChatMessageResponse)
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


@router.get("/api/chat/messages/{other_user_id}")
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


@router.get("/api/chat/conversations")
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


@router.post("/api/chat/send")
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
        "message_id": generate_id("msg_"),
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


@router.get("/api/chat/ride/{ride_id}")
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
