from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import auth, accounts, tasks, webhooks, analytics, events
from app.api import meta_oauth
from app.core.config import settings

app = FastAPI(title="MediaHave API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://almarathon.com", "https://t.me"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(accounts.router)
app.include_router(tasks.router)
app.include_router(webhooks.router)
app.include_router(analytics.router)
app.include_router(events.router)
app.include_router(meta_oauth.router)  # Meta OAuth


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "version": "1.0.0",
        "mode": "development" if settings.DEVELOPMENT_MODE else "production",
    }
