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

router = APIRouter(prefix="/api/instagram", tags=["instagram"])

class InstagramAuthRequest(BaseModel):
    code: str
    user_id: str

class InstagramRegisterRequest(BaseModel):
    username: str
    email: str
    password: str
    full_name: Optional[str] = None

@router.post("/auth/callback")
async def instagram_auth_callback(request: InstagramAuthRequest):
    """
    Обработка callback от Instagram OAuth
    """
    try:
        # Обмен кода на токен
        # app_id = os.getenv("INSTAGRAM_APP_ID")
        # app_secret = os.getenv("INSTAGRAM_APP_SECRET")
        # redirect_uri = os.getenv("INSTAGRAM_REDIRECT_URI")

        app_id = settings.META_APP_ID
        app_secret = settings.META_APP_SECRET
        redirect_uri = settings.META_REDIRECT_URI

        if not all([app_id, app_secret, redirect_uri]):
            raise HTTPException(status_code=500, detail="Instagram OAuth not configured")
        
        # Получаем долгоживущий токен
        async with httpx.AsyncClient() as client:
            token_response = await client.post(
                "https://api.instagram.com/oauth/access_token",
                data={
                    "client_id": app_id,
                    "client_secret": app_secret,
                    "grant_type": "authorization_code",
                    "redirect_uri": redirect_uri,
                    "code": request.code
                }
            )
            
            if token_response.status_code != 200:
                raise HTTPException(status_code=400, detail="Failed to get access token")
            
            token_data = token_response.json()
            
            # Получаем информацию о пользователе
            user_response = await client.get(
                "https://graph.instagram.com/me",
                params={
                    "fields": "id,username,account_type,media_count",
                    "access_token": token_data["access_token"]
                }
            )
            
            if user_response.status_code != 200:
                raise HTTPException(status_code=400, detail="Failed to get user info")
            
            user_data = user_response.json()
            
            # Сохраняем в БД (здесь будет интеграция с Supabase)
            
            return {
                "success": True,
                "account": {
                    "id": user_data["id"],
                    "username": user_data["username"],
                    "account_type": user_data.get("account_type", "personal"),
                    "connected": True,
                    "status": "active"
                }
            }
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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