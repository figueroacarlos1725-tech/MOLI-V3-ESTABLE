"""Moli Trabajos - Jobs marketplace routes"""
from fastapi import APIRouter, HTTPException, Depends, Query, Body
from typing import Optional, List
from datetime import datetime, timezone, timedelta
from pymongo import ReturnDocument
from database import db
from utils import generate_id, get_current_user, get_settings

router = APIRouter()
MINIMUM_JOB_BUDGET = 15000
MINIMUM_PAPERWORK_BUDGET = 10000
JOB_CANCELLATION_PENALTY_RATE = 0.10
PROFESSIONAL_FREE_CANCEL_SECONDS = 120
PENALIZED_CANCELLATIONS_BEFORE_BLOCK = 3

PRIVATE_JOB_FIELDS = {"address", "location", "images"}

async def _store_client_notification(client_id: str, event_type: str, title: str, body: str, job_id: str) -> None:
    await db.app_notifications.insert_one({
        "notification_id": generate_id("not_"), "user_id": client_id,
        "type": event_type, "title": title, "body": body, "job_id": job_id,
        "read": False, "created_at": datetime.now(timezone.utc),
    })

def _is_admin(user: dict) -> bool:
    return user.get("user_type") == "admin"

def _is_participant(job: dict, user: dict) -> bool:
    return user.get("user_id") in {job.get("client_id"), job.get("assigned_to")}

def _can_view_exact_job(job: dict, user: dict) -> bool:
    return _is_admin(user) or _is_participant(job, user)

def _redact_job(job: dict) -> dict:
    result = dict(job)
    for field in PRIVATE_JOB_FIELDS:
        result.pop(field, None)
    return result

def _job_for_user(job: dict, user: dict) -> dict:
    return dict(job) if _can_view_exact_job(job, user) else _redact_job(job)

async def _require_professional(user: dict, *, available: bool = False) -> dict:
    profile = await db.professional_profiles.find_one({"user_id": user["user_id"]})
    if not profile:
        raise HTTPException(status_code=403, detail="Se requiere un perfil profesional")
    if profile.get("is_blocked"):
        raise HTTPException(status_code=403, detail="Tu cuenta profesional está bloqueada")
    if available and not profile.get("is_available", False):
        raise HTTPException(status_code=403, detail="El profesional no está disponible")
    return profile

# ─── Default categories ────────────────
DEFAULT_CATEGORIES = [
    {"id": "electricista", "name": "Electricista", "icon": "flash", "color": "#FF9500"},
    {"id": "plomero", "name": "Plomero", "icon": "water", "color": "#007AFF"},
    {"id": "limpieza", "name": "Limpieza", "icon": "sparkles", "color": "#34C759"},
    {"id": "mudanza", "name": "Mudanza", "icon": "cube", "color": "#AF52DE"},
    {"id": "pintura", "name": "Pintura", "icon": "color-palette", "color": "#FF3B30"},
    {"id": "jardineria", "name": "Jardinería", "icon": "leaf", "color": "#00C853"},
    {"id": "carpinteria", "name": "Carpintería", "icon": "hammer", "color": "#8B4513"},
    {"id": "mecanica", "name": "Mecánica", "icon": "construct", "color": "#636366"},
    {"id": "tecnologia", "name": "Tecnología", "icon": "laptop", "color": "#5856D6"},
    {"id": "tramites", "name": "Trámites", "icon": "document-text", "color": "#0A84FF"},
    {"id": "otro", "name": "Otro", "icon": "ellipsis-horizontal", "color": "#8E8E93"},
]


# ─── CATEGORIES ────────────────

@router.get("/api/jobs/categories")
async def get_job_categories():
    cats = await db.job_categories.find({}, {"_id": 0}).to_list(50)
    if not cats:
        # Seed defaults
        for c in DEFAULT_CATEGORIES:
            c["category_id"] = c["id"]
            c["is_active"] = True
        await db.job_categories.insert_many(DEFAULT_CATEGORIES)
        cats = DEFAULT_CATEGORIES
    return {"categories": cats}

@router.get("/api/jobs/professionals/available")
async def get_available_professionals(user: dict = Depends(get_current_user)):
    """Privacy-safe preview for the client home screen."""
    profiles = await db.professional_profiles.find(
        {"is_available": True},
        {"_id": 0, "user_id": 1, "name": 1, "categories": 1, "rating": 1, "total_jobs": 1},
    ).sort("rating", -1).limit(12).to_list(12)
    return {"professionals": profiles}


# ─── PROFESSIONAL PROFILE ────────────────

