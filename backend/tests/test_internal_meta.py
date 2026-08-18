from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import app
from app.services.instagram_followers import FollowerCheckError

client = TestClient(app)
AUTH = {"Authorization": "Bearer test-n8n-service-token"}


def test_requires_service_token():
    response = client.post(
        "/api/internal/meta/actions",
        json={
            "operation": "check_follower",
            "target_igsid": "555",
            "ig_account_id": "acct-1",
        },
    )
    assert response.status_code in {401, 403}


def test_rejects_wrong_service_token():
    response = client.post(
        "/api/internal/meta/actions",
        headers={"Authorization": "Bearer wrong-token"},
        json={
            "operation": "check_follower",
            "target_igsid": "555",
            "ig_account_id": "acct-1",
        },
    )
    assert response.status_code == 401


def test_requires_account_pointer():
    response = client.post(
        "/api/internal/meta/actions",
        headers=AUTH,
        json={"operation": "check_follower", "target_igsid": "555"},
    )
    assert response.status_code == 422


def test_check_follower_success_hides_tokens():
    payload = {
        "ok": True,
        "operation": "check_follower",
        "skipped": False,
        "follows": False,
        "is_user_follow_business": False,
        "is_business_follow_user": True,
        "username": "alice",
        "consent_required": False,
        "retryable": False,
        "error_code": None,
        "reason": None,
        "account_id": "acct-1",
        "instagram_account_id": "178400001",
        "token_kind": "igaa",
    }
    with (
        patch("app.api.internal_meta.get_supabase", return_value=object()),
        patch(
            "app.api.internal_meta.check_user_follows_account",
            new_callable=AsyncMock,
            return_value=payload,
        ),
    ):
        response = client.post(
            "/api/internal/meta/actions",
            headers=AUTH,
            json={
                "operation": "check_follower",
                "target_igsid": "555111",
                "instagram_account_id": "178400001",
                "task_id": "task-1",
            },
        )
    assert response.status_code == 200
    body = response.json()
    assert body["follows"] is False
    assert "access_token" not in body
    assert "IGAA" not in str(body)


def test_consent_required_is_branchable_200():
    error = FollowerCheckError(
        "User consent is required before follow status can be read",
        error_code="consent_required",
        consent_required=True,
    )
    with (
        patch("app.api.internal_meta.get_supabase", return_value=object()),
        patch(
            "app.api.internal_meta.check_user_follows_account",
            new_callable=AsyncMock,
            side_effect=error,
        ),
    ):
        response = client.post(
            "/api/internal/meta/actions",
            headers=AUTH,
            json={
                "operation": "check_follower",
                "target_igsid": "555111",
                "ig_account_id": "acct-1",
            },
        )
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is False
    assert body["consent_required"] is True
    assert body["follows"] is None
