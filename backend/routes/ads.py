"""Campaign-based advertising API.

This router intentionally does not replace the legacy banner routes.  Legacy
banners can be imported as drafts through the admin endpoint below and must be
reviewed and activated explicitly.
"""
from datetime import datetime, timedelta, timezone
import hashlib
import random
from typing import Any, Dict, List, Literal, Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator, model_validator
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from database import db
from utils import generate_id, get_current_user


router = APIRouter()

CAMPAIGN_STATES = {"draft", "scheduled", "active", "paused", "ended", "archived"}
ROLE_VALUES = {"rider", "driver", "professional", "merchant"}
SURFACE_VALUES = {"rides", "jobs", "tramites", "marketplace"}
TRIGGER_VALUES = {
    "ride_started", "job_started", "tramite_started", "marketplace_open", "order_created"
}
FORMAT_VALUES = {"image", "video", "marketplace_product"}
DESTINATION_VALUES = {"none", "https", "marketplace_store", "marketplace_product"}
TRANSITIONS = {
    "draft": {"scheduled", "active", "archived"},
    "scheduled": {"draft", "active", "paused", "ended"},
    "active": {"paused", "ended"},
    "paused": {"active", "ended", "archived"},
    "ended": {"archived"},
    "archived": set(),
}


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _serialize(document: Optional[dict]) -> Optional[dict]:
    if not document:
        return document
    result = {k: v for k, v in document.items() if k != "_id"}
    for key, value in list(result.items()):
        if isinstance(value, datetime):
            result[key] = value.isoformat()
    return result


def _require_admin(user: dict) -> None:
    if user.get("user_type") != "admin":
        raise HTTPException(status_code=403, detail="Solo administradores")


def _https_url(value: Optional[str], field: str) -> Optional[str]:
    if value is None or value == "":
        return None
    parsed = urlparse(value)
    if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password:
        raise ValueError(f"{field} debe ser una URL HTTPS válida")
    return value


class Destination(BaseModel):
    type: Literal["none", "https", "marketplace_store", "marketplace_product"] = "none"
    url: Optional[str] = None
    merchant_id: Optional[str] = None
    product_id: Optional[str] = None

    @model_validator(mode="after")
    def validate_destination(self):
        kind = self.type
        if kind == "https":
            self.url = _https_url(self.url, "destination.url")
            if not self.url:
                raise ValueError("destination.url es obligatorio")
        elif kind == "marketplace_store" and not self.merchant_id:
            raise ValueError("merchant_id es obligatorio")
        elif kind == "marketplace_product":
            if not self.merchant_id or not self.product_id:
                raise ValueError("merchant_id y product_id son obligatorios")
        return self


class Creative(BaseModel):
    creative_id: Optional[str] = None
    format: Literal["image", "video", "marketplace_product"]
    media_url: Optional[str] = None
    poster_url: Optional[str] = None
    title: str = Field("", max_length=120)
    body: str = Field("", max_length=500)
    sponsor_label: str = Field("Publicidad", max_length=40)
    cta_text: Optional[str] = Field(None, max_length=40)
    destination: Destination = Field(default_factory=Destination)
    active: bool = True

    @model_validator(mode="after")
    def validate_media(self):
        fmt = self.format
        media = self.media_url
        poster = self.poster_url
        if fmt in {"image", "video"} and not media:
            raise ValueError("media_url es obligatorio para imagen o video")
        if media:
            self.media_url = _https_url(media, "media_url")
        if poster:
            self.poster_url = _https_url(poster, "poster_url")
        if fmt == "marketplace_product" and self.destination.type != "marketplace_product":
            raise ValueError("Una creatividad de producto requiere destino marketplace_product")
        return self


class Targeting(BaseModel):
    roles: List[str] = Field(default_factory=lambda: ["rider"])
    surfaces: List[str] = Field(default_factory=lambda: ["rides"])
    triggers: List[str] = Field(default_factory=lambda: ["ride_started"])

    @field_validator("roles")
    def roles_valid(cls, value):
        if not value or set(value) - ROLE_VALUES:
            raise ValueError("roles inválidos")
        return list(dict.fromkeys(value))

    @field_validator("surfaces")
    def surfaces_valid(cls, value):
        if not value or set(value) - SURFACE_VALUES:
            raise ValueError("superficies inválidas")
        return list(dict.fromkeys(value))

    @field_validator("triggers")
    def triggers_valid(cls, value):
        if not value or set(value) - TRIGGER_VALUES:
            raise ValueError("triggers inválidos")
        return list(dict.fromkeys(value))


