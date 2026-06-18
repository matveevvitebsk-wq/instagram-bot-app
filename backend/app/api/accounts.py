from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.core.security import get_current_user
from app.core.supabase import get_supabase

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
    result = sb.table("ig_accounts").select("id,username,page_id,is_active,created_at").eq(
        "owner_id", profile.data["id"]
    ).eq("is_active", True).execute()
    return {"accounts": result.data}

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
    return {"message": "Аккаунт отвязан"}
