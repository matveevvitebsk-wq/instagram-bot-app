# backend/app/api/meta_oauth.py
from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel
import httpx
import os
import jwt
import json
from datetime import datetime, timedelta
from typing import Optional
from app.core.config import settings
from fastapi import Query
from urllib.parse import urlencode, quote
from app.core.supabase import get_supabase


router = APIRouter(prefix="/api/instagram", tags=["instagram"])

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
    telegram_id: str = Query(...)
):
    # """
    # Генерирует URL для OAuth авторизации через Facebook.
    # Использует Facebook OAuth диалог для получения доступа к Instagram Business API.
    # """
    # ═══════════════════════════════════════════════════════════════════
    # ИСПРАВЛЕНО (24.07.2026): Instagram Business API OAuth URL
    #
    #   Использует Instagram App ID (META_INSTAGRAM_APP_ID) для client_id,
    #   чтобы на странице подтверждения Instagram показывал название
    #   приложения "n8n-call-api-IG", а не ID Facebook App.
    #
    #   Параметр state передаёт telegram_id (поддерживается Instagram OAuth)
    # ═══════════════════════════════════════════════════════════════════
    print("=" * 50)
    print("META_OAUTH_URL =", settings.meta_oauth_url)
    print("META_APP_ID =", settings.META_APP_ID)
    print("META_INSTAGRAM_APP_ID =", settings.META_INSTAGRAM_APP_ID)
    print("META_REDIRECT_URI =", settings.META_REDIRECT_URI)
    print("=" * 50)

    # Используем Facebook OAuth URL
    # Instagram Business API авторизуется через Facebook Login
    params = {
        "client_id": settings.META_APP_ID,  # ВАЖНО: Facebook App ID
        "redirect_uri": settings.META_REDIRECT_URI,
        "response_type": "code",
        "scope": settings.meta_oauth_scopes,
        "state": telegram_id,
    }
    
    # Правильный endpoint для бизнес-аккаунтов
    auth_url = f"https://www.facebook.com/{settings.META_API_VERSION}/dialog/oauth?{urlencode(params)}"
    # ═══════════════════════════════════════════════════════════════════
    # ИСПРАВЛЕНО (28.07.2026): client_id = Facebook App ID (не Instagram)
    #   Facebook Login OAuth требует Facebook App ID как client_id.
    #   Instagram App ID (META_INSTAGRAM_APP_ID) НЕ является
    #   зарегистрированным Facebook Login-приложением — выдаёт ошибку
    #   "PLATFORM__INVALID_APP_ID".
    #
    #   Instagram App ID используется ТОЛЬКО внутри Facebook App
    #   (в настройках Instagram App в Meta Developer Console).
    # ═══════════════════════════════════════════════════════════════════
    # params={
    #     "client_id": settings.META_APP_ID,
    #     "redirect_uri": settings.META_REDIRECT_URI,
    #     "response_type": "code",
    #     "scope": settings.meta_oauth_scopes,
    #     "state": telegram_id,
    #     # Опционально: запрашиваем доступ к страницам
    #     "auth_type": "rerequest",
    # }
    # # Используем Facebook Graph API для OAuth
    # auth_url = f"https://www.facebook.com/{settings.META_API_VERSION}/dialog/oauth?{urlencode(params)}"


    # auth_url=(
    #     f"{settings.meta_oauth_url}?"
    #     f"{urlencode(params)}"
    # )
    # ═══════════════════════════════════════════════════════════════════
    # DEBUG: сформированный OAuth URL для диагностики в логах
    # ═══════════════════════════════════════════════════════════════════
    print("=" * 50)
    print("AUTH_URL =", auth_url)
    print("=" * 50)
    return {
        "auth_url":auth_url
    }


