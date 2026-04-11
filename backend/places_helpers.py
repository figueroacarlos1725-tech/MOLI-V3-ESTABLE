"""
Places search helper functions: cache management and external API calls.
"""
import os
import httpx
from datetime import datetime, timezone

from database import db
from utils import get_settings


# ─── Cache Helpers ──────────────────────────────────────────

async def get_search_cache(query_normalized: str, lat: float, lng: float):
    """Check if we have a cached search result"""
    lat_r = round(lat, 2)
    lng_r = round(lng, 2)
    cached = await db.cached_searches.find_one({
        "query": query_normalized,
        "lat_r": lat_r,
        "lng_r": lng_r,
    }, {"_id": 0})
    if cached:
        await db.cached_searches.update_one(
            {"query": query_normalized, "lat_r": lat_r, "lng_r": lng_r},
            {"$inc": {"hit_count": 1}, "$set": {"last_hit": datetime.now(timezone.utc)}}
        )
    return cached


async def save_search_cache(query_normalized: str, lat: float, lng: float, results: list):
    """Save search results to cache"""
    lat_r = round(lat, 2)
    lng_r = round(lng, 2)
    await db.cached_searches.update_one(
        {"query": query_normalized, "lat_r": lat_r, "lng_r": lng_r},
        {"$set": {
            "query": query_normalized,
            "lat_r": lat_r,
            "lng_r": lng_r,
            "results": results,
            "hit_count": 1,
            "created_at": datetime.now(timezone.utc),
            "last_hit": datetime.now(timezone.utc),
        }},
        upsert=True
    )


async def get_reverse_cache(lat: float, lng: float):
    """Check reverse geocode cache (rounded to ~100m precision)"""
    lat_r = round(lat, 3)
    lng_r = round(lng, 3)
    cached = await db.cached_reverse.find_one({
        "lat_r": lat_r, "lng_r": lng_r
    }, {"_id": 0})
    if cached:
        await db.cached_reverse.update_one(
            {"lat_r": lat_r, "lng_r": lng_r},
            {"$inc": {"hit_count": 1}}
        )
    return cached


async def save_reverse_cache(lat: float, lng: float, address: str):
    """Save reverse geocode result to cache"""
    lat_r = round(lat, 3)
    lng_r = round(lng, 3)
    await db.cached_reverse.update_one(
        {"lat_r": lat_r, "lng_r": lng_r},
        {"$set": {
            "lat_r": lat_r,
            "lng_r": lng_r,
            "latitude": lat,
            "longitude": lng,
            "address": address,
            "hit_count": 1,
            "created_at": datetime.now(timezone.utc),
        }},
        upsert=True
    )


async def get_custom_places(query: str, lat: float, lng: float):
    """Search admin-defined custom places matching the query"""
    q_lower = query.lower()
    custom = await db.custom_places.find({
        "is_active": True,
        "$or": [
            {"name": {"$regex": q_lower, "$options": "i"}},
            {"address": {"$regex": q_lower, "$options": "i"}},
            {"keywords": {"$regex": q_lower, "$options": "i"}},
            {"category": {"$regex": q_lower, "$options": "i"}},
        ]
    }, {"_id": 0}).to_list(10)

    for p in custom:
        dist = ((p.get("latitude", 0) - lat) ** 2 + (p.get("longitude", 0) - lng) ** 2) ** 0.5
        p["_dist"] = dist

    custom.sort(key=lambda x: x.get("_dist", 999))

    return [{
        "id": p.get("place_id", ""),
        "name": p.get("name", ""),
        "address": p.get("address", ""),
        "latitude": p.get("latitude", 0),
        "longitude": p.get("longitude", 0),
        "is_custom": True,
        "category": p.get("category", ""),
        "icon": p.get("icon", ""),
    } for p in custom[:5]]


# ─── External API Helpers ───────────────────────────────────

