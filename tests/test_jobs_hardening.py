"""Focused regression tests for the jobs authorization/redaction helpers."""
import sys
import asyncio
from pathlib import Path

import pytest
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from routes import jobs


JOB = {
    "job_id": "job_1",
    "client_id": "client_1",
    "assigned_to": "pro_1",
    "status": "assigned",
    "title": "Trámite",
    "address": "Dirección exacta",
    "location": {"latitude": -27.4, "longitude": -65.7},
    "images": ["private-image"],
}


def test_marketplace_view_redacts_private_fields_for_non_participant():
    result = jobs._job_for_user(JOB, {"user_id": "pro_2", "user_type": "driver"})
    assert result["title"] == "Trámite"
    assert jobs.PRIVATE_JOB_FIELDS.isdisjoint(result)


@pytest.mark.parametrize("user", [
    {"user_id": "client_1", "user_type": "rider"},
    {"user_id": "pro_1", "user_type": "driver"},
    {"user_id": "admin_1", "user_type": "admin"},
])
def test_exact_view_is_limited_to_client_assignee_or_admin(user):
    result = jobs._job_for_user(JOB, user)
    assert result["address"] == JOB["address"]
    assert result["location"] == JOB["location"]
    assert result["images"] == JOB["images"]


def test_redaction_does_not_mutate_database_document():
    original = dict(JOB)
    jobs._redact_job(JOB)
    assert JOB == original


def test_professional_guard_rejects_missing_profile(monkeypatch):
    class Profiles:
        async def find_one(self, query):
            return None

    monkeypatch.setattr(jobs.db, "professional_profiles", Profiles())
    with pytest.raises(HTTPException) as exc:
        asyncio.run(jobs._require_professional({"user_id": "rider_1"}))
    assert exc.value.status_code == 403


def test_available_professional_guard_rejects_offline_profile(monkeypatch):
    class Profiles:
        async def find_one(self, query):
            return {"user_id": query["user_id"], "is_available": False}

    monkeypatch.setattr(jobs.db, "professional_profiles", Profiles())
    with pytest.raises(HTTPException) as exc:
        asyncio.run(jobs._require_professional({"user_id": "pro_1"}, available=True))
    assert exc.value.status_code == 403