class Frequency(BaseModel):
    max_per_user_total: Optional[int] = Field(None, ge=1, le=10000)
    max_per_user_day: int = Field(3, ge=1, le=100)
    max_per_session: int = Field(1, ge=1, le=20)
    cooldown_seconds: int = Field(1800, ge=0, le=604800)
    once_per_entity: bool = True


class ClosePolicy(BaseModel):
    countdown_seconds: int = Field(5, ge=0, le=15)
    close_after_countdown: bool = True
    auto_close_seconds: Optional[int] = Field(None, ge=1, le=300)


class CampaignInput(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    priority: int = Field(0, ge=-100, le=100)
    weight: int = Field(1, ge=1, le=1000)
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    targeting: Targeting = Field(default_factory=Targeting)
    frequency: Frequency = Field(default_factory=Frequency)
    close_policy: ClosePolicy = Field(default_factory=ClosePolicy)
    max_impressions: Optional[int] = Field(None, ge=1)
    creatives: List[Creative] = Field(default_factory=list)

    @model_validator(mode="after")
    def dates_valid(self):
        start, end = self.starts_at, self.ends_at
        if start and end and end <= start:
            raise ValueError("ends_at debe ser posterior a starts_at")
        return self


class CampaignPatch(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    priority: Optional[int] = Field(None, ge=-100, le=100)
    weight: Optional[int] = Field(None, ge=1, le=1000)
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    targeting: Optional[Targeting] = None
    frequency: Optional[Frequency] = None
    close_policy: Optional[ClosePolicy] = None
    max_impressions: Optional[int] = Field(None, ge=1)
    creatives: Optional[List[Creative]] = None


class DecisionInput(BaseModel):
    trigger: str
    surface: str
    entity_type: str = Field(..., min_length=1, max_length=30)
    entity_id: str = Field(..., min_length=1, max_length=100)
    session_id: str = Field(..., min_length=1, max_length=100)

    @field_validator("trigger")
    def trigger_valid(cls, value):
        if value not in TRIGGER_VALUES:
            raise ValueError("trigger inválido")
        return value

    @field_validator("surface")
    def surface_valid(cls, value):
        if value not in SURFACE_VALUES:
            raise ValueError("surface inválida")
        return value


class EventInput(BaseModel):
    client_event_id: str = Field(..., min_length=8, max_length=120)
    type: Literal["rendered", "viewable", "video_start", "video_25", "video_50", "video_75", "video_complete", "cta_click", "dismiss", "media_error", "destination_error"]
    occurred_at: Optional[datetime] = None


def normalize_creatives(creatives: List[dict]) -> List[dict]:
    normalized = []
    for item in creatives:
        creative = Creative(**item).model_dump()
        creative["creative_id"] = creative.get("creative_id") or generate_id("creative_")
        normalized.append(creative)
    return normalized


def legacy_banner_to_campaign(banner: dict) -> dict:
    """Convert a legacy banner to a safe, inactive campaign document."""
    image = banner.get("image_url")
    video = banner.get("video_url")
    media = video or image
    fmt = "video" if video else "image"
    if not media or not str(media).startswith("https://"):
        # Old data URIs and HTTP media are deliberately not publishable.
        media = "https://invalid.local/legacy-media-review-required"
    raw_link = banner.get("button_link") or banner.get("link_url")
    destination: Dict[str, Any] = {"type": "none"}
    if raw_link and str(raw_link).startswith("https://"):
        destination = {"type": "https", "url": raw_link}
    target = banner.get("target") or banner.get("target_audience") or "both"
    roles = ["rider", "driver"] if target in {"both", "all"} else [target]
    roles = [role for role in roles if role in ROLE_VALUES] or ["rider"]
    now = utcnow()
    legacy_id = banner.get("banner_id") or "legacy_" + hashlib.sha256(
        repr(sorted((str(k), str(v)) for k, v in banner.items() if k != "_id")).encode()
    ).hexdigest()[:20]
    return {
        "campaign_id": generate_id("campaign_"),
        "name": banner.get("title") or "Banner antiguo sin título",
        "status": "draft",
        "priority": int(banner.get("position", 0) or 0),
        "weight": 1,
        "starts_at": None,
        "ends_at": None,
        "targeting": {"roles": roles, "surfaces": ["rides"], "triggers": ["ride_started"]},
        "frequency": Frequency().model_dump(),
        "close_policy": ClosePolicy().model_dump(),
        "max_impressions": None,
        "impression_count": 0,
        "creatives": [{
            "creative_id": generate_id("creative_"), "format": fmt, "media_url": media,
            "poster_url": None, "title": banner.get("title") or "",
            "body": banner.get("description") or "", "sponsor_label": "Publicidad",
            "cta_text": banner.get("button_text"), "destination": destination, "active": False,
        }],
        "legacy_banner_id": legacy_id,
        "legacy_requires_review": True,
        "created_at": now, "updated_at": now, "version": 1,
    }


def delivery_key_for(user_id: str, campaign_id: str, trigger: str, entity_id: str,
                     session_id: str, once_per_entity: bool = True) -> str:
    raw = f"{user_id}|{campaign_id}|{trigger}|{entity_id}"
    if not once_per_entity:
        raw += f"|{session_id}"
    return hashlib.sha256(raw.encode()).hexdigest()


def within_frequency_caps(frequency: dict, total: int, today: int, session: int,
                          has_recent: bool) -> bool:
    maximum = frequency.get("max_per_user_total")
    return not (
        (maximum is not None and total >= maximum)
        or today >= frequency.get("max_per_user_day", 3)
        or session >= frequency.get("max_per_session", 1)
        or (frequency.get("cooldown_seconds", 1800) > 0 and has_recent)
    )


def delivery_event_transition(current: str, event_type: str) -> tuple[Optional[str], bool]:
    """Return new delivery state and whether this is its first impression."""
    terminal = {"clicked", "dismissed", "completed"}
    if current in terminal:
        return None, False
    target = {
        "viewable": "impressed", "cta_click": "clicked", "dismiss": "dismissed",
        "video_complete": "completed",
    }.get(event_type)
    if not target or target == current:
        return None, False
    return target, event_type == "viewable" and current == "reserved"


def _campaign_publishable(campaign: dict, now: Optional[datetime] = None) -> None:
    now = now or utcnow()
    creatives = [c for c in campaign.get("creatives", []) if c.get("active")]
    if not creatives:
        raise HTTPException(422, "La campaña requiere al menos una creatividad activa")
    for creative in creatives:
        Creative(**creative)
    if campaign.get("ends_at") and campaign["ends_at"] <= now:
        raise HTTPException(422, "La fecha de fin ya pasó")
    if campaign.get("legacy_requires_review"):
        raise HTTPException(422, "El banner antiguo debe revisarse y guardarse antes de activarlo")


async def _audit(user: dict, action: str, campaign_id: str, changes: dict) -> None:
    await db.audit_log.insert_one({
        "action": action, "target_user_id": campaign_id, "admin_id": user["user_id"],
        "changes": changes, "created_at": utcnow(), "source": "admin",
    })


@router.post("/api/admin/ads/campaigns")
async def create_campaign(data: CampaignInput, user: dict = Depends(get_current_user)):
    _require_admin(user)
    now = utcnow()
    document = data.model_dump()
    document.update({
        "campaign_id": generate_id("campaign_"), "status": "draft", "impression_count": 0,
        "creatives": normalize_creatives(document["creatives"]), "created_at": now,
        "updated_at": now, "created_by": user["user_id"], "version": 1,
    })
    await db.ad_campaigns.insert_one(document)
    await _audit(user, "ad_campaign_create", document["campaign_id"], {"name": document["name"]})
    return {"campaign": _serialize(document)}


@router.get("/api/admin/ads/campaigns")
async def list_campaigns(
    status: Optional[str] = None, q: Optional[str] = None, limit: int = Query(50, ge=1, le=100),
    skip: int = Query(0, ge=0), user: dict = Depends(get_current_user),
):
    _require_admin(user)
    query: Dict[str, Any] = {}
    if status:
        if status not in CAMPAIGN_STATES:
            raise HTTPException(422, "Estado inválido")
        query["status"] = status
    if q:
        query["name"] = {"$regex": q[:100], "$options": "i"}
    total = await db.ad_campaigns.count_documents(query)
    docs = await db.ad_campaigns.find(query, {"_id": 0}).sort("updated_at", -1).skip(skip).limit(limit).to_list(limit)
    return {"campaigns": [_serialize(x) for x in docs], "total": total}


@router.get("/api/admin/ads/campaigns/{campaign_id}")
async def get_campaign(campaign_id: str, user: dict = Depends(get_current_user)):
    _require_admin(user)
    doc = await db.ad_campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Campaña no encontrada")
    return {"campaign": _serialize(doc)}


@router.put("/api/admin/ads/campaigns/{campaign_id}")
async def update_campaign(campaign_id: str, data: CampaignPatch, version: int = Body(..., embed=True), user: dict = Depends(get_current_user)):
    _require_admin(user)
    update = data.model_dump(exclude_unset=True)
    if "creatives" in update:
        update["creatives"] = normalize_creatives(update["creatives"] or [])
    current = await db.ad_campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0})
    if not current:
        raise HTTPException(404, "Campaña no encontrada")
    merged = {**current, **update}
    if merged.get("starts_at") and merged.get("ends_at") and merged["ends_at"] <= merged["starts_at"]:
        raise HTTPException(422, "ends_at debe ser posterior a starts_at")
    update.update({"updated_at": utcnow(), "legacy_requires_review": False})
    result = await db.ad_campaigns.find_one_and_update(
        {"campaign_id": campaign_id, "version": version},
        {"$set": update, "$inc": {"version": 1}}, projection={"_id": 0},
        return_document=ReturnDocument.AFTER,
    )
    if not result:
        raise HTTPException(409, "La campaña fue modificada por otro administrador")
    await _audit(user, "ad_campaign_update", campaign_id, {"fields": sorted(update)})
    return {"campaign": _serialize(result)}


