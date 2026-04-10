#!/usr/bin/env python3
"""
Test ride chat specifically
"""

import asyncio
import aiohttp
import json

BACKEND_URL = "https://taxify-clone.preview.emergentagent.com/api"
RIDER_EMAIL = "rider@test.com"
RIDER_PASSWORD = "test123456"

async def test_ride_chat_simple():
    """Test ride chat with an existing ride"""
    print("🔍 Testing Ride Chat...")
    
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
        
        # Get active ride
        async with session.get(f"{BACKEND_URL}/rides/active", headers=headers) as resp:
            if resp.status == 200:
                data = await resp.json()
                ride = data.get("ride")
                if ride:
                    ride_id = ride.get("ride_id")
                    print(f"✅ Found active ride: {ride_id}")
                    
                    # Try to send a message
                    async with session.post(f"{BACKEND_URL}/chat/send?ride_id={ride_id}&message=Test+message", 
                                           headers=headers) as resp:
                        print(f"📊 Chat send response status: {resp.status}")
                        if resp.status == 200:
                            data = await resp.json()
                            print(f"📝 Chat send response: {json.dumps(data, indent=2)}")
                        else:
                            text = await resp.text()
                            print(f"❌ Chat send failed: {resp.status} - {text}")
                else:
                    print("❌ No active ride found")
            else:
                text = await resp.text()
                print(f"❌ Failed to get active ride: {resp.status} - {text}")

async def main():
    await test_ride_chat_simple()

if __name__ == "__main__":
    asyncio.run(main())