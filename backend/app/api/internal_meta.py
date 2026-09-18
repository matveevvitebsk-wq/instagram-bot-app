"""Internal Meta action broker for n8n.

n8n sends an operation. FastAPI resolves the account, uses the token, and
returns a sanitized result. Bearer tokens never leave this process.
"""

from __future__ import annotations

import logging
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, model_validator

from app.core.security import require_n8n_service
from app.core.supabase import get_supabase
from app.services.instagram_followers import (
    FollowerCheckError,
    check_user_follows_account,
    error_result,
    resolve_ig_account,
)
from app.services.instagram_ids import (
    attach_igsid_to_connected_username,
    upsert_sender_user,
)

router = APIRouter()
logger = logging.getLogger(__name__)


class MetaActionRequest(BaseModel):
    operation: Literal["check_follower", "record_sender"]
    target_igsid: str = Field(..., min_length=1, max_length=128)
    username: Optional[str] = None
    ig_account_id: Optional[str] = None
    instagram_account_id: Optional[str] = None
    task_id: Optional[str] = None
    event_id: Optional[str] = None
    idempotency_key: Optional[str] = None

    @model_validator(mode="after")
    def require_account_pointer(self) -> "MetaActionRequest":
        if self.operation == "check_follower" and not (
            self.ig_account_id or self.instagram_account_id
        ):
            raise ValueError("ig_account_id or instagram_account_id is required")
        return self


@router.post("/actions")
async def execute_meta_action(
    body: MetaActionRequest,
    _: str = Depends(require_n8n_service),
):
    """n8n command endpoint. Supports check_follower and record_sender."""
    sb = get_supabase()
    if body.operation == "record_sender":
        owner_id = None
        if body.ig_account_id or body.instagram_account_id:
            try:
                account = resolve_ig_account(
                    sb,
                    ig_account_id=body.ig_account_id,
                    instagram_account_id=body.instagram_account_id,
                )
                owner_id = account.get("owner_id")
            except FollowerCheckError:
                owner_id = None
        matched = attach_igsid_to_connected_username(
            sb, body.target_igsid, body.username
        )
        if matched and not owner_id:
            owner_id = matched.get("owner_id")
        users_updated = upsert_sender_user(
            sb,
            owner_id=owner_id,
            igsid=body.target_igsid,
            username=body.username,
        )
        return {
            "ok": True,
            "operation": "record_sender",
            "sender_id": body.target_igsid,
            "username": body.username,
            "igba_account_id": (matched or {}).get("id"),
            "igba_id": (matched or {}).get("igba_id"),
            "users_updated": users_updated,
        }

    if body.operation != "check_follower":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported operation",
        )

    try:
        result = await check_user_follows_account(
            sb,
            target_igsid=body.target_igsid,
            ig_account_id=body.ig_account_id,
            instagram_account_id=body.instagram_account_id,
            task_id=body.task_id,
        )
    except FollowerCheckError as exc:
        logger.info(
            "check_follower failed error_code=%s retryable=%s consent=%s event_id=%s",
            exc.error_code,
            exc.retryable,
            exc.consent_required,
            body.event_id,
        )
        http_status = (
            status.HTTP_404_NOT_FOUND
            if exc.error_code in {"account_not_found", "task_not_found"}
            else status.HTTP_200_OK
        )
        if http_status == status.HTTP_404_NOT_FOUND:
            raise HTTPException(status_code=http_status, detail=exc.message) from exc
        return error_result(exc)

    logger.info(
        "check_follower ok follows=%s skipped=%s account_id=%s event_id=%s",
        result.get("follows"),
        result.get("skipped"),
        result.get("account_id"),
        body.event_id,
    )
    return result
