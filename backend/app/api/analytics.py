from fastapi import APIRouter, Depends, HTTPException, Query
from app.core.security import get_current_user
from app.core.supabase import get_supabase

router = APIRouter()


def _owned_active_accounts(sb, profile_id: str) -> list[dict]:
    """Return active Instagram accounts owned by the authenticated Telegram profile."""
    result = (
        sb.table("ig_accounts")
        .select("id,username,page_id")
        .eq("owner_id", profile_id)
        .eq("is_active", True)
        .execute()
    )
    return [
        row for row in (result.data or [])
        if row.get("page_id")
    ]


@router.get("/dashboard")
async def get_dashboard(current_user: dict = Depends(get_current_user)):
    """Сводная статистика для главного экрана Mini App."""
    sb = get_supabase()
    profile_id = current_user.get("profile_id")
    if not profile_id:
        raise HTTPException(status_code=401, detail="В JWT отсутствует profile_id")

    profile = (
        sb.table("customer_profiles")
        .select("subscription_status")
        .eq("id", profile_id)
        .single()
        .execute()
    )

    tasks_stats = (
        sb.table("automation_tasks")
        .select("status", count="exact")
        .eq("owner_id", profile_id)
        .execute()
    )

    accounts = _owned_active_accounts(sb, profile_id)
    page_ids = list(dict.fromkeys(row["page_id"] for row in accounts))
    if page_ids:
        leads_count = (
            sb.table("users")
            .select("id", count="exact")
            .in_("owner_id", page_ids)
            .execute()
        )
        total_leads = leads_count.count or 0
    else:
        total_leads = 0

    snapshots = (
        sb.table("ai_analytics_snapshots")
        .select("*")
        .eq("owner_id", profile_id)
        .order("snapshot_date", desc=True)
        .limit(7)
        .execute()
    )

    status_map = {}
    for row in tasks_stats.data or []:
        status = row.get("status", "unknown")
        status_map[status] = status_map.get(status, 0) + 1

    return {
        "subscription": (profile.data or {}).get("subscription_status", "free"),
        "total_leads": total_leads,
        "tasks": status_map,
        "weekly_snapshots": snapshots.data or [],
    }


@router.get("/leads")
async def get_leads(
    current_user: dict = Depends(get_current_user),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    status_filter: str | None = Query(None, max_length=50),
    account_id: str | None = Query(None),
    search: str | None = Query(None, max_length=100),
):
    """Список лидов только из активных Instagram-аккаунтов текущего владельца."""
    sb = get_supabase()
    profile_id = current_user.get("profile_id")
    if not profile_id:
        raise HTTPException(status_code=401, detail="В JWT отсутствует profile_id")

    accounts = _owned_active_accounts(sb, profile_id)
    if account_id:
        accounts = [row for row in accounts if str(row["id"]) == account_id]
        if not accounts:
            raise HTTPException(status_code=404, detail="Instagram аккаунт не найден")

    page_ids = list(dict.fromkeys(row["page_id"] for row in accounts))
    if not page_ids:
        return {"leads": [], "total": 0, "accounts": []}

    query = (
        sb.table("users")
        .select(
            "id,instagram_id,username,full_name,is_follower,lead_status,"
            "last_interaction_at,created_at,owner_id",
            count="exact",
        )
        .in_("owner_id", page_ids)
    )

    if status_filter:
        query = query.eq("lead_status", status_filter)

    if search:
        # Remove PostgREST filter syntax characters before interpolating the search value.
        safe_search = "".join(
            char for char in search if char.isalnum() or char in " _.-@"
        ).strip()
        if safe_search:
            pattern = f"%{safe_search}%"
            query = query.or_(
                f"username.ilike.{pattern},full_name.ilike.{pattern},"
                f"instagram_id.ilike.{pattern}"
            )

    result = (
        query.order("last_interaction_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )

    account_names = {
        row["page_id"]: row.get("username")
        for row in accounts
    }
    leads = []
    for row in result.data or []:
        lead = dict(row)
        lead["instagram_account"] = account_names.get(row.get("owner_id"))
        leads.append(lead)

    return {
        "leads": leads,
        "total": result.count or 0,
        "accounts": [
            {"id": row["id"], "username": row.get("username"), "page_id": row["page_id"]}
            for row in accounts
        ],
    }


@router.get("/leads/{lead_id}/interactions")
async def get_lead_interactions(
    lead_id: str,
    current_user: dict = Depends(get_current_user),
    limit: int = Query(100, ge=1, le=200),
):
    """История взаимодействий лида с проверкой принадлежности аккаунта владельцу."""
    sb = get_supabase()
    profile_id = current_user.get("profile_id")
    if not profile_id:
        raise HTTPException(status_code=401, detail="В JWT отсутствует profile_id")

    accounts = _owned_active_accounts(sb, profile_id)
    page_ids = list(dict.fromkeys(row["page_id"] for row in accounts))
    if not page_ids:
        raise HTTPException(status_code=404, detail="Лид не найден")

    lead_result = (
        sb.table("users")
        .select("id")
        .eq("id", lead_id)
        .in_("owner_id", page_ids)
        .limit(1)
        .execute()
    )
    if not lead_result.data:
        raise HTTPException(status_code=404, detail="Лид не найден")

    result = (
        sb.table("interactions")
        .select(
            "id,interaction_type,text_content,created_at,from_username,"
            "media_id,media_product_type,event_field,event_time,"
            "status_response,text_answer,response_at"
        )
        .eq("user_id", lead_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return {"interactions": result.data or []}
