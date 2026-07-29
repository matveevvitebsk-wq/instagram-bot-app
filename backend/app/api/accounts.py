from fastapi import APIRouter, Depends
from pydantic import BaseModel
from app.core.security import get_current_user
from app.core.supabase import get_supabase
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

class LinkAccountRequest(BaseModel):
    page_id: str
    access_token: str
    username: str

@router.get("/")
async def list_accounts(current_user: dict = Depends(get_current_user)):
    sb = get_supabase()
    profile = sb.table("customer_profiles").select("id").eq(
        "telegram_id", current_user["telegram_id"]
    ).single().execute()
    result = sb.table("ig_accounts").select(
        "id,username,page_id,is_active,created_at"
    ).eq(
        "owner_id", profile.data["id"]
    ).eq("is_active", True).execute()
    logger.info(f"[ACCOUNTS] Returning: {result.data}")
    return result.data

@router.post("/")
async def link_account(
    body: LinkAccountRequest,
    current_user: dict = Depends(get_current_user)
):
    sb = get_supabase()
    profile = sb.table("customer_profiles").select("id").eq(
        "telegram_id", current_user["telegram_id"]
    ).single().execute()
    result = sb.table("ig_accounts").upsert({
        "owner_id": profile.data["id"],
        "page_id": body.page_id,
        "access_token": body.access_token,
        "username": body.username,
        "is_active": True,
    }, on_conflict="page_id").execute()
    return result.data[0]

@router.delete("/{account_id}")
async def unlink_account(
    account_id: str,
    current_user: dict = Depends(get_current_user)
):
    sb = get_supabase()
    profile = sb.table("customer_profiles").select("id").eq(
        "telegram_id", current_user["telegram_id"]
    ).single().execute()
    sb.table("ig_accounts").update({"is_active": False}).eq(
        "id", account_id
    ).eq("owner_id", profile.data["id"]).execute()

    active_accounts = sb.table("ig_accounts").select("id").eq(
        "owner_id", profile.data["id"]
    ).eq("is_active", True).limit(1).execute()
    if not active_accounts.data:
        sb.table("customer_profiles").update({
            "instagram_page_id": None,
            "instagram_access_token": None,
            "instagram_id": None,
            "instagram_username": None,
            "instagram_connected": False,
            "instagram_connected_at": None,
        }).eq("id", profile.data["id"]).execute()

    return {"message": "Аккаунт отвязан"}
