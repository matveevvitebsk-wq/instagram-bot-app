from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache



class Settings(BaseSettings):
    # ПЕРЕКЛЮЧАТЕЛЬ РЕЖИМА РАБОТЫ
    # true  = только тестеры из Meta Console (до 50 чел.), ИП не нужно
    # false = все пользователи (требует ИП + App Review у Meta)
    DEVELOPMENT_MODE: bool = True
    TOKEN_REFRESH_DAYS: int = 7
    HTTP_TIMEOUT: int = 30
    
    # Telegram
    BOT_TOKEN: str
    WEBAPP_URL: str = "https://almarathon.com"
    FRONTEND_URL: str = "https://almarathon.com"
    BACKEND_URL: str = "https://api.almarathon.com"
    
    # JWT
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_HOURS: int = 24

    # Supabase
    SUPABASE_URL: str
    SUPABASE_SERVICE_ROLE_KEY: str

    # Meta / Instagram
    META_APP_ID: str = ""
    META_APP_SECRET: str = ""
    META_WEBHOOK_VERIFY_TOKEN: str = ""
    META_REDIRECT_URI: str = "https://api.almarathon.com/api/instagram/auth/callback"
    
    META_API_VERSION: str = "v23.0"

    # N8n
    N8N_URL: str = "https://n8n.almarathon.com"
    N8N_API_KEY: str = ""

    # Debug
    debug: bool = False
    cors_origins: str = "https://almarathon.com,https://t.me"

    @property
    def meta_enabled(self) -> bool:
        return bool(
            self.META_APP_ID
            and self.META_APP_SECRET
            and self.META_REDIRECT_URI
        )

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]


    @property
    def meta_oauth_scopes(self) -> str:
        # ═══════════════════════════════════════════════════════════════════
        # ИСПРАВЛЕНО (24.07.2026): Instagram Basic Display API
        #   - Используется Instagram App n8n-call-api-IG (ID: 2007885943317419)
        #   - Для личных аккаунтов (не бизнес)
        #   - Требует добавления пользователя как тестировщика в Meta Console
        #   - Скоупы: instagram_basic, pages_show_list
        # ═══════════════════════════════════════════════════════════════════
        scopes = [
            "instagram_basic",          # Базовый доступ к профилю
            "pages_show_list",          # Список страниц (требуется для IG)
        ]

        return ",".join(scopes)


    @property
    def meta_oauth_url(self) -> str:
        # ═══════════════════════════════════════════════════════════════════
        # ИСПРАВЛЕНО (24.07.2026): Instagram Basic Display API
        #   - Правильный URL для Instagram App (не Facebook)
        #   - Использует api.instagram.com, а не www.instagram.com
        # ═══════════════════════════════════════════════════════════════════
        return "https://api.instagram.com/oauth/authorize"
    #     return f"https://www.facebook.com/{self.META_API_VERSION}/dialog/oauth"  # СТАРЫЙ (Facebook Business API)


    @property
    def meta_graph_api(self) -> str:
        # ═══════════════════════════════════════════════════════════════════
        # ВНИМАНИЕ: Это Facebook Graph API (для Business API)
        #   НЕ ИСПОЛЬЗУЕТСЯ для Instagram Basic Display API
        #   Оставлен для обратной совместимости
        # ═══════════════════════════════════════════════════════════════════
        return f"https://graph.facebook.com/{self.META_API_VERSION}"


    @property
    def meta_api_base(self) -> str:
        # ═══════════════════════════════════════════════════════════════════
        # ВНИМАНИЕ: Это Facebook Graph API (для Business API)
        #   НЕ ИСПОЛЬЗУЕТСЯ для Instagram Basic Display API
        #   Оставлен для обратной совместимости
        # ═══════════════════════════════════════════════════════════════════
        return f"https://graph.facebook.com/{self.META_API_VERSION}"

    # ═══════════════════════════════════════════════════════════════════════
    # ДОБАВЛЕНО (24.07.2026): Instagram Graph API для Basic Display
    #   - Используется для получения информации о пользователе
    #   - Не требует версии API (в отличие от Facebook Graph API)
    # ═══════════════════════════════════════════════════════════════════════
    @property
    def meta_instagram_api(self) -> str:
        return "https://graph.instagram.com"

    # class Config:
    #     env_file = ".env"

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
        case_sensitive=False,
    )
settings = Settings()


@lru_cache()
def get_settings() -> Settings:
    return Settings()
