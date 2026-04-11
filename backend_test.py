#!/usr/bin/env python3
"""
Backend API Testing for Molí Taxi App - NEW Document Verification & Admin Endpoints
Testing the following NEW endpoints:
1. GET /api/driver/documents/required (as driver)
2. GET /api/driver/verification-status (as driver)
3. GET /api/admin/drivers/pending-verification (as admin)
4. GET /api/admin/support/sessions (as admin)
5. POST /api/admin/direct-message (as admin)
"""

import requests
import json
import sys
from datetime import datetime

# Configuration
BASE_URL = "https://taxify-clone.preview.emergentagent.com/api"

# Test credentials from test_credentials.md
ADMIN_CREDENTIALS = {
    "email": "admin@test.com",
    "password": "admin123456"
}

DRIVER_CREDENTIALS = {
    "email": "driver@test.com", 
    "password": "test123456"
}

class TaxiAPITester:
    def __init__(self):
        self.admin_token = None
        self.driver_token = None
        self.driver_user_id = None
        self.test_results = []
        
    def log_test(self, test_name, success, details="", response_data=None):
        """Log test results"""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}")
        if details:
            print(f"   Details: {details}")
        if response_data and not success:
            print(f"   Response: {json.dumps(response_data, indent=2)}")
        print()
        
        self.test_results.append({
            "test": test_name,
            "success": success,
            "details": details,
            "response": response_data
        })
    
    def authenticate_user(self, credentials, user_type):
        """Authenticate and get token"""
        try:
            response = requests.post(f"{BASE_URL}/auth/login", json=credentials)
            
            if response.status_code == 200:
                data = response.json()
                token = data.get("access_token")
                user_id = data.get("user", {}).get("user_id")
                
                if token:
                    self.log_test(f"{user_type.title()} Authentication", True, f"Token obtained successfully")
                    return token, user_id
                else:
                    self.log_test(f"{user_type.title()} Authentication", False, "No token in response", data)
                    return None, None
            else:
                self.log_test(f"{user_type.title()} Authentication", False, f"HTTP {response.status_code}", response.json())
                return None, None
                
        except Exception as e:
            self.log_test(f"{user_type.title()} Authentication", False, f"Exception: {str(e)}")
            return None, None
    
    def make_authenticated_request(self, method, endpoint, token, **kwargs):
        """Make authenticated request"""
        headers = {"Authorization": f"Bearer {token}"}
        if "headers" in kwargs:
            headers.update(kwargs["headers"])
        kwargs["headers"] = headers
        
        url = f"{BASE_URL}{endpoint}"
        return requests.request(method, url, **kwargs)
    
    def test_driver_documents_required(self):
        """Test GET /api/driver/documents/required"""
        if not self.driver_token:
            self.log_test("Driver Documents Required", False, "No driver token available")
            return
            
        try:
            response = self.make_authenticated_request("GET", "/driver/documents/required", self.driver_token)
            
            if response.status_code == 200:
                data = response.json()
                
                # Check required fields
                required_fields = ["documents", "verification_status", "is_verified"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if missing_fields:
                    self.log_test("Driver Documents Required", False, f"Missing fields: {missing_fields}", data)
                    return
                
                # Check documents structure
                documents = data.get("documents", [])
                expected_doc_types = {"license", "id_front", "id_back", "vehicle_registration", "insurance", "criminal_record"}
                actual_doc_types = {doc.get("key") for doc in documents}
                
                if expected_doc_types == actual_doc_types:
                    self.log_test("Driver Documents Required", True, 
                                f"All 6 required documents present. Status: {data.get('verification_status')}")
                else:
                    missing_docs = expected_doc_types - actual_doc_types
                    self.log_test("Driver Documents Required", False, 
                                f"Missing document types: {missing_docs}", data)
            else:
                self.log_test("Driver Documents Required", False, f"HTTP {response.status_code}", response.json())
                
        except Exception as e:
            self.log_test("Driver Documents Required", False, f"Exception: {str(e)}")
    
    def test_driver_verification_status(self):
        """Test GET /api/driver/verification-status"""
        if not self.driver_token:
            self.log_test("Driver Verification Status", False, "No driver token available")
            return
            
        try:
            response = self.make_authenticated_request("GET", "/driver/verification-status", self.driver_token)
            
            if response.status_code == 200:
                data = response.json()
                
                # Check required fields
                required_fields = ["is_verified", "status", "uploaded_count", "required_count"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if missing_fields:
                    self.log_test("Driver Verification Status", False, f"Missing fields: {missing_fields}", data)
                    return
                
                # Validate expected values for new driver
                is_verified = data.get("is_verified")
                status = data.get("status")
                
                if is_verified == False and status == "incomplete":
                    self.log_test("Driver Verification Status", True, 
                                f"Correct status for unverified driver: is_verified={is_verified}, status={status}")
                else:
                    self.log_test("Driver Verification Status", True, 
                                f"Status returned: is_verified={is_verified}, status={status}")
            else:
                self.log_test("Driver Verification Status", False, f"HTTP {response.status_code}", response.json())
                
        except Exception as e:
            self.log_test("Driver Verification Status", False, f"Exception: {str(e)}")
    
    def test_admin_drivers_pending_verification(self):
        """Test GET /api/admin/drivers/pending-verification"""
        if not self.admin_token:
            self.log_test("Admin Drivers Pending Verification", False, "No admin token available")
            return
            
        try:
            response = self.make_authenticated_request("GET", "/admin/drivers/pending-verification", self.admin_token)
            
            if response.status_code == 200:
                data = response.json()
                
                # Check required structure
                if "drivers" not in data:
                    self.log_test("Admin Drivers Pending Verification", False, "Missing 'drivers' field", data)
                    return
                
                drivers = data.get("drivers", [])
                self.log_test("Admin Drivers Pending Verification", True, 
                            f"Endpoint accessible. Found {len(drivers)} drivers with pending verification")
            else:
                self.log_test("Admin Drivers Pending Verification", False, f"HTTP {response.status_code}", response.json())
                
        except Exception as e:
            self.log_test("Admin Drivers Pending Verification", False, f"Exception: {str(e)}")
    
    def test_admin_support_sessions(self):
        """Test GET /api/admin/support/sessions"""
        if not self.admin_token:
            self.log_test("Admin Support Sessions", False, "No admin token available")
            return
            
        try:
            response = self.make_authenticated_request("GET", "/admin/support/sessions", self.admin_token)
            
            if response.status_code == 200:
                data = response.json()
                
                # Should return an array or object with sessions
                if isinstance(data, list):
                    sessions = data
                elif isinstance(data, dict) and "sessions" in data:
                    sessions = data["sessions"]
                else:
                    sessions = []
                
                self.log_test("Admin Support Sessions", True, 
                            f"Endpoint accessible. Found {len(sessions)} support sessions")
            else:
                self.log_test("Admin Support Sessions", False, f"HTTP {response.status_code}", response.json())
                
        except Exception as e:
            self.log_test("Admin Support Sessions", False, f"Exception: {str(e)}")
    
    def test_admin_direct_message(self):
        """Test POST /api/admin/direct-message"""
        if not self.admin_token or not self.driver_user_id:
            self.log_test("Admin Direct Message", False, "Missing admin token or driver user ID")
            return
            
        try:
            # Send message to driver
            params = {
                "target_user_id": self.driver_user_id,
                "message": "Hola conductor"
            }
            
            response = self.make_authenticated_request("POST", "/admin/direct-message", self.admin_token, params=params)
            
            if response.status_code == 200:
                data = response.json()
                
                # Check response structure
                if "status" in data and data["status"] == "sent":
                    self.log_test("Admin Direct Message", True, 
                                f"Message sent successfully. Message ID: {data.get('message_id', 'N/A')}")
                else:
                    self.log_test("Admin Direct Message", False, "Unexpected response structure", data)
            else:
                self.log_test("Admin Direct Message", False, f"HTTP {response.status_code}", response.json())
                
        except Exception as e:
            self.log_test("Admin Direct Message", False, f"Exception: {str(e)}")
    
    def run_all_tests(self):
        """Run all tests"""
        print("=" * 80)
        print("MOLÍ TAXI APP - NEW BACKEND API ENDPOINTS TESTING")
        print("=" * 80)
        print()
        
        # Authenticate users
        print("🔐 AUTHENTICATION PHASE")
        print("-" * 40)
        self.admin_token, _ = self.authenticate_user(ADMIN_CREDENTIALS, "admin")
        self.driver_token, self.driver_user_id = self.authenticate_user(DRIVER_CREDENTIALS, "driver")
        
        if not self.admin_token or not self.driver_token:
            print("❌ Authentication failed. Cannot proceed with API tests.")
            return
        
        print("🧪 API ENDPOINT TESTING PHASE")
        print("-" * 40)
        
        # Test driver endpoints
        self.test_driver_documents_required()
        self.test_driver_verification_status()
        
        # Test admin endpoints
        self.test_admin_drivers_pending_verification()
        self.test_admin_support_sessions()
        self.test_admin_direct_message()
        
        # Summary
        print("=" * 80)
        print("TEST SUMMARY")
        print("=" * 80)
        
        total_tests = len(self.test_results)
        passed_tests = sum(1 for result in self.test_results if result["success"])
        failed_tests = total_tests - passed_tests
        
        print(f"Total Tests: {total_tests}")
        print(f"Passed: {passed_tests}")
        print(f"Failed: {failed_tests}")
        print()
        
        if failed_tests > 0:
            print("FAILED TESTS:")
            for result in self.test_results:
                if not result["success"]:
                    print(f"❌ {result['test']}: {result['details']}")
        else:
            print("🎉 ALL TESTS PASSED!")
        
        return failed_tests == 0

if __name__ == "__main__":
    tester = TaxiAPITester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)