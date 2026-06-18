from fastapi import APIRouter, Depends
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
    sb = get_supabase()
    # Получаем profile_id из Supabase по telegram_id
    result = sb.table("customer_profiles").select("id").eq(
        "telegram_id", current_user["telegram_id"]
    ).single().execute()
    profile_id = result.data["id"]
    print(f"[META OAUTH] Generating URL for profile_id={profile_id}")
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
    print(f"[META OAUTH] Callback: code={code[:10] if code else None}, state={state}, error={error}")

    if error or not code:
        return RedirectResponse(url=f"{settings.webapp_url}/settings?ig_error=1")

    if not state or state == "None":
        print(f"[META OAUTH] ERROR: state is empty")
        return RedirectResponse(url=f"{settings.webapp_url}/settings?ig_error=2")

    profile_id = state
    sb = get_supabase()

    async with httpx.AsyncClient() as client:
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
        print(f"[META OAUTH] Token response: {token_data}")

        if "access_token" not in token_data:
            return RedirectResponse(url=f"{settings.webapp_url}/settings?ig_error=1")

        short_token = token_data["access_token"]
        ig_user_id = token_data.get("user_id")

        long_resp = await client.get(
            INSTAGRAM_LONG_TOKEN_URL,
            params={
                "grant_type": "ig_exchange_token",
                "client_secret": settings.meta_app_secret,
                "access_token": short_token,
            },
        )
        long_data = long_resp.json()
        print(f"[META OAUTH] Long token response: {long_data}")
        access_token = long_data.get("access_token", short_token)

    sb.table("ig_accounts").upsert({
        "owner_id": profile_id,
        "page_id": str(ig_user_id),
        "access_token": access_token,
        "username": f"ig_{ig_user_id}",
        "is_active": True,
    }, on_conflict="page_id").execute()

    return RedirectResponse(url=f"{settings.webapp_url}/settings?ig_success=1")
