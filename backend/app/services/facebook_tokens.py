import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from app.core.config import get_settings


logger = logging.getLogger(__name__)
settings = get_settings()


class FacebookTokenError(Exception):
    """A safe token-lifecycle error that never contains the token itself."""


def _graph_error(response: httpx.Response) -> str:
    try:
        error = response.json().get("error", {})
        return str(error.get("message") or f"Meta returned HTTP {response.status_code}")
    except Exception:
        return f"Meta returned HTTP {response.status_code}"


def _from_unix_timestamp(value: Any) -> datetime | None:
    try:
        timestamp = int(value or 0)
    except (TypeError, ValueError):
        return None
    if timestamp <= 0:
        return None
    return datetime.fromtimestamp(timestamp, tz=timezone.utc)


async def debug_facebook_token(token: str) -> dict:
    if not settings.META_APP_ID or not settings.META_APP_SECRET:
        raise FacebookTokenError("Facebook app credentials are not configured")

    async with httpx.AsyncClient(timeout=settings.HTTP_TIMEOUT) as client:
        response = await client.get(
            f"{settings.meta_api_base}/debug_token",
            params={
                "input_token": token,
                "access_token": f"{settings.META_APP_ID}|{settings.META_APP_SECRET}",
            },
        )
    if response.status_code != 200:
        raise FacebookTokenError(_graph_error(response))
    return response.json().get("data") or {}


async def exchange_facebook_token(token: str) -> dict:
    """Exchange a valid Facebook token for a long-lived token when Meta permits it."""
    async with httpx.AsyncClient(timeout=settings.HTTP_TIMEOUT) as client:
        response = await client.get(
            f"{settings.meta_api_base}/oauth/access_token",
            params={
                "grant_type": "fb_exchange_token",
                "client_id": settings.META_APP_ID,
                "client_secret": settings.META_APP_SECRET,
                "fb_exchange_token": token,
            },
        )
    if response.status_code != 200:
        raise FacebookTokenError(_graph_error(response))

    data = response.json()
    if not data.get("access_token"):
        raise FacebookTokenError("Meta did not return a replacement token")
    return data


def _token_metadata(debug_data: dict, checked_at: datetime) -> dict:
    expires_at = _from_unix_timestamp(debug_data.get("expires_at"))
    data_access_expires_at = _from_unix_timestamp(
        debug_data.get("data_access_expires_at")
    )
    return {
        "facebook_user_id": (
            str(debug_data["user_id"]) if debug_data.get("user_id") else None
        ),
        "facebook_token_expires_at": (
            expires_at.isoformat() if expires_at else None
        ),
        "facebook_data_access_expires_at": (
            data_access_expires_at.isoformat()
            if data_access_expires_at
            else None
        ),
        "facebook_token_scopes": debug_data.get("scopes") or [],
        "facebook_token_is_valid": bool(debug_data.get("is_valid")),
        "facebook_token_last_checked_at": checked_at.isoformat(),
    }


async def attach_facebook_token_to_owner(sb, owner_id: str, token: str) -> int:
    """
    Attach a Facebook Login token (EAAV) to the owner's active IG accounts.

    Prefer accounts whose Page/IG asset the token can access. If the token is
    valid for this Meta app but asset matching fails (common when page_id is an
    Instagram-scoped id), still save the token so OAuth completes automatically.
    """
    debug_data = await debug_facebook_token(token)
    if not debug_data.get("is_valid"):
        raise FacebookTokenError("Facebook token is invalid")
    if str(debug_data.get("app_id")) != str(settings.META_APP_ID):
        raise FacebookTokenError("Facebook token belongs to a different Meta app")

    accounts = (
        sb.table("ig_accounts")
        .select("id,page_id,username")
        .eq("owner_id", owner_id)
        .eq("is_active", True)
        .execute()
    )
    if not accounts.data:
        raise FacebookTokenError(
            "Connect Instagram first, then connect Facebook to store the EAAV token"
        )

    checked_at = datetime.now(timezone.utc)
    metadata = _token_metadata(debug_data, checked_at)
    metadata.update(
        {
            "facebook_access_token": token,
            "facebook_token_refresh_required": False,
            "facebook_token_error": None,
        }
    )

    accessible_ids: set[str] = set()
    accessible_usernames: set[str] = set()
    async with httpx.AsyncClient(timeout=settings.HTTP_TIMEOUT) as client:
        for account in accounts.data:
            page_id = str(account.get("page_id") or "")
            if not page_id:
                continue
            response = await client.get(
                f"{settings.meta_api_base}/{page_id}",
                params={"fields": "id,username", "access_token": token},
            )
            if response.status_code == 200:
                accessible_ids.add(page_id)
                username = (response.json() or {}).get("username")
                if username:
                    accessible_usernames.add(str(username).lower())

        pages_response = await client.get(
            f"{settings.meta_api_base}/me/accounts",
            params={
                "fields": "id,name,instagram_business_account{id,username}",
                "access_token": token,
            },
        )
        if pages_response.status_code == 200:
            for page in (pages_response.json() or {}).get("data") or []:
                accessible_ids.add(str(page.get("id") or ""))
                ig = page.get("instagram_business_account") or {}
                if ig.get("id"):
                    accessible_ids.add(str(ig["id"]))
                if ig.get("username"):
                    accessible_usernames.add(str(ig["username"]).lower())

    matched_ids: list[str] = []
    for account in accounts.data:
        page_id = str(account.get("page_id") or "")
        username = str(account.get("username") or "").lower()
        if page_id in accessible_ids or (
            username and username in accessible_usernames
        ):
            matched_ids.append(account["id"])

    targets = matched_ids or [account["id"] for account in accounts.data]
    if not matched_ids:
        metadata["facebook_token_error"] = (
            "Facebook token saved; Page/IG asset link was not verified"
        )
        logger.warning(
            "Saving EAAV for owner %s without verified Page/IG match",
            owner_id,
        )

    for account_id in targets:
        (
            sb.table("ig_accounts")
            .update(metadata)
            .eq("id", account_id)
            .eq("owner_id", owner_id)
            .execute()
        )

    return len(targets)


