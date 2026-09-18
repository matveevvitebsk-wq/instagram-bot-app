from fastapi import APIRouter, Request, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
import httpx

from app.core.supabase import get_supabase
from app.core.config import get_settings
from app.services.instagram_ids import persist_messaging_ids_from_webhook

router = APIRouter()
settings = get_settings()


# ─── N8n → Backend callback ───────────────────────────────────────────────

class N8nTaskCallback(BaseModel):
    task_id: str
    status: str          # "completed" | "failed" | "running"
    result: Optional[dict] = None
    error: Optional[str] = None
    owner_telegram_id: str


@router.post("/n8n/callback")
async def n8n_task_callback(body: N8nTaskCallback):
    """
    N8n вызывает этот эндпоинт по завершении workflow.
    Обновляет статус задачи и отправляет уведомление в Telegram.
    """
    sb = get_supabase()

    update_data = {
        "status": body.status,
        "result": body.result,
        "error_message": body.error,
    }

    sb.table("automation_tasks").update(update_data).eq("id", body.task_id).execute()

    # Push-уведомление в Telegram
    await _send_telegram_notification(body)

    return {"ok": True}


async def _send_telegram_notification(callback: N8nTaskCallback):
    """Отправляет уведомление пользователю через Telegram Bot API."""
    if callback.status == "completed":
        text = f"✅ Задача завершена успешно!"
    elif callback.status == "failed":
        text = f"❌ Ошибка выполнения задачи:\n{callback.error or 'Неизвестная ошибка'}"
    else:
        return

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(
                f"https://api.telegram.org/bot{settings.bot_token}/sendMessage",
                json={
                    "chat_id": callback.owner_telegram_id,
                    "text": text,
                    "parse_mode": "HTML",
                }
            )
    except Exception:
        pass  # Уведомление некритично — не роняем сервис


# ─── Meta Webhook Verification (Instagram) ────────────────────────────────

@router.get("/meta")
async def meta_webhook_verify(
    hub_mode: str = Query(alias="hub.mode"),
    hub_verify_token: str = Query(alias="hub.verify_token"),
    hub_challenge: str = Query(alias="hub.challenge"),
):
    """
    Верификация вебхука Meta (аналог If3 ноды в вашем N8n).
    Meta отправляет GET-запрос для подтверждения URL.
    
    ИСПРАВЛЕНИЕ из вашего проекта:
    Verify token вынесен в .env — не хранить в коде/n8n как захардкоженный!
    """
    if hub_mode == "subscribe" and hub_verify_token == settings.meta_webhook_verify_token:
        return int(hub_challenge)  # Meta ожидает именно число

    raise HTTPException(status_code=403, detail="Невалидный verify token")


@router.post("/meta")
async def meta_webhook_event(request: Request):
    """
    Входящие события от Meta (комментарии, DM, реакции).
    Пересылает данные в N8n для обработки.
    """
    body = await request.json()
    sb = get_supabase()
    persist_messaging_ids_from_webhook(sb, body)

    # Пересылаем в N8n webhook для обработки правил авто-ответа в DM
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(
                f"{settings.n8n_base_url}/webhook/instagram-events",
                json=body,
                headers={"Authorization": f"Bearer {settings.n8n_api_key}"}
            )
    except Exception:
        pass

    # Meta требует быстрый 200 ответ (иначе будет ретраить)
    return {"ok": True}
