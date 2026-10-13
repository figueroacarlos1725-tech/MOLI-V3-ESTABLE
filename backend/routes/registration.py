"""Phone-first registration with WhatsApp OTP and admin approval."""
import hashlib
import hmac
import os
import re
import secrets
import asyncio
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from typing import List, Optional, Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field

from database import db
from utils import create_access_token, generate_id, get_current_user, hash_password

router = APIRouter()

PHONE_RE = re.compile(r"^\+[1-9]\d{7,14}$")
OTP_TTL_MINUTES = 10
OTP_MAX_ATTEMPTS = 5
ALLOWED_CAPABILITIES = {
    "ride_driver", "moto_driver", "taxi_driver", "professional",
    "tramites", "parcel", "delivery", "merchant",
}


class OtpRequest(BaseModel):
    phone: str
    email: Optional[EmailStr] = None
    channel: str = "auto"
    purpose: str = "register"


class OtpVerify(BaseModel):
    phone: str
    code: str = Field(min_length=6, max_length=6)
    purpose: str = "register"


class OtpLogin(BaseModel):
    phone: str
    verification_token: str


class RegistrationSubmit(BaseModel):
    verification_token: str
    phone: str
    name: str = Field(min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    capabilities: List[str] = Field(default_factory=list)
    vehicle: Optional[dict] = None
    promotion_plan: Optional[Literal["barter_30", "standard_15"]] = None


def _normalize_phone(phone: str) -> str:
    normalized = re.sub(r"[\s().-]", "", phone or "")
    if not PHONE_RE.fullmatch(normalized):
        raise HTTPException(status_code=400, detail="Usá el teléfono en formato internacional, por ejemplo +549...")
    return normalized


def _otp_digest(phone: str, code: str) -> str:
    secret = os.getenv("OTP_SECRET") or os.getenv("SECRET_KEY")
    if not secret:
        raise HTTPException(status_code=503, detail="El registro por WhatsApp todavía no está configurado")
    return hmac.new(secret.encode(), f"{phone}:{code}".encode(), hashlib.sha256).hexdigest()


async def _send_whatsapp_otp(phone: str, code: str) -> None:
    url = os.getenv("WHATSAPP_OTP_SEND_URL")
    api_key = os.getenv("WHATSAPP_OTP_API_KEY")
    if not url or not api_key:
        raise HTTPException(status_code=503, detail="El canal de WhatsApp todavía no está configurado")
    payload = {
        "phone": phone,
        "template": os.getenv("WHATSAPP_OTP_TEMPLATE", "moli_registration_code"),
        "variables": {"code": code, "expires_minutes": OTP_TTL_MINUTES},
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(url, json=payload, headers={"Authorization": f"Bearer {api_key}"})
            response.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="No pudimos enviar el código por WhatsApp") from exc


def _send_email_sync(email: str, code: str) -> None:
    host = os.getenv("SMTP_HOST")
    port = int(os.getenv("SMTP_PORT", "587"))
    username = os.getenv("SMTP_USERNAME") or os.getenv("SMTP_USER")
    password = os.getenv("SMTP_PASSWORD") or os.getenv("SMTP_PASS")
    sender = os.getenv("SMTP_FROM") or username
    if not host or not sender:
        raise RuntimeError("SMTP not configured")
    message = EmailMessage()
    message["Subject"] = "Tu código de acceso a Moli"
    message["From"] = sender
    message["To"] = email
    message.set_content(
        f"Tu código de Moli es {code}. Vence en {OTP_TTL_MINUTES} minutos. "
        "Si no lo solicitaste, ignorá este mensaje."
    )
    use_ssl = os.getenv("SMTP_SSL", "false").lower() == "true" or port == 465
    smtp_class = smtplib.SMTP_SSL if use_ssl else smtplib.SMTP
    with smtp_class(host, port, timeout=12) as client:
        if not use_ssl and os.getenv("SMTP_STARTTLS", "true").lower() == "true":
            client.starttls()
        if username and password:
            client.login(username, password)
        client.send_message(message)


async def _send_email_otp(email: str, code: str) -> None:
    if os.getenv("EMAIL_PROVIDER", "smtp").lower() == "resend":
        key = os.getenv("RESEND_API_KEY")
        sender = os.getenv("RESEND_FROM", "Moli <onboarding@resend.dev>")
        test_recipient = os.getenv("RESEND_TEST_RECIPIENT", "").strip().lower()
        if not key:
            raise HTTPException(status_code=503, detail="El envío por email todavía no está configurado")
        # The shared sender cannot deliver registration codes to arbitrary users.
        if "@resend.dev" in sender.lower() and (not test_recipient or email.strip().lower() != test_recipient):
            raise HTTPException(status_code=503, detail="Email en modo de prueba: falta verificar el dominio de Moli")
        try:
            async with httpx.AsyncClient(timeout=12) as client:
                response = await client.post(
                    "https://api.resend.com/emails",
                    headers={"Authorization": f"Bearer {key}"},
                    json={"from": sender, "to": [email], "subject": "Tu código de acceso a Moli",
                          "text": f"Tu código de Moli es {code}. Vence en {OTP_TTL_MINUTES} minutos. Si no lo solicitaste, ignorá este mensaje."},
                )
                response.raise_for_status()
                if not response.json().get("id"):
                    raise ValueError("Missing delivery ID")
        except (httpx.HTTPError, ValueError) as exc:
            raise HTTPException(status_code=502, detail="No pudimos enviar el código por email") from exc
        return
    try:
        await asyncio.to_thread(_send_email_sync, email, code)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="No pudimos enviar el código por email") from exc


