#!/usr/bin/env python3
"""
Additional Backend Tests for Wallet and Cancellation System
Tests specific functionality that can be verified without active rides
"""

import asyncio
import httpx
import json
from datetime import datetime, timezone

# Backend URL from environment
BACKEND_URL = "https://taxify-clone.preview.emergentagent.com/api"

# Test credentials
ADMIN_CREDS = {"email": "admin@test.com", "password": "admin123456"}
RIDER_CREDS = {"email": "rider@test.com", "password": "test123456"}
DRIVER_CREDS = {"email": "driver@test.com", "password": "test123456"}

async def login_user(credentials):
    """Login and return auth token"""
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(f"{BACKEND_URL}/auth/login", json=credentials)
        if response.status_code == 200:
            data = response.json()
            return data["access_token"]
        else:
            raise Exception(f"Login failed: {response.status_code} - {response.text}")

async def make_request(method, endpoint, token=None, json_data=None, params=None):
    """Make authenticated API request"""
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    async with httpx.AsyncClient(timeout=30) as client:
        if method.upper() == "GET":
            response = await client.get(f"{BACKEND_URL}{endpoint}", headers=headers, params=params)
        elif method.upper() == "POST":
            response = await client.post(f"{BACKEND_URL}{endpoint}", headers=headers, json=json_data, params=params)
        elif method.upper() == "PUT":
            response = await client.put(f"{BACKEND_URL}{endpoint}", headers=headers, json=json_data, params=params)
        else:
            raise ValueError(f"Unsupported method: {method}")
        
        return response

async def test_all_endpoints():
    """Test all wallet and cancellation endpoints"""
    print("🧪 Testing All Wallet and Cancellation Endpoints")
    print("=" * 60)
    
    # Login all users
    admin_token = await login_user(ADMIN_CREDS)
    rider_token = await login_user(RIDER_CREDS)
    driver_token = await login_user(DRIVER_CREDS)
    
    print("✅ All users logged in successfully")
    
    # Test 1: Cancellation Config
    print("\n1. Testing GET /api/cancellation/config")
    response = await make_request("GET", "/cancellation/config", rider_token)
    if response.status_code == 200:
        data = response.json()
        print(f"   ✅ Status: {response.status_code}")
        print(f"   📋 Config: cancel_free_minutes={data.get('cancel_free_minutes')}, rider_penalty=${data.get('rider_cancel_penalty')}")
    else:
        print(f"   ❌ Status: {response.status_code}, Error: {response.text}")
    
    # Test 2: Wallet Status (Rider)
    print("\n2. Testing GET /api/wallet/status (Rider)")
    response = await make_request("GET", "/wallet/status", rider_token)
    if response.status_code == 200:
        data = response.json()
        print(f"   ✅ Status: {response.status_code}")
        print(f"   💰 Rider wallet: balance=${data.get('balance')}, pending_penalties={len(data.get('pending_penalties', []))}")
    else:
        print(f"   ❌ Status: {response.status_code}, Error: {response.text}")
    
    # Test 3: Wallet Status (Driver)
    print("\n3. Testing GET /api/wallet/status (Driver)")
    response = await make_request("GET", "/wallet/status", driver_token)
    if response.status_code == 200:
        data = response.json()
        print(f"   ✅ Status: {response.status_code}")
        print(f"   💰 Driver wallet: balance=${data.get('balance')}, cancel_count_30d={data.get('cancel_count_30d')}")
    else:
        print(f"   ❌ Status: {response.status_code}, Error: {response.text}")
    
    # Test 4: Driver Block Status
    print("\n4. Testing GET /api/driver/block-status")
    response = await make_request("GET", "/driver/block-status", driver_token)
    if response.status_code == 200:
        data = response.json()
        print(f"   ✅ Status: {response.status_code}")
        print(f"   🚫 Driver blocked: {data.get('is_blocked')}")
    else:
        print(f"   ❌ Status: {response.status_code}, Error: {response.text}")
    
    # Test 5: Cancellation History
    print("\n5. Testing GET /api/cancellation/history")
    response = await make_request("GET", "/cancellation/history", rider_token)
    if response.status_code == 200:
        data = response.json()
        print(f"   ✅ Status: {response.status_code}")
        print(f"   📜 Cancellation records: {len(data.get('records', []))}")
    else:
        print(f"   ❌ Status: {response.status_code}, Error: {response.text}")
    
    # Test 6: Wallet Transactions
    print("\n6. Testing GET /api/wallet/transactions")
    response = await make_request("GET", "/wallet/transactions", driver_token)
    if response.status_code == 200:
        data = response.json()
        transactions = data.get('transactions', [])
        print(f"   ✅ Status: {response.status_code}")
        print(f"   💳 Transactions: {len(transactions)}")
        if transactions:
            print(f"   📅 Latest transaction: {transactions[0].get('transaction_type')} - ${transactions[0].get('amount')}")
    else:
        print(f"   ❌ Status: {response.status_code}, Error: {response.text}")
    
    # Test 7: Admin Settings (GET)
    print("\n7. Testing GET /api/admin/settings")
    response = await make_request("GET", "/admin/settings", admin_token)
    if response.status_code == 200:
        data = response.json()
        print(f"   ✅ Status: {response.status_code}")
        print(f"   ⚙️  Settings: cancel_free_minutes={data.get('cancel_free_minutes')}, commission_rate={data.get('commission_rate')}")
    else:
        print(f"   ❌ Status: {response.status_code}, Error: {response.text}")
    
    # Test 8: Admin Settings (PUT)
    print("\n8. Testing PUT /api/admin/settings")
    test_settings = {"cancel_free_minutes": 2, "rider_cancel_penalty": 700}
    response = await make_request("PUT", "/admin/settings", admin_token, test_settings)
    if response.status_code == 200:
        print(f"   ✅ Status: {response.status_code}")
        # Verify the change
        verify_response = await make_request("GET", "/admin/settings", admin_token)
        if verify_response.status_code == 200:
            verify_data = verify_response.json()
            if verify_data.get('cancel_free_minutes') == 2 and verify_data.get('rider_cancel_penalty') == 700:
                print(f"   ✅ Settings updated successfully")
            else:
                print(f"   ❌ Settings not updated correctly")
        # Reset back
        reset_settings = {"cancel_free_minutes": 1, "rider_cancel_penalty": 600}
        await make_request("PUT", "/admin/settings", admin_token, reset_settings)
    else:
        print(f"   ❌ Status: {response.status_code}, Error: {response.text}")
    
    print("\n" + "=" * 60)
    print("🎯 All endpoint tests completed!")

if __name__ == "__main__":
    asyncio.run(test_all_endpoints())