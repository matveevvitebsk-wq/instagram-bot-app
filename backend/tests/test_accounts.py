import asyncio
from unittest.mock import patch

import httpx

from app.api.accounts import ACCOUNT_PUBLIC_FIELDS
from app.services.instagram_profile import refresh_instagram_account_profile


class FakeResult:
    data = []


class FakeUpdate:
    def __init__(self, table, values):
        self.table = table
        self.values = values

    def eq(self, key, value):
        self.table.filter = (key, value)
        return self

    def execute(self):
        self.table.updated = self.values
        return FakeResult()


class FakeTable:
    def __init__(self):
        self.updated = None
        self.filter = None

    def update(self, values):
        return FakeUpdate(self, values)


class FakeSupabase:
    def __init__(self):
        self.accounts = FakeTable()

    def table(self, name):
        assert name == "ig_accounts"
        return self.accounts


def test_refresh_instagram_profile_updates_avatar_url():
    account = {
        "id": "account-1",
        "username": "old_name",
        "display_name": "Old name",
        "profile_picture_url": "https://old.cdn/avatar.jpg",
        "access_token": "IGAA-secret",
    }
    sb = FakeSupabase()

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.host == "graph.instagram.com"
        if "/me/conversations" in str(request.url):
            return httpx.Response(200, json={"data": []})
        assert request.url.params["fields"] == (
            "id,user_id,username,name,profile_picture_url,followers_count"
        )
        return httpx.Response(
            200,
            json={
                "id": "1917627436259991",
                "user_id": "123",
                "username": "new_name",
                "name": "New name",
                "profile_picture_url": "https://fresh.cdn/avatar.jpg",
            },
        )

    real_async_client = httpx.AsyncClient

    def client_factory(*_args, **_kwargs):
        return real_async_client(transport=httpx.MockTransport(handler))

    with patch(
        "app.services.instagram_profile.httpx.AsyncClient",
        side_effect=client_factory,
    ):
        refreshed = asyncio.run(refresh_instagram_account_profile(sb, account))

    assert refreshed["profile_picture_url"] == "https://fresh.cdn/avatar.jpg"
    assert refreshed["display_name"] == "New name"
    assert refreshed["graph_id"] == "1917627436259991"
    assert sb.accounts.updated == {
        "graph_id": "1917627436259991",
        "username": "new_name",
        "display_name": "New name",
        "profile_picture_url": "https://fresh.cdn/avatar.jpg",
    }
    assert sb.accounts.filter == ("id", "account-1")


def test_public_account_fields_do_not_expose_access_token():
    assert "access_token" not in ACCOUNT_PUBLIC_FIELDS