@router.post("/api/registration/otp/request")
async def request_otp(data: OtpRequest):
    phone = _normalize_phone(data.phone)
    if data.channel not in {"auto", "whatsapp", "email"}:
        raise HTTPException(status_code=400, detail="Canal inválido")
    if data.purpose not in {"register", "login"}:
        raise HTTPException(status_code=400, detail="Uso de código inválido")
    if data.channel == "email" and not data.email:
        raise HTTPException(status_code=400, detail="Ingresá un email para recibir el código")
    if data.purpose == "login":
        existing = await db.users.find_one({"phone": phone}, {"email": 1, "_id": 0})
        if not existing:
            raise HTTPException(status_code=404, detail="No existe una cuenta con ese teléfono")
        if not data.email:
            data.email = existing.get("email")
    now = datetime.now(timezone.utc)
    recent = await db.registration_otps.find_one({"phone": phone})
    if recent and recent.get("last_sent_at"):
        last_sent = recent["last_sent_at"]
        if isinstance(last_sent, str):
            last_sent = datetime.fromisoformat(last_sent.replace("Z", "+00:00"))
        if now - last_sent < timedelta(seconds=60):
            raise HTTPException(status_code=429, detail="Esperá un minuto antes de pedir otro código")

    code = f"{secrets.randbelow(1_000_000):06d}"
    delivered_by = data.channel
    if data.channel == "email":
        await _send_email_otp(str(data.email), code)
    elif data.channel == "whatsapp":
        await _send_whatsapp_otp(phone, code)
    else:
        try:
            await _send_whatsapp_otp(phone, code)
            delivered_by = "whatsapp"
        except HTTPException:
            if not data.email:
                raise HTTPException(status_code=503, detail="WhatsApp no está disponible; elegí recibir el código por email")
            await _send_email_otp(str(data.email), code)
            delivered_by = "email"
    await db.registration_otps.update_one(
        {"phone": phone},
        {"$set": {
            "phone": phone,
            "email": str(data.email) if data.email else None,
            "purpose": data.purpose,
            "delivered_by": delivered_by,
            "code_digest": _otp_digest(phone, code),
            "attempts": 0,
            "verified": False,
            "last_sent_at": now,
            "expires_at": now + timedelta(minutes=OTP_TTL_MINUTES),
        }},
        upsert=True,
    )
    return {"status": "sent", "channel": delivered_by, "expires_in_seconds": OTP_TTL_MINUTES * 60}


@router.post("/api/registration/otp/verify")
async def verify_otp(data: OtpVerify):
    phone = _normalize_phone(data.phone)
    record = await db.registration_otps.find_one({"phone": phone, "purpose": data.purpose})
    now = datetime.now(timezone.utc)
    if not record or record.get("verified"):
        raise HTTPException(status_code=400, detail="Código inválido o ya utilizado")
    expires_at = record.get("expires_at")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
    if not expires_at or expires_at < now:
        raise HTTPException(status_code=400, detail="El código venció")
    if record.get("attempts", 0) >= OTP_MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Código bloqueado; solicitá uno nuevo")
    if not hmac.compare_digest(record.get("code_digest", ""), _otp_digest(phone, data.code)):
        await db.registration_otps.update_one({"phone": phone}, {"$inc": {"attempts": 1}})
        raise HTTPException(status_code=400, detail="Código incorrecto")

    token = secrets.token_urlsafe(32)
    await db.registration_otps.update_one(
        {"phone": phone},
        {"$set": {"verified": True, "verification_digest": hashlib.sha256(token.encode()).hexdigest()}},
    )
    return {"status": "verified", "verification_token": token}


