"""Authenticated support: a single history for screen, bubble and human agents."""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, model_validator
from typing import Optional, Literal
from datetime import datetime, timezone
from database import db
from websocket_manager import manager
from utils import generate_id, get_current_user, get_settings
from support_assistant import context_for, authorize_reference, answer

router=APIRouter()

def own_session(user, supplied=None):
    canonical=f"support_{user['user_id']}"
    if supplied and supplied!=canonical:
        raise HTTPException(404,'Conversación no encontrada en tu cuenta')
    return canonical

async def limited(user):
    now=datetime.now(timezone.utc)
    key=f"{user['user_id']}:{now.strftime('%Y%m%d%H%M')}"
    from pymongo import ReturnDocument
    counter=await db.support_rate_limits.find_one_and_update({'_id':key},{'$inc':{'count':1},'$setOnInsert':{'created_at':now}},upsert=True,return_document=ReturnDocument.AFTER)
    if counter['count']>20: raise HTTPException(429,'Esperá un minuto antes de volver a consultar')

async def store_message(user,session,message,sender='user',**extra):
    document={'message_id':generate_id('smsg_'),'session_id':session,'user_id':user['user_id'],'sender':sender,'message':message,'created_at':datetime.now(timezone.utc),**extra}
    await db.support_messages.insert_one(document)
    return document

@router.get('/api/support/context')
async def support_context(user:dict=Depends(get_current_user)):
    return await context_for(db,user)

@router.post('/api/support/chat')
@router.post('/api/support/message')
async def support_message(message:str=Query(...,min_length=1,max_length=2000),session_id:Optional[str]=Query(None,max_length=120),user:dict=Depends(get_current_user)):
    session=own_session(user,session_id)
    message=message.strip()
    if not message: raise HTTPException(422,'Escribí una consulta')
    await limited(user)
    history=await db.support_messages.find({'session_id':session,'user_id':user['user_id']},{'_id':0,'sender':1,'message':1}).sort('created_at',-1).to_list(8)
    await store_message(user,session,message)
    escalated=await db.support_sessions.find_one({'session_id':session,'user_id':user['user_id'],'escalated':True})
    if escalated:
        return {'session_id':session,'response':'Tu mensaje quedó en el caso de soporte para revisión humana. No puedo garantizar un tiempo de respuesta.','escalated':True,'is_ai':False}
    context=await context_for(db,user)
    text,is_ai,reason=await answer(context,list(reversed(history)),message)
    await store_message(user,session,text,'ai',is_ai=is_ai)
    return {'session_id':session,'response':text,'is_ai':is_ai,'assistant_mode':'openai' if is_ai else 'system','unavailable_reason':reason,'escalated':False}

@router.get('/api/support/history')
async def support_history(session_id:Optional[str]=Query(None,max_length=120),user:dict=Depends(get_current_user)):
    session=own_session(user,session_id)
    rows=await db.support_messages.find({'session_id':session,'user_id':user['user_id']},{'_id':0}).sort('created_at',-1).to_list(50)
    messages=[]
    for row in reversed(rows):
        created=row.get('created_at')
        row['created_at']=created.isoformat() if isinstance(created,datetime) else str(created or '')
        row.update({'sender_id':user['user_id'] if row['sender']=='user' else 'moli_support','sender_name':user.get('name','Usuario') if row['sender']=='user' else row.get('admin_name','Moli Asistente'),'is_ai':row.get('is_ai',row['sender']=='ai'),'is_dispatcher':row['sender']=='admin'})
        messages.append(row)
    state=await db.support_sessions.find_one({'session_id':session,'user_id':user['user_id']},{'_id':0,'escalated':1})
    return {'session_id':session,'messages':messages,'sessions':[{'session_id':session,'status':'waiting' if state and state.get('escalated') else 'ai_active'}]}

class ClaimInput(BaseModel):
    category:Literal['lost_item','payment','service','account']
    description:str=Field(min_length=5,max_length=2000)
    entity_type:Optional[Literal['ride','job','order']]=None
    entity_id:Optional[str]=Field(None,min_length=1,max_length=120)

    @model_validator(mode='after')
    def valid_reference(self):
        self.description=self.description.strip()
        if len(self.description)<5: raise ValueError('Describí el problema')
        if bool(self.entity_type)!=bool(self.entity_id): raise ValueError('Indicá tipo e identificador juntos')
        if self.category=='lost_item' and self.entity_type!='ride': raise ValueError('Elegí el viaje del objeto perdido')
        return self

