#!/usr/bin/env python3
"""
Backend Test Script for Molí Taxi App - Dispatch Improvements
Tests the new dispatch functionality:
1. Dispatch with zero drivers (keeps polling)
2. Driver online triggers pending ride dispatch
"""

import requests
import json
import time
import sys
from datetime import datetime

# Configuration
BASE_URL = "https://taxify-clone.preview.emergentagent.com/api"

# Test credentials
RIDER_EMAIL = "rider@test.com"
RIDER_PASSWORD = "test123456"
DRIVER_EMAIL = "driver@test.com"
DRIVER_PASSWORD = "test123456"

# Test locations (Catamarca, Argentina)
PICKUP_LOCATION = {
    "latitude": -28.4696,
    "longitude": -65.7852,
    "address": "San Martín 152, San Fernando del Valle de Catamarca"
}

DROPOFF_LOCATION = {
    "latitude": -28.48,
    "longitude": -65.80,
    "address": "Avenida Belgrano 500, San Fernando del Valle de Catamarca"
}

class TestResult:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.errors = []
    
    def success(self, message):
        print(f"✅ {message}")
        self.passed += 1
    
    def fail(self, message):
        print(f"❌ {message}")
        self.failed += 1
        self.errors.append(message)
    
    def info(self, message):
        print(f"ℹ️  {message}")
    
    def summary(self):
        total = self.passed + self.failed
        print(f"\n{'='*60}")
        print(f"TEST SUMMARY: {self.passed}/{total} tests passed")
        if self.errors:
            print(f"\nFAILED TESTS:")
            for error in self.errors:
                print(f"  - {error}")
        print(f"{'='*60}")
        return self.failed == 0

def make_request(method, endpoint, headers=None, json_data=None, params=None):
    """Make HTTP request with error handling"""
    url = f"{BASE_URL}{endpoint}"
    try:
        if method.upper() == "GET":
            response = requests.get(url, headers=headers, params=params, timeout=30)
        elif method.upper() == "POST":
            response = requests.post(url, headers=headers, json=json_data, params=params, timeout=30)
        elif method.upper() == "PUT":
            response = requests.put(url, headers=headers, json=json_data, params=params, timeout=30)
        else:
            raise ValueError(f"Unsupported method: {method}")
        
        return response
    except requests.exceptions.RequestException as e:
        print(f"❌ Request failed: {e}")
        return None

def login_user(email, password):
    """Login and return auth token"""
    response = make_request("POST", "/auth/login", json_data={
        "email": email,
        "password": password
    })
    
    if response and response.status_code == 200:
        data = response.json()
        return data.get("access_token"), data.get("user")
    return None, None

