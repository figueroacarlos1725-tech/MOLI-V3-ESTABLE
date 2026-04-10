#!/usr/bin/env python3
"""
Simple test to check AI support and database issues
"""

import asyncio
import aiohttp
import json

BACKEND_URL = "https://taxify-clone.preview.emergentagent.com/api"
RIDER_EMAIL = "rider@test.com"
RIDER_PASSWORD = "test123456"

async def test_simple_ai_support():
    """Test AI support with detailed debugging"""
    print("🔍 Testing AI Support with detailed debugging...")
    
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
            user_id = data.get("user", {}).get("user_id")
            print(f"✅ Rider logged in successfully, user_id: {user_id}")
        
        headers = {"Authorization": f"Bearer {token}"}
        
        # Send AI support message
        async with session.post(f"{BACKEND_URL}/support/chat?message=Hola+necesito+ayuda", 
                               headers=headers) as resp:
            if resp.status == 200:
                data = await resp.json()
                session_id = data.get("session_id")
                print(f"✅ AI support message sent")
                print(f"📝 Full response: {json.dumps(data, indent=2)}")
                
                # Wait a moment for database write
                await asyncio.sleep(1)
                
                # Check support history with session_id
                async with session.get(f"{BACKEND_URL}/support/history?session_id={session_id}", 
                                      headers=headers) as resp:
                    if resp.status == 200:
                        history_data = await resp.json()
                        print(f"📋 History with session_id: {json.dumps(history_data, indent=2)}")
                    else:
                        text = await resp.text()
                        print(f"❌ Failed to get history with session_id: {resp.status} - {text}")
                
                # Check support history without session_id
                async with session.get(f"{BACKEND_URL}/support/history", 
                                      headers=headers) as resp:
                    if resp.status == 200:
                        history_data = await resp.json()
                        print(f"📋 History without session_id: {json.dumps(history_data, indent=2)}")
                    else:
                        text = await resp.text()
                        print(f"❌ Failed to get history without session_id: {resp.status} - {text}")
                
                return session_id
            else:
                text = await resp.text()
                print(f"❌ AI support failed: {resp.status} - {text}")
                return None

async def test_driver_availability():
    """Test driver availability with query parameters"""
    print("\n🔍 Testing Driver Availability...")
    
    timeout = aiohttp.ClientTimeout(total=30)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        # Login driver
        async with session.post(f"{BACKEND_URL}/auth/login", json={
            "email": "driver@test.com",
            "password": "test123456"
        }) as resp:
            if resp.status != 200:
                print(f"❌ Driver login failed: {resp.status}")
                return
            
            data = await resp.json()
            token = data.get("access_token")
            print(f"✅ Driver logged in successfully")
        
        headers = {"Authorization": f"Bearer {token}"}
        
        # Try with query parameters
        async with session.put(f"{BACKEND_URL}/drivers/availability?is_online=true&latitude=-34.6037&longitude=-58.3816", 
                              headers=headers) as resp:
            if resp.status == 200:
                data = await resp.json()
                print(f"✅ Driver availability set successfully: {data}")
            else:
                text = await resp.text()
                print(f"❌ Failed to set driver availability: {resp.status} - {text}")

async def main():
    session_id = await test_simple_ai_support()
    await test_driver_availability()
    
    if session_id:
        print(f"\n🔍 Testing dispatcher with session_id: {session_id}")
        
        timeout = aiohttp.ClientTimeout(total=30)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            # Login admin
            async with session.post(f"{BACKEND_URL}/auth/login", json={
                "email": "admin@test.com",
                "password": "admin123456"
            }) as resp:
                if resp.status != 200:
                    print(f"❌ Admin login failed: {resp.status}")
                    return
                
                data = await resp.json()
                token = data.get("access_token")
                print(f"✅ Admin logged in successfully")
            
            headers = {"Authorization": f"Bearer {token}"}
            
            # Try dispatcher intervene
            async with session.post(f"{BACKEND_URL}/dispatcher/intervene/{session_id}", 
                                   headers=headers) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    print(f"✅ Dispatcher intervene successful: {data}")
                else:
                    text = await resp.text()
                    print(f"❌ Dispatcher intervene failed: {resp.status} - {text}")

if __name__ == "__main__":
    asyncio.run(main())