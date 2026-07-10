import time
from functools import wraps
from typing import Any, Callable


class TTLCache:
    """
    Простой in-memory кэш с TTL (time-to-live).
    Для продакшена заменить на Redis.
    """

    def __init__(self, ttl_seconds: int = 30):
        self._cache: dict[str, tuple[float, Any]] = {}
        self.ttl = ttl_seconds

    def get(self, key: str) -> Any | None:
        if key not in self._cache:
            return None
        expires_at, value = self._cache[key]
        if time.time() > expires_at:
            del self._cache[key]
            return None
        return value

    def set(self, key: str, value: Any):
        self._cache[key] = (time.time() + self.ttl, value)

    def invalidate(self, key: str):
        self._cache.pop(key, None)

    def clear(self):
        self._cache.clear()


# Глобальный экземпляр кэша (30 секунд TTL)
cache = TTLCache(ttl_seconds=30)


def cached(ttl: int = 30):
    """
    Декоратор для кэширования результатов функций.
    Ключ = имя функции + строковые аргументы.

    Пример:
        @cached(ttl=60)
        async def get_dashboard_data(user_id: str):
            ...
    """
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Формируем ключ кэша
            key = f"{func.__name__}:{args}:{kwargs}"
            cached_result = cache.get(key)
            if cached_result is not None:
                return cached_result
            result = await func(*args, **kwargs)
            cache.set(key, result)
            return result
        return wrapper
    return decorator