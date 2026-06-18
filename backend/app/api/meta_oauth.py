from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
import httpx
from app.core.config import get_settings
from app.core.security import get_current_user
from app.core.supabase import get_supabase

router = APIRouter()
settings = get_settings()

INSTAGRAM_OAUTH_URL = "https://www.instagram.com/oauth/authorize"
INSTAGRAM_TOKEN_URL = "https://api.instagram.com/oauth/access_token"
INSTAGRAM_LONG_TOKEN_URL = "https://graph.instagram.com/access_token"

SCOPES = "instagram_business_basic,instagram_business_manage_messages,instagram_business_content_publish"


@router.get("/url")
async def get_meta_oauth_url(current_user: dict = Depends(get_current_user)):
    """Генерирует ссылку для подключения Instagram аккаунта пользователя."""
    profile_id = current_user.get("profile_id") or current_user.get("id")
    params = (
        f"force_reauth=true"
        f"&client_id={settings.meta_app_id}"
        f"&redirect_uri={settings.meta_redirect_uri}"
        f"&response_type=code"
        f"&scope={SCOPES}"
        f"&state={profile_id}"
    )
    return {"url": f"{INSTAGRAM_OAUTH_URL}?{params}"}


@router.get("/callback")
async def meta_oauth_callback(code: str = None, state: str = None, error: str = None):
    """Принимает code от Instagram, обменивает на access_token, сохраняет аккаунт."""
    if error or not code:
        return RedirectResponse(url=f"{settings.webapp_url}/settings?ig_error=1")

    profile_id = state
    sb = get_supabase()

    async with httpx.AsyncClient() as client:
        # 1. Обмен code на короткий access_token
        token_resp = await client.post(
            INSTAGRAM_TOKEN_URL,
            data={
                "client_id": settings.meta_app_id,
                "client_secret": settings.meta_app_secret,
                "grant_type": "authorization_code",
                "redirect_uri": settings.meta_redirect_uri,
                "code": code,
            },
        )
        token_data = token_resp.json()
        if "access_token" not in token_data:
            return RedirectResponse(url=f"{settings.webapp_url}/settings?ig_error=1")

        short_token = token_data["access_token"]
        ig_user_id = token_data.get("user_id")

        # 2. Обмен короткого токена на долгий (60 дней)
        long_resp = await client.get(
            INSTAGRAM_LONG_TOKEN_URL,
            params={
                "grant_type": "ig_exchange_token",
                "client_secret": settings.meta_app_secret,
                "access_token": short_token,
            },
        )
        long_data = long_resp.json()
        access_token = long_data.get("access_token", short_token)

    # 3. Сохраняем в Supabase
    sb.table("ig_accounts").upsert({
        "owner_id": profile_id,
        "username": f"ig_{ig_user_id}",
        "page_id": str(ig_user_id),
        "access_token": access_token,
        "is_active": True,
    }, on_conflict="page_id").execute()

    return RedirectResponse(url=f"{settings.webapp_url}/settings?ig_success=1")
