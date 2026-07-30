from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import httpx

from app.core.security import get_current_user
from app.core.supabase import get_supabase
from app.core.config import get_settings

router = APIRouter()
settings = get_settings()

# ─── Schemas ──────────────────────────────────────────────────────────────

class CreateTaskRequest(BaseModel):
    task_type: str          # "publish_post" | "keyword_funnel" | "dm_reply" | "analytics"
    ig_account_id: str      # UUID из таблицы ig_accounts
    payload: dict           # Параметры задачи (зависят от типа)
    schedule_at: Optional[str] = None  # ISO 8601 или null для немедленного запуска


class UpdateTaskRequest(BaseModel):
    payload: dict


class TaskResponse(BaseModel):
    id: str
    task_type: str
    status: str
    ig_account_id: str
    payload: dict
    created_at: str


# Маппинг типов задач → N8n webhook ID
TASK_WEBHOOK_MAP = {
    "publish_post":   "publish-post",
    "keyword_funnel": "keyword-funnel",
    "dm_reply":       "dm-auto-reply",
    "analytics":      "collect-analytics",
}


# ─── Endpoints ────────────────────────────────────────────────────────────


def get_profile_id(sb, current_user: dict) -> str:
    profile = sb.table("customer_profiles").select("id").eq(
        "telegram_id", current_user["telegram_id"]
    ).single().execute()

    if not profile.data:
        raise HTTPException(status_code=404, detail="Профиль не найден")
    return profile.data["id"]


@router.get("/")
async def list_tasks(
    current_user: dict = Depends(get_current_user),
    limit: int = 20,
    offset: int = 0
):
    """Список задач текущего пользователя."""
    sb = get_supabase()
    profile_id = get_profile_id(sb, current_user)

    result = sb.table("automation_tasks").select("*").eq(
        "owner_id", profile_id
    ).order("created_at", desc=True).range(offset, offset + limit - 1).execute()

    return {"tasks": result.data, "total": len(result.data)}


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_task(
    body: CreateTaskRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Создаёт задачу и тригерит N8n webhook.
    
    ПОТОК: UI → /api/tasks → Supabase (status=pending) → N8n webhook
    """
    sb = get_supabase()
    telegram_id = current_user["telegram_id"]
    profile_id = get_profile_id(sb, current_user)

    # Создаём запись задачи в Supabase
    task_record = {
        "owner_id": profile_id,
        "ig_account_id": body.ig_account_id,
        "task_type": body.task_type,
        "status": "pending",
        "payload": body.payload,
        "schedule_at": body.schedule_at,
    }

    task_result = sb.table("automation_tasks").insert(task_record).execute()
    if not task_result.data:
        raise HTTPException(status_code=500, detail="Ошибка создания задачи")

    task = task_result.data[0]
    webhook_id = TASK_WEBHOOK_MAP.get(body.task_type)

    # Тригерим N8n если webhook настроен
    if webhook_id:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.post(
                    f"{settings.n8n_base_url}/webhook/{webhook_id}",
                    json={
                        "task_id": task["id"],
                        "task_type": body.task_type,
                        "ig_account_id": body.ig_account_id,
                        "payload": body.payload,
                        "owner_telegram_id": telegram_id,
                    },
                    headers={"Authorization": f"Bearer {settings.n8n_api_key}"}
                )
        except httpx.RequestError:
            # N8n недоступен — задача остаётся в pending, ретрай будет позже
            pass

    return task


@router.patch("/{task_id}")
async def update_task(
    task_id: str,
    body: UpdateTaskRequest,
    current_user: dict = Depends(get_current_user)
):
    """Редактирует данные ещё не выполненной задачи."""
    sb = get_supabase()
    profile_id = get_profile_id(sb, current_user)

    result = sb.table("automation_tasks").update({
        "payload": body.payload,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", task_id).eq("owner_id", profile_id).in_(
        "status", ["pending", "cancelled", "failed"]
    ).execute()

    if not result.data:
        raise HTTPException(
            status_code=409,
            detail="Можно редактировать только необработанную задачу"
        )
    return result.data[0]


@router.patch("/{task_id}/cancel")
async def cancel_task(
    task_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Отменяет задачу (только если status=pending)."""
    sb = get_supabase()
    profile_id = get_profile_id(sb, current_user)

    result = sb.table("automation_tasks").update(
        {
            "status": "cancelled",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
    ).eq("id", task_id).eq("owner_id", profile_id).eq(
        "status", "pending"
    ).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Задача не найдена или уже запущена")

    return {"message": "Задача отменена"}


@router.delete("/{task_id}")
async def delete_task(
    task_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Безвозвратно удаляет не выполняющуюся задачу из automation_tasks."""
    sb = get_supabase()
    profile_id = get_profile_id(sb, current_user)

    result = sb.table("automation_tasks").delete().eq(
        "id", task_id
    ).eq("owner_id", profile_id).neq("status", "running").execute()

    if not result.data:
        raise HTTPException(
            status_code=409,
            detail="Выполняющуюся задачу нельзя удалить"
        )
    return {"success": True}
