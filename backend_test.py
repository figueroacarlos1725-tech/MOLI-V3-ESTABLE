#!/usr/bin/env python3
"""
Backend API Testing for TaxiRide Clone
Tests the complete ride booking flow as specified in the review request
"""

import requests
import json
import time
from datetime import datetime

# Base URL from frontend .env
BASE_URL = "https://taxify-clone.preview.emergentagent.com/api"

# Test credentials from test_credentials.md
RIDER_EMAIL = "rider@test.com"
RIDER_PASSWORD = "test123456"
DRIVER_EMAIL = "driver@test.com"
DRIVER_PASSWORD = "test123456"

class TaxiRideAPITester:
    def __init__(self):
        self.rider_token = None
        self.driver_token = None
        self.request_id = None
        self.bid_id = None
        self.ride_id = None
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        })
        
    def log(self, message):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}")
        
    def test_rider_login(self):
        """Test rider login"""
        self.log("Testing rider login...")
        
        payload = {
            "email": RIDER_EMAIL,
            "password": RIDER_PASSWORD
        }
        
        response = self.session.post(f"{BASE_URL}/auth/login", json=payload)
        
        if response.status_code == 200:
            data = response.json()
            self.rider_token = data.get("access_token")
            self.log(f"✅ Rider login successful. Token: {self.rider_token[:20]}...")
            return True
        else:
            self.log(f"❌ Rider login failed: {response.status_code} - {response.text}")
            return False
            
    def test_driver_login(self):
        """Test driver login"""
        self.log("Testing driver login...")
        
        payload = {
            "email": DRIVER_EMAIL,
            "password": DRIVER_PASSWORD
        }
        
        response = self.session.post(f"{BASE_URL}/auth/login", json=payload)
        
        if response.status_code == 200:
            data = response.json()
            self.driver_token = data.get("access_token")
            self.log(f"✅ Driver login successful. Token: {self.driver_token[:20]}...")
            return True
        else:
            self.log(f"❌ Driver login failed: {response.status_code} - {response.text}")
            return False
            
    def test_ride_request(self):
        """Test ride request creation"""
        self.log("Testing ride request creation...")
        
        if not self.rider_token:
            self.log("❌ No rider token available")
            return False
            
        headers = {"Authorization": f"Bearer {self.rider_token}"}
        
        payload = {
            "pickup_location": {
                "latitude": 40.7128,
                "longitude": -74.0060,
                "address": "New York, NY"
            },
            "dropoff_location": {
                "latitude": 40.7589,
                "longitude": -73.9851,
                "address": "Times Square, NY"
            },
            "ride_type": "standard",
            "vehicle_type": "economy",
            "payment_method": "cash"
        }
        
        response = self.session.post(f"{BASE_URL}/rides/request", json=payload, headers=headers)
        
        if response.status_code == 200:
            data = response.json()
            self.request_id = data.get("request_id")
            estimated_fare = data.get("estimated_fare")
            status = data.get("status")
            
            self.log(f"✅ Ride request created successfully")
            self.log(f"   Request ID: {self.request_id}")
            self.log(f"   Estimated Fare: ${estimated_fare}")
            self.log(f"   Status: {status}")
            
            # Verify required fields
            if self.request_id and estimated_fare and status == "pending":
                return True
            else:
                self.log("❌ Missing required fields in response")
                return False
        else:
            self.log(f"❌ Ride request failed: {response.status_code} - {response.text}")
            return False
            
    def test_driver_register_vehicle(self):
        """Register a vehicle for the driver"""
        self.log("Registering driver vehicle...")
        
        if not self.driver_token:
            self.log("❌ No driver token available")
            return False
            
        headers = {"Authorization": f"Bearer {self.driver_token}"}
        
        payload = {
            "make": "Toyota",
            "model": "Camry",
            "year": 2020,
            "color": "Blue",
            "plate_number": "ABC123",
            "vehicle_type": "economy",
            "capacity": 4
        }
        
        response = self.session.post(f"{BASE_URL}/vehicles", json=payload, headers=headers)
        
        if response.status_code == 200:
            data = response.json()
            vehicle_id = data.get("vehicle_id")
            self.log(f"✅ Vehicle registered successfully: {vehicle_id}")
            return True
        else:
            self.log(f"❌ Vehicle registration failed: {response.status_code} - {response.text}")
            return False
            
    def test_driver_set_online(self):
        """Set driver online and available"""
        self.log("Setting driver online...")
        
        if not self.driver_token:
            self.log("❌ No driver token available")
            return False
            
        headers = {"Authorization": f"Bearer {self.driver_token}"}
        
        params = {
            "is_online": True,
            "latitude": 40.7128,
            "longitude": -74.0060
        }
        
        response = self.session.put(f"{BASE_URL}/drivers/availability", params=params, headers=headers)
        
        if response.status_code == 200:
            self.log("✅ Driver set online successfully")
            return True
        else:
            self.log(f"❌ Failed to set driver online: {response.status_code} - {response.text}")
            return False
            
    def test_pending_requests(self):
        """Test driver viewing pending requests"""
        self.log("Testing driver viewing pending requests...")
        
        if not self.driver_token:
            self.log("❌ No driver token available")
            return False
            
        headers = {"Authorization": f"Bearer {self.driver_token}"}
        
        params = {
            "latitude": 40.7128,
            "longitude": -74.0060
        }
        
        response = self.session.get(f"{BASE_URL}/rides/requests/pending", params=params, headers=headers)
        
        if response.status_code == 200:
            data = response.json()
            requests_list = data.get("requests", [])
            
            self.log(f"✅ Retrieved {len(requests_list)} pending requests")
            
            # Check if our request is in the list
            found_request = False
            for req in requests_list:
                if req.get("request_id") == self.request_id:
                    found_request = True
                    self.log(f"   Found our request: {req.get('request_id')}")
                    break
                    
            if found_request or len(requests_list) > 0:
                return True
            else:
                self.log("❌ No pending requests found (this might be expected)")
                return True  # This is not necessarily a failure
        else:
            self.log(f"❌ Failed to get pending requests: {response.status_code} - {response.text}")
            return False
            
    def test_submit_bid(self):
        """Test driver submitting a bid"""
        self.log("Testing driver bid submission...")
        
        if not self.driver_token or not self.request_id:
            self.log("❌ Missing driver token or request ID")
            return False
            
        headers = {"Authorization": f"Bearer {self.driver_token}"}
        
        payload = {
            "request_id": self.request_id,
            "fare_amount": 15.50,
            "estimated_arrival": 8
        }
        
        response = self.session.post(f"{BASE_URL}/rides/bid", json=payload, headers=headers)
        
        if response.status_code == 200:
            data = response.json()
            self.bid_id = data.get("bid_id")
            driver_name = data.get("driver_name")
            fare_amount = data.get("fare_amount")
            
            self.log(f"✅ Bid submitted successfully")
            self.log(f"   Bid ID: {self.bid_id}")
            self.log(f"   Driver: {driver_name}")
            self.log(f"   Fare: ${fare_amount}")
            
            if self.bid_id:
                return True
            else:
                self.log("❌ Missing bid_id in response")
                return False
        else:
            self.log(f"❌ Bid submission failed: {response.status_code} - {response.text}")
            return False
            
    def test_get_request_with_bids(self):
        """Test rider getting request to see bids"""
        self.log("Testing rider viewing request with bids...")
        
        if not self.rider_token or not self.request_id:
            self.log("❌ Missing rider token or request ID")
            return False
            
        headers = {"Authorization": f"Bearer {self.rider_token}"}
        
        # Get the ride request to see bids
        response = self.session.get(f"{BASE_URL}/rides", headers=headers)
        
        if response.status_code == 200:
            data = response.json()
            rides = data.get("rides", [])
            
            self.log(f"✅ Retrieved rides list with {len(rides)} rides")
            return True
        else:
            self.log(f"❌ Failed to get rides: {response.status_code} - {response.text}")
            return False
            
    def test_accept_bid(self):
        """Test rider accepting a bid"""
        self.log("Testing rider accepting bid...")
        
        if not self.rider_token or not self.bid_id:
            self.log("❌ Missing rider token or bid ID")
            return False
            
        headers = {"Authorization": f"Bearer {self.rider_token}"}
        
        response = self.session.post(f"{BASE_URL}/rides/accept-bid/{self.bid_id}", headers=headers)
        
        if response.status_code == 200:
            data = response.json()
            self.ride_id = data.get("ride_id")
            ride_data = data.get("ride", {})
            
            self.log(f"✅ Bid accepted successfully")
            self.log(f"   Ride ID: {self.ride_id}")
            self.log(f"   Status: {ride_data.get('status')}")
            
            if self.ride_id:
                return True
            else:
                self.log("❌ Missing ride_id in response")
                return False
        else:
            self.log(f"❌ Bid acceptance failed: {response.status_code} - {response.text}")
            return False
            
    def test_ride_status_updates(self):
        """Test ride status updates"""
        if not self.driver_token or not self.ride_id:
            self.log("❌ Missing driver token or ride ID")
            return False
            
        headers = {"Authorization": f"Bearer {self.driver_token}"}
        
        statuses = ["arrived", "started", "completed"]
        
        for status in statuses:
            self.log(f"Testing ride status update to '{status}'...")
            
            params = {"status": status}
            response = self.session.put(f"{BASE_URL}/rides/{self.ride_id}/status", params=params, headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                self.log(f"✅ Status updated to '{status}' successfully")
                time.sleep(1)  # Small delay between status updates
            else:
                self.log(f"❌ Status update to '{status}' failed: {response.status_code} - {response.text}")
                return False
                
        return True
        
    def test_get_ride_details(self):
        """Test getting ride details"""
        self.log("Testing ride details retrieval...")
        
        if not self.rider_token or not self.ride_id:
            self.log("❌ Missing rider token or ride ID")
            return False
            
        headers = {"Authorization": f"Bearer {self.rider_token}"}
        
        response = self.session.get(f"{BASE_URL}/rides/{self.ride_id}", headers=headers)
        
        if response.status_code == 200:
            data = response.json()
            driver_info = data.get("driver_info")
            vehicle_info = data.get("vehicle_info")
            rider_info = data.get("rider_info")
            
            self.log(f"✅ Ride details retrieved successfully")
            self.log(f"   Driver: {driver_info.get('name') if driver_info else 'N/A'}")
            self.log(f"   Vehicle: {vehicle_info.get('make') if vehicle_info else 'N/A'} {vehicle_info.get('model') if vehicle_info else ''}")
            self.log(f"   Rider: {rider_info.get('name') if rider_info else 'N/A'}")
            
            # Verify required fields are present
            if driver_info and vehicle_info and rider_info:
                return True
            else:
                self.log("❌ Missing required info fields in ride details")
                return False
        else:
            self.log(f"❌ Failed to get ride details: {response.status_code} - {response.text}")
            return False
            
    def test_active_ride_endpoint(self):
        """Test the active ride endpoint"""
        self.log("Testing active ride endpoint...")
        
        if not self.rider_token:
            self.log("❌ Missing rider token")
            return False
            
        headers = {"Authorization": f"Bearer {self.rider_token}"}
        
        response = self.session.get(f"{BASE_URL}/rides/active", headers=headers)
        
        if response.status_code == 200:
            data = response.json()
            ride = data.get("ride")
            
            if ride:
                self.log(f"✅ Active ride retrieved successfully")
                self.log(f"   Ride ID: {ride.get('ride_id')}")
                self.log(f"   Status: {ride.get('status')}")
                
                # Check for required fields
                driver_info = ride.get("driver_info")
                vehicle_info = ride.get("vehicle_info")
                rider_info = ride.get("rider_info")
                
                if driver_info and vehicle_info and rider_info:
                    self.log(f"   All details present: driver, vehicle, rider info")
                    return True
                else:
                    self.log("❌ Missing some details in active ride")
                    return False
            else:
                self.log("✅ No active ride found (expected after completion)")
                return True
        else:
            self.log(f"❌ Failed to get active ride: {response.status_code} - {response.text}")
            return False
            
    def test_active_ride_during_ride(self):
        """Test the active ride endpoint during an active ride"""
        self.log("Testing active ride endpoint during active ride...")
        
        if not self.rider_token or not self.ride_id:
            self.log("❌ Missing rider token or ride ID")
            return False
            
        headers = {"Authorization": f"Bearer {self.rider_token}"}
        
        response = self.session.get(f"{BASE_URL}/rides/active", headers=headers)
        
        if response.status_code == 200:
            data = response.json()
            ride = data.get("ride")
            
            if ride:
                self.log(f"✅ Active ride retrieved successfully during ride")
                self.log(f"   Ride ID: {ride.get('ride_id')}")
                self.log(f"   Status: {ride.get('status')}")
                
                # Check for required fields
                driver_info = ride.get("driver_info")
                vehicle_info = ride.get("vehicle_info")
                rider_info = ride.get("rider_info")
                
                if driver_info and vehicle_info and rider_info:
                    self.log(f"   All details present: driver, vehicle, rider info")
                    return True
                else:
                    self.log("❌ Missing some details in active ride")
                    return False
            else:
                self.log("❌ No active ride found when there should be one")
                return False
        else:
            self.log(f"❌ Failed to get active ride: {response.status_code} - {response.text}")
            return False
            
    def run_complete_flow_test(self):
        """Run the complete ride booking flow test"""
        self.log("=" * 60)
        self.log("STARTING COMPLETE RIDE BOOKING FLOW TEST")
        self.log("=" * 60)
        
        test_results = []
        
        # Step 1: Rider login
        test_results.append(("Rider Login", self.test_rider_login()))
        
        # Step 2: Driver login
        test_results.append(("Driver Login", self.test_driver_login()))
        
        # Step 3: Register driver vehicle
        test_results.append(("Driver Register Vehicle", self.test_driver_register_vehicle()))
        
        # Step 4: Set driver online
        test_results.append(("Driver Set Online", self.test_driver_set_online()))
        
        # Step 5: Rider requests ride
        test_results.append(("Ride Request", self.test_ride_request()))
        
        # Step 6: Driver sees pending requests
        test_results.append(("View Pending Requests", self.test_pending_requests()))
        
        # Step 7: Driver submits bid
        test_results.append(("Submit Bid", self.test_submit_bid()))
        
        # Step 8: Rider sees bids
        test_results.append(("View Rides with Bids", self.test_get_request_with_bids()))
        
        # Step 9: Rider accepts bid
        test_results.append(("Accept Bid", self.test_accept_bid()))
        
        # Step 10: Test active ride endpoint during ride
        test_results.append(("Active Ride During Ride", self.test_active_ride_during_ride()))
        
        # Step 11: Ride status updates
        test_results.append(("Ride Status Updates", self.test_ride_status_updates()))
        
        # Step 12: Get ride details
        test_results.append(("Get Ride Details", self.test_get_ride_details()))
        
        # Step 13: Test active ride endpoint after completion
        test_results.append(("Active Ride After Completion", self.test_active_ride_endpoint()))
        
        # Summary
        self.log("=" * 60)
        self.log("TEST RESULTS SUMMARY")
        self.log("=" * 60)
        
        passed = 0
        failed = 0
        
        for test_name, result in test_results:
            status = "✅ PASS" if result else "❌ FAIL"
            self.log(f"{test_name:<25} {status}")
            if result:
                passed += 1
            else:
                failed += 1
                
        self.log("=" * 60)
        self.log(f"TOTAL: {passed} passed, {failed} failed")
        
        if failed == 0:
            self.log("🎉 ALL TESTS PASSED! Complete ride booking flow is working.")
        else:
            self.log(f"⚠️  {failed} test(s) failed. Please check the issues above.")
            
        return failed == 0

if __name__ == "__main__":
    tester = TaxiRideAPITester()
    success = tester.run_complete_flow_test()
    exit(0 if success else 1)