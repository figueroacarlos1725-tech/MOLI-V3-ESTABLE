#!/usr/bin/env python3
"""
Focused test for NEW Saved Addresses endpoints
Tests all scenarios from the review request
"""

import requests
import json
import time

BASE_URL = "https://taxify-clone.preview.emergentagent.com/api"
ADMIN_CREDS = {"email": "admin@test.com", "password": "admin123456"}
RIDER_CREDS = {"email": "rider@test.com", "password": "test123456"}

def test_saved_addresses():
    print("🚀 Testing NEW Saved Addresses Endpoints")
    
    # Step 1: Login as admin
    print("\n1. Login as admin...")
    response = requests.post(f"{BASE_URL}/auth/login", json=ADMIN_CREDS, timeout=30)
    if response.status_code != 200:
        print(f"❌ Admin login failed: {response.status_code}")
        return False
    
    admin_token = response.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    print("✅ Admin login successful")
    
    # Step 2: GET /api/places/saved-addresses - Should return empty initially
    print("\n2. GET /api/places/saved-addresses (should be empty)...")
    response = requests.get(f"{BASE_URL}/places/saved-addresses", headers=admin_headers, timeout=30)
    if response.status_code == 200:
        data = response.json()
        addresses = data.get("addresses", [])
        print(f"✅ Returns addresses array with {len(addresses)} items")
    else:
        print(f"❌ Failed: {response.status_code}")
        return False
    
    # Step 3: POST first address
    print("\n3. POST /api/places/saved-addresses (first address)...")
    address_data_1 = {
        "address": "San Martín 152, Catamarca",
        "latitude": -28.4696,
        "longitude": -65.7852,
        "label": "Terminal"
    }
    response = requests.post(f"{BASE_URL}/places/saved-addresses", 
                           headers=admin_headers, json=address_data_1, timeout=30)
    if response.status_code == 200:
        data = response.json()
        if data.get("status") == "created":
            addr_id_1 = data["addr_id"]
            print(f"✅ Created address with ID: {addr_id_1}")
        else:
            print(f"❌ Expected 'created', got '{data.get('status')}'")
            return False
    else:
        print(f"❌ Failed: {response.status_code}")
        return False
    
    # Step 4: POST same address again (test deduplication)
    print("\n4. POST same address again (test deduplication)...")
    response = requests.post(f"{BASE_URL}/places/saved-addresses", 
                           headers=admin_headers, json=address_data_1, timeout=30)
    if response.status_code == 200:
        data = response.json()
        if data.get("status") == "updated":
            print(f"✅ Deduplication works - status: updated, addr_id: {data['addr_id']}")
        else:
            print(f"❌ Expected 'updated', got '{data.get('status')}'")
            return False
    else:
        print(f"❌ Failed: {response.status_code}")
        return False
    
    # Step 5: POST different address
    print("\n5. POST different address...")
    address_data_2 = {
        "address": "Av. Güemes 800, Catamarca",
        "latitude": -28.4700,
        "longitude": -65.7800,
        "label": "Hospital"
    }
    response = requests.post(f"{BASE_URL}/places/saved-addresses", 
                           headers=admin_headers, json=address_data_2, timeout=30)
    if response.status_code == 200:
        data = response.json()
        if data.get("status") == "created":
            addr_id_2 = data["addr_id"]
            print(f"✅ Created second address with ID: {addr_id_2}")
        else:
            print(f"❌ Expected 'created', got '{data.get('status')}'")
            return False
    else:
        print(f"❌ Failed: {response.status_code}")
        return False
    
    # Step 6: GET addresses - should return 2 addresses sorted by use_count
    print("\n6. GET /api/places/saved-addresses (should return 2 addresses)...")
    response = requests.get(f"{BASE_URL}/places/saved-addresses", headers=admin_headers, timeout=30)
    if response.status_code == 200:
        data = response.json()
        addresses = data.get("addresses", [])
        if len(addresses) == 2:
            first_addr = addresses[0]
            second_addr = addresses[1]
            print(f"✅ Returns 2 addresses:")
            print(f"   First: {first_addr['address']} (use_count: {first_addr['use_count']})")
            print(f"   Second: {second_addr['address']} (use_count: {second_addr['use_count']})")
            
            # Check sorting by use_count
            if first_addr['use_count'] >= second_addr['use_count']:
                print("✅ Correctly sorted by use_count")
            else:
                print("⚠️  Sorting by use_count may not be working as expected")
        else:
            print(f"❌ Expected 2 addresses, got {len(addresses)}")
            return False
    else:
        print(f"❌ Failed: {response.status_code}")
        return False
    
    # Step 7: DELETE one address
    print(f"\n7. DELETE /api/places/saved-addresses/{addr_id_1}...")
    response = requests.delete(f"{BASE_URL}/places/saved-addresses/{addr_id_1}", 
                             headers=admin_headers, timeout=30)
    if response.status_code == 200:
        data = response.json()
        if data.get("status") == "deleted":
            print(f"✅ Successfully deleted address {addr_id_1}")
        else:
            print(f"❌ Expected 'deleted', got '{data.get('status')}'")
            return False
    else:
        print(f"❌ Failed: {response.status_code}")
        return False
    
    # Step 8: GET addresses - should return 1 address
    print("\n8. GET /api/places/saved-addresses (should return 1 address)...")
    response = requests.get(f"{BASE_URL}/places/saved-addresses", headers=admin_headers, timeout=30)
    if response.status_code == 200:
        data = response.json()
        addresses = data.get("addresses", [])
        if len(addresses) == 1:
            print(f"✅ Returns 1 address: {addresses[0]['address']}")
        else:
            print(f"❌ Expected 1 address, got {len(addresses)}")
            return False
    else:
        print(f"❌ Failed: {response.status_code}")
        return False
    
    # Step 9: Access control test - Login as rider
    print("\n9. Access control test - Login as rider...")
    response = requests.post(f"{BASE_URL}/auth/login", json=RIDER_CREDS, timeout=30)
    if response.status_code != 200:
        print(f"❌ Rider login failed: {response.status_code}")
        return False
    
    rider_token = response.json()["access_token"]
    rider_headers = {"Authorization": f"Bearer {rider_token}"}
    print("✅ Rider login successful")
    
    # Try to access saved addresses as rider
    print("\n10. GET /api/places/saved-addresses as rider (should return 403)...")
    response = requests.get(f"{BASE_URL}/places/saved-addresses", headers=rider_headers, timeout=30)
    if response.status_code == 403:
        data = response.json()
        detail = data.get("detail", "")
        if "Dispatch access required" in detail:
            print(f"✅ Correctly returns 403 with message: '{detail}'")
        else:
            print(f"✅ Correctly returns 403 (access denied)")
    else:
        print(f"❌ Expected 403, got {response.status_code}")
        return False
    
    # Step 11: Verify admin dashboard still works
    print("\n11. Verify admin dashboard still works...")
    response = requests.get(f"{BASE_URL}/admin/dashboard", headers=admin_headers, timeout=30)
    if response.status_code == 200:
        data = response.json()
        if "stats" in data:
            print("✅ Admin dashboard still working correctly")
        else:
            print("❌ Admin dashboard missing stats")
            return False
    else:
        print(f"❌ Admin dashboard failed: {response.status_code}")
        return False
    
    print("\n🎉 ALL SAVED ADDRESSES TESTS PASSED!")
    return True

if __name__ == "__main__":
    success = test_saved_addresses()
    exit(0 if success else 1)