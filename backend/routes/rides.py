"""Ride routes"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import asyncio
import uuid
import math

from database import db
from websocket_manager import manager
from utils import (
    generate_id, get_current_user, get_settings, calculate_distance,
    calculate_fare, get_nearby_drivers, DEFAULT_FARES, DISPLAY_NAMES,
    adjust_wallet_balance, normalize_commission_rate,
)
from models import (
    RideRequestCreate, RideRequestResponse, BidCreate, BidResponse, EstimateRequest,
)
from dispatch import assignment_events, assignment_tasks, assign_ride_to_drivers
from notifications import (
    notify_ride_accepted, notify_driver_arrived, notify_ride_completed,
    notify_ride_cancelled, notify_new_ride_offer, notify_payment_received,
    send_push_notification,
)

router = APIRouter()


@router.post("/api/rides/request", response_model=RideRequestResponse)
async def create_ride_request(request: RideRequestCreate, user: dict = Depends(get_current_user)):
    if user["user_type"] not in ["rider", "admin"]:
        raise HTTPException(status_code=403, detail="Only riders can request rides")
    
    # Calculate total distance including intermediate stops
    total_distance_km = 0.0
    waypoints = []
    
    if request.stops and len(request.stops) > 0:
        # Build full route: pickup -> stop1 -> stop2 -> ... -> dropoff
        all_points = [request.pickup_location] + request.stops + [request.dropoff_location]
        for i in range(len(all_points) - 1):
            seg_dist = calculate_distance(
                all_points[i].latitude, all_points[i].longitude,
                all_points[i+1].latitude, all_points[i+1].longitude
            )
            total_distance_km += seg_dist
        waypoints = [s.model_dump() for s in request.stops]
    else:
        total_distance_km = calculate_distance(
            request.pickup_location.latitude, request.pickup_location.longitude,
            request.dropoff_location.latitude, request.dropoff_location.longitude
        )
    
    distance_km = total_distance_km
    
    # Estimate duration (average 30 km/h in city)
    duration_min = int((distance_km / 30) * 60)
    if duration_min < 5:
        duration_min = 5
    
    estimated_fare = await calculate_fare(distance_km, duration_min, request.vehicle_type)
    
    request_id = generate_id("req_")
    now = datetime.now(timezone.utc)
    
    request_doc = {
        "request_id": request_id,
        "rider_id": user["user_id"],
        "pickup_location": request.pickup_location.model_dump(),
        "dropoff_location": request.dropoff_location.model_dump(),
        "stops": waypoints,
        "ride_type": request.ride_type,
        "vehicle_type": request.vehicle_type,
        "status": "pending",
        "estimated_fare": estimated_fare,
        "estimated_distance": round(distance_km, 2),
        "estimated_duration": duration_min,
        "scheduled_time": request.scheduled_time,
        "notes": request.notes,
        "payment_method": request.payment_method,
        "bids": [],
        "created_at": now,
        "expires_at": now + timedelta(minutes=5)
    }
    
    await db.ride_requests.insert_one(request_doc)
    
    # Get nearby drivers sorted by distance (closest first)
    nearby = await get_nearby_drivers(
        request.pickup_location.latitude,
        request.pickup_location.longitude,
        radius_km=15.0,
        vehicle_type=request.vehicle_type
    )
    
    sorted_drivers = nearby.get("drivers", [])
    
    # Start automatic assignment in background (even with 0 drivers, loop will wait for new ones)
    task = asyncio.create_task(
        assign_ride_to_drivers(request_id, user["user_id"], sorted_drivers, request_doc)
    )
    assignment_tasks[request_id] = task
    
    return RideRequestResponse(
        request_id=request_id,
        rider_id=user["user_id"],
        pickup_location=request.pickup_location.model_dump(),
        dropoff_location=request.dropoff_location.model_dump(),
        stops=waypoints if waypoints else None,
        ride_type=request.ride_type,
        vehicle_type=request.vehicle_type,
        status="pending",
        estimated_fare=estimated_fare,
        estimated_distance=round(distance_km, 2),
        estimated_duration=duration_min,
        created_at=now,
        expires_at=now + timedelta(minutes=5),
        bids=[]
    )


@router.post("/api/rides/bid", response_model=BidResponse)
async def submit_bid(bid: BidCreate, user: dict = Depends(get_current_user)):
    if user["user_type"] != "driver":
        raise HTTPException(status_code=403, detail="Only drivers can submit bids")
    
    # Get request
    request = await db.ride_requests.find_one({"request_id": bid.request_id}, {"_id": 0})
    if not request:
        raise HTTPException(status_code=404, detail="Ride request not found")
    
    if request["status"] not in ["pending", "bidding"]:
        raise HTTPException(status_code=400, detail="Request is no longer accepting bids")
    
    # Get driver's vehicle
    vehicle = await db.vehicles.find_one(
        {"driver_id": user["user_id"], "is_active": True},
        {"_id": 0}
    )
    if not vehicle:
        raise HTTPException(status_code=400, detail="No active vehicle found")
    
    bid_id = generate_id("bid_")
    now = datetime.now(timezone.utc)
    
    bid_doc = {
        "bid_id": bid_id,
        "request_id": bid.request_id,
        "driver_id": user["user_id"],
        "driver_name": user["name"],
        "driver_rating": user.get("rating", 5.0),
        "vehicle_info": {
            "vehicle_id": vehicle["vehicle_id"],
            "make": vehicle["make"],
            "model": vehicle["model"],
            "color": vehicle["color"],
            "plate_number": vehicle["plate_number"],
            "vehicle_type": vehicle["vehicle_type"]
        },
        "fare_amount": bid.fare_amount,
        "estimated_arrival": bid.estimated_arrival,
        "status": "pending",
        "created_at": now
    }
    
    await db.bids.insert_one(bid_doc)
    
    # Update request status to bidding
    await db.ride_requests.update_one(
        {"request_id": bid.request_id},
        {
            "$set": {"status": "bidding"},
            "$push": {"bids": bid_doc}
        }
    )
    
    # Notify rider
    await manager.send_personal_message(
        {"type": "new_bid", "bid": {k: v for k, v in bid_doc.items() if k != "_id"}},
        request["rider_id"]
    )
    
    return BidResponse(
        bid_id=bid_id,
        request_id=bid.request_id,
        driver_id=user["user_id"],
        driver_name=user["name"],
        driver_rating=user.get("rating", 5.0),
        vehicle_info=bid_doc["vehicle_info"],
        fare_amount=bid.fare_amount,
        estimated_arrival=bid.estimated_arrival,
        created_at=now
    )


@router.post("/api/rides/request/{request_id}/cancel")
async def cancel_ride_request(request_id: str, user: dict = Depends(get_current_user)):
    """Rider cancels a pending ride request - stops the dispatch loop"""
    request_doc = await db.ride_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not request_doc:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    
    if request_doc.get("rider_id") != user["user_id"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    
    await db.ride_requests.update_one(
        {"request_id": request_id},
        {"$set": {"status": "cancelled", "current_offer_driver": None}}
    )
    
    # Signal the assignment event so background task stops
    if request_id in assignment_events:
        assignment_events[request_id].set()
    
    return {"status": "cancelled", "message": "Búsqueda cancelada"}


@router.post("/api/rides/{request_id}/driver-response")
async def driver_respond_to_offer(
    request_id: str,
    action: str = Query(..., description="accept or reject"),
    user: dict = Depends(get_current_user)
):
    """Driver accepts or rejects an automatic dispatch offer"""
    if user["user_type"] != "driver":
        raise HTTPException(status_code=403, detail="Solo conductores pueden responder ofertas")
    
    request_doc = await db.ride_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not request_doc:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    
    if request_doc.get("status") not in ["pending", "bidding", "searching"]:
        raise HTTPException(status_code=400, detail="Esta solicitud ya no está disponible")
    
    # Verify this driver is the one being offered
    if request_doc.get("current_offer_driver") != user["user_id"]:
        raise HTTPException(status_code=400, detail="Esta oferta no está asignada a ti")
    
    if action == "accept":
        # Check if a ride already exists for this request (manual trips create one)
        existing_ride = await db.rides.find_one({"request_id": request_id}, {"_id": 0})
        
        now = datetime.now(timezone.utc)
        settings = await get_settings()
        fare = request_doc.get("estimated_fare") or (existing_ride.get("fare") if existing_ride else 0) or 0
        commission_rate = normalize_commission_rate(settings.get("commission_rate"))
        commission = fare * commission_rate
        driver_earnings = fare - commission
        
        # Get driver vehicle
        vehicle = await db.vehicles.find_one(
            {"driver_id": user["user_id"], "is_active": True},
            {"_id": 0}
        )
        
        vehicle_info = {
            "make": vehicle.get("make", "") if vehicle else "",
            "model": vehicle.get("model", "") if vehicle else "",
            "color": vehicle.get("color", "") if vehicle else "",
            "plate_number": vehicle.get("plate_number", "") if vehicle else "",
            "vehicle_type": vehicle.get("vehicle_type", "economy") if vehicle else "economy",
        } if vehicle else None
        
        is_taximeter = request_doc.get("dropoff_location") is None or existing_ride.get("is_ticketera", False) if existing_ride else False
        
        if existing_ride:
            # Update the existing ride (manual trips)
            ride_id = existing_ride["ride_id"]
            await db.rides.update_one(
                {"ride_id": ride_id},
                {"$set": {
                    "driver_id": user["user_id"],
                    "status": "accepted",
                    "fare": fare,
                    "commission": round(commission, 2),
                    "driver_earnings": round(driver_earnings, 2),
                    "vehicle_info": vehicle_info,
                    "accepted_at": now,
                    "is_taximeter": is_taximeter,
                }}
            )
            ride_doc = {**existing_ride, "driver_id": user["user_id"], "status": "accepted", "accepted_at": now, "vehicle_info": vehicle_info, "is_taximeter": is_taximeter}
        else:
            # Create new ride (app-based requests)
            ride_id = generate_id("ride_")
            ride_doc = {
                "ride_id": ride_id,
                "request_id": request_id,
                "rider_id": request_doc["rider_id"],
                "driver_id": user["user_id"],
                "pickup_location": request_doc["pickup_location"],
                "dropoff_location": request_doc.get("dropoff_location"),
                "ride_type": request_doc.get("ride_type", "standard"),
                "vehicle_type": request_doc.get("vehicle_type", "economy"),
                "status": "accepted",
                "fare": fare,
                "commission": round(commission, 2),
                "driver_earnings": round(driver_earnings, 2),
                "payment_method": request_doc.get("payment_method", "cash"),
                "payment_status": "pending",
                "driver_location": None,
                "vehicle_info": vehicle_info,
                "is_taximeter": request_doc.get("dropoff_location") is None,
                "accepted_at": now,
                "started_at": None,
                "completed_at": None,
                "cancelled_at": None,
                "created_at": now
            }
            await db.rides.insert_one(ride_doc)
        
        # Update request status
        await db.ride_requests.update_one(
            {"request_id": request_id},
            {"$set": {"status": "accepted", "accepted_by": user["user_id"]}}
        )
        
        # Mark driver unavailable
        await db.drivers.update_one(
            {"driver_id": user["user_id"]},
            {"$set": {"is_available": False}}
        )
        
        # Signal the assignment event so the background task knows
        if request_id in assignment_events:
            assignment_events[request_id].set()
        
        # ALSO directly notify rider via WebSocket (don't rely only on background task)
        rider_id = request_doc["rider_id"]
        try:
            ride_data = {k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in ride_doc.items() if k != "_id"}
            await manager.send_personal_message({
                "type": "ride_accepted",
                "ride": ride_data,
                "driver": {
                    "user_id": user["user_id"],
                    "name": user.get("name", "Conductor"),
                    "phone": user.get("phone"),
                    "rating": user.get("rating", 5.0),
                }
            }, rider_id)
        except Exception as e:
            print(f"Could not notify rider {rider_id} via WS: {e}")
        
        # Build response with driver/vehicle info
        driver_info = {
            "user_id": user["user_id"],
            "name": user.get("name", "Conductor"),
            "phone": user.get("phone"),
            "rating": user.get("rating", 5.0),
        }
        
        ride_response = {k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in ride_doc.items() if k != "_id"}
        ride_response["driver_info"] = driver_info
        
        # Send taximeter notification if applicable
        if ride_doc.get("is_taximeter") or ride_doc.get("is_ticketera"):
            try:
                await send_push_notification(
                    user["user_id"],
                    "Viaje de Taxímetro",
                    "Este viaje usa taxímetro. El cobro se calcula por distancia recorrida y tiempo de espera. ¡Aprovechá para generar más ingresos!",
                    data={"type": "taximeter_ride", "ride_id": ride_id}
                )
            except Exception:
                pass
        
        return {
            "status": "accepted",
            "ride_id": ride_id,
            "ride": ride_response
        }
    
    elif action == "reject":
        # Signal event so background task moves to the next driver
        if request_id in assignment_events:
            assignment_events[request_id].set()
        
        return {"status": "rejected", "message": "Oferta rechazada, se notificará al siguiente conductor"}
    
    else:
        raise HTTPException(status_code=400, detail="Acción inválida. Usa 'accept' o 'reject'")


@router.post("/api/rides/accept-bid/{bid_id}")
async def accept_bid(bid_id: str, user: dict = Depends(get_current_user)):
    bid = await db.bids.find_one({"bid_id": bid_id}, {"_id": 0})
    if not bid:
        raise HTTPException(status_code=404, detail="Bid not found")
    
    request = await db.ride_requests.find_one({"request_id": bid["request_id"]}, {"_id": 0})
    if not request:
        raise HTTPException(status_code=404, detail="Ride request not found")
    
    if request["rider_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Create ride
    ride_id = generate_id("ride_")
    now = datetime.now(timezone.utc)
    
    settings = await get_settings()
    commission = bid["fare_amount"] * normalize_commission_rate(settings.get("commission_rate"))
    driver_earnings = bid["fare_amount"] - commission
    
    ride_doc = {
        "ride_id": ride_id,
        "request_id": request["request_id"],
        "rider_id": request["rider_id"],
        "driver_id": bid["driver_id"],
        "pickup_location": request["pickup_location"],
        "dropoff_location": request["dropoff_location"],
        "ride_type": request["ride_type"],
        "vehicle_type": request["vehicle_type"],
        "status": "accepted",
        "fare": bid["fare_amount"],
        "commission": round(commission, 2),
        "driver_earnings": round(driver_earnings, 2),
        "payment_method": request["payment_method"],
        "payment_status": "pending",
        "driver_location": None,
        "accepted_at": now,
        "started_at": None,
        "completed_at": None,
        "cancelled_at": None,
        "created_at": now
    }
    
    await db.rides.insert_one(ride_doc)
    
    # Update request and bid status
    await db.ride_requests.update_one(
        {"request_id": request["request_id"]},
        {"$set": {"status": "accepted"}}
    )
    await db.bids.update_one(
        {"bid_id": bid_id},
        {"$set": {"status": "accepted"}}
    )
    
    # Reject other bids
    await db.bids.update_many(
        {"request_id": request["request_id"], "bid_id": {"$ne": bid_id}},
        {"$set": {"status": "rejected"}}
    )
    
    # Update driver availability
    await db.drivers.update_one(
        {"driver_id": bid["driver_id"]},
        {"$set": {"is_available": False}}
    )
    
    # Notify driver
    await manager.send_personal_message(
        {"type": "bid_accepted", "ride": {k: v for k, v in ride_doc.items() if k != "_id"}},
        bid["driver_id"]
    )
    
    return {"status": "success", "ride_id": ride_id, "ride": {
        "ride_id": ride_id,
        "request_id": request["request_id"],
        "rider_id": request["rider_id"],
        "driver_id": bid["driver_id"],
        "pickup_location": request["pickup_location"],
        "dropoff_location": request["dropoff_location"],
        "ride_type": request["ride_type"],
        "vehicle_type": request["vehicle_type"],
        "status": "accepted",
        "fare": bid["fare_amount"],
        "commission": round(commission, 2),
        "driver_earnings": round(driver_earnings, 2),
        "payment_method": request["payment_method"],
        "payment_status": "pending",
        "accepted_at": now.isoformat(),
        "created_at": now.isoformat()
    }}


@router.put("/api/rides/{ride_id}/status")
async def update_ride_status(
    ride_id: str,
    status: str,  # arrived, started, completed, cancelled
    taximeter_fare: float = Query(None),
    taximeter_distance: float = Query(None),
    taximeter_wait: float = Query(None),
    user: dict = Depends(get_current_user)
):
    ride = await db.rides.find_one({"ride_id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    
    # Check authorization
    if user["user_id"] not in [ride["rider_id"], ride["driver_id"]]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    now = datetime.now(timezone.utc)
    update_data = {"status": status, "updated_at": now}
    penalty_info = None
    
    if status == "started":
        update_data["started_at"] = now
    elif status == "completed":
        update_data["completed_at"] = now
        update_data["payment_status"] = "completed"
        
        # If taximeter fare provided, use it instead of the pre-calculated fare
        if taximeter_fare and taximeter_fare > 0:
            settings = await get_settings()
            commission_rate = normalize_commission_rate(settings.get("commission_rate"))
            commission = taximeter_fare * commission_rate
            driver_earnings = taximeter_fare - commission
            update_data["fare"] = round(taximeter_fare, 2)
            update_data["commission"] = round(commission, 2)
            update_data["driver_earnings"] = round(driver_earnings, 2)
            update_data["taximeter_data"] = {
                "fare": round(taximeter_fare, 2),
                "distance_km": round(taximeter_distance or 0, 2),
                "wait_minutes": round((taximeter_wait or 0) / 60, 1),
            }
        
        # Check if rider has pending penalties -> add to fare
        settings = await get_settings()
        pending_penalties = await db.cancellation_records.find(
            {"user_id": ride["rider_id"], "status": "pending"}
        ).to_list(10)
        
        total_penalty = sum(p.get("penalty_amount", 0) for p in pending_penalties)
        if total_penalty > 0:
            # Add penalty to fare
            new_fare = ride.get("fare", 0) + total_penalty
            new_commission = new_fare * normalize_commission_rate(settings.get("commission_rate"))
            new_driver_earnings = new_fare - new_commission
            update_data["fare"] = round(new_fare, 2)
            update_data["commission"] = round(new_commission, 2)
            update_data["driver_earnings"] = round(new_driver_earnings, 2)
            update_data["penalty_surcharge"] = round(total_penalty, 2)
            
            # Mark penalties as paid
            for p in pending_penalties:
                await db.cancellation_records.update_one(
                    {"record_id": p["record_id"]},
                    {"$set": {"status": "collected", "collected_ride_id": ride_id, "collected_at": now}}
                )
            
            # Update rider wallet (clear the negative from penalties)
            await adjust_wallet_balance(ride["rider_id"], total_penalty)
            
            # Record rider wallet transaction
            await db.wallet_transactions.insert_one({
                "transaction_id": generate_id("txn_"),
                "user_id": ride["rider_id"],
                "amount": total_penalty,
                "transaction_type": "penalty_collection",
                "description": f"Multas pendientes cobradas en viaje {ride_id}",
                "ride_id": ride_id,
                "status": "completed",
                "created_at": now,
            })
        
        # Determine payment method
        payment_method = ride.get("payment_method", "cash")
        final_fare = update_data.get("fare", ride.get("fare", 0))
        commission_rate = normalize_commission_rate(settings.get("commission_rate"))
        final_commission = round(final_fare * commission_rate, 2)
        final_driver_earnings = round(final_fare - final_commission, 2)
        update_data["commission"] = final_commission
        update_data["driver_earnings"] = final_driver_earnings
        
        if payment_method == "cash":
            # CASH: Driver collected full fare from rider physically
            # Driver OWES the system the commission → wallet goes NEGATIVE by commission
            await adjust_wallet_balance(ride["driver_id"], -final_commission)
            await db.wallet_transactions.insert_one({
                "transaction_id": generate_id("txn_"),
                "user_id": ride["driver_id"],
                "amount": -final_commission,
                "transaction_type": "commission_debit",
                "description": f"Comisión por viaje (efectivo) - debes ${final_commission} al sistema",
                "ride_id": ride_id,
                "status": "completed",
                "created_at": now,
            })
        else:
            # CARD: System collected the money → Driver gets earnings credited
            await adjust_wallet_balance(ride["driver_id"], final_driver_earnings)
            await db.wallet_transactions.insert_one({
                "transaction_id": generate_id("txn_"),
                "user_id": ride["driver_id"],
                "amount": final_driver_earnings,
                "transaction_type": "ride_earnings",
                "description": f"Ganancia del viaje (tarjeta) - ${final_driver_earnings}",
                "ride_id": ride_id,
                "status": "completed",
                "created_at": now,
            })
        
        # Update driver stats
        await db.drivers.update_one(
            {"driver_id": ride["driver_id"]},
            {
                "$set": {"is_available": True},
                "$inc": {
                    "completed_rides": 1,
                    "total_earnings": final_driver_earnings
                }
            }
        )
        
        # Check if driver wallet hit max negative after commission
        driver_user = await db.users.find_one({"user_id": ride["driver_id"]})
        max_neg = settings.get("driver_max_negative_balance", -15000)
        if driver_user and driver_user.get("wallet_balance", 0) <= max_neg:
            await db.drivers.update_one(
                {"driver_id": ride["driver_id"]},
                {"$set": {
                    "is_blocked": True,
                    "block_reason": "negative_balance",
                    "blocked_at": now,
                    "blocked_until": None,
                    "is_available": False,
                    "is_online": False,
                }}
            )
        
        # Update user stats
        await db.users.update_one(
            {"user_id": ride["rider_id"]},
            {"$inc": {"total_rides": 1}}
        )
        await db.users.update_one(
            {"user_id": ride["driver_id"]},
            {"$inc": {"total_rides": 1}}
        )
        
    elif status == "cancelled":
        update_data["cancelled_at"] = now
        update_data["cancelled_by"] = user["user_id"]
        
        # Make driver available again
        await db.drivers.update_one(
            {"driver_id": ride["driver_id"]},
            {"$set": {"is_available": True}}
        )
        
        # Check if cancellation is within free window
        settings = await get_settings()
        free_minutes = settings.get("cancel_free_minutes", 1)
        accepted_at = ride.get("accepted_at")
        
        is_free_cancel = False
        if accepted_at:
            if isinstance(accepted_at, str):
                accepted_at = datetime.fromisoformat(accepted_at.replace("Z", "+00:00"))
            # Ensure both datetimes are timezone-aware
            if accepted_at.tzinfo is None:
                accepted_at = accepted_at.replace(tzinfo=timezone.utc)
            elapsed = (now - accepted_at).total_seconds() / 60.0
            is_free_cancel = elapsed <= free_minutes
        
        canceller_type = "rider" if user["user_id"] == ride["rider_id"] else "driver"
        
        if not is_free_cancel and accepted_at:
            
            if canceller_type == "rider":
                penalty_amount = settings.get("rider_cancel_penalty", 500)
                
                # Count existing pending penalties for rider
                existing_pending = await db.cancellation_records.count_documents(
                    {"user_id": user["user_id"], "status": "pending"}
                )
                
                # Record penalty
                record = {
                    "record_id": generate_id("cancel_"),
                    "user_id": user["user_id"],
                    "user_type": "rider",
                    "ride_id": ride_id,
                    "penalty_amount": penalty_amount,
                    "status": "pending",
                    "created_at": now,
                }
                await db.cancellation_records.insert_one(record)
                
                # Deduct from rider wallet
                await adjust_wallet_balance(user["user_id"], -penalty_amount)
                
                # Record rider wallet transaction
                await db.wallet_transactions.insert_one({
                    "transaction_id": generate_id("txn_"),
                    "user_id": user["user_id"],
                    "amount": -penalty_amount,
                    "transaction_type": "cancel_penalty",
                    "description": "Multa por cancelación tardía del viaje",
                    "ride_id": ride_id,
                    "status": "completed",
                    "created_at": now,
                })
                
                # CREDIT driver as compensation for wasted time
                driver_compensation = penalty_amount
                await adjust_wallet_balance(ride["driver_id"], driver_compensation)
                await db.wallet_transactions.insert_one({
                    "transaction_id": generate_id("txn_"),
                    "user_id": ride["driver_id"],
                    "amount": driver_compensation,
                    "transaction_type": "cancel_compensation",
                    "description": f"Compensación por cancelación del pasajero (+${driver_compensation})",
                    "ride_id": ride_id,
                    "status": "completed",
                    "created_at": now,
                })
                
                # Notify driver about the compensation
                await manager.send_personal_message({
                    "type": "ride_cancelled_by_rider",
                    "ride_id": ride_id,
                    "message": f"El pasajero canceló. Recibiste ${driver_compensation} de compensación.",
                    "compensation": driver_compensation,
                }, ride["driver_id"])
                
                penalty_info = {
                    "penalty_applied": True,
                    "penalty_amount": penalty_amount,
                    "message": f"Se aplicó una multa de ${penalty_amount} por cancelación tardía. Se sumará a tu próximo viaje.",
                    "pending_penalties": existing_pending + 1,
                }
                
            elif canceller_type == "driver":
                penalty_amount = settings.get("driver_cancel_penalty", 500)
                block_after = settings.get("driver_block_after_cancels", 3)
                block_hours = settings.get("driver_block_hours", 24)
                
                # Count driver cancellations in last 30 days
                thirty_days_ago = now - timedelta(days=30)
                recent_cancels = await db.cancellation_records.count_documents(
                    {"user_id": user["user_id"], "user_type": "driver", "created_at": {"$gte": thirty_days_ago}}
                )
                cancel_number = recent_cancels + 1  # this is the current one
                
                # Record penalty
                record = {
                    "record_id": generate_id("cancel_"),
                    "user_id": user["user_id"],
                    "user_type": "driver",
                    "ride_id": ride_id,
                    "penalty_amount": penalty_amount,
                    "cancel_number": cancel_number,
                    "status": "charged",
                    "created_at": now,
                }
                
                if cancel_number >= block_after:
                    # Block the driver
                    block_until = None
                    if block_hours > 0:
                        block_until = now + timedelta(hours=block_hours)
                    
                    await db.drivers.update_one(
                        {"driver_id": user["user_id"]},
                        {"$set": {
                            "is_blocked": True,
                            "block_reason": "cancellations",
                            "blocked_at": now,
                            "blocked_until": block_until,
                            "is_available": False,
                            "is_online": False,
                        }}
                    )
                    record["block_applied"] = True
                    record["blocked_until"] = block_until
                    
                    penalty_info = {
                        "penalty_applied": True,
                        "penalty_amount": penalty_amount,
                        "blocked": True,
                        "blocked_until": block_until.isoformat() if block_until else None,
                        "message": f"Has sido bloqueado por {block_hours}h debido a {cancel_number} cancelaciones." if block_hours > 0 else "Has sido bloqueado permanentemente por cancelaciones excesivas.",
                    }
                else:
                    penalty_info = {
                        "penalty_applied": True,
                        "penalty_amount": penalty_amount,
                        "blocked": False,
                        "cancel_count": cancel_number,
                        "cancels_before_block": block_after - cancel_number,
                        "message": f"Multa de ${penalty_amount}. Cancelación {cancel_number}/{block_after} antes de bloqueo.",
                    }
                
                await db.cancellation_records.insert_one(record)
                
                # Deduct from driver wallet
                await adjust_wallet_balance(user["user_id"], -penalty_amount)
                
                # Record wallet transaction
                await db.wallet_transactions.insert_one({
                    "transaction_id": generate_id("txn_"),
                    "user_id": user["user_id"],
                    "amount": -penalty_amount,
                    "transaction_type": "cancel_penalty",
                    "description": f"Multa por cancelación tardía #{cancel_number}",
                    "ride_id": ride_id,
                    "status": "completed",
                    "created_at": now,
                })
                
                # Check if driver wallet is below max negative
                updated_user = await db.users.find_one({"user_id": user["user_id"]})
                max_neg = settings.get("driver_max_negative_balance", -15000)
                if updated_user and updated_user.get("wallet_balance", 0) <= max_neg:
                    await db.drivers.update_one(
                        {"driver_id": user["user_id"]},
                        {"$set": {
                            "is_blocked": True,
                            "block_reason": "negative_balance",
                            "blocked_at": now,
                            "blocked_until": None,
                            "is_available": False,
                            "is_online": False,
                        }}
                    )
                    if penalty_info:
                        penalty_info["blocked"] = True
                        penalty_info["block_reason"] = "negative_balance"
                        penalty_info["message"] = f"Tu saldo llegó al límite de ${max_neg}. No puedes trabajar hasta recargar."
                
                # AUTO RE-DISPATCH: Notify rider and search for another driver
                await manager.send_personal_message({
                    "type": "driver_cancelled_redispatching",
                    "ride_id": ride_id,
                    "message": "Tu conductor canceló. Buscando otro conductor...",
                }, ride["rider_id"])
                
                # Re-create ride request for dispatch
                try:
                    pickup = ride.get("pickup", {})
                    dropoff = ride.get("dropoff", {})
                    new_req_id = generate_id("req_")
                    new_request_doc = {
                        "request_id": new_req_id,
                        "rider_id": ride["rider_id"],
                        "pickup_location": pickup,
                        "dropoff_location": dropoff,
                        "stops": ride.get("stops", []),
                        "ride_type": "instant",
                        "vehicle_type": ride.get("vehicle_type", "standard"),
                        "status": "pending",
                        "estimated_fare": ride.get("fare", 0),
                        "estimated_distance": ride.get("distance_km", 0),
                        "estimated_duration": ride.get("duration_min", 0),
                        "payment_method": ride.get("payment_method", "cash"),
                        "bids": [],
                        "created_at": now,
                        "expires_at": now + timedelta(minutes=5),
                        "excluded_drivers": [ride["driver_id"]],
                        "redispatch_from": ride_id,
                    }
                    await db.ride_requests.insert_one(new_request_doc)
                    
                    nearby = await get_nearby_drivers(
                        pickup.get("latitude", pickup.get("lat", 0)),
                        pickup.get("longitude", pickup.get("lng", 0)),
                        radius_km=15.0,
                        vehicle_type=ride.get("vehicle_type"),
                    )
                    sorted_drivers = [d for d in nearby.get("drivers", []) if d["driver_id"] != ride["driver_id"]]
                    
                    if sorted_drivers:
                        import asyncio as _aio
                        task = _aio.create_task(
                            assign_ride_to_drivers(new_req_id, ride["rider_id"], sorted_drivers, new_request_doc)
                        )
                        assignment_tasks[new_req_id] = task
                    else:
                        await manager.send_personal_message({
                            "type": "no_drivers_available",
                            "ride_id": ride_id,
                            "message": "No hay conductores disponibles en este momento. Intenta de nuevo.",
                        }, ride["rider_id"])
                except Exception as e:
                    print(f"Error re-dispatching ride: {e}")
                    await manager.send_personal_message({
                        "type": "redispatch_failed",
                        "ride_id": ride_id,
                        "message": "No se pudo buscar otro conductor. Intenta solicitar un nuevo viaje.",
                    }, ride["rider_id"])
        else:
            penalty_info = {"penalty_applied": False, "message": "Cancelación sin cargo (dentro del tiempo libre)."}
            
            # Even free cancels: notify the other party and re-dispatch if driver cancelled
            if canceller_type == "driver":
                await manager.send_personal_message({
                    "type": "driver_cancelled_redispatching",
                    "ride_id": ride_id,
                    "message": "Tu conductor canceló. Buscando otro conductor...",
                }, ride["rider_id"])
                
                # Re-dispatch
                try:
                    pickup = ride.get("pickup", {})
                    new_req_id = generate_id("req_")
                    new_request_doc = {
                        "request_id": new_req_id,
                        "rider_id": ride["rider_id"],
                        "pickup_location": pickup,
                        "dropoff_location": ride.get("dropoff", {}),
                        "stops": ride.get("stops", []),
                        "ride_type": "instant",
                        "vehicle_type": ride.get("vehicle_type", "standard"),
                        "status": "pending",
                        "estimated_fare": ride.get("fare", 0),
                        "estimated_distance": ride.get("distance_km", 0),
                        "estimated_duration": ride.get("duration_min", 0),
                        "payment_method": ride.get("payment_method", "cash"),
                        "bids": [],
                        "created_at": now,
                        "expires_at": now + timedelta(minutes=5),
                        "excluded_drivers": [ride["driver_id"]],
                        "redispatch_from": ride_id,
                    }
                    await db.ride_requests.insert_one(new_request_doc)
                    
                    nearby = await get_nearby_drivers(
                        pickup.get("latitude", pickup.get("lat", 0)),
                        pickup.get("longitude", pickup.get("lng", 0)),
                        radius_km=15.0,
                        vehicle_type=ride.get("vehicle_type"),
                    )
                    sorted_drivers = [d for d in nearby.get("drivers", []) if d["driver_id"] != ride["driver_id"]]
                    
                    if sorted_drivers:
                        import asyncio as _aio
                        task = _aio.create_task(
                            assign_ride_to_drivers(new_req_id, ride["rider_id"], sorted_drivers, new_request_doc)
                        )
                        assignment_tasks[new_req_id] = task
                    else:
                        await manager.send_personal_message({
                            "type": "no_drivers_available",
                            "ride_id": ride_id,
                            "message": "No hay conductores disponibles. Intenta de nuevo.",
                        }, ride["rider_id"])
                except Exception as e:
                    print(f"Error re-dispatching ride: {e}")
            elif canceller_type == "rider":
                await manager.send_personal_message({
                    "type": "ride_cancelled_by_rider",
                    "ride_id": ride_id,
                    "message": "El pasajero canceló el viaje (sin cargo).",
                    "compensation": 0,
                }, ride["driver_id"])
    
    await db.rides.update_one({"ride_id": ride_id}, {"$set": update_data})
    
    # Notify both parties
    other_user_id = ride["driver_id"] if user["user_id"] == ride["rider_id"] else ride["rider_id"]
    ws_data = {"type": "ride_status_update", "ride_id": ride_id, "status": status}
    if penalty_info:
        ws_data["penalty_info"] = {k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in penalty_info.items()} if penalty_info else None
    await manager.send_personal_message(ws_data, other_user_id)
    
    response = {"status": "success", "ride_status": status}
    if penalty_info:
        response["penalty"] = penalty_info
    if status == "completed" and update_data.get("penalty_surcharge"):
        response["penalty_surcharge"] = update_data["penalty_surcharge"]
        response["new_fare"] = update_data["fare"]
    return response


@router.get("/api/rides/active")
async def get_active_ride(user: dict = Depends(get_current_user)):
    """Get active ride OR recently completed ride (within 2 min)"""
    query = {"status": {"$in": ["accepted", "arrived", "started"]}}
    
    if user["user_type"] == "rider":
        query["rider_id"] = user["user_id"]
    elif user["user_type"] == "driver":
        query["driver_id"] = user["user_id"]
    
    ride = await db.rides.find_one(query, {"_id": 0})
    
    # If no active ride, check recently completed (so rider can see completion screen)
    if not ride:
        from datetime import timedelta
        two_min_ago = datetime.now(timezone.utc) - timedelta(minutes=2)
        completed_query = {
            "status": "completed",
            "completed_at": {"$gte": two_min_ago}
        }
        if user["user_type"] == "rider":
            completed_query["rider_id"] = user["user_id"]
        elif user["user_type"] == "driver":
            completed_query["driver_id"] = user["user_id"]
        ride = await db.rides.find_one(completed_query, {"_id": 0}, sort=[("completed_at", -1)])
    
    if ride:
        # Get additional info
        driver = await db.users.find_one(
            {"user_id": ride["driver_id"]},
            {"_id": 0, "name": 1, "phone": 1, "rating": 1, "profile_picture": 1}
        )
        rider = await db.users.find_one(
            {"user_id": ride["rider_id"]},
            {"_id": 0, "name": 1, "phone": 1, "rating": 1, "profile_picture": 1}
        )
        vehicle = await db.vehicles.find_one(
            {"driver_id": ride["driver_id"], "is_active": True},
            {"_id": 0}
        )
        driver_location = await db.drivers.find_one(
            {"driver_id": ride["driver_id"]},
            {"_id": 0, "current_location": 1}
        )
        
        ride["driver_info"] = driver
        ride["rider_info"] = rider
        ride["vehicle_info"] = vehicle
        ride["driver_location"] = driver_location.get("current_location") if driver_location else None
        
        # Ensure all datetime fields include timezone info (UTC) for correct client parsing
        for dt_field in ["accepted_at", "started_at", "completed_at", "cancelled_at", "created_at", "updated_at"]:
            if isinstance(ride.get(dt_field), datetime):
                dt_val = ride[dt_field]
                if dt_val.tzinfo is None:
                    dt_val = dt_val.replace(tzinfo=timezone.utc)
                ride[dt_field] = dt_val.isoformat()
    
    return {"ride": ride}


@router.get("/api/rides/my-rides")
async def get_my_rides(
    status: Optional[str] = None,
    limit: int = 20,
    user: dict = Depends(get_current_user)
):
    """Alias for /api/rides - get user's rides"""
    query = {}
    
    if user["user_type"] == "rider":
        query["rider_id"] = user["user_id"]
    elif user["user_type"] == "driver":
        query["driver_id"] = user["user_id"]
    
    if status:
        query["status"] = status
    
    rides = await db.rides.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return {"rides": rides}