@router.get("/api/jobs/professional/profile")
async def get_professional_profile(user: dict = Depends(get_current_user)):
    profile = await db.professional_profiles.find_one(
        {"user_id": user["user_id"]}, {"_id": 0}
    )
    return {"profile": profile, "has_profile": profile is not None}


@router.put("/api/jobs/professional/profile")
async def update_professional_profile(
    data: dict = Body(...),
    user: dict = Depends(get_current_user)
):
    now = datetime.now(timezone.utc)
    
    existing = await db.professional_profiles.find_one({"user_id": user["user_id"]})
    if existing:
        # Only update fields that are explicitly provided
        update_fields: dict = {"updated_at": now}
        if "categories" in data:
            update_fields["categories"] = data["categories"]
        if "description" in data:
            update_fields["description"] = data["description"]
        if "hourly_rate" in data:
            update_fields["hourly_rate"] = data["hourly_rate"]
        if "portfolio_images" in data:
            update_fields["portfolio_images"] = data["portfolio_images"]
        if "is_available" in data:
            update_fields["is_available"] = data["is_available"]
        if "location" in data:
            update_fields["location"] = data["location"]
        if "name" in data:
            update_fields["name"] = data["name"]
        
        await db.professional_profiles.update_one(
            {"user_id": user["user_id"]},
            {"$set": update_fields}
        )
        result = await db.professional_profiles.find_one({"user_id": user["user_id"]}, {"_id": 0})
    else:
        profile_data = {
            "user_id": user["user_id"],
            "name": data.get("name", user.get("name", "")),
            "categories": data.get("categories", []),
            "description": data.get("description", ""),
            "hourly_rate": data.get("hourly_rate", 0),
            "portfolio_images": data.get("portfolio_images", []),
            "is_available": data.get("is_available", True),
            "location": data.get("location"),
            "rating": 5.0,
            "total_jobs": 0,
            "created_at": now,
            "updated_at": now,
        }
        await db.professional_profiles.insert_one(profile_data)
        profile_data.pop("_id", None)
        result = profile_data
    
    # Serialize datetimes
    if result:
        for k in ["updated_at", "created_at"]:
            if k in result and hasattr(result[k], 'isoformat'):
                result[k] = result[k].isoformat()
    return {"status": "updated", "profile": result}


# ─── JOB POSTS (Client creates) ────────────────

@router.post("/api/jobs/post")
async def create_job_post(
    data: dict = Body(...),
    user: dict = Depends(get_current_user)
):
    now = datetime.now(timezone.utc)
    try:
        budget = float(data.get("budget", 0))
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="El presupuesto debe ser un importe válido")
    category = data.get("category", "otro")
    minimum_budget = MINIMUM_PAPERWORK_BUDGET if category == "tramites" else MINIMUM_JOB_BUDGET
    if budget < minimum_budget:
        raise HTTPException(status_code=422, detail=f"El presupuesto mínimo para esta categoría es ${minimum_budget:,.0f}")
    job = {
        "job_id": generate_id("job_"),
        "client_id": user["user_id"],
        "client_name": user.get("name", "Cliente"),
        "category": category,
        "title": data.get("title", ""),
        "description": data.get("description", ""),
        "budget": budget,
        "location": data.get("location"),
        "address": data.get("address", ""),
        "images": data.get("images", []),
        "status": "open",  # open, reviewing, assigned, in_progress, completed, cancelled
        "assigned_to": None,
        "reviewing_by": None,  # professional currently reviewing (30s lock)
        "reviewing_until": None,
        "offers_count": 0,
        "created_at": now,
        "updated_at": now,
    }
    await db.job_posts.insert_one(job)
    job.pop("_id", None)
    # Serialize datetime for JSON
    job["created_at"] = job["created_at"].isoformat() if hasattr(job["created_at"], 'isoformat') else str(job["created_at"])
    job["updated_at"] = job["updated_at"].isoformat() if hasattr(job["updated_at"], 'isoformat') else str(job["updated_at"])

    # Notify all available professionals via WebSocket (regardless of category)
    try:
        from websocket_manager import manager
        category = data.get("category", "otro")
        # Notify ALL available professionals - they can decide based on category
        pros = await db.professional_profiles.find(
            {"is_available": True},
            {"_id": 0, "user_id": 1}
        ).to_list(200)
        
        notified = 0
        for pro in pros:
            if pro["user_id"] != user["user_id"]:
                try:
                    await manager.send_personal_message({
                        "type": "new_job_available",
                        "job_id": job["job_id"],
                        "category": category,
                        "title": job["title"],
                        "budget": job["budget"],
                        "client_name": job["client_name"],
                    }, pro["user_id"])
                    notified += 1
                except:
                    pass
        
        print(f"Job {job['job_id']} notified {notified} professionals")
        
        # Also send push notifications
        try:
            from notifications import send_push_to_multiple
            pro_ids = [p["user_id"] for p in pros if p["user_id"] != user["user_id"]]
            if pro_ids:
                await send_push_to_multiple(
                    pro_ids,
                    f"Nuevo trabajo: {job['title']}",
                    f"${job['budget']} · {category}",
                    {"type": "new_job", "job_id": job["job_id"]}
                )
        except:
            pass
    except Exception as e:
        print(f"Job notification error: {e}")

    return {"status": "created", "job": job}


