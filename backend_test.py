#!/usr/bin/env python3
"""
Backend Test Suite for Moli Taxi App - Chat and AI Support Features
Tests the new chat and AI support functionality
"""

import asyncio
import aiohttp
import json
from datetime import datetime
import sys
import os

# Backend URL from frontend env
BACKEND_URL = "https://taxify-clone.preview.emergentagent.com/api"

# Test credentials
RIDER_EMAIL = "rider@test.com"
RIDER_PASSWORD = "test123456"
DRIVER_EMAIL = "driver@test.com"
DRIVER_PASSWORD = "test123456"
ADMIN_EMAIL = "admin@test.com"
ADMIN_PASSWORD = "admin123456"

class TestResults:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.errors = []
    
    def add_pass(self, test_name):
        self.passed += 1
        print(f"✅ {test_name}")
    
    def add_fail(self, test_name, error):
        self.failed += 1
        self.errors.append(f"{test_name}: {error}")
        print(f"❌ {test_name}: {error}")
    
    def summary(self):
        total = self.passed + self.failed
        print(f"\n{'='*60}")
        print(f"TEST SUMMARY: {self.passed}/{total} passed")
        if self.errors:
            print(f"\nFAILED TESTS:")
            for error in self.errors:
                print(f"  - {error}")
        print(f"{'='*60}")

async def login_user(session, email, password):
    """Login and return auth token"""
    try:
        async with session.post(f"{BACKEND_URL}/auth/login", json={
            "email": email,
            "password": password
        }) as resp:
            if resp.status == 200:
                data = await resp.json()
                return data.get("access_token")
            else:
                text = await resp.text()
                print(f"Login failed for {email}: {resp.status} - {text}")
                return None
    except Exception as e:
        print(f"Login error for {email}: {e}")
        return None

async def create_test_ride(session, rider_token, driver_token):
    """Create a test ride for chat testing"""
    try:
        # 1. Rider creates ride request
        headers = {"Authorization": f"Bearer {rider_token}"}
        ride_request = {
            "pickup_location": {
                "latitude": -34.6037,
                "longitude": -58.3816,
                "address": "Buenos Aires, Argentina"
            },
            "dropoff_location": {
                "latitude": -34.6118,
                "longitude": -58.3960,
                "address": "Puerto Madero, Buenos Aires"
            },
            "vehicle_type": "economy",
            "payment_method": "cash"
        }
        
        async with session.post(f"{BACKEND_URL}/rides/request", 
                               json=ride_request, headers=headers) as resp:
            if resp.status != 200:
                return None, f"Failed to create ride request: {resp.status}"
            
            request_data = await resp.json()
            request_id = request_data.get("request_id")
        
        # 2. Driver goes online and sets location
        driver_headers = {"Authorization": f"Bearer {driver_token}"}
        async with session.put(f"{BACKEND_URL}/drivers/availability?is_online=true&latitude=-34.6037&longitude=-58.3816", 
                              headers=driver_headers) as resp:
            if resp.status != 200:
                text = await resp.text()
                return None, f"Failed to set driver online: {resp.status} - {text}"
        
        # 3. Driver submits bid
        bid_data = {
            "request_id": request_id,
            "fare_amount": 15.50,
            "estimated_arrival": 5
        }
        
        async with session.post(f"{BACKEND_URL}/rides/bid", 
                               json=bid_data, headers=driver_headers) as resp:
            if resp.status != 200:
                return None, f"Failed to submit bid: {resp.status}"
            
            bid_data = await resp.json()
            bid_id = bid_data.get("bid_id")
        
        # 4. Rider accepts bid
        async with session.post(f"{BACKEND_URL}/rides/accept-bid/{bid_id}", 
                               headers=headers) as resp:
            if resp.status != 200:
                return None, f"Failed to accept bid: {resp.status}"
            
            accept_data = await resp.json()
            ride_id = accept_data.get("ride_id")
            
            return ride_id, None
    
    except Exception as e:
        return None, f"Exception creating test ride: {e}"

