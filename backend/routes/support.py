"""Support / AI chatbot routes"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional
from datetime import datetime, timezone
import os

from database import db
from websocket_manager import manager
from utils import generate_id, get_current_user, get_settings, SUPPORT_SYSTEM_PROMPT

router = APIRouter()


@router.post("/api/support/chat")
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


@router.post("/api/support/connect-dispatcher")
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


@router.get("/api/support/history")
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


@router.post("/api/support/message")
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


@router.get("/api/support/history")
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
