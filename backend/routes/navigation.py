"""Navigation routes - Route fetching from Google/Mapbox alternating randomly"""
from fastapi import APIRouter, HTTPException, Depends, Query
import os
import random
import httpx
import math

from utils import get_current_user, get_settings

router = APIRouter()


def decode_google_polyline(encoded: str):
    """Decode Google encoded polyline to list of [lat, lng]"""
    points = []
    index = lat = lng = 0
    while index < len(encoded):
        for attr in ['lat', 'lng']:
            shift = result = 0
            while True:
                b = ord(encoded[index]) - 63
                index += 1
                result |= (b & 0x1F) << shift
                shift += 5
                if b < 0x20:
                    break
            val = ~(result >> 1) if result & 1 else (result >> 1)
            if attr == 'lat':
                lat += val
            else:
                lng += val
        points.append([lat / 1e5, lng / 1e5])
    return points


def decode_mapbox_geometry(geometry: dict):
    """Decode Mapbox geometry (GeoJSON) to [[lat,lng],...]"""
    if geometry.get("type") == "LineString":
        return [[c[1], c[0]] for c in geometry["coordinates"]]
    return []


@router.get("/api/navigation/route")
async def get_navigation_route(
    origin_lat: float = Query(...),
    origin_lng: float = Query(...),
    dest_lat: float = Query(...),
    dest_lng: float = Query(...),
    user: dict = Depends(get_current_user),
):
    """Get navigation route alternating between Google and Mapbox"""
    settings = await get_settings()
    google_key = settings.get("google_maps_key") or os.getenv("GOOGLE_MAPS_KEY", "")
    mapbox_token = settings.get("mapbox_key") or os.getenv("MAPBOX_TOKEN", "")

    # Build provider list
    providers = []
    if google_key:
        providers.append("google")
    if mapbox_token:
        providers.append("mapbox")

    if not providers:
        raise HTTPException(status_code=400, detail="No navigation provider configured")

    # Random selection
    provider = random.choice(providers)
    route_data = None

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            if provider == "google":
                route_data = await _fetch_google_route(client, google_key, origin_lat, origin_lng, dest_lat, dest_lng)
            else:
                route_data = await _fetch_mapbox_route(client, mapbox_token, origin_lat, origin_lng, dest_lat, dest_lng)
    except Exception as e:
        print(f"Navigation {provider} error: {e}")
        # Fallback to other provider
        other = [p for p in providers if p != provider]
        if other:
            try:
                async with httpx.AsyncClient(timeout=10) as client:
                    if other[0] == "google":
                        route_data = await _fetch_google_route(client, google_key, origin_lat, origin_lng, dest_lat, dest_lng)
                    else:
                        route_data = await _fetch_mapbox_route(client, mapbox_token, origin_lat, origin_lng, dest_lat, dest_lng)
                    provider = other[0]
            except Exception as e2:
                print(f"Navigation fallback error: {e2}")

    if not route_data:
        raise HTTPException(status_code=500, detail="No se pudo obtener la ruta")

    return {
        "provider": provider,
        "route": route_data["polyline"],
        "distance_km": route_data["distance_km"],
        "duration_min": route_data["duration_min"],
        "steps": route_data["steps"],
    }


async def _fetch_google_route(client, key, olat, olng, dlat, dlng):
    url = f"https://maps.googleapis.com/maps/api/directions/json?origin={olat},{olng}&destination={dlat},{dlng}&key={key}&language=es&mode=driving"
    resp = await client.get(url)
    data = resp.json()

    if data.get("status") != "OK" or not data.get("routes"):
        raise Exception(f"Google Directions error: {data.get('status')}")

    route = data["routes"][0]
    leg = route["legs"][0]

    polyline = decode_google_polyline(route["overview_polyline"]["points"])
    distance = leg["distance"]["value"] / 1000  # meters to km
    duration = leg["duration"]["value"] / 60  # seconds to min

    steps = []
    for step in leg.get("steps", []):
        steps.append({
            "instruction": step.get("html_instructions", "").replace("<b>", "").replace("</b>", "").replace("<div>", " ").replace("</div>", ""),
            "distance": step["distance"]["text"],
            "duration": step["duration"]["text"],
            "maneuver": step.get("maneuver", ""),
        })

    return {"polyline": polyline, "distance_km": round(distance, 2), "duration_min": round(duration, 1), "steps": steps}


async def _fetch_mapbox_route(client, token, olat, olng, dlat, dlng):
    url = f"https://api.mapbox.com/directions/v5/mapbox/driving/{olng},{olat};{dlng},{dlat}?access_token={token}&geometries=geojson&steps=true&language=es&overview=full"
    resp = await client.get(url)
    data = resp.json()

    if not data.get("routes"):
        raise Exception(f"Mapbox Directions error: {data.get('message', 'No routes')}")

    route = data["routes"][0]
    polyline = decode_mapbox_geometry(route["geometry"])
    distance = route["distance"] / 1000
    duration = route["duration"] / 60

    steps = []
    for leg in route.get("legs", []):
        for step in leg.get("steps", []):
            maneuver = step.get("maneuver", {})
            steps.append({
                "instruction": maneuver.get("instruction", ""),
                "distance": f"{step['distance']:.0f} m" if step["distance"] < 1000 else f"{step['distance']/1000:.1f} km",
                "duration": f"{step['duration']/60:.0f} min",
                "maneuver": maneuver.get("type", ""),
            })

    return {"polyline": polyline, "distance_km": round(distance, 2), "duration_min": round(duration, 1), "steps": steps}
