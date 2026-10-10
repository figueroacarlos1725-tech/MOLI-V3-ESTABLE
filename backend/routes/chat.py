"""Chat routes"""
from fastapi import APIRouter, HTTPException, Depends, Query, Body
from typing import Optional
from datetime import datetime, timezone
import re

from database import db
from websocket_manager import manager
from utils import generate_id, get_current_user
from models import ChatMessageCreate, ChatMessageResponse

router = APIRouter()

PHONE_REGEX = re.compile(r'(?<!\w)(?:\+?\d[\s().-]*){7,15}(?!\w)')
EMAIL_REGEX = re.compile(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}')
SOCIAL_REGEX = re.compile(
    r'(?i)(?:https?://|www\.)\S+|(?:wa\.me|t\.me)/\S+|'
    r'(?:(?:whats?app|telegram|instagram|facebook|tiktok)\s*[:@]?\s*)@[a-z0-9._-]+'
)
CONTACT_REDACTION = '••• dato de contacto protegido •••'


def validate_message(text):
    if not isinstance(text, str) or not 1 <= len(text.strip()) <= 500:
        raise HTTPException(422, "Ingresá un mensaje de entre 1 y 500 caracteres")
    return text.strip()


def filter_contact_info(text: str):
    """Redact contact data before it is stored or delivered to another user."""
    value = (text or '').strip()
    if not value:
        return value, False
    filtered = PHONE_REGEX.sub(CONTACT_REDACTION, value)
    filtered = EMAIL_REGEX.sub(CONTACT_REDACTION, filtered)
    filtered = SOCIAL_REGEX.sub(CONTACT_REDACTION, filtered)
    return filtered, filtered != value


@router.post("/api/chat/messages", response_model=ChatMessageResponse)
async def send_message(message: ChatMessageCreate, user: dict = Depends(get_current_user)):
    text = validate_message(message.message)
    # Generic conversations cannot bypass assignment-specific chat permissions.
    pair = [user["user_id"], message.receiver_id]
    ride = await db.rides.find_one({"rider_id": {"$in": pair}, "driver_id": {"$in": pair}, "status": {"$in": ["accepted", "arrived", "started"]}})
    job = await db.job_posts.find_one({"client_id": {"$in": pair}, "assigned_to": {"$in": pair}, "status": {"$in": ["assigned", "in_progress", "pending_completion"]}})
    if message.receiver_id == user["user_id"] or not (ride or job):
        raise HTTPException(403, "No active service with this participant")
    if message.message_type != "text":
        raise HTTPException(422, "Only text messages are supported")
    message_id = generate_id("msg_")
    now = datetime.now(timezone.utc)
    
    filtered_message, was_filtered = filter_contact_info(text)
    message_doc = {
        "message_id": message_id,
        "sender_id": user["user_id"],
        "sender_name": user.get("name", "Usuario"),
        "receiver_id": message.receiver_id,
        "message": filtered_message,
        "message_type": message.message_type,
        "is_read": False,
        "created_at": now
    }
    entity = {"job_id": job["job_id"]} if job else {"ride_id": ride["ride_id"]}
    message_doc.update(entity)
    message_doc["is_filtered"] = was_filtered
    
    await db.chat_messages.insert_one(message_doc)
    
    # Send via WebSocket
    await manager.send_personal_message(
        {"type": "new_message", **{k: v for k, v in message_doc.items() if k != "_id"}},
        message.receiver_id
    )
    
    return ChatMessageResponse(**{k: v for k, v in message_doc.items() if k != "_id"})