@router.post("/api/auth/otp-login")
async def otp_login(data: OtpLogin):
    phone = _normalize_phone(data.phone)
    digest = hashlib.sha256(data.verification_token.encode()).hexdigest()
    otp = await db.registration_otps.find_one({
        "phone": phone, "purpose": "login", "verified": True, "verification_digest": digest,
    })
    if not otp:
        raise HTTPException(status_code=400, detail="Verificación inválida")
    user = await db.users.find_one({"phone": phone}, {"_id": 0, "password": 0, "password_hash": 0})
    if not user or not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Cuenta no disponible")
    await db.registration_otps.delete_one({"phone": phone})
    return {"access_token": create_access_token({"sub": user["user_id"]}), "token_type": "bearer", "user": user}


@router.post("/api/registration/submit")
async def submit_registration(data: RegistrationSubmit):
    phone = _normalize_phone(data.phone)
    capabilities = sorted(set(data.capabilities))
    if any(capability not in ALLOWED_CAPABILITIES for capability in capabilities):
        raise HTTPException(status_code=400, detail="Hay una capacidad de servicio inválida")
    verification_digest = hashlib.sha256(data.verification_token.encode()).hexdigest()
    otp = await db.registration_otps.find_one({
        "phone": phone,
        "verified": True,
        "verification_digest": verification_digest,
    })
    if not otp:
        raise HTTPException(status_code=400, detail="Verificación de WhatsApp inválida")
    if await db.users.find_one({"$or": [{"phone": phone}, {"email": data.email}] if data.email else [{"phone": phone}]}):
        raise HTTPException(status_code=409, detail="Ese teléfono o correo ya está registrado")

    is_provider = bool(capabilities)
    user_id = generate_id("user_")
    now = datetime.now(timezone.utc)
    provisional_until = now + timedelta(hours=24)
    capability_approvals = {capability: {
        "status": "provisional", "submitted_at": now, "provisional_until": provisional_until,
    } for capability in capabilities}
    user_doc = {
        "user_id": user_id,
        "phone": phone,
        "email": data.email or f"phone_{user_id}@moli.local",
        "name": data.name.strip(),
        "password_hash": hash_password(data.password),
        "user_type": "driver" if is_provider else "rider",
        "capabilities": capabilities,
        "capability_approvals": capability_approvals,
        "is_professional": any(c in capabilities for c in ("professional", "tramites")),
        "is_verified": not is_provider,
        "approval_status": "provisional" if is_provider else "approved",
        "provisional_until": provisional_until if is_provider else None,
        "is_active": True,
        "wallet_balance": 0.0,
        "rating": 5.0,
        "registration_source": "whatsapp_otp",
        "created_at": now,
        "updated_at": now,
    }
    if data.promotion_plan and any(c in capabilities for c in ("ride_driver", "moto_driver", "taxi_driver")):
        user_doc.update(promotion_plan=data.promotion_plan, promotion_plan_selected_at=now)
    await db.users.insert_one(user_doc)
    if is_provider:
        vehicle = data.vehicle or {}
        await db.drivers.insert_one({
            "driver_id": user_id,
            "user_id": user_id,
            "capabilities": capabilities,
            "vehicle_make": vehicle.get("make", ""),
            "vehicle_model": vehicle.get("model", ""),
            "vehicle_year": vehicle.get("year", ""),
            "vehicle_color": vehicle.get("color", ""),
            "plate_number": vehicle.get("plate_number", ""),
            "documents_verified": False,
            "is_online": False,
            "is_available": False,
            "created_at": now,
        })
    await db.registration_otps.delete_one({"phone": phone})
    return {
        "status": user_doc["approval_status"],
        "user_id": user_id,
        "access_token": create_access_token({"sub": user_id}),
        "message": "Registro recibido. Tenés acceso provisorio por 24 horas mientras revisamos cada capacidad." if is_provider else "Registro completado.",
    }


def _require_admin(user: dict) -> None:
    if user.get("user_type") not in {"admin", "dispatcher"}:
        raise HTTPException(status_code=403, detail="Solo administración")


@router.get("/api/admin/registrations")
async def list_registrations(status: str = "pending", user: dict = Depends(get_current_user)):
    _require_admin(user)
    status_query = {"$in": ["pending", "provisional"]} if status == "pending" else status
    records = await db.users.find(
        {"approval_status": status_query},
        {"_id": 0, "password": 0, "password_hash": 0},
    ).sort("created_at", 1).to_list(200)
    return {"registrations": records}


@router.post("/api/admin/registrations/{user_id}/decision")
async def decide_registration(user_id: str, decision: str, capability: Optional[str] = None, reason: str = "", user: dict = Depends(get_current_user)):
    if decision not in ("approve","reject"):raise HTTPException(400,"Decisión inválida")
    from routes.provider_admin import review_provider, Review
    return await review_provider(user_id, Review(target="capability" if capability else "all", target_id=capability, decision=decision, reason=reason), user)
