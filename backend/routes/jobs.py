"""Moli Trabajos - Jobs marketplace routes"""
from fastapi import APIRouter, HTTPException, Depends, Query, Body
from typing import Optional, List
from datetime import datetime, timezone
from database import db
from utils import generate_id, get_current_user, get_settings

router = APIRouter()

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
    job = {
        "job_id": generate_id("job_"),
        "client_id": user["user_id"],
        "client_name": user.get("name", "Cliente"),
        "category": data.get("category", "otro"),
        "title": data.get("title", ""),
        "description": data.get("description", ""),
        "budget": data.get("budget", 0),
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
                        "address": job["address"],
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
        {"$set": {"status": "open", "reviewing_by": None, "reviewing_until": None}}
    )
    
    if status == "open":
        query = {"status": {"$in": ["open", "reviewing"]}}
    else:
        query = {"status": status}
    
    if category:
        query["category"] = category
    
    jobs = await db.job_posts.find(query, {"_id": 0}).sort("created_at", -1).to_list(50)
    return {"jobs": jobs, "count": len(jobs)}


@router.get("/api/jobs/my-offers")
async def get_my_offers(user: dict = Depends(get_current_user)):
    offers = await db.job_offers.find(
        {"professional_id": user["user_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    
    # Enrich with job details
    for o in offers:
        job = await db.job_posts.find_one({"job_id": o["job_id"]}, {"_id": 0, "title": 1, "status": 1, "category": 1, "address": 1})
        if job:
            o["job_title"] = job.get("title")
            o["job_status"] = job.get("status")
            o["job_category"] = job.get("category")
            o["job_address"] = job.get("address")
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
    
    # Get offers for this job
    offers = await db.job_offers.find({"job_id": job_id}, {"_id": 0}).to_list(20)
    
    return {"job": job, "offers": offers}


# ─── JOB REVIEW (30-second lock) ────────────────

@router.post("/api/jobs/{job_id}/review")
async def start_job_review(
    job_id: str,
    user: dict = Depends(get_current_user)
):
    """Professional starts reviewing a job - 30 second lock"""
    from datetime import timedelta
    now = datetime.now(timezone.utc)
    
    job = await db.job_posts.find_one({"job_id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Trabajo no encontrado")
    
    # Check if job is available (open or review expired)
    if job["status"] == "assigned":
        raise HTTPException(status_code=400, detail="Este trabajo ya fue asignado")
    
    # Check if another pro is reviewing and lock hasn't expired
    if job.get("reviewing_by") and job["reviewing_by"] != user["user_id"]:
        review_until = job.get("reviewing_until")
        if review_until:
            if isinstance(review_until, str):
                review_until = datetime.fromisoformat(review_until.replace("Z", "+00:00"))
            if review_until > now:
                raise HTTPException(status_code=409, detail="Otro profesional está revisando este trabajo")
    
    # Lock job for 30 seconds
    review_until = now + timedelta(seconds=30)
    await db.job_posts.update_one(
        {"job_id": job_id},
        {"$set": {
            "status": "reviewing",
            "reviewing_by": user["user_id"],
            "reviewing_until": review_until.isoformat(),
            "updated_at": now,
        }}
    )
    
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
    
    return {"status": "reviewing", "review_seconds": 30}


@router.post("/api/jobs/{job_id}/accept")
async def accept_job_after_review(
    job_id: str,
    user: dict = Depends(get_current_user)
):
    """Professional accepts job after reviewing"""
    now = datetime.now(timezone.utc)
    
    job = await db.job_posts.find_one({"job_id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Trabajo no encontrado")
    
    if job.get("status") == "assigned":
        raise HTTPException(status_code=400, detail="Este trabajo ya fue asignado")
    
    # Verify this pro was reviewing
    if job.get("reviewing_by") != user["user_id"]:
        raise HTTPException(status_code=403, detail="No estás revisando este trabajo")
    
    # Accept - assign to this professional
    await db.job_posts.update_one(
        {"job_id": job_id},
        {"$set": {
            "status": "assigned",
            "assigned_to": user["user_id"],
            "assigned_name": user.get("name", "Profesional"),
            "assigned_at": now,
            "agreed_price": job["budget"],
            "reviewing_by": None,
            "reviewing_until": None,
        }}
    )
    
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
    
    job = await db.job_posts.find_one({"job_id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Trabajo no encontrado")
    
    # Release the job back to open
    if job.get("reviewing_by") == user["user_id"]:
        await db.job_posts.update_one(
            {"job_id": job_id},
            {"$set": {
                "status": "open",
                "reviewing_by": None,
                "reviewing_until": None,
                "updated_at": now,
            }}
        )
    
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
    job = await db.job_posts.find_one({"job_id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Trabajo no encontrado")
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
        job = await db.job_posts.find_one({"job_id": o["job_id"]}, {"_id": 0, "title": 1, "status": 1, "category": 1, "address": 1})
        if job:
            o["job_title"] = job.get("title")
            o["job_status"] = job.get("status")
            o["job_category"] = job.get("category")
            o["job_address"] = job.get("address")
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
    offer = await db.job_offers.find_one({"offer_id": offer_id})
    if not offer:
        raise HTTPException(status_code=404, detail="Oferta no encontrada")
    
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
    
    new_status = data.get("status")
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
                await adjust_wallet_balance(job["assigned_to"], -commission, f"Comisión Moli Trabajos {job_id}")
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
        # Penalty if assigned (20% of budget to the platform)
        if job.get("status") in ("assigned", "in_progress") and job.get("budget"):
            penalty = round(job["budget"] * 0.20, 2)
            update["cancellation_penalty"] = penalty
            # Debit from canceller's wallet
            try:
                from utils import adjust_wallet_balance
                await adjust_wallet_balance(user["user_id"], -penalty, f"Penalización cancelación trabajo {job_id}")
            except:
                pass
            # Notify the other party
            other_id = job.get("assigned_to") if user["user_id"] == job["client_id"] else job["client_id"]
            if other_id:
                try:
                    from websocket_manager import manager
                    await manager.send_personal_message({
                        "type": "job_cancelled",
                        "job_id": job_id,
                        "message": "El trabajo fue cancelado por la otra parte.",
                    }, other_id)
                except:
                    pass
    else:
        update["status"] = new_status
    
    await db.job_posts.update_one({"job_id": job_id}, {"$set": update})
    return {"status": "updated", "job_status": update.get("status", new_status)}


@router.post("/api/jobs/{job_id}/rate")
async def rate_job(
    job_id: str,
    data: dict = Body(...),
    user: dict = Depends(get_current_user)
):
    job = await db.job_posts.find_one({"job_id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Trabajo no encontrado")
    
    rating = data.get("rating", 5)
    
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

