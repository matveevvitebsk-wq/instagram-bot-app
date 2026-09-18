from typing import Any

from app.services.instagram_ids import (
    attach_igsid_to_connected_username,
    persist_comment_interaction,
    persist_messaging_ids_from_webhook,
    upsert_sender_user,
)


ACCOUNT = {
    "id": "acct-sveta",
    "owner_id": "owner-1",
    "username": "sveta_boltkova",
    "page_id": "17841449833103835",
    "graph_id": "27697312916596096",
    "igba_id": None,
    "is_active": True,
}


class FakeResult:
    def __init__(self, data):
        self.data = data


class FakeQuery:
    def __init__(self, table, rows, filters=None, pending=None):
        self._table = table
        self._rows = rows
        self._filters = dict(filters or {})
        self._pending = pending

    def eq(self, key, value):
        return FakeQuery(self._table, self._rows, {**self._filters, key: value}, self._pending)

    def limit(self, _count):
        return self

    def execute(self):
        if self._pending == "insert":
            return FakeResult(self._rows[-1:])
        if self._pending and self._pending.get("op") == "update":
            values = self._pending["values"]
            matched = []
            for row in self._rows:
                if all(row.get(key) == value for key, value in self._filters.items()):
                    row.update(values)
                    matched.append(row)
            return FakeResult(matched)
        rows = list(self._rows)
        for key, value in self._filters.items():
            rows = [row for row in rows if row.get(key) == value]
        return FakeResult(rows)


class FakeTable:
    def __init__(self, rows):
        self._rows = rows

    def select(self, *_args, **_kwargs):
        return FakeQuery(self, self._rows)

    def insert(self, values):
        row = dict(values)
        if "id" not in row:
            row["id"] = f"user-{len(self._rows) + 1}"
        self._rows.append(row)
        return FakeQuery(self, self._rows, pending="insert")

    def update(self, values):
        return FakeQuery(self, self._rows, pending={"op": "update", "values": values})


class FakeSB:
    def __init__(self, tables: dict[str, list[dict[str, Any]]]):
        self._tables = {name: [dict(row) for row in rows] for name, rows in tables.items()}

    def table(self, name: str):
        self._tables.setdefault(name, [])
        return FakeTable(self._tables[name])


def test_attach_writes_igba_id_when_username_matches():
    sb = FakeSB({"ig_accounts": [ACCOUNT]})
    matched = attach_igsid_to_connected_username(
        sb, "1917627436259991", "Sveta_Boltkova"
    )
    assert matched["id"] == "acct-sveta"
    assert sb._tables["ig_accounts"][0]["igba_id"] == "1917627436259991"


def test_attach_does_not_write_page_id_or_graph_id():
    sb = FakeSB({"ig_accounts": [ACCOUNT]})
    attach_igsid_to_connected_username(sb, ACCOUNT["page_id"], "sveta_boltkova")
    attach_igsid_to_connected_username(sb, ACCOUNT["graph_id"], "sveta_boltkova")
    assert sb._tables["ig_accounts"][0]["igba_id"] is None


def test_attach_skips_unknown_username():
    sb = FakeSB({"ig_accounts": [ACCOUNT]})
    assert attach_igsid_to_connected_username(sb, "1917627436259991", "alice") is None
    assert sb._tables["ig_accounts"][0]["igba_id"] is None


def test_upsert_sender_user_writes_instagram_id_without_owner():
    sb = FakeSB({"users": []})
    assert upsert_sender_user(sb, owner_id=None, igsid="1917627436259991", username="alice")
    assert sb._tables["users"][0]["instagram_id"] == "1917627436259991"
    assert sb._tables["users"][0]["username"] == "alice"
    assert "owner_id" not in sb._tables["users"][0]


def test_persist_inbound_sender_does_not_store_recipient_graph_id():
    sb = FakeSB({"ig_accounts": [ACCOUNT], "users": []})
    persist_messaging_ids_from_webhook(
        sb,
        {
            "entry": [
                {
                    "id": ACCOUNT["graph_id"],
                    "messaging": [
                        {
                            "sender": {"id": "555111"},
                            "recipient": {"id": ACCOUNT["graph_id"]},
                            "message": {"text": "hi"},
                        }
                    ],
                }
            ]
        },
    )
    assert sb._tables["ig_accounts"][0]["igba_id"] is None
    assert sb._tables["users"][0]["instagram_id"] == "555111"
    assert sb._tables["users"][0]["owner_id"] == "owner-1"