async def test_ride_chat(session, results):
    """Test ride chat functionality between rider and driver"""
    print("\n🚗 Testing Ride Chat...")
    
    # Login users
    rider_token = await login_user(session, RIDER_EMAIL, RIDER_PASSWORD)
    driver_token = await login_user(session, DRIVER_EMAIL, DRIVER_PASSWORD)
    
    if not rider_token or not driver_token:
        results.add_fail("Ride Chat - User Login", "Failed to login test users")
        return
    
    # Create test ride
    ride_id, error = await create_test_ride(session, rider_token, driver_token)
    if not ride_id:
        results.add_fail("Ride Chat - Create Test Ride", error or "Unknown error")
        return
    
    results.add_pass("Ride Chat - Create Test Ride")
    
    # Test 1: Rider sends message to driver
    try:
        headers = {"Authorization": f"Bearer {rider_token}"}
        async with session.post(f"{BACKEND_URL}/chat/send?ride_id={ride_id}&message=Hola+conductor", 
                               headers=headers) as resp:
            if resp.status == 200:
                data = await resp.json()
                if data.get("status") == "sent" and data.get("message_id"):
                    results.add_pass("Ride Chat - Rider Send Message")
                else:
                    results.add_fail("Ride Chat - Rider Send Message", f"Unexpected response: {data}")
            else:
                text = await resp.text()
                results.add_fail("Ride Chat - Rider Send Message", f"HTTP {resp.status}: {text}")
    except Exception as e:
        results.add_fail("Ride Chat - Rider Send Message", f"Exception: {e}")
    
    # Test 2: Driver sends message to rider
    try:
        headers = {"Authorization": f"Bearer {driver_token}"}
        async with session.post(f"{BACKEND_URL}/chat/send?ride_id={ride_id}&message=Hola+pasajero", 
                               headers=headers) as resp:
            if resp.status == 200:
                data = await resp.json()
                if data.get("status") == "sent" and data.get("message_id"):
                    results.add_pass("Ride Chat - Driver Send Message")
                else:
                    results.add_fail("Ride Chat - Driver Send Message", f"Unexpected response: {data}")
            else:
                text = await resp.text()
                results.add_fail("Ride Chat - Driver Send Message", f"HTTP {resp.status}: {text}")
    except Exception as e:
        results.add_fail("Ride Chat - Driver Send Message", f"Exception: {e}")
    
    # Test 3: Get chat messages for the ride
    try:
        headers = {"Authorization": f"Bearer {rider_token}"}
        async with session.get(f"{BACKEND_URL}/chat/messages/{ride_id}", 
                              headers=headers) as resp:
            if resp.status == 200:
                data = await resp.json()
                messages = data.get("messages", [])
                if len(messages) >= 2:
                    # Check if both messages are present
                    message_texts = [msg.get("message") for msg in messages]
                    if "Hola conductor" in message_texts and "Hola pasajero" in message_texts:
                        results.add_pass("Ride Chat - Get Messages")
                    else:
                        results.add_fail("Ride Chat - Get Messages", f"Missing expected messages: {message_texts}")
                else:
                    results.add_fail("Ride Chat - Get Messages", f"Expected 2+ messages, got {len(messages)}")
            else:
                text = await resp.text()
                results.add_fail("Ride Chat - Get Messages", f"HTTP {resp.status}: {text}")
    except Exception as e:
        results.add_fail("Ride Chat - Get Messages", f"Exception: {e}")

async def test_ai_support_chat(session, results):
    """Test AI support chatbot functionality"""
    print("\n🤖 Testing AI Support Chat...")
    
    # Login rider
    rider_token = await login_user(session, RIDER_EMAIL, RIDER_PASSWORD)
    if not rider_token:
        results.add_fail("AI Support - User Login", "Failed to login rider")
        return
    
    headers = {"Authorization": f"Bearer {rider_token}"}
    
    # Test 1: Send message to AI support
    try:
        async with session.post(f"{BACKEND_URL}/support/chat?message=Hola+necesito+ayuda", 
                               headers=headers) as resp:
            if resp.status == 200:
                data = await resp.json()
                session_id = data.get("session_id")
                response_msg = data.get("response", {})
                
                if session_id and response_msg and data.get("is_ai"):
                    results.add_pass("AI Support - Send Message")
                    
                    # Store session_id for next test
                    global test_session_id
                    test_session_id = session_id
                else:
                    results.add_fail("AI Support - Send Message", f"Invalid response structure: {data}")
            else:
                text = await resp.text()
                results.add_fail("AI Support - Send Message", f"HTTP {resp.status}: {text}")
    except Exception as e:
        results.add_fail("AI Support - Send Message", f"Exception: {e}")
    
    # Test 2: Send follow-up message with session_id
    try:
        if 'test_session_id' in globals():
            async with session.post(f"{BACKEND_URL}/support/chat?message=Cual+es+mi+saldo&session_id={test_session_id}", 
                                   headers=headers) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    if data.get("session_id") == test_session_id and data.get("is_ai"):
                        results.add_pass("AI Support - Follow-up Message")
                    else:
                        results.add_fail("AI Support - Follow-up Message", f"Session mismatch or not AI: {data}")
                else:
                    text = await resp.text()
                    results.add_fail("AI Support - Follow-up Message", f"HTTP {resp.status}: {text}")
        else:
            results.add_fail("AI Support - Follow-up Message", "No session_id from previous test")
    except Exception as e:
        results.add_fail("AI Support - Follow-up Message", f"Exception: {e}")
    
    # Test 3: Get support history
    try:
        async with session.get(f"{BACKEND_URL}/support/history", 
                              headers=headers) as resp:
            if resp.status == 200:
                data = await resp.json()
                messages = data.get("messages", [])
                sessions = data.get("sessions", [])
                
                if len(messages) >= 2 and len(sessions) >= 1:
                    results.add_pass("AI Support - Get History")
                else:
                    results.add_fail("AI Support - Get History", f"Expected messages and sessions, got {len(messages)} messages, {len(sessions)} sessions")
            else:
                text = await resp.text()
                results.add_fail("AI Support - Get History", f"HTTP {resp.status}: {text}")
    except Exception as e:
        results.add_fail("AI Support - Get History", f"Exception: {e}")