@router.get("/api/rides/{ride_id}")
async def get_ride(ride_id: str, user: dict = Depends(get_current_user)):
    ride = await db.rides.find_one({"ride_id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    
    if user["user_id"] not in [ride["rider_id"], ride["driver_id"]] and user["user_type"] != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get driver and rider info
    driver = await db.users.find_one(
        {"user_id": ride["driver_id"]},
        {"_id": 0, "name": 1, "phone": 1, "rating": 1, "profile_picture": 1}
    )
    rider = await db.users.find_one(
        {"user_id": ride["rider_id"]},
        {"_id": 0, "name": 1, "phone": 1, "rating": 1, "profile_picture": 1}
    )
    vehicle = await db.vehicles.find_one(
        {"driver_id": ride["driver_id"], "is_active": True},
        {"_id": 0}
    )
    
    ride["driver_info"] = driver
    ride["rider_info"] = rider
    ride["vehicle_info"] = vehicle
    
    return ride


@router.post("/api/rides/{ride_id}/rate")
async def rate_ride(
    ride_id: str,
    rating: float,
    comment: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    ride = await db.rides.find_one({"ride_id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    
    if ride["status"] != "completed":
        raise HTTPException(status_code=400, detail="Can only rate completed rides")
    
    # Determine who is being rated
    if user["user_id"] == ride["rider_id"]:
        rated_user_id = ride["driver_id"]
        rating_field = "driver_rating"
    else:
        rated_user_id = ride["rider_id"]
        rating_field = "rider_rating"
    
    # Save rating
    rating_doc = {
        "rating_id": generate_id("rat_"),
        "ride_id": ride_id,
        "rater_id": user["user_id"],
        "rated_id": rated_user_id,
        "rating": rating,
        "comment": comment,
        "created_at": datetime.now(timezone.utc)
    }
    await db.ratings.insert_one(rating_doc)
    
    # Update ride
    await db.rides.update_one(
        {"ride_id": ride_id},
        {"$set": {rating_field: rating}}
    )
    
    # Update user's average rating
    all_ratings = await db.ratings.find({"rated_id": rated_user_id}, {"rating": 1}).to_list(1000)
    avg_rating = sum(r["rating"] for r in all_ratings) / len(all_ratings) if all_ratings else 5.0
    
    await db.users.update_one(
        {"user_id": rated_user_id},
        {"$set": {"rating": round(avg_rating, 2)}}
    )
    
    return {"status": "success", "message": "Rating submitted"}


@router.get("/api/rides/requests/pending")
async def get_pending_requests(
    latitude: float,
    longitude: float,
    radius_km: float = 10.0,
    user: dict = Depends(get_current_user)
):
    if user["user_type"] != "driver":
        raise HTTPException(status_code=403, detail="Only drivers can view requests")
    
    # Get driver's vehicle type
    vehicle = await db.vehicles.find_one(
        {"driver_id": user["user_id"], "is_active": True},
        {"_id": 0}
    )
    if not vehicle:
        return {"requests": []}
    
    now = datetime.now(timezone.utc)
    requests = await db.ride_requests.find({
        "status": {"$in": ["pending", "bidding"]},
        "expires_at": {"$gt": now}
    }, {"_id": 0}).to_list(50)
    
    # Filter by distance and vehicle type
    nearby_requests = []
    for req in requests:
        pickup = req.get("pickup_location", {})
        distance = calculate_distance(
            latitude, longitude,
            pickup.get("latitude", 0), pickup.get("longitude", 0)
        )
        
        if distance <= radius_km:
            # Check if driver already bid
            already_bid = any(
                b.get("driver_id") == user["user_id"]
                for b in req.get("bids", [])
            )
            
            if not already_bid:
                req["distance_to_pickup"] = round(distance, 2)
                nearby_requests.append(req)
    
    nearby_requests.sort(key=lambda x: x["distance_to_pickup"])
    return {"requests": nearby_requests}


@router.post("/api/rides/estimate")
async def estimate_fares(data: EstimateRequest):
    """Calculate fare estimates for all vehicle types"""
    fares = await db.fare_config.find({}, {"_id": 0}).to_list(20)
    if not fares:
        fares = [{"vehicle_type": k, **v} for k, v in DEFAULT_FARES.items()]
    
    estimates = []
    for fare in fares:
        price = fare.get("base_fare", 500) + (data.distance_km * fare.get("per_km", 150)) + (data.duration_min * fare.get("per_min", 50))
        min_fare = fare.get("min_fare", 0)
        price = max(price, min_fare)
        estimates.append({
            "vehicle_type": fare["vehicle_type"],
            "display_name": DISPLAY_NAMES.get(fare["vehicle_type"], fare["vehicle_type"].capitalize()),
            "estimated_fare": round(price, 2),
            "min_fare": min_fare,
        })
    
    estimates.sort(key=lambda x: x["estimated_fare"])
    return {"estimates": estimates, "distance_km": round(data.distance_km, 2), "duration_min": data.duration_min}
