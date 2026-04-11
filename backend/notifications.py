"""
Push Notifications module - Expo Push API
"""
import httpx
from typing import List, Optional
from database import db

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


async def send_push_notification(
    user_id: str,
    title: str,
    body: str,
    data: Optional[dict] = None,
    sound: str = "default",
    badge: int = 1,
) -> dict:
    """Send push notification to a specific user via Expo Push API"""
    # Get user's push token
    user = await db.users.find_one({"user_id": user_id}, {"push_token": 1})
    if not user or not user.get("push_token"):
        return {"status": "skipped", "reason": "no_push_token"}
    
    token = user["push_token"]
    
    message = {
        "to": token,
        "title": title,
        "body": body,
        "sound": sound,
        "badge": badge,
        "data": data or {},
    }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                EXPO_PUSH_URL,
                json=message,
                headers={"Content-Type": "application/json"},
                timeout=10,
            )
            result = response.json()
            
            # Log notification
            await db.notification_logs.insert_one({
                "user_id": user_id,
                "title": title,
                "body": body,
                "data": data,
                "push_token": token[:20] + "...",
                "response": result,
                "status": "sent",
            })
            
            return {"status": "sent", "response": result}
    except Exception as e:
        await db.notification_logs.insert_one({
            "user_id": user_id,
            "title": title,
            "body": body,
            "status": "error",
            "error": str(e),
        })
        return {"status": "error", "error": str(e)}


async def send_push_to_multiple(
    user_ids: List[str],
    title: str,
    body: str,
    data: Optional[dict] = None,
) -> dict:
    """Send push notification to multiple users"""
    # Get all push tokens
    users = await db.users.find(
        {"user_id": {"$in": user_ids}, "push_token": {"$exists": True, "$ne": None}},
        {"user_id": 1, "push_token": 1}
    ).to_list(100)
    
    if not users:
        return {"status": "skipped", "reason": "no_tokens", "count": 0}
    
    messages = []
    for user in users:
        messages.append({
            "to": user["push_token"],
            "title": title,
            "body": body,
            "sound": "default",
            "data": data or {},
        })
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                EXPO_PUSH_URL,
                json=messages,
                headers={"Content-Type": "application/json"},
                timeout=15,
            )
            return {"status": "sent", "count": len(messages), "response": response.json()}
    except Exception as e:
        return {"status": "error", "error": str(e), "count": 0}


# ─── Notification templates ─────────────────────

async def notify_ride_accepted(rider_id: str, driver_name: str, ride_id: str):
    await send_push_notification(
        rider_id,
        "Conductor en camino",
        f"{driver_name} aceptó tu viaje y va en camino.",
        data={"type": "ride_accepted", "ride_id": ride_id}
    )

async def notify_driver_arrived(rider_id: str, driver_name: str, ride_id: str):
    await send_push_notification(
        rider_id,
        "Tu conductor llegó",
        f"{driver_name} está esperándote en el punto de recogida.",
        data={"type": "driver_arrived", "ride_id": ride_id}
    )

async def notify_ride_completed(rider_id: str, fare: float, ride_id: str):
    await send_push_notification(
        rider_id,
        "Viaje completado",
        f"Tu viaje finalizó. Total: ${fare:,.0f}",
        data={"type": "ride_completed", "ride_id": ride_id}
    )

async def notify_ride_cancelled(user_id: str, cancelled_by: str, ride_id: str):
    await send_push_notification(
        user_id,
        "Viaje cancelado",
        f"El viaje fue cancelado por el {cancelled_by}.",
        data={"type": "ride_cancelled", "ride_id": ride_id}
    )

async def notify_new_ride_offer(driver_id: str, pickup_address: str, fare: float, request_id: str):
    await send_push_notification(
        driver_id,
        "Nuevo viaje disponible",
        f"Recogida: {pickup_address} - ${fare:,.0f}",
        data={"type": "ride_offer", "request_id": request_id}
    )

async def notify_payment_received(driver_id: str, amount: float):
    await send_push_notification(
        driver_id,
        "Pago recibido",
        f"Se acreditaron ${amount:,.0f} en tu wallet.",
        data={"type": "payment_received"}
    )

async def notify_document_status(driver_id: str, status: str, doc_type: str):
    if status == "approved":
        title = "Documento aprobado"
        body = f"Tu {doc_type} fue verificado exitosamente."
    else:
        title = "Documento rechazado"
        body = f"Tu {doc_type} fue rechazado. Por favor, volvé a subirlo."
    
    await send_push_notification(
        driver_id, title, body,
        data={"type": "document_status", "status": status, "doc_type": doc_type}
    )

async def notify_admin_message(user_id: str, message: str):
    await send_push_notification(
        user_id,
        "Mensaje de soporte",
        message[:100],
        data={"type": "admin_message"}
    )
