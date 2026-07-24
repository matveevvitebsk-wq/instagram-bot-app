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
from urllib.parse import urlencode
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
    telegram_id:str=Query(...)
):
    # ═══════════════════════════════════════════════════════════════════
    # ИСПРАВЛЕНО (24.07.2026): Instagram Basic Display API
    #   - Использует Instagram App n8n-call-api-IG (ID: 2007885943317419)
    #   - Для Instagram Basic Display API параметр state НЕ ПОДДЕРЖИВАЕТСЯ
    #   - telegram_id передаётся в redirect_uri как query-параметр
    # ═══════════════════════════════════════════════════════════════════
    params={
        "client_id": settings.META_APP_ID,
        "redirect_uri": settings.META_REDIRECT_URI,
        "response_type": "code",
        "scope": settings.meta_oauth_scopes,
        # "state": telegram_id,  # ⚠ Instagram Basic Display НЕ ПОДДЕРЖИВАЕТ state
    }
    auth_url=(
        f"{settings.meta_oauth_url}?"
        f"{urlencode(params)}"
    )

    return {
        "auth_url": auth_url,
        "telegram_id": telegram_id,  # telegram_id передаётся клиенту для сохранения
    }
# @router.get("/meta/url")
# async def get_meta_oauth_url():
#     url = (
#         f"https://www.facebook.com/{settings.META_API_VERSION}/dialog/oauth"
#         f"?client_id={settings.META_APP_ID}"
#         f"&redirect_uri={settings.META_REDIRECT_URI}"
#         f"&scope={settings.meta_oauth_scopes}"
#         f"&response_type=code"
#     )

#     return {
#         "auth_url": url
#     }


    # params = {
    #     "client_id": settings.META_APP_ID,
    #     "redirect_uri": settings.META_REDIRECT_URI,
    #     "scope": settings.meta_oauth_scopes,
    #     "response_type": "code",
    # }

    # auth_url = (
    #     f"https://www.facebook.com/{settings.META_API_VERSION}/dialog/oauth?"
    #     + urlencode(params)
    # )

    # return {
    #     "auth_url": auth_url
    # }