@router.get("/auth/callback")
async def auth_callback(
    # code:str,
    code: Optional[str] = Query(None),
    state: str = Query(...)
):
    # ═══════════════════════════════════════════════════════════════════
    # ИСПРАВЛЕНО (24.07.2026): Instagram Business Login token exchange
    #
    #   OAuth URL использует Instagram App ID (META_INSTAGRAM_APP_ID)
    #   Token exchange использует Facebook App ID (META_APP_ID) через
    #   Facebook Graph API — это правильный flow для Business Login.
    #
    #   Шаг 1: обмен code на short-lived token через Facebook Graph API
    #           (client_id = Facebook App ID, client_secret = Facebook App Secret)
    #
    #   Шаг 2: обмен short-lived на long-lived token (60 дней)
    #
    #   Шаг 3: получение Instagram Business аккаунта через Facebook Pages
    # ═══════════════════════════════════════════════════════════════════
    telegram_id=state
    
    if not code:
        return """
            <html><body>
                <h2>Авторизация отменена</h2>
                <p>Пожалуйста, попробуйте снова.</p>
                <script>
                setTimeout(()=>{
                    window.location.href="https://t.me/mediahave_bot";
                },3000);
                </script>
            </body></html>
        """

    try:
        facebook_app_id = settings.META_APP_ID
        facebook_app_secret = settings.META_APP_SECRET
        redirect_uri = settings.META_REDIRECT_URI

        print("=" * 50)
        print("CODE =", code[:50])
        print("META_APP_ID =", facebook_app_id)
        print("META_APP_SECRET =", facebook_app_secret[:10] + "...")
        print("META_REDIRECT_URI =", redirect_uri)
        print("=" * 50)

        if not all([facebook_app_id, facebook_app_secret, redirect_uri]):
            raise HTTPException(status_code=500, detail="Instagram OAuth not configured")

        # ═══════════════════════════════════════════════════════════════════
        # Шаг 1: обмен code на short-lived token через Facebook Graph API
        #
        #   ИСПРАВЛЕНО (28.07.2026): GET → POST
        #   Facebook Graph API требует POST-запрос с data (form-urlencoded),
        #   а не GET с params. GET вызывает ошибку 36008 
        #   "redirect_uri is not identical".
        #
        #   redirect_uri передаётся как есть (без quote/urlencode),
        #   httpx сам корректно кодирует form-urlencoded.
        # ═══════════════════════════════════════════════════════════════════
        async with httpx.AsyncClient() as client:
            token_response = await client.post(
                f"{settings.meta_graph_api}/oauth/access_token",
                data={
                    "client_id": facebook_app_id,
                    "client_secret": facebook_app_secret,
                    "grant_type": "authorization_code",
                    "redirect_uri": redirect_uri,
                    "code": code
                }
            )

            print("=" * 50)
            print("STATUS =", token_response.status_code)
            print("RESPONSE =", token_response.text)
            print("=" * 50)

            if token_response.status_code != 200:
                error_detail = token_response.text
                raise HTTPException(
                    status_code=400, 
                    # detail=f"Failed to get access token: {error_detail}"
                    detail=token_response.text
                )

            token_data = token_response.json()
            short_lived_token = token_data.get("access_token")

            # Шаг 2: обмениваем short-lived на long-lived (60 дней)
            long_token_response = await client.get(
                f"{settings.meta_graph_api}/oauth/access_token",
                params={
                    "grant_type": "fb_exchange_token",
                    "client_id": facebook_app_id,
                    "client_secret": facebook_app_secret,
                    "fb_exchange_token": short_lived_token
                }
            )

            if long_token_response.status_code != 200:
                raise HTTPException(status_code=400, detail="Failed to exchange for long-lived token")

            long_token_data = long_token_response.json()
            access_token = long_token_data.get("access_token")

            # Шаг 3: получаем страницы Facebook пользователя
            pages_response = await client.get(
                f"{settings.meta_graph_api}/me/accounts",
                params={
                    "access_token": access_token,
                    "fields": "id,name,instagram_business_account{id,username}"
                }
            )

            if pages_response.status_code != 200:
                raise HTTPException(status_code=400, detail="Failed to get Facebook Pages")

            pages_data = pages_response.json()
            instagram_username = ""
            instagram_id = ""

            # Ищем страницу с подключённым Instagram Business аккаунтом
            for page in pages_data.get("data", []):
                ig_account = page.get("instagram_business_account")
                if ig_account:
                    instagram_id = ig_account.get("id", "")
                    instagram_username = ig_account.get("username", "")
                    break

            if not instagram_id:
                raise HTTPException(status_code=400, detail="No Instagram Business account connected to any Facebook Page")

        # Шаг 4: сохраняем в Supabase
        sb = get_supabase()
        sb.table("customer_profiles").update({
            "instagram_connected": True,
            "instagram_username": instagram_username,
            "instagram_id": instagram_id,
            "instagram_access_token": access_token
        }).eq("telegram_id", telegram_id).execute()

        return """
            <html>
            <body>
                <h2>Instagram подключен.</h2>

                <script>
                setTimeout(()=>{
                    window.location.href="https://t.me/mediahave_bot";
                },2000);
                </script>
            </body>
            </html>
        """

    except Exception as e:
        return f"""
            <html>
            <body>
                <h2>Ошибка подключения Instagram</h2>
                # <p>{str(e)}</p>
                <script>
                setTimeout(()=>{{
                    window.location.href="https://t.me/mediahave_bot";
                }},3000);
                </script>
            </body>
            </html>
        """
    except HTTPException as e:
        return f"""
            <html>
            <body>
                <h2>Ошибка подключения Instagram</h2>
                <p>{e.detail}</p>
                <script>
                setTimeout(()=>{{
                    window.location.href="https://t.me/mediahave_bot";
                }},5000);
                </script>
            </body>
            </html>
        """
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
async def get_instagram_status(user_id: str):
    """
    Получение статуса подключения Instagram аккаунта
    """
    try:
        # Проверка в БД
        # Здесь возвращаем заглушку
        
        return {
            "connected": False,
            "username": None,
            "status": "disconnected"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))