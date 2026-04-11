#!/usr/bin/env python3
"""
Test driver response mechanism
"""

import requests
import json
import time

# Configuration
BASE_URL = "https://taxify-clone.preview.emergentagent.com/api"

# Test credentials
RIDER_EMAIL = "rider@test.com"
RIDER_PASSWORD = "test123456"
DRIVER_EMAIL = "driver@test.com"
DRIVER_PASSWORD = "test123456"

# Test locations
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

def main():
    print("🔍 Test Driver Response Mechanism")
    
    # Login as rider
    print("1. Login as rider")
    rider_token, rider_user = login_user(RIDER_EMAIL, RIDER_PASSWORD)
    if not rider_token:
        print("❌ Failed to login as rider")
        return
    print("✅ Rider login successful")
    
    rider_headers = {"Authorization": f"Bearer {rider_token}"}
    
    # Login as driver
    print("2. Login as driver")
    driver_token, driver_user = login_user(DRIVER_EMAIL, DRIVER_PASSWORD)
    if not driver_token:
        print("❌ Failed to login as driver")
        return
    print("✅ Driver login successful")
    
    driver_headers = {"Authorization": f"Bearer {driver_token}"}
    
    # Set driver online
    print("3. Set driver online")
    online_response = make_request("PUT", "/drivers/availability", 
                                 headers=driver_headers, 
                                 params={
                                     "is_online": True,
                                     "latitude": PICKUP_LOCATION["latitude"],
                                     "longitude": PICKUP_LOCATION["longitude"]
                                 })
    if online_response and online_response.status_code == 200:
        print("✅ Driver set online")
    else:
        print("❌ Failed to set driver online")
        return
    
    # Create ride request
    print("4. Create ride request")
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
        print("❌ Failed to create ride request")
        print(f"Status: {request_response.status_code if request_response else 'None'}")
        print(f"Response: {request_response.text if request_response else 'None'}")
        return
    
    request_data = request_response.json()
    request_id = request_data.get("request_id")
    print(f"✅ Ride request created: {request_id}")
    print(f"   Status: {request_data.get('status')}")
    
    # Wait for dispatch
    print("5. Waiting 5 seconds for dispatch...")
    time.sleep(5)
    
    # Try to manually accept the ride
    print("6. Manually accept ride as driver")
    accept_response = make_request("POST", f"/rides/{request_id}/driver-response", 
                                 headers=driver_headers, 
                                 params={"action": "accept"})
    
    if accept_response and accept_response.status_code == 200:
        accept_data = accept_response.json()
        print(f"✅ Driver response successful: {accept_data.get('status')}")
        if accept_data.get("status") == "accepted":
            ride_id = accept_data.get("ride_id")
            print(f"   🎯 Ride created: {ride_id}")
        else:
            print(f"   ❌ Unexpected status: {accept_data.get('status')}")
    else:
        print("❌ Failed to accept ride")
        print(f"Status: {accept_response.status_code if accept_response else 'None'}")
        print(f"Response: {accept_response.text if accept_response else 'None'}")
    
    # Check for rides
    print("7. Check for rides")
    rides_response = make_request("GET", "/rides/my-rides", headers=rider_headers)
    
    if rides_response and rides_response.status_code == 200:
        rides = rides_response.json().get("rides", [])
        print(f"✅ Found {len(rides)} rides")
        for ride in rides:
            if ride.get("request_id") == request_id:
                print(f"   🎯 Matching ride found: {ride.get('ride_id')}")
                print(f"      Status: {ride.get('status')}")
                print(f"      Driver: {ride.get('driver_id')}")
                return
        print("   ❌ No matching ride found")
    else:
        print("❌ Failed to get rides")

if __name__ == "__main__":
    main()