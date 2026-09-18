def normalize_task_payload(payload: dict | None) -> dict:
    """Keep only trigger_keywords[] in payload; drop legacy trigger_keyword."""
    data = dict(payload or {})
    raw = data.get("trigger_keywords")
    keywords: list[str] = []
    if isinstance(raw, list):
        keywords = [str(item).strip() for item in raw if str(item).strip()]
    elif isinstance(raw, str) and raw.strip():
        keywords = [raw.strip()]
    if not keywords:
        legacy = data.get("trigger_keyword")
        if isinstance(legacy, str) and legacy.strip():
            keywords = [legacy.strip()]
    data["trigger_keywords"] = keywords
    data.pop("trigger_keyword", None)
    return data


def sanitize_task_row(row: dict | None) -> dict | None:
    if not row:
        return row
    payload = row.get("payload")
    if isinstance(payload, dict):
        return {**row, "payload": normalize_task_payload(payload)}
    return row
