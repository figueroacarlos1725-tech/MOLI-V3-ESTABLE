#!/usr/bin/env python3
"""
Simple test to debug the dispatch system
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
    print("🔍 Debug Dispatch System")
    
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
    
    # Set driver offline
    print("3. Set driver offline")
    offline_response = make_request("PUT", "/drivers/availability", 
                                  headers=driver_headers, 
                                  params={"is_online": False})
    if offline_response and offline_response.status_code == 200:
        print("✅ Driver set offline")
    else:
        print("❌ Failed to set driver offline")
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
    print(f"   Expires at: {request_data.get('expires_at')}")
    
    # Wait a bit
    print("5. Waiting 2 seconds...")
    time.sleep(2)
    
    # Set driver online
    print("6. Set driver online")
    online_response = make_request("PUT", "/drivers/availability", 
                                 headers=driver_headers, 
                                 params={
                                     "is_online": True,
                                     "latitude": PICKUP_LOCATION["latitude"],
                                     "longitude": PICKUP_LOCATION["longitude"]
                                 })
    
    if not online_response or online_response.status_code != 200:
        print("❌ Failed to set driver online")
        print(f"Status: {online_response.status_code if online_response else 'None'}")
        print(f"Response: {online_response.text if online_response else 'None'}")
        return
    print("✅ Driver set online")
    
    # Wait for dispatch
    print("7. Waiting 8 seconds for dispatch...")
    time.sleep(8)
    
    # Check for rides
    print("8. Check for rides")
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
        print(f"Status: {rides_response.status_code if rides_response else 'None'}")
        print(f"Response: {rides_response.text if rides_response else 'None'}")
    
    # Check driver availability
    print("9. Check driver availability")
    nearby_response = make_request("GET", "/drivers/nearby", 
                                 params={
                                     "latitude": PICKUP_LOCATION["latitude"],
                                     "longitude": PICKUP_LOCATION["longitude"],
                                     "radius_km": 10
                                 })
    
    if nearby_response and nearby_response.status_code == 200:
        drivers = nearby_response.json().get("drivers", [])
        print(f"✅ Found {len(drivers)} nearby drivers")
        for driver in drivers:
            if driver.get("driver_id") == driver_user.get("user_id"):
                print(f"   🎯 Our driver is available")
                return
        print("   ❌ Our driver is not in nearby list (might be busy)")
    else:
        print("❌ Failed to get nearby drivers")

if __name__ == "__main__":
    main()