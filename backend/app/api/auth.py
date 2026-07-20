from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.core.security import verify_telegram_init_data, create_access_token
from app.core.supabase import get_supabase

router = APIRouter()


class TelegramAuthRequest(BaseModel):
    init_data: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


@router.post("/telegram", response_model=AuthResponse)
async def auth_telegram(body: TelegramAuthRequest):
    """
    Точка входа: Telegram Mini App отправляет initData сюда.
    
    ПОТОК:
    1. Верифицируем подпись Telegram
    2. Upsert пользователя в Supabase (создать или обновить)
    3. Выдаём JWT
    """
    try:
        user_data = verify_telegram_init_data(body.init_data)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e)
        )

    telegram_id = str(user_data["id"])
    sb = get_supabase()

    # Upsert профиля в Supabase
    profile_data = {
        "telegram_id": telegram_id,
        "first_name": user_data.get("first_name", ""),
        "last_name": user_data.get("last_name", ""),
        "username": user_data.get("username", ""),
        "language_code": user_data.get("language_code", "ru"),
        "photo_url": user_data.get("photo_url", ""),
    }

    result = sb.table("customer_profiles").upsert(
        console.log(profile_data + '    +++');
        profile_data,
        on_conflict="telegram_id"
    ).execute()

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Не удалось создать профиль"
        )

    profile = result.data[0]
    token = create_access_token({**user_data, "profile_id": profile["id"]})

    return AuthResponse(
        access_token=token,
        user=profile
    )
