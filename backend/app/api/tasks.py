from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import logging
import httpx

from app.core.security import get_current_user
from app.core.supabase import get_supabase
from app.core.config import get_settings

router = APIRouter()
settings = get_settings()
logger = logging.getLogger(__name__)

# ─── Schemas ──────────────────────────────────────────────────────────────

class CreateTaskRequest(BaseModel):
    task_type: str          # "publish_post" | "keyword_funnel" | "dm_reply" | "analytics"
    ig_account_id: Optional[str] = None
    payload: dict           # Параметры задачи (зависят от типа)
    schedule_at: Optional[str] = None  # ISO 8601 или null для немедленного запуска
    # Trigger on comments under author posts (feed / Reels / saved live)
    # Default true for new auto-replies
    comment_on_post: Optional[bool] = True
    # Exact keyword match in comments; default true for new auto-replies
    exact_match: Optional[bool] = True
    # All content types vs optional/selected responses; default true
    all_content_types: Optional[bool] = True
    # Instagram media IDs when all_content_types is false
    selected_media_ids: Optional[list[str]] = None
    # Verify follower subscription before bot continues; default true
    check_subscription: Optional[bool] = True


class UpdateTaskRequest(BaseModel):
    payload: dict
    comment_on_post: Optional[bool] = None
    exact_match: Optional[bool] = None
    all_content_types: Optional[bool] = None
    selected_media_ids: Optional[list[str]] = None
    check_subscription: Optional[bool] = None


class TaskResponse(BaseModel):
    id: str
    task_type: str
    status: str
    ig_account_id: Optional[str]
    payload: dict
    comment_on_post: bool = True
    exact_match: bool = True
    all_content_types: bool = True
    selected_media_ids: list[str] = []
    check_subscription: bool = True
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
    offset: int = 0,
    auto_reply_only: bool = False,
):
    """Список задач текущего пользователя."""
    sb = get_supabase()
    profile_id = get_profile_id(sb, current_user)

    query = sb.table("automation_tasks").select("*").eq("owner_id", profile_id)
    if auto_reply_only:
        query = query.in_("task_type", ["keyword_funnel", "dm_reply"])

    result = query.order("created_at", desc=True).range(
        offset, offset + limit - 1
    ).execute()

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
        "comment_on_post": bool(body.comment_on_post),
        "exact_match": bool(body.exact_match),
        "all_content_types": bool(body.all_content_types),
        "selected_media_ids": list(body.selected_media_ids or []),
        "check_subscription": bool(body.check_subscription),
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
                response = await client.post(
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
                response.raise_for_status()
        except Exception:
            # Запись уже сохранена: сбой отправки не должен превращать
            # успешное создание в HTTP 500 и провоцировать дубликаты.
            logger.warning(
                "Task %s was created, but N8n dispatch failed",
                task["id"],
                exc_info=True,
            )

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

    update_data = {
        "payload": body.payload,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if body.comment_on_post is not None:
        update_data["comment_on_post"] = bool(body.comment_on_post)
    if body.exact_match is not None:
        update_data["exact_match"] = bool(body.exact_match)
    if body.all_content_types is not None:
        update_data["all_content_types"] = bool(body.all_content_types)
    if body.selected_media_ids is not None:
        update_data["selected_media_ids"] = list(body.selected_media_ids)
    if body.check_subscription is not None:
        update_data["check_subscription"] = bool(body.check_subscription)

    result = sb.table("automation_tasks").update(update_data).eq(
        "id", task_id
    ).eq("owner_id", profile_id).neq(
        "status", "running"
    ).execute()

    if not result.data:
        raise HTTPException(
            status_code=409,
            detail="Выполняющуюся задачу нельзя редактировать"
        )
    return result.data[0]


@router.patch("/{task_id}/toggle")
async def toggle_auto_reply_task(
    task_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Включает или выключает правило авто-ответа в automation_tasks."""
    sb = get_supabase()
    profile_id = get_profile_id(sb, current_user)

    current = sb.table("automation_tasks").select(
        "status,payload,task_type"
    ).eq("id", task_id).eq("owner_id", profile_id).single().execute()

    if not current.data or current.data["task_type"] not in {
        "keyword_funnel", "dm_reply"
    }:
        raise HTTPException(status_code=404, detail="Авто-ответ не найден")

    payload = current.data.get("payload") or {}
    is_active = payload.get(
        "is_active", current.data.get("status") != "cancelled"
    )
    new_state = not bool(is_active)
    payload["is_active"] = new_state

    result = sb.table("automation_tasks").update({
        "payload": payload,
        "status": "pending" if new_state else "cancelled",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", task_id).eq("owner_id", profile_id).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Авто-ответ не найден")
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
