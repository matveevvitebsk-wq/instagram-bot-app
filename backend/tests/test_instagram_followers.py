import asyncio
from typing import Any

import httpx

from app.services.instagram_followers import (
    FollowerCheckError,
    check_user_follows_account,
    classify_graph_error,
    select_graph_credentials,
    success_result,
)


ACCOUNT = {
    "id": "acct-1",
    "owner_id": "owner-1",
    "page_id": "178400001",
    "username": "mary",
    "is_active": True,
    "access_token": "IGAA-secret-token",
    "facebook_access_token": "EAAV-secret-token",
}


class FakeResult:
    def __init__(self, data):
        self.data = data


class FakeQuery:
    def __init__(self, rows, filters=None):
        self._rows = rows
        self._filters = dict(filters or {})

    def eq(self, key, value):
        filters = {**self._filters, key: value}
        return FakeQuery(self._rows, filters)

    def limit(self, _count):
        return self

    def execute(self):
        rows = list(self._rows)
        for key, value in self._filters.items():
            rows = [row for row in rows if row.get(key) == value]
        return FakeResult(rows)


class FakeTable:
    def __init__(self, rows):
        self._rows = rows
        self.inserted = []
        self.updated = []

    def select(self, *_args, **_kwargs):
        return FakeQuery(self._rows)

    def insert(self, values):
        self.inserted.append(values)
        self._rows.append(dict(values))
        return FakeQuery(self._rows)

    def update(self, values):
        self.updated.append(values)
        return FakeQuery(self._rows)


class FakeSB:
    def __init__(self, tables: dict[str, list[dict[str, Any]]]):
        self._tables = tables

    def table(self, name: str):
        self._tables.setdefault(name, [])
        return FakeTable(self._tables[name])


def test_select_graph_credentials_prefers_igaa():
    host, token, kind = select_graph_credentials(ACCOUNT)
    assert host == "https://graph.instagram.com"
    assert token == "IGAA-secret-token"
    assert kind == "igaa"


def test_select_graph_credentials_falls_back_to_eaav():
    host, token, kind = select_graph_credentials(
        {**ACCOUNT, "access_token": ""}
    )
    assert host == "https://graph.facebook.com"
    assert kind == "eaav"
    assert token == "EAAV-secret-token"


def test_success_result_never_includes_tokens():
    result = success_result(
        ACCOUNT,
        {"is_user_follow_business": True, "username": "alice"},
        "igaa",
    )
    dumped = str(result)
    assert result["follows"] is True
    assert "IGAA-secret-token" not in dumped
    assert "EAAV-secret-token" not in dumped
    assert "access_token" not in result


def test_classify_consent_error():
    response = httpx.Response(
        400,
        json={
            "error": {
                "message": "User consent is required to access user profile",
                "code": 10,
            }
        },
    )
    error = classify_graph_error(response)
    assert error.consent_required is True
    assert error.retryable is False
    assert error.error_code == "consent_required"


def test_classify_rate_limit_as_retryable():
    response = httpx.Response(
        400,
        json={"error": {"message": "Application request limit reached", "code": 4}},
    )
    error = classify_graph_error(response)
    assert error.retryable is True
    assert error.error_code == "rate_limited"


def test_check_follower_true_uses_instagram_graph():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        return httpx.Response(
            200,
            json={
                "is_user_follow_business": True,
                "is_business_follow_user": False,
                "username": "alice",
            },
        )

    sb = FakeSB({"ig_accounts": [ACCOUNT]})
    transport = httpx.MockTransport(handler)

    async def run():
        async with httpx.AsyncClient(transport=transport) as client:
            return await check_user_follows_account(
                sb,
                target_igsid="555111",
                ig_account_id="acct-1",
                client=client,
            )

    result = asyncio.run(run())
    assert result["follows"] is True
    assert result["ok"] is True
    assert result["token_kind"] == "igaa"
    assert "graph.instagram.com" in captured["url"]
    assert "is_user_follow_business" in captured["url"]
    assert "IGAA-secret-token" not in str(result)


def test_check_follower_skips_graph_when_task_disables_it():
    called = {"graph": False}

    def handler(_request: httpx.Request) -> httpx.Response:
        called["graph"] = True
        return httpx.Response(500)

    sb = FakeSB(
        {
            "ig_accounts": [ACCOUNT],
            "automation_tasks": [
                {
                    "id": "task-1",
                    "owner_id": "owner-1",
                    "check_subscription": False,
                }
            ],
        }
    )

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await check_user_follows_account(
                sb,
                target_igsid="555111",
                ig_account_id="acct-1",
                task_id="task-1",
                client=client,
            )

    result = asyncio.run(run())
    assert called["graph"] is False
    assert result["skipped"] is True
    assert result["follows"] is True


def test_missing_account_raises():
    sb = FakeSB({"ig_accounts": []})

    async def run():
        await check_user_follows_account(
            sb,
            target_igsid="555111",
            instagram_account_id="missing",
        )

    try:
        asyncio.run(run())
        raise AssertionError("expected FollowerCheckError")
    except FollowerCheckError as exc:
        assert exc.error_code == "account_not_found"