@router.post('/api/support/claims')
async def create_claim(data:ClaimInput,user:dict=Depends(get_current_user)):
    if data.entity_id: await authorize_reference(db,user,data.entity_type,data.entity_id)
    await limited(user)
    session=own_session(user)
    ticket={'ticket_id':generate_id('tkt_'),'user_id':user['user_id'],'session_id':session,'status':'waiting','dispatcher_id':None,'created_at':datetime.now(timezone.utc),**data.model_dump()}
    await db.support_tickets.insert_one(ticket)
    await db.support_sessions.update_one({'session_id':session,'user_id':user['user_id']},{'$set':{'session_id':session,'user_id':user['user_id'],'escalated':True,'escalated_at':datetime.now(timezone.utc)}},upsert=True)
    await store_message(user,session,f"Reclamo {ticket['ticket_id']} ({data.category}): {data.description}")
    return {'ticket_id':ticket['ticket_id'],'status':'waiting','message':'Caso registrado para revisión humana. No está resuelto todavía.'}

@router.post('/api/support/connect-dispatcher')
async def connect_to_dispatcher(session_id:Optional[str]=Query(None,max_length=120),user:dict=Depends(get_current_user)):
    own_session(user,session_id)
    return await create_claim(ClaimInput(category='account',description='Solicitud explícita de atención humana'),user)


# ─── DRIVER INBOX (Admin/Support messages) ────────────────

@router.post("/api/inbox/send")
async def send_inbox_message(
    data: dict,
    user: dict = Depends(get_current_user)
):
    """Send a message to a user's inbox (admin->driver or driver->admin)"""
    msg = {
        "message_id": generate_id("inbox_"),
        "sender_id": user["user_id"],
        "sender_name": user.get("name", "Sistema"),
        "sender_type": user["user_type"],
        "recipient_id": data.get("recipient_id", "admin"),
        "subject": data.get("subject", "Sin asunto"),
        "body": data.get("body", ""),
        "is_read": False,
        "created_at": datetime.now(timezone.utc),
    }
    await db.inbox_messages.insert_one(msg)
    
    # Notify via WebSocket
    try:
        await manager.send_to_user(msg["recipient_id"], {
            "type": "inbox_message",
            "message": msg["subject"],
        })
    except: pass
    
    return {"status": "sent", "message_id": msg["message_id"]}


@router.get("/api/inbox")
async def get_inbox(
    user: dict = Depends(get_current_user)
):
    """Get all inbox messages for the current user"""
    messages = await db.inbox_messages.find(
        {"$or": [{"recipient_id": user["user_id"]}, {"sender_id": user["user_id"]}]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    
    for m in messages:
        if isinstance(m.get("created_at"), datetime):
            m["created_at"] = m["created_at"].isoformat()
    
    # Count unread
    unread = sum(1 for m in messages if not m.get("is_read") and m.get("recipient_id") == user["user_id"])
    
    return {"messages": messages, "unread_count": unread}


@router.put("/api/inbox/{message_id}/read")
async def mark_inbox_read(
    message_id: str,
    user: dict = Depends(get_current_user)
):
    """Mark an inbox message as read"""
    await db.inbox_messages.update_one(
        {"message_id": message_id, "recipient_id": user["user_id"]},
        {"$set": {"is_read": True, "read_at": datetime.now(timezone.utc)}}
    )
    return {"status": "read"}


# ─── FIRST RIDE DISCOUNT ────────────────

@router.get("/api/promotions/first-ride")
async def get_first_ride_discount(
    user: dict = Depends(get_current_user)
):
    """Check if user is eligible for first ride discount"""
    settings = await get_settings()
    discount_pct = settings.get("first_ride_discount", 0)
    
    if discount_pct <= 0:
        return {"eligible": False, "discount_percent": 0}
    
    # Check if user has completed rides
    completed = await db.rides.count_documents({"rider_id": user["user_id"], "status": "completed"})
    
    return {
        "eligible": completed == 0,
        "discount_percent": discount_pct,
        "completed_rides": completed,
    }


# ─── ADDRESS HISTORY ────────────────

@router.get("/api/places/history")
async def get_address_history(
    user: dict = Depends(get_current_user)
):
    """Get recent addresses used by the rider"""
    # Get from completed rides
    rides = await db.rides.find(
        {"rider_id": user["user_id"], "status": "completed"},
        {"_id": 0, "dropoff_address": 1, "dropoff_location": 1, "pickup_address": 1, "pickup_location": 1, "created_at": 1}
    ).sort("created_at", -1).to_list(20)
    
    # Also get saved locations
    saved = await db.saved_locations.find(
        {"user_id": user["user_id"]},
        {"_id": 0}
    ).to_list(10)
    
    # Deduplicate addresses
    seen = set()
    history = []
    for s in saved:
        history.append({"address": s.get("address"), "location": s.get("location"), "label": s.get("label"), "type": "saved"})
        seen.add(s.get("address", ""))
    
    for r in rides:
        addr = r.get("dropoff_address", "")
        if addr and addr not in seen:
            history.append({
                "address": addr,
                "location": r.get("dropoff_location"),
                "label": None,
                "type": "recent",
            })
            seen.add(addr)
    
    return {"history": history[:15]}
