#!/usr/bin/env python3
"""
Debug test for Moli Taxi App - Chat and AI Support Features
"""

import asyncio
import aiohttp
import json

BACKEND_URL = "https://taxify-clone.preview.emergentagent.com/api"
DRIVER_EMAIL = "driver@test.com"
DRIVER_PASSWORD = "test123456"
RIDER_EMAIL = "rider@test.com"
RIDER_PASSWORD = "test123456"

async def debug_driver_setup():
    """Debug driver setup issues"""
    print("🔍 Debugging Driver Setup...")
    
    timeout = aiohttp.ClientTimeout(total=30)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        # Login driver
        async with session.post(f"{BACKEND_URL}/auth/login", json={
            "email": DRIVER_EMAIL,
            "password": DRIVER_PASSWORD
        }) as resp:
            if resp.status != 200:
                print(f"❌ Driver login failed: {resp.status}")
                return
            
            data = await resp.json()
            token = data.get("access_token")
            print(f"✅ Driver logged in successfully")
        
        headers = {"Authorization": f"Bearer {token}"}
        
        # Check if driver has vehicles
        async with session.get(f"{BACKEND_URL}/vehicles", headers=headers) as resp:
            if resp.status == 200:
                data = await resp.json()
                vehicles = data.get("vehicles", [])
                print(f"📋 Driver has {len(vehicles)} vehicles")
                
                if len(vehicles) == 0:
                    print("🚗 Registering vehicle for driver...")
                    vehicle_data = {
                        "make": "Toyota",
                        "model": "Corolla",
                        "year": 2020,
                        "color": "White",
                        "plate_number": "ABC123",
                        "vehicle_type": "economy",
                        "capacity": 4
                    }
                    
                    async with session.post(f"{BACKEND_URL}/vehicles", 
                                           json=vehicle_data, headers=headers) as resp:
                        if resp.status == 200:
                            print("✅ Vehicle registered successfully")
                        else:
                            text = await resp.text()
                            print(f"❌ Vehicle registration failed: {resp.status} - {text}")
            else:
                text = await resp.text()
                print(f"❌ Failed to get vehicles: {resp.status} - {text}")
        
        # Now try to set driver online
        async with session.put(f"{BACKEND_URL}/drivers/availability", 
                              json={"is_online": True, "latitude": -34.6037, "longitude": -58.3816},
                              headers=headers) as resp:
            if resp.status == 200:
                print("✅ Driver set online successfully")
            else:
                text = await resp.text()
                print(f"❌ Failed to set driver online: {resp.status} - {text}")

async def debug_ai_support():
    """Debug AI support issues"""
    print("\n🔍 Debugging AI Support...")
    
    timeout = aiohttp.ClientTimeout(total=30)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        # Login rider
        async with session.post(f"{BACKEND_URL}/auth/login", json={
            "email": RIDER_EMAIL,
            "password": RIDER_PASSWORD
        }) as resp:
            if resp.status != 200:
                print(f"❌ Rider login failed: {resp.status}")
                return
            
            data = await resp.json()
            token = data.get("access_token")
            print(f"✅ Rider logged in successfully")
        
        headers = {"Authorization": f"Bearer {token}"}
        
        # Send AI support message
        async with session.post(f"{BACKEND_URL}/support/chat?message=Hola+necesito+ayuda", 
                               headers=headers) as resp:
            if resp.status == 200:
                data = await resp.json()
                session_id = data.get("session_id")
                print(f"✅ AI support message sent, session_id: {session_id}")
                print(f"📝 Response: {data}")
                
                # Check support history immediately
                async with session.get(f"{BACKEND_URL}/support/history", 
                                      headers=headers) as resp:
                    if resp.status == 200:
                        history_data = await resp.json()
                        messages = history_data.get("messages", [])
                        sessions = history_data.get("sessions", [])
                        print(f"📋 History: {len(messages)} messages, {len(sessions)} sessions")
                        print(f"📝 Messages: {messages}")
                        print(f"📝 Sessions: {sessions}")
                    else:
                        text = await resp.text()
                        print(f"❌ Failed to get history: {resp.status} - {text}")
            else:
                text = await resp.text()
                print(f"❌ AI support failed: {resp.status} - {text}")

async def main():
    await debug_driver_setup()
    await debug_ai_support()

if __name__ == "__main__":
    asyncio.run(main())