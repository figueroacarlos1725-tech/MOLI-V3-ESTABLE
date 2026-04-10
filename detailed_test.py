#!/usr/bin/env python3
"""
Test database connectivity and AI support
"""

import asyncio
import aiohttp
import json

BACKEND_URL = "https://taxify-clone.preview.emergentagent.com/api"
RIDER_EMAIL = "rider@test.com"
RIDER_PASSWORD = "test123456"

async def test_ai_support_detailed():
    """Test AI support with more detailed error handling"""
    print("🔍 Testing AI Support with error handling...")
    
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
        
        # Send AI support message and check response structure
        async with session.post(f"{BACKEND_URL}/support/chat?message=Test+message", 
                               headers=headers) as resp:
            print(f"📊 Response status: {resp.status}")
            print(f"📊 Response headers: {dict(resp.headers)}")
            
            if resp.status == 200:
                data = await resp.json()
                print(f"📝 Full response structure:")
                print(json.dumps(data, indent=2))
                
                session_id = data.get("session_id")
                response_obj = data.get("response")
                
                # Check if response is a string or object
                if isinstance(response_obj, dict):
                    print(f"📝 Response is an object: {response_obj}")
                    ai_message = response_obj.get("message", "")
                else:
                    print(f"📝 Response is a string: {response_obj}")
                    ai_message = response_obj
                
                print(f"📝 Session ID: {session_id}")
                print(f"📝 AI Message: {ai_message}")
                
                # Wait a bit for database operations
                await asyncio.sleep(2)
                
                # Check support history
                async with session.get(f"{BACKEND_URL}/support/history", 
                                      headers=headers) as resp:
                    if resp.status == 200:
                        history_data = await resp.json()
                        print(f"📋 History response:")
                        print(json.dumps(history_data, indent=2))
                    else:
                        text = await resp.text()
                        print(f"❌ Failed to get history: {resp.status} - {text}")
                
                return session_id
            else:
                text = await resp.text()
                print(f"❌ AI support failed: {resp.status} - {text}")
                return None

async def main():
    await test_ai_support_detailed()

if __name__ == "__main__":
    asyncio.run(main())