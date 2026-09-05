# backend/app/api/meta_oauth.py
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel
import httpx
import logging
from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from typing import Optional
from app.core.config import settings
from app.core.security import get_current_user
from urllib.parse import urlencode
from app.core.supabase import get_supabase
from app.services.facebook_tokens import (
    FacebookTokenError,
    attach_facebook_token_to_owner,
    exchange_facebook_token,
)
from app.services.instagram_oauth import (
    create_instagram_oauth_state,
    expired_start_page_html,
    instagram_auth_url,
    instagram_oauth_configured,
    instagram_start_page_url,
    start_page_html,
    validate_oauth_state,
)


router = APIRouter(prefix="/api/instagram", tags=["instagram"])
logger = logging.getLogger(__name__)


def oauth_result_response(success: bool) -> RedirectResponse:
    path = "" if success else "settings"
    result = "connected" if success else "error"
    query = urlencode({"instagram": result})
    url = f"{settings.FRONTEND_URL.rstrip('/')}/{path}?{query}"
    return RedirectResponse(url=url, status_code=303)


def facebook_oauth_result_response(success: bool) -> RedirectResponse:
    result = "connected" if success else "error"
    query = urlencode({"facebook": result})
    url = f"{settings.FRONTEND_URL.rstrip('/')}/settings?{query}"
    return RedirectResponse(url=url, status_code=303)


class InstagramAuthRequest(BaseModel):
    code: str
    user_id: str

class InstagramRegisterRequest(BaseModel):
    username: str
    email: str
    password: str
    full_name: Optional[str] = None


