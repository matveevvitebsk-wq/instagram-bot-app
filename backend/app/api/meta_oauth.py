from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse, HTMLResponse
from app.core.config import settings
from app.core.security import get_current_user
from app.core.supabase import get_supabase
import httpx
from datetime import datetime, timedelta
from urllib.parse import urlencode

router = APIRouter(prefix="/api/auth/meta", tags=["meta_oauth"])


# ══════════════════════════════════════════════════════════════════════
# ИСПРАВЛЕНО (15.07.2026): Server-side OAuth — HTML-страница
# ══════════════════════════════════════════════════════════════════════
# ПРОБЛЕМА: openLink() с try_browser: 'external' открывает системный
# браузер, пользователь покидает Telegram. try_browser: 'internal' —
# неофициальный параметр, игнорируется Telegram.
#
# РЕШЕНИЕ: создаём HTML-страницу на том же домене (api.almarathon.com),
# которая открывается во встроенном браузере Telegram. Страница:
#   1. Проверяет, есть ли аккаунт в БД (по initData/telegram_id)
#   2. Если есть — показывает "Уже подключено"
#   3. Если нет — редиректит на Instagram OAuth
#   4. После OAuth — Instagram редиректит на callback (тот же домен)
#   5. Callback отдаёт HTML "Подключено" с кнопкой "Вернуться в Telegram"
#
# ВАЖНО: initData передаётся через URL-параметр, чтобы страница могла
# идентифицировать пользователя без Telegram WebView API.
# ══════════════════════════════════════════════════════════════════════


# ══════════════════════════════════════════════════════════════════════
# ВОССТАНОВЛЕНО (15.07.2026): старый эндпоинт /url для обратной совместимости
# ══════════════════════════════════════════════════════════════════════
# Старый фронтенд (сборка на production) всё ещё вызывает /api/auth/meta/url.
# Удаление этого эндпоинта ломает старый фронтенд (404).
# Оставляем для обратной совместимости, пока новый фронтенд не задеплоится.
# ══════════════════════════════════════════════════════════════════════
@router.get("/url")
async def get_meta_oauth_url(current_user: dict = Depends(get_current_user)):
    """
    [DEPRECATED] Старый эндпоинт для обратной совместимости.
    Используйте /start-page для OAuth внутри Telegram.
    """
    sb = get_supabase()
    telegram_id = current_user["telegram_id"]
    profile = (
        sb.table("customer_profiles")
        .select("id")
        .eq("telegram_id", telegram_id)
        .single()
        .execute()
    )
    profile_id = profile.data["id"]

    params = {
        "client_id": settings.META_APP_ID,
        "redirect_uri": settings.META_REDIRECT_URI,
        "response_type": "code",
        "scope": settings.meta_oauth_scopes,
        "state": profile_id,
    }

    oauth_url = f"{settings.meta_oauth_url}?{urlencode(params)}"

    return {
        "url": oauth_url,
        "mode": "development" if settings.DEVELOPMENT_MODE else "production",
        "warning": (
            "Подключение доступно только тестерам Meta."
            if settings.DEVELOPMENT_MODE
            else None
        ),
    }


