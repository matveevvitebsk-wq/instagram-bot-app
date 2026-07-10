from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.core.config import get_settings
from app.api import auth, accounts, tasks, webhooks, analytics, telegram_webhook, events, meta_oauth, funnels

settings = get_settings()

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 Backend запущен")
    yield
    print("🛑 Backend остановлен")

app = FastAPI(
    title="Instagram Automation API",
    version="1.0.0",
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,             prefix="/api/auth",      tags=["Auth"])
app.include_router(accounts.router,         prefix="/api/accounts",  tags=["Accounts"])
app.include_router(tasks.router,            prefix="/api/tasks",     tags=["Tasks"])
app.include_router(webhooks.router,         prefix="/api/webhooks",  tags=["Webhooks"])
app.include_router(analytics.router,        prefix="/api/analytics", tags=["Analytics"])
app.include_router(events.router,           prefix="/api/events",    tags=["Events"])
app.include_router(meta_oauth.router,                                tags=["Meta OAuth"])
app.include_router(telegram_webhook.router, prefix="/api/webhooks",  tags=["Telegram"])
app.include_router(funnels.router, prefix="/api/funnels", tags=["Funnels"])
@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "1.0.0",
            "mode": "development" if settings.DEVELOPMENT_MODE else "production"}