@router.get("/meta/url")
async def get_meta_url(
    telegram_id: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    if str(current_user["telegram_id"]) != telegram_id:
        raise HTTPException(status_code=403, detail="Telegram user mismatch")

    if not instagram_oauth_configured():
        raise HTTPException(status_code=500, detail="Instagram OAuth not configured")

    state = create_instagram_oauth_state(telegram_id)
    return {
        "auth_url": instagram_auth_url(state),
        "start_page_url": instagram_start_page_url(state),
    }


@router.get("/meta/start-page", response_class=HTMLResponse)
async def instagram_oauth_start_page(state: str = Query(...)):
    if not instagram_oauth_configured() or not validate_oauth_state(state):
        return HTMLResponse(content=expired_start_page_html(), status_code=400)

    return HTMLResponse(
        content=start_page_html(instagram_auth_url(state)),
        headers={"Cache-Control": "no-store", "X-Frame-Options": "DENY"},
    )


@router.get("/facebook/url")
async def get_facebook_url(
    telegram_id: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    if str(current_user["telegram_id"]) != telegram_id:
        raise HTTPException(status_code=403, detail="Telegram user mismatch")
    if not settings.META_APP_ID or not settings.META_APP_SECRET:
        raise HTTPException(status_code=500, detail="Facebook OAuth not configured")

    state = jwt.encode(
        {
            "telegram_id": telegram_id,
            "provider": "facebook",
            "exp": datetime.now(timezone.utc) + timedelta(minutes=15),
        },
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM,
    )
    params = {
        "client_id": settings.META_APP_ID,
        "redirect_uri": settings.META_FACEBOOK_REDIRECT_URI,
        "response_type": "code",
        "state": state,
    }
    if settings.META_FACEBOOK_CONFIG_ID:
        params["config_id"] = settings.META_FACEBOOK_CONFIG_ID
    else:
        params["scope"] = settings.facebook_oauth_scopes
    return {
        "auth_url": (
            f"https://www.facebook.com/{settings.META_API_VERSION}/dialog/oauth"
            f"?{urlencode(params)}"
        )
    }


@router.get("/facebook/callback")
async def facebook_auth_callback(
    code: Optional[str] = Query(None),
    state: str = Query(...),
):
    if not code:
        return facebook_oauth_result_response(False)

    try:
        state_data = jwt.decode(
            state,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
        )
        if state_data.get("provider") != "facebook":
            raise HTTPException(status_code=400, detail="Invalid OAuth provider")
        telegram_id = str(state_data["telegram_id"])

        async with httpx.AsyncClient(timeout=settings.HTTP_TIMEOUT) as client:
            response = await client.get(
                f"{settings.meta_api_base}/oauth/access_token",
                params={
                    "client_id": settings.META_APP_ID,
                    "client_secret": settings.META_APP_SECRET,
                    "redirect_uri": settings.META_FACEBOOK_REDIRECT_URI,
                    "code": code,
                },
            )
        if response.status_code != 200:
            raise FacebookTokenError("Facebook rejected the authorization code")
        short_token = response.json().get("access_token")
        if not short_token:
            raise FacebookTokenError("Facebook did not return an access token")

        # Facebook Login for Business can return the configured System User
        # token directly. Standard Facebook Login returns a short-lived User
        # token which must be exchanged.
        facebook_token = short_token
        if not settings.META_FACEBOOK_CONFIG_ID:
            facebook_token = (
                await exchange_facebook_token(short_token)
            )["access_token"]
        sb = get_supabase()
        profile = (
            sb.table("customer_profiles")
            .select("id")
            .eq("telegram_id", telegram_id)
            .single()
            .execute()
        )
        if not profile.data:
            raise FacebookTokenError("Telegram profile not found")
        await attach_facebook_token_to_owner(
            sb, profile.data["id"], facebook_token
        )
        return facebook_oauth_result_response(True)
    except Exception:
        logger.exception("Facebook OAuth callback failed")
        return facebook_oauth_result_response(False)


@router.get("/auth/callback")
async def auth_callback(
    code: Optional[str] = Query(None),
    state: str = Query(...)
):
    if not code:
        return oauth_result_response(False)

    try:
        state_data = jwt.decode(
            state,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
        )
        telegram_id = str(state_data["telegram_id"])

        if not all([
            settings.META_INSTAGRAM_APP_ID,
            settings.META_INSTAGRAM_APP_SECRET,
            settings.META_REDIRECT_URI,
        ]):
            raise HTTPException(status_code=500, detail="Instagram OAuth not configured")

        async with httpx.AsyncClient(timeout=settings.HTTP_TIMEOUT) as client:
            token_response = await client.post(
                "https://api.instagram.com/oauth/access_token",
                data={
                    "client_id": settings.META_INSTAGRAM_APP_ID,
                    "client_secret": settings.META_INSTAGRAM_APP_SECRET,
                    "grant_type": "authorization_code",
                    "redirect_uri": settings.META_REDIRECT_URI,
                    "code": code,
                },
            )
            if token_response.status_code != 200:
                logger.error(
                    "Instagram authorization-code exchange failed: status=%s response=%s",
                    token_response.status_code,
                    token_response.text[:1000],
                )
                raise HTTPException(
                    status_code=400,
                    detail="Instagram rejected the authorization code",
                )

            short_lived_token = token_response.json().get("access_token")
            if not short_lived_token:
                raise HTTPException(
                    status_code=400,
                    detail="Instagram did not return an access token",
                )

            long_token_response = await client.get(
                "https://graph.instagram.com/access_token",
                params={
                    "grant_type": "ig_exchange_token",
                    "client_secret": settings.META_INSTAGRAM_APP_SECRET,
                    "access_token": short_lived_token,
                },
            )
            if long_token_response.status_code != 200:
                logger.error(
                    "Instagram long-lived token exchange failed: status=%s response=%s",
                    long_token_response.status_code,
                    long_token_response.text[:1000],
                )
                raise HTTPException(
                    status_code=400,
                    detail="Failed to exchange for a long-lived Instagram token",
                )

            access_token = long_token_response.json().get("access_token")
            if not access_token:
                raise HTTPException(
                    status_code=400,
                    detail="Instagram did not return a long-lived access token",
                )
            expires_in = int(long_token_response.json().get("expires_in", 0))
            token_expires_at = (
                datetime.now(timezone.utc) + timedelta(seconds=expires_in)
                if expires_in > 0
                else None
            )

            profile_response = await client.get(
                f"https://graph.instagram.com/{settings.META_API_VERSION}/me",
                params={
                    "fields": (
                        "id,user_id,username,name,account_type,"
                        "profile_picture_url,followers_count"
                    ),
                    "access_token": access_token,
                },
            )
            if profile_response.status_code != 200:
                logger.error(
                    "Instagram profile request failed: status=%s response=%s",
                    profile_response.status_code,
                    profile_response.text[:1000],
                )
                raise HTTPException(
                    status_code=400,
                    detail="Failed to retrieve the Instagram account",
                )
            instagram = profile_response.json()

        instagram_id = str(instagram.get("user_id") or "")
        instagram_username = instagram.get("username")
        if not instagram_id or not instagram_username:
            raise HTTPException(
                status_code=400,
                detail="Instagram account data is incomplete",
            )

        sb = get_supabase()
        profile = (
            sb.table("customer_profiles")
            .select("id")
            .eq("telegram_id", telegram_id)
            .single()
            .execute()
        )
        if not profile.data:
            raise HTTPException(status_code=404, detail="Telegram profile not found")

        sb.table("ig_accounts").upsert(
            {
                "owner_id": profile.data["id"],
                "page_id": instagram_id,
                "username": instagram_username,
                "display_name": instagram.get("name"),
                "profile_picture_url": instagram.get("profile_picture_url"),
                "followers_count": instagram.get("followers_count", 0),
                "access_token": access_token,
                "token_expires_at": (
                    token_expires_at.isoformat() if token_expires_at else None
                ),
                "is_active": True,
            },
            on_conflict="page_id",
        ).execute()
        sb.table("customer_profiles").update(
            {
                "instagram_page_id": instagram_id,
                "instagram_access_token": access_token,
            }
        ).eq("telegram_id", telegram_id).execute()

        return oauth_result_response(True)

    except HTTPException as e:
        error_message = e.detail
    except JWTError:
        error_message = "Ссылка авторизации истекла. Начните подключение заново."
    except Exception:
        logger.exception("Unexpected Instagram OAuth callback failure")
        error_message = "Не удалось подключить Instagram. Попробуйте снова."

    logger.warning("Instagram OAuth callback failed: %s", error_message)
    return oauth_result_response(False)


@router.post("/register")
async def register_instagram_account(data: InstagramRegisterRequest):
    """
    Регистрация нового Instagram аккаунта
    """
    try:
        # В реальном проекте здесь должна быть интеграция с Instagram API
        # или создание записи в БД для последующей регистрации
        
        return {
            "success": True,
            "message": "Аккаунт создан. Пожалуйста, подтвердите регистрацию в Instagram.",
            "verification_required": True,
            "username": data.username
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status/{user_id}")
async def get_instagram_status(
    user_id: str,
    current_user: dict = Depends(get_current_user),
):
    if str(current_user["telegram_id"]) != user_id:
        raise HTTPException(status_code=403, detail="Telegram user mismatch")

    try:
        sb = get_supabase()
        profiles = (
            sb.table("customer_profiles")
            .select("id")
            .eq("telegram_id", user_id)
            .limit(1)
            .execute()
        )
        if not profiles.data:
            return {
                "connected": False,
                "username": None,
                "status": "disconnected",
            }

        accounts = (
            sb.table("ig_accounts")
            .select(
                "id,username,display_name,profile_picture_url,is_active,"
                "facebook_token_is_valid,facebook_token_refresh_required,"
                "facebook_token_expires_at,facebook_token_last_checked_at"
            )
            .eq("owner_id", profiles.data[0]["id"])
            .eq("is_active", True)
            .limit(1)
            .execute()
        )
        if accounts.data:
            account = accounts.data[0]
            return {
                "id": account["id"],
                "connected": True,
                "username": account["username"],
                "display_name": account.get("display_name"),
                "profile_picture_url": account.get("profile_picture_url"),
                "facebook_token_is_valid": account.get(
                    "facebook_token_is_valid", False
                ),
                "facebook_token_refresh_required": account.get(
                    "facebook_token_refresh_required", False
                ),
                "facebook_token_expires_at": account.get(
                    "facebook_token_expires_at"
                ),
                "facebook_token_last_checked_at": account.get(
                    "facebook_token_last_checked_at"
                ),
                "status": "active",
            }

        return {
            "connected": False,
            "username": None,
            "status": "disconnected",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))