@router.post("/api/admin/ads/campaigns/{campaign_id}/state")
async def transition_campaign(campaign_id: str, state: str = Body(..., embed=True), user: dict = Depends(get_current_user)):
    _require_admin(user)
    if state not in CAMPAIGN_STATES:
        raise HTTPException(422, "Estado inválido")
    current = await db.ad_campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0})
    if not current:
        raise HTTPException(404, "Campaña no encontrada")
    if state not in TRANSITIONS[current.get("status", "draft")]:
        raise HTTPException(409, f"Transición {current.get('status')} -> {state} no permitida")
    if state in {"active", "scheduled"}:
        _campaign_publishable(current)
        if state == "scheduled" and not current.get("starts_at"):
            raise HTTPException(422, "Una campaña programada requiere starts_at")
    updated = await db.ad_campaigns.find_one_and_update(
        {"campaign_id": campaign_id, "status": current["status"]},
        {"$set": {"status": state, "updated_at": utcnow()}, "$inc": {"version": 1}},
        projection={"_id": 0}, return_document=ReturnDocument.AFTER,
    )
    if not updated:
        raise HTTPException(409, "Estado modificado concurrentemente")
    await _audit(user, "ad_campaign_state", campaign_id, {"from": current["status"], "to": state})
    return {"campaign": _serialize(updated)}