@router.get("/api/chat/messages/{other_user_id}")
async def get_messages(
    other_user_id: str,
    limit: int = Query(50, ge=1, le=200),
    user: dict = Depends(get_current_user)
):
    messages = await db.chat_messages.find({
        "$or": [
            {"sender_id": user["user_id"], "receiver_id": other_user_id},
            {"sender_id": other_user_id, "receiver_id": user["user_id"]}
        ]
    }, {"_id": 0, "original_message": 0}).sort("created_at", -1).to_list(limit)
    
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
    message = validate_message(message)
    ride = await db.rides.find_one({"ride_id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Viaje no encontrado")
    
    if user["user_id"] not in [ride["rider_id"], ride.get("driver_id")]:
        raise HTTPException(status_code=403, detail="No autorizado")
    if ride.get("status") not in ("accepted", "arrived", "started"):
        raise HTTPException(409, "El viaje no está activo")
    
    receiver_id = ride["driver_id"] if user["user_id"] == ride["rider_id"] else ride["rider_id"]
    
    filtered_message, was_filtered = filter_contact_info(message)
    msg = {
        "message_id": generate_id("msg_"),
        "ride_id": ride_id,
        "sender_id": user["user_id"],
        "sender_name": user.get("name", "Usuario"),
        "receiver_id": receiver_id,
        "message": filtered_message,
        "is_filtered": was_filtered,
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
        {"ride_id": ride_id}, {"_id": 0, "original_message": 0}
    ).sort("created_at", 1).to_list(200)
    
    return {"messages": messages}


# ─── Job Chat ──────────────────────

@router.post("/api/chat/job/send")
async def send_job_chat_message(
    data: dict = Body(...),
    user: dict = Depends(get_current_user),
):
    """Send a chat message within a job"""
    job_id = data.get("job_id", "")
    message_text = validate_message(data.get("message", ""))
    
    if not job_id or not message_text:
        raise HTTPException(status_code=400, detail="job_id and message required")
    
    job = await db.job_posts.find_one({"job_id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Trabajo no encontrado")
    
    # Verify user is part of this job
    allowed = [job.get("client_id"), job.get("assigned_to")]
    if user["user_id"] not in allowed:
        raise HTTPException(status_code=403, detail="No autorizado")
    if job.get("status") not in ("assigned", "in_progress", "pending_completion"):
        raise HTTPException(409, "El trabajo no está activo")
    
    # Determine receiver
    if user["user_id"] == job.get("client_id"):
        receiver_id = job.get("assigned_to")
    else:
        receiver_id = job.get("client_id")
    
    if not receiver_id:
        raise HTTPException(status_code=400, detail="No hay otra parte asignada al trabajo")
    
    # Filter contact info
    filtered_msg, was_filtered = filter_contact_info(message_text)
    
    msg = {
        "message_id": generate_id("msg_"),
        "job_id": job_id,
        "sender_id": user["user_id"],
        "sender_name": user.get("name", "Usuario"),
        "receiver_id": receiver_id,
        "message": filtered_msg,
        "is_filtered": was_filtered,
        "is_ai": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.chat_messages.insert_one(msg)
    
    ws_msg = {k: v for k, v in msg.items() if k != "_id"}
    await manager.send_personal_message(
        {"type": "new_message", **ws_msg},
        receiver_id
    )
    
    return {"status": "sent", "message_id": msg["message_id"], "was_filtered": was_filtered, "message": ws_msg}


@router.get("/api/chat/job/{job_id}")
async def get_job_chat_messages(
    job_id: str,
    user: dict = Depends(get_current_user)
):
    """Get chat messages for a job"""
    job = await db.job_posts.find_one({"job_id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Trabajo no encontrado")
    
    allowed = [job.get("client_id"), job.get("assigned_to")]
    if user["user_id"] not in allowed and user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="No autorizado")
    
    messages = await db.chat_messages.find(
        {"job_id": job_id}, {"_id": 0, "original_message": 0}
    ).sort("created_at", 1).to_list(200)
    
    return {"messages": messages}


@router.post("/api/chat/ride/send-filtered")
async def send_ride_chat_filtered(
    data: dict = Body(...),
    user: dict = Depends(get_current_user),
):
    """Send a filtered chat message within a ride"""
    ride_id = data.get("ride_id", "")
    message_text = validate_message(data.get("message", ""))
    
    if not ride_id or not message_text:
        raise HTTPException(status_code=400, detail="ride_id and message required")
    
    ride = await db.rides.find_one({"ride_id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Viaje no encontrado")
    
    if user["user_id"] not in [ride["rider_id"], ride.get("driver_id")]:
        raise HTTPException(status_code=403, detail="No autorizado")
    if ride.get("status") not in ("accepted", "arrived", "started"):
        raise HTTPException(409, "El viaje no está activo")
    
    receiver_id = ride["driver_id"] if user["user_id"] == ride["rider_id"] else ride["rider_id"]
    
    # Filter contact info
    filtered_msg, was_filtered = filter_contact_info(message_text)
    
    msg = {
        "message_id": generate_id("msg_"),
        "ride_id": ride_id,
        "sender_id": user["user_id"],
        "sender_name": user.get("name", "Usuario"),
        "receiver_id": receiver_id,
        "message": filtered_msg,
        "is_filtered": was_filtered,
        "is_ai": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.chat_messages.insert_one(msg)
    
    ws_msg = {k: v for k, v in msg.items() if k != "_id"}
    await manager.send_personal_message(
        {"type": "new_message", **ws_msg},
        receiver_id
    )
    
    return {"status": "sent", "message_id": msg["message_id"], "was_filtered": was_filtered}