async def test_dispatcher_intervention(session, results):
    """Test dispatcher intervention functionality"""
    print("\n👨‍💼 Testing Dispatcher Intervention...")
    
    # Login admin (dispatcher)
    admin_token = await login_user(session, ADMIN_EMAIL, ADMIN_PASSWORD)
    if not admin_token:
        results.add_fail("Dispatcher - Admin Login", "Failed to login admin")
        return
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Test 1: Dispatcher intervenes in session
    try:
        if 'test_session_id' in globals():
            async with session.post(f"{BACKEND_URL}/dispatcher/intervene/{test_session_id}", 
                                   headers=headers) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    if data.get("status") == "success":
                        results.add_pass("Dispatcher - Intervene")
                    else:
                        results.add_fail("Dispatcher - Intervene", f"Unexpected response: {data}")
                else:
                    text = await resp.text()
                    results.add_fail("Dispatcher - Intervene", f"HTTP {resp.status}: {text}")
        else:
            results.add_fail("Dispatcher - Intervene", "No session_id available from AI support test")
    except Exception as e:
        results.add_fail("Dispatcher - Intervene", f"Exception: {e}")
    
    # Test 2: Dispatcher sends message
    try:
        if 'test_session_id' in globals():
            async with session.post(f"{BACKEND_URL}/dispatcher/send/{test_session_id}?message=Soy+el+despachador", 
                                   headers=headers) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    if data.get("status") == "sent" and data.get("message", {}).get("message") == "Soy el despachador":
                        results.add_pass("Dispatcher - Send Message")
                    else:
                        results.add_fail("Dispatcher - Send Message", f"Unexpected response: {data}")
                else:
                    text = await resp.text()
                    results.add_fail("Dispatcher - Send Message", f"HTTP {resp.status}: {text}")
        else:
            results.add_fail("Dispatcher - Send Message", "No session_id available")
    except Exception as e:
        results.add_fail("Dispatcher - Send Message", f"Exception: {e}")

async def test_health_check(session, results):
    """Test basic health check"""
    print("\n🏥 Testing Health Check...")
    
    try:
        async with session.get(f"{BACKEND_URL}/health") as resp:
            if resp.status == 200:
                data = await resp.json()
                if data.get("status") == "healthy":
                    results.add_pass("Health Check")
                else:
                    results.add_fail("Health Check", f"Unhealthy status: {data}")
            else:
                text = await resp.text()
                results.add_fail("Health Check", f"HTTP {resp.status}: {text}")
    except Exception as e:
        results.add_fail("Health Check", f"Exception: {e}")

async def main():
    """Run all tests"""
    print("🚀 Starting Moli Taxi App Backend Tests - Chat & AI Support Features")
    print(f"Backend URL: {BACKEND_URL}")
    
    results = TestResults()
    
    # Create session with timeout
    timeout = aiohttp.ClientTimeout(total=30)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        # Run tests
        await test_health_check(session, results)
        await test_ride_chat(session, results)
        await test_ai_support_chat(session, results)
        await test_dispatcher_intervention(session, results)
    
    # Print summary
    results.summary()
    
    # Exit with appropriate code
    sys.exit(0 if results.failed == 0 else 1)

if __name__ == "__main__":
    asyncio.run(main())