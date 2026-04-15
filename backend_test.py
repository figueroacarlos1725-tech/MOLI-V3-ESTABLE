#!/usr/bin/env python3
"""
Backend API Testing for Moli Trabajos Job Posting System
Testing the critical job posting endpoints that were returning 500 errors
"""

import requests
import json
import sys
from datetime import datetime

# API Configuration
BASE_URL = "https://taxify-clone.preview.emergentagent.com/api"

# Test credentials from review request
RIDER_EMAIL = "rider@test.com"
RIDER_PASSWORD = "test123456"

class JobPostingTester:
    def __init__(self):
        self.session = requests.Session()
        self.auth_token = None
        self.job_id = None
        
    def log(self, message, status="INFO"):
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {status}: {message}")
        
    def test_login(self):
        """Test rider login authentication"""
        self.log("Testing rider login...")
        
        url = f"{BASE_URL}/auth/login"
        data = {
            "email": RIDER_EMAIL,
            "password": RIDER_PASSWORD
        }
        
        try:
            response = self.session.post(url, json=data)
            self.log(f"Login response status: {response.status_code}")
            
            if response.status_code == 200:
                result = response.json()
                self.auth_token = result.get("access_token") or result.get("token")
                if self.auth_token:
                    self.session.headers.update({"Authorization": f"Bearer {self.auth_token}"})
                    self.log("✅ Login successful - token obtained")
                    self.log(f"User: {result.get('user', {}).get('name')} ({result.get('user', {}).get('user_type')})")
                    return True
                else:
                    self.log("❌ Login failed - no token in response", "ERROR")
                    self.log(f"Response: {result}", "ERROR")
                    return False
            else:
                self.log(f"❌ Login failed with status {response.status_code}", "ERROR")
                try:
                    self.log(f"Error response: {response.json()}", "ERROR")
                except:
                    self.log(f"Error response: {response.text}", "ERROR")
                return False
                
        except Exception as e:
            self.log(f"❌ Login request failed: {str(e)}", "ERROR")
            return False
    
    def test_job_post_creation(self):
        """Test job posting creation - the main endpoint that was returning 500 errors"""
        self.log("Testing job post creation...")
        
        url = f"{BASE_URL}/jobs/post"
        
        # Job data from review request
        job_data = {
            "category": "electricista",
            "title": "Arreglar enchufe",
            "description": "Necesito reparar un enchufe en la cocina",
            "budget": 2000,
            "location": {"latitude": -28.4696, "longitude": -65.7852},
            "address": "San Martín 152, Catamarca"
        }
        
        try:
            response = self.session.post(url, json=job_data)
            self.log(f"Job post creation response status: {response.status_code}")
            
            if response.status_code == 200:
                result = response.json()
                if result.get("status") == "created" and "job" in result:
                    self.job_id = result["job"].get("job_id")
                    self.log("✅ Job post created successfully")
                    self.log(f"Job ID: {self.job_id}")
                    self.log(f"Job title: {result['job'].get('title')}")
                    self.log(f"Job status: {result['job'].get('status')}")
                    return True
                else:
                    self.log("❌ Job creation failed - unexpected response format", "ERROR")
                    self.log(f"Response: {result}", "ERROR")
                    return False
            else:
                self.log(f"❌ Job creation failed with status {response.status_code}", "ERROR")
                try:
                    error_response = response.json()
                    self.log(f"Error response: {error_response}", "ERROR")
                except:
                    self.log(f"Error response: {response.text}", "ERROR")
                return False
                
        except Exception as e:
            self.log(f"❌ Job creation request failed: {str(e)}", "ERROR")
            return False
    
    def test_job_detail(self):
        """Test job detail retrieval"""
        if not self.job_id:
            self.log("❌ Cannot test job detail - no job_id available", "ERROR")
            return False
            
        self.log(f"Testing job detail retrieval for job_id: {self.job_id}")
        
        url = f"{BASE_URL}/jobs/detail/{self.job_id}"
        
        try:
            response = self.session.get(url)
            self.log(f"Job detail response status: {response.status_code}")
            
            if response.status_code == 200:
                result = response.json()
                if "job" in result:
                    job = result["job"]
                    self.log("✅ Job detail retrieved successfully")
                    self.log(f"Job title: {job.get('title')}")
                    self.log(f"Job category: {job.get('category')}")
                    self.log(f"Job budget: {job.get('budget')}")
                    self.log(f"Job address: {job.get('address')}")
                    self.log(f"Job status: {job.get('status')}")
                    return True
                else:
                    self.log("❌ Job detail failed - no job in response", "ERROR")
                    self.log(f"Response: {result}", "ERROR")
                    return False
            else:
                self.log(f"❌ Job detail failed with status {response.status_code}", "ERROR")
                try:
                    self.log(f"Error response: {response.json()}", "ERROR")
                except:
                    self.log(f"Error response: {response.text}", "ERROR")
                return False
                
        except Exception as e:
            self.log(f"❌ Job detail request failed: {str(e)}", "ERROR")
            return False
    
    def test_my_posts(self):
        """Test listing user's job posts"""
        self.log("Testing my job posts listing...")
        
        url = f"{BASE_URL}/jobs/my-posts"
        
        try:
            response = self.session.get(url)
            self.log(f"My posts response status: {response.status_code}")
            
            if response.status_code == 200:
                result = response.json()
                if "jobs" in result:
                    jobs = result["jobs"]
                    self.log(f"✅ My posts retrieved successfully - found {len(jobs)} jobs")
                    
                    # Check if our created job is in the list
                    if self.job_id:
                        found_job = next((job for job in jobs if job.get("job_id") == self.job_id), None)
                        if found_job:
                            self.log(f"✅ Created job found in my posts list")
                            self.log(f"Job title: {found_job.get('title')}")
                        else:
                            self.log("⚠️ Created job not found in my posts list", "WARNING")
                    
                    return True
                else:
                    self.log("❌ My posts failed - no jobs in response", "ERROR")
                    self.log(f"Response: {result}", "ERROR")
                    return False
            else:
                self.log(f"❌ My posts failed with status {response.status_code}", "ERROR")
                try:
                    self.log(f"Error response: {response.json()}", "ERROR")
                except:
                    self.log(f"Error response: {response.text}", "ERROR")
                return False
                
        except Exception as e:
            self.log(f"❌ My posts request failed: {str(e)}", "ERROR")
            return False
    
    def test_job_posts_list(self):
        """Test listing open job posts"""
        self.log("Testing job posts listing with status=open...")
        
        url = f"{BASE_URL}/jobs/posts?status=open"
        
        try:
            response = self.session.get(url)
            self.log(f"Job posts list response status: {response.status_code}")
            
            if response.status_code == 200:
                result = response.json()
                if "jobs" in result:
                    jobs = result["jobs"]
                    count = result.get("count", len(jobs))
                    self.log(f"✅ Job posts list retrieved successfully - found {count} open jobs")
                    
                    # Check if our created job is in the list
                    if self.job_id:
                        found_job = next((job for job in jobs if job.get("job_id") == self.job_id), None)
                        if found_job:
                            self.log(f"✅ Created job found in open jobs list")
                        else:
                            self.log("⚠️ Created job not found in open jobs list", "WARNING")
                    
                    return True
                else:
                    self.log("❌ Job posts list failed - no jobs in response", "ERROR")
                    self.log(f"Response: {result}", "ERROR")
                    return False
            else:
                self.log(f"❌ Job posts list failed with status {response.status_code}", "ERROR")
                try:
                    self.log(f"Error response: {response.json()}", "ERROR")
                except:
                    self.log(f"Error response: {response.text}", "ERROR")
                return False
                
        except Exception as e:
            self.log(f"❌ Job posts list request failed: {str(e)}", "ERROR")
            return False
    
    def run_all_tests(self):
        """Run all job posting tests"""
        self.log("=" * 60)
        self.log("STARTING MOLI TRABAJOS JOB POSTING TESTS")
        self.log("=" * 60)
        
        tests = [
            ("Login Authentication", self.test_login),
            ("Job Post Creation", self.test_job_post_creation),
            ("Job Detail Retrieval", self.test_job_detail),
            ("My Posts Listing", self.test_my_posts),
            ("Job Posts List", self.test_job_posts_list),
        ]
        
        results = []
        
        for test_name, test_func in tests:
            self.log(f"\n--- {test_name} ---")
            try:
                success = test_func()
                results.append((test_name, success))
            except Exception as e:
                self.log(f"❌ {test_name} failed with exception: {str(e)}", "ERROR")
                results.append((test_name, False))
        
        # Summary
        self.log("\n" + "=" * 60)
        self.log("TEST RESULTS SUMMARY")
        self.log("=" * 60)
        
        passed = 0
        failed = 0
        
        for test_name, success in results:
            status = "✅ PASS" if success else "❌ FAIL"
            self.log(f"{status}: {test_name}")
            if success:
                passed += 1
            else:
                failed += 1
        
        self.log(f"\nTotal: {len(results)} tests")
        self.log(f"Passed: {passed}")
        self.log(f"Failed: {failed}")
        
        if failed == 0:
            self.log("\n🎉 ALL TESTS PASSED! Job posting system is working correctly.")
            return True
        else:
            self.log(f"\n⚠️ {failed} test(s) failed. Please check the errors above.")
            return False

def main():
    """Main test execution"""
    tester = JobPostingTester()
    success = tester.run_all_tests()
    
    if success:
        print("\n✅ Job posting endpoint testing completed successfully!")
        sys.exit(0)
    else:
        print("\n❌ Job posting endpoint testing failed!")
        sys.exit(1)

if __name__ == "__main__":
    main()