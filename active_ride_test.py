#!/usr/bin/env python3
"""
Focused test for the Active Ride Endpoint Fix
Tests the specific scenarios mentioned in the review request
"""

import requests
import json
from datetime import datetime

# Base URL from frontend .env
BASE_URL = "https://taxify-clone.preview.emergentagent.com/api"

# Test credentials
RIDER_EMAIL = "rider@test.com"
RIDER_PASSWORD = "test123456"
DRIVER_EMAIL = "driver@test.com"
DRIVER_PASSWORD = "test123456"

class ActiveRideEndpointTester:
    def __init__(self):
        self.rider_token = None
        self.driver_token = None
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        })
        
    def log(self, message):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}")
        
    def login_rider(self):
        """Login as rider"""
        payload = {"email": RIDER_EMAIL, "password": RIDER_PASSWORD}
        response = self.session.post(f"{BASE_URL}/auth/login", json=payload)
        
        if response.status_code == 200:
            self.rider_token = response.json().get("access_token")
            return True
        return False
        
    def login_driver(self):
        """Login as driver"""
        payload = {"email": DRIVER_EMAIL, "password": DRIVER_PASSWORD}
        response = self.session.post(f"{BASE_URL}/auth/login", json=payload)
        
        if response.status_code == 200:
            self.driver_token = response.json().get("access_token")
            return True
        return False
        
    def test_active_ride_no_active_ride(self):
        """Test 1: GET /api/rides/active returns 200 with {"ride": null} when no active ride exists"""
        self.log("Testing active ride endpoint with no active ride...")
        
        if not self.rider_token:
            self.log("❌ No rider token")
            return False
            
        headers = {"Authorization": f"Bearer {self.rider_token}"}
        response = self.session.get(f"{BASE_URL}/rides/active", headers=headers)
        
        self.log(f"Response status: {response.status_code}")
        self.log(f"Response body: {response.text}")
        
        if response.status_code == 200:
            data = response.json()
            ride = data.get("ride")
            
            if ride is None:
                self.log("✅ PASS: Returns 200 with ride: null when no active ride")
                return True
            else:
                self.log(f"❌ FAIL: Expected ride: null, got ride: {ride}")
                return False
        else:
            self.log(f"❌ FAIL: Expected 200, got {response.status_code}")
            return False
            
    def test_active_ride_with_active_ride(self):
        """Test 2: After creating a ride, GET /api/rides/active returns the ride with all info"""
        self.log("Testing active ride endpoint with an active ride...")
        
        # First create a complete ride flow
        if not self.create_active_ride():
            self.log("❌ Failed to create active ride")
            return False
            
        # Now test the active ride endpoint
        headers = {"Authorization": f"Bearer {self.rider_token}"}
        response = self.session.get(f"{BASE_URL}/rides/active", headers=headers)
        
        self.log(f"Response status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            ride = data.get("ride")
            
            if ride:
                self.log("✅ PASS: Returns 200 with ride data when active ride exists")
                
                # Check for required fields
                driver_info = ride.get("driver_info")
                rider_info = ride.get("rider_info")
                vehicle_info = ride.get("vehicle_info")
                
                if driver_info and rider_info and vehicle_info:
                    self.log("✅ PASS: All required info present (driver_info, rider_info, vehicle_info)")
                    self.log(f"   Ride ID: {ride.get('ride_id')}")
                    self.log(f"   Status: {ride.get('status')}")
                    self.log(f"   Driver: {driver_info.get('name')}")
                    self.log(f"   Vehicle: {vehicle_info.get('make')} {vehicle_info.get('model')}")
                    return True
                else:
                    self.log(f"❌ FAIL: Missing required info - driver_info: {bool(driver_info)}, rider_info: {bool(rider_info)}, vehicle_info: {bool(vehicle_info)}")
                    return False
            else:
                self.log("❌ FAIL: Expected ride data, got ride: null")
                return False
        else:
            self.log(f"❌ FAIL: Expected 200, got {response.status_code}")
            return False
            
    def create_active_ride(self):
        """Helper: Create an active ride for testing"""
        self.log("Creating active ride for testing...")
        
        # Register vehicle
        headers = {"Authorization": f"Bearer {self.driver_token}"}
        vehicle_payload = {
            "make": "Honda", "model": "Civic", "year": 2021, "color": "Red",
            "plate_number": "XYZ789", "vehicle_type": "economy", "capacity": 4
        }
        self.session.post(f"{BASE_URL}/vehicles", json=vehicle_payload, headers=headers)
        
        # Set driver online
        params = {"is_online": True, "latitude": 40.7128, "longitude": -74.0060}
        self.session.put(f"{BASE_URL}/drivers/availability", params=params, headers=headers)
        
        # Create ride request
        headers = {"Authorization": f"Bearer {self.rider_token}"}
        request_payload = {
            "pickup_location": {"latitude": 40.7128, "longitude": -74.0060, "address": "NYC"},
            "dropoff_location": {"latitude": 40.7589, "longitude": -73.9851, "address": "Times Square"},
            "ride_type": "standard", "vehicle_type": "economy", "payment_method": "cash"
        }
        response = self.session.post(f"{BASE_URL}/rides/request", json=request_payload, headers=headers)
        
        if response.status_code != 200:
            return False
            
        request_id = response.json().get("request_id")
        
        # Submit bid
        headers = {"Authorization": f"Bearer {self.driver_token}"}
        bid_payload = {"request_id": request_id, "fare_amount": 12.00, "estimated_arrival": 5}
        response = self.session.post(f"{BASE_URL}/rides/bid", json=bid_payload, headers=headers)
        
        if response.status_code != 200:
            return False
            
        bid_id = response.json().get("bid_id")
        
        # Accept bid
        headers = {"Authorization": f"Bearer {self.rider_token}"}
        response = self.session.post(f"{BASE_URL}/rides/accept-bid/{bid_id}", headers=headers)
        
        return response.status_code == 200
        
    def test_other_endpoints_still_work(self):
        """Test 3: Verify other endpoints still work"""
        self.log("Testing other ride endpoints still work...")
        
        headers = {"Authorization": f"Bearer {self.rider_token}"}
        
        # Test GET /api/rides
        response = self.session.get(f"{BASE_URL}/rides", headers=headers)
        if response.status_code != 200:
            self.log(f"❌ FAIL: GET /api/rides failed with {response.status_code}")
            return False
        else:
            rides = response.json().get("rides", [])
            self.log(f"✅ PASS: GET /api/rides works, returned {len(rides)} rides")
            
        # Test GET /api/rides/{ride_id} if we have a ride
        rides = response.json().get("rides", [])
        if rides:
            ride_id = rides[0].get("ride_id")
            response = self.session.get(f"{BASE_URL}/rides/{ride_id}", headers=headers)
            if response.status_code != 200:
                self.log(f"❌ FAIL: GET /api/rides/{ride_id} failed with {response.status_code}")
                return False
            else:
                self.log(f"✅ PASS: GET /api/rides/{ride_id} works")
                
        return True
        
    def run_focused_tests(self):
        """Run the focused active ride endpoint tests"""
        self.log("=" * 70)
        self.log("FOCUSED ACTIVE RIDE ENDPOINT TESTS")
        self.log("Testing the specific fix mentioned in the review request")
        self.log("=" * 70)
        
        # Login
        if not self.login_rider() or not self.login_driver():
            self.log("❌ Failed to login")
            return False
            
        test_results = []
        
        # Test 1: No active ride scenario
        test_results.append(("No Active Ride (200 + null)", self.test_active_ride_no_active_ride()))
        
        # Test 2: With active ride scenario
        test_results.append(("With Active Ride (200 + data)", self.test_active_ride_with_active_ride()))
        
        # Test 3: Other endpoints still work
        test_results.append(("Other Endpoints Work", self.test_other_endpoints_still_work()))
        
        # Summary
        self.log("=" * 70)
        self.log("FOCUSED TEST RESULTS")
        self.log("=" * 70)
        
        passed = 0
        failed = 0
        
        for test_name, result in test_results:
            status = "✅ PASS" if result else "❌ FAIL"
            self.log(f"{test_name:<30} {status}")
            if result:
                passed += 1
            else:
                failed += 1
                
        self.log("=" * 70)
        self.log(f"TOTAL: {passed} passed, {failed} failed")
        
        if failed == 0:
            self.log("🎉 ACTIVE RIDE ENDPOINT FIX VERIFIED!")
            self.log("✅ Route ordering fix successful - /api/rides/active works correctly")
        else:
            self.log(f"⚠️  {failed} test(s) failed in active ride endpoint")
            
        return failed == 0

if __name__ == "__main__":
    tester = ActiveRideEndpointTester()
    success = tester.run_focused_tests()
    exit(0 if success else 1)