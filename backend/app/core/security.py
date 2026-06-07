import hmac
import hashlib
import json
import time
from urllib.parse import unquote, parse_qs
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.core.config import get_settings

settings = get_settings()
bearer_scheme = HTTPBearer()


# ─── Telegram initData verification ──────────────────────────────────────

def verify_telegram_init_data(init_data: str) -> dict:
    """
    Проверяет подпись Telegram WebApp initData.
    Документация: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
    
    ИСПРАВЛЕНИЕ из вашего проекта:
    - Используем HMAC-SHA256 с ключом "WebAppData", а не сам токен напрямую
    - Добавлена проверка срока давности данных (auth_date не старше 24ч)
    """
    try:
        # Парсим строку query-параметров
        parsed = {}
        for part in init_data.split("&"):
            if "=" in part:
                k, v = part.split("=", 1)
                parsed[k] = unquote(v)

        hash_val = parsed.pop("hash", None)
        if not hash_val:
            raise ValueError("hash отсутствует в initData")

        # Проверяем срок давности (не старше 24 часов)
        auth_date = int(parsed.get("auth_date", 0))
        if time.time() - auth_date > 86400:
            raise ValueError("initData устарел (>24ч)")

        # Формируем строку для проверки (ключи в алфавитном порядке)
        data_check = "\n".join(
            f"{k}={v}" for k, v in sorted(parsed.items())
        )

        # Секретный ключ = HMAC-SHA256("WebAppData", bot_token)
        secret_key = hmac.new(
            b"WebAppData",
            settings.bot_token.encode(),
            hashlib.sha256
        ).digest()

        # Вычисляем ожидаемый хеш
        expected_hash = hmac.new(
            secret_key,
            data_check.encode(),
            hashlib.sha256
        ).hexdigest()

        if not hmac.compare_digest(expected_hash, hash_val):
            raise ValueError("Подпись initData невалидна")

        # Возвращаем данные пользователя
        user_data = json.loads(parsed.get("user", "{}"))
        user_data["auth_date"] = auth_date
        return user_data

    except ValueError:
        raise
    except Exception as e:
        raise ValueError(f"Ошибка разбора initData: {e}")


# ─── JWT ──────────────────────────────────────────────────────────────────

def create_access_token(user_data: dict) -> str:
    """Создаёт JWT-токен с данными пользователя Telegram."""
    payload = {
        "sub": str(user_data["id"]),
        "telegram_id": str(user_data["id"]),
        "first_name": user_data.get("first_name", ""),
        "username": user_data.get("username", ""),
        "exp": datetime.now(timezone.utc) + timedelta(
            minutes=settings.jwt_expire_minutes
        ),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict:
    """Декодирует и валидирует JWT."""
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm]
        )
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Токен невалиден или истёк",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ─── FastAPI dependency ───────────────────────────────────────────────────

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)
) -> dict:
    """Dependency для защищённых эндпоинтов."""
    return decode_access_token(credentials.credentials)