async def google_places_search(q: str, lat: float, lng: float):
    key = os.getenv("GOOGLE_MAPS_KEY", "")
    if not key:
        return {"results": []}

    async with httpx.AsyncClient(timeout=8) as client:
        url = f"https://maps.googleapis.com/maps/api/place/textsearch/json?query={q}&key={key}&language=es&region=ar&location={lat},{lng}&radius=100000"
        resp = await client.get(url)
        data = resp.json()

        results = []
        for p in (data.get("results") or [])[:6]:
            loc = p.get("geometry", {}).get("location", {})
            results.append({
                "id": p.get("place_id", ""),
                "name": p.get("name", ""),
                "address": p.get("formatted_address", ""),
                "latitude": loc.get("lat", 0),
                "longitude": loc.get("lng", 0),
            })
        return {"results": results}


async def nominatim_search(q: str, lat: float, lng: float):
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            url = f"https://nominatim.openstreetmap.org/search?format=json&q={q}&countrycodes=ar&limit=5&accept-language=es&viewbox=-68.5,-25.5,-64.5,-30.0&bounded=1"
            resp = await client.get(url, headers={"User-Agent": "MoliApp/1.0"})
            local = resp.json() if resp.status_code == 200 else []

            results = []
            ids = set()
            for f in (local or []):
                ids.add(str(f.get("place_id")))
                results.append({
                    "id": str(f.get("place_id")),
                    "name": (f.get("display_name") or "").split(",")[0],
                    "address": f.get("display_name", ""),
                    "latitude": float(f.get("lat", 0)),
                    "longitude": float(f.get("lon", 0)),
                })

            if len(results) < 3:
                url2 = f"https://nominatim.openstreetmap.org/search?format=json&q={q}&countrycodes=ar&limit=4&accept-language=es"
                resp2 = await client.get(url2, headers={"User-Agent": "MoliApp/1.0"})
                broad = resp2.json() if resp2.status_code == 200 else []
                for f in (broad or []):
                    pid = str(f.get("place_id"))
                    if pid not in ids:
                        results.append({
                            "id": pid,
                            "name": (f.get("display_name") or "").split(",")[0],
                            "address": f.get("display_name", ""),
                            "latitude": float(f.get("lat", 0)),
                            "longitude": float(f.get("lon", 0)),
                        })

            return {"results": results[:6]}
    except Exception as e:
        print(f"Nominatim search error: {e}")
        return {"results": []}


async def google_reverse(lat: float, lng: float):
    key = os.getenv("GOOGLE_MAPS_KEY", "")
    if not key:
        return {"address": "Ubicación desconocida"}

    async with httpx.AsyncClient(timeout=8) as client:
        url = f"https://maps.googleapis.com/maps/api/geocode/json?latlng={lat},{lng}&key={key}&language=es"
        resp = await client.get(url)
        data = resp.json()

        if data.get("results"):
            r = data["results"][0]
            addr = r.get("formatted_address", "Ubicación desconocida")
            parts = addr.split(",")
            short = ", ".join(p.strip() for p in parts[:2]) if len(parts) > 2 else addr
            return {"address": short}
        return {"address": "Ubicación desconocida"}


async def nominatim_reverse(lat: float, lng: float):
    async with httpx.AsyncClient(timeout=8) as client:
        url = f"https://nominatim.openstreetmap.org/reverse?format=json&lat={lat}&lon={lng}&accept-language=es&zoom=18"
        resp = await client.get(url, headers={"User-Agent": "MoliApp/1.0"})
        data = resp.json()

        if data.get("address"):
            a = data["address"]
            street = a.get("road") or a.get("pedestrian") or ""
            number = a.get("house_number") or ""
            city = a.get("city") or a.get("town") or a.get("village") or ""
            parts = [p for p in [street, number, city] if p]
            return {"address": ", ".join(parts) or "Ubicación desconocida"}
        return {"address": (data.get("display_name") or "Ubicación desconocida").split(",")[0]}
