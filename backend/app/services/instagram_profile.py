"""Refresh connected Instagram account profile fields from Graph /me."""

from __future__ import annotations

import logging
from typing import Any, Optional

import httpx

from app.core.config import get_settings
from app.services.instagram_ids import attach_igsid_to_connected_username

logger = logging.getLogger(__name__)
settings = get_settings()

GRAPH_PROFILE_FIELDS = (
    "id,user_id,username,name,profile_picture_url,followers_count"
)


def graph_profile_updates(profile: dict, account: dict) -> dict[str, Any]:
    """Map Graph /me fields onto ig_accounts columns. Never includes tokens."""
    updates: dict[str, Any] = {}
    graph_id = str(profile.get("id") or "").strip()
    if graph_id and graph_id != str(account.get("graph_id") or ""):
        updates["graph_id"] = graph_id

    username = profile.get("username")
    if username and username != account.get("username"):
        updates["username"] = username

    display_name = profile.get("name")
    if display_name and display_name != account.get("display_name"):
        updates["display_name"] = display_name

    picture = profile.get("profile_picture_url")
    if picture and picture != account.get("profile_picture_url"):
        updates["profile_picture_url"] = picture

    if "followers_count" in profile and profile.get("followers_count") is not None:
        followers = int(profile.get("followers_count") or 0)
        if followers != int(account.get("followers_count") or 0):
            updates["followers_count"] = followers

    return updates


async def fetch_instagram_me(access_token: str) -> Optional[dict]:
    if not access_token:
        return None
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"https://graph.instagram.com/{settings.META_API_VERSION}/me",
                params={
                    "fields": GRAPH_PROFILE_FIELDS,
                    "access_token": access_token,
                },
            )
    except httpx.HTTPError:
        logger.exception("Instagram /me request failed")
        return None
    if response.status_code != 200:
        logger.warning(
            "Instagram /me failed status=%s body=%s",
            response.status_code,
            response.text[:300],
        )
        return None
    try:
        return response.json()
    except ValueError:
        return None


async def refresh_instagram_account_profile(sb, account: dict) -> dict:
    """Update ig_accounts.graph_id and public profile fields from Graph."""
    access_token = account.get("access_token")
    if not access_token or not account.get("id"):
        return account

    profile = await fetch_instagram_me(access_token)
    if not profile:
        return account

    changed = graph_profile_updates(profile, account)
    if changed:
        sb.table("ig_accounts").update(changed).eq("id", account["id"]).execute()
        account = {**account, **changed}

    await backfill_igba_from_conversations(sb, account, access_token)
    return account


async def backfill_igba_from_conversations(
    sb,
    account: dict,
    access_token: str,
) -> None:
    """Read chat participants and store matching IGSIDs on ig_accounts.igba_id."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"https://graph.instagram.com/{settings.META_API_VERSION}/me/conversations",
                params={
                    "fields": "participants",
                    "limit": 30,
                    "access_token": access_token,
                },
            )
    except httpx.HTTPError:
        logger.exception("Instagram conversations request failed")
        return
    if response.status_code != 200:
        logger.warning(
            "Instagram conversations failed status=%s body=%s",
            response.status_code,
            response.text[:300],
        )
        return
    try:
        payload = response.json()
    except ValueError:
        return

    for conversation in payload.get("data") or []:
        participants = (conversation.get("participants") or {}).get("data") or []
        for person in participants:
            username = person.get("username")
            igsid = str(person.get("id") or "").strip()
            if not igsid:
                continue
            attach_igsid_to_connected_username(sb, igsid, username)


async def refresh_owner_instagram_profiles(sb, owner_id: str) -> None:
    accounts = (
        sb.table("ig_accounts")
        .select(
            "id,username,display_name,profile_picture_url,followers_count,"
            "graph_id,access_token"
        )
        .eq("owner_id", owner_id)
        .eq("is_active", True)
        .execute()
    )
    for row in accounts.data or []:
        await refresh_instagram_account_profile(sb, dict(row))
