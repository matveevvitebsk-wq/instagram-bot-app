"""Persist Instagram messaging IGSIDs so webhook sender.id can be matched.

page_id and graph_id are Graph /me identifiers. They are not interchangeable
with the messaging IGSID that arrives as webhook sender.id. That IGSID can
only be observed from a webhook, a comment `from.id`, or conversation
participants — never derived from page_id or graph_id.
"""

from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)


def normalize_instagram_username(username: Optional[str]) -> str:
    return str(username or "").strip().lstrip("@").lower()


def is_graph_account_id(igsid: str, account: dict) -> bool:
    """True when the id is page_id or graph_id, not a messaging IGSID."""
    token = str(igsid or "").strip()
    if not token:
        return False
    return token in {
        str(account.get("page_id") or "").strip(),
        str(account.get("graph_id") or "").strip(),
    }


def attach_igsid_to_connected_username(
    sb,
    igsid: str,
    username: Optional[str],
) -> Optional[dict]:
    """If username belongs to a connected ig_accounts row, store IGSID in igba_id.

    Returns the matched account row, or None when there is no username match
    or the id is the account's page_id/graph_id.
    """
    igsid = str(igsid or "").strip()
    handle = normalize_instagram_username(username)
    if not igsid or not handle:
        return None

    try:
        result = (
            sb.table("ig_accounts")
            .select("id,owner_id,username,igba_id,page_id,graph_id,is_active")
            .eq("is_active", True)
            .execute()
        )
    except Exception:
        logger.exception("Failed to load ig_accounts while storing IGSID")
        return None

    matched = None
    for row in result.data or []:
        if normalize_instagram_username(row.get("username")) == handle:
            matched = row
            break
    if not matched:
        return None
    if is_graph_account_id(igsid, matched):
        return matched

    if str(matched.get("igba_id") or "") != igsid:
        try:
            sb.table("ig_accounts").update({"igba_id": igsid}).eq(
                "id", matched["id"]
            ).execute()
            matched = {**matched, "igba_id": igsid}
        except Exception:
            logger.exception(
                "Failed to write igba_id for account %s", matched.get("id")
            )
            return None
    return matched


def upsert_sender_user(
    sb,
    *,
    owner_id: Optional[str],
    igsid: str,
    username: Optional[str] = None,
) -> bool:
    """Store the conversation participant IGSID on public.users.instagram_id."""
    igsid = str(igsid or "").strip()
    if not igsid:
        return False
    handle = normalize_instagram_username(username) or None
    try:
        existing = (
            sb.table("users")
            .select("id,username,owner_id")
            .eq("instagram_id", igsid)
            .limit(1)
            .execute()
        )
        rows = existing.data or []
        if rows:
            updates = {}
            if handle and handle != normalize_instagram_username(rows[0].get("username")):
                updates["username"] = handle
            if owner_id and rows[0].get("owner_id") != owner_id:
                updates["owner_id"] = owner_id
            if updates:
                sb.table("users").update(updates).eq("id", rows[0]["id"]).execute()
            return True
        payload = {"instagram_id": igsid, "username": handle}
        if owner_id:
            payload["owner_id"] = owner_id
        sb.table("users").insert(payload).execute()
        return True
    except Exception:
        logger.exception("Failed to upsert users.instagram_id=%s", igsid)
        return False


def unwrap_meta_webhook_payload(payload: dict) -> dict:
    """Accept Meta JSON or the n8n `{ body: { entry, object } }` wrapper."""
    if not isinstance(payload, dict):
        return {}
    if isinstance(payload.get("entry"), list):
        return payload
    body = payload.get("body")
    if isinstance(body, dict) and isinstance(body.get("entry"), list):
        return body
    return payload


