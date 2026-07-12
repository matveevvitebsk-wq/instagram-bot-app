from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from app.core.config import settings
from app.core.security import get_current_user
from app.core.supabase import get_supabase
import httpx
from datetime import datetime, timedelta
from urllib.parse import urlencode

router = APIRouter(prefix="/api/auth/meta", tags=["meta_oauth"])


@router.get("/url")
async def get_meta_oauth_url(current_user: dict = Depends(get_current_user)):
    """
    Генерирует URL для подключения Instagram через Meta OAuth.

    DEVELOPMENT_MODE=true  — работает только для тестеров из Meta Console.
    DEVELOPMENT_MODE=false — работает для всех (после ИП + App Review).
    """



    sb = get_supabase()

    telegram_id = current_user["telegram_id"]

    profile = (
        sb.table("customer_profiles")
        .select("id")
        .eq("telegram_id", telegram_id)
        .single()
        .execute()
    )

    profile_id = profile.data["id"]

    params = {
        "client_id": settings.META_APP_ID,
        "redirect_uri": settings.META_REDIRECT_URI,
        "response_type": "code",
        "scope": settings.meta_oauth_scopes,
        "state": profile_id,
    }     

    oauth_url = (
        f"{settings.facebook_oauth_url}?"
        + urlencode(params)
    )  

    return {
        "url": oauth_url,
        "mode": "development" if settings.DEVELOPMENT_MODE else "production",
        "warning": (
            "Подключение доступно только тестерам Meta."
            if settings.DEVELOPMENT_MODE
            else None
        ),
    }
        # f"https://api.instagram.com/oauth/authorize"
        # f"?client_id={settings.META_APP_ID}"
        # f"&redirect_uri={settings.META_REDIRECT_URI}"
        # f"&scope={settings.meta_oauth_scopes}"
        # f"&response_type=code"
        # f"&state={profile_id}"

    # return {
    #     "url": oauth_url,
    #     "mode": "development" if settings.DEVELOPMENT_MODE else "production",
    #     "warning": (
    #         "Режим разработки: подключить аккаунт могут только тестеры из Meta Console."
    #         if settings.DEVELOPMENT_MODE
    #         else None
    #     ),
    # }


@router.get("/callback")
async def meta_oauth_callback(
    code: str = Query(...),
    state: str = Query(...),
    error: str = Query(None),
    error_reason: str = Query(None),
):
    """
    Callback от Meta после авторизации пользователя.
    Обменивает code → short-lived token → long-lived token (60 дней).
    Сохраняет аккаунт в ig_accounts.
    """
    # Пользователь отказал
    if error:
        return RedirectResponse(
            f"https://almarathon.com/settings?instagram=error&reason={error_reason or error}"
        )

    profile_id = state


    async with httpx.AsyncClient() as client:

        # --- Шаг 1: code → short-lived token (1 час) ---
        token_resp = await client.post(
            "https://api.instagram.com/oauth/access_token",
            data={
                "client_id": settings.META_APP_ID,
                "client_secret": settings.META_APP_SECRET,
                "grant_type": "authorization_code",
                "redirect_uri": settings.META_REDIRECT_URI,
                "code": code,
            },
        )
        token_data = token_resp.json()

        if "error_message" in token_data or "error" in token_data:
            error_msg = token_data.get("error_message") or str(token_data.get("error"))
            return RedirectResponse(
                f"https://almarathon.com/settings?instagram=error&reason={error_msg}"
            )

        short_token = token_data["access_token"]
        ig_user_id = str(token_data["user_id"])

        # --- Шаг 2: short-lived → long-lived token (60 дней) ---
        long_resp = await client.get(
            f"{settings.meta_api_base}/access_token",
            params={
                "grant_type": "ig_exchange_token",
                "client_secret": settings.META_APP_SECRET,
                "access_token": short_token,
            },
        )
        long_data = long_resp.json()

        if "error" in long_data:
            return RedirectResponse(
                "https://almarathon.com/settings?instagram=error&reason=token_exchange_failed"
            )

        long_token = long_data["access_token"]
        expires_in = long_data.get("expires_in", 5184000)  # ~60 дней

        # --- Шаг 3: получить данные аккаунта ---
        me_resp = await client.get(
            f"{settings.meta_api_base}/{ig_user_id}",
            params={
                "fields": "id,username,name,profile_picture_url,followers_count",
                "access_token": long_token,
            },
        )
        me_data = me_resp.json()

    # --- Шаг 4: сохранить в Supabase ---
    token_expires_at = (
        datetime.utcnow() + timedelta(seconds=expires_in)
    ).isoformat()

    get_supabase().table("ig_accounts").upsert(
        {
            "owner_id": profile_id,
            "page_id": ig_user_id,
            "username": me_data.get("username", ""),
            "display_name": me_data.get("name", ""),
            "profile_picture_url": me_data.get("profile_picture_url", ""),
            "followers_count": me_data.get("followers_count", 0),
            "access_token": long_token,
            "token_expires_at": token_expires_at,
            "is_active": True,
            "mode": "development" if settings.DEVELOPMENT_MODE else "production",
        },
        on_conflict="owner_id,page_id",
    ).execute()

    # --- Шаг 5: редирект обратно в Mini App ---
    return RedirectResponse(
        f"https://almarathon.com/settings?instagram=connected&username={me_data.get('username', '')}"
    )


@router.delete("/disconnect")
async def disconnect_instagram(current_user: dict = Depends(get_current_user)):
    """
    Деактивирует Instagram аккаунт (is_active=false), токен не удаляет.
    """
    sb = get_supabase()
    telegram_id = current_user["telegram_id"]
    profile = sb.table("customer_profiles").select("id").eq(
        "telegram_id", telegram_id
    ).single().execute()
    profile_id = profile.data["id"]

    sb.table("ig_accounts").update({"is_active": False}).eq(
        "owner_id", profile_id
    ).execute()

    return {"status": "disconnected"}
