from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # ПЕРЕКЛЮЧАТЕЛЬ РЕЖИМА РАБОТЫ
    # true  = только тестеры из Meta Console (до 50 чел.), ИП не нужно
    # false = все пользователи (требует ИП + App Review у Meta)
    DEVELOPMENT_MODE: bool = True

    # Telegram
    BOT_TOKEN: str
    WEBAPP_URL: str = "https://almarathon.com"

    # JWT
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_HOURS: int = 24

    # Supabase
    SUPABASE_URL: str
    SUPABASE_SERVICE_KEY: str

    # Meta / Instagram
    META_APP_ID: str = ""
    META_APP_SECRET: str = ""
    META_WEBHOOK_VERIFY_TOKEN: str = ""
    META_REDIRECT_URI: str = "https://api.almarathon.com/api/auth/meta/callback"

    # N8n
    N8N_URL: str = "https://n8n.almarathon.com"
    N8N_API_KEY: str = ""

    # Debug
    debug: bool = False
    cors_origins: str = "https://almarathon.com,https://t.me"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]

    @property
    def meta_oauth_scopes(self) -> str:
        base = (
            "instagram_business_basic,"
            "instagram_business_manage_messages,"
            "instagram_business_manage_comments"
        )
        if not self.DEVELOPMENT_MODE:
            base += ",instagram_business_content_publish"
        return base

    @property
    def meta_api_base(self) -> str:
        return "https://graph.instagram.com"

    class Config:
        env_file = ".env"


settings = Settings()


@lru_cache()
def get_settings() -> Settings:
    return Settings()
