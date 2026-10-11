"""Privacy-safe withdrawal notices for opportunity recipients, never external push."""
import logging
from fastapi.encoders import jsonable_encoder
from database import db
from websocket_manager import manager

async def notify_job_unavailable(job, actor_id, *, reviewing=False, until=None):
    from fleet_live import emit_fleet_changed
    await emit_fleet_changed(actor_id)
    try:
        audience = await db.job_opportunity_audiences.find_one({"job_id": job["job_id"]})
        if audience is not None:
            recipients = audience.get("recipient_ids", [])
        else:
            # Legacy jobs predate audience tracking; keep their existing available-profile audience.
            profiles = await db.professional_profiles.find({"is_available": True},
                {"_id": 0, "user_id": 1}).to_list(200)
            recipients = [profile.get("user_id") for profile in profiles]
        message = {"type": "job_under_review" if reviewing else "job_opportunity_taken",
            "job_id": job["job_id"], "status": "reviewing" if reviewing else "assigned",
            "message": "Otro profesional está revisando esta solicitud." if reviewing else
                       "Otro profesional aceptó esta solicitud."}
        if reviewing:
            message["reviewing_until"] = until
        await _send_to_others(recipients, {actor_id, job.get("client_id")}, message)
    except Exception:
        logging.getLogger(__name__).warning("Could not send job withdrawal notice")

async def notify_delivery_taken(delivery, actor_id):
    from fleet_live import emit_fleet_changed
    await emit_fleet_changed(actor_id)
    recipients = [offer.get("driver_id") for offer in delivery.get("offers", [])]
    await _send_to_others(recipients, {actor_id}, {"type": "delivery_opportunity_taken",
        "delivery_id": delivery["delivery_id"], "status": "assigned",
        "message": "Otro repartidor aceptó esta entrega."})

async def _send_to_others(recipients, excluded, message):
    payload = jsonable_encoder(message)
    for recipient in set(recipients) - excluded - {None, ""}:
        try:
            await manager.send_personal_message(payload, recipient)
        except Exception:
            logging.getLogger(__name__).warning("Could not deliver opportunity withdrawal notice")