@router.delete("/api/admin/ads/campaigns/{campaign_id}")
async def archive_campaign(campaign_id: str, user: dict = Depends(get_current_user)):
    _require_admin(user)
    current = await db.ad_campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0})
    if not current:
        raise HTTPException(404, "Campaña no encontrada")
    if current.get("status") not in {"draft", "paused", "ended"}:
        raise HTTPException(409, "Primero pausá o finalizá la campaña")
    await db.ad_campaigns.update_one({"campaign_id": campaign_id}, {"$set": {"status": "archived", "updated_at": utcnow()}})
    await _audit(user, "ad_campaign_archive", campaign_id, {})
    return {"status": "archived"}


@router.post("/api/admin/ads/legacy/import")
async def import_legacy_banners(user: dict = Depends(get_current_user)):
    _require_admin(user)
    banners = await db.banners.find({}, {"_id": 0}).to_list(1000)
    imported = 0
    for banner in banners:
        document = legacy_banner_to_campaign(banner)
        if await db.ad_campaigns.find_one({"legacy_banner_id": document["legacy_banner_id"]}):
            continue
        await db.ad_campaigns.insert_one(document)
        imported += 1
    await _audit(user, "ad_legacy_import", "legacy_banners", {"imported": imported})
    return {"imported": imported, "status": "draft_review_required"}


