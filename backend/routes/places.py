"""Places search & reverse geocode routes"""
from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime, timezone
import uuid

from database import db
from utils import get_current_user, get_settings
from places_helpers import (
    get_search_cache, save_search_cache, get_reverse_cache, save_reverse_cache,
    get_custom_places, google_places_search, nominatim_search,
    google_reverse, nominatim_reverse,
)

router = APIRouter()


@router.get("/api/places/search")
async def places_search(q: str, lat: float = -28.4696, lng: float = -65.7852):
    """Search places: custom places first, then cache, then external API"""
    query_normalized = q.strip().lower()
    
    # 1. Custom places first (always checked)
    custom_results = await get_custom_places(q, lat, lng)
    
    # 2. Check cache
    cached = await get_search_cache(query_normalized, lat, lng)
    if cached and cached.get("results"):
        # Merge: custom first, then cached
        all_results = custom_results + cached["results"]
        # Deduplicate by name
        seen = set()
        unique = []
        for r in all_results:
            key = r.get("name", "").lower()
            if key not in seen:
                seen.add(key)
                unique.append(r)
        return {"results": unique[:8], "source": "cache"}
    
    # 3. Fetch from external API
    settings = await get_settings()
    provider = settings.get("map_provider", "osm")
    
    try:
        if provider == "google":
            api_result = await google_places_search(q, lat, lng)
        else:
            api_result = await nominatim_search(q, lat, lng)
        
        api_results = api_result.get("results", [])
        
        # Save to cache
        if api_results:
            await save_search_cache(query_normalized, lat, lng, api_results)
        
        # Merge: custom first, then API
        all_results = custom_results + api_results
        seen = set()
        unique = []
        for r in all_results:
            key = r.get("name", "").lower()
            if key not in seen:
                seen.add(key)
                unique.append(r)
        
        return {"results": unique[:8], "source": "api"}
    except Exception as e:
        print(f"Places search error: {e}")
        # Return custom only if API fails
        return {"results": custom_results, "source": "custom_only"}


@router.get("/api/places/reverse")
async def places_reverse(lat: float, lng: float):
    """Reverse geocode with cache"""
    # 1. Check cache first
    cached = await get_reverse_cache(lat, lng)
    if cached and cached.get("address"):
        return {"address": cached["address"], "source": "cache"}
    
    # 2. Fetch from external API
    settings = await get_settings()
    provider = settings.get("map_provider", "osm")
    
    try:
        # Try Google first, fallback to Nominatim
        result = None
        if provider == "google":
            try:
                result = await google_reverse(lat, lng)
            except Exception:
                pass
        
        # If Google failed or returned unknown, try Nominatim
        if not result or result.get("address") == "Ubicación desconocida":
            result = await nominatim_reverse(lat, lng)
        
        address = result.get("address", "Ubicación desconocida")
        
        # Save to cache
        if address and address != "Ubicación desconocida":
            await save_reverse_cache(lat, lng, address)
        
        return {"address": address, "source": "api"}
    except Exception as e:
        print(f"Reverse geocode error: {e}")
        return {"address": "Ubicación desconocida", "source": "error"}
