from fastapi import APIRouter, Depends
from app.core.security import get_current_user
from app.core.supabase import get_supabase

router = APIRouter()


@router.get("/dashboard")
async def get_dashboard(current_user: dict = Depends(get_current_user)):
    """Сводная статистика для главного экрана Mini App."""
    sb = get_supabase()
    profile = sb.table("customer_profiles").select("id,subscription_status").eq(
        "telegram_id", current_user["telegram_id"]
    ).single().execute()

    owner_id = profile.data["id"]

    # Параллельные запросы к Supabase
    tasks_stats = sb.table("automation_tasks").select(
        "status", count="exact"
    ).eq("owner_id", owner_id).execute()

    leads_count = sb.table("users").select(
        "id", count="exact"
    ).eq("owner_id", owner_id).execute()

    snapshots = sb.table("ai_analytics_snapshots").select("*").eq(
        "owner_id", owner_id
    ).order("snapshot_date", desc=True).limit(7).execute()

    # Группируем статусы задач
    status_map = {}
    for row in tasks_stats.data or []:
        s = row.get("status", "unknown")
        status_map[s] = status_map.get(s, 0) + 1

    return {
        "subscription": profile.data.get("subscription_status", "free"),
        "total_leads": leads_count.count or 0,
        "tasks": status_map,
        "weekly_snapshots": snapshots.data or [],
    }


@router.get("/leads")
async def get_leads(
    current_user: dict = Depends(get_current_user),
    limit: int = 50,
    offset: int = 0,
    status_filter: str = None
):
    """Список лидов (подписчиков/зрителей) с фильтрацией по статусу воронки."""
    sb = get_supabase()
    profile = sb.table("customer_profiles").select("id").eq(
        "telegram_id", current_user["telegram_id"]
    ).single().execute()

    query = sb.table("users").select("*").eq("owner_id", profile.data["id"])

    if status_filter:
        query = query.eq("lead_status", status_filter)

    result = query.order("last_interaction_at", desc=True).range(
        offset, offset + limit - 1
    ).execute()

    return {"leads": result.data, "total": len(result.data)}
