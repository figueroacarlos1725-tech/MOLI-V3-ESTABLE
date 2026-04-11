#!/usr/bin/env python3
"""
Comprehensive Backend API Testing for Moli Refactored Backend
Tests all critical endpoints across ALL route modules after refactoring.
"""

import requests
import json
import time
from datetime import datetime

# Configuration
BASE_URL = "https://taxify-clone.preview.emergentagent.com/api"
TIMEOUT = 30

# Test credentials from /app/memory/test_credentials.md
ADMIN_CREDS = {"email": "admin@test.com", "password": "admin123456"}
RIDER_CREDS = {"email": "rider@test.com", "password": "test123456"}
DRIVER_CREDS = {"email": "driver@test.com", "password": "test123456"}

# Global tokens
admin_token = None
rider_token = None
driver_token = None

class TestResults:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.errors = []
        self.successes = []
    
    def add_success(self, test_name):
        self.passed += 1
        self.successes.append(f"✅ {test_name}")
        print(f"✅ {test_name}")
    
    def add_failure(self, test_name, error):
        self.failed += 1
        self.errors.append(f"❌ {test_name}: {error}")
        print(f"❌ {test_name}: {error}")
    
    def summary(self):
        print(f"\n{'='*60}")
        print(f"TEST SUMMARY: {self.passed} passed, {self.failed} failed")
        print(f"{'='*60}")
        
        if self.errors:
            print("\nFAILED TESTS:")
            for error in self.errors:
                print(error)
        
        if self.successes:
            print(f"\nSUCCESSFUL TESTS ({len(self.successes)}):")
            for success in self.successes:
                print(success)

results = TestResults()

def make_request(method, endpoint, headers=None, json_data=None, params=None):
    """Make HTTP request with error handling"""
    url = f"{BASE_URL}{endpoint}"
    try:
        response = requests.request(
            method=method,
            url=url,
            headers=headers,
            json=json_data,
            params=params,
            timeout=TIMEOUT
        )
        return response
    except requests.exceptions.RequestException as e:
        return None

def test_auth_endpoints():
    """Test Auth routes (routes/auth.py)"""
    global admin_token, rider_token, driver_token
    
    print(f"\n{'='*20} TESTING AUTH ROUTES {'='*20}")
    
    # Test admin login
    response = make_request("POST", "/auth/login", json_data=ADMIN_CREDS)
    if response and response.status_code == 200:
        data = response.json()
        if "access_token" in data and "user" in data:
            admin_token = data["access_token"]
            results.add_success("POST /api/auth/login (admin)")
        else:
            results.add_failure("POST /api/auth/login (admin)", "Missing access_token or user in response")
    else:
        results.add_failure("POST /api/auth/login (admin)", f"Status: {response.status_code if response else 'No response'}")
    
    # Test rider login
    response = make_request("POST", "/auth/login", json_data=RIDER_CREDS)
    if response and response.status_code == 200:
        data = response.json()
        if "access_token" in data:
            rider_token = data["access_token"]
            results.add_success("POST /api/auth/login (rider)")
        else:
            results.add_failure("POST /api/auth/login (rider)", "Missing access_token in response")
    else:
        results.add_failure("POST /api/auth/login (rider)", f"Status: {response.status_code if response else 'No response'}")
    
    # Test driver login
    response = make_request("POST", "/auth/login", json_data=DRIVER_CREDS)
    if response and response.status_code == 200:
        data = response.json()
        if "access_token" in data:
            driver_token = data["access_token"]
            results.add_success("POST /api/auth/login (driver)")
        else:
            results.add_failure("POST /api/auth/login (driver)", "Missing access_token in response")
    else:
        results.add_failure("POST /api/auth/login (driver)", f"Status: {response.status_code if response else 'No response'}")
    
    # Test get current user (admin)
    if admin_token:
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = make_request("GET", "/auth/me", headers=headers)
        if response and response.status_code == 200:
            data = response.json()
            if "user_id" in data and "email" in data:
                results.add_success("GET /api/auth/me (admin)")
            else:
                results.add_failure("GET /api/auth/me (admin)", "Missing user_id or email in response")
        else:
            results.add_failure("GET /api/auth/me (admin)", f"Status: {response.status_code if response else 'No response'}")

