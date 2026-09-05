# Instagram OAuth в Telegram Mini App — 2026-09-05

## Симптомы

1. Telegram: «Не удалось открыть веб-страницу» /
   `net::ERR_HTTP_RESPONSE_CODE_FAILURE`.
2. Браузер: «Страница недоступна» / `HTTP ERROR 429` на

`https://www.instagram.com/accounts/login/?force_authentication&platform_app_id=...&next=...oauth/authorize/third_party...`

Приложение Instagram при этом может быть запущено, пользователь в нём
авторизован.

## Почему так происходит

WebView Telegram и обычный браузер не видят сессию приложения Instagram.
Instagram тогда открывает веб-логин `/accounts/login/?force_authentication`.
Эта страница часто отвечает 4xx, а после нескольких попыток — **429 Too Many
Requests**. Повторное открытие той же ссылки только усиливает блокировку.

`force_authentication` добавляет сам Instagram, когда в текущем браузере нет
логина. Это не параметр нашего authorize URL.

Сообщение Telegram «Опаньки… При загрузке этой страницы возникли неполадки.
Обновите Android WebView» появляется, когда встроенный браузер Telegram
пытается открыть `intent://` или страницу Instagram с 429. Обновлять WebView
не нужно: откройте ту же страницу в Chrome через меню ⋮.

## Исправление

- Settings открывает `https://api.almarathon.com/api/instagram/meta/start-page`,
  а не `instagram.com` внутри Mini App.
- Start-page на Android уводит OAuth в `com.instagram.android` через intent.
  На iOS — Universal Link `www.instagram.com/oauth/authorize`.
- Кнопка «Войти в существующий» имеет паузу 45 секунд между нажатиями.
- `start_param=ig_auth` сам OAuth не запускает: нужен signed `state` из Settings.

Если пользователь уже получил 429: подождать 15–30 минут, не открывать ссылку
логина повторно, затем нажать «Войти в существующий» ещё раз — вход должен
пойти в приложении Instagram.

Кнопка регистрации одна. Диалог «Запустить Instagram» не используется.
Таблица `user_login_devices` не меняется.
