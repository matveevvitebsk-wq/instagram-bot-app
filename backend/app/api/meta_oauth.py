# backend/app/api/meta_oauth.py
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse
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


router = APIRouter(prefix="/api/instagram", tags=["instagram"])
logger = logging.getLogger(__name__)


def close_browser_response(success: bool) -> HTMLResponse:
    message = (
        "Instagram подключен. Это окно можно закрыть."
        if success
        else "Не удалось подключить Instagram. Закройте это окно и повторите попытку."
    )
    status_code = 200 if success else 400
    return HTMLResponse(
        f"""
        <!doctype html>
        <html lang="ru">
          <head><meta charset="utf-8"><title>MediaHave</title></head>
          <body>
            <p>{message}</p>
            <script>
              window.open('', '_self');
              window.close();
            </script>
          </body>
        </html>
        """,
        status_code=status_code,
    )


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

    if not all([
        settings.META_INSTAGRAM_APP_ID,
        settings.META_INSTAGRAM_APP_SECRET,
        settings.META_REDIRECT_URI,
    ]):
        raise HTTPException(status_code=500, detail="Instagram OAuth not configured")

    state = jwt.encode(
        {
            "telegram_id": telegram_id,
            "exp": datetime.now(timezone.utc) + timedelta(minutes=15),
        },
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM,
    )
    params = {
        "client_id": settings.META_INSTAGRAM_APP_ID,
        "redirect_uri": settings.META_REDIRECT_URI,
        "response_type": "code",
        "scope": settings.meta_oauth_scopes,
        "state": state,
    }
    auth_url = f"{settings.meta_oauth_url}?{urlencode(params)}"

    return {"auth_url": auth_url}


@router.get("/auth/callback")
async def auth_callback(
    code: Optional[str] = Query(None),
    state: str = Query(...)
):
    if not code:
        return close_browser_response(False)

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

            profile_response = await client.get(
                f"https://graph.instagram.com/{settings.META_API_VERSION}/me",
                params={
                    "fields": "id,user_id,username,account_type",
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

        instagram_id = str(instagram.get("user_id") or instagram.get("id") or "")
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
                "access_token": access_token,
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

        return close_browser_response(True)

    except HTTPException as e:
        error_message = e.detail
    except JWTError:
        error_message = "Ссылка авторизации истекла. Начните подключение заново."
    except Exception:
        logger.exception("Unexpected Instagram OAuth callback failure")
        error_message = "Не удалось подключить Instagram. Попробуйте снова."

    logger.warning("Instagram OAuth callback failed: %s", error_message)
    return close_browser_response(False)


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
            .select("id,username,is_active")
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
                "status": "active",
            }

        return {
            "connected": False,
            "username": None,
            "status": "disconnected",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))