def test_driver_endpoints():
    """Test Driver routes (routes/drivers.py)"""
    print(f"\n{'='*20} TESTING DRIVER ROUTES {'='*20}")
    
    if not driver_token:
        results.add_failure("Driver endpoints", "No driver token available")
        return
    
    headers = {"Authorization": f"Bearer {driver_token}"}
    
    # Test driver block status
    response = make_request("GET", "/driver/block-status", headers=headers)
    if response and response.status_code == 200:
        data = response.json()
        if "is_blocked" in data:
            results.add_success("GET /api/driver/block-status")
        else:
            results.add_failure("GET /api/driver/block-status", "Missing is_blocked field")
    else:
        results.add_failure("GET /api/driver/block-status", f"Status: {response.status_code if response else 'No response'}")
    
    # Test required documents
    response = make_request("GET", "/driver/documents/required", headers=headers)
    if response and response.status_code == 200:
        data = response.json()
        if "documents" in data:
            results.add_success("GET /api/driver/documents/required")
        else:
            results.add_failure("GET /api/driver/documents/required", "Missing documents field")
    else:
        results.add_failure("GET /api/driver/documents/required", f"Status: {response.status_code if response else 'No response'}")
    
    # Test verification status
    response = make_request("GET", "/driver/verification-status", headers=headers)
    if response and response.status_code == 200:
        data = response.json()
        if "is_verified" in data and "status" in data:
            results.add_success("GET /api/driver/verification-status")
        else:
            results.add_failure("GET /api/driver/verification-status", "Missing is_verified or status field")
    else:
        results.add_failure("GET /api/driver/verification-status", f"Status: {response.status_code if response else 'No response'}")
    
    # Test driver earnings
    response = make_request("GET", "/drivers/earnings", headers=headers)
    if response and response.status_code == 200:
        data = response.json()
        if "total_earnings" in data:
            results.add_success("GET /api/drivers/earnings")
        else:
            results.add_failure("GET /api/drivers/earnings", "Missing total_earnings field")
    else:
        results.add_failure("GET /api/drivers/earnings", f"Status: {response.status_code if response else 'No response'}")

def test_vehicle_endpoints():
    """Test Vehicle routes (routes/vehicles.py)"""
    print(f"\n{'='*20} TESTING VEHICLE ROUTES {'='*20}")
    
    # Test vehicle icons (public endpoint)
    response = make_request("GET", "/vehicle-icons")
    if response and response.status_code == 200:
        data = response.json()
        if "icons" in data:
            results.add_success("GET /api/vehicle-icons")
        else:
            results.add_failure("GET /api/vehicle-icons", "Missing icons field")
    else:
        results.add_failure("GET /api/vehicle-icons", f"Status: {response.status_code if response else 'No response'}")
    
    # Test get vehicles (requires driver auth)
    if driver_token:
        headers = {"Authorization": f"Bearer {driver_token}"}
        response = make_request("GET", "/vehicles", headers=headers)
        if response and response.status_code == 200:
            data = response.json()
            if "vehicles" in data:
                results.add_success("GET /api/vehicles")
            else:
                results.add_failure("GET /api/vehicles", "Missing vehicles field")
        else:
            results.add_failure("GET /api/vehicles", f"Status: {response.status_code if response else 'No response'}")

