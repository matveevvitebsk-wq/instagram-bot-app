import json
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import urlencode

from jose import JWTError, jwt

from app.core.config import settings

OAUTH_STATE_MINUTES = 15


def create_instagram_oauth_state(telegram_id: str) -> str:
    return jwt.encode(
        {
            "telegram_id": str(telegram_id),
            "exp": datetime.now(timezone.utc) + timedelta(minutes=OAUTH_STATE_MINUTES),
        },
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM,
    )


def decode_instagram_oauth_state(state: str) -> dict:
    return jwt.decode(
        state,
        settings.JWT_SECRET,
        algorithms=[settings.JWT_ALGORITHM],
    )


def instagram_auth_url(state: str) -> str:
    params = {
        "client_id": settings.META_INSTAGRAM_APP_ID,
        "redirect_uri": settings.META_REDIRECT_URI,
        "response_type": "code",
        "scope": settings.meta_oauth_scopes,
        "state": state,
    }
    return f"{settings.meta_oauth_url}?{urlencode(params)}"


def instagram_start_page_url(state: str) -> str:
    return (
        f"{settings.BACKEND_URL.rstrip('/')}/api/instagram/meta/start-page"
        f"?{urlencode({'state': state})}"
    )


def instagram_oauth_configured() -> bool:
    return all(
        [
            settings.META_INSTAGRAM_APP_ID,
            settings.META_INSTAGRAM_APP_SECRET,
            settings.META_REDIRECT_URI,
        ]
    )


def start_page_html(auth_url: str) -> str:
    auth_url_js = json.dumps(auth_url)
    return f"""<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Вход в Instagram</title>
  <style>
    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #fafafa;
      color: #262626;
      padding: 24px;
    }}
    main {{ max-width: 360px; text-align: center; }}
    a, button {{
      display: inline-block;
      margin-top: 16px;
      padding: 12px 18px;
      border-radius: 10px;
      background: #0095f6;
      color: #fff;
      text-decoration: none;
      border: 0;
      font-size: 16px;
    }}
    p {{ line-height: 1.45; }}
    .hint {{ color: #737373; font-size: 14px; }}
  </style>
</head>
<body>
  <main>
    <p>Чтобы войти, откройте эту страницу в Chrome. Telegram не умеет открыть Instagram внутри своего окна.</p>
    <p id="status" class="hint">Нажмите ⋮ справа вверху и выберите «Открыть в Chrome» или «Открыть в браузере».</p>
    <a id="fallback" href="#">Открыть Instagram</a>
  </main>
  <script>
    const authUrl = {auth_url_js};
    const fallback = document.getElementById("fallback");
    const status = document.getElementById("status");
    fallback.href = authUrl;

    function isEmbeddedBrowser() {{
      const ua = navigator.userAgent || "";
      if (window.TelegramWebviewProxy) return true;
      if (window.Telegram && window.Telegram.WebApp) return true;
      if (/; wv\\)/i.test(ua)) return true;
      if (/Telegram/i.test(ua)) return true;
      return false;
    }}

    function openInInstagramApp() {{
      const ua = navigator.userAgent || "";
      if (/Android/i.test(ua)) {{
        const path = authUrl.replace(/^https:\\/\\//, "");
        window.location.replace(
          "intent://" + path +
          "#Intent;scheme=https;package=com.instagram.android;S.browser_fallback_url=" +
          encodeURIComponent(authUrl) + ";end"
        );
        return;
      }}
      window.location.replace(authUrl);
    }}

    fallback.addEventListener("click", function (event) {{
      event.preventDefault();
      if (isEmbeddedBrowser()) {{
        status.textContent = "Сначала откройте эту страницу в Chrome через меню ⋮. Не входите в Instagram внутри Telegram.";
        return;
      }}
      openInInstagramApp();
    }});

    if (!isEmbeddedBrowser()) {{
      status.textContent = "Открываем Instagram…";
      openInInstagramApp();
    }}
  </script>
</body>
</html>
"""


def expired_start_page_html() -> str:
    return """<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Ссылка устарела</title>
</head>
<body>
  <p>Ссылка для входа устарела. Вернитесь в MediaHave и нажмите «Войти в существующий» ещё раз.</p>
  <p>Если Instagram недавно показал ошибку 429, подождите 15–30 минут и не открывайте страницу логина повторно.</p>
</body>
</html>
"""


def validate_oauth_state(state: str) -> Optional[dict]:
    try:
        data = decode_instagram_oauth_state(state)
    except JWTError:
        return None
    if not data.get("telegram_id"):
        return None
    return data