async def maintain_owner_facebook_tokens(sb, owner_id: str) -> None:
    """
    Validate every stored EAAV token for an owner.

    A valid token nearing its explicit expiry is exchanged when Meta allows it.
    Expired/revoked tokens and expiring data access require interactive
    Facebook reauthorization; Graph API Explorer cannot be automated.
    """
    result = (
        sb.table("ig_accounts")
        .select(
            "id,facebook_access_token,facebook_token_expires_at,"
            "facebook_data_access_expires_at"
        )
        .eq("owner_id", owner_id)
        .eq("is_active", True)
        .execute()
    )

    for account in result.data or []:
        token = account.get("facebook_access_token")
        if not token:
            continue

        checked_at = datetime.now(timezone.utc)
        try:
            debug_data = await debug_facebook_token(token)
            updates = _token_metadata(debug_data, checked_at)
            updates["facebook_token_error"] = None
            updates["facebook_token_refresh_required"] = not updates[
                "facebook_token_is_valid"
            ]

            if not updates["facebook_token_is_valid"]:
                updates["facebook_token_error"] = "Facebook token is invalid"
                (
                    sb.table("ig_accounts")
                    .update(updates)
                    .eq("id", account["id"])
                    .eq("owner_id", owner_id)
                    .execute()
                )
                continue

            expires_at = _from_unix_timestamp(debug_data.get("expires_at"))
            data_access_expires_at = _from_unix_timestamp(
                debug_data.get("data_access_expires_at")
            )
            refresh_before = checked_at + timedelta(days=settings.TOKEN_REFRESH_DAYS)

            if data_access_expires_at and data_access_expires_at <= refresh_before:
                updates["facebook_token_refresh_required"] = True
                updates["facebook_token_error"] = (
                    "Facebook data access requires user reauthorization"
                )

            if expires_at and expires_at <= refresh_before:
                try:
                    replacement = await exchange_facebook_token(token)
                    replacement_token = replacement["access_token"]
                    refreshed_debug = await debug_facebook_token(replacement_token)
                    if not refreshed_debug.get("is_valid"):
                        raise FacebookTokenError("Replacement token is invalid")
                    updates.update(_token_metadata(refreshed_debug, checked_at))
                    updates["facebook_access_token"] = replacement_token
                    updates["facebook_token_refresh_required"] = False
                    updates["facebook_token_error"] = None
                except FacebookTokenError as error:
                    updates["facebook_token_refresh_required"] = True
                    updates["facebook_token_error"] = str(error)

            (
                sb.table("ig_accounts")
                .update(updates)
                .eq("id", account["id"])
                .eq("owner_id", owner_id)
                .execute()
            )
        except Exception as error:
            logger.warning(
                "Facebook token maintenance failed for Instagram account %s: %s",
                account["id"],
                type(error).__name__,
            )
            (
                sb.table("ig_accounts")
                .update(
                    {
                        "facebook_token_is_valid": False,
                        "facebook_token_refresh_required": True,
                        "facebook_token_last_checked_at": checked_at.isoformat(),
                        "facebook_token_error": (
                            str(error)
                            if isinstance(error, FacebookTokenError)
                            else "Facebook token verification failed"
                        ),
                    }
                )
                .eq("id", account["id"])
                .eq("owner_id", owner_id)
                .execute()
            )