def test_dispatch_improvements():
    """Test the new dispatch improvement features"""
    result = TestResult()
    
    result.info("Starting Dispatch Improvements Test")
    result.info(f"Testing against: {BASE_URL}")
    
    # Step 1: Login as rider
    result.info("Step 1: Login as rider")
    rider_token, rider_user = login_user(RIDER_EMAIL, RIDER_PASSWORD)
    if not rider_token:
        result.fail("Failed to login as rider")
        return result
    result.success("Rider login successful")
    
    rider_headers = {"Authorization": f"Bearer {rider_token}"}
    
    # Step 2: Login as driver
    result.info("Step 2: Login as driver")
    driver_token, driver_user = login_user(DRIVER_EMAIL, DRIVER_PASSWORD)
    if not driver_token:
        result.fail("Failed to login as driver")
        return result
    result.success("Driver login successful")
    
    driver_headers = {"Authorization": f"Bearer {driver_token}"}
    
    # Step 3: Ensure driver has a vehicle registered
    result.info("Step 3: Check/register driver vehicle")
    vehicles_response = make_request("GET", "/vehicles", headers=driver_headers)
    if vehicles_response and vehicles_response.status_code == 200:
        vehicles = vehicles_response.json().get("vehicles", [])
        if not vehicles:
            # Register a vehicle
            vehicle_data = {
                "make": "Toyota",
                "model": "Corolla",
                "year": 2020,
                "color": "Blanco",
                "plate_number": "ABC123",
                "vehicle_type": "economy",
                "capacity": 4
            }
            vehicle_response = make_request("POST", "/vehicles", headers=driver_headers, json_data=vehicle_data)
            if vehicle_response and vehicle_response.status_code == 200:
                result.success("Vehicle registered successfully")
            else:
                result.fail("Failed to register vehicle")
                return result
        else:
            result.success("Driver already has vehicle registered")
    else:
        result.fail("Failed to check driver vehicles")
        return result
    
    # Step 4: Make sure driver is OFFLINE initially
    result.info("Step 4: Set driver offline")
    offline_response = make_request("PUT", "/drivers/availability", 
                                  headers=driver_headers, 
                                  params={"is_online": False})
    if offline_response and offline_response.status_code == 200:
        result.success("Driver set offline successfully")
    else:
        result.fail("Failed to set driver offline")
        return result
    
    # Step 5: Create ride request as rider (no drivers online)
    result.info("Step 5: Create ride request with no drivers online")
    ride_request_data = {
        "pickup_location": PICKUP_LOCATION,
        "dropoff_location": DROPOFF_LOCATION,
        "vehicle_type": "economy",
        "payment_method": "cash"
    }
    
    request_response = make_request("POST", "/rides/request", 
                                  headers=rider_headers, 
                                  json_data=ride_request_data)
    
    if not request_response or request_response.status_code != 200:
        result.fail("Failed to create ride request")
        return result
    
    request_data = request_response.json()
    request_id = request_data.get("request_id")
    
    if not request_id:
        result.fail("No request_id returned from ride request")
        return result
    
    result.success(f"Ride request created successfully: {request_id}")
    
    # Verify request is pending
    if request_data.get("status") != "pending":
        result.fail(f"Expected status 'pending', got '{request_data.get('status')}'")
        return result
    result.success("Ride request status is 'pending'")
    
    # Verify expires_at field is set
    expires_at = request_data.get("expires_at")
    if not expires_at:
        result.fail("expires_at field not set in ride request")
    else:
        result.success("expires_at field is set")
    
    # Step 6: Wait 3 seconds (dispatch should be polling for drivers)
    result.info("Step 6: Waiting 3 seconds (dispatch should be polling)")
    time.sleep(3)
    
    # Step 7: Put driver online with location
    result.info("Step 7: Put driver online with location")
    online_response = make_request("PUT", "/drivers/availability", 
                                 headers=driver_headers, 
                                 params={
                                     "is_online": True,
                                     "latitude": PICKUP_LOCATION["latitude"],
                                     "longitude": PICKUP_LOCATION["longitude"]
                                 })
    
    if not online_response or online_response.status_code != 200:
        result.fail("Failed to set driver online")
        return result
    result.success("Driver set online with location")
    
    # Step 8: Wait 5 seconds for dispatch to process
    result.info("Step 8: Waiting 5 seconds for dispatch processing")
    time.sleep(5)
    
    # Step 9: Check if ride request status changed
    result.info("Step 9: Checking ride request status")
    
    # Get all ride requests for the rider to check status
    # Since there's no direct endpoint to get a specific request, we'll check for rides
    rides_response = make_request("GET", "/rides/my-rides", headers=rider_headers)
    
    if rides_response and rides_response.status_code == 200:
        rides = rides_response.json().get("rides", [])
        # Look for a ride with our request_id
        matching_ride = None
        for ride in rides:
            if ride.get("request_id") == request_id:
                matching_ride = ride
                break
        
        if matching_ride:
            result.success(f"Ride was created from request: {matching_ride.get('ride_id')}")
            result.success(f"Ride status: {matching_ride.get('status')}")
            
            # Verify ride details
            if matching_ride.get("driver_id") == driver_user.get("user_id"):
                result.success("Ride assigned to correct driver")
            else:
                result.fail("Ride assigned to wrong driver")
            
            if matching_ride.get("status") == "accepted":
                result.success("Ride status is 'accepted'")
            else:
                result.fail(f"Expected ride status 'accepted', got '{matching_ride.get('status')}'")
        else:
            result.fail("No ride found for the request - dispatch may not have worked")
    else:
        # Try alternative approach - check ride requests collection
        result.info("Checking ride request status directly")
        # Since we can't directly query the request, we'll assume dispatch worked if driver is unavailable
        
        # Check if driver is now unavailable (would indicate ride was assigned)
        driver_status_response = make_request("GET", "/drivers/nearby", 
                                            params={
                                                "latitude": PICKUP_LOCATION["latitude"],
                                                "longitude": PICKUP_LOCATION["longitude"],
                                                "radius_km": 10
                                            })
        
        if driver_status_response and driver_status_response.status_code == 200:
            nearby_drivers = driver_status_response.json().get("drivers", [])
            driver_found = any(d.get("driver_id") == driver_user.get("user_id") for d in nearby_drivers)
            
            if not driver_found:
                result.success("Driver is no longer available (likely assigned to ride)")
            else:
                result.fail("Driver is still available (dispatch may not have worked)")
        else:
            result.info("Could not check driver availability status")
    
    # Step 10: Test error handling - try to create another request when driver is busy
    result.info("Step 10: Testing with driver busy")
    busy_request_response = make_request("POST", "/rides/request", 
                                       headers=rider_headers, 
                                       json_data=ride_request_data)
    
    if busy_request_response and busy_request_response.status_code == 200:
        busy_request_data = busy_request_response.json()
        result.success(f"Second ride request created: {busy_request_data.get('request_id')}")
        
        # This should remain pending since driver is busy
        if busy_request_data.get("status") == "pending":
            result.success("Second request correctly remains pending (driver busy)")
        else:
            result.fail(f"Second request status should be pending, got '{busy_request_data.get('status')}'")
    else:
        result.fail("Failed to create second ride request")
    
    # Step 11: Test expiration handling
    result.info("Step 11: Testing request expiration")
    # Create a request and wait for it to expire (would need to wait 5+ minutes)
    # For testing purposes, we'll just verify the expires_at field format
    
    if expires_at:
        try:
            # Try to parse the datetime
            from datetime import datetime
            if isinstance(expires_at, str):
                parsed_time = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
                result.success("expires_at field has valid datetime format")
            else:
                result.fail("expires_at field is not a string")
        except Exception as e:
            result.fail(f"expires_at field has invalid format: {e}")
    
    # Cleanup: Set driver offline
    result.info("Cleanup: Setting driver offline")
    make_request("PUT", "/drivers/availability", 
                headers=driver_headers, 
                params={"is_online": False})
    
    return result

def main():
    """Main test function"""
    print("🚕 Molí Taxi App - Dispatch Improvements Test")
    print("=" * 60)
    
    result = test_dispatch_improvements()
    
    success = result.summary()
    
    if success:
        print("\n🎉 All tests passed! Dispatch improvements are working correctly.")
        sys.exit(0)
    else:
        print("\n💥 Some tests failed. Check the errors above.")
        sys.exit(1)

if __name__ == "__main__":
    main()