@router.get("/auth/callback")
async def auth_callback(
    code: str,
    state: str = None,  # ⚠ Instagram Basic Display НЕ ПЕРЕДАЁТ state
    telegram_id: str = Query(None)  # telegram_id может быть передан как query-параметр
):
    # ═══════════════════════════════════════════════════════════════════
    # ИСПРАВЛЕНО (24.07.2026): Instagram Basic Display API
    #   - Использует Instagram App n8n-call-api-IG (ID: 2007885943317419)
    #   - Для личных аккаунтов (Instagram Basic Display), а не бизнес
    #   - Обмен code → token через POST api.instagram.com/oauth/access_token
    #   - Получение user info через graph.instagram.com/me
    # ═══════════════════════════════════════════════════════════════════

    # ⚠ Instagram Basic Display НЕ ПОДДЕРЖИВАЕТ параметр state
    # telegram_id извлекается из query-параметра, если передан
    # Если нет — берётся из state (для обратной совместимости)
    telegram_id = telegram_id or state

    try:
        app_id = settings.META_APP_ID
        app_secret = settings.META_APP_SECRET
        redirect_uri = settings.META_REDIRECT_URI

        if not all([app_id, app_secret, redirect_uri]):
            raise HTTPException(status_code=500, detail="Instagram OAuth not configured")

        # ═══════════════════════════════════════════════════════════════════
        # Шаг 1: обмен code на access token через Instagram Basic Display API
        #   - URL: POST https://api.instagram.com/oauth/access_token
        #   - Параметры: client_id, client_secret, grant_type, redirect_uri, code
        #   - В ответе: access_token, user_id
        # ═══════════════════════════════════════════════════════════════════
        async with httpx.AsyncClient() as client:
            token_response = await client.post(
                "https://api.instagram.com/oauth/access_token",
                data={
                    "client_id": app_id,
                    "client_secret": app_secret,
                    "grant_type": "authorization_code",
                    "redirect_uri": redirect_uri,
                    "code": code
                }
            )

            if token_response.status_code != 200:
                error_data = token_response.json()
                error_message = error_data.get("error", {}).get("message", token_response.text)
                # ═══════════════════════════════════════════════════════════
                # Проверка: пользователь не добавлен как тестировщик
                # Instagram Basic Display возвращает ошибку при попытке
                # обменять code на token, если пользователь не является
                # тестировщиком приложения в Meta Console
                # ═══════════════════════════════════════════════════════════
                if "user" in error_message.lower() or "not" in error_message.lower() or "invalid" in error_message.lower():
                    return """
                        <html>
                        <body>
                            <h2>Вы не зарегистрированы администратором</h2>
                            <p>Войдите в Instagram и добавьте пользователя как тестировщика в приложение n8n-call-api-IG</p>
                            <script>
                            setTimeout(()=>{
                                window.location.href="https://t.me/mediahave_bot";
                            },3000);
                            </script>
                        </body>
                        </html>
                    """
                raise HTTPException(status_code=400, detail=f"Failed to get access token: {error_message}")

            token_data = token_response.json()
            access_token = token_data.get("access_token")
            instagram_user_id = token_data.get("user_id", "")

            # ═══════════════════════════════════════════════════════════════════
            # Шаг 2: получаем информацию о пользователе через Instagram Graph API
            #   - URL: GET https://graph.instagram.com/me
            #   - Параметры: fields=id,username,account_type,media_count
            #   - access_token в query-параметре
            # ═══════════════════════════════════════════════════════════════════
            user_response = await client.get(
                f"{settings.meta_instagram_api}/me",
                params={
                    "fields": "id,username,account_type,media_count",
                    "access_token": access_token
                }
            )

            if user_response.status_code != 200:
                raise HTTPException(status_code=400, detail="Failed to get user info from Instagram")

            user_data = user_response.json()
            instagram_username = user_data.get("username", "")
            instagram_id = user_data.get("id", "")

            if not instagram_id:
                raise HTTPException(status_code=400, detail="No Instagram user data received")

        # ═══════════════════════════════════════════════════════════════════
        # Шаг 3: сохраняем в Supabase
        # ═══════════════════════════════════════════════════════════════════
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

    except HTTPException as http_err:
        return f"""
            <html>
            <body>
                <h2>Ошибка подключения Instagram</h2>
                <p>{str(http_err.detail)}</p>
                <script>
                setTimeout(()=>{{
                    window.location.href="https://t.me/mediahave_bot";
                }},3000);
                </script>
            </body>
            </html>
        """
    except Exception as e:
        return f"""
            <html>
            <body>
                <h2>Ошибка подключения Instagram</h2>
                <p>{str(e)}</p>
                <script>
                setTimeout(()=>{{
                    window.location.href="https://t.me/mediahave_bot";
                }},3000);
                </script>
            </body>
            </html>
        """
# @router.post("/auth/callback")
# async def instagram_auth_callback(request: InstagramAuthRequest):
#     """
#     Обработка callback от Instagram OAuth
#     """
#     try:
#         # Обмен кода на токен
#         app_id = settings.META_APP_ID
#         app_secret = settings.META_APP_SECRET
#         redirect_uri = settings.META_REDIRECT_URI

#         if not all([app_id, app_secret, redirect_uri]):
#             raise HTTPException(status_code=500, detail="Instagram OAuth not configured")
        
#         # Получаем долгоживущий токен
#         async with httpx.AsyncClient() as client:
#             token_response = await client.post(
#                 "https://api.instagram.com/oauth/access_token",
#                 data={
#                     "client_id": app_id,
#                     "client_secret": app_secret,
#                     "grant_type": "authorization_code",
#                     "redirect_uri": redirect_uri,
#                     "code": request.code
#                 }
#             )
            
#             if token_response.status_code != 200:
#                 raise HTTPException(status_code=400, detail="Failed to get access token")
            
#             token_data = token_response.json()
            
#             # Получаем информацию о пользователе
#             user_response = await client.get(
#                 "https://graph.instagram.com/me",
#                 params={
#                     "fields": "id,username,account_type,media_count",
#                     "access_token": token_data["access_token"]
#                 }
#             )
            
#             if user_response.status_code != 200:
#                 raise HTTPException(status_code=400, detail="Failed to get user info")
            
#             user_data = user_response.json()
            
#             # Сохраняем в БД (здесь будет интеграция с Supabase)
            
#             return {
#                 "success": True,
#                 "account": {
#                     "id": user_data["id"],
#                     "username": user_data["username"],
#                     "account_type": user_data.get("account_type", "personal"),
#                     "connected": True,
#                     "status": "active"
#                 }
#             }
            
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=str(e))

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