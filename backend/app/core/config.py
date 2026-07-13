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
    META_REDIRECT_URI: str = "https://api.almarathon.com/api/auth/meta/callback"
    
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
        scopes = [
            "instagram_basic",
            "instagram_manage_messages",
            "pages_show_list",
            "pages_read_engagement",
        ]

        if not self.DEVELOPMENT_MODE:
            scopes.append("instagram_content_publish")

        return ",".join(scopes)


    @property
    def meta_oauth_url(self) -> str:
        return f"https://www.facebook.com/{self.META_API_VERSION}/dialog/oauth"


    @property
    def meta_graph_api(self) -> str:
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