@router.get("/start-page", response_class=HTMLResponse)
async def meta_oauth_start_page(
    request: Request,
    initData: str = Query(None, description="Telegram initData для идентификации пользователя"),
):
    """
    HTML-страница для OAuth Instagram, открывается во встроенном браузере Telegram.
    - Если аккаунт уже подключён — показывает "Уже подключено"
    - Если нет — редиректит на Instagram OAuth
    """
    # Пробуем получить telegram_id из initData
    telegram_id = None
    if initData:
        try:
            from urllib.parse import parse_qs
            parsed = parse_qs(initData)
            user_json = parsed.get("user", [None])[0]
            if user_json:
                import json
                user_data = json.loads(user_json)
                telegram_id = user_data.get("id")
        except Exception:
            pass

    # Проверяем, есть ли аккаунт в БД
    account_exists = False
    if telegram_id:
        try:
            sb = get_supabase()
            profile = (
                sb.table("customer_profiles")
                .select("id")
                .eq("telegram_id", str(telegram_id))
                .single()
                .execute()
            )
            profile_id = profile.data["id"]
            accounts = (
                sb.table("ig_accounts")
                .select("id, username")
                .eq("owner_id", profile_id)
                .eq("is_active", True)
                .execute()
            )
            if accounts.data and len(accounts.data) > 0:
                account_exists = True
                username = accounts.data[0].get("username", "")
        except Exception:
            pass

    if account_exists:
        # Аккаунт уже подключён — показываем страницу "Уже подключено"
        return HTMLResponse(content=f"""
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Instagram подключён</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #1a1a2e;
            color: #e0e0e0;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            padding: 20px;
        }}
        .card {{
            background: #16213e;
            border-radius: 16px;
            padding: 32px;
            max-width: 400px;
            width: 100%;
            text-align: center;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        }}
        .icon {{
            font-size: 64px;
            margin-bottom: 16px;
        }}
        h1 {{
            font-size: 22px;
            margin-bottom: 12px;
            color: #4ade80;
        }}
        p {{
            font-size: 14px;
            color: #94a3b8;
            margin-bottom: 8px;
            line-height: 1.5;
        }}
        .username {{
            font-size: 16px;
            color: #e0e0e0;
            font-weight: 600;
            margin-bottom: 20px;
        }}
        .btn {{
            display: inline-block;
            padding: 12px 24px;
            background: #2563eb;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 15px;
            font-weight: 500;
            cursor: pointer;
            text-decoration: none;
            transition: background 0.2s;
        }}
        .btn:hover {{ background: #1d4ed8; }}
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">✅</div>
        <h1>Instagram подключён</h1>
        <p>Ваш аккаунт</p>
        <div class="username">@{username}</div>
        <p>уже подключён к сервису. Вы можете вернуться в Telegram и продолжить работу.</p>
        <br>
        <a href="javascript:void(0)" onclick="window.close()" class="btn">Вернуться в Telegram</a>
    </div>
</body>
</html>
""", status_code=200)

    # Аккаунта нет — формируем OAuth URL и редиректим
    # Получаем profile_id (создаём, если нет)
    sb = get_supabase()
    profile_id = None
    if telegram_id:
        try:
            profile = (
                sb.table("customer_profiles")
                .select("id")
                .eq("telegram_id", str(telegram_id))
                .single()
                .execute()
            )
            profile_id = profile.data["id"]
        except Exception:
            pass

    if not profile_id:
        # Если не удалось определить пользователя — показываем ошибку
        return HTMLResponse(content="""
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ошибка</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #1a1a2e;
            color: #e0e0e0;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            padding: 20px;
        }
        .card {
            background: #16213e;
            border-radius: 16px;
            padding: 32px;
            max-width: 400px;
            width: 100%;
            text-align: center;
        }
        .icon { font-size: 64px; margin-bottom: 16px; }
        h1 { font-size: 22px; margin-bottom: 12px; color: #f87171; }
        p { font-size: 14px; color: #94a3b8; line-height: 1.5; }
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">❌</div>
        <h1>Ошибка авторизации</h1>
        <p>Не удалось определить ваш аккаунт. Пожалуйста, откройте эту страницу через Telegram Mini App.</p>
    </div>
</body>
</html>
""", status_code=400)

    params = {
        "client_id": settings.META_APP_ID,
        "redirect_uri": settings.META_REDIRECT_URI,
        "response_type": "code",
        "scope": settings.meta_oauth_scopes,
        "state": str(profile_id),
    }

    oauth_url = f"{settings.meta_oauth_url}?{urlencode(params)}"

    # Редиректим на Instagram OAuth
    return RedirectResponse(url=oauth_url)
        # f"https://api.instagram.com/oauth/authorize"
        # f"?client_id={settings.META_APP_ID}"
        # f"&redirect_uri={settings.META_REDIRECT_URI}"
        # f"&scope={settings.meta_oauth_scopes}"
        # f"&response_type=code"
        # f"&state={profile_id}"

    # return {
    #     "url": oauth_url,
    #     "mode": "development" if settings.DEVELOPMENT_MODE else "production",
    #     "warning": (
    #         "Режим разработки: подключить аккаунт могут только тестеры из Meta Console."
    #         if settings.DEVELOPMENT_MODE
    #         else None
    #     ),
    # }


