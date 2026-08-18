"""Check whether an Instagram user follows a connected professional account.

Meta does not expose a public followers list or a username lookup for this.
The official field is `is_user_follow_business` on the User Profile API,
using the Instagram-scoped ID (IGSID) from a messaging or comment webhook.

Call Graph from FastAPI. Do not put bearer tokens in n8n.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)

PROFILE_FIELDS = (
    "is_user_follow_business,is_business_follow_user,username,follower_count"
)

# Meta Graph codes that are typically retryable (rate limits / transient).
RETRYABLE_GRAPH_CODES = {1, 2, 4, 17, 32, 613, 80007}

ACCOUNT_COLUMNS = (
    "id,owner_id,page_id,username,is_active,"
    "access_token,facebook_access_token"
)


class FollowerCheckError(Exception):
    """Safe follower-check failure. Message must never include a token."""

    def __init__(
        self,
        message: str,
        *,
        error_code: str,
        retryable: bool = False,
        consent_required: bool = False,
        graph_status: Optional[int] = None,
    ):
        super().__init__(message)
        self.message = message
        self.error_code = error_code
        self.retryable = retryable
        self.consent_required = consent_required
        self.graph_status = graph_status


def _graph_error_payload(response: httpx.Response) -> dict[str, Any]:
    try:
        payload = response.json()
    except Exception:
        return {}
    error = payload.get("error")
    return error if isinstance(error, dict) else {}


def classify_graph_error(response: httpx.Response) -> FollowerCheckError:
    error = _graph_error_payload(response)
    graph_code = error.get("code")
    message = str(error.get("message") or f"Meta returned HTTP {response.status_code}")
    lowered = message.lower()

    if "consent" in lowered:
        return FollowerCheckError(
            "User consent is required before follow status can be read",
            error_code="consent_required",
            retryable=False,
            consent_required=True,
            graph_status=response.status_code,
        )
    if graph_code == 190 or "access token" in lowered or "oauth" in lowered:
        return FollowerCheckError(
            "Instagram access token is invalid or expired",
            error_code="token_invalid",
            retryable=False,
            graph_status=response.status_code,
        )
    retryable = (
        response.status_code >= 500
        or graph_code in RETRYABLE_GRAPH_CODES
        or "rate limit" in lowered
    )
    return FollowerCheckError(
        "Instagram follow status request failed",
        error_code="graph_error" if not retryable else "rate_limited",
        retryable=retryable,
        graph_status=response.status_code,
    )


def select_graph_credentials(account: dict) -> tuple[str, str, str]:
    """Return (host, token, token_kind). Prefer Instagram Login (IGAA)."""
    igaa = str(account.get("access_token") or "").strip()
    if igaa:
        return "https://graph.instagram.com", igaa, "igaa"
    eaav = str(account.get("facebook_access_token") or "").strip()
    if eaav:
        return "https://graph.facebook.com", eaav, "eaav"
    raise FollowerCheckError(
        "The Instagram account has no usable access token",
        error_code="missing_token",
        retryable=False,
    )


def resolve_ig_account(
    sb,
    *,
    ig_account_id: Optional[str] = None,
    instagram_account_id: Optional[str] = None,
) -> dict:
    query = (
        sb.table("ig_accounts")
        .select(ACCOUNT_COLUMNS)
        .eq("is_active", True)
    )
    if ig_account_id:
        query = query.eq("id", ig_account_id)
    elif instagram_account_id:
        query = query.eq("page_id", str(instagram_account_id))
    else:
        raise FollowerCheckError(
            "ig_account_id or instagram_account_id is required",
            error_code="missing_account",
            retryable=False,
        )

    result = query.limit(1).execute()
    rows = result.data or []
    if not rows:
        raise FollowerCheckError(
            "Active Instagram account not found",
            error_code="account_not_found",
            retryable=False,
        )
    return rows[0]


def load_task_subscription_flag(sb, task_id: str, owner_id: str) -> Optional[bool]:
    result = (
        sb.table("automation_tasks")
        .select("id,owner_id,check_subscription")
        .eq("id", task_id)
        .eq("owner_id", owner_id)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    if not rows:
        raise FollowerCheckError(
            "Automation task not found for this account owner",
            error_code="task_not_found",
            retryable=False,
        )
    return bool(rows[0].get("check_subscription", True))


def skipped_result(account: dict, reason: str) -> dict:
    return {
        "ok": True,
        "operation": "check_follower",
        "skipped": True,
        "follows": True,
        "is_user_follow_business": None,
        "is_business_follow_user": None,
        "username": None,
        "consent_required": False,
        "retryable": False,
        "error_code": None,
        "reason": reason,
        "account_id": account.get("id"),
        "instagram_account_id": account.get("page_id"),
        "token_kind": None,
    }


def success_result(account: dict, profile: dict, token_kind: str) -> dict:
    follows = bool(profile.get("is_user_follow_business"))
    return {
        "ok": True,
        "operation": "check_follower",
        "skipped": False,
        "follows": follows,
        "is_user_follow_business": follows,
        "is_business_follow_user": (
            bool(profile.get("is_business_follow_user"))
            if "is_business_follow_user" in profile
            else None
        ),
        "username": profile.get("username"),
        "consent_required": False,
        "retryable": False,
        "error_code": None,
        "reason": None,
        "account_id": account.get("id"),
        "instagram_account_id": account.get("page_id"),
        "token_kind": token_kind,
    }


def error_result(exc: FollowerCheckError, account: Optional[dict] = None) -> dict:
    return {
        "ok": False,
        "operation": "check_follower",
        "skipped": False,
        "follows": None,
        "is_user_follow_business": None,
        "is_business_follow_user": None,
        "username": None,
        "consent_required": exc.consent_required,
        "retryable": exc.retryable,
        "error_code": exc.error_code,
        "reason": exc.message,
        "account_id": (account or {}).get("id"),
        "instagram_account_id": (account or {}).get("page_id"),
        "token_kind": None,
    }


async def fetch_follow_profile(
    *,
    host: str,
    token: str,
    target_igsid: str,
    client: Optional[httpx.AsyncClient] = None,
) -> dict:
    settings = get_settings()
    url = f"{host}/{settings.META_API_VERSION}/{target_igsid}"
    params = {"fields": PROFILE_FIELDS, "access_token": token}

    owns_client = client is None
    if owns_client:
        client = httpx.AsyncClient(timeout=settings.HTTP_TIMEOUT)
    assert client is not None
    try:
        response = await client.get(url, params=params)
    except httpx.HTTPError:
        logger.warning("Instagram follow-status transport error igsid=%s", target_igsid)
        raise FollowerCheckError(
            "Could not reach Instagram Graph API",
            error_code="graph_unreachable",
            retryable=True,
        )
    finally:
        if owns_client:
            await client.aclose()

    if response.status_code != 200:
        raise classify_graph_error(response)

    try:
        profile = response.json()
    except Exception:
        raise FollowerCheckError(
            "Instagram returned an unreadable follow-status payload",
            error_code="graph_error",
            retryable=True,
            graph_status=response.status_code,
        )

    if "is_user_follow_business" not in profile:
        raise FollowerCheckError(
            "Instagram did not return follow status for this user",
            error_code="follow_status_unavailable",
            retryable=False,
        )
    return profile


async def check_user_follows_account(
    sb,
    *,
    target_igsid: str,
    ig_account_id: Optional[str] = None,
    instagram_account_id: Optional[str] = None,
    task_id: Optional[str] = None,
    client: Optional[httpx.AsyncClient] = None,
) -> dict:
    igsid = str(target_igsid or "").strip()
    if not igsid:
        raise FollowerCheckError(
            "target_igsid is required",
            error_code="missing_igsid",
            retryable=False,
        )

    account = resolve_ig_account(
        sb,
        ig_account_id=ig_account_id,
        instagram_account_id=instagram_account_id,
    )

    if task_id:
        check_subscription = load_task_subscription_flag(
            sb, task_id, account["owner_id"]
        )
        if not check_subscription:
            return skipped_result(account, "check_subscription_disabled")

    host, token, token_kind = select_graph_credentials(account)
    profile = await fetch_follow_profile(
        host=host,
        token=token,
        target_igsid=igsid,
        client=client,
    )
    return success_result(account, profile, token_kind)
