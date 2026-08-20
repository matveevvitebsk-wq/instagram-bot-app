from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.security import get_current_user
from app.core.supabase import get_supabase

router = APIRouter()


def normalize_keywords(raw: list[str] | None) -> list[str]:
    return [item.strip() for item in (raw or []) if item and item.strip()]


class AutoReplyCreate(BaseModel):
    trigger_keywords: list[str] = Field(min_length=1)
    reply_text: str
    ig_account_id: str | None = None


class AutoReplyUpdate(BaseModel):
    trigger_keywords: list[str] | None = None
    reply_text: str | None = None


def get_profile_id(sb, current_user: dict) -> str:
    profile = (
        sb.table("customer_profiles")
        .select("id")
        .eq("telegram_id", current_user["telegram_id"])
        .single()
        .execute()
    )
    if not profile.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile.data["id"]


@router.get("/")
async def list_auto_replies(current_user: dict = Depends(get_current_user)):
    sb = get_supabase()
    profile_id = get_profile_id(sb, current_user)

    result = (
        sb.table("automation_funnels")
        .select("*")
        .eq("owner_id", profile_id)
        .order("created_at", desc=True)
        .execute()
    )

    return result.data


@router.post("/")
async def create_auto_reply(
    body: AutoReplyCreate,
    current_user: dict = Depends(get_current_user),
):
    sb = get_supabase()
    profile_id = get_profile_id(sb, current_user)

    result = (
        sb.table("automation_funnels")
        .insert(
            {
                "owner_id": profile_id,
                "ig_account_id": body.ig_account_id,
                "trigger_keywords": normalize_keywords(body.trigger_keywords),
                "reply_text": body.reply_text,
                "is_active": True,
            }
        )
        .execute()
    )

    return result.data[0]


@router.patch("/{auto_reply_id}")
async def update_auto_reply(
    auto_reply_id: str,
    body: AutoReplyUpdate,
    current_user: dict = Depends(get_current_user),
):
    sb = get_supabase()
    profile_id = get_profile_id(sb, current_user)
    changes = body.model_dump(exclude_none=True)
    if "trigger_keywords" in changes:
        changes["trigger_keywords"] = normalize_keywords(changes["trigger_keywords"])

    if not changes:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = (
        sb.table("automation_funnels")
        .update(changes)
        .eq("id", auto_reply_id)
        .eq("owner_id", profile_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Auto-reply not found")
    return result.data[0]


@router.patch("/{funnel_id}/toggle")
async def toggle_auto_reply(
    funnel_id: str,
    current_user: dict = Depends(get_current_user),
):
    sb = get_supabase()
    profile_id = get_profile_id(sb, current_user)

    current = (
        sb.table("automation_funnels")
        .select("is_active")
        .eq("id", funnel_id)
        .eq("owner_id", profile_id)
        .single()
        .execute()
    )

    if not current.data:
        raise HTTPException(status_code=404, detail="Auto-reply not found")

    new_state = not bool(current.data.get("is_active"))

    result = (
        sb.table("automation_funnels")
        .update({"is_active": new_state})
        .eq("id", funnel_id)
        .eq("owner_id", profile_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Auto-reply not found")
    return {"is_active": new_state}


@router.delete("/{funnel_id}")
async def delete_auto_reply(
    funnel_id: str,
    current_user: dict = Depends(get_current_user),
):
    sb = get_supabase()
    profile_id = get_profile_id(sb, current_user)

    result = (
        sb.table("automation_funnels")
        .delete()
        .eq("id", funnel_id)
        .eq("owner_id", profile_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Auto-reply not found")
    return {"success": True}