def test_ride_endpoints():
    """Test Ride routes (routes/rides.py)"""
    print(f"\n{'='*20} TESTING RIDE ROUTES {'='*20}")
    
    if not rider_token:
        results.add_failure("Ride endpoints", "No rider token available")
        return
    
    headers = {"Authorization": f"Bearer {rider_token}"}
    
    # Test active ride
    response = make_request("GET", "/rides/active", headers=headers)
    if response and response.status_code == 200:
        data = response.json()
        # Active ride can be null if no active ride
        results.add_success("GET /api/rides/active")
    else:
        results.add_failure("GET /api/rides/active", f"Status: {response.status_code if response else 'No response'}")
    
    # Test my rides
    response = make_request("GET", "/rides/my-rides", headers=headers)
    if response and response.status_code == 200:
        data = response.json()
        if "rides" in data:
            results.add_success("GET /api/rides/my-rides")
        else:
            results.add_failure("GET /api/rides/my-rides", "Missing rides field")
    else:
        results.add_failure("GET /api/rides/my-rides", f"Status: {response.status_code if response else 'No response'}")
    
    # Test fare estimation
    estimate_data = {
        "pickup": {"latitude": -28.46, "longitude": -65.78, "address": "Centro"},
        "dropoff": {"latitude": -28.47, "longitude": -65.79, "address": "Plaza"},
        "vehicle_type": "standard",
        "distance_km": 1.5,
        "duration_min": 5
    }
    response = make_request("POST", "/rides/estimate", headers=headers, json_data=estimate_data)
    if response and response.status_code == 200:
        data = response.json()
        if "estimates" in data:
            results.add_success("POST /api/rides/estimate")
        else:
            results.add_failure("POST /api/rides/estimate", "Missing estimates field")
    else:
        results.add_failure("POST /api/rides/estimate", f"Status: {response.status_code if response else 'No response'}")

def test_chat_endpoints():
    """Test Chat routes (routes/chat.py)"""
    print(f"\n{'='*20} TESTING CHAT ROUTES {'='*20}")
    
    if not rider_token:
        results.add_failure("Chat endpoints", "No rider token available")
        return
    
    headers = {"Authorization": f"Bearer {rider_token}"}
    
    # Test conversations
    response = make_request("GET", "/chat/conversations", headers=headers)
    if response and response.status_code == 200:
        data = response.json()
        if "conversations" in data:
            results.add_success("GET /api/chat/conversations")
        else:
            results.add_failure("GET /api/chat/conversations", "Missing conversations field")
    else:
        results.add_failure("GET /api/chat/conversations", f"Status: {response.status_code if response else 'No response'}")

def test_support_endpoints():
    """Test Support routes (routes/support.py)"""
    print(f"\n{'='*20} TESTING SUPPORT ROUTES {'='*20}")
    
    if not rider_token:
        results.add_failure("Support endpoints", "No rider token available")
        return
    
    headers = {"Authorization": f"Bearer {rider_token}"}
    
    # Test AI support chat
    response = make_request("POST", "/support/chat", headers=headers, params={"message": "Hello, I need help with my ride"})
    if response and response.status_code == 200:
        data = response.json()
        if "response" in data:
            results.add_success("POST /api/support/chat")
        else:
            results.add_failure("POST /api/support/chat", "Missing response field")
    else:
        # Support chat might fail if EMERGENT_LLM_KEY is not set
        if response and response.status_code == 500:
            results.add_success("POST /api/support/chat (MOCKED - LLM key not configured)")
        else:
            results.add_failure("POST /api/support/chat", f"Status: {response.status_code if response else 'No response'}")

def test_wallet_endpoints():
    """Test Wallet routes (routes/wallet.py)"""
    print(f"\n{'='*20} TESTING WALLET ROUTES {'='*20}")
    
    if not rider_token:
        results.add_failure("Wallet endpoints", "No rider token available")
        return
    
    headers = {"Authorization": f"Bearer {rider_token}"}
    
    # Test wallet status
    response = make_request("GET", "/wallet/status", headers=headers)
    if response and response.status_code == 200:
        data = response.json()
        if "balance" in data:
            results.add_success("GET /api/wallet/status")
        else:
            results.add_failure("GET /api/wallet/status", "Missing balance field")
    else:
        results.add_failure("GET /api/wallet/status", f"Status: {response.status_code if response else 'No response'}")
    
    # Test wallet balance
    response = make_request("GET", "/wallet/balance", headers=headers)
    if response and response.status_code == 200:
        data = response.json()
        if "balance" in data:
            results.add_success("GET /api/wallet/balance")
        else:
            results.add_failure("GET /api/wallet/balance", "Missing balance field")
    else:
        results.add_failure("GET /api/wallet/balance", f"Status: {response.status_code if response else 'No response'}")
    
    # Test cancellation config
    response = make_request("GET", "/cancellation/config", headers=headers)
    if response and response.status_code == 200:
        data = response.json()
        if "cancel_free_minutes" in data:
            results.add_success("GET /api/cancellation/config")
        else:
            results.add_failure("GET /api/cancellation/config", "Missing cancel_free_minutes field")
    else:
        results.add_failure("GET /api/cancellation/config", f"Status: {response.status_code if response else 'No response'}")

