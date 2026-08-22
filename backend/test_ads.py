"""Focused unit tests for the isolated advertising module."""
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from routes.ads import (
    CampaignInput, ClosePolicy, Creative, Destination, Targeting,
    _campaign_publishable, delivery_event_transition, delivery_key_for,
    legacy_banner_to_campaign, within_frequency_caps,
)


def test_https_destination_accepts_only_https():
    assert Destination(type="https", url="https://moli.example/promo").url.startswith("https://")
    for unsafe in ["http://example.com", "javascript:alert(1)", "data:text/html,x", "file:///tmp/x"]:
        with pytest.raises(ValidationError):
            Destination(type="https", url=unsafe)


def test_marketplace_product_requires_typed_ids():
    with pytest.raises(ValidationError):
        Destination(type="marketplace_product", merchant_id="merchant_1")
    value = Destination(type="marketplace_product", merchant_id="merchant_1", product_id="product_1")
    assert value.product_id == "product_1"


def test_creative_media_and_product_destination_are_validated():
    with pytest.raises(ValidationError):
        Creative(format="video", media_url="http://unsafe/video.mp4")
    with pytest.raises(ValidationError):
        Creative(format="marketplace_product", destination={"type": "none"})


def test_targeting_and_countdown_bounds():
    with pytest.raises(ValidationError):
        Targeting(roles=["root"], surfaces=["rides"], triggers=["ride_started"])
    with pytest.raises(ValidationError):
        ClosePolicy(countdown_seconds=16)
    assert ClosePolicy(countdown_seconds=0).countdown_seconds == 0


def test_campaign_dates_must_be_ordered():
    now = datetime.now(timezone.utc)
    with pytest.raises(ValidationError):
        CampaignInput(name="x", starts_at=now, ends_at=now - timedelta(seconds=1))


def test_legacy_import_is_draft_inactive_and_marks_review():
    campaign = legacy_banner_to_campaign({
        "banner_id": "old_1", "title": "Viejo", "active": True,
        "image_url": "data:image/png;base64,abc", "button_link": "javascript:alert(1)",
        "target": "both",
    })
    assert campaign["status"] == "draft"
    assert campaign["legacy_requires_review"] is True
    assert campaign["creatives"][0]["active"] is False
    assert campaign["creatives"][0]["destination"]["type"] == "none"


def test_legacy_campaign_cannot_publish_without_review():
    campaign = legacy_banner_to_campaign({"title": "Viejo", "image_url": "https://cdn.example/ad.jpg"})
    campaign["creatives"][0]["active"] = True
    with pytest.raises(HTTPException) as error:
        _campaign_publishable(campaign)
    assert error.value.status_code == 422


def test_campaign_requires_active_creative_to_publish():
    campaign = CampaignInput(name="Campaña").model_dump()
    campaign.update({"status": "draft", "creatives": []})
    with pytest.raises(HTTPException):
        _campaign_publishable(campaign)


def test_delivery_key_is_idempotent_per_entity():
    first = delivery_key_for("u", "c", "ride_started", "ride_1", "s1", True)
    retry = delivery_key_for("u", "c", "ride_started", "ride_1", "s2", True)
    another = delivery_key_for("u", "c", "ride_started", "ride_2", "s1", True)
    assert first == retry
    assert first != another


def test_frequency_caps_cover_total_day_session_and_cooldown():
    frequency = {"max_per_user_total": 5, "max_per_user_day": 3, "max_per_session": 1, "cooldown_seconds": 60}
    assert within_frequency_caps(frequency, 1, 1, 0, False)
    assert not within_frequency_caps(frequency, 5, 1, 0, False)
    assert not within_frequency_caps(frequency, 1, 3, 0, False)
    assert not within_frequency_caps(frequency, 1, 1, 1, False)
    assert not within_frequency_caps(frequency, 1, 1, 0, True)


def test_viewable_counts_only_first_impression():
    assert delivery_event_transition("reserved", "viewable") == ("impressed", True)
    assert delivery_event_transition("impressed", "viewable") == (None, False)
    assert delivery_event_transition("clicked", "viewable") == (None, False)
