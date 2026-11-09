from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
import logging
import httpx

from app.core.security import get_current_user
from app.core.supabase import get_supabase
from app.core.cache import cache
from app.core.config import get_settings
from app.services.instagram_profile import refresh_instagram_account_profile

logger = logging.getLogger(__name__)
router = APIRouter()
settings = get_settings()

ACCOUNT_PUBLIC_FIELDS = (
    "id",
    "username",
    "display_name",
    "profile_picture_url",
    "page_id",
    "is_active",
    "created_at",
)


class LinkAccountRequest(BaseModel):
    page_id: str
    access_token: str
    username: str


def _profile_id(sb, current_user: dict) -> str:
    profile = sb.table("customer_profiles").select("id").eq(
        "telegram_id", current_user["telegram_id"]
    ).single().execute()
    if not profile.data:
        raise HTTPException(status_code=404, detail="Профиль не найден")
    return profile.data["id"]


async def _refresh_instagram_profile(sb, account: dict) -> dict:
    """Refresh Graph /me id and public profile fields before returning them."""
    return await refresh_instagram_account_profile(sb, account)


@router.get("/")
async def list_accounts(current_user: dict = Depends(get_current_user)):
    sb = get_supabase()
    profile_id = _profile_id(sb, current_user)
    result = sb.table("ig_accounts").select(
        "id,username,display_name,profile_picture_url,page_id,is_active,"
        "created_at,access_token"
    ).eq(
        "owner_id", profile_id
    ).eq("is_active", True).execute()
    accounts = []
    for row in result.data or []:
        refreshed = await _refresh_instagram_profile(sb, dict(row))
        accounts.append(
            {field: refreshed.get(field) for field in ACCOUNT_PUBLIC_FIELDS}
        )
    logger.info("[ACCOUNTS] Returning %s active account(s)", len(accounts))
    return accounts


@router.get("/{account_id}/media")
async def list_account_media(
    account_id: str,
    current_user: dict = Depends(get_current_user),
    limit: int = Query(default=25, ge=1, le=50),
    after: Optional[str] = None,
):
    """
    Список публикаций Instagram-аккаунта для вкладки «Выбранные».
    IGAA → graph.instagram.com/me/media (fallback: /{ig-user-id}/media).
    """
    sb = get_supabase()
    profile_id = _profile_id(sb, current_user)

    account = (
        sb.table("ig_accounts")
        .select("id,page_id,access_token,is_active")
        .eq("id", account_id)
        .eq("owner_id", profile_id)
        .eq("is_active", True)
        .limit(1)
        .execute()
    )
    if not account.data:
        raise HTTPException(status_code=404, detail="Instagram аккаунт не найден")
    account_row = account.data[0]

    access_token = account_row.get("access_token")
    page_id = account_row.get("page_id")
    if not access_token:
        raise HTTPException(
            status_code=400,
            detail="У аккаунта нет Instagram-токена",
        )

    params = {
        "fields": "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp",
        "limit": limit,
        "access_token": access_token,
    }
    if after:
        params["after"] = after

    # Prefer /me/media (Instagram Login / IGAA). Fallback to /{ig-user-id}/media.
    media_urls = [
        f"https://graph.instagram.com/{settings.META_API_VERSION}/me/media",
    ]
    if page_id:
        media_urls.append(
            f"https://graph.instagram.com/{settings.META_API_VERSION}/{page_id}/media"
        )

    response = None
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            last_error_text = ""
            for media_url in media_urls:
                response = await client.get(media_url, params=params)
                if response.status_code == 200:
                    break
                last_error_text = response.text[:800]
                logger.warning(
                    "Instagram media attempt failed url=%s status=%s body=%s",
                    media_url,
                    response.status_code,
                    last_error_text,
                )
    except httpx.HTTPError:
        logger.exception("Instagram media request failed for account %s", account_id)
        raise HTTPException(
            status_code=502,
            detail="Не удалось связаться с Instagram API",
        )

    if response is None or response.status_code != 200:
        detail = "Не удалось загрузить публикации Instagram"
        try:
            if response is not None:
                err = response.json().get("error") or {}
                if err.get("message"):
                    detail = str(err["message"])
        except Exception:
            pass
        raise HTTPException(status_code=400, detail=detail)

    payload = response.json()
    media_items = []
    for item in payload.get("data") or []:
        media_type = item.get("media_type") or "IMAGE"
        preview = item.get("thumbnail_url") or item.get("media_url")
        caption = (item.get("caption") or "").strip()
        media_items.append(
            {
                "id": str(item.get("id")),
                "caption": caption[:160],
                "media_type": media_type,
                "preview_url": preview,
                "permalink": item.get("permalink"),
                "timestamp": item.get("timestamp"),
            }
        )

    paging = payload.get("paging") or {}
    cursors = paging.get("cursors") or {}
    return {
        "media": media_items,
        "paging": {
            "after": cursors.get("after"),
            "has_more": bool(paging.get("next") and cursors.get("after")),
        },
    }

@router.post("/")
async def link_account(
    body: LinkAccountRequest,
    current_user: dict = Depends(get_current_user)
):
    sb = get_supabase()
    owner_id = _profile_id(sb, current_user)

    account_data = {
        "owner_id": owner_id,
        "page_id": body.page_id,
        "access_token": body.access_token,
        "username": body.username,
        "is_active": True,
    }

    existing = (
        sb.table("ig_accounts")
        .select("id,owner_id")
        .eq("page_id", body.page_id)
        .limit(1)
        .execute()
    )

    if existing.data:
        account = existing.data[0]
        if str(account["owner_id"]) != str(owner_id):
            raise HTTPException(
                status_code=409,
                detail="Этот Instagram-аккаунт уже подключён к другому пользователю",
            )

        result = (
            sb.table("ig_accounts")
            .update(account_data)
            .eq("id", account["id"])
            .eq("owner_id", owner_id)
            .execute()
        )
    else:
        result = sb.table("ig_accounts").insert(account_data).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Не удалось сохранить Instagram-аккаунт")

    saved = result.data[0]
    return {field: saved.get(field) for field in ACCOUNT_PUBLIC_FIELDS}

@router.delete("/{account_id}")
async def unlink_account(
    account_id: str,
    current_user: dict = Depends(get_current_user)
):
    sb = get_supabase()
    profile = sb.table("customer_profiles").select("id").eq(
        "telegram_id", current_user["telegram_id"]
    ).single().execute()
    sb.table("ig_accounts").update({"is_active": False}).eq(
        "id", account_id
    ).eq("owner_id", profile.data["id"]).execute()

    active_accounts = sb.table("ig_accounts").select("id").eq(
        "owner_id", profile.data["id"]
    ).eq("is_active", True).limit(1).execute()
    if not active_accounts.data:
        sb.table("customer_profiles").update({
            "instagram_page_id": None,
            "instagram_access_token": None,
            "instagram_id": None,
            "instagram_username": None,
            "instagram_connected": False,
            "instagram_connected_at": None,
        }).eq("id", profile.data["id"]).execute()

    cache.clear()
    return {"message": "Аккаунт отвязан"}
