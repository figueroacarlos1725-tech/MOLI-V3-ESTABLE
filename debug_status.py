#!/usr/bin/env python3
"""
Debug the ride status update issue
"""

import requests
import json
from datetime import datetime

BASE_URL = "https://taxify-clone.preview.emergentagent.com/api"
RIDER_EMAIL = "rider@test.com"
RIDER_PASSWORD = "test123456"
DRIVER_EMAIL = "driver@test.com"
DRIVER_PASSWORD = "test123456"

def log(message):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}")

def test_status_update_debug():
    session = requests.Session()
    session.headers.update({'Content-Type': 'application/json', 'Accept': 'application/json'})
    
    # Login
    payload = {"email": DRIVER_EMAIL, "password": DRIVER_PASSWORD}
    response = session.post(f"{BASE_URL}/auth/login", json=payload)
    driver_token = response.json().get("access_token")
    
    payload = {"email": RIDER_EMAIL, "password": RIDER_PASSWORD}
    response = session.post(f"{BASE_URL}/auth/login", json=payload)
    rider_token = response.json().get("access_token")
    
    # Get current rides to find an active one
    headers = {"Authorization": f"Bearer {rider_token}"}
    response = session.get(f"{BASE_URL}/rides", headers=headers)
    rides = response.json().get("rides", [])
    
    # Find an active ride
    active_ride = None
    for ride in rides:
        if ride.get("status") in ["accepted", "arrived", "started"]:
            active_ride = ride
            break
            
    if not active_ride:
        log("No active ride found")
        return
        
    ride_id = active_ride["ride_id"]
    current_status = active_ride["status"]
    log(f"Found active ride: {ride_id}, current status: {current_status}")
    
    # Try to update status
    headers = {"Authorization": f"Bearer {driver_token}"}
    
    # Test with JSON body instead of params
    payload = {"status": "arrived"}
    response = session.put(f"{BASE_URL}/rides/{ride_id}/status", json=payload, headers=headers)
    log(f"Status update response: {response.status_code} - {response.text}")
    
    # Check if status changed
    headers = {"Authorization": f"Bearer {rider_token}"}
    response = session.get(f"{BASE_URL}/rides/{ride_id}", headers=headers)
    if response.status_code == 200:
        updated_ride = response.json()
        new_status = updated_ride.get("status")
        log(f"Updated status: {new_status}")
    else:
        log(f"Failed to get updated ride: {response.status_code}")

if __name__ == "__main__":
    test_status_update_debug()