def persist_messaging_ids_from_webhook(sb, payload: dict) -> None:
    """Save participant IGSIDs and comment events from a Meta webhook body.

    Inbound `sender.id` and comment `from.id` are messaging IGSIDs.
    Inbound `recipient.id` and echo `sender.id` are the business graph_id —
    they must not be written to igba_id.
    """
    payload = unwrap_meta_webhook_payload(payload)
    if not payload:
        return
    event_object = str(payload.get("object") or "").strip() or None
    for entry in payload.get("entry") or []:
        if not isinstance(entry, dict):
            continue
        entry_id = str(entry.get("id") or "").strip()
        account = _find_account_by_meta_id(sb, entry_id)
        owner_id = (account or {}).get("owner_id")
        event_time = _parse_unix_seconds(entry.get("time"))

        for event in entry.get("messaging") or []:
            if not isinstance(event, dict):
                continue
            sender_id = str((event.get("sender") or {}).get("id") or "").strip()
            recipient_id = str((event.get("recipient") or {}).get("id") or "").strip()
            is_echo = bool((event.get("message") or {}).get("is_echo"))
            participant_igsid = recipient_id if is_echo else sender_id
            if participant_igsid and (
                not account or not is_graph_account_id(participant_igsid, account)
            ):
                upsert_sender_user(sb, owner_id=owner_id, igsid=participant_igsid)

        for change in entry.get("changes") or []:
            if not isinstance(change, dict):
                continue
            value = change.get("value") if isinstance(change.get("value"), dict) else {}
            from_user = value.get("from") if isinstance(value.get("from"), dict) else {}
            igsid = str(from_user.get("id") or "").strip()
            username = from_user.get("username")
            if igsid:
                attach_igsid_to_connected_username(sb, igsid, username)
                if not account or not is_graph_account_id(igsid, account):
                    upsert_sender_user(
                        sb, owner_id=owner_id, igsid=igsid, username=username
                    )
            persist_comment_interaction(
                sb,
                page_id=entry_id or None,
                event_time=event_time,
                event_object=event_object,
                change=change,
            )


def persist_comment_interaction(
    sb,
    *,
    page_id: Optional[str],
    event_time: Optional[int],
    event_object: Optional[str],
    change: dict,
) -> None:
    """Store an Instagram comment webhook change on public.interactions."""
    event_field = str(change.get("field") or "").strip()
    if event_field and event_field != "comments":
        return
    value = change.get("value") if isinstance(change.get("value"), dict) else {}
    from_user = value.get("from") if isinstance(value.get("from"), dict) else {}
    media = value.get("media") if isinstance(value.get("media"), dict) else {}
    from_id = str(from_user.get("id") or "").strip() or None
    from_username = normalize_instagram_username(from_user.get("username")) or None
    media_id = str(media.get("id") or "").strip() or None
    media_product_type = str(media.get("media_product_type") or "").strip() or None
    comment_id = str(value.get("id") or "").strip() or None
    text_content = value.get("text")
    if isinstance(text_content, str):
        text_content = text_content.strip() or None
    else:
        text_content = None
    if not any((from_id, comment_id, media_id, text_content)):
        return

    user_id = None
    if from_id:
        user_id = _find_user_id_by_instagram_id(sb, from_id)

    row = {
        "interaction_type": "COMMENT",
        "text_content": text_content,
        "from_id": from_id,
        "from_username": from_username,
        "media_id": media_id,
        "media_product_type": media_product_type,
        "event_field": event_field or "comments",
        "event_time": event_time,
        "page_id": page_id,
        "event_object": event_object,
        "comment_id": comment_id,
        "user_id": user_id,
    }
    try:
        if comment_id:
            existing = (
                sb.table("interactions")
                .select("id")
                .eq("comment_id", comment_id)
                .limit(1)
                .execute()
            )
            rows = existing.data or []
            if rows:
                sb.table("interactions").update(row).eq("id", rows[0]["id"]).execute()
                return
        sb.table("interactions").insert(row).execute()
    except Exception:
        logger.exception("Failed to persist Instagram comment interaction")


def _parse_unix_seconds(value) -> Optional[int]:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _find_user_id_by_instagram_id(sb, igsid: str) -> Optional[str]:
    try:
        result = (
            sb.table("users")
            .select("id")
            .eq("instagram_id", igsid)
            .limit(1)
            .execute()
        )
        rows = result.data or []
        if rows:
            return rows[0].get("id")
    except Exception:
        logger.exception("Failed to resolve users.id for instagram_id")
    return None


def _find_account_by_meta_id(sb, meta_id: str) -> Optional[dict]:
    meta_id = str(meta_id or "").strip()
    if not meta_id:
        return None
    try:
        for column in ("page_id", "graph_id", "igba_id"):
            result = (
                sb.table("ig_accounts")
                .select("id,owner_id,username,igba_id,page_id,graph_id,is_active")
                .eq("is_active", True)
                .eq(column, meta_id)
                .limit(1)
                .execute()
            )
            rows = result.data or []
            if rows:
                return rows[0]
    except Exception:
        logger.exception("Failed to resolve ig_accounts by meta id")
    return None
