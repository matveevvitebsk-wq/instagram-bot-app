from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from app.core.supabase import get_supabase
from app.core.security import get_current_user

router = APIRouter()

class EventCreate(BaseModel):
    event_name: str
    properties: Optional[dict] = {}

@router.post("/")
async def track_event(
    event: EventCreate,
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase()
    supabase.table("events").insert({
        "user_id": current_user.get("profile_id") or current_user.get("id"),
        "telegram_id": current_user["telegram_id"],
        "event_name": event.event_name,
        "properties": event.properties
    }).execute()
    return {"ok": True}
