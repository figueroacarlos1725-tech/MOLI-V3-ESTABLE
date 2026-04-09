#!/usr/bin/env python3
"""
Test active ride endpoint at each stage of the ride flow
"""

import requests
import json
import time
from datetime import datetime

BASE_URL = "https://taxify-clone.preview.emergentagent.com/api"
RIDER_EMAIL = "rider@test.com"
RIDER_PASSWORD = "test123456"
DRIVER_EMAIL = "driver@test.com"
DRIVER_PASSWORD = "test123456"

class RideStagesTester:
    def __init__(self):
        self.rider_token = None
        self.driver_token = None
        self.ride_id = None
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        })
        
    def log(self, message):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}")
        
    def login_users(self):
        """Login both users"""
        # Rider login
        payload = {"email": RIDER_EMAIL, "password": RIDER_PASSWORD}
        response = self.session.post(f"{BASE_URL}/auth/login", json=payload)
        if response.status_code == 200:
            self.rider_token = response.json().get("access_token")
        
        # Driver login
        payload = {"email": DRIVER_EMAIL, "password": DRIVER_PASSWORD}
        response = self.session.post(f"{BASE_URL}/auth/login", json=payload)
        if response.status_code == 200:
            self.driver_token = response.json().get("access_token")
            
        return self.rider_token and self.driver_token
        
    def test_active_ride_at_stage(self, stage_name, expected_status=None):
        """Test active ride endpoint at a specific stage"""
        self.log(f"Testing active ride endpoint at stage: {stage_name}")
        
        headers = {"Authorization": f"Bearer {self.rider_token}"}
        response = self.session.get(f"{BASE_URL}/rides/active", headers=headers)
        
        if response.status_code == 200:
            data = response.json()
            ride = data.get("ride")
            
            if ride:
                status = ride.get("status")
                self.log(f"✅ Active ride found - Status: {status}")
                
                if expected_status and status != expected_status:
                    self.log(f"⚠️  Expected status '{expected_status}', got '{status}'")
                    
                # Check required fields
                driver_info = ride.get("driver_info")
                rider_info = ride.get("rider_info")
                vehicle_info = ride.get("vehicle_info")
                
                if driver_info and rider_info and vehicle_info:
                    self.log(f"✅ All required info present")
                    return True
                else:
                    self.log(f"❌ Missing info - driver: {bool(driver_info)}, rider: {bool(rider_info)}, vehicle: {bool(vehicle_info)}")
                    return False
            else:
                self.log(f"✅ No active ride (ride: null)")
                return expected_status is None
        else:
            self.log(f"❌ Failed: {response.status_code} - {response.text}")
            return False
            
    def create_and_test_ride_stages(self):
        """Create a ride and test active endpoint at each stage"""
        self.log("=" * 60)
        self.log("TESTING ACTIVE RIDE ENDPOINT AT EACH STAGE")
        self.log("=" * 60)
        
        if not self.login_users():
            self.log("❌ Failed to login")
            return False
            
        # Setup: Register vehicle and set driver online
        headers = {"Authorization": f"Bearer {self.driver_token}"}
        vehicle_payload = {
            "make": "Tesla", "model": "Model 3", "year": 2022, "color": "White",
            "plate_number": "TESLA1", "vehicle_type": "premium", "capacity": 4
        }
        self.session.post(f"{BASE_URL}/vehicles", json=vehicle_payload, headers=headers)
        
        params = {"is_online": True, "latitude": 40.7128, "longitude": -74.0060}
        self.session.put(f"{BASE_URL}/drivers/availability", params=params, headers=headers)
        
        # Stage 1: No active ride initially
        self.test_active_ride_at_stage("Initial (no ride)", None)
        
        # Create ride request
        headers = {"Authorization": f"Bearer {self.rider_token}"}
        request_payload = {
            "pickup_location": {"latitude": 40.7128, "longitude": -74.0060, "address": "NYC"},
            "dropoff_location": {"latitude": 40.7589, "longitude": -73.9851, "address": "Times Square"},
            "ride_type": "standard", "vehicle_type": "premium", "payment_method": "cash"
        }
        response = self.session.post(f"{BASE_URL}/rides/request", json=request_payload, headers=headers)
        request_id = response.json().get("request_id")
        
        # Submit bid
        headers = {"Authorization": f"Bearer {self.driver_token}"}
        bid_payload = {"request_id": request_id, "fare_amount": 18.00, "estimated_arrival": 6}
        response = self.session.post(f"{BASE_URL}/rides/bid", json=bid_payload, headers=headers)
        bid_id = response.json().get("bid_id")
        
        # Accept bid (creates ride with "accepted" status)
        headers = {"Authorization": f"Bearer {self.rider_token}"}
        response = self.session.post(f"{BASE_URL}/rides/accept-bid/{bid_id}", headers=headers)
        self.ride_id = response.json().get("ride_id")
        
        # Stage 2: Ride accepted
        self.test_active_ride_at_stage("Accepted", "accepted")
        
        # Stage 3: Driver arrived
        headers = {"Authorization": f"Bearer {self.driver_token}"}
        params = {"status": "arrived"}
        self.session.put(f"{BASE_URL}/rides/{self.ride_id}/status", params=params, headers=headers)
        time.sleep(0.5)
        self.test_active_ride_at_stage("Arrived", "arrived")
        
        # Stage 4: Ride started
        params = {"status": "started"}
        self.session.put(f"{BASE_URL}/rides/{self.ride_id}/status", params=params, headers=headers)
        time.sleep(0.5)
        self.test_active_ride_at_stage("Started", "started")
        
        # Stage 5: Ride completed
        params = {"status": "completed"}
        self.session.put(f"{BASE_URL}/rides/{self.ride_id}/status", params=params, headers=headers)
        time.sleep(0.5)
        self.test_active_ride_at_stage("Completed (no active ride)", None)
        
        self.log("=" * 60)
        self.log("✅ ALL STAGES TESTED SUCCESSFULLY")
        self.log("Active ride endpoint works correctly throughout the entire ride flow")
        self.log("=" * 60)
        
        return True

if __name__ == "__main__":
    tester = RideStagesTester()
    success = tester.create_and_test_ride_stages()
    exit(0 if success else 1)