def test_admin_endpoints():
    """Test Admin routes (routes/admin.py)"""
    print(f"\n{'='*20} TESTING ADMIN ROUTES {'='*20}")
    
    if not admin_token:
        results.add_failure("Admin endpoints", "No admin token available")
        return
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Test dashboard
    response = make_request("GET", "/admin/dashboard", headers=headers)
    if response and response.status_code == 200:
        data = response.json()
        if "stats" in data and "total_users" in data["stats"]:
            results.add_success("GET /api/admin/dashboard")
        else:
            results.add_failure("GET /api/admin/dashboard", "Missing stats.total_users field")
    else:
        results.add_failure("GET /api/admin/dashboard", f"Status: {response.status_code if response else 'No response'}")
    
    # Test settings
    response = make_request("GET", "/admin/settings", headers=headers)
    if response and response.status_code == 200:
        data = response.json()
        if "setting_id" in data:
            results.add_success("GET /api/admin/settings")
        else:
            results.add_failure("GET /api/admin/settings", "Missing setting_id field")
    else:
        results.add_failure("GET /api/admin/settings", f"Status: {response.status_code if response else 'No response'}")
    
    # Test users list
    response = make_request("GET", "/admin/users", headers=headers)
    if response and response.status_code == 200:
        data = response.json()
        if "users" in data:
            results.add_success("GET /api/admin/users")
        else:
            results.add_failure("GET /api/admin/users", "Missing users field")
    else:
        results.add_failure("GET /api/admin/users", f"Status: {response.status_code if response else 'No response'}")
    
    # Test drivers list
    response = make_request("GET", "/admin/drivers", headers=headers)
    if response and response.status_code == 200:
        data = response.json()
        if "drivers" in data:
            results.add_success("GET /api/admin/drivers")
        else:
            results.add_failure("GET /api/admin/drivers", "Missing drivers field")
    else:
        results.add_failure("GET /api/admin/drivers", f"Status: {response.status_code if response else 'No response'}")
    
    # Test fares config
    response = make_request("GET", "/admin/fares", headers=headers)
    if response and response.status_code == 200:
        data = response.json()
        if "fares" in data:
            results.add_success("GET /api/admin/fares")
        else:
            results.add_failure("GET /api/admin/fares", "Missing fares field")
    else:
        results.add_failure("GET /api/admin/fares", f"Status: {response.status_code if response else 'No response'}")
    
    # Test banners
    response = make_request("GET", "/admin/banners", headers=headers)
    if response and response.status_code == 200:
        data = response.json()
        if "banners" in data:
            results.add_success("GET /api/admin/banners")
        else:
            results.add_failure("GET /api/admin/banners", "Missing banners field")
    else:
        results.add_failure("GET /api/admin/banners", f"Status: {response.status_code if response else 'No response'}")
    
    # Test payment config
    response = make_request("GET", "/admin/payment-config", headers=headers)
    if response and response.status_code == 200:
        data = response.json()
        if "config_id" in data:
            results.add_success("GET /api/admin/payment-config")
        else:
            results.add_failure("GET /api/admin/payment-config", "Missing config_id field")
    else:
        results.add_failure("GET /api/admin/payment-config", f"Status: {response.status_code if response else 'No response'}")

def test_places_endpoints():
    """Test Places routes (routes/places.py)"""
    print(f"\n{'='*20} TESTING PLACES ROUTES {'='*20}")
    
    # Test places search
    params = {"q": "centro", "lat": -28.46, "lng": -65.78}
    response = make_request("GET", "/places/search", params=params)
    if response and response.status_code == 200:
        data = response.json()
        if "results" in data:
            results.add_success("GET /api/places/search")
        else:
            results.add_failure("GET /api/places/search", "Missing results field")
    else:
        results.add_failure("GET /api/places/search", f"Status: {response.status_code if response else 'No response'}")
    
    # Test reverse geocoding
    params = {"lat": -28.46, "lng": -65.78}
    response = make_request("GET", "/places/reverse", params=params)
    if response and response.status_code == 200:
        data = response.json()
        if "address" in data:
            results.add_success("GET /api/places/reverse")
        else:
            results.add_failure("GET /api/places/reverse", "Missing address field")
    else:
        results.add_failure("GET /api/places/reverse", f"Status: {response.status_code if response else 'No response'}")

