#!/usr/bin/env python3
"""
Backend API Testing for Molí Taxi App - Cancellation & Wallet System
Tests the new cancellation/wallet endpoints (simplified version)
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

class TestResults:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.errors = []
    
    def success(self, test_name):
        print(f"✅ {test_name}")
        self.passed += 1
    
    def fail(self, test_name, error):
        print(f"❌ {test_name}: {error}")
        self.failed += 1
        self.errors.append(f"{test_name}: {error}")
    
    def summary(self):
        total = self.passed + self.failed
        print(f"\n📊 Test Results: {self.passed}/{total} passed")
        if self.errors:
            print("\n🔍 Failures:")
            for error in self.errors:
                print(f"  - {error}")

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

async def test_cancellation_config(results):
    """Test GET /api/cancellation/config"""
    try:
        # Test with rider auth
        rider_token = await login_user(RIDER_CREDS)
        response = await make_request("GET", "/cancellation/config", rider_token)
        
        if response.status_code == 200:
            data = response.json()
            required_fields = ["cancel_free_minutes", "rider_cancel_penalty", "driver_cancel_penalty", 
                             "driver_max_negative_balance", "driver_block_after_cancels", "driver_block_hours"]
            
            missing_fields = [field for field in required_fields if field not in data]
            if missing_fields:
                results.fail("GET /api/cancellation/config", f"Missing fields: {missing_fields}")
            else:
                results.success("GET /api/cancellation/config - Returns all required fields")
                print(f"   Config: {data}")
        else:
            results.fail("GET /api/cancellation/config", f"HTTP {response.status_code}: {response.text}")
    except Exception as e:
        results.fail("GET /api/cancellation/config", str(e))

async def test_wallet_status(results):
    """Test GET /api/wallet/status for both rider and driver"""
    try:
        # Test rider wallet status
        rider_token = await login_user(RIDER_CREDS)
        response = await make_request("GET", "/wallet/status", rider_token)
        
        if response.status_code == 200:
            data = response.json()
            rider_fields = ["balance", "pending_penalties", "total_pending", "max_pending_penalties", "cancel_penalty"]
            missing_fields = [field for field in rider_fields if field not in data]
            if missing_fields:
                results.fail("GET /api/wallet/status (Rider)", f"Missing fields: {missing_fields}")
            else:
                results.success("GET /api/wallet/status (Rider) - Returns all required fields")
                print(f"   Rider wallet: balance={data['balance']}, pending_penalties={len(data['pending_penalties'])}")
        else:
            results.fail("GET /api/wallet/status (Rider)", f"HTTP {response.status_code}: {response.text}")
        
        # Test driver wallet status
        driver_token = await login_user(DRIVER_CREDS)
        response = await make_request("GET", "/wallet/status", driver_token)
        
        if response.status_code == 200:
            data = response.json()
            driver_fields = ["balance", "driver_block", "cancel_count_30d", "max_cancels_before_block", 
                           "max_negative_balance", "cancel_penalty"]
            missing_fields = [field for field in driver_fields if field not in data]
            if missing_fields:
                results.fail("GET /api/wallet/status (Driver)", f"Missing fields: {missing_fields}")
            else:
                results.success("GET /api/wallet/status (Driver) - Returns all required fields")
                print(f"   Driver wallet: balance={data['balance']}, cancel_count_30d={data['cancel_count_30d']}")
        else:
            results.fail("GET /api/wallet/status (Driver)", f"HTTP {response.status_code}: {response.text}")
            
    except Exception as e:
        results.fail("GET /api/wallet/status", str(e))

async def test_driver_block_status(results):
    """Test GET /api/driver/block-status"""
    try:
        # Test with driver auth
        driver_token = await login_user(DRIVER_CREDS)
        response = await make_request("GET", "/driver/block-status", driver_token)
        
        if response.status_code == 200:
            data = response.json()
            if "is_blocked" not in data:
                results.fail("GET /api/driver/block-status", "Missing 'is_blocked' field")
            else:
                results.success("GET /api/driver/block-status - Returns block status")
                print(f"   Driver blocked: {data['is_blocked']}")
        else:
            results.fail("GET /api/driver/block-status", f"HTTP {response.status_code}: {response.text}")
        
        # Test with non-driver (should fail)
        rider_token = await login_user(RIDER_CREDS)
        response = await make_request("GET", "/driver/block-status", rider_token)
        
        if response.status_code == 403:
            results.success("GET /api/driver/block-status - Correctly rejects non-drivers")
        else:
            results.fail("GET /api/driver/block-status", f"Should reject non-drivers, got {response.status_code}")
            
    except Exception as e:
        results.fail("GET /api/driver/block-status", str(e))

async def test_cancellation_history(results):
    """Test GET /api/cancellation/history"""
    try:
        # Test with rider auth
        rider_token = await login_user(RIDER_CREDS)
        response = await make_request("GET", "/cancellation/history", rider_token)
        
        if response.status_code == 200:
            data = response.json()
            if "records" not in data:
                results.fail("GET /api/cancellation/history", "Missing 'records' field")
            else:
                results.success("GET /api/cancellation/history - Returns records array")
                print(f"   Cancellation records: {len(data['records'])} found")
        else:
            results.fail("GET /api/cancellation/history", f"HTTP {response.status_code}: {response.text}")
            
    except Exception as e:
        results.fail("GET /api/cancellation/history", str(e))

async def test_admin_settings(results):
    """Test GET /api/admin/settings includes cancellation fields"""
    try:
        admin_token = await login_user(ADMIN_CREDS)
        response = await make_request("GET", "/admin/settings", admin_token)
        
        if response.status_code == 200:
            data = response.json()
            cancellation_fields = ["cancel_free_minutes", "rider_cancel_penalty", "driver_cancel_penalty"]
            missing_fields = [field for field in cancellation_fields if field not in data]
            if missing_fields:
                results.fail("GET /api/admin/settings", f"Missing cancellation fields: {missing_fields}")
            else:
                results.success("GET /api/admin/settings - Includes cancellation configuration")
                print(f"   Settings: cancel_free_minutes={data.get('cancel_free_minutes')}, rider_penalty={data.get('rider_cancel_penalty')}")
        else:
            results.fail("GET /api/admin/settings", f"HTTP {response.status_code}: {response.text}")
            
    except Exception as e:
        results.fail("GET /api/admin/settings", str(e))

async def test_admin_settings_update(results):
    """Test PUT /api/admin/settings with cancellation fields"""
    try:
        admin_token = await login_user(ADMIN_CREDS)
        
        # Update cancellation settings
        update_data = {
            "cancel_free_minutes": 2,
            "rider_cancel_penalty": 600
        }
        
        response = await make_request("PUT", "/admin/settings", admin_token, json_data=update_data)
        
        if response.status_code == 200:
            # Verify the update worked
            get_response = await make_request("GET", "/admin/settings", admin_token)
            if get_response.status_code == 200:
                data = get_response.json()
                if data.get("cancel_free_minutes") == 2 and data.get("rider_cancel_penalty") == 600:
                    results.success("PUT /api/admin/settings - Successfully updates cancellation settings")
                    print(f"   Updated: cancel_free_minutes={data.get('cancel_free_minutes')}, rider_penalty={data.get('rider_cancel_penalty')}")
                else:
                    results.fail("PUT /api/admin/settings", "Settings not properly updated")
            else:
                results.fail("PUT /api/admin/settings", "Could not verify update")
        else:
            results.fail("PUT /api/admin/settings", f"HTTP {response.status_code}: {response.text}")
            
    except Exception as e:
        results.fail("PUT /api/admin/settings", str(e))

async def run_all_tests():
    """Run all cancellation/wallet system tests"""
    print("🚀 Testing Molí Taxi App - NEW Cancellation & Wallet System Endpoints")
    print("=" * 70)
    
    results = TestResults()
    
    # Test individual endpoints
    await test_cancellation_config(results)
    await test_wallet_status(results)
    await test_driver_block_status(results)
    await test_cancellation_history(results)
    await test_admin_settings(results)
    await test_admin_settings_update(results)
    
    print("=" * 70)
    results.summary()
    
    if results.failed == 0:
        print("\n🎉 ALL NEW CANCELLATION/WALLET ENDPOINTS ARE WORKING CORRECTLY!")
    else:
        print(f"\n⚠️  {results.failed} endpoint(s) have issues that need attention.")
    
    return results.failed == 0

if __name__ == "__main__":
    success = asyncio.run(run_all_tests())
    exit(0 if success else 1)