def test_persist_echo_does_not_store_business_sender_as_igba():
    sb = FakeSB({"ig_accounts": [ACCOUNT], "users": []})
    persist_messaging_ids_from_webhook(
        sb,
        {
            "entry": [
                {
                    "id": ACCOUNT["graph_id"],
                    "messaging": [
                        {
                            "sender": {"id": ACCOUNT["graph_id"]},
                            "recipient": {"id": "555111"},
                            "message": {"text": "hello", "is_echo": True},
                        }
                    ],
                }
            ]
        },
    )
    assert sb._tables["ig_accounts"][0]["igba_id"] is None
    assert sb._tables["users"][0]["instagram_id"] == "555111"


def test_persist_comment_writes_igba_when_username_matches():
    sb = FakeSB({"ig_accounts": [ACCOUNT], "users": []})
    persist_messaging_ids_from_webhook(
        sb,
        {
            "entry": [
                {
                    "id": ACCOUNT["page_id"],
                    "changes": [
                        {
                            "field": "comments",
                            "value": {
                                "from": {
                                    "id": "1917627436259991",
                                    "username": "sveta_boltkova",
                                }
                            },
                        }
                    ],
                }
            ]
        },
    )
    assert sb._tables["ig_accounts"][0]["igba_id"] == "1917627436259991"
    assert sb._tables["users"][0]["instagram_id"] == "1917627436259991"


COMMENT_WEBHOOK = {
    "object": "instagram",
    "entry": [
        {
            "id": "17841403480052658",
            "time": 1788675790,
            "changes": [
                {
                    "value": {
                        "from": {
                            "id": "1917627436259991",
                            "username": "sveta_boltkova",
                        },
                        "media": {
                            "id": "18143622109340491",
                            "media_product_type": "REELS",
                        },
                        "id": "18440601349132800",
                        "text": "Супер🔥",
                    },
                    "field": "comments",
                }
            ],
        }
    ],
}


def test_persist_comment_stores_webhook_fields_on_interactions():
    sb = FakeSB({"ig_accounts": [ACCOUNT], "users": [], "interactions": []})
    persist_messaging_ids_from_webhook(sb, COMMENT_WEBHOOK)
    row = sb._tables["interactions"][0]
    assert row["from_id"] == "1917627436259991"
    assert row["from_username"] == "sveta_boltkova"
    assert row["media_id"] == "18143622109340491"
    assert row["media_product_type"] == "REELS"
    assert row["event_field"] == "comments"
    assert row["event_time"] == 1788675790
    assert row["page_id"] == "17841403480052658"
    assert row["event_object"] == "instagram"
    assert row["comment_id"] == "18440601349132800"
    assert row["text_content"] == "Супер🔥"
    assert row["interaction_type"] == "COMMENT"
    assert row["user_id"] == sb._tables["users"][0]["id"]


def test_persist_comment_accepts_n8n_body_wrapper():
    sb = FakeSB({"ig_accounts": [ACCOUNT], "users": [], "interactions": []})
    persist_messaging_ids_from_webhook(sb, {"body": COMMENT_WEBHOOK})
    assert sb._tables["interactions"][0]["media_id"] == "18143622109340491"


def test_persist_comment_is_idempotent_by_comment_id():
    sb = FakeSB({"ig_accounts": [ACCOUNT], "users": [], "interactions": []})
    persist_messaging_ids_from_webhook(sb, COMMENT_WEBHOOK)
    persist_messaging_ids_from_webhook(sb, COMMENT_WEBHOOK)
    assert len(sb._tables["interactions"]) == 1


def test_persist_comment_skips_non_comment_fields():
    sb = FakeSB({"interactions": []})
    persist_comment_interaction(
        sb,
        page_id="17841403480052658",
        event_time=1788675790,
        event_object="instagram",
        change={"field": "mentions", "value": {"id": "1"}},
    )
    assert sb._tables["interactions"] == []