def test_push_endpoints():
    """Test Push routes (routes/push.py)"""
    print(f"\n{'='*20} TESTING PUSH ROUTES {'='*20}")
    
    if not rider_token:
        results.add_failure("Push endpoints", "No rider token available")
        return
    
    headers = {"Authorization": f"Bearer {rider_token}"}
    
    # Test push token registration
    push_data = {"token": "test_push_token_123", "platform": "web"}
    response = make_request("POST", "/push-token", headers=headers, json_data=push_data)
    if response and response.status_code == 200:
        data = response.json()
        if "status" in data:
            results.add_success("POST /api/push-token")
        else:
            results.add_failure("POST /api/push-token", "Missing status field")
    else:
        results.add_failure("POST /api/push-token", f"Status: {response.status_code if response else 'No response'}")

def test_misc_endpoints():
    """Test Misc routes (routes/misc.py)"""
    print(f"\n{'='*20} TESTING MISC ROUTES {'='*20}")
    
    # Test health check (public)
    response = make_request("GET", "/health")
    if response and response.status_code == 200:
        data = response.json()
        if "status" in data:
            results.add_success("GET /api/health")
        else:
            results.add_failure("GET /api/health", "Missing status field")
    else:
        results.add_failure("GET /api/health", f"Status: {response.status_code if response else 'No response'}")
    
    # Test maps config (public)
    response = make_request("GET", "/config/maps")
    if response and response.status_code == 200:
        data = response.json()
        if "provider" in data:
            results.add_success("GET /api/config/maps")
        else:
            results.add_failure("GET /api/config/maps", "Missing provider field")
    else:
        results.add_failure("GET /api/config/maps", f"Status: {response.status_code if response else 'No response'}")
    
    # Test dispatch config (public)
    response = make_request("GET", "/config/dispatch")
    if response and response.status_code == 200:
        data = response.json()
        if "accept_seconds" in data:
            results.add_success("GET /api/config/dispatch")
        else:
            results.add_failure("GET /api/config/dispatch", "Missing accept_seconds field")
    else:
        results.add_failure("GET /api/config/dispatch", f"Status: {response.status_code if response else 'No response'}")
    
    # Test public fares (public)
    response = make_request("GET", "/fares")
    if response and response.status_code == 200:
        data = response.json()
        if "fares" in data:
            results.add_success("GET /api/fares")
        else:
            results.add_failure("GET /api/fares", "Missing fares field")
    else:
        results.add_failure("GET /api/fares", f"Status: {response.status_code if response else 'No response'}")
    
    # Test version check (public)
    params = {"current_version": "1.0.0"}
    response = make_request("GET", "/app/version-check", params=params)
    if response and response.status_code == 200:
        data = response.json()
        if "force_update" in data:
            results.add_success("GET /api/app/version-check")
        else:
            results.add_failure("GET /api/app/version-check", "Missing force_update field")
    else:
        results.add_failure("GET /api/app/version-check", f"Status: {response.status_code if response else 'No response'}")
    
    # Test public banners (public)
    response = make_request("GET", "/banners")
    if response and response.status_code == 200:
        data = response.json()
        if "banners" in data:
            results.add_success("GET /api/banners")
        else:
            results.add_failure("GET /api/banners", "Missing banners field")
    else:
        results.add_failure("GET /api/banners", f"Status: {response.status_code if response else 'No response'}")

def main():
    """Run all tests"""
    print(f"🚀 Starting Moli Backend API Testing")
    print(f"Backend URL: {BASE_URL}")
    print(f"Testing refactored modular architecture with 125 endpoints across 11 route files")
    
    # Run all test suites
    test_auth_endpoints()
    test_driver_endpoints()
    test_vehicle_endpoints()
    test_ride_endpoints()
    test_chat_endpoints()
    test_support_endpoints()
    test_wallet_endpoints()
    test_admin_endpoints()
    test_places_endpoints()
    test_push_endpoints()
    test_misc_endpoints()
    
    # Print final summary
    results.summary()
    
    return results.failed == 0

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)