@router.get("/api/jobs/posts")
async def list_job_posts(
    category: Optional[str] = None,
    status: str = "open",
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    user: dict = Depends(get_current_user)
):
    from datetime import timedelta
    now = datetime.now(timezone.utc)
    thirty_min_ago = (now - timedelta(minutes=30)).isoformat()
    
    # Auto-expire old open jobs (>30 min)
    await db.job_posts.update_many(
        {"status": "open", "created_at": {"$lt": now - timedelta(minutes=30)}},
        {"$set": {"status": "expired", "updated_at": now}}
    )
    # Also release reviewing jobs with expired locks
    await db.job_posts.update_many(
        {"status": "reviewing", "reviewing_until": {"$lt": now.isoformat()}},
        {"$set": {"status": "open", "reviewing_by": None, "reviewing_name": None, "reviewing_until": None}}
    )
    
    if status == "open":
        query = {"status": {"$in": ["open", "reviewing"]}}
    else:
        query = {"status": status}
    
    if category:
        query["category"] = category
    
    await _require_professional(user)
    jobs = await db.job_posts.find(query, {"_id": 0}).sort("created_at", -1).to_list(50)
    jobs = [_job_for_user(job, user) for job in jobs]
    return {"jobs": jobs, "count": len(jobs)}


@router.get("/api/jobs/my-offers")
async def get_my_offers(user: dict = Depends(get_current_user)):
    offers = await db.job_offers.find(
        {"professional_id": user["user_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    
    # Enrich with job details
    for o in offers:
        job = await db.job_posts.find_one({"job_id": o["job_id"]}, {"_id": 0, "title": 1, "status": 1, "category": 1})
        if job:
            o["job_title"] = job.get("title")
            o["job_status"] = job.get("status")
            o["job_category"] = job.get("category")
        if isinstance(o.get("created_at"), datetime):
            o["created_at"] = o["created_at"].isoformat()
    
    return {"offers": offers}


@router.get("/api/jobs/my-posts")
async def get_my_job_posts(user: dict = Depends(get_current_user)):
    jobs = await db.job_posts.find(
        {"client_id": user["user_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return {"jobs": jobs}


@router.get("/api/jobs/my-active")
async def get_my_active_jobs(user: dict = Depends(get_current_user)):
    """Get active jobs assigned to this professional"""
    jobs = await db.job_posts.find(
        {"assigned_to": user["user_id"], "status": {"$in": ["assigned", "in_progress", "pending_completion"]}},
        {"_id": 0}
    ).sort("updated_at", -1).to_list(20)
    return {"jobs": jobs}



@router.get("/api/jobs/detail/{job_id}")
async def get_job_detail(job_id: str, user: dict = Depends(get_current_user)):
    job = await db.job_posts.find_one({"job_id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Trabajo no encontrado")
    
    offers = []
    if job.get("client_id") == user["user_id"] or _is_admin(user):
        offers = await db.job_offers.find({"job_id": job_id}, {"_id": 0}).to_list(20)
    
    return {"job": _job_for_user(job, user), "offers": offers}


# ─── JOB REVIEW (30-second lock) ────────────────

@router.post("/api/jobs/{job_id}/review")
async def start_job_review(
    job_id: str,
    user: dict = Depends(get_current_user)
):
    """Professional starts reviewing a job - 30 second lock"""
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    await _require_professional(user, available=True)
    
    job = await db.job_posts.find_one({"job_id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Trabajo no encontrado")
    
    if job.get("client_id") == user["user_id"]:
        raise HTTPException(status_code=403, detail="No podés revisar tu propio trabajo")
    
    # Lock job for 30 seconds
    review_until = now + timedelta(seconds=30)
    locked = await db.job_posts.find_one_and_update(
        {"job_id": job_id, "$or": [
            {"status": "open"},
            {"status": "reviewing", "reviewing_by": user["user_id"]},
            {"status": "reviewing", "reviewing_until": {"$lte": now_iso}},
        ]},
        {"$set": {
            "status": "reviewing",
            "reviewing_by": user["user_id"],
            "reviewing_name": user.get("name", "Un profesional"),
            "reviewing_until": review_until.isoformat(),
            "updated_at": now,
        }}, return_document=ReturnDocument.AFTER
    )
    if not locked:
        raise HTTPException(status_code=409, detail="El trabajo no está disponible para revisión")

    professional_name = user.get("name", "Un profesional")
    await _store_client_notification(job["client_id"], "job_reviewing", "Están revisando tu solicitud", f"{professional_name} está evaluando tu pedido.", job_id)
    
    # Notify client that someone is reviewing
    try:
        from websocket_manager import manager
        await manager.send_personal_message({
            "type": "job_reviewing",
            "job_id": job_id,
            "professional_name": user.get("name", "Un profesional"),
            "message": f"{user.get('name', 'Un profesional')} está revisando tu propuesta...",
        }, job["client_id"])
    except:
        pass

    # Also notify the client when the app is minimized or in background.
    try:
        from notifications import send_push_notification
        await send_push_notification(
            job["client_id"],
            "Están revisando tu solicitud",
            f"{professional_name} está evaluando tu pedido y te avisaremos qué decide.",
            {"type": "job_reviewing", "job_id": job_id},
        )
    except Exception as push_error:
        print(f"Job reviewing push notification error: {push_error}")
    
    return {"status": "reviewing", "review_seconds": 30}


@router.post("/api/jobs/{job_id}/accept")
async def accept_job_after_review(
    job_id: str,
    user: dict = Depends(get_current_user)
):
    """Professional accepts job after reviewing"""
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    await _require_professional(user, available=True)
    
    job = await db.job_posts.find_one({"job_id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Trabajo no encontrado")
    
    if job.get("client_id") == user["user_id"]:
        raise HTTPException(status_code=403, detail="No podés aceptar tu propio trabajo")
    
    # Accept - assign to this professional
    assigned = await db.job_posts.find_one_and_update(
        {"job_id": job_id, "status": "reviewing", "reviewing_by": user["user_id"],
         "reviewing_until": {"$gt": now_iso}},
        {"$set": {
            "status": "assigned",
            "assigned_to": user["user_id"],
            "assigned_name": user.get("name", "Profesional"),
            "assigned_at": now,
            "agreed_price": job["budget"],
            "reviewing_by": None,
            "reviewing_name": None,
            "reviewing_until": None,
        }}, return_document=ReturnDocument.AFTER
    )
    if not assigned:
        raise HTTPException(status_code=409, detail="La revisión venció o el trabajo ya no está disponible")

    await _store_client_notification(job["client_id"], "job_accepted", "Profesional encontrado", f"{user.get('name', 'Un profesional')} aceptó tu solicitud.", job_id)
    
    # Notify client
    try:
        from websocket_manager import manager
        pro_profile = await db.professional_profiles.find_one({"user_id": user["user_id"]})
        await manager.send_personal_message({
            "type": "job_accepted",
            "job_id": job_id,
            "professional_id": user["user_id"],
            "professional_name": user.get("name", "Profesional"),
            "professional_rating": pro_profile.get("rating", 5.0) if pro_profile else 5.0,
            "message": f"¡{user.get('name', 'Un profesional')} aceptó tu trabajo!",
        }, job["client_id"])
    except:
        pass
    
    # Push notification
    try:
        from notifications import send_push_notification
        await send_push_notification(
            job["client_id"],
            "Profesional encontrado",
            f"{user.get('name', 'Un profesional')} aceptó tu trabajo y está en camino",
            {"type": "job_accepted", "job_id": job_id}
        )
    except:
        pass
    
    return {"status": "accepted", "job_id": job_id}


@router.post("/api/jobs/{job_id}/decline")
async def decline_job_after_review(
    job_id: str,
    user: dict = Depends(get_current_user)
):
    """Professional declines job after reviewing - release back to pool"""
    now = datetime.now(timezone.utc)
    await _require_professional(user)
    
    job = await db.job_posts.find_one({"job_id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Trabajo no encontrado")
    
    released = await db.job_posts.find_one_and_update(
            {"job_id": job_id, "status": "reviewing", "reviewing_by": user["user_id"]},
            {"$set": {
                "status": "open",
                "reviewing_by": None,
                "reviewing_name": None,
                "reviewing_until": None,
                "updated_at": now,
            }}, return_document=ReturnDocument.AFTER
        )
    if not released:
        raise HTTPException(status_code=409, detail="No estás revisando este trabajo")

    await _store_client_notification(job["client_id"], "job_declined", "Seguimos buscando", "El profesional no pudo tomar la solicitud. Ya estamos buscando otro.", job_id)
    
    # Notify client
    try:
        from websocket_manager import manager
        await manager.send_personal_message({
            "type": "job_declined",
            "job_id": job_id,
            "message": "El profesional no aceptó. Buscando otro profesional...",
        }, job["client_id"])
    except:
        pass
    
    return {"status": "declined", "job_id": job_id}

@router.post("/api/jobs/{job_id}/offer")
async def send_job_offer(
    job_id: str,
    data: dict = Body(...),
    user: dict = Depends(get_current_user)
):
    await _require_professional(user, available=True)
    job = await db.job_posts.find_one({"job_id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Trabajo no encontrado")
    if job.get("client_id") == user["user_id"]:
        raise HTTPException(status_code=403, detail="No podés aceptar tu propio trabajo")
    if job["status"] != "open":
        raise HTTPException(status_code=400, detail="Este trabajo ya no está disponible")
    
    now = datetime.now(timezone.utc)
    
    # Accept directly (first-come-first-served like rides)
    # Check if already assigned
    updated = await db.job_posts.find_one_and_update(
        {"job_id": job_id, "status": "open"},
        {"$set": {
            "status": "assigned",
            "assigned_to": user["user_id"],
            "assigned_name": user.get("name", "Profesional"),
            "assigned_at": now,
            "agreed_price": job["budget"],
        }},
    )
    if not updated:
        raise HTTPException(status_code=400, detail="Otro profesional ya aceptó este trabajo")
    
    # Notify client via WebSocket
    try:
        from websocket_manager import manager
        pro_profile = await db.professional_profiles.find_one({"user_id": user["user_id"]})
        await manager.send_personal_message({
            "type": "job_accepted",
            "job_id": job_id,
            "professional_id": user["user_id"],
            "professional_name": user.get("name", "Profesional"),
            "professional_rating": pro_profile.get("rating", 5.0) if pro_profile else 5.0,
            "message": "¡Un profesional aceptó tu trabajo y está en camino!",
        }, job["client_id"])
    except: pass
    
    # Send push notification to client
    try:
        from notifications import send_push_notification
        await send_push_notification(
            job["client_id"],
            "✅ Profesional encontrado",
            f"{user.get('name', 'Un profesional')} aceptó tu trabajo y está en camino",
            {"type": "job_accepted", "job_id": job_id}
        )
    except: pass
    
    return {"status": "accepted", "job": {k: v for k, v in {**job, "status": "assigned", "assigned_to": user["user_id"]}.items() if k != "_id"}}


@router.get("/api/jobs/my-offers")
async def get_my_offers(user: dict = Depends(get_current_user)):
    offers = await db.job_offers.find(
        {"professional_id": user["user_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    
    # Enrich with job details
    for o in offers:
        job = await db.job_posts.find_one({"job_id": o["job_id"]}, {"_id": 0, "title": 1, "status": 1, "category": 1})
        if job:
            o["job_title"] = job.get("title")
            o["job_status"] = job.get("status")
            o["job_category"] = job.get("category")
        if isinstance(o.get("created_at"), datetime):
            o["created_at"] = o["created_at"].isoformat()
    
    return {"offers": offers}


# ─── ACCEPT / COMPLETE / CANCEL ────────────────

@router.put("/api/jobs/{job_id}/accept-offer")
async def accept_job_offer(
    job_id: str,
    data: dict = Body(...),
    user: dict = Depends(get_current_user)
):
    job = await db.job_posts.find_one({"job_id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Trabajo no encontrado")
    if job["client_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Solo el cliente puede aceptar ofertas")
    
    offer_id = data.get("offer_id")
    offer = await db.job_offers.find_one({"offer_id": offer_id, "job_id": job_id, "status": "pending"})
    if not offer:
        raise HTTPException(status_code=404, detail="Oferta no encontrada")
    if job.get("status") != "open":
        raise HTTPException(status_code=409, detail="El trabajo ya no acepta ofertas")
    
    now = datetime.now(timezone.utc)
    
    # Accept the offer
    await db.job_offers.update_one(
        {"offer_id": offer_id},
        {"$set": {"status": "accepted", "accepted_at": now}}
    )
    # Reject other offers
    await db.job_offers.update_many(
        {"job_id": job_id, "offer_id": {"$ne": offer_id}},
        {"$set": {"status": "rejected"}}
    )
    # Update job
    await db.job_posts.update_one(
        {"job_id": job_id},
        {"$set": {
            "status": "assigned",
            "assigned_to": offer["professional_id"],
            "assigned_at": now,
            "agreed_price": offer["price"],
        }}
    )
    
    return {"status": "accepted", "professional_id": offer["professional_id"]}


@router.put("/api/jobs/{job_id}/status")
async def update_job_status(
    job_id: str,
    data: dict = Body(...),
    user: dict = Depends(get_current_user)
):
    job = await db.job_posts.find_one({"job_id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Trabajo no encontrado")
    if not _is_participant(job, user) and not _is_admin(user):
        raise HTTPException(status_code=403, detail="No autorizado")
    
    new_status = data.get("status")
    current_status = job.get("status")
    if new_status == "in_progress":
        if user["user_id"] != job.get("assigned_to") or current_status != "assigned":
            raise HTTPException(status_code=409, detail="Solo el profesional asignado puede iniciar el trabajo")
    elif new_status == "mark_completed":
        if current_status not in {"assigned", "in_progress"} or not _is_participant(job, user):
            raise HTTPException(status_code=409, detail="Transición de finalización inválida")
    elif new_status == "confirm_completed":
        if current_status != "pending_completion" or not _is_participant(job, user):
            raise HTTPException(status_code=409, detail="Transición de confirmación inválida")
    elif new_status == "cancelled":
        if current_status not in {"open", "reviewing", "assigned", "in_progress"}:
            raise HTTPException(status_code=409, detail="Este trabajo ya no se puede cancelar")
        if current_status in {"open", "reviewing"} and user["user_id"] != job.get("client_id") and not _is_admin(user):
            raise HTTPException(status_code=403, detail="Solo el cliente puede cancelar antes de la asignación")
    else:
        raise HTTPException(status_code=400, detail="Estado de trabajo inválido")
    now = datetime.now(timezone.utc)
    update: dict = {"updated_at": now}
    
    if new_status == "in_progress":
        update["status"] = "in_progress"
        update["started_at"] = now
    elif new_status == "mark_completed":
        # One party marks as done - needs confirmation from the other
        update["status"] = "pending_completion"
        update["completed_by"] = user["user_id"]
        update["completed_requested_at"] = now
        # Notify the other party
        other_id = job.get("assigned_to") if user["user_id"] == job["client_id"] else job["client_id"]
        if other_id:
            try:
                from websocket_manager import manager
                await manager.send_personal_message({
                    "type": "job_completion_request",
                    "job_id": job_id,
                    "requester_name": user.get("name", "Usuario"),
                    "message": f"{user.get('name', 'El otro usuario')} marcó el trabajo como terminado. Confirmá.",
                }, other_id)
            except:
                pass
    elif new_status == "confirm_completed":
        # Other party confirms completion
        if job.get("status") != "pending_completion":
            raise HTTPException(status_code=400, detail="El trabajo no está pendiente de confirmación")
        if job.get("completed_by") == user["user_id"]:
            raise HTTPException(status_code=400, detail="No podés confirmar tu propia solicitud")
        update["status"] = "completed"
        update["completed_at"] = now
        update["confirmed_by"] = user["user_id"]
        # Commission: 15% of budget to platform
        commission = round(job.get("budget", 0) * 0.15, 2)
        update["commission"] = commission
        if commission > 0 and job.get("assigned_to"):
            try:
                from utils import adjust_wallet_balance
                await adjust_wallet_balance(job["assigned_to"], -commission)
            except:
                pass
        # Increment professional's total jobs
        if job.get("assigned_to"):
            await db.professional_profiles.update_one(
                {"user_id": job["assigned_to"]},
                {"$inc": {"total_jobs": 1}}
            )
        # Notify both parties to rate
        for uid in [job.get("client_id"), job.get("assigned_to")]:
            if uid:
                try:
                    from websocket_manager import manager
                    await manager.send_personal_message({
                        "type": "job_completed",
                        "job_id": job_id,
                        "message": "¡Trabajo completado! Calificá tu experiencia.",
                    }, uid)
                except:
                    pass
    elif new_status == "cancelled":
        update["status"] = "cancelled"
        update["cancelled_by"] = user["user_id"]
        update["cancelled_at"] = now
        penalty_applies = False
        canceller_type = "admin"
        if not _is_admin(user):
            canceller_type = "client" if user["user_id"] == job.get("client_id") else "professional"
            if current_status in {"assigned", "in_progress"}:
                if canceller_type == "client":
                    penalty_applies = True
                else:
                    assigned_at = job.get("assigned_at")
                    penalty_applies = True
                    if isinstance(assigned_at, str):
                        try:
                            assigned_at = datetime.fromisoformat(assigned_at.replace("Z", "+00:00"))
                        except ValueError:
                            assigned_at = None
                    if isinstance(assigned_at, datetime):
                        if assigned_at.tzinfo is None:
                            assigned_at = assigned_at.replace(tzinfo=timezone.utc)
                        penalty_applies = (now - assigned_at).total_seconds() > PROFESSIONAL_FREE_CANCEL_SECONDS
        penalty = round(float(job.get("budget") or 0) * JOB_CANCELLATION_PENALTY_RATE, 2) if penalty_applies else 0
        update["cancellation_penalty"] = penalty
        update["cancellation_penalty_rate"] = JOB_CANCELLATION_PENALTY_RATE if penalty_applies else 0
        update["canceller_type"] = canceller_type
    updated = await db.job_posts.update_one(
        {"job_id": job_id, "status": current_status}, {"$set": update}
    )
    if updated.modified_count != 1:
        raise HTTPException(status_code=409, detail="El trabajo cambió de estado; actualizá e intentá de nuevo")

    penalty_info = {"penalty_applied": False, "penalty_amount": 0, "blocked": False}
    if new_status == "cancelled":
        penalty_amount = update.get("cancellation_penalty", 0)
        if penalty_amount > 0:
            from utils import adjust_wallet_balance
            await adjust_wallet_balance(user["user_id"], -penalty_amount)
            await db.wallet_transactions.insert_one({
                "transaction_id": generate_id("txn_"), "user_id": user["user_id"],
                "amount": -penalty_amount, "transaction_type": "job_cancel_penalty",
                "description": "Multa del 10% por cancelación de servicio aceptado",
                "job_id": job_id, "status": "completed", "created_at": now,
            })
            prior_strikes = await db.cancellation_records.count_documents({
                "user_id": user["user_id"], "service_type": "jobs", "penalty_amount": {"$gt": 0}
            })
            strike_count = prior_strikes + 1
            blocked = strike_count >= PENALIZED_CANCELLATIONS_BEFORE_BLOCK
            await db.cancellation_records.insert_one({
                "record_id": generate_id("cancel_"), "user_id": user["user_id"],
                "user_type": update.get("canceller_type"), "service_type": "jobs",
                "job_id": job_id, "penalty_amount": penalty_amount,
                "penalty_rate": JOB_CANCELLATION_PENALTY_RATE, "cancel_number": strike_count,
                "status": "charged", "block_applied": blocked, "created_at": now,
            })
            if blocked:
                await db.users.update_one({"user_id": user["user_id"]}, {"$set": {
                    "is_blocked": True, "block_reason": "job_penalized_cancellations", "blocked_at": now,
                }})
                await db.professional_profiles.update_one({"user_id": user["user_id"]}, {"$set": {
                    "is_blocked": True, "is_available": False, "block_reason": "job_penalized_cancellations", "blocked_at": now,
                }})
                await db.drivers.update_one({"driver_id": user["user_id"]}, {"$set": {
                    "is_blocked": True, "is_available": False, "is_online": False,
                    "block_reason": "job_penalized_cancellations", "blocked_at": now, "blocked_until": None,
                }})
            penalty_info = {
                "penalty_applied": True, "penalty_amount": penalty_amount,
                "penalty_rate": JOB_CANCELLATION_PENALTY_RATE, "strike_count": strike_count,
                "strikes_before_block": max(0, PENALIZED_CANCELLATIONS_BEFORE_BLOCK - strike_count),
                "blocked": blocked,
            }
        other_id = job.get("assigned_to") if user["user_id"] == job.get("client_id") else job.get("client_id")
        if other_id and not _is_admin(user):
            try:
                from websocket_manager import manager
                await manager.send_personal_message({
                    "type": "job_cancelled", "job_id": job_id,
                    "message": "El trabajo fue cancelado por la otra parte.",
                }, other_id)
            except Exception:
                pass

    return {"status": "updated", "job_status": update.get("status", new_status), **penalty_info}


@router.post("/api/jobs/{job_id}/rate")
async def rate_job(
    job_id: str,
    data: dict = Body(...),
    user: dict = Depends(get_current_user)
):
    job = await db.job_posts.find_one({"job_id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Trabajo no encontrado")
    if not _is_participant(job, user):
        raise HTTPException(status_code=403, detail="Solo los participantes pueden calificar")
    if job.get("status") != "completed":
        raise HTTPException(status_code=409, detail="Solo se puede calificar un trabajo completado")
    
    rating = data.get("rating", 5)
    if isinstance(rating, bool) or not isinstance(rating, (int, float)) or not 1 <= rating <= 5:
        raise HTTPException(status_code=400, detail="La calificación debe estar entre 1 y 5")
    existing_rating = await db.job_ratings.find_one({"job_id": job_id, "rater_id": user["user_id"]})
    if existing_rating:
        raise HTTPException(status_code=409, detail="Ya calificaste este trabajo")
    
    await db.job_ratings.insert_one({
        "job_id": job_id,
        "rater_id": user["user_id"],
        "rated_user_id": job.get("assigned_to") if user["user_id"] == job["client_id"] else job["client_id"],
        "rating": rating,
        "comment": data.get("comment", ""),
        "created_at": datetime.now(timezone.utc),
    })
    
    # Update professional rating
    pro_id = job.get("assigned_to")
    if pro_id:
        all_ratings = await db.job_ratings.find({"rated_user_id": pro_id}).to_list(500)
        if all_ratings:
            avg = sum(r["rating"] for r in all_ratings) / len(all_ratings)
            await db.professional_profiles.update_one(
                {"user_id": pro_id},
                {"$set": {"rating": round(avg, 2)}}
            )
    
    return {"status": "rated"}


# ─── ADMIN: TRABAJOS DASHBOARD ────────────────

@router.get("/api/admin/jobs/dashboard")
async def admin_jobs_dashboard(user: dict = Depends(get_current_user)):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    total_jobs = await db.job_posts.count_documents({})
    open_jobs = await db.job_posts.count_documents({"status": "open"})
    assigned_jobs = await db.job_posts.count_documents({"status": "assigned"})
    completed_jobs = await db.job_posts.count_documents({"status": "completed"})
    cancelled_jobs = await db.job_posts.count_documents({"status": "cancelled"})
    total_professionals = await db.professional_profiles.count_documents({})
    available_pros = await db.professional_profiles.count_documents({"is_available": True})
    
    # Revenue from completed jobs
    completed = await db.job_posts.find({"status": "completed"}, {"_id": 0, "agreed_price": 1, "budget": 1, "commission": 1}).to_list(1000)
    total_revenue = sum(j.get("agreed_price", j.get("budget", 0)) for j in completed)
    total_commission = sum(j.get("commission", 0) for j in completed)
    
    # Count penalties
    cancelled_with_penalty = await db.job_posts.count_documents({"status": "cancelled", "cancellation_penalty": {"$gt": 0}})
    penalties_total = 0
    penalty_jobs = await db.job_posts.find({"status": "cancelled", "cancellation_penalty": {"$gt": 0}}, {"_id": 0, "cancellation_penalty": 1}).to_list(500)
    penalties_total = sum(j.get("cancellation_penalty", 0) for j in penalty_jobs)
    
    return {
        "total_jobs": total_jobs,
        "open_jobs": open_jobs,
        "assigned_jobs": assigned_jobs,
        "completed_jobs": completed_jobs,
        "cancelled_jobs": cancelled_jobs,
        "total_professionals": total_professionals,
        "available_professionals": available_pros,
        "total_revenue": total_revenue,
        "total_commission": total_commission,
        "cancelled_with_penalty": cancelled_with_penalty,
        "penalties_total": penalties_total,
    }


@router.get("/api/admin/jobs/all")
async def admin_list_jobs(
    status: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    query = {}
    if status:
        query["status"] = status
    
    jobs = await db.job_posts.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    for j in jobs:
        if isinstance(j.get("created_at"), datetime):
            j["created_at"] = j["created_at"].isoformat()
        if isinstance(j.get("completed_at"), datetime):
            j["completed_at"] = j["completed_at"].isoformat()
    
    return {"jobs": jobs}


@router.get("/api/admin/jobs/professionals")
async def admin_list_professionals(user: dict = Depends(get_current_user)):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    pros = await db.professional_profiles.find({}, {"_id": 0}).to_list(100)
    for p in pros:
        u = await db.users.find_one({"user_id": p["user_id"]}, {"_id": 0, "email": 1, "phone": 1, "name": 1})
        if u:
            p["email"] = u.get("email", "")
            p["phone"] = u.get("phone", "")
            p["name"] = u.get("name", p.get("name", ""))
        if isinstance(p.get("created_at"), datetime):
            p["created_at"] = p["created_at"].isoformat()
        if isinstance(p.get("updated_at"), datetime):
            p["updated_at"] = p["updated_at"].isoformat()
    
    return {"professionals": pros}


@router.put("/api/admin/jobs/categories/{cat_id}")
async def admin_update_category(
    cat_id: str,
    data: dict = Body(...),
    user: dict = Depends(get_current_user)
):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    await db.job_categories.update_one(
        {"category_id": cat_id},
        {"$set": {
            "name": data.get("name"),
            "icon": data.get("icon"),
            "color": data.get("color"),
            "is_active": data.get("is_active", True),
        }}
    )
    return {"status": "updated"}


@router.delete("/api/admin/jobs/{job_id}")
async def admin_delete_job(
    job_id: str,
    user: dict = Depends(get_current_user)
):
    if user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    await db.job_posts.update_one({"job_id": job_id}, {"$set": {"status": "cancelled"}})
    return {"status": "cancelled"}

