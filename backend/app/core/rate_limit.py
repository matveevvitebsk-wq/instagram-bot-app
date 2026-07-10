import time
from collections import defaultdict
from fastapi import Request, HTTPException, status
from starlette.middleware.base import BaseHTTPMiddleware
from app.core.config import get_settings

settings = get_settings()


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Простой rate limiter в памяти.
    Ограничивает количество запросов с одного IP в минуту.

    На продакшене заменить на Redis-based rate limiter.
    """

    def __init__(self, app, requests_per_minute: int = 60):
        super().__init__(app)
        self.requests_per_minute = requests_per_minute
        # { ip: [timestamp1, timestamp2, ...] }
        self.history: dict[str, list[float]] = defaultdict(list)

    async def dispatch(self, request: Request, call_next):
        # Не ограничиваем /health и статику
        if request.url.path in ("/health",):
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        now = time.time()
        window = 60.0  # 1 минута

        # Очищаем старые записи (старше 1 минуты)
        self.history[client_ip] = [
            ts for ts in self.history[client_ip] if now - ts < window
        ]

        # Проверяем лимит
        if len(self.history[client_ip]) >= self.requests_per_minute:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Слишком много запросов. Попробуйте через минуту.",
                headers={"Retry-After": "60"},
            )

        # Добавляем текущий запрос
        self.history[client_ip].append(now)
        return await call_next(request)