async def _verify_entity(data: DecisionInput, user: dict) -> None:
    uid = user["user_id"]
    if data.trigger == "ride_started":
        ride = await db.rides.find_one({"ride_id": data.entity_id}, {"_id": 0, "rider_id": 1, "status": 1})
        if not ride or ride.get("rider_id") != uid or ride.get("status") != "started":
            raise HTTPException(403, "Viaje o trigger no válidos")
    elif data.trigger in {"job_started", "tramite_started"}:
        job = await db.job_posts.find_one({"job_id": data.entity_id}, {"_id": 0, "client_id": 1, "status": 1, "category": 1})
        if not job or job.get("client_id") != uid or job.get("status") not in {"started", "in_progress"}:
            raise HTTPException(403, "Trabajo o trigger no válidos")
        if data.trigger == "tramite_started" and job.get("category") != "tramites":
            raise HTTPException(403, "El trabajo no es un trámite")
    elif data.trigger == "marketplace_open":
        merchant = await db.marketplace_merchants.find_one(
            {"merchant_id": data.entity_id, "approval_status": "approved"}, {"_id": 0, "merchant_id": 1}
        )
        if not merchant:
            raise HTTPException(403, "Comercio no válido")
    elif data.trigger == "order_created":
        order = await db.marketplace_orders.find_one(
            {"order_id": data.entity_id, "customer_id": uid}, {"_id": 0, "order_id": 1}
        )
        if not order:
            raise HTTPException(403, "Pedido no válido")


def _role(user: dict) -> str:
    if user.get("user_type") == "driver" and user.get("is_professional"):
        return "professional"
    return user.get("user_type", "rider")


async def _frequency_allows(campaign: dict, user_id: str, session_id: str, now: datetime) -> bool:
    frequency = campaign.get("frequency", {})
    base = {"campaign_id": campaign["campaign_id"], "user_id": user_id, "status": {"$ne": "failed"}}
    total = await db.ad_deliveries.count_documents(base)
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today = await db.ad_deliveries.count_documents({**base, "created_at": {"$gte": day_start}})
    session = await db.ad_deliveries.count_documents({**base, "session_id": session_id})
    cooldown = frequency.get("cooldown_seconds", 1800)
    recent = bool(cooldown and await db.ad_deliveries.find_one(
        {**base, "created_at": {"$gte": now - timedelta(seconds=cooldown)}}
    ))
    return within_frequency_caps(frequency, total, today, session, recent)


async def _product_available(creative: dict) -> bool:
    destination = creative.get("destination", {})
    if destination.get("type") not in {"marketplace_store", "marketplace_product"}:
        return True
    merchant = await db.marketplace_merchants.find_one({
        "merchant_id": destination.get("merchant_id"), "approval_status": "approved"
    })
    if not merchant:
        return False
    if destination["type"] == "marketplace_product":
        return bool(await db.marketplace_products.find_one({
            "product_id": destination.get("product_id"), "merchant_id": destination.get("merchant_id"),
            "active": {"$ne": False}, "stock": {"$ne": 0},
        }))
    return True


