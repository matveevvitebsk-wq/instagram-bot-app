from app.services.task_payload import normalize_task_payload


def test_normalize_payload_keeps_trigger_keywords_array():
    result = normalize_task_payload({
        "trigger_keywords": ["Dtcs", "Ffdfd"],
        "trigger_keyword": "Dtcs",
        "reply_text": "ok",
    })
    assert result["trigger_keywords"] == ["Dtcs", "Ffdfd"]
    assert "trigger_keyword" not in result
    assert result["reply_text"] == "ok"


def test_normalize_payload_copies_legacy_trigger_keyword():
    result = normalize_task_payload({"trigger_keyword": "Folow"})
    assert result["trigger_keywords"] == ["Folow"]
    assert "trigger_keyword" not in result


def test_normalize_payload_wraps_single_string():
    result = normalize_task_payload({"trigger_keywords": "Бежим"})
    assert result["trigger_keywords"] == ["Бежим"]
