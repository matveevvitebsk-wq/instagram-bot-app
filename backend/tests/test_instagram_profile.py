import asyncio
from unittest.mock import patch

import httpx

from app.services.instagram_profile import (
    GRAPH_PROFILE_FIELDS,
    graph_profile_updates,
    refresh_instagram_account_profile,
)


def test_graph_profile_updates_stores_me_id():
    updates = graph_profile_updates(
        {
            "id": "1917627436259991",
            "user_id": "178400001",
            "username": "maryborfit",
            "name": "Mary",
            "profile_picture_url": "https://cdn/a.jpg",
            "followers_count": 10,
        },
        {"graph_id": None, "username": "old", "followers_count": 0},
    )
    assert updates["graph_id"] == "1917627436259991"
    assert updates["username"] == "maryborfit"
    assert updates["followers_count"] == 10
    assert "user_id" not in updates


def test_refresh_instagram_account_profile_writes_graph_id():
    account = {
        "id": "account-1",
        "username": "old_name",
        "display_name": "Old name",
        "profile_picture_url": "https://old.cdn/avatar.jpg",
        "graph_id": None,
        "access_token": "IGAA-secret",
    }

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

    sb = FakeSupabase()

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.params["fields"] == GRAPH_PROFILE_FIELDS
        return httpx.Response(
            200,
            json={
                "id": "1917627436259991",
                "user_id": "178400001",
                "username": "new_name",
                "name": "New name",
                "profile_picture_url": "https://fresh.cdn/avatar.jpg",
                "followers_count": 3,
            },
        )

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    with patch(
        "app.services.instagram_profile.httpx.AsyncClient",
        return_value=client,
    ):
        refreshed = asyncio.run(refresh_instagram_account_profile(sb, account))

    assert refreshed["graph_id"] == "1917627436259991"
    assert sb.accounts.updated["graph_id"] == "1917627436259991"
    assert sb.accounts.filter == ("id", "account-1")
