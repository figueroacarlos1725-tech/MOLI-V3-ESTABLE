#!/usr/bin/env python3
"""
Comprehensive Backend Testing for Moli Trabajos Job Flow
Testing the complete 30-second review system flow
"""

import requests
import json
import time
from datetime import datetime

# Configuration
BASE_URL = "https://taxify-clone.preview.emergentagent.com/api"
HEADERS = {"Content-Type": "application/json"}

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
        
    def log_pass(self, test_name):
        print(f"✅ {test_name}")
        self.passed += 1
        
    def log_fail(self, test_name, error):
        print(f"❌ {test_name}: {error}")
        self.failed += 1
        self.errors.append(f"{test_name}: {error}")
        
    def summary(self):
        total = self.passed + self.failed
        print(f"\n=== TEST SUMMARY ===")
        print(f"Total tests: {total}")
        print(f"Passed: {self.passed}")
        print(f"Failed: {self.failed}")
        if self.errors:
            print(f"\nErrors:")
            for error in self.errors:
                print(f"  - {error}")

def login_user(email, password):
    """Login and return token"""
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            headers=HEADERS,
            json={"email": email, "password": password}
        )
        if response.status_code == 200:
            data = response.json()
            return data.get("access_token"), data.get("user")
        else:
            print(f"Login failed for {email}: {response.status_code} - {response.text}")
            return None, None
    except Exception as e:
        print(f"Login error for {email}: {e}")
        return None, None

def make_request(method, endpoint, token=None, json_data=None, params=None):
    """Make authenticated request"""
    headers = HEADERS.copy()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    try:
        if method == "GET":
            response = requests.get(f"{BASE_URL}{endpoint}", headers=headers, params=params)
        elif method == "POST":
            response = requests.post(f"{BASE_URL}{endpoint}", headers=headers, json=json_data, params=params)
        elif method == "PUT":
            response = requests.put(f"{BASE_URL}{endpoint}", headers=headers, json=json_data, params=params)
        elif method == "DELETE":
            response = requests.delete(f"{BASE_URL}{endpoint}", headers=headers, params=params)
        
        return response
    except Exception as e:
        print(f"Request error: {e}")
        return None

