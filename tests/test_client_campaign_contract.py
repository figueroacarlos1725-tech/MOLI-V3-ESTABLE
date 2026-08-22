from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _source(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def test_all_client_campaign_entry_points_use_server_decision_contract():
    component = _source("frontend/src/components/CampaignInterstitial.tsx")
    assert "'/ads/decision'" in component
    assert "/ads/deliveries/${delivery.delivery_id}/events" in component
    assert "countdown_seconds" in component

    expected = {
        "frontend/app/(rider)/home.tsx": ('trigger="ride_started"', 'surface="rides"'),
        "frontend/app/(jobs)/job-status.tsx": ("'tramite_started'", "'job_started'"),
        "frontend/app/(marketplace)/merchant.tsx": ('trigger="marketplace_open"', 'entityType="merchant"'),
        "frontend/app/(marketplace)/order.tsx": ('trigger="order_created"', 'entityType="order"'),
    }
    for path, fragments in expected.items():
        source = _source(path)
        assert "CampaignInterstitial" in source
        for fragment in fragments:
            assert fragment in source


def test_client_only_opens_https_or_typed_marketplace_destinations():
    component = _source("frontend/src/components/CampaignInterstitial.tsx")
    assert "^https:\\/\\/" in component
    assert "d.type==='marketplace_store'" in component
    assert "d.type==='marketplace_product'" in component
    assert "merchant_id" in component and "product_id" in component
    assert "Linking.openURL(d.url)" in component
    assert "pathname:'/(marketplace)/merchant'" in component


def test_promoted_product_deep_link_is_visible_in_store():
    merchant = _source("frontend/app/(marketplace)/merchant.tsx")
    assert "product?: string" in merchant
    assert "item.product_id === product" in merchant
    assert "PRODUCTO DESTACADO" in merchant
