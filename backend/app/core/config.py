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
    # ═══════════════════════════════════════════════════════════════════════
    # ИСПРАВЛЕНО (24.07.2026): разделение Facebook App и Instagram App
    #
    #   Facebook App (In8n-call-api)     ID: 1530173274780778
    #     └── Instagram App (n8n-call-api-IG)  ID: 2007885943317419
    #
    #   META_APP_ID         = Facebook App ID  → для token exchange через Graph API
    #   META_APP_SECRET     = Facebook App Secret
    #   META_INSTAGRAM_APP_ID = Instagram App ID → для OAuth URL (показывает название)
    # ═══════════════════════════════════════════════════════════════════════
    META_APP_ID: str = ""                    # Facebook App ID (для Graph API)
    META_APP_SECRET: str = ""                # Facebook App Secret
    META_INSTAGRAM_APP_ID: str = ""          # Instagram App ID (для OAuth URL)
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
        # Instagram Business API скоупы (для бизнес-аккаунтов)
        #   - Используется Instagram App n8n-call-api-IG
        #   - Подключён к Facebook App In8n-call-api
        # ═══════════════════════════════════════════════════════════════════
        scopes = [
            "instagram_business_basic",
            "instagram_business_manage_messages",
            "instagram_business_manage_comments",
            "instagram_business_content_publish",
            "instagram_business_manage_insights"
        ]

        if not self.DEVELOPMENT_MODE:
            scopes.append("instagram_content_publish")

        return ",".join(scopes)


    @property
    def meta_oauth_url(self) -> str:
        # ═══════════════════════════════════════════════════════════════════
        # Instagram OAuth URL для бизнес-аккаунтов
        #   - Использует Instagram App ID (client_id), а не Facebook App ID
        #   - Чтобы Instagram показал пользователю название "n8n-call-api-IG"
        # ═══════════════════════════════════════════════════════════════════
        # return "https://www.instagram.com/oauth/authorize"
        # Для Instagram Business API используем Facebook OAuth
        return f"https://www.facebook.com/{self.META_API_VERSION}/dialog/oauth"


    @property
    def meta_graph_api(self) -> str:
        # ═══════════════════════════════════════════════════════════════════
        # Facebook Graph API (для token exchange)
        #   - Использует Facebook App ID + Facebook App Secret
        #   - НЕ использует Instagram App ID
        # ═══════════════════════════════════════════════════════════════════
        return f"https://graph.facebook.com/{self.META_API_VERSION}"


    @property
    def meta_api_base(self) -> str:
        return f"https://graph.facebook.com/{self.META_API_VERSION}"

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