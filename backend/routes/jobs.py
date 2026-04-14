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
    profile_data = {
        "user_id": user["user_id"],
        "name": user.get("name", ""),
        "categories": data.get("categories", []),
        "description": data.get("description", ""),
        "hourly_rate": data.get("hourly_rate", 0),
        "portfolio_images": data.get("portfolio_images", []),
        "is_available": data.get("is_available", True),
        "location": data.get("location"),
        "updated_at": now,
    }
    
    existing = await db.professional_profiles.find_one({"user_id": user["user_id"]})
    if existing:
        await db.professional_profiles.update_one(
            {"user_id": user["user_id"]},
            {"$set": profile_data}
        )
    else:
        profile_data["created_at"] = now
        profile_data["rating"] = 5.0
        profile_data["total_jobs"] = 0
        await db.professional_profiles.insert_one(profile_data)
    
    return {"status": "updated", "profile": profile_data}


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
        "status": "open",  # open, assigned, in_progress, completed, cancelled
        "assigned_to": None,
        "offers_count": 0,
        "created_at": now,
        "updated_at": now,
    }
    await db.job_posts.insert_one(job)
    return {"status": "created", "job": job}


@router.get("/api/jobs/posts")
async def list_job_posts(
    category: Optional[str] = None,
    status: str = "open",
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    user: dict = Depends(get_current_user)
):
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


@router.get("/api/jobs/detail/{job_id}")
async def get_job_detail(job_id: str, user: dict = Depends(get_current_user)):
    job = await db.job_posts.find_one({"job_id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Trabajo no encontrado")
    
    # Get offers for this job
    offers = await db.job_offers.find({"job_id": job_id}, {"_id": 0}).to_list(20)
    
    return {"job": job, "offers": offers}


# ─── JOB OFFERS (Professional sends) ────────────────

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
    
    # Check if already offered
    existing = await db.job_offers.find_one({
        "job_id": job_id, "professional_id": user["user_id"]
    })
    if existing:
        raise HTTPException(status_code=400, detail="Ya enviaste una oferta para este trabajo")
    
    pro_profile = await db.professional_profiles.find_one({"user_id": user["user_id"]})
    
    offer = {
        "offer_id": generate_id("offer_"),
        "job_id": job_id,
        "professional_id": user["user_id"],
        "professional_name": user.get("name", "Profesional"),
        "professional_rating": pro_profile.get("rating", 5.0) if pro_profile else 5.0,
        "price": data.get("price", 0),
        "message": data.get("message", ""),
        "estimated_time": data.get("estimated_time", ""),
        "status": "pending",  # pending, accepted, rejected
        "created_at": datetime.now(timezone.utc),
    }
    await db.job_offers.insert_one(offer)
    
    # Update offers count
    await db.job_posts.update_one(
        {"job_id": job_id},
        {"$inc": {"offers_count": 1}}
    )
    
    return {"status": "sent", "offer": offer}


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
    update = {"status": new_status, "updated_at": now}
    
    if new_status == "in_progress":
        update["started_at"] = now
    elif new_status == "completed":
        update["completed_at"] = now
        # Increment professional's total jobs
        if job.get("assigned_to"):
            await db.professional_profiles.update_one(
                {"user_id": job["assigned_to"]},
                {"$inc": {"total_jobs": 1}}
            )
    
    await db.job_posts.update_one({"job_id": job_id}, {"$set": update})
    return {"status": "updated", "job_status": new_status}


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
