#!/usr/bin/env python3
"""
Backend Testing for WhatsApp Integration API Endpoints
Tests the new WhatsApp integration endpoints without affecting existing functionality.
"""

import asyncio
import httpx
import json
from datetime import datetime

# Configuration
BASE_URL = "https://taxify-clone.preview.emergentagent.com"
API_KEY = "moli-whatsapp-2025"
HEADERS_WITH_KEY = {"X-API-Key": API_KEY}
HEADERS_WITHOUT_KEY = {}

# Test data
TEST_PICKUP = {
    "latitude": -28.4696,
    "longitude": -65.7852,
    "address": "Centro Catamarca"
}

TEST_DROPOFF = {
    "latitude": -28.48,
    "longitude": -65.79,
    "address": "Parque de los Niños"
}

TEST_PHONE = "+5493834001234"
TEST_PASSENGER_NAME = "Test WhatsApp"

class WhatsAppAPITester:
    def __init__(self):
        self.client = httpx.AsyncClient(timeout=30.0)
        self.test_results = []
        
    async def log_test(self, test_name, success, details, response_data=None):
        """Log test results"""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}")
        if details:
            print(f"   Details: {details}")
        if response_data and not success:
            print(f"   Response: {response_data}")
        print()
        
        self.test_results.append({
            "test": test_name,
            "success": success,
            "details": details,
            "response": response_data
        })
    
    async def test_whatsapp_estimate(self):
        """Test 1: POST /api/whatsapp/estimate"""
        try:
            payload = {
                "pickup": TEST_PICKUP,
                "dropoff": TEST_DROPOFF
            }
            
            response = await self.client.post(
                f"{BASE_URL}/api/whatsapp/estimate",
                json=payload,
                headers=HEADERS_WITH_KEY
            )
            
            if response.status_code == 200:
                data = response.json()
                required_fields = ["status", "distance_km", "duration_min", "estimates"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if missing_fields:
                    await self.log_test(
                        "POST /api/whatsapp/estimate",
                        False,
                        f"Missing required fields: {missing_fields}",
                        data
                    )
                    return False
                
                # Check estimates array structure
                if not data.get("estimates") or not isinstance(data["estimates"], list):
                    await self.log_test(
                        "POST /api/whatsapp/estimate",
                        False,
                        "estimates field should be a non-empty array",
                        data
                    )
                    return False
                
                # Check first estimate structure
                estimate = data["estimates"][0]
                estimate_fields = ["vehicle_type", "display_name", "price", "currency"]
                missing_estimate_fields = [field for field in estimate_fields if field not in estimate]
                
                if missing_estimate_fields:
                    await self.log_test(
                        "POST /api/whatsapp/estimate",
                        False,
                        f"Missing estimate fields: {missing_estimate_fields}",
                        data
                    )
                    return False
                
                await self.log_test(
                    "POST /api/whatsapp/estimate",
                    True,
                    f"Returns {len(data['estimates'])} estimates, distance: {data['distance_km']}km, duration: {data['duration_min']}min"
                )
                return True
            else:
                await self.log_test(
                    "POST /api/whatsapp/estimate",
                    False,
                    f"HTTP {response.status_code}",
                    response.text
                )
                return False
                
        except Exception as e:
            await self.log_test(
                "POST /api/whatsapp/estimate",
                False,
                f"Exception: {str(e)}"
            )
            return False
    
    async def test_whatsapp_geocode(self):
        """Test 2: GET /api/whatsapp/geocode"""
        try:
            response = await self.client.get(
                f"{BASE_URL}/api/whatsapp/geocode",
                params={"address": "Caseros 670 Catamarca"},
                headers=HEADERS_WITH_KEY
            )
            
            if response.status_code == 200:
                data = response.json()
                required_fields = ["status", "results"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if missing_fields:
                    await self.log_test(
                        "GET /api/whatsapp/geocode",
                        False,
                        f"Missing required fields: {missing_fields}",
                        data
                    )
                    return False
                
                # Check results array
                if not isinstance(data.get("results"), list):
                    await self.log_test(
                        "GET /api/whatsapp/geocode",
                        False,
                        "results field should be an array",
                        data
                    )
                    return False
                
                # If results exist, check structure
                if data["results"]:
                    result = data["results"][0]
                    result_fields = ["latitude", "longitude", "address"]
                    missing_result_fields = [field for field in result_fields if field not in result]
                    
                    if missing_result_fields:
                        await self.log_test(
                            "GET /api/whatsapp/geocode",
                            False,
                            f"Missing result fields: {missing_result_fields}",
                            data
                        )
                        return False
                
                await self.log_test(
                    "GET /api/whatsapp/geocode",
                    True,
                    f"Returns {len(data['results'])} geocoding results"
                )
                return True
            else:
                await self.log_test(
                    "GET /api/whatsapp/geocode",
                    False,
                    f"HTTP {response.status_code}",
                    response.text
                )
                return False
                
        except Exception as e:
            await self.log_test(
                "GET /api/whatsapp/geocode",
                False,
                f"Exception: {str(e)}"
            )
            return False
    
    async def test_whatsapp_request_ride(self):
        """Test 3: POST /api/whatsapp/request-ride"""
        try:
            payload = {
                "phone": TEST_PHONE,
                "passenger_name": TEST_PASSENGER_NAME,
                "pickup": TEST_PICKUP,
                "dropoff": TEST_DROPOFF,
                "vehicle_type": "economy"
            }
            
            response = await self.client.post(
                f"{BASE_URL}/api/whatsapp/request-ride",
                json=payload,
                headers=HEADERS_WITH_KEY
            )
            
            if response.status_code == 200:
                data = response.json()
                required_fields = ["status", "request_id", "estimated_fare"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if missing_fields:
                    await self.log_test(
                        "POST /api/whatsapp/request-ride",
                        False,
                        f"Missing required fields: {missing_fields}",
                        data
                    )
                    return False, None
                
                await self.log_test(
                    "POST /api/whatsapp/request-ride",
                    True,
                    f"Created ride request {data['request_id']}, fare: ${data['estimated_fare']}"
                )
                return True, data["request_id"]
            else:
                await self.log_test(
                    "POST /api/whatsapp/request-ride",
                    False,
                    f"HTTP {response.status_code}",
                    response.text
                )
                return False, None
                
        except Exception as e:
            await self.log_test(
                "POST /api/whatsapp/request-ride",
                False,
                f"Exception: {str(e)}"
            )
            return False, None
    
    async def test_whatsapp_rides_by_phone(self):
        """Test 4: GET /api/whatsapp/rides-by-phone"""
        try:
            response = await self.client.get(
                f"{BASE_URL}/api/whatsapp/rides-by-phone/{TEST_PHONE}",
                headers=HEADERS_WITH_KEY
            )
            
            if response.status_code == 200:
                data = response.json()
                required_fields = ["status"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if missing_fields:
                    await self.log_test(
                        "GET /api/whatsapp/rides-by-phone",
                        False,
                        f"Missing required fields: {missing_fields}",
                        data
                    )
                    return False
                
                # Check if rider_id exists (should exist after request-ride test)
                rider_info = ""
                if "rider_id" in data:
                    rider_info = f", rider_id: {data['rider_id']}"
                
                active_info = ""
                if "active_request" in data and data["active_request"]:
                    active_info = f", active request: {data['active_request'].get('request_id', 'unknown')}"
                elif "active_ride" in data and data["active_ride"]:
                    active_info = f", active ride: {data['active_ride'].get('ride_id', 'unknown')}"
                
                await self.log_test(
                    "GET /api/whatsapp/rides-by-phone",
                    True,
                    f"Returns rider info{rider_info}{active_info}"
                )
                return True
            else:
                await self.log_test(
                    "GET /api/whatsapp/rides-by-phone",
                    False,
                    f"HTTP {response.status_code}",
                    response.text
                )
                return False
                
        except Exception as e:
            await self.log_test(
                "GET /api/whatsapp/rides-by-phone",
                False,
                f"Exception: {str(e)}"
            )
            return False
    
    async def test_without_api_key(self):
        """Test 5: Test without API key - should return 422 (missing header)"""
        try:
            payload = {
                "pickup": TEST_PICKUP,
                "dropoff": TEST_DROPOFF
            }
            
            response = await self.client.post(
                f"{BASE_URL}/api/whatsapp/estimate",
                json=payload,
                headers=HEADERS_WITHOUT_KEY
            )
            
            if response.status_code == 422:
                await self.log_test(
                    "POST /api/whatsapp/estimate (no API key)",
                    True,
                    "Correctly returns 422 for missing required header"
                )
                return True
            else:
                await self.log_test(
                    "POST /api/whatsapp/estimate (no API key)",
                    False,
                    f"Expected 422, got HTTP {response.status_code}",
                    response.text
                )
                return False
                
        except Exception as e:
            await self.log_test(
                "POST /api/whatsapp/estimate (no API key)",
                False,
                f"Exception: {str(e)}"
            )
            return False
    
    async def test_invalid_api_key(self):
        """Test 5b: Test with invalid API key - should return 401"""
        try:
            payload = {
                "pickup": TEST_PICKUP,
                "dropoff": TEST_DROPOFF
            }
            
            invalid_headers = {"X-API-Key": "invalid-key-123"}
            
            response = await self.client.post(
                f"{BASE_URL}/api/whatsapp/estimate",
                json=payload,
                headers=invalid_headers
            )
            
            if response.status_code == 401:
                await self.log_test(
                    "POST /api/whatsapp/estimate (invalid API key)",
                    True,
                    "Correctly returns 401 Unauthorized for invalid key"
                )
                return True
            else:
                await self.log_test(
                    "POST /api/whatsapp/estimate (invalid API key)",
                    False,
                    f"Expected 401, got HTTP {response.status_code}",
                    response.text
                )
                return False
                
        except Exception as e:
            await self.log_test(
                "POST /api/whatsapp/estimate (invalid API key)",
                False,
                f"Exception: {str(e)}"
            )
            return False
    
    async def test_existing_auth_endpoint(self):
        """Test 6: Test existing endpoints still work"""
        try:
            payload = {
                "email": "admin@test.com",
                "password": "admin123456"
            }
            
            response = await self.client.post(
                f"{BASE_URL}/api/auth/login",
                json=payload
            )
            
            if response.status_code == 200:
                data = response.json()
                if "access_token" in data:
                    await self.log_test(
                        "POST /api/auth/login (existing endpoint)",
                        True,
                        "Existing auth endpoint working correctly"
                    )
                    return True
                else:
                    await self.log_test(
                        "POST /api/auth/login (existing endpoint)",
                        False,
                        "Missing access_token in response",
                        data
                    )
                    return False
            else:
                await self.log_test(
                    "POST /api/auth/login (existing endpoint)",
                    False,
                    f"HTTP {response.status_code}",
                    response.text
                )
                return False
                
        except Exception as e:
            await self.log_test(
                "POST /api/auth/login (existing endpoint)",
                False,
                f"Exception: {str(e)}"
            )
            return False
    
    async def run_all_tests(self):
        """Run all WhatsApp integration tests"""
        print("🚀 Starting WhatsApp Integration API Tests")
        print(f"Base URL: {BASE_URL}")
        print(f"API Key: {API_KEY}")
        print("=" * 60)
        print()
        
        # Test 1: Estimate endpoint
        test1_success = await self.test_whatsapp_estimate()
        
        # Test 2: Geocode endpoint
        test2_success = await self.test_whatsapp_geocode()
        
        # Test 3: Request ride endpoint
        test3_success, request_id = await self.test_whatsapp_request_ride()
        
        # Test 4: Rides by phone endpoint
        test4_success = await self.test_whatsapp_rides_by_phone()
        
        # Test 5: No API key test
        test5_success = await self.test_without_api_key()
        
        # Test 5b: Invalid API key test
        test5b_success = await self.test_invalid_api_key()
        
        # Test 6: Existing endpoint test
        test6_success = await self.test_existing_auth_endpoint()
        
        # Summary
        print("=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        
        total_tests = len(self.test_results)
        passed_tests = sum(1 for result in self.test_results if result["success"])
        failed_tests = total_tests - passed_tests
        
        print(f"Total Tests: {total_tests}")
        print(f"Passed: {passed_tests} ✅")
        print(f"Failed: {failed_tests} ❌")
        print()
        
        if failed_tests > 0:
            print("FAILED TESTS:")
            for result in self.test_results:
                if not result["success"]:
                    print(f"❌ {result['test']}: {result['details']}")
            print()
        
        # Test specific scenarios
        print("🔍 SPECIFIC TEST SCENARIOS:")
        print(f"1. WhatsApp estimate endpoint: {'✅' if test1_success else '❌'}")
        print(f"2. WhatsApp geocode endpoint: {'✅' if test2_success else '❌'}")
        print(f"3. WhatsApp request-ride endpoint: {'✅' if test3_success else '❌'}")
        print(f"4. WhatsApp rides-by-phone endpoint: {'✅' if test4_success else '❌'}")
        print(f"5. API key authentication (missing header = 422): {'✅' if test5_success else '❌'}")
        print(f"6. API key authentication (invalid key = 401): {'✅' if test5b_success else '❌'}")
        print(f"7. Existing endpoints not broken: {'✅' if test6_success else '❌'}")
        
        if request_id:
            print(f"\n📝 Created test ride request: {request_id}")
        
        await self.client.aclose()
        
        return passed_tests == total_tests

async def main():
    """Main test runner"""
    tester = WhatsAppAPITester()
    success = await tester.run_all_tests()
    
    if success:
        print("\n🎉 ALL TESTS PASSED! WhatsApp integration is working correctly.")
        return 0
    else:
        print("\n💥 SOME TESTS FAILED! Check the details above.")
        return 1

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    exit(exit_code)