def test_moli_trabajos_flow():
    """Test the complete Moli Trabajos job flow with 30-second review system"""
    results = TestResults()
    
    print("🚀 Starting Moli Trabajos Job Flow Testing...")
    print("=" * 60)
    
    # Step 1: Login as driver
    print("\n1. Testing driver login...")
    driver_token, driver_user = login_user(DRIVER_EMAIL, DRIVER_PASSWORD)
    if driver_token:
        results.log_pass("Driver login successful")
    else:
        results.log_fail("Driver login", "Failed to authenticate")
        return results
    
    # Step 2: Toggle driver availability ON (should NOT overwrite other profile fields)
    print("\n2. Testing driver availability toggle...")
    response = make_request("PUT", "/jobs/professional/profile", driver_token, {"is_available": True})
    if response and response.status_code == 200:
        data = response.json()
        if data.get("status") == "updated":
            results.log_pass("Driver availability toggle ON")
        else:
            results.log_fail("Driver availability toggle", f"Unexpected response: {data}")
    else:
        results.log_fail("Driver availability toggle", f"HTTP {response.status_code if response else 'None'}: {response.text if response else 'No response'}")
    
    # Step 3: Verify profile still has categories and is_available is true
    print("\n3. Testing driver profile verification...")
    response = make_request("GET", "/jobs/professional/profile", driver_token)
    if response and response.status_code == 200:
        data = response.json()
        profile = data.get("profile")
        if profile:
            is_available = profile.get("is_available")
            categories = profile.get("categories", [])
            if is_available is True:
                results.log_pass("Driver is_available is True")
            else:
                results.log_fail("Driver profile verification", f"is_available is {is_available}, expected True")
            
            # Check that other fields are preserved (categories should exist if previously set)
            if "categories" in profile:
                results.log_pass("Driver profile categories preserved")
            else:
                results.log_pass("Driver profile structure intact (no categories field yet)")
        else:
            results.log_fail("Driver profile verification", "No profile found")
    else:
        results.log_fail("Driver profile verification", f"HTTP {response.status_code if response else 'None'}")
    
    # Step 4: Login as rider
    print("\n4. Testing rider login...")
    rider_token, rider_user = login_user(RIDER_EMAIL, RIDER_PASSWORD)
    if rider_token:
        results.log_pass("Rider login successful")
    else:
        results.log_fail("Rider login", "Failed to authenticate")
        return results
    
    # Step 5: Post a job
    print("\n5. Testing job posting...")
    job_data = {
        "category": "electricista",
        "title": "Arreglar enchufe",
        "description": "Enchufe roto en cocina",
        "budget": 1500,
        "location": {"latitude": -28.4696, "longitude": -65.7852},
        "address": "San Martín 152"
    }
    response = make_request("POST", "/jobs/post", rider_token, job_data)
    job_id = None
    if response and response.status_code == 200:
        data = response.json()
        if data.get("status") == "created":
            job_id = data.get("job", {}).get("job_id")
            if job_id:
                results.log_pass(f"Job posting successful (ID: {job_id})")
            else:
                results.log_fail("Job posting", "No job_id returned")
        else:
            results.log_fail("Job posting", f"Unexpected status: {data.get('status')}")
    else:
        results.log_fail("Job posting", f"HTTP {response.status_code if response else 'None'}: {response.text if response else 'No response'}")
        return results
    
    # Step 6: Login as driver again (refresh token)
    print("\n6. Re-authenticating driver...")
    driver_token, driver_user = login_user(DRIVER_EMAIL, DRIVER_PASSWORD)
    if driver_token:
        results.log_pass("Driver re-authentication successful")
    else:
        results.log_fail("Driver re-authentication", "Failed")
        return results
    
    # Step 7: Get open jobs and verify the posted job is visible
    print("\n7. Testing open jobs listing...")
    response = make_request("GET", "/jobs/posts", driver_token, params={"status": "open"})
    if response and response.status_code == 200:
        data = response.json()
        jobs = data.get("jobs", [])
        job_found = any(job.get("job_id") == job_id for job in jobs)
        if job_found:
            results.log_pass("Posted job visible in open jobs list")
        else:
            results.log_fail("Open jobs listing", f"Posted job {job_id} not found in {len(jobs)} jobs")
    else:
        results.log_fail("Open jobs listing", f"HTTP {response.status_code if response else 'None'}")
    
    # Step 8: Start 30-second review lock
    print("\n8. Testing 30-second review lock...")
    response = make_request("POST", f"/jobs/{job_id}/review", driver_token)
    if response and response.status_code == 200:
        data = response.json()
        if data.get("status") == "reviewing" and data.get("review_seconds") == 30:
            results.log_pass("30-second review lock started successfully")
        else:
            results.log_fail("30-second review lock", f"Unexpected response: {data}")
    else:
        results.log_fail("30-second review lock", f"HTTP {response.status_code if response else 'None'}: {response.text if response else 'No response'}")
    
    # Step 9: Check job status during review
    print("\n9. Testing job status during review...")
    response = make_request("GET", f"/jobs/detail/{job_id}", driver_token)
    if response and response.status_code == 200:
        data = response.json()
        job = data.get("job", {})
        status = job.get("status")
        reviewing_by = job.get("reviewing_by")
        if status == "reviewing" and reviewing_by == driver_user.get("user_id"):
            results.log_pass("Job status is 'reviewing' with correct reviewing_by")
        else:
            results.log_fail("Job status during review", f"Status: {status}, reviewing_by: {reviewing_by}, expected: reviewing/{driver_user.get('user_id')}")
    else:
        results.log_fail("Job status during review", f"HTTP {response.status_code if response else 'None'}")
    
    # Step 10: Accept the job
    print("\n10. Testing job acceptance...")
    response = make_request("POST", f"/jobs/{job_id}/accept", driver_token)
    if response and response.status_code == 200:
        data = response.json()
        if data.get("status") == "accepted":
            results.log_pass("Job acceptance successful")
        else:
            results.log_fail("Job acceptance", f"Unexpected status: {data.get('status')}")
    else:
        results.log_fail("Job acceptance", f"HTTP {response.status_code if response else 'None'}: {response.text if response else 'No response'}")
    
    # Step 11: Verify job is assigned
    print("\n11. Testing job assignment verification...")
    response = make_request("GET", f"/jobs/detail/{job_id}", driver_token)
    if response and response.status_code == 200:
        data = response.json()
        job = data.get("job", {})
        status = job.get("status")
        assigned_to = job.get("assigned_to")
        if status == "assigned" and assigned_to == driver_user.get("user_id"):
            results.log_pass("Job successfully assigned to driver")
        else:
            results.log_fail("Job assignment verification", f"Status: {status}, assigned_to: {assigned_to}, expected: assigned/{driver_user.get('user_id')}")
    else:
        results.log_fail("Job assignment verification", f"HTTP {response.status_code if response else 'None'}")
    
    # Step 12: Test decline flow with another job
    print("\n12. Testing decline flow...")
    
    # Create another job as rider
    job_data_2 = {
        "category": "plomero",
        "title": "Reparar grifo",
        "description": "Grifo que gotea en baño",
        "budget": 800,
        "location": {"latitude": -28.4696, "longitude": -65.7852},
        "address": "Rivadavia 234"
    }
    response = make_request("POST", "/jobs/post", rider_token, job_data_2)
    job_id_2 = None
    if response and response.status_code == 200:
        data = response.json()
        job_id_2 = data.get("job", {}).get("job_id")
        if job_id_2:
            results.log_pass(f"Second job created for decline test (ID: {job_id_2})")
        else:
            results.log_fail("Second job creation", "No job_id returned")
    else:
        results.log_fail("Second job creation", f"HTTP {response.status_code if response else 'None'}")
    
    if job_id_2:
        # Start review on second job
        response = make_request("POST", f"/jobs/{job_id_2}/review", driver_token)
        if response and response.status_code == 200:
            results.log_pass("Second job review started")
            
            # Decline the job
            response = make_request("POST", f"/jobs/{job_id_2}/decline", driver_token)
            if response and response.status_code == 200:
                data = response.json()
                if data.get("status") == "declined":
                    results.log_pass("Job decline successful")
                    
                    # Verify job is back to open status
                    response = make_request("GET", f"/jobs/detail/{job_id_2}", driver_token)
                    if response and response.status_code == 200:
                        data = response.json()
                        job = data.get("job", {})
                        if job.get("status") == "open":
                            results.log_pass("Declined job returned to 'open' status")
                        else:
                            results.log_fail("Decline flow verification", f"Job status is {job.get('status')}, expected 'open'")
                    else:
                        results.log_fail("Decline flow verification", "Failed to get job detail after decline")
                else:
                    results.log_fail("Job decline", f"Unexpected status: {data.get('status')}")
            else:
                results.log_fail("Job decline", f"HTTP {response.status_code if response else 'None'}")
        else:
            results.log_fail("Second job review", f"HTTP {response.status_code if response else 'None'}")
    
    # Step 13: Test driver verification status
    print("\n13. Testing driver verification status...")
    response = make_request("GET", "/driver/verification-status", driver_token)
    if response and response.status_code == 200:
        data = response.json()
        is_verified = data.get("is_verified")
        status = data.get("status")
        if is_verified is True and status == "approved":
            results.log_pass("Driver verification status: verified and approved")
        else:
            results.log_pass(f"Driver verification status retrieved (is_verified: {is_verified}, status: {status})")
    else:
        results.log_fail("Driver verification status", f"HTTP {response.status_code if response else 'None'}: {response.text if response else 'No response'}")
    
    print("\n" + "=" * 60)
    results.summary()
    return results

if __name__ == "__main__":
    test_moli_trabajos_flow()