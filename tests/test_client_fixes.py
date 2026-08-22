"""Focused regressions for the client QA blockers."""
import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from routes import marketplace, places


def test_places_falls_back_to_osm_when_google_returns_no_results(monkeypatch):
    async def empty_custom(*_): return []
    async def empty_cache(*_): return None
    async def google(*_): return {"results": []}
    async def osm(*_):
        return {"results": [{"id": "catamarca", "name": "San Fernando del Valle de Catamarca"}]}
    async def settings(): return {"map_provider": "google"}
    async def save(*_): return None

    monkeypatch.setattr(places, "get_custom_places", empty_custom)
    monkeypatch.setattr(places, "get_search_cache", empty_cache)
    monkeypatch.setattr(places, "google_places_search", google)
    monkeypatch.setattr(places, "nominatim_search", osm)
    monkeypatch.setattr(places, "get_settings", settings)
    monkeypatch.setattr(places, "save_search_cache", save)

    result = asyncio.run(places.places_search("Catamarca", -28.46, -65.78))
    assert result["results"][0]["id"] == "catamarca"


def test_customer_can_only_read_own_marketplace_order(monkeypatch):
    class Orders:
        async def find_one(self, query, projection):
            if query["customer_id"] == "client_1":
                return {"order_id": query["order_id"], "customer_id": "client_1"}
            return None

    monkeypatch.setattr(marketplace, "db", SimpleNamespace(marketplace_orders=Orders()))
    own = asyncio.run(marketplace.get_customer_order("ord_1", {"user_id": "client_1"}))
    assert own["order_id"] == "ord_1"
    with pytest.raises(HTTPException) as exc:
        asyncio.run(marketplace.get_customer_order("ord_1", {"user_id": "client_2"}))
    assert exc.value.status_code == 404