@router.post("/api/ads/decision")
async def decide_ad(data: DecisionInput, user: dict = Depends(get_current_user)):
    await _verify_entity(data, user)
    now = utcnow()
    # Lightweight scheduled activation; a dedicated scheduler may also perform it.
    await db.ad_campaigns.update_many(
        {"status": "scheduled", "starts_at": {"$lte": now}, "$or": [{"ends_at": None}, {"ends_at": {"$gt": now}}]},
        {"$set": {"status": "active", "updated_at": now}},
    )
    role = _role(user)
    query = {
        "status": "active", "targeting.roles": role, "targeting.surfaces": data.surface,
        "targeting.triggers": data.trigger, "$and": [
            {"$or": [{"starts_at": None}, {"starts_at": {"$lte": now}}, {"starts_at": {"$exists": False}}]},
            {"$or": [{"ends_at": None}, {"ends_at": {"$gt": now}}, {"ends_at": {"$exists": False}}]},
        ],
    }
    campaigns = await db.ad_campaigns.find(query, {"_id": 0}).sort("priority", -1).to_list(100)
    eligible = []
    for campaign in campaigns:
        if campaign.get("max_impressions") and campaign.get("impression_count", 0) >= campaign["max_impressions"]:
            continue
        if not await _frequency_allows(campaign, user["user_id"], data.session_id, now):
            continue
        creatives = [c for c in campaign.get("creatives", []) if c.get("active") and await _product_available(c)]
        if creatives:
            eligible.append((campaign, creatives))
    if not eligible:
        return {"delivery": None, "server_time": now.isoformat()}
    top_priority = max(x[0].get("priority", 0) for x in eligible)
    pool = [x for x in eligible if x[0].get("priority", 0) == top_priority]
    campaign, creatives = random.choices(pool, weights=[x[0].get("weight", 1) for x in pool], k=1)[0]
    creative = random.choice(creatives)
    delivery_key = delivery_key_for(
        user["user_id"], campaign["campaign_id"], data.trigger, data.entity_id, data.session_id,
        campaign.get("frequency", {}).get("once_per_entity", True),
    )
    delivery = {
        "delivery_id": generate_id("delivery_"), "delivery_key": delivery_key,
        "campaign_id": campaign["campaign_id"], "creative_id": creative["creative_id"],
        "user_id": user["user_id"], "session_id": data.session_id, "trigger": data.trigger,
        "surface": data.surface, "entity_type": data.entity_type, "entity_id": data.entity_id,
        "status": "reserved", "created_at": now, "expires_at": now + timedelta(hours=1),
    }
    try:
        existing = await db.ad_deliveries.find_one_and_update(
            {"delivery_key": delivery_key}, {"$setOnInsert": delivery}, upsert=True,
            projection={"_id": 0}, return_document=ReturnDocument.AFTER,
        )
    except DuplicateKeyError:
        existing = await db.ad_deliveries.find_one({"delivery_key": delivery_key}, {"_id": 0})
    response = dict(existing or delivery)
    response["creative"] = creative
    response["close_policy"] = campaign.get("close_policy", ClosePolicy().model_dump())
    return {"delivery": _serialize(response), "server_time": now.isoformat()}


@router.post("/api/ads/deliveries/{delivery_id}/events")
async def record_event(delivery_id: str, event: EventInput, user: dict = Depends(get_current_user)):
    delivery = await db.ad_deliveries.find_one({"delivery_id": delivery_id, "user_id": user["user_id"]}, {"_id": 0})
    if not delivery:
        raise HTTPException(404, "Entrega publicitaria no encontrada")
    now = utcnow()
    document = event.model_dump()
    document.update({"event_id": generate_id("adevent_"), "delivery_id": delivery_id, "user_id": user["user_id"], "received_at": now})
    try:
        await db.ad_events.insert_one(document)
    except DuplicateKeyError:
        return {"status": "duplicate"}
    new_status, first_impression = delivery_event_transition(delivery["status"], event.type)
    if new_status:
        changed = await db.ad_deliveries.update_one(
            {"delivery_id": delivery_id, "status": {"$nin": ["clicked", "dismissed", "completed"]}},
            {"$set": {"status": new_status, f"{event.type}_at": now}},
        )
        if first_impression and changed.modified_count:
            await db.ad_campaigns.update_one({"campaign_id": delivery["campaign_id"]}, {"$inc": {"impression_count": 1}})
    return {"status": "recorded"}


async def ensure_ad_indexes() -> None:
    """Call from application startup after this router is integrated."""
    await db.ad_campaigns.create_index("campaign_id", unique=True)
    await db.ad_campaigns.create_index([("status", 1), ("priority", -1)])
    await db.ad_deliveries.create_index("delivery_id", unique=True)
    await db.ad_deliveries.create_index("delivery_key", unique=True)
    await db.ad_deliveries.create_index([("campaign_id", 1), ("user_id", 1), ("created_at", -1)])
    await db.ad_events.create_index("client_event_id", unique=True)
