import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from app.core.config import get_settings


logger = logging.getLogger(__name__)
settings = get_settings()


class InstagramTokenError(Exception):
    """Safe Instagram token error that never contains the token itself."""


def _graph_error(response: httpx.Response) -> str:
    try:
        error = response.json().get("error", {})
        return str(error.get("message") or f"Meta returned HTTP {response.status_code}")
    except Exception:
        return f"Meta returned HTTP {response.status_code}"


def _parse_expires_at(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value
    try:
        text = str(value).replace("Z", "+00:00")
        parsed = datetime.fromisoformat(text)
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed
    except ValueError:
        return None


async def refresh_instagram_token(token: str) -> dict:
    """Refresh a valid long-lived IGAA. Token must be >= 24h old and unexpired."""
    async with httpx.AsyncClient(timeout=settings.HTTP_TIMEOUT) as client:
        response = await client.get(
            "https://graph.instagram.com/refresh_access_token",
            params={
                "grant_type": "ig_refresh_token",
                "access_token": token,
            },
        )
    if response.status_code != 200:
        raise InstagramTokenError(_graph_error(response))

    data = response.json()
    if not data.get("access_token"):
        raise InstagramTokenError("Instagram did not return a refreshed token")
    return data


async def validate_instagram_token(token: str) -> dict:
    async with httpx.AsyncClient(timeout=settings.HTTP_TIMEOUT) as client:
        response = await client.get(
            f"https://graph.instagram.com/{settings.META_API_VERSION}/me",
            params={
                "fields": "id,user_id,username",
                "access_token": token,
            },
        )
    if response.status_code != 200:
        raise InstagramTokenError(_graph_error(response))
    return response.json()


async def maintain_owner_instagram_tokens(sb, owner_id: str) -> dict:
    """
    Validate/refresh IGAA tokens stored on active ig_accounts for an owner.

    Never returns raw tokens. Updates access_token / token_expires_at in place.
    """
    result = (
        sb.table("ig_accounts")
        .select("id,page_id,access_token,token_expires_at")
        .eq("owner_id", owner_id)
        .eq("is_active", True)
        .execute()
    )

    summary = {
        "accounts": 0,
        "refreshed": 0,
        "validated": 0,
        "reauth_required": 0,
        "expires_at": None,
    }
    now = datetime.now(timezone.utc)
    refresh_before = now + timedelta(days=settings.TOKEN_REFRESH_DAYS)

    for account in result.data or []:
        token = account.get("access_token")
        if not token:
            summary["reauth_required"] += 1
            continue

        summary["accounts"] += 1
        expires_at = _parse_expires_at(account.get("token_expires_at"))
        should_refresh = expires_at is None or expires_at <= refresh_before
        updates: dict[str, Any] = {}

        try:
            if should_refresh:
                try:
                    refreshed = await refresh_instagram_token(token)
                    new_token = refreshed["access_token"]
                    expires_in = int(refreshed.get("expires_in") or 0)
                    new_expires = (
                        now + timedelta(seconds=expires_in) if expires_in > 0 else None
                    )
                    await validate_instagram_token(new_token)
                    updates = {
                        "access_token": new_token,
                        "token_expires_at": (
                            new_expires.isoformat() if new_expires else None
                        ),
                    }
                    summary["refreshed"] += 1
                    expires_at = new_expires
                    token = new_token
                except InstagramTokenError:
                    # Token may be <24h old; validate the existing one instead.
                    await validate_instagram_token(token)
                    summary["validated"] += 1
            else:
                await validate_instagram_token(token)
                summary["validated"] += 1

            if updates:
                (
                    sb.table("ig_accounts")
                    .update(updates)
                    .eq("id", account["id"])
                    .eq("owner_id", owner_id)
                    .execute()
                )
                if account.get("page_id") and updates.get("access_token"):
                    (
                        sb.table("customer_profiles")
                        .update(
                            {
                                "instagram_access_token": updates["access_token"],
                            }
                        )
                        .eq("id", owner_id)
                        .eq("instagram_page_id", account["page_id"])
                        .execute()
                    )

            if expires_at and (
                summary["expires_at"] is None
                or expires_at.isoformat() < summary["expires_at"]
            ):
                summary["expires_at"] = expires_at.isoformat()

        except Exception as error:
            logger.warning(
                "Instagram token maintenance failed for account %s: %s",
                account["id"],
                type(error).__name__,
            )
            summary["reauth_required"] += 1

    return summary
