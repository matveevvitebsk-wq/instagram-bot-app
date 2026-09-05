# Instagram OAuth в Telegram Mini App — 2026-09-05

## Симптом

Telegram показывает «Не удалось открыть веб-страницу» для URL вида:

`https://www.instagram.com/accounts/login/?force_authentication&platform_app_id=...&next=https://www.instagram.com/oauth/authorize/third_party/...`

Причина в интерфейсе: `net::ERR_HTTP_RESPONSE_CODE_FAILURE`.

Приложение Instagram при этом может быть запущено, пользователь в нём
авторизован.

## Почему так происходит

1. Кнопка «Войти в существующий» вызывала `window.location.assign(authUrl)`.
2. Mini App подменял свой документ на `instagram.com/oauth/authorize`.
3. WebView Telegram не разделяет cookies и сессию с приложением Instagram.
4. Instagram отвечает страницей `/accounts/login/?force_authentication`.
5. Instagram / Meta часто отдают 4xx встроенному браузеру Telegram.
6. Chromium в Telegram трактует это как `ERR_HTTP_RESPONSE_CODE_FAILURE`.

То, что Instagram открыт на телефоне, не помогает: OAuth шёл внутри
документа Mini App, а не в приложении Instagram.

Отдельно `start_param=ig_auth` открывал несуществующий
`/api/instagram/meta/start-page`. Это тоже даёт ошибку загрузки страницы.

## Исправление

- Settings открывает `auth_url` через `Telegram.WebApp.openLink` с
  `try_browser: 'chrome'`, чтобы Android не грузил Instagram во in-app
  browser.
- Если Telegram WebApp недоступен, используется `window.open`.
- `window.location.assign` для Instagram больше не вызывается.
- `start_param=ig_auth` больше не ходит на нереализованный start-page.

Кнопка регистрации остаётся одной: «Войти в существующий». Диалог
«Запустить Instagram» не возвращается. Таблица `user_login_devices` не
меняется.
