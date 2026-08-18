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
)

router = APIRouter()
logger = logging.getLogger(__name__)


class MetaActionRequest(BaseModel):
    operation: Literal["check_follower"]
    target_igsid: str = Field(..., min_length=1, max_length=128)
    ig_account_id: Optional[str] = None
    instagram_account_id: Optional[str] = None
    task_id: Optional[str] = None
    event_id: Optional[str] = None
    idempotency_key: Optional[str] = None

    @model_validator(mode="after")
    def require_account_pointer(self) -> "MetaActionRequest":
        if not self.ig_account_id and not self.instagram_account_id:
            raise ValueError("ig_account_id or instagram_account_id is required")
        return self


@router.post("/actions")
async def execute_meta_action(
    body: MetaActionRequest,
    _: str = Depends(require_n8n_service),
):
    """n8n command endpoint. Currently supports check_follower only."""
    if body.operation != "check_follower":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported operation",
        )

    sb = get_supabase()
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
