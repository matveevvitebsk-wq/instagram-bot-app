import logging
from typing import Any

logger = logging.getLogger(__name__)

DEVICE_KINDS = frozenset({"phone", "tablet", "computer"})
OS_TYPES = frozenset({"ios", "android", "windows", "macos", "linux", "unknown"})


def normalize_device_kind(value: Any) -> str:
    kind = str(value or "").strip().lower()
    return kind if kind in DEVICE_KINDS else "computer"


def normalize_os_type(value: Any) -> str:
    os_type = str(value or "").strip().lower()
    return os_type if os_type in OS_TYPES else "unknown"


def normalize_telegram_platform(value: Any) -> str:
    platform = str(value or "").strip().lower()[:40]
    return platform or "unknown"


def record_user_login_device(
    sb,
    *,
    owner_id: str,
    telegram_id: str,
    device_kind: Any = None,
    os_type: Any = None,
    telegram_platform: Any = None,
) -> dict[str, Any] | None:
    payload = {
        "p_owner_id": owner_id,
        "p_telegram_id": str(telegram_id),
        "p_device_kind": normalize_device_kind(device_kind),
        "p_os_type": normalize_os_type(os_type),
        "p_telegram_platform": normalize_telegram_platform(telegram_platform),
    }
    try:
        result = sb.rpc("record_user_login_device", payload).execute()
        data = result.data
        if isinstance(data, list):
            return data[0] if data else None
        return data if isinstance(data, dict) else None
    except Exception:
        logger.exception("Unable to record login device for owner %s", owner_id)
        return None
