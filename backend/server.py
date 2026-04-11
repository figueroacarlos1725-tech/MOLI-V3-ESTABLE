"""
Moli - Complete Backend API
Taxi booking system with rider, driver, and admin functionality.
Modular architecture: routes are in /routes/, shared code in separate modules.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

# Import shared modules (ensures they initialize)
from database import db

# Import route modules
from routes.auth import router as auth_router
from routes.drivers import router as drivers_router
from routes.vehicles import router as vehicles_router
from routes.rides import router as rides_router
from routes.chat import router as chat_router
from routes.support import router as support_router
from routes.wallet import router as wallet_router
from routes.admin import router as admin_router
from routes.places import router as places_router
from routes.push import router as push_router
from routes.misc import router as misc_router

app = FastAPI(title="Moli API", version="2.0.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include all routers
app.include_router(auth_router)
app.include_router(drivers_router)
app.include_router(vehicles_router)
app.include_router(rides_router)
app.include_router(chat_router)
app.include_router(support_router)
app.include_router(wallet_router)
app.include_router(admin_router)
app.include_router(places_router)
app.include_router(push_router)
app.include_router(misc_router)


# ======================= STARTUP =======================
@app.on_event("startup")
async def startup_db():
    """Initialize database indexes"""
    try:
        await db.users.create_index("user_id", unique=True)
        await db.users.create_index("email", unique=True)
        await db.drivers.create_index("driver_id", unique=True)
        await db.vehicles.create_index("vehicle_id", unique=True)
        await db.rides.create_index("ride_id", unique=True)
        await db.ride_requests.create_index("request_id", unique=True)
        print("Database indexes created")
    except Exception as e:
        print(f"Index creation note: {e}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
