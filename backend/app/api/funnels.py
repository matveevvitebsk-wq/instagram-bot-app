from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.security import get_current_user
from app.core.supabase import get_supabase

router = APIRouter()


class FunnelCreate(BaseModel):
    trigger_keyword: str
    reply_text: str
    ig_account_id: str | None = None


@router.get("/")
async def list_funnels(current_user: dict = Depends(get_current_user)):
    sb = get_supabase()

    profile = (
        sb.table("customer_profiles")
        .select("id")
        .eq("telegram_id", current_user["telegram_id"])
        .single()
        .execute()
    )

    result = (
        sb.table("automation_funnels")
        .select("*")
        .eq("owner_id", profile.data["id"])
        .order("created_at", desc=True)
        .execute()
    )

    return result.data


@router.post("/")
async def create_funnel(
    body: FunnelCreate,
    current_user: dict = Depends(get_current_user),
):
    sb = get_supabase()

    profile = (
        sb.table("customer_profiles")
        .select("id")
        .eq("telegram_id", current_user["telegram_id"])
        .single()
        .execute()
    )

    result = (
        sb.table("automation_funnels")
        .insert(
            {
                "owner_id": profile.data["id"],
                "ig_account_id": body.ig_account_id,
                "trigger_keyword": body.trigger_keyword,
                "reply_text": body.reply_text,
                "is_active": True,
            }
        )
        .execute()
    )

    return result.data[0]


@router.patch("/{funnel_id}/toggle")
async def toggle_funnel(
    funnel_id: str,
    current_user: dict = Depends(get_current_user),
):
    sb = get_supabase()

    profile = (
        sb.table("customer_profiles")
        .select("id")
        .eq("telegram_id", current_user["telegram_id"])
        .single()
        .execute()
    )

    current = (
        sb.table("automation_funnels")
        .select("is_active")
        .eq("id", funnel_id)
        .eq("owner_id", profile.data["id"])
        .single()
        .execute()
    )

    if not current.data:
        raise HTTPException(status_code=404, detail="Funnel not found")

    new_state = not current.data["is_active"]

    (
        sb.table("automation_funnels")
        .update({"is_active": new_state})
        .eq("id", funnel_id)
        .eq("owner_id", profile.data["id"])
        .execute()
    )

    return {"is_active": new_state}


@router.delete("/{funnel_id}")
async def delete_funnel(
    funnel_id: str,
    current_user: dict = Depends(get_current_user),
):
    sb = get_supabase()

    profile = (
        sb.table("customer_profiles")
        .select("id")
        .eq("telegram_id", current_user["telegram_id"])
        .single()
        .execute()
    )

    (
        sb.table("automation_funnels")
        .delete()
        .eq("id", funnel_id)
        .eq("owner_id", profile.data["id"])
        .execute()
    )

    return {"success": True}