@router.get("/callback")
async def meta_oauth_callback(
    code: str = Query(...),
    state: str = Query(...),
    error: str = Query(None),
    error_reason: str = Query(None),
):
    """
    Callback от Meta после авторизации пользователя.
    Обменивает code → short-lived token → long-lived token (60 дней).
    Сохраняет аккаунт в ig_accounts.
    """
    # Пользователь отказал
    if error:
        return RedirectResponse(
            f"https://almarathon.com/settings?instagram=error&reason={error_reason or error}"
        )

    profile_id = state


    async with httpx.AsyncClient() as client:

        # --- Шаг 1: code → short-lived token (1 час) ---
        token_resp = await client.post(
            "https://api.instagram.com/oauth/access_token",
            data={
                "client_id": settings.META_APP_ID,
                "client_secret": settings.META_APP_SECRET,
                "grant_type": "authorization_code",
                "redirect_uri": settings.META_REDIRECT_URI,
                "code": code,
            },
        )
        token_data = token_resp.json()

        if "error_message" in token_data or "error" in token_data:
            error_msg = token_data.get("error_message") or str(token_data.get("error"))
            return RedirectResponse(
                f"https://almarathon.com/settings?instagram=error&reason={error_msg}"
            )

        short_token = token_data["access_token"]
        ig_user_id = str(token_data["user_id"])

        # --- Шаг 2: short-lived → long-lived token (60 дней) ---
        long_resp = await client.get(
            f"{settings.meta_api_base}/access_token",
            params={
                "grant_type": "ig_exchange_token",
                "client_secret": settings.META_APP_SECRET,
                "access_token": short_token,
            },
        )
        long_data = long_resp.json()

        if "error" in long_data:
            return RedirectResponse(
                "https://almarathon.com/settings?instagram=error&reason=token_exchange_failed"
            )

        long_token = long_data["access_token"]
        expires_in = long_data.get("expires_in", 5184000)  # ~60 дней

        # --- Шаг 3: получить данные аккаунта ---
        me_resp = await client.get(
            f"{settings.meta_api_base}/{ig_user_id}",
            params={
                "fields": "id,username,name,profile_picture_url,followers_count",
                "access_token": long_token,
            },
        )
        me_data = me_resp.json()

    # --- Шаг 4: сохранить в Supabase ---
    token_expires_at = (
        datetime.utcnow() + timedelta(seconds=expires_in)
    ).isoformat()

    get_supabase().table("ig_accounts").upsert(
        {
            "owner_id": profile_id,
            "page_id": ig_user_id,
            "username": me_data.get("username", ""),
            "display_name": me_data.get("name", ""),
            "profile_picture_url": me_data.get("profile_picture_url", ""),
            "followers_count": me_data.get("followers_count", 0),
            "access_token": long_token,
            "token_expires_at": token_expires_at,
            "is_active": True,
            "mode": "development" if settings.DEVELOPMENT_MODE else "production",
        },
        on_conflict="owner_id,page_id",
    ).execute()

    # ══════════════════════════════════════════════════════════════════════
    # ИСПРАВЛЕНО (15.07.2026): HTML-страница вместо редиректа на внешний домен
    # ══════════════════════════════════════════════════════════════════════
    # ПРОБЛЕМА: редирект на https://almarathon.com/settings?instagram=connected
    # открывает внешний домен, что выкидывает пользователя из встроенного
    # браузера Telegram в системный браузер.
    #
    # РЕШЕНИЕ: отдаём HTML-страницу на том же домене (api.almarathon.com),
    # которая показывает "Подключено" и кнопку "Вернуться в Telegram".
    # Пользователь остаётся во встроенном браузере Telegram.
    # ══════════════════════════════════════════════════════════════════════
    username = me_data.get("username", "")
    return HTMLResponse(content=f"""
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Instagram подключён</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #1a1a2e;
            color: #e0e0e0;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            padding: 20px;
        }}
        .card {{
            background: #16213e;
            border-radius: 16px;
            padding: 32px;
            max-width: 400px;
            width: 100%;
            text-align: center;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        }}
        .icon {{ font-size: 64px; margin-bottom: 16px; }}
        h1 {{ font-size: 22px; margin-bottom: 12px; color: #4ade80; }}
        p {{ font-size: 14px; color: #94a3b8; margin-bottom: 8px; line-height: 1.5; }}
        .username {{ font-size: 16px; color: #e0e0e0; font-weight: 600; margin-bottom: 20px; }}
        .btn {{
            display: inline-block;
            padding: 12px 24px;
            background: #2563eb;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 15px;
            font-weight: 500;
            cursor: pointer;
            text-decoration: none;
            transition: background 0.2s;
        }}
        .btn:hover {{ background: #1d4ed8; }}
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">✅</div>
        <h1>Instagram подключён</h1>
        <p>Аккаунт</p>
        <div class="username">@{username}</div>
        <p>успешно подключён к сервису. Теперь вы можете вернуться в Telegram и пользоваться ботом.</p>
        <br>
        <a href="javascript:void(0)" onclick="window.close()" class="btn">Вернуться в Telegram</a>
    </div>
</body>
</html>
""", status_code=200)


@router.delete("/disconnect")
async def disconnect_instagram(current_user: dict = Depends(get_current_user)):
    """
    Деактивирует Instagram аккаунт (is_active=false), токен не удаляет.
    """
    sb = get_supabase()
    telegram_id = current_user["telegram_id"]
    profile = sb.table("customer_profiles").select("id").eq(
        "telegram_id", telegram_id
    ).single().execute()
    profile_id = profile.data["id"]

    sb.table("ig_accounts").update({"is_active": False}).eq(
        "owner_id", profile_id
    ).execute()

    return {"status": "disconnected"}
