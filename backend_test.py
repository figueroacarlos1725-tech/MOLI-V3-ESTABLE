#!/usr/bin/env python3
"""
Comprehensive Admin Management Endpoints Testing for Molí Taxi App
Tests all new admin management endpoints with proper authentication
"""

import requests
import json
import sys
from datetime import datetime

# Configuration
BACKEND_URL = "https://taxify-clone.preview.emergentagent.com/api"
ADMIN_EMAIL = "admin@test.com"
ADMIN_PASSWORD = "admin123456"

class AdminEndpointTester:
    def __init__(self):
        self.session = requests.Session()
        self.auth_token = None
        self.test_results = []
        self.new_user_id = None
        self.new_coupon_id = None
        
    def log_result(self, test_name, success, details="", response_data=None):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        result = {
            "test": test_name,
            "status": status,
            "details": details,
            "response_data": response_data,
            "timestamp": datetime.now().isoformat()
        }
        self.test_results.append(result)
        print(f"{status} {test_name}: {details}")
        if response_data and not success:
            print(f"   Response: {response_data}")
    
    def authenticate_admin(self):
        """Authenticate as admin and get Bearer token"""
        print("\n=== ADMIN AUTHENTICATION ===")
        
        try:
            response = self.session.post(
                f"{BACKEND_URL}/auth/login",
                json={
                    "email": ADMIN_EMAIL,
                    "password": ADMIN_PASSWORD
                },
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code == 200:
                data = response.json()
                if "access_token" in data:
                    self.auth_token = data["access_token"]
                    self.session.headers.update({
                        "Authorization": f"Bearer {self.auth_token}"
                    })
                    self.log_result("Admin Authentication", True, f"Token obtained successfully")
                    return True
                else:
                    self.log_result("Admin Authentication", False, "No access_token in response", data)
                    return False
            else:
                self.log_result("Admin Authentication", False, f"Status {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_result("Admin Authentication", False, f"Exception: {str(e)}")
            return False
    
    def test_user_management(self):
        """Test User Management endpoints"""
        print("\n=== USER MANAGEMENT TESTS ===")
        
        # 1. GET /api/admin/users - List all users
        try:
            response = self.session.get(f"{BACKEND_URL}/admin/users")
            if response.status_code == 200:
                data = response.json()
                user_count = len(data.get("users", []))
                self.log_result("List All Users", True, f"Retrieved {user_count} users")
            else:
                self.log_result("List All Users", False, f"Status {response.status_code}", response.text)
        except Exception as e:
            self.log_result("List All Users", False, f"Exception: {str(e)}")
        
        # 2. GET /api/admin/users?user_type=rider - Filter by type
        try:
            response = self.session.get(f"{BACKEND_URL}/admin/users?user_type=rider")
            if response.status_code == 200:
                data = response.json()
                rider_count = len(data.get("users", []))
                self.log_result("Filter Users by Type (rider)", True, f"Retrieved {rider_count} riders")
            else:
                self.log_result("Filter Users by Type (rider)", False, f"Status {response.status_code}", response.text)
        except Exception as e:
            self.log_result("Filter Users by Type (rider)", False, f"Exception: {str(e)}")
        
        # 3. POST /api/admin/users - Create new user
        new_user_data = {
            "name": "Test Conductor",
            "email": f"newdriver{datetime.now().strftime('%Y%m%d%H%M%S')}@test.com",  # Unique email
            "password": "pass123",
            "user_type": "driver",
            "phone": "1234567890"
        }
        
        try:
            response = self.session.post(
                f"{BACKEND_URL}/admin/users",
                json=new_user_data
            )
            if response.status_code in [200, 201]:
                data = response.json()
                # Handle both possible response formats
                if "user" in data:
                    self.new_user_id = data["user"].get("user_id")
                else:
                    self.new_user_id = data.get("user_id")
                self.log_result("Create New User", True, f"Created user with ID: {self.new_user_id}")
            else:
                self.log_result("Create New User", False, f"Status {response.status_code}", response.text)
        except Exception as e:
            self.log_result("Create New User", False, f"Exception: {str(e)}")
        
        if not self.new_user_id:
            print("⚠️  Cannot continue user-specific tests without new_user_id")
            return
        
        # 4. GET /api/admin/users/{new_user_id} - Get newly created user details
        try:
            response = self.session.get(f"{BACKEND_URL}/admin/users/{self.new_user_id}")
            if response.status_code == 200:
                data = response.json()
                user_name = data.get("name", "Unknown")
                self.log_result("Get User Details", True, f"Retrieved user: {user_name}")
            else:
                self.log_result("Get User Details", False, f"Status {response.status_code}", response.text)
        except Exception as e:
            self.log_result("Get User Details", False, f"Exception: {str(e)}")
        
        # 5. PUT /api/admin/users/{new_user_id} - Update name
        try:
            response = self.session.put(
                f"{BACKEND_URL}/admin/users/{self.new_user_id}",
                json={"name": "Conductor Actualizado"}
            )
            if response.status_code == 200:
                self.log_result("Update User Name", True, "Name updated successfully")
            else:
                self.log_result("Update User Name", False, f"Status {response.status_code}", response.text)
        except Exception as e:
            self.log_result("Update User Name", False, f"Exception: {str(e)}")
    
    def test_balance_management(self):
        """Test Balance Management endpoints"""
        print("\n=== BALANCE MANAGEMENT TESTS ===")
        
        if not self.new_user_id:
            print("⚠️  Skipping balance tests - no new_user_id available")
            return
        
        # 1. PUT /api/admin/users/{new_user_id}/balance - Set balance
        try:
            response = self.session.put(
                f"{BACKEND_URL}/admin/users/{self.new_user_id}/balance",
                json={
                    "amount": 5000,
                    "operation": "set",
                    "reason": "Recarga inicial"
                }
            )
            if response.status_code == 200:
                self.log_result("Set User Balance", True, "Balance set to 5000")
            else:
                self.log_result("Set User Balance", False, f"Status {response.status_code}", response.text)
        except Exception as e:
            self.log_result("Set User Balance", False, f"Exception: {str(e)}")
        
        # 2. PUT /api/admin/users/{new_user_id}/balance - Add balance
        try:
            response = self.session.put(
                f"{BACKEND_URL}/admin/users/{self.new_user_id}/balance",
                json={
                    "amount": 1000,
                    "operation": "add",
                    "reason": "Bonus"
                }
            )
            if response.status_code == 200:
                self.log_result("Add User Balance", True, "Added 1000 to balance")
            else:
                self.log_result("Add User Balance", False, f"Status {response.status_code}", response.text)
        except Exception as e:
            self.log_result("Add User Balance", False, f"Exception: {str(e)}")
        
        # 3. PUT /api/admin/users/{new_user_id}/debt - Set debt
        try:
            response = self.session.put(
                f"{BACKEND_URL}/admin/users/{self.new_user_id}/debt",
                json={
                    "amount": 500,
                    "operation": "set",
                    "reason": "Comision pendiente"
                }
            )
            if response.status_code == 200:
                self.log_result("Set User Debt", True, "Debt set to 500")
            else:
                self.log_result("Set User Debt", False, f"Status {response.status_code}", response.text)
        except Exception as e:
            self.log_result("Set User Debt", False, f"Exception: {str(e)}")
    
    def test_audit_log(self):
        """Test Audit Log endpoints"""
        print("\n=== AUDIT LOG TESTS ===")
        
        # 1. GET /api/admin/audit-log - Should show recent modifications
        try:
            response = self.session.get(f"{BACKEND_URL}/admin/audit-log")
            if response.status_code == 200:
                data = response.json()
                log_count = len(data.get("logs", []))
                self.log_result("Get Audit Log", True, f"Retrieved {log_count} audit entries")
            else:
                self.log_result("Get Audit Log", False, f"Status {response.status_code}", response.text)
        except Exception as e:
            self.log_result("Get Audit Log", False, f"Exception: {str(e)}")
        
        # 2. GET /api/admin/audit-log?target_user_id={new_user_id} - Filter by user
        if self.new_user_id:
            try:
                response = self.session.get(f"{BACKEND_URL}/admin/audit-log?target_user_id={self.new_user_id}")
                if response.status_code == 200:
                    data = response.json()
                    user_log_count = len(data.get("logs", []))
                    self.log_result("Filter Audit Log by User", True, f"Retrieved {user_log_count} entries for user")
                else:
                    self.log_result("Filter Audit Log by User", False, f"Status {response.status_code}", response.text)
            except Exception as e:
                self.log_result("Filter Audit Log by User", False, f"Exception: {str(e)}")
    
    def test_fare_configuration(self):
        """Test Fare Configuration endpoints"""
        print("\n=== FARE CONFIGURATION TESTS ===")
        
        # 1. GET /api/admin/fares - Get all fare configs
        try:
            response = self.session.get(f"{BACKEND_URL}/admin/fares")
            if response.status_code == 200:
                data = response.json()
                # Handle the actual response format
                if isinstance(data, dict) and "fares" in data:
                    fares_list = data["fares"]
                    fare_types = [fare.get("vehicle_type", "unknown") for fare in fares_list]
                elif isinstance(data, list):
                    fare_types = [fare.get("vehicle_type", f"fare_{i}") for i, fare in enumerate(data)]
                elif isinstance(data, dict):
                    fare_types = list(data.keys())
                else:
                    fare_types = ["unknown_format"]
                self.log_result("Get Fare Configurations", True, f"Retrieved fares for: {fare_types}")
            else:
                self.log_result("Get Fare Configurations", False, f"Status {response.status_code}", response.text)
        except Exception as e:
            self.log_result("Get Fare Configurations", False, f"Exception: {str(e)}")
        
        # 2. PUT /api/admin/fares/economy - Update economy fare
        try:
            response = self.session.put(
                f"{BACKEND_URL}/admin/fares/economy",
                json={
                    "base_fare": 600,
                    "per_km": 180,
                    "night_surcharge": 200,
                    "night_start_hour": 22,
                    "night_end_hour": 6,
                    "dynamic_pricing": True
                }
            )
            if response.status_code == 200:
                self.log_result("Update Economy Fare", True, "Economy fare updated successfully")
            else:
                self.log_result("Update Economy Fare", False, f"Status {response.status_code}", response.text)
        except Exception as e:
            self.log_result("Update Economy Fare", False, f"Exception: {str(e)}")
        
        # 3. GET /api/fares - Public endpoint check
        try:
            response = self.session.get(f"{BACKEND_URL}/fares")
            if response.status_code == 200:
                data = response.json()
                self.log_result("Public Fares Endpoint", True, "Public fares endpoint accessible")
            else:
                self.log_result("Public Fares Endpoint", False, f"Status {response.status_code}", response.text)
        except Exception as e:
            self.log_result("Public Fares Endpoint", False, f"Exception: {str(e)}")
    
    def test_coupons(self):
        """Test Coupon Management endpoints"""
        print("\n=== COUPON MANAGEMENT TESTS ===")
        
        # 1. POST /api/admin/coupons - Create coupon
        try:
            unique_code = f"MOLI{datetime.now().strftime('%H%M%S')}"
            response = self.session.post(
                f"{BACKEND_URL}/admin/coupons",
                json={
                    "code": unique_code,
                    "discount_type": "percentage",
                    "discount_value": 20,
                    "max_uses": 50,
                    "description": "20% descuento",
                    "expires_at": "2025-12-31T23:59:59.000Z"
                }
            )
            if response.status_code in [200, 201]:
                data = response.json()
                # Handle both possible response formats
                if "coupon" in data:
                    self.new_coupon_id = data["coupon"].get("coupon_id")
                else:
                    self.new_coupon_id = data.get("coupon_id")
                self.log_result("Create Coupon", True, f"Created coupon with ID: {self.new_coupon_id}")
            else:
                self.log_result("Create Coupon", False, f"Status {response.status_code}", response.text)
        except Exception as e:
            self.log_result("Create Coupon", False, f"Exception: {str(e)}")
        
        # 2. GET /api/admin/coupons - List coupons
        try:
            response = self.session.get(f"{BACKEND_URL}/admin/coupons")
            if response.status_code == 200:
                data = response.json()
                coupon_count = len(data.get("coupons", []))
                self.log_result("List Coupons", True, f"Retrieved {coupon_count} coupons")
            else:
                self.log_result("List Coupons", False, f"Status {response.status_code}", response.text)
        except Exception as e:
            self.log_result("List Coupons", False, f"Exception: {str(e)}")
        
        if not self.new_coupon_id:
            print("⚠️  Cannot continue coupon-specific tests without new_coupon_id")
            return
        
        # 3. PUT /api/admin/coupons/{coupon_id} - Update coupon
        try:
            response = self.session.put(
                f"{BACKEND_URL}/admin/coupons/{self.new_coupon_id}",
                json={
                    "code": "MOLI25",
                    "discount_type": "percentage",
                    "discount_value": 25,
                    "max_uses": 100,
                    "description": "25% descuento"
                }
            )
            if response.status_code == 200:
                self.log_result("Update Coupon", True, "Coupon updated successfully")
            else:
                self.log_result("Update Coupon", False, f"Status {response.status_code}", response.text)
        except Exception as e:
            self.log_result("Update Coupon", False, f"Exception: {str(e)}")
        
        # 4. DELETE /api/admin/coupons/{coupon_id} - Delete coupon
        try:
            response = self.session.delete(f"{BACKEND_URL}/admin/coupons/{self.new_coupon_id}")
            if response.status_code == 200:
                self.log_result("Delete Coupon", True, "Coupon deleted successfully")
            else:
                self.log_result("Delete Coupon", False, f"Status {response.status_code}", response.text)
        except Exception as e:
            self.log_result("Delete Coupon", False, f"Exception: {str(e)}")
    
    def test_commission_management(self):
        """Test Commission Management endpoints"""
        print("\n=== COMMISSION MANAGEMENT TESTS ===")
        
        if not self.new_user_id:
            print("⚠️  Skipping commission tests - no new_user_id available")
            return
        
        # PUT /api/admin/drivers/{new_user_id}/commission - Set commission
        try:
            response = self.session.put(
                f"{BACKEND_URL}/admin/drivers/{self.new_user_id}/commission",
                json={
                    "commission_type": "percentage",
                    "commission_value": 20
                }
            )
            if response.status_code == 200:
                self.log_result("Set Driver Commission", True, "Commission set to 20%")
            else:
                self.log_result("Set Driver Commission", False, f"Status {response.status_code}", response.text)
        except Exception as e:
            self.log_result("Set Driver Commission", False, f"Exception: {str(e)}")
    
    def test_driver_block_management(self):
        """Test Driver Block/Unblock endpoints"""
        print("\n=== DRIVER BLOCK MANAGEMENT TESTS ===")
        
        if not self.new_user_id:
            print("⚠️  Skipping driver block tests - no new_user_id available")
            return
        
        # 1. PUT /api/admin/drivers/{new_user_id}/block - Block driver
        try:
            response = self.session.put(
                f"{BACKEND_URL}/admin/drivers/{self.new_user_id}/block",
                json={
                    "block_type": "hours",
                    "block_duration": 24,
                    "reason": "Test block"
                }
            )
            if response.status_code == 200:
                self.log_result("Block Driver", True, "Driver blocked for 24 hours")
            else:
                self.log_result("Block Driver", False, f"Status {response.status_code}", response.text)
        except Exception as e:
            self.log_result("Block Driver", False, f"Exception: {str(e)}")
        
        # 2. PUT /api/admin/drivers/{new_user_id}/unblock - Unblock driver
        try:
            response = self.session.put(f"{BACKEND_URL}/admin/drivers/{self.new_user_id}/unblock")
            if response.status_code == 200:
                self.log_result("Unblock Driver", True, "Driver unblocked successfully")
            else:
                self.log_result("Unblock Driver", False, f"Status {response.status_code}", response.text)
        except Exception as e:
            self.log_result("Unblock Driver", False, f"Exception: {str(e)}")
    
    def test_driver_priority(self):
        """Test Driver Priority endpoints"""
        print("\n=== DRIVER PRIORITY TESTS ===")
        
        if not self.new_user_id:
            print("⚠️  Skipping driver priority tests - no new_user_id available")
            return
        
        # PUT /api/admin/drivers/{new_user_id}/priority - Set priority
        try:
            response = self.session.put(
                f"{BACKEND_URL}/admin/drivers/{self.new_user_id}/priority",
                json={"priority": 5}
            )
            if response.status_code == 200:
                self.log_result("Set Driver Priority", True, "Driver priority set to 5")
            else:
                self.log_result("Set Driver Priority", False, f"Status {response.status_code}", response.text)
        except Exception as e:
            self.log_result("Set Driver Priority", False, f"Exception: {str(e)}")
    
    def test_payment_config(self):
        """Test Payment Configuration endpoints"""
        print("\n=== PAYMENT CONFIGURATION TESTS ===")
        
        # 1. GET /api/admin/payment-config - Get payment config
        try:
            response = self.session.get(f"{BACKEND_URL}/admin/payment-config")
            if response.status_code == 200:
                data = response.json()
                mp_enabled = data.get("mercadopago_enabled", False)
                self.log_result("Get Payment Config", True, f"MercadoPago enabled: {mp_enabled}")
            else:
                self.log_result("Get Payment Config", False, f"Status {response.status_code}", response.text)
        except Exception as e:
            self.log_result("Get Payment Config", False, f"Exception: {str(e)}")
        
        # 2. PUT /api/admin/payment-config - Update payment config
        try:
            response = self.session.put(
                f"{BACKEND_URL}/admin/payment-config",
                json={
                    "mercadopago_enabled": True,
                    "mercadopago_public_key": "TEST-pk",
                    "mercadopago_access_token": "TEST-token-123456789"
                }
            )
            if response.status_code == 200:
                self.log_result("Update Payment Config", True, "Payment config updated successfully")
            else:
                self.log_result("Update Payment Config", False, f"Status {response.status_code}", response.text)
        except Exception as e:
            self.log_result("Update Payment Config", False, f"Exception: {str(e)}")
    
    def run_all_tests(self):
        """Run all admin endpoint tests"""
        print("🚀 Starting Comprehensive Admin Management Endpoints Testing")
        print(f"Backend URL: {BACKEND_URL}")
        print(f"Admin Email: {ADMIN_EMAIL}")
        
        # Authenticate first
        if not self.authenticate_admin():
            print("❌ Authentication failed. Cannot proceed with tests.")
            return False
        
        # Run all test suites
        self.test_user_management()
        self.test_balance_management()
        self.test_audit_log()
        self.test_fare_configuration()
        self.test_coupons()
        self.test_commission_management()
        self.test_driver_block_management()
        self.test_driver_priority()
        self.test_payment_config()
        
        # Summary
        self.print_summary()
        return True
    
    def print_summary(self):
        """Print test summary"""
        print("\n" + "="*60)
        print("🏁 ADMIN ENDPOINTS TESTING SUMMARY")
        print("="*60)
        
        passed = sum(1 for result in self.test_results if "✅ PASS" in result["status"])
        failed = sum(1 for result in self.test_results if "❌ FAIL" in result["status"])
        total = len(self.test_results)
        
        print(f"Total Tests: {total}")
        print(f"Passed: {passed} ✅")
        print(f"Failed: {failed} ❌")
        print(f"Success Rate: {(passed/total*100):.1f}%" if total > 0 else "0%")
        
        if failed > 0:
            print("\n❌ FAILED TESTS:")
            for result in self.test_results:
                if "❌ FAIL" in result["status"]:
                    print(f"  - {result['test']}: {result['details']}")
        
        print("\n✅ PASSED TESTS:")
        for result in self.test_results:
            if "✅ PASS" in result["status"]:
                print(f"  - {result['test']}: {result['details']}")

if __name__ == "__main__":
    tester = AdminEndpointTester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)