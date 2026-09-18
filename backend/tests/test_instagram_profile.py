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
        path = str(request.url)
        if "/me/conversations" in path:
            return httpx.Response(200, json={"data": []})
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

    real_async_client = httpx.AsyncClient

    def client_factory(*_args, **_kwargs):
        return real_async_client(transport=httpx.MockTransport(handler))

    with patch(
        "app.services.instagram_profile.httpx.AsyncClient",
        side_effect=client_factory,
    ):
        refreshed = asyncio.run(refresh_instagram_account_profile(sb, account))

    assert refreshed["graph_id"] == "1917627436259991"
    assert sb.accounts.updated["graph_id"] == "1917627436259991"
    assert sb.accounts.filter == ("id", "account-1")


def test_backfill_writes_participant_igsid_not_graph_id():
    from app.services.instagram_ids import attach_igsid_to_connected_username

    account = {
        "id": "acct-sveta",
        "owner_id": "owner-1",
        "username": "sveta_boltkova",
        "page_id": "17841449833103835",
        "graph_id": "27697312916596096",
        "igba_id": None,
        "is_active": True,
        "access_token": "IGAA-secret",
    }

    class FakeResult:
        def __init__(self, data):
            self.data = data

    class FakeQuery:
        def __init__(self, rows, filters=None, pending=None):
            self._rows = rows
            self._filters = dict(filters or {})
            self._pending = pending

        def eq(self, key, value):
            return FakeQuery(self._rows, {**self._filters, key: value}, self._pending)

        def execute(self):
            if self._pending:
                for row in self._rows:
                    if all(row.get(key) == value for key, value in self._filters.items()):
                        row.update(self._pending)
                return FakeResult(self._rows)
            rows = list(self._rows)
            for key, value in self._filters.items():
                rows = [row for row in rows if row.get(key) == value]
            return FakeResult(rows)

    class FakeTable:
        def __init__(self, rows):
            self._rows = rows

        def select(self, *_args, **_kwargs):
            return FakeQuery(self._rows)

        def update(self, values):
            return FakeQuery(self._rows, pending=values)

    class FakeSB:
        def __init__(self):
            self.rows = [dict(account)]

        def table(self, name):
            assert name == "ig_accounts"
            return FakeTable(self.rows)

    sb = FakeSB()
    attach_igsid_to_connected_username(sb, account["graph_id"], "sveta_boltkova")
    assert sb.rows[0]["igba_id"] is None
    attach_igsid_to_connected_username(sb, "1917627436259991", "sveta_boltkova")
    assert sb.rows[0]["igba_id"] == "1917627436259991"
