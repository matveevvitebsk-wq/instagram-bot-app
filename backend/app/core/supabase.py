from supabase import create_client, Client
from functools import lru_cache
from app.core.config import get_settings

settings = get_settings()


@lru_cache()
def get_supabase() -> Client:
    """
    Supabase клиент с service_role ключом — для операций бэкенда.
    Этот ключ обходит RLS политики (использовать только на сервере!).
    """
    return create_client(
        settings.supabase_url,
        settings.supabase_service_role_key
    )


def get_supabase_client() -> Client:
    """FastAPI dependency."""
    return get_supabase()
