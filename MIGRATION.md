# MIGRATION.md — технический аудит MediaHave и план миграции на Next.js + Neon

| Параметр | Значение |
|---|---|
| Репозиторий | `github.com/matveevvitebsk-wq/instagram-bot-app` (публичный: клонируется без авторизации) |
| Проверенный коммит | `e8e437c` (2026-11-10 20:22 +0300), ветка `main` |
| Дата аудита | Первичный аудит — 2026-11-15; обновлён 2026-11-16 после получения результатов SQL-запросов к Supabase (разделы 5, 9.5, 11, 12) |
| Режим | Read-Only. Код, конфигурации, Git, Supabase и сервер не изменялись |
| Доступ к Supabase | Вся схема получена из read-only SQL-выгрузок владельца (2026-11-16, файлы `sql.txt` и `sql 2.txt`): столбцы всех 10 таблиц, ограничения, индексы, enum, тела функций, триггеры `public` и `auth`, RLS, политики, права ролей, Storage, Realtime, размеры. Дополнительно прочитан список таблиц через коннектор (число строк). Данные пользователей не читались |
| Доступ к серверу | Нет. Состояние DigitalOcean взято из документов репозитория (`docs/droplet_state.md`, `SERVER_HANDOFF.md`, `docs/SERVER_ARCHITECTURE.md`) |

**Обозначения:** **[Факт]** — подтверждено кодом, конфигурацией или документацией репозитория. **[Вывод]** — следует из фактов. **[Рекомендация]** — предложение для нового проекта. **[Неизвестно]** — проверить не удалось.

> Секреты, токены, пароли, ключи и персональные данные в документ не включены. Указаны только имена переменных, файлы и строки.

---

## 1. Фактическая архитектура старого проекта

### 1.1. Компоненты

| Компонент | Технология | Где находится | Статус |
|---|---|---|---|
| Mini App (интерфейс) | React 18 + Vite 5 + TypeScript + Tailwind 3 + Zustand | `frontend/` | [Факт] |
| Backend API | Python 3.13 + FastAPI 0.115 + Uvicorn (1 worker) | `backend/app/` | [Факт] |
| Telegram-бот | aiogram 3 (только отправка через webhook-обработчик в FastAPI) | `backend/app/api/telegram_webhook.py` | [Факт] |
| БД и файлы | Supabase (PostgreSQL + Storage + Realtime) | внешний сервис | [Факт] |
| Автоматизация Instagram | **n8n** (отдельно работающий сервис; отдельный Compose-проект на том же дроплете) | `n8n/` (частично), сервер `/home/almat/n8n-docker-caddy` | [Факт] |
| Прямая интеграция приложения с n8n для доступа к БД | **Нет**. n8n работает независимо от приложения, подключается к Supabase напрямую и самостоятельно читает и записывает данные; приложение и n8n — отдельные потребители одной БД | n8n-workflows вне репозитория; фактические workflow не изучены | [Сведения владельца; workflow не проверены] |
| Вход HTTPS | Caddy (в Compose-проекте n8n) | вне репозитория | [Факт] по `SERVER_HANDOFF.md:465-481` |
| Раздача статики | nginx:alpine (volume `frontend/dist`) | `docker-compose.yml:42-59`, `nginx/nginx.conf` | [Факт] |

### 1.2. Схема взаимодействия

```
Пользователь Telegram
   │ /start  →  Bot API  →  POST api.almarathon.com/api/webhooks/telegram (aiogram, кнопка WebApp)
   ▼
Telegram Mini App (almarathon.com, React SPA)
   │ initData → POST /api/auth/telegram  → JWT (HS256, 24 ч) → sessionStorage
   │ Bearer JWT → /api/* (axios)
   ▼
Caddy :443 ─► nginx:80 (SPA)            ─► backend:8000 (FastAPI)
                                              │ supabase-py (secret key, обход RLS)
                                              ├─► Supabase (Postgres, Storage)
                                              ├─► graph.instagram.com / graph.facebook.com
                                              ├─► n8n  http://n8n:5678/webhook/<id>  (создание задач)
                                              └─► api.telegram.org (бот)
n8n ─► Supabase напрямую (Postgres): самостоятельно читает и записывает данные
n8n ─► POST /api/internal/meta/actions (сервисный Bearer) ─► проверка подписки
n8n ─► POST /api/webhooks/n8n/callback (без авторизации)  ─► статус задачи

Нет отдельной интеграции приложения с n8n для работы с БД: n8n — самостоятельный процесс, напрямую подключённый к Supabase.
Frontend ─► Supabase Realtime (publishable key) — подписка на automation_tasks
```

### 1.3. Слои

| Слой | Файлы |
|---|---|
| Интерфейс | `frontend/src/pages/*`, `frontend/src/components/*` |
| API | `backend/app/api/*.py` (10 роутеров, `backend/app/main.py:35-48`) |
| Бизнес-логика | `backend/app/services/*.py` |
| Интеграции | Meta: `services/instagram_*.py`, `services/facebook_tokens.py`, `api/meta_oauth.py`; Telegram: `api/telegram_webhook.py`, `core/security.py`; n8n: `api/tasks.py`, `api/webhooks.py`, `api/internal_meta.py` |
| Доступ к данным | Прямые вызовы `supabase-py` внутри роутеров (`core/supabase.py`), ORM и репозиториев нет |

### 1.4. Расхождения с исходными сведениями задания

| Исходное сведение | Что показал аудит |
|---|---|
| «Приложение напрямую не использует n8n» | **[Факт] Частично.** Backend вызывает отдельный n8n-сервис для задач и webhook-событий (`api/tasks.py:173-199`, `api/webhooks.py:89-110`), но прямой интеграции приложения с n8n для доступа к БД нет. По сведениям владельца, n8n самостоятельно подключается к Supabase и читает/записывает данные напрямую; конкретные workflow в рамках аудита не проверялись. Таблицы лидов (`users`, `interactions`, `ai_analytics_snapshots`) приложение в репозитории не заполняет. |
| «Instagram Webhooks для обработки событий в приложении не используются» | **[Факт] Частично.** В backend есть `GET/POST /api/webhooks/meta` (`api/webhooks.py:70-110`) — пересылка тела в n8n без обработки. Функции разбора webhook (`services/instagram_ids.py:134` `persist_messaging_ids_from_webhook`) вызываются **только из тестов**. Зарегистрирован ли этот URL в Meta — [Неизвестно]. |
| «Точка входа — Telegram-бот» | [Факт] Подтверждается: `api/telegram_webhook.py:16-51`. |
| «Регистрация и авторизация» | [Факт] Регистрация = upsert профиля по `telegram_id` при первом входе (`api/auth.py:51-64`). Отдельной регистрации нет. |

---

## 2. Структура проекта и назначение модулей

### 2.1. Дерево значимых файлов

Исключены: `.git`, `node_modules`, `dist`, кэш. Lock-файлы использованы только для версий.

```
.
├── .env.example                 шаблон переменных (секреты заменены CHANGE_ME в коммите 4ed388c)
├── .gitignore                   исключает .env, ssl, *.bak
├── docker-compose.yml           сервисы backend + nginx, внешняя сеть
├── nginx/nginx.conf             виртуальные хосты almarathon.com и api.almarathon.com (порт 80)
├── package-lock.json            корневой, пустой (нет package.json в корне) — артефакт
├── README.md, SERVER_HANDOFF.md документация сопровождения
├── git-inst                     заметки по git
├── "docker compose setting.doc" бинарный Word-файл с заметками по Compose
├── backend/
│   ├── Dockerfile               python:3.13-slim, uvicorn --workers 1, порт 8000
│   ├── requirements.txt         зависимости (точные версии)
│   ├── requirements-dev.txt     pytest, httpx
│   ├── pytest.ini
│   ├── migrations/*.sql         12 миграций (2026-08-01 … 2026-09-06)
│   ├── tests/*.py               8 модулей pytest + conftest с тестовыми значениями env
│   └── app/
│       ├── main.py              FastAPI, CORS, rate limit, подключение роутеров, /health
│       ├── core/config.py       Settings (pydantic-settings), скоупы Meta, URL
│       ├── core/security.py     проверка initData, JWT, сервисный токен n8n
│       ├── core/supabase.py     клиент Supabase с secret key (lru_cache)
│       ├── core/cache.py        in-memory TTL-кэш (используется только cache.clear())
│       ├── core/rate_limit.py   in-memory лимит 120 запросов/мин на IP
│       ├── api/auth.py          POST /api/auth/telegram
│       ���── api/accounts.py      Instagram-аккаунты и медиа
│       ├── api/tasks.py         задачи автоматизации, вложения, вызов n8n
│       ├── api/funnels.py       таблица automation_funnels (во фронтенде не вызывается)
│       ├── api/analytics.py     дашборд, лиды, история взаимодействий
│       ├── api/events.py        трекинг событий
│       ├── api/meta_oauth.py    Instagram OAuth, Facebook OAuth, статус аккаунта
│       ├── api/webhooks.py      callback n8n, Meta webhook (проксирование)
│       ├── api/telegram_webhook.py  webhook бота
│       ├── api/internal_meta.py брокер действий Meta для n8n
│       └── services/
│           ├── instagram_oauth.py   state, HTML стартовой и возвратной страниц
│           ├── instagram_profile.py обновление профиля из Graph /me
│           ├── instagram_followers.py проверка is_user_follow_business
│           ├── instagram_ids.py     разбор Meta webhook (вызывается только тестами)
│           ├── facebook_tokens.py   жизненный цикл Facebook-токена (EAAV)
│           ├── login_devices.py     запись устройства входа (RPC)
│           └── task_payload.py      нормализация trigger_keywords
├── frontend/
│   ├── Dockerfile               node:22 build → nginx (в production не используется, см. 8.1)
│   ├── nginx-spa.conf           конфиг для этого образа
│   ├── index.html               подключает telegram-web-app.js
│   ├── package.json / lock      зависимости
│   ├── vite.config.ts           прокси /api → :8000, ручные чанки
│   ├── tailwind.config.js, postcss.config.js, tsconfig*.json
│   └── src/
│       ├── main.tsx             монтирование + mock Telegram вне Telegram
│       ├── App.tsx              маршруты, логин по initData, обработка start_param
│       ├── store/authStore.ts   Zustand: логин, JWT в sessionStorage
│       ├── utils/api.ts         axios, Bearer, 401 → reload
│       ├── utils/supabase.ts    клиент Supabase (publishable key) для Realtime
│       ├── utils/*.ts           deviceProfile, openExternalUrl, telegramMiniApp, cooldown
│       ├── hooks/               useTelegram, useInstagram, useTrack
│       ├── pages/               Dashboard, Tasks, Leads, AutoReplyDM, Settings, Landing, Privacy, Terms
│       └── components/          Layout, LoadingScreen, ReplyDmComposer, AdvancedReplySettings,
│                                ChatbotPreview, KeywordChipsInput, SelectedMediaPicker
├── n8n/
│   ├── workflows/base-workflow.json  каркас обработки событий Instagram (узлы сохранения — TODO/noOp)
│   └── code/code-in-javascript1.js   сопоставление ключевых слов комментария (+ тест)
├── docs/                        заметки, аудит 2026-07-29, SQL, архитектура, изображения
└── scripts/generate_meta_architecture_visuals.py  генерация иллюстраций для docs
```

### 2.2. Функциональные модули

#### 2.2.1. Авторизация (Telegram → JWT)
- **Файлы:** `backend/app/api/auth.py`, `backend/app/core/security.py`, `frontend/src/store/authStore.ts`, `frontend/src/App.tsx:43-47`.
- **Вход:** `POST /api/auth/telegram` (`auth.py:28`).
- **Данные:** upsert `customer_profiles` по `telegram_id` (`auth.py:60-64`); затем `maintain_owner_facebook_tokens`, `refresh_owner_instagram_profiles` (внешние HTTP-вызовы Meta **в каждом входе**, `auth.py:73-74`); RPC `record_user_login_device` (`auth.py:75-82`).
- **Ошибки:** невалидный initData → 401 с текстом причины; пустой upsert → 500.
- **В Next.js:** Route Handler + проверка HMAC на `crypto`, выпуск сессии.

#### 2.2.2. Instagram-аккаунты
- **Файлы:** `api/accounts.py`, `api/meta_oauth.py`, `services/instagram_profile.py`, `services/instagram_oauth.py`.
- **Маршруты:** `GET /api/accounts/` (`:48`), `GET /api/accounts/{id}/media` (`:68`), `POST /api/accounts/` (`:180`), `DELETE /api/accounts/{id}` (`:228`), `GET /api/instagram/meta/url` (`meta_oauth.py:61`), `GET /api/instagram/meta/start-page` (`:79`), `GET /api/instagram/auth/callback` (`:188`), `GET /api/instagram/facebook/url` (`:90`), `GET /api/instagram/facebook/callback` (`:127`), `GET /api/instagram/status/{telegram_id}` (`:462`), `POST /api/instagram/refresh/{telegram_id}` (`:477`), `POST /api/instagram/register` (`:375`, заглушка).
- **Данные:** `ig_accounts` (CRUD, «удаление» = `is_active=false`), `customer_profiles` (дублирующие поля `instagram_*`).
- **В Next.js:** все маршруты, кроме заглушки `register`.

#### 2.2.3. Задачи автоматизации и автоответы
- **Файлы:** `api/tasks.py`, `services/task_payload.py`, `frontend/src/pages/Tasks.tsx`, `frontend/src/pages/AutoReplyDM.tsx`, компоненты `ReplyDmComposer`, `AdvancedReplySettings`, `SelectedMediaPicker`, `KeywordChipsInput`, `ChatbotPreview`.
- **Маршруты:** `GET/POST /api/tasks/`, `POST /api/tasks/attachments`, `PATCH /api/tasks/{id}`, `PATCH /api/tasks/{id}/toggle`, `PATCH /api/tasks/{id}/cancel`, `DELETE /api/tasks/{id}` (`tasks.py:97-366`).
- **Внешние вызовы:** n8n `POST {N8N_BASE_URL}/webhook/{publish-post|keyword-funnel|dm-auto-reply|collect-analytics}` (`tasks.py:173-199`), Supabase Storage bucket `automation-attachments` (`tasks.py:203-246`).
- **Ошибки:** сбой n8n логируется, задача остаётся `pending` (`tasks.py:191-199`); загрузка — 415/413/400/502.
- **В Next.js:** все маршруты; загрузка вложений — с учётом лимита тела 4,5 МБ на Vercel (см. 8.3).

#### 2.2.4. Автоответы `automation_funnels`
- **Файлы:** `api/funnels.py`. **[Факт]** Фронтенд эти маршруты не вызывает (поиск `api.*('/api/funnels` пуст; `/funnels` редиректит на `/auto-reply-dm`, `App.tsx:101`). Автоответы фронтенда хранятся в `automation_tasks` с `task_type in (keyword_funnel, dm_reply)`.
- **[Вывод]** Модуль — legacy. Перенос — толь��о схемы таблицы и данных; маршруты не нужны, если n8n их не читает [Неизвестно].

#### 2.2.5. Лиды и аналитика
- **Файлы:** `api/analytics.py`, `pages/Dashboard.tsx`, `pages/Leads.tsx`.
- **Маршруты:** `GET /api/analytics/dashboard` (`:23`), `GET /api/analytics/leads` (`:81`), `GET /api/analytics/leads/{id}/interactions` (`:157`).
- **Данные (только чтение):** `customer_profiles.subscription_status`, `automation_tasks`, `users` (по `owner_id IN page_ids`), `interactions`, `ai_analytics_snapshots`.
- **[Факт]** Поиск экранирует спецсимволы PostgREST (`analytics.py:118-128`).

#### 2.2.6. Трекинг событий
- `POST /api/events/` (`api/events.py:13`) → insert `events`. Вызов: `hooks/useTrack.ts`, событие `app_opened` (`App.tsx:49-53`).

#### 2.2.7. Брокер Meta для n8n
- `POST /api/internal/meta/actions` (`api/internal_meta.py:43`), операция `check_follower`; авторизация `require_n8n_service` (`core/security.py:153-163`). Логика — `services/instagram_followers.py`.

#### 2.2.8. Webhooks
- `POST /api/webhooks/n8n/callback` (`webhooks.py:23`) — обновление статуса задачи + уведомление в Telegram.
- `GET/POST /api/webhooks/meta` (`webhooks.py:70`, `:89`) — верификация и проксирование в n8n.
- `POST /api/webhooks/telegram` (`telegram_webhook.py:16`) — бот.

---

## 3. Интеграция Telegram

### 3.1. Фактическая реализация

| Вопрос | Ответ | Источник |
|---|---|---|
| Где код бота | **В репозитории**, внутри FastAPI: один обработчик webhook | `backend/app/api/telegram_webhook.py` |
| Библиотека | aiogram 3.20.0 (`Bot`, типы `Update`, `InlineKeyboardMarkup`, `WebAppInfo`). `python-telegram-bot 21.6` объявлен, но **не импортируется** | `requirements.txt:9-10`, поиск импортов |
| Команды | `/start` → кнопка WebApp `https://almarathon.com`; `/start ig_auth` → кнопка WebApp `https://almarathon.com/settings` | `telegram_webhook.py:25-49` |
| URL webhook в Bot API | `POST https://api.almarathon.com/api/webhooks/telegram` [Вывод по маршруту]. Вызов `setWebhook` в репозитории **не найден** — регистрировался вручную [Неизвестно] |
| Проверка `X-Telegram-Bot-Api-Secret-Token` | **Нет** | `telegram_webhook.py:16-19` |
| Mini App | Да. `telegram-web-app.js` в `index.html:29`, `@twa-dev/sdk` в зависимостях | `frontend/index.html`, `hooks/useTelegram.ts` |
| Передача данных | Сырой `initData` → `POST /api/auth/telegram` в теле `init_data` | `store/authStore.ts:32-37` |
| Проверка `initData` | HMAC-SHA256: `secret = HMAC("WebAppData", BOT_TOKEN)`, сравнение `hmac.compare_digest` | `core/security.py:23-90` |
| Срок действия | `auth_date` не старше 24 ч и не в будущем более 60 с | `core/security.py:47-56` |
| Привязка к пользователю | upsert `customer_profiles` по `telegram_id` (`on_conflict="telegram_id"`) | `api/auth.py:60-64` |
| Сессия | JWT HS256 (`JWT_SECRET`), 24 ч, claims `sub`, `telegram_id`, `profile_id`, `first_name`, `username`, `exp`, `iat`; хранение — `sessionStorage` | `core/security.py:95-108`, `authStore.ts:47` |
| Выход по 401 | Удаление JWT и `window.location.reload()` → повторный вход по initData | `utils/api.ts:21-30` |
| Deep link | `https://t.me/<bot>?startapp=ig_connected|ig_error` после OAuth | `services/instagram_oauth.py:177-180` |
| Уведомления | `sendMessage` из callback n8n | `api/webhooks.py:45-63` |

### 3.2. Обнаруженные дефекты (факты кода)

1. **Уведомления никогда не отправляются.** `webhooks.py:57` обращается к `settings.bot_token`, а в `Settings` поле называется `BOT_TOKEN` (`config.py:15`). `case_sensitive=False` в pydantic-settings влияет на имена переменных окружения, а не на атрибуты объекта, поэтому возникает `AttributeError`, который поглощается `except Exception: pass` (`webhooks.py:64-65`). Этот дефект отмечен и в `SERVER_HANDOFF.md:637`.
2. **Mock Telegram в production-сборке.** `main.tsx:26-58` подменяет `window.Telegram.WebApp` с `initData: 'mock'`, если SDK не определил WebApp. Вне Telegram приложение отправит `mock` на `/api/auth/telegram` (получит 401), и страница `Landing` (`App.tsx:91`) не показывается, т.к. `initData` непустой.
3. **Логирование чувствительных данных в консоль:** JWT (`authStore.ts:40-42`), `initDataUnsafe` (`App.tsx:24-36`).
4. `aiogram.Bot` создаётся на уровне модуля через `os.getenv("BOT_TOKEN")` в обход `Settings` (`telegram_webhook.py:7`).

### 3.3. Что реализовать в Next.js

| Компонент | Решение | Обоснование |
|---|---|---|
| Проверка initData | Функция `verifyInitData()` на `node:crypto` (HMAC-SHA256), TTL ≤ 1 ч для входа | Логика `security.py:23-90` переносится 1:1; библиотека не нужна |
| Webhook бота | Route Handler `POST /api/telegram/webhook` с проверкой `X-Telegram-Bot-Api-Secret-Token` | Бот только отвечает на `/start` — короткая операция, подходит для serverless; отдельный процесс и long polling не нужны |
| Отправка сообщений | `fetch` к `https://api.telegram.org/bot<token>/sendMessage` | Используются 2 метода Bot API; фреймворк (grammY/aiogram) избыточен |
| Сессия | Подписанный токен (библиотека `jose`) с claim `typ=session`, хранение в памяти/`sessionStorage`, повторный выпуск из initData при запуске | Совпадает с текущей моделью; cookie внутри iframe Telegram Web проблематичны (третья сторона) |
| Регистрация webhook | Скрипт/админ-маршрут `setWebhook` с `secret_token` при деплое | Сейчас процедура не задокументирована в коде |

---

## 4. Интеграция Instagram

### 4.1. Механизм подключения

**[Факт]** Реализованы **два** OAuth-потока.

#### A. Instagram API with Instagram Login (основной, токен IGAA)

| Шаг | Реализация | Источник |
|---|---|---|
| 1. URL | `GET /api/instagram/meta/url?telegram_id=` → `auth_url` + `start_page_url`; проверка совпадения `telegram_id` с JWT | `meta_oauth.py:61-76` |
| 2. Стартовая страница | HTML на backend: открывает приложение Instagram (Android intent) или просит открыть в Chrome; обход ограничений WebView Telegram | `instagram_oauth.py:56-161` |
| 3. Авторизация | `https://www.instagram.com/oauth/authorize`, `client_id=META_INSTAGRAM_APP_ID` | `config.py:129-131`, `instagram_oauth.py:32-40` |
| Scopes | `instagram_business_basic`, `instagram_business_manage_messages`, `instagram_business_manage_comments`, `instagram_business_content_publish`, `instagram_business_manage_insights` (+`instagram_content_publish` при `DEVELOPMENT_MODE=false`) | `config.py:95-111` |
| state | JWT HS256 на `JWT_SECRET`, claims `telegram_id`, `exp` (15 мин) | `instagram_oauth.py:13-21` |
| Redirect URI | `META_REDIRECT_URI` (по умолчанию `https://api.almarathon.com/api/instagram/auth/callback`) | `config.py:46` |
| 4. Callback | `GET /api/instagram/auth/callback` | `meta_oauth.py:188-372` |
| Код → короткий токен | `POST https://api.instagram.com/oauth/access_token` | `meta_oauth.py:211-221` |
| Короткий → long-lived | `GET https://graph.instagram.com/access_token?grant_type=ig_exchange_token`; `expires_in` → `token_expires_at` | `meta_oauth.py:236-269` |
| Профиль | `GET graph.instagram.com/{v}/me?fields=id,user_id,username,name,account_type,profile_picture_url,followers_count` | `meta_oauth.py:271-293` |
| Принадлежность | Аккаунт определяется токеном пользователя (`/me`); если `page_id` уже у другого владельца → 409 | `meta_oauth.py:330-347` |
| Хранение | `ig_accounts.access_token` (**открытый текст**) + **дубль** в `customer_profiles.instagram_access_token` | `meta_oauth.py:316-364` |
| Возврат | HTML с переходом на `t.me/<bot>?startapp=ig_connected|ig_error` | `instagram_oauth.py:183-231` |

#### B. Facebook Login (дополнительный, токен EAAV)

| Шаг | Реализация | Источник |
|---|---|---|
| URL | `GET /api/instagram/facebook/url` → `facebook.com/{v}/dialog/oauth`, `config_id` или scopes `pages_show_list, pages_read_engagement, pages_manage_metadata, instagram_basic, instagram_manage_comments` | `meta_oauth.py:90-124`, `config.py:116-125` |
| Callback | `GET /api/instagram/facebook/callback` → обмен кода, `fb_exchange_token`, `debug_token`, проверка `app_id` | `meta_oauth.py:127-185`, `facebook_tokens.py:36-125` |
| Хранение | `ig_accounts.facebook_access_token` + метаданные `facebook_*` (открытый текст) | `facebook_tokens.py:100-125` |
| Обслуживание | `maintain_owner_facebook_tokens` — **только при входе пользователя**: `debug_token`, продление за `TOKEN_REFRESH_DAYS` (7) до истечения | `facebook_tokens.py:138-248`, `auth.py:74` |
| Использование во фронтенде | **[Факт]** Фронтенд `facebook/url` не вызывает (поиск пуст). Поток используется только как резерв токена в `check_follower` (`instagram_followers.py:107-119`) |

### 4.2. Запросы к Instagram/Meta API

| Запрос | Где | Назначение |
|---|---|---|
| `graph.instagram.com/{v}/me` | `instagram_profile.py:49-74`, `meta_oauth.py:271` | Профиль, `graph_id` (при каждом входе и при списке аккаунтов) |
| `graph.instagram.com/{v}/me/media` (fallback `/{page_id}/media`) | `accounts.py:112-151` | Публикации для выбора в автоответе |
| `graph.instagram.com|graph.facebook.com/{v}/{igsid}?fields=is_user_follow_business,...` | `instagram_followers.py:236-282` | Проверка подписки для n8n |
| `graph.facebook.com/{v}/debug_token`, `/oauth/access_token` | `facebook_tokens.py:36-75` | Facebook-токен |
| `graph.facebook.com/{v}/{page_id}` | `facebook_tokens.py:113-117` | Проверка доступа EAAV к аккаунту |

Версия API: `META_API_VERSION = v23.0` (`config.py:52`).

### 4.3. Пробелы

- **[Факт] Обновление long-lived Instagram-токена не реализовано.** `refresh_access_token` встречается только в `scripts/generate_meta_architecture_visuals.py:251`. Токен IGAA живёт ~60 дней (`token_expires_at` сохраняется, но не проверяется). Подтверждено `SERVER_HANDOFF.md:623`.
- **[Факт]** При отключении аккаунта токен в `ig_accounts` **не удаляется** (только `is_active=false`, `accounts.py:236-238`).
- **[Факт]** `POST /api/accounts/` (`accounts.py:180-225`) принимает произвольные `page_id` + `access_token` без проверки через Graph API. Фронтенд его не вызывает.
- **[Факт]** `POST /api/instagram/register` — заглушка, возвращает успех без действий (`meta_oauth.py:375-392`).
- **[Факт]** В лог пишется до 1000 символов тела ответа Meta (`meta_oauth.py:223-226, 249-252, 283-286`) — тело ошибки токен не содержит, но политику стоит сохранить строгой.

### 4.4. Ограничения Instagram API, которые нужно учесть

- Режим разработки Meta: в `DEVELOPMENT_MODE=true` доступ только у тестировщиков приложения (`config.py:7-10`); для всех пользователей нужен App Review и бизнес-верификация [Факт по комментарию кода].
- Новый домен → добавить Redirect URI в настройки обоих приложений Meta (Instagram App и Facebook App). Без этого OAuth на Vercel/новом домене не заработает.
- Вход Instagram внутри WebView Telegram нестабилен (HTTP 429, ошибки WebView) — сохранить стартовую страницу и `openLink(..., {try_browser:'chrome'})` (`utils/openExternalUrl.ts`, `docs/instagram-oauth-webview-2026-09-05.md`).
- Rate limits Graph API — коды повторяемых ошибок уже классифицированы (`instagram_followers.py:28`, `RETRYABLE_GRAPH_CODES`).

### 4.5. Что переписать на TypeScript

`services/instagram_oauth.py` (state, HTML-страницы), callback из `meta_oauth.py`, `services/instagram_profile.py`, `services/instagram_followers.py`, `services/facebook_tokens.py` (если Facebook-поток сохраняется), медиа из `accounts.py`. Новое: шифрование токенов, плановое обновление IGAA.

---

## 5. Полный аудит Supabase: схема, связи, RLS, функции и триггеры

### 5.0. Источники и ограничения аудита

**Что использовано.**
1. **Результаты read-only SQL-запросов к системным каталогам Supabase**, которые владелец проекта выполнил в SQL Editor 2026-11-16 и передал файлом `sql.txt`: таблицы и RLS, столбцы, ограничения, индексы, enum, функции, триггеры `public`, политики, объекты схемы `auth`, бакеты и политики Storage, Realtime-публикация. Данные пользователей в выгрузке отсутствуют.
2. **Инструменты коннектора Supabase в чате** (проверка 2026-11-16): прочитан список таблиц схемы `public` с точным числом строк и признаком RLS; URL проекта `belqsqksiibgqbgzohvo`. Остальные запросы коннектора вернули пустой ответ и в аудите не использованы.
3. SQL-файлы репозитория и код — для сопоставления, кто читает и пишет таблицы.

Источник каждого утверждения: **[БД]** — живая БД (п. 1–2), **[Репо]** — SQL-файлы и код.

**Статус по объектам БД:**

| Объект | Статус |
|---|---|
| Таблицы `public`, RLS, число строк | **Подтверждено [БД]**: 10 таблиц, RLS включён на всех, `FORCE RLS` нигде |
| Столбцы `ai_analytics_snapshots`, `automation_funnels`, `automation_tasks`, `content`, `customer_profiles`, `events`, `ig_accounts` | **Подтверждены полностью**, включая длину `varchar` |
| Столбцы всех таблиц `public` | **Подтверждены полностью** (включая `interactions`, `users`, `user_login_devices`) |
| Функции `public` | **Подтверждены вместе с телами** (3 функции) |
| PK, FK с правилами `ON DELETE`, UNIQUE, CHECK | **Подтверждены полностью** |
| Индексы | **Подтверждены полностью** |
| Значения enum | **Подтверждены** (3 типа) |
| Функции `public` (сигнатура, язык, SECURITY, тела) | **Подтверждены** |
| Триггеры в `public` | **Подтверждено: триггеров нет** |
| Политики RLS `public` | **Подтверждены** (5 политик) |
| Триггеры на `auth.users`, число строк в `auth.users` | **Подтверждено**: один триггер `on_auth_user_created`; в `auth.users` **0 строк** |
| Storage: бакеты и политики | **Подтверждено: бакетов и политик нет** |
| Realtime | **Подтверждено**: в публикации `supabase_realtime` только `public.automation_tasks` |
| Размеры таблиц на диске | **Подтверждены**: вся схема `public` — около 1,2 МБ |

**Пробелы:** содержимое workflows n8n, динамика нагрузки за пределами выборки (5.9, блок B11) и значения внутри `reply_attachments`/`comment_reply_gifs`/`reply_links` (проверялись только ссылки на Storage).

**Число строк (коннектор, 2026-11-16, точный счёт):** `users` 49, `events` 42, `interactions` 51, `customer_profiles` 7, `user_login_devices` 7, `automation_tasks` 6, `ig_accounts` 3, `automation_funnels` 1, `content` 0, `ai_analytics_snapshots` 0. Оценки из статистики Postgres в `sql.txt` (`reltuples`) устарели и отличаются — для планирования переноса использовать точные значения.

### 5.1. Таблицы

Всего в `public` **10 таблиц**, все подтверждены живой БД (столбцы, ограничения, индексы). Все `id` — `uuid DEFAULT gen_random_uuid()`.

#### `customer_profiles` — владелец (пользователь Telegram) [БД]

| Столбец | Тип | NULL | DEFAULT | Ограничение |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `telegram_id` | varchar | **NO** | — | **UNIQUE** |
| `email` | varchar | YES | — | UNIQUE |
| `phone_number` | varchar | YES | — | |
| `first_name`, `last_name`, `username` | varchar | YES | — | |
| `photo_url` | text | YES | — | |
| `language_code` | varchar | YES | — | |
| `subscription_status` | varchar | YES | `'free'` | |
| `subscription_ends_at` | timestamptz | YES | — | |
| `created_at` | timestamptz | YES | `now()` | |
| `instagram_page_id` | varchar | YES | — | дубль данных `ig_accounts` |
| `instagram_access_token` | text | YES | — | **токен в открытом виде**, дубль `ig_accounts.access_token` |
| `instagram_id`, `instagram_username` | text | YES | — | дубль |
| `instagram_connected` | boolean | YES | `false` | |
| `instagram_connected_at` | timestamp **without** time zone | YES | — | единственная колонка без часового пояса |

- **Расхождения с репозиторием.** Столбцы `email`, `phone_number`, `subscription_ends_at` в SQL-файлах репозитория и в коде backend/frontend **не найдены** (поиск по `backend/app`, `frontend/src`) — **[Факт]** они существуют в БД, но приложением не используются; назначение — [Неизвестно]. Таблица создана вне репозитория.
- **Читают:** `auth.py`, `accounts.py`, `tasks.py`, `funnels.py`, `analytics.py` (`subscription_status`), `meta_oauth.py`. **Создают/обновляют:** `auth.py:62` (upsert по `telegram_id`), `meta_oauth.py:351`, `accounts.py:243`. **Удаляют:** никто.
- **Входящие FK:** `ig_accounts.owner_id`, `automation_tasks.owner_id`, `automation_funnels.owner_id`, `content.owner_id`, `events.user_id`, `ai_analytics_snapshots.owner_id`, а также `user_login_devices.owner_id` [Репо].

#### `ig_accounts` — подключённые Instagram-аккаунты [БД]

| Столбец | Тип | NULL | DEFAULT | Ограничение |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `owner_id` | uuid | YES | — | FK → `customer_profiles.id` |
| `page_id` | varchar | NO | — | **UNIQUE** (Instagram `user_id`) |
| `username` | varchar | NO | — | |
| `display_name` | text | YES | — | |
| `profile_picture_url` | text | YES | — | |
| `followers_count` | **integer** | YES | `0` | |
| `access_token` | text | NO | — | **открытый текст** |
| `token_expires_at` | timestamptz | YES | — | |
| `is_active` | boolean | YES | `true` | |
| `mode` | text | YES | `'development'` | |
| `igba_id`, `graph_id` | varchar | YES | — | |
| `created_at` | timestamptz | YES | `now()` | |
| `facebook_access_token`, `facebook_user_id`, `facebook_token_error` | text | YES | — | токен в открытом виде |
| `facebook_token_expires_at`, `facebook_data_access_expires_at`, `facebook_token_last_checked_at` | timestamptz | YES | — | |
| `facebook_token_scopes` | jsonb | NO | `'[]'` | |
| `facebook_token_is_valid`, `facebook_token_refresh_required` | boolean | NO | `false` | |

- **Ограничения UNIQUE [БД]:** `page_id` и **составное** `(owner_id, page_id)`. Составной UNIQUE избыточен при UNIQUE на `page_id` — **[Вывод]**. Длины `varchar` подтверждены: `page_id`, `igba_id`, `graph_id` — 255, `username` — 100; `display_name` — text.
- **Расхождения с репозиторием:** `followers_count` — `integer` (в `supabase_migrations.sql` указан BIGINT); столбец `mode` в SQL-файлах и коде **не найден** (в `main.py:52` слово `mode` относится к ответу `/health`) — назначение [Неизвестно]; `display_name` — `text` (в репозитории VARCHAR(100)). Индексы `idx_ig_accounts_owner`, `idx_ig_accounts_graph_id` существуют в БД; `idx_ig_accounts_igba_id`, заявленный в репозитории, в БД **отсутствует** [БД].
- **Читают:** `accounts.py`, `analytics.py`, `tasks.py`, `funnels.py`, `meta_oauth.py`, `facebook_tokens.py`, `instagram_followers.py`, `instagram_profile.py`. **Создают:** `meta_oauth.py:349`, `accounts.py:220`. **Обновляют:** `meta_oauth.py:345`, `accounts.py:211,236`, `facebook_tokens.py`, `instagram_profile.py:88`. **Удаляют:** никто (мягкое удаление `is_active=false`).
- **Входящие FK:** `automation_funnels.ig_account_id`. **`automation_tasks.ig_account_id` — не FK** (см. ниже).

#### `automation_tasks` — задачи и правила автоответа [БД]

| Столбец | Тип | NULL | DEFAULT | Ограничение |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `owner_id` | uuid | YES | — | FK → `customer_profiles.id` |
| `ig_account_id` | **varchar** | YES | — | **FK отсутствует** |
| `task_type` | varchar | NO | — | значения в коде: `publish_post`, `keyword_funnel`, `dm_reply`, `analytics` |
| `status` | varchar(20) | YES | `'pending'` | CHECK нет [БД] |
| `payload` | jsonb | YES | `'{}'` | |
| `result` | jsonb | YES | — | |
| `error_message` | text | YES | — | |
| `schedule_at` | timestamptz | YES | — | |
| `comment_on_post`, `exact_match`, `all_content_types`, `check_subscription` | boolean | NO | **`true`** | |
| `selected_media_ids` | jsonb | NO | `'[]'` | |
| `created_at`, `updated_at` | timestamptz | YES | `now()` | |

- **Закрыто неизвестное из ранней версии:** фактический DEFAULT `comment_on_post` = `true` (в репозитории два противоречащих файла — `20260807_add_comment_on_post.sql` и `20260807_comment_on_post_default_true.sql`).
- **Читают/создают/обновляют/удаляют:** `api/tasks.py`; читают: `analytics.py:38`, `instagram_followers.py:142`; обновляет статус: `webhooks.py:35` (callback n8n); подписка Realtime: `frontend/src/pages/Tasks.tsx:99-105`.
- **Индексы** `idx_tasks_owner_status (owner_id, status)`, `idx_tasks_created (created_at DESC)` существуют [БД]. **Триггера `trg_tasks_updated_at` в БД нет** (триггеров в `public` нет): `updated_at` сам не обновляется — см. 5.3.

#### `automation_funnels` — legacy-автоответы [БД]

| Столбец | Тип | NULL | DEFAULT | Ограничение |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `owner_id` | uuid | YES | — | FK → `customer_profiles.id` |
| `ig_account_id` | **uuid** | YES | — | **FK → `ig_accounts.id`** |
| `trigger_keywords` | jsonb | NO | `'[]'` | |
| `content_type` | enum `content_type_enum` | YES | `'ALL'` | REELS, STORY, ALL |
| `reply_text` | text | NO | — | |
| `media_link` | text | YES | — | |
| `is_active` | boolean | YES | `true` | |
| `created_at` | timestamptz | YES | `now()` | |

- **Расхождения с кодом:** `api/funnels.py:76-84` не знает столбцов `content_type` и `media_link` — **[Факт]**; фронтенд эту таблицу не использует (`media_link` встречается в `AutoReplyDM.tsx:55` только как поле типа данных).
- **Различие с `automation_tasks.ig_account_id`:** здесь uuid + FK, в задачах — varchar без FK. **[Вывод]** `automation_funnels` — более ранняя модель, заменённая `automation_tasks`.
- **Читают/создают/обновляют/удаляют:** только `api/funnels.py`.

#### `content` — публикации Instagram и их метрики [БД; в репозитории не найдена]

| Столбец | Тип | NULL | DEFAULT | Ограничение |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `media_id` | varchar | NO | — | **UNIQUE** |
| `media_type` | enum `media_type_enum` | NO | — | REELS, STORY, POST |
| `caption` | text | YES | — | |
| `published_at` | timestamptz | YES | — | |
| `views_count`, `likes_count`, `comments_count`, `shares_count` | integer | YES | `0` | |
| `updated_at` | timestamptz | YES | `now()` | |
| `owner_id` | uuid | YES | — | FK → `customer_profiles.id` |

- **[Факт]** В `backend/app`, `frontend/src`, `backend/migrations` обращений к таблице `content` и к `interactions.content_id` **не найдено**. По сведениям владельца, данные пишет отдельный n8n, подключённый к Supabase напрямую; приложение с ним не обменивается данными по этим таблицам. Конкретные workflows не проверялись.
- Связь: `interactions.content_id` → `content.id`.
- Перенос: схему и данные сохранить (n8n может на неё опираться); код в новое приложение не переносить, пока не подтверждено использование.

#### `interactions` — события (комментарии, сообщения) [БД]

| Столбец | Тип | NULL | DEFAULT | Ограничение |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `user_id` | uuid | YES | — | FK → `users.id`, ON DELETE CASCADE |
| `content_id` | uuid | YES | — | FK → `content.id`, ON DELETE SET NULL |
| `interaction_type` | enum `interaction_type_enum` | NO | — | COMMENT, STORY_REPLY, DM, REELS_VIEW |
| `text_content` | text | YES | — | |
| `created_at` | timestamptz | YES | `now()` | |
| `from_id` | varchar(255) | YES | — | индекс |
| `from_username` | varchar(100) | YES | — | |
| `media_id` | varchar(255) | YES | — | индекс |
| `media_product_type` | varchar(50) | YES | — | |
| `event_field` | varchar(50) | YES | — | |
| `event_time` | bigint | YES | — | |
| `page_id` | varchar(255) | YES | — | FK → `ig_accounts.page_id`, ON DELETE SET NULL; индекс |
| `event_object` | varchar(50) | YES | — | |
| `comment_id` | varchar(255) | YES | — | частичный UNIQUE (`WHERE comment_id IS NOT NULL`) |
| `status_response` | boolean | YES | `false` | |
| `tasks_id` | uuid | YES | — | **FK отсутствует** (ссылка на `automation_tasks.id` по смыслу) |
| `text_answer` | text | YES | — | |
| `response_at` | timestamptz | YES | — | |
| `error_privaty_comment_at` | timestamptz | YES | — | |
| `text_err_privaty_comment` | text | YES | — | |
| `text_answer_message_error` | text | YES | — | |
| `time_answer_message _error_at` | timestamptz | YES | — | **в имени столбца пробел** (`"time_answer_message _error_at"`) |

- **[Факт]** В нумерации столбцов пропуски (позиции 16 и 18): столбцы были удалены. Опечатки в именах (`privaty`) и пробел в имени столбца нужно перенести как есть, пока n8n обращается к ним по этим именам; иначе — исправить вместе с n8n.
- **[Факт]** `tasks_id` не имеет FK; связь с `automation_tasks.id` — по смыслу. Перед добавлением FK проверить, что значения существуют в `automation_tasks`.
- **Индексы [БД]:** UNIQUE частичный `idx_interactions_comment_id`, `idx_interactions_from_id`, `idx_interactions_media_id`, `idx_interactions_page_id`, `idx_interactions_user (user_id, created_at DESC)`.
- **Читают:** `analytics.py:184`. **Создают:** отдельный n8n напрямую записывает в Supabase (по сведениям владельца); приложение не интегрировано с ним для доступа к БД. `instagram_ids.py:persist_comment_interaction` вызывается только тестами. Столбцы статуса ответа и ошибок (`status_response`, `text_answer*`, `response_at`, `error_*`) заполняет отдельный n8n.

#### `users` — лиды (пользователи Instagram) [БД]

| Столбец | Тип | NULL | DEFAULT | Ограничение |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `instagram_id` | varchar(255) | **NO** | — | входит в частичные UNIQUE |
| `username` | varchar(100) | **NO** | — | |
| `full_name` | varchar(255) | YES | — | |
| `is_follower` | boolean | YES | `false` | |
| `lead_status` | varchar(50) | YES | `'Холодный'` | CHECK нет; фактически во всех 49 строках `COLD` |
| `last_interaction_at` | timestamptz | YES | `now()` | |
| `created_at` | timestamptz | YES | `now()` | |
| `owner_id` | **varchar(255)** | YES | — | FK → `ig_accounts.page_id`, ON DELETE SET NULL |
| `page_id` | varchar(255) | YES | — | FK → `ig_accounts.page_id`, ON DELETE SET NULL; индекс |

- В БД 49 строк (коннектор, 2026-11-16), около 96 КБ.
- **[Факт]** `users.owner_id` хранит **`page_id` Instagram-аккаунта (строка), не uuid владельца**; `users.page_id` дублирует эту связь. Уникальность: `(owner_id, instagram_id)` при `owner_id IS NOT NULL`, `(page_id, instagram_id)` при обоих не NULL. Фильтр `.in_("owner_id", page_ids)` (`analytics.py:52-56, 109`) согласуется с этим.
- **[Факт]** `lead_status` — по умолчанию `'Холодный'`, но во всех 49 строках записано `COLD` (зап��ос B4); фронтенд ожидает именно `COLD` (`Leads.tsx:196`). **[Вывод]** DEFAULT в БД не используется: отдельный n8n, подключённый к Supabase напрямую, задаёт значение явно. В новом проекте использовать `'COLD'` как значение по умолчанию.
- **[Факт]** `users.page_id` пуст во **всех 49** строках (B3); связь с аккаунтом держится только на `owner_id`. Столбец `page_id` и его индексы фактически не используются.
- Индекс `idx_users_owner_lead (owner_id, lead_status)`.
- **Читают:** `analytics.py`. **Создаёт:** отдельный n8n напрямую в Supabase (по сведениям владельца; это не интеграция приложения с n8n).

#### `events` — трекинг [БД]

| Столбец | Тип | NULL | DEFAULT | Ограничение |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `user_id` | uuid | YES | — | FK → `customer_profiles.id` |
| `telegram_id` | **bigint** | YES | — | |
| `event_name` | text | NO | — | |
| `properties` | jsonb | YES | `'{}'` | |
| `created_at` | timestamptz | YES | `now()` | |

- **Расхождение типов:** `events.telegram_id` — bigint, `customer_profiles.telegram_id` — varchar.
- **Создают:** `api/events.py:19-24` (insert). Читают: никто в репозитории.

#### `ai_analytics_snapshots` — снимки аналитики [БД]

| Столбец | Тип | NULL | DEFAULT | Ограничение |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `owner_id` | uuid | YES | — | FK → `customer_profiles.id` |
| `snapshot_date` | date | YES | `CURRENT_DATE` | |
| `total_new_leads` | integer | YES | `0` | |
| `conversion_rate` | numeric | YES | `0.00` | |
| `ai_insights` | text | YES | — | |
| `created_at` | timestamptz | YES | `now()` | |

- **Читают:** `analytics.py:61-68` (`select *`, фильтр `owner_id`, сортировка `snapshot_date`); поля используются в `Dashboard.tsx:14-15,179-194`. **Создаёт:** отдельный n8n, подключающийся напрямую к Supabase (по сведениям владельца; приложение с n8n для доступа к БД не интегрировано).

#### `user_login_devices` — устройства входа [БД]

| Столбец | Тип | NULL | DEFAULT | Ограничение |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `owner_id` | uuid | NO | — | FK → `customer_profiles.id`, ON DELETE CASCADE |
| `telegram_id` | varchar(100) | NO | — | индекс |
| `device_kind` | varchar(20) | NO | — | CHECK: phone, tablet, computer |
| `os_type` | varchar(20) | NO | — | CHECK: ios, android, windows, macos, linux, unknown |
| `telegram_platform` | varchar(40) | NO | `'unknown'` | |
| `login_count` | integer | NO | `1` | |
| `first_login_at` | timestamptz | NO | `now()` | |
| `last_login_at` | timestamptz | NO | `now()` | индекс `(owner_id, last_login_at DESC)` |

- UNIQUE `(owner_id, device_kind, os_type)`. В БД 7 строк. RLS включён, политик и прав для `anon`/`authenticated` нет.
- **Пишет:** только RPC `record_user_login_device` из `services/login_devices.py:42` (INSERT … ON CONFLICT DO UPDATE: увеличивает `login_count`, обновляет `last_login_at`, `telegram_id`, `telegram_platform`). Чтение в коде нет.

### 5.2. Связи, индексы, ограничения

Все связи и правила подтверждены **[БД]**:

```
customer_profiles (id)
 ├─< ig_accounts.owner_id                 ON DELETE CASCADE
 ├─< automation_tasks.owner_id            ON DELETE CASCADE
 ├─< automation_funnels.owner_id          ON DELETE CASCADE
 ├─< content.owner_id                     ON DELETE CASCADE
 ├─< ai_analytics_snapshots.owner_id      ON DELETE CASCADE
 ├─< user_login_devices.owner_id          ON DELETE CASCADE
 └─< events.user_id                       без ON DELETE (NO ACTION)
ig_accounts (id)
 └─< automation_funnels.ig_account_id     ON DELETE SET NULL
ig_accounts (page_id, UNIQUE)
 ├─< users.owner_id                       ON DELETE SET NULL   (varchar → page_id)
 ├─< users.page_id                        ON DELETE SET NULL
 └─< interactions.page_id                 ON DELETE SET NULL
users (id)      ─< interactions.user_id          ON DELETE CASCADE
content (id)    ─< interactions.content_id       ON DELETE SET NULL

Связи БЕЗ FK:
 automation_tasks.ig_account_id (varchar 255) ··· ig_accounts.id (uuid)
 customer_profiles.telegram_id (varchar 100)  ··· events.telegram_id (bigint),
                                                  user_login_devices.telegram_id
```

**Ограничения.**
- UNIQUE: `customer_profiles.email`, `customer_profiles.telegram_id`, `content.media_id`, `ig_accounts.page_id`, `ig_accounts(owner_id, page_id)` (избыточен), `user_login_devices(owner_id, device_kind, os_type)`.
- CHECK есть **только** в `user_login_devices`: `device_kind IN ('phone','tablet','computer')`, `os_type IN ('ios','android','windows','macos','linux','unknown')`. **У `automation_tasks.status` и `task_type` CHECK нет** — допустимые значения определяются только кодом.
- Значения enum: `content_type_enum` = REELS, STORY, ALL; `media_type_enum` = REELS, STORY, POST; `interaction_type_enum` = COMMENT, STORY_REPLY, DM, REELS_VIEW.

**Индексы** (без неявных PK):

| Таблица | Индексы |
|---|---|
| `ai_analytics_snapshots` | `idx_ai_snapshots_owner_date (owner_id, snapshot_date)` |
| `automation_funnels` | `idx_funnels_ig_account (ig_account_id)`, `idx_funnels_owner (owner_id)` |
| `automation_tasks` | `idx_tasks_created (created_at DESC)`, `idx_tasks_owner_status (owner_id, status)` |
| `customer_profiles` | UNIQUE `email`, UNIQUE `telegram_id` |
| `events` | `idx_events_created_at`, `idx_events_event_name`, `idx_events_telegram_id` |
| `ig_accounts` | `idx_ig_accounts_graph_id`, `idx_ig_accounts_owner`, UNIQUE `page_id`, UNIQUE `(owner_id, page_id)` |
| `interactions` | UNIQUE частичный `idx_interactions_comment_id (comment_id) WHERE comment_id IS NOT NULL`, `idx_interactions_from_id`, `idx_interactions_media_id`, `idx_interactions_page_id`, `idx_interactions_user (user_id, created_at DESC)` |
| `user_login_devices` | `idx_user_login_devices_owner (owner_id, last_login_at DESC)`, `idx_user_login_devices_telegram (telegram_id)`, UNIQUE `(owner_id, device_kind, os_type)` |
| `users` | `idx_users_owner_lead (owner_id, lead_status)`, `idx_users_page_id (page_id)`, UNIQUE частичный `users_owner_instagram_id_key (owner_id, instagram_id) WHERE owner_id IS NOT NULL`, UNIQUE частичный `users_page_instagram_id_key (page_id, instagram_id) WHERE page_id IS NOT NULL AND instagram_id IS NOT NULL` |

**[Вывод]** Расхождения с репозиторием: индекса `idx_ig_accounts_igba_id`, заявленного в репозитории, в живой БД нет. Нет индексов на `content.owner_id`, `events.user_id`, `interactions.content_id`, `interactions.tasks_id` — при росте данных потребуются, если по ним будут запросы (сейчас данных мало).

### 5.3. Функции и триггеры

| Объект | Тип [БД] | Определение в репозитории | Использование |
|---|---|---|---|
| `update_updated_at()` | plpgsql, SECURITY INVOKER | `supabase_migrations.sql:108-114` | триггер `trg_tasks_updated_at` **в БД отсутствует** |
| `record_user_login_device(uuid,text,text,text,text)` | plpgsql, SECURITY INVOKER | `20260905_add_user_login_devices.sql:360-404` | RPC из `services/login_devices.py:42` |
| `handle_new_user()` | plpgsql, **SECURITY DEFINER**, `search_path = pg_catalog`, владелец `postgres` | **в репозитории не найдена** | триггер `on_auth_user_created` (AFTER INSERT ON `auth.users`): `INSERT INTO public.customer_profiles (id, email) VALUES (new.id, new.email)` |

- **Триггеров в схеме `public` нет** [БД, запрос 7 вернул 0 строк]. **[Факт]** `automation_tasks.updated_at` имеет только `DEFAULT now()`; автоматически при `UPDATE` он не меняется. **[Вывод]** В новом проекте нужно обновлять его в приложении (`$onUpdate` в Drizzle) — иначе поле будет статичным. Проверить, пишет ли `updated_at` backend (`tasks.py`, `webhooks.py:35`).
- **`handle_new_user()` [БД, тело прочитано]:** при регистрации в Supabase Auth создаёт строку в `customer_profiles` с `id` и `email`, но не заполняет `telegram_id` (`NOT NULL`) — **вставка завершилась бы ошибкой и сломала бы регистрацию**. Поскольку `auth.users` содержит **0 строк**, а приложение Supabase Auth не использует, функция и триггер — **остаток шаблона, не участвующий в работе**. При переносе не копировать; в Supabase удалить триггер отдельным решением. `update_updated_at()` и `record_user_login_device` — тела совпадают с репозиторием: первая ставит `NEW.updated_at = NOW()`, вторая выполняет upsert по `(owner_id, device_kind, os_type)`.
- 
### 5.4. RLS и политики

RLS **включён на всех 10 таблицах** `public`, `FORCE RLS` нигде [БД].

| Таблица | Политика (все `PERMISSIVE`, `FOR ALL`, `TO authenticated`) | Условие |
|---|---|---|
| `automation_funnels` | `Users can isolate their own funnels` | `auth.uid() = owner_id` |
| `automation_tasks` | `owner_tasks` | `auth.uid() = owner_id` |
| `content` | `Users can isolate their own instagram content data` | `auth.uid() = owner_id` |
| `ig_accounts` | `owner_ig_accounts` | `auth.uid() = owner_id` |
| `users` | `Users can isolate their own instagram audience data` | `EXISTS (SELECT 1 FROM ig_accounts a WHERE a.page_id = users.owner_id AND a.owner_id = auth.uid())` |
| `ai_analytics_snapshots`, `customer_profiles`, `events`, `interactions`, `user_login_devices` | **политик нет** | при RLS без политик `anon` и `authenticated` не видят строк; доступ только у ролей, обходящих RLS (`service_role`, `postgres`) |

**Права ролей (`information_schema.role_table_grants`) [БД]:**

| Таблицы | Права `anon` и `authenticated` |
|---|---|
| `automation_funnels`, `automation_tasks`, `content`, `ig_accounts`, `users` | **полный набор**: SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER |
| `ai_analytics_snapshots`, `customer_profiles`, `events`, `interactions`, `user_login_devices` | **нет прав** |

Фактическая защита пяти таблиц с широкими правами — **только RLS**: `anon` не имеет политик и ничего не видит, `authenticated` видит свои строки. Право `TRUNCATE` через REST-API Supabase недоступно, но остаётся избыточным. **[Вывод]** Рекомендуется отозвать лишние права (`REVOKE ALL ... FROM anon`) в старом проекте, пока он работает: в `ig_accounts` лежат токены в открытом виде, и ошибка в политике открыла бы их публичному ключу.

**[Вывод]** Политики используют `auth.uid()`, но **приложение не использует Supabase Auth**: backend выпускает собственный JWT (`core/security.py:95-108`) и работает через secret key, обходящий RLS (`core/supabase.py:9-17`). RLS не участвует в защите; изоляция данных держится на фильтрах `owner_id` в коде backend. Политика `users` показывает фактическую модель: `users.owner_id` хранит `page_id` Instagram-аккаунта владельца.

**[Вывод]** Realtime: в публикации `supabase_realtime` — **только `public.automation_tasks`**. Для неё есть политика только `TO authenticated`; фронтенд подписывается с publishable key без сессии Supabase (`Tasks.tsx:99-105`, роль `anon`), политики для `anon` нет. Следовательно, события `anon` не получает, подписка фактически не доставляет данные (утечки чужих задач нет). Проверить в браузере — работает ли обновление списка задач без перезагрузки; если нет, это мёртвый код. В Next.js заменить опросом (SWR с интервалом) или серверными событиями.

### 5.5. Supabase Auth и Storage

- **Схема `auth`:** стандартный набор таблиц Supabase Auth существует (27 объектов, включая `users`, `sessions`, `identities`, `refresh_tokens`, `mfa_*`, `oauth_*`, `sso_*`, `saml_*`, `webauthn_*`) [БД]. **В `auth.users` 0 строк** [БД]. В коде Supabase Auth не используется (нет `auth.sign*`, `auth.getUser`) [Репо]. Для переноса: данные `auth.*` не переносить — они пусты; триггер `on_auth_user_created` и `handle_new_user()` не переносить (5.3).
- **Storage — вложений нет [БД, запросы C1–C5, 2026-11-16]:** бакетов нет (C1), объектов нет (C2), ссылок на `/storage/v1/object/` в `payload` ни одной из 6 задач нет (C3), упоминаний `automation-attachments` нет (C5). Ключ `reply_attachments` есть в payload 5 задач, но ссылок на Storage в нём нет. **[Факт]** Никаких файлов во Storage этого проекта не хранится и ссылок на них нет. **[Вывод]** Копировать из Supabase Storage **нечего**: этап копирования объектов из плана не нужен. Загрузка вложений через `/api/tasks/attachments` ни разу не завершилась успешно (бакет не создан), либо файлы не прикладывались. В новом проекте хранилище вложений выбрать отдельно (Vercel Blob или S3-совместимое на DigitalOcean), заменить `payload.reply_attachments` на новый формат и проверить загрузку на тестовой задаче.

### 5.6. Рекомендации по переносу в Neon + Drizzle

1. **Схему описать по подтверждённой выгрузке (5.1–5.2)**: индексы, ограничения, enum и ON DELETE известны. Все столбцы таблиц подтверждены (5.1). Enum создавать как `pgEnum`: `content_type_enum` (REELS, STORY, ALL), `media_type_enum` (REELS, STORY, POST), `interaction_type_enum` (COMMENT, STORY_REPLY, DM, REELS_VIEW). `users.owner_id` и `users.page_id` — varchar с FK на `ig_accounts.page_id` (не uuid).
2. Объём данных мал (около 1,2 МБ, до 51 строки в таблице — 5.0): перенос данных — разовый, без простоя в несколько минут. `pg_dump --data-only` для таблиц `public` (без `auth`, `storage`, `realtime`) → `pg_restore`/`psql` в Neon. Порядок загрузки по FK: `customer_profiles` → `ig_accounts` → `automation_tasks`, `automation_funnels`, `events`, `ai_analytics_snapshots`, `content` → `users` → `interactions`.
3. Исправления схемы при переносе (отдельной миграцией после переноса 1:1):
   - `automation_tasks.ig_account_id` → `uuid` + FK на `ig_accounts.id` (сейчас `varchar` без FK; в `automation_funnels` уже `uuid` с FK). **Проверено (B2):** все 6 значений — валидные uuid существующих аккаунтов, подготовка данных не нужна.
   - Таблицы, которые приложение не использует, но которые есть в БД: `content`, `automation_funnels`, `interactions.content_id`, столбцы `customer_profiles.email/phone_number/subscription_ends_at`, `ig_accounts.mode`. Переносить 1:1 без изменений: отдельный n8n читает/пишет напрямую в Supabase; сначала проверить его workflows и перенастроить их подключение к новой БД (Н2). Удалять — отдельным решением.
   - `customer_profiles.instagram_connected_at` (`timestamp without time zone`) → `timestamptz`, если все значения известной временной зоны; иначе сохранить как есть и явно указать UTC.
   - `events.telegram_id` — bigint, `customer_profiles.telegram_id` — varchar: привести к одному типу (рекомендуется `bigint`; Telegram ID помещается в 64 бита) либо оставить, учитывая приведения в запросах.
   - `ig_accounts`: составной UNIQUE `(owner_id, page_id)` избыточен при UNIQUE на `page_id` — удалить при переносе.
   - `owner_id` в `ig_accounts`, `automation_tasks` → `NOT NULL`.
   - CHECK для `automation_tasks.status`, `task_type`.
   - Удалить дубли `customer_profiles.instagram_access_token`, `instagram_page_id`, `instagram_id`, `instagram_username`, `instagram_connected*` — производные от `ig_accounts`. Сначала убедиться, что n8n их не читает.
   - Токены (`access_token`, `facebook_access_token`) хранить зашифрованными (AES-256-GCM на уровне приложения, ключ в env).
   - `interactions.tasks_id` → FK на `automation_tasks.id` ; `ON DELETE SET NULL`. **Проверено (B5):** 48 значений, «осиротевших» нет.
   - Опечатки и пробел в именах столбцов `interactions` (`error_privaty_comment_at`, `text_err_privaty_comment`, `"time_answer_message _error_at"`) — переносить как есть до правки n8n.
   - Отозвать права `anon`/`authenticated` в Supabase (5.4); в Neon публичных ролей нет.
   - `users.owner_id` (page_id) — оставить как есть до обновления отдельного n8n и его прямых запросов к БД, иначе сломается запись лидов.
4. Триггера `updated_at` в БД нет (5.3) — в Drizzle использовать `$onUpdate(() => new Date())` (или создать триггер миграцией).
5. RPC `record_user_login_device` → обычный `INSERT … ON CONFLICT DO UPDATE` в Drizzle (`onConflictDoUpdate`).

### 5.7. Замена RLS серверными проверками

| Сейчас | В Next.js |
|---|---|
| Фильтр `.eq("owner_id", profile_id)` в каждом роутере | Функции доступа в `lib/db/queries/*.ts`, которые **принимают `ownerId` обязательным аргументом** и всегда добавляют `where(eq(table.ownerId, ownerId))` |
| `get_profile_id()` — отдельный запрос профиля по `telegram_id` | `requireSession()` возвращает `profileId` из подписанной сессии; лишний запрос не нужен |
| Проверка владения `ig_account_id` перед созданием задачи (`tasks.py:133-149`) | `assertOwnsIgAccount(ownerId, igAccountId)` |
| Лиды через `page_id` активных аккаунтов (`analytics.py:8-20`) | Тот же алгоритм в `getOwnedPageIds(ownerId)` |
| Сервисный доступ n8n | Отдельный модуль `lib/auth/service.ts` с проверкой Bearer (constant-time) |

Прямого доступа к БД из браузера в новом проекте нет — RLS не требуется.

### 5.8. Результаты проверки данных (2026-11-16)

Команды — `docs/SUPABASE_COMMANDS.sql` (блоки A–D); все выполнены, результаты получены. Персональные данные и токены не выводились.

| Проверка | Результат | Вывод для миграции |
|---|---|---|
| B1. Задачи | Все 6 — тип `dm_reply`: 4 `pending`, 2 `cancelled`; других типов (`publish_post`, `keyword_funnel`, `analytics`) нет | Рабочий сценарий — только автоответ в личные сообщения на комментарий. Остальные типы переносить как код, но тестировать на `dm_reply` |
| B2. `automation_tasks.ig_account_id` | 6 из 6 — валидные uuid, пустых нет, несуществующих аккаунтов нет | Переход на `uuid` + FK безопасен, данные подготовки не требуют |
| B3. Владельцы | У задач и аккаунтов `owner_id` везде заполнен; у `users` `owner_id` заполнен, **`page_id` пуст во всех 49** | `owner_id` можно сделать NOT NULL для `ig_accounts` и `automation_tasks`; `users.page_id` не используется |
| B4. Статусы лидов | Все 49 — `COLD` | DEFAULT `'Холодный'` в БД не используется; в новом проекте — `COLD` (5.1) |
| B5. `interactions.tasks_id` | 48 из 51 строк со ссылкой на задачу, «осиротевших» нет; 3 строки без `tasks_id` | FK на `automation_tasks.id` добавлять безопасно (`ON DELETE SET NULL`) |
| B6. Взаимодействия | Только тип `COMMENT`: `status_response` true — 32, false — 16, null — 3 | Типы `STORY_REPLY`, `DM`, `REELS_VIEW` в данных не встречаются; 16 комментариев без успешного ответа — повод разобраться по `text_answer_message_error` |
| B7. Дубли в `customer_profiles` | 3 профиля с заполненными `instagram_*`, и у всех 3 есть строка в `ig_accounts` | Дубли можно удалять после проверки, что n8n их не читает |
| B8. Аккаунты Instagram | Все 3 в режиме `development`, активны. У одного токен **истёк 2026-11-06**, Facebook-токен недействителен; у двух других срок до 2027-01-08, Facebook-токен действителен, но `refresh_required = true` | Подтверждает отсутствие автообновления токенов (раздел 6): один аккаунт уже потерял доступ. Meta-приложение в dev-режиме: сообщения получают только добавленные тестировщики |
| B9. Подписки | Все 7 профилей — `free` | Платных пользователей нет; логику подписок переносить, но без сложных сценариев миграции |
| B10. Устройства | Android — 3 строки (63 входа), iOS — 2 (7), Windows — 2 (25) | Мобильные Telegram и десктоп — оба сценария реальные: тестировать на обоих |
| B11. Активность | `events` 2026-10-18 … 2026-11-14; `interactions` … 2026-11-12; `users` … 2026-11-12; последняя задача создана 2026-10-22; `ai_analytics_snapshots` и `content` пусты | Сервис в тестовой эксплуатации с малой нагрузкой; блоки аналитики на основе снимков и контента пусты |
| B12. События | `app_opened` 38, `locked_nav_clicked` 2, `connect_banner_clicked` 2 | Трекинг простой; переносится без изменений |
| C1–C5. Storage | Бакетов, объектов, ссылок на Storage нет (5.5) | Копирование не требуется |
| D1–D5. Безопасность | RLS включён везде; 5 политик `TO authenticated`; права `anon`/`authenticated` полные на 5 таблиц; функции `public` вызываются только `service_role`; Realtime — только `automation_tasks` | Подтверждает 5.4; права рекомендуется отозвать |
| D6–D9. Сервис | PostgreSQL 17.6; вся БД 13 МБ (включая системные схемы); `max_connections` 60; таймзона UTC; `statement_timeout` 120 с; расширения `pgcrypto`, `uuid-ossp`, `supabase_vault`, `pg_stat_statements`; представлений и последовательностей в `public` нет; подключений мало | Neon 17 совместим; `gen_random_uuid()` встроена, `pgcrypto`/`uuid-ossp` в новом проекте не нужны, если код их не вызывает. `supabase_vault` не используется приложением |

**Оставшиеся вопросы (не по метаданным):** что лежит внутри `reply_attachments`, `comment_reply_gifs`, `reply_links` в `payload` (ссылки на внешние ресурсы вместо Storage), и каким образом n8n задаёт `COLD`. Это решается экспортом workflows n8n (Н2).

---

## 6. Аудит безопасности

### 6.1. Критические проблемы

| # | Проблема | Доказательство | Последствия |
|---|---|---|---|
| К1 | **Секреты в истории публичного репозитория.** Строки, похожие на ключи Supabase (JWT), и токен Telegram-бота присутствуют в истории `.env.example`; удалены только в рабочем дереве | Коммиты `6bc3e98`, `488938d` (2026-08-07), `83e0e8a`, `2f21506` (2026-09-18), `cc15f90`, `0240db0` (2026-09-21), `4ed388c` (2026-11-10, удаление); файл `.env.example`. Значения не приводятся | Любой может получить доступ к БД (service-role обходит RLS) и боту. **Нужна ротация** всех ключей Supabase, `BOT_TOKEN`, а также `META_*_SECRET`, `JWT_SECRET`, `N8N_*`, если они когда-либо были в истории. Проверить, были ли ключи ротированы после удаления, — [Неизвестно]. Коммит `6f1791d` «migrate Supabase keys» говорит о переходе на новые ключи, но ротацию старых подтвердить нельзя |
| К2 | **Токены Instagram и Facebook хранятся открытым текстом** в двух таблицах | `ig_accounts.access_token`, `facebook_access_token`, `customer_profiles.instagram_access_token`; `meta_oauth.py:323,354` | Утечка БД = управление аккаунтами клиентов (сообщения, комментарии, публикации) |

### 6.2. Существенные проблемы

| # | Проблема | Доказательство |
|---|---|---|
| С1 | `POST /api/webhooks/n8n/callback` **без авторизации**: позволяет менять `status/result/error_message` любой задачи по её UUID и инициировать отправку сообщения на произвольный `chat_id` (сейчас не срабатывает из-за дефекта 3.2.1) | `webhooks.py:23-42` |
| С2 | **Смешение назначений JWT.** OAuth-state (`instagram_oauth.py:13-21`, `meta_oauth.py:99-107`) и сессия подписаны одним `JWT_SECRET` без claim типа/аудитории. State содержит `telegram_id` и передаётся в URL (стартовая страница, история браузера, логи). `get_current_user` (`security.py:126-138`) примет state как Bearer-токен на 15 минут для эндпоинтов, использующих только `telegram_id` (`accounts.py`, `tasks.py`, `funnels.py`, `meta_oauth.py`) | указанные строки |
| С3 | Webhook Telegram **без `secret_token`**: подделанные update заставят бота отправлять сообщения | `telegram_webhook.py:16-19` |
| С4 | `POST /api/webhooks/meta` **без проверки `X-Hub-Signature-256`**, тело пересылается в n8n | `webhooks.py:89-110`; признано в `SERVER_HANDOFF.md:633` |
| С5 | `GET /api/webhooks/meta` падает с 500: обращение к несуществующему `settings.meta_webhook_verify_token`; в `.env.example:41` пример verify token — тривиальное значение | `webhooks.py:83`, `config.py:45` |
| С6 | Репозиторий создаёт **публичный** бакет `automation-attachments` (любой, кто знает URL, читает вложения), но в проверенной БД бакетов нет | `20260831_*.sql`, `tasks.py:233`; БД: `storage.buckets` пуст (5.5) |
| С7 | Backend опубликован на хосте `8000:8000` в обход nginx/Caddy — rate limit nginx (`limit_req`) не действует при прямом обращении к IP:8000 (если не закрыт firewall — [Неизвестно]) | `docker-compose.yml:14-15` |
| С8 | `POST /api/accounts/` сохраняет произвольные `page_id`+`access_token` без проверки через Graph → можно «занять» чужой `page_id` (реальному владельцу вернётся 409) | `accounts.py:180-225` |
| С9 | JWT и данные Telegram выводятся в консоль браузера | `authStore.ts:40-42`, `App.tsx:24-36` |

### 6.3. Потенциальные риски

- `detail=str(e)` возвращает текст внутренних исключений клиенту (`meta_oauth.py:392,474,489`).
- In-memory rate limit/кэш (`core/rate_limit.py`, `core/cache.py`) не работают при нескольких процессах; `request.client.host` за прокси = IP прокси, т.е. лимит общий на всех пользователей [Вывод].
- CORS: `allow_credentials=True` + список из env (`main.py:24-30`), cookie не используются — флаг лишний.
- Синхронные HTTP-вызовы Meta при каждом входе (`auth.py:73-74`) — замедление и риск rate limit Meta.
- Отсутствие CHECK/FK на ключевых полях (5.6).
- `owner_id` nullable — возможны «сироты».
- В `.env.example:15` — персональный e-mail администратора n8n (значение не приводится).
- Отсутствие обновления IGAA-токенов → массовая потеря доступа через ~60 дней после подключения. **[Факт, БД]** У одного из 3 аккаунтов токен уже истёк 2026-11-06, ещё у двух `facebook_token_refresh_required = true` (5.8, B8).

### 6.4. Что реализовано корректно

- Проверка initData по официальному алгоритму, `compare_digest`, TTL (`security.py:23-90`).
- Проверка `telegram_id` из JWT против параметра пути (`meta_oauth.py:66,95,468,483`).
- Фильтр `owner_id` во всех пользовательских запросах (`tasks.py`, `funnels.py`, `accounts.py`, `analytics.py`).
- Сервисный токен n8n: constant-time, пустой не принимается (`security.py:143-163`).
- Токены не возвращаются клиенту (`ACCOUNT_PUBLIC_FIELDS`, `accounts.py:17-25`).
- Валидация MIME/размера вложений (`tasks.py:20-30, 208-221`).

### 6.5. Рекомендации для нового проекта

1. Ротировать все секреты до запуска нового проекта; в новом репозитории подключить secret scanning и pre-commit (gitleaks).
2. Шифрование токенов (AES-256-GCM, `TOKEN_ENCRYPTION_KEY`), удаление токена при отключении.
3. Разные ключи/claim `typ` для сессии и OAuth-state; state — одноразовый (nonce в БД или cookie).
4. Все входящие webhook: Telegram `secret_token`, Meta `X-Hub-Signature-256` (если будет использоваться), n8n — Bearer `N8N_SERVICE_TOKEN`.
5. Вложения — приватное хранилище + подписанные ссылки, либо публичные, но с непредсказуемыми путями (осознанное решение: n8n должен передавать URL в Instagram DM, а Meta требует публичный URL [Вывод]).
6. Валидация входа схемами (zod) во всех Route Handlers.
7. Ответы об ошибках — без внутренних деталей; детали — в логах.
8. Заголовки безопасности (HSTS, nosniff, Referrer-Policy) в `next.config`; `X-Frame-Options` **не ставить** на страницы Mini App — Telegram Web встраивает приложение в iframe.

### 6.6. Безопасность развёртывания

| Аспект | Vercel | DigitalOcean |
|---|---|---|
| Секреты | Переменные окружения проекта с разделением Production/Preview/Development; помечать как Sensitive | `.env` вне репозитория, права 600, Docker `env_file`; либо Docker secrets |
| Доступ к Neon | Строка подключения через интеграцию; для Preview — отдельные ветки Neon (данные production в Preview не попадают) | Строка подключения в `.env`; IP Allow (платные планы Neon) с адресом дроплета |
| Защита API | Vercel Firewall (правила rate limit), проверка сессии в каждом Route Handler | Caddy/nginx `limit_req`, закрыть 3000/8000 firewall (ufw/DO Cloud Firewall), наружу только 80/443 |
| HTTPS | Автоматически | Caddy (уже есть) — автоматические сертификаты |
| Домены и callback | Production-домен фиксирован; Preview-URL меняются → **OAuth Meta и Mini App только на production-домене** (или отдельный staging-домен) | Один домен, callback стабилен |
| Окружения | Preview: отдельный тестовый бот Telegram и тестовое приложение Meta (или тот же App в dev-режиме с отдельным Redirect URI) | Отдельный staging-стек/порт или поддомен |

---

## 7. Аудит зависимостей

### 7.1. Backend (`backend/requirements.txt`, версии зафиксированы)

| Пакет | Версия | Назначение / где | Аналог в Next.js | Примечание |
|---|---|---|---|---|
| fastapi | 0.115.0 | весь API, `main.py` | Route Handlers | — |
| uvicorn[standard] | 0.30.6 | сервер, `Dockerfile:18` | встроенный сервер Next.js / Vercel | — |
| python-jose[cryptography] | 3.3.0 | JWT, `security.py`, `instagram_oauth.py`, `meta_oauth.py` | `jose` (npm) | python-jose не развивается; при переносе — не важно |
| python-multipart | 0.0.12 | `UploadFile` в `tasks.py` (неявно) | `request.formData()` | — |
| httpx | 0.27.2 | все HTTP-вызовы Meta/n8n/Telegram | `fetch` | библиотека не нужна |
| supabase | 2.34.1 | БД и Storage, `core/supabase.py` | Drizzle + `@neondatabase/serverless`; хранилище — Vercel Blob/S3 | ключевая замена |
| pydantic | 2.11.7 | схемы запросов | zod | — |
| pydantic-settings | 2.5.2 | `config.py` | `lib/env.ts` на zod | — |
| aiogram | 3.20.0 | бот, `telegram_webhook.py` | `fetch` к Bot API | для 2 методов фреймворк не нужен |
| python-telegram-bot | 21.6 | **не используется** | — | удалить |
| aiohttp | 3.10.8 | **не импортируется напрямую** (транзитивно для aiogram) | — | — |
| python-dotenv | 1.0.1 | **не импортируется** (pydantic-settings читает `.env` сам) | — | — |
| pytest (dev) | 8.3.3 | 8 модулей тестов | Vitest | тесты — ценная спецификация поведения |

### 7.2. Frontend (`frontend/package.json`, фактические версии из `package-lock.json`)

| Пакет | Объявлено | Установлено | Назначение | В Next.js |
|---|---|---|---|---|
| react / react-dom | ^18.3.1 | 18.3.1 | UI | React 19 (входит в Next.js 16) — проверить совместимость компонентов |
| react-router-dom | ^6.27.0 | 6.30.4 | маршрутизация | App Router (заменяется) |
| zustand | ^5.0.1 | 5.0.14 | `authStore` | можно оставить для клиентской сессии или заменить контекстом |
| axios | ^1.7.7 | 1.18.1 | API-клиент с Bearer | `fetch` + SWR |
| @supabase/supabase-js | ^2.46.1 | 2.109.0 | только Realtime (`Tasks.tsx`) | удалить; SWR `refreshInterval`/revalidate on focus |
| @twa-dev/sdk | ^7.10.0 | 7.10.1 | обёртка Telegram WebApp | оставить или использовать `window.Telegram.WebApp` (скрипт в `<head>`) |
| vite | ^5.4.10 | 5.4.21 | сборка | Next.js |
| typescript | ^5.6.3 | 5.9.3 | | сохраняется |
| tailwindcss | ^3.4.14 | 3.4.19 | стили | Tailwind 4 (конфиг переносится в CSS `@theme`) |
| eslint | ^9.13.0 | 9.39.5 | | сохраняется |

Тестовые файлы `*.test.ts` используют `node:assert` и запускаются без раннера — скрипта `test` в `package.json` нет [Факт].

### 7.3. Группы по назначению

| Группа | Старый проект | Новый проект |
|---|---|---|
| Telegram | aiogram, python-telegram-bot (не исп.), @twa-dev/sdk, telegram-web-app.js | `fetch` к Bot API; telegram-web-app.js |
| Instagram / Meta | собственный код на httpx | собственный код на `fetch` (SDK Meta не нужен) |
| Supabase | supabase-py, supabase-js | Drizzle ORM + драйвер Neon |
| Авторизация | python-jose, HMAC вручную | `jose`, `node:crypto` |
| HTTP | httpx, axios | `fetch`, SWR |
| Валидация | pydantic | zod |
| Файлы | python-multipart + Supabase Storage | Vercel Blob (client upload) или S3-совместимое хранилище (DO Spaces) |
| Фоновые задачи | нет в приложении; выполняет n8n | n8n (без изменений) + одна плановая задача обновления токенов |

---

## 8. Анализ инфраструктуры: Docker, DigitalOcean и Vercel

### 8.1. Фактическая инфраструктура (по репозиторию и документам)

| Элемент | Значение | Источник |
|---|---|---|
| Сервер | Ubuntu, RAM 1,9 GiB, swap 4 GiB, Docker 28.x; регион — [Неизвестно] | `docs/droplet_state.md:17-45` |
| Compose-проект 1 | `instagram-bot-app` в `/opt/instagram-bot/instagram-bot-app`: `backend` (сборка `./backend`, лимит 0,5 CPU / 256 МБ, порт `8000:8000`, healthcheck `/health`) и `nginx` (nginx:alpine, 0,25 CPU / 128 МБ, volumes `nginx.conf`, `nginx/ssl`, `frontend/dist`) | `docker-compose.yml`, `SERVER_HANDOFF.md:434-452` |
| Compose-проект 2 | `n8n-docker-caddy` в `/home/almat/n8n-docker-caddy`: `caddy` (80/443, TLS) и `n8n` (5678); volumes `caddy_data`, `n8n_data` | `docs/SERVER_ARCHITECTURE.md`, `SERVER_HANDOFF.md:454-463` |
| Сеть | внешняя `instagram-bot-app_app-network` (общая для обоих проектов) | `docker-compose.yml:61-64` |
| Маршрутизация | Caddy → `almarathon.com` → nginx:80; `api.almarathon.com` → backend:8000; `n8n.almarathon.com` → n8n:5678 | `SERVER_HANDOFF.md:465-481`. Caddyfile в репозитории **не найден** |
| nginx | только `listen 80`, HTTPS-блоки закомментированы (TLS у Caddy); `limit_req 10r/s burst 20` на api-хосте; no-cache для `index.html` | `nginx/nginx.conf` |
| Frontend | собирается **на сервере** `npm run build`, раздаётся из `frontend/dist`; `frontend/Dockerfile` в production не используется | `SERVER_HANDOFF.md:483-525` |
| Деплой | вручную: `git pull --ff-only`, `docker compose build --no-cache backend`, `up -d --force-recreate --no-deps backend`, `restart nginx` | `SERVER_HANDOFF.md:483-525` |
| Backend → n8n | `N8N_BASE_URL=http://n8n:5678` (внутренняя сеть) | `docker-compose.yml:21` |
| Резервное копирование, мониторинг, CI | **Не найдено в репозитории** | — |
| Переменные, передаваемые в backend | `SUPABASE_URL, SUPABASE_SECRET_KEY, BOT_TOKEN, JWT_SECRET, N8N_BASE_URL, N8N_API_KEY, CORS_ORIGINS, META_APP_ID, META_APP_SECRET, META_INSTAGRAM_APP_ID, META_INSTAGRAM_APP_SECRET, META_REDIRECT_URI, META_FACEBOOK_CONFIG_ID, META_FACEBOOK_REDIRECT_URI, ENVIRONMENT` | `docker-compose.yml:16-31` |

**[Вывод]** В Compose не передаются `N8N_SERVICE_TOKEN` (fallback на `N8N_API_KEY`, `config.py:91`), `META_WEBHOOK_VERIFY_TOKEN`, `BACKEND_URL`, `FRONTEND_URL`, `TELEGRAM_BOT_USERNAME`, `DEVELOPMENT_MODE` → используются значения по умолчанию из `config.py`. Переменная `ENVIRONMENT` кодом не читается.

### 8.2. Переменные окружения (полный перечень)

| Имя | Назначение | Где используется | Обязательность |
|---|---|---|---|
| `BOT_TOKEN` | Bot API, проверка initData | `config.py:15`, `security.py:65`, `telegram_webhook.py:7` | обязательна (без неё `Settings` не создастся) |
| `JWT_SECRET` | подпись сессии и OAuth-state | `security.py`, `instagram_oauth.py`, `meta_oauth.py` | обязательна |
| `JWT_ALGORITHM`, `JWT_EXPIRE_HOURS` | параметры JWT | `config.py:23-24` | по умолчанию |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | доступ к БД | `core/supabase.py` | обязательны |
| `META_APP_ID`, `META_APP_SECRET` | Facebook App: debug/exchange токена | `facebook_tokens.py`, `meta_oauth.py:96,147-148` | для Facebook-потока |
| `META_INSTAGRAM_APP_ID`, `META_INSTAGRAM_APP_SECRET` | Instagram Login | `instagram_oauth.py:34,53`, `meta_oauth.py:204-245` | для подключения Instagram |
| `META_REDIRECT_URI` | callback Instagram | `instagram_oauth.py:35`, `meta_oauth.py:218` | для Instagram |
| `META_FACEBOOK_CONFIG_ID`, `META_FACEBOOK_REDIRECT_URI` | Facebook Login for Business | `meta_oauth.py:113-119,149` | опционально |
| `META_WEBHOOK_VERIFY_TOKEN` | верификация webhook Meta | `config.py:45` (код обращается к другому имени) | — |
| `META_API_VERSION` | версия Graph | везде | по умолчанию `v23.0` |
| `N8N_BASE_URL` / `N8N_URL` | адрес n8n | `tasks.py:180`, `webhooks.py:103` | для задач |
| `N8N_API_KEY` | Bearer к n8n и fallback сервисного токена | `tasks.py:188`, `config.py:85-91` | для задач |
| `N8N_SERVICE_TOKEN` | Bearer n8n → backend | `security.py:156` | для брокера |
| `CORS_ORIGINS` | CORS | `main.py:26` | по умолчанию |
| `DEVELOPMENT_MODE` | режим Meta, скоупы | `config.py:10,108` | по умолчанию true |
| `TOKEN_REFRESH_DAYS`, `HTTP_TIMEOUT` | токены, таймауты | `facebook_tokens.py:199`, многие | по умолчанию |
| `WEBAPP_URL`, `FRONTEND_URL`, `BACKEND_URL`, `TELEGRAM_BOT_USERNAME` | URL | `meta_oauth.py:46`, `instagram_oauth.py:44,178` | по умолчанию (`WEBAPP_URL` в коде не используется) |
| `DEBUG` (`debug`) | `/docs` FastAPI | `main.py:19-20` | по умолчанию false |
| `VITE_API_URL` | базовый URL API (build-time) | `frontend/src/utils/api.ts:4` | обязательна для production-сборки |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Realtime | `frontend/src/utils/supabase.ts:3-4` | опционально |
| `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `N8N_HOST`, `N8N_USER`, `N8N_PASSWORD`, `N8N_ENCRYPTION_KEY`, `DOMAIN_NAME`, `SUBDOMAIN`, `GENERIC_TIMEZONE` | указаны в `.env.example`, **кодом приложения не читаются** (относятся к n8n/Caddy или устарели) | `.env.example` | — |

Секрет в исходном коде рабочего дерева: `backend/tests/conftest.py:3` — строка формата токена бота, по виду **тестовое значение** (`setdefault` для тестов). Иных секретов в рабочем дереве не найдено (поиск по шаблонам JWT, `sb_secret_`, `EAA…`, `IGAA…`, токена бота).

### 8.3. Vercel (документация проверена 2026-11-15)

Источники: [Functions Limits](https://vercel.com/docs/functions/limitations), [Cron Jobs Usage & Pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing), [Pricing](https://vercel.com/pricing), [Neon ↔ Vercel](https://neon.com/docs/guides/vercel-overview).

| # | Вопрос | Оценка для проекта |
|---|---|---|
| 1-3 | Деплой, GitHub, автодеплой | Нативная поддержка Next.js; push в `main` → Production, PR → Preview |
| 4 | Production / Preview / Development | Отдельные наборы переменных; Neon-интеграция создаёт ветку БД на каждый Preview |
| 5 | Переменные окружения | В настройках проекта; `NEXT_PUBLIC_*` попадают в клиент — секреты так не называть |
| 6 | Neon | Vercel-Managed (оплата через Vercel) или Neon-Managed (существующий аккаунт); обе с preview-ветками |
| 7 | Регион | Functions по умолчанию в `iad1`, регион меняется; выбрать регион функций рядом с регионом Neon. Аудитория по косвенным признакам русскоязычная (`GENERIC_TIMEZONE=Europe/Moscow`, тексты на русском) → [Рекомендация] `fra1` + Neon `aws-eu-central-1` |
| 8 | Домены, HTTPS | Автоматические сертификаты; перенос `almarathon.com`/`api.` — изменение DNS (выполнять только на этапе запуска) |
| 9 | Redirect URI Instagram | Добавить `https://<домен>/api/instagram/auth/callback` в Instagram App и (при необходимости) `…/facebook/callback` в Facebook App. Preview-URL меняются → OAuth проверять на стабильном домене |
| 10 | Mini App | В BotFather / кнопках бота сменить URL WebApp на новый домен (сейчас URL захардкожен: `telegram_webhook.py:29,41`) |
| 11 | Лимиты функций | Длительность: Hobby 300 с, Pro до 800 с; память 2 ГБ (Pro до 4 ГБ); **тело запроса/ответа ≤ 4,5 МБ** |
| 12 | Длительные задачи | В приложении нет: самый долгий путь — callback OAuth (3 запроса к Meta, таймаут 30 с) и вход (N запросов к Meta по числу аккаунтов) — укладываются в лимиты |
| 13 | Фоновые задачи / расписания | Нужна **одна** задача: обновление IGAA-токенов. Cron Jobs: Hobby — раз в сутки (точность ±59 мин), Pro — до раза в минуту. Суточной частоты достаточно |
| 14 | Файлы | Файловая система функций эфемерна. **Вложения до 10 МБ превышают лимит 4,5 МБ** → нужна прямая загрузка из браузера в Vercel Blob (client upload) или уменьшение лимита до 4 МБ |
| 15 | Логи и мониторинг | Runtime Logs: Hobby 1 ч, Pro 1 день (30 дней с Observability Plus); Drains — на Pro |
| 16 | Масштабирование, стоимость | Автомасштабирование; Hobby $0 (только некоммерческое использование по условиям Vercel), Pro $20/мес за место + потребление |

**Совместимость бизнес-логики Python Backend с Vercel Functions**

| Функция | Подходит для Route Handler / Server Action | Комментарий |
|---|---|---|
| Вход по initData | Да | CPU-нагрузка минимальная |
| Instagram OAuth (url, start-page, callback) | Да | HTML стартовой страницы — Route Handler с `text/html` |
| Аккаунты, медиа, статус, refresh | Да | |
| Задачи CRUD, toggle, cancel | Да | |
| Вложения | Да, при client upload | лимит тела 4,5 МБ |
| Дашборд, лиды, история | Да | |
| Трекинг событий | Да | |
| Брокер `check_follower` для n8n | Да | n8n обращается по публичному HTTPS вместо `http://backend:8000` |
| Callback n8n, уведомления | Да | добавить авторизацию |
| Webhook Telegram | Да | ответ сразу, без долгих операций |
| Обслуживание токенов при входе | Да, но лучше вынести в cron | сейчас тормозит вход |
| In-memory rate limit/кэш | **Нет** (инстансы не разделяют память) | заменить правилами Vercel Firewall |
| Realtime Supabase | Нет аналога в стеке | SWR-опрос |
| n8n | **Нет** — отдельный долгоживущий сервис | остаётся на DigitalOcean |

**[Вывод]** Вся логика FastAPI переносится в Next.js без отдельных процессов и очередей. Внешний сервис, который нельзя разместить на Vercel, — n8n (уже существует на дроплете).

### 8.4. Требования к будущей инфраструктуре DigitalOcean

| Требование | Решение [Рекомендация] |
|---|---|
| Dockerfile | multi-stage: `node:22-alpine` → `next build` с `output: 'standalone'` → runtime-образ, `node server.js`, порт 3000, непривилегированный пользователь |
| docker-compose | сервис `web` (Next.js), подключение к существующей сети Caddy; **без публикации порта на хост**; healthcheck `GET /api/health`; `restart: unless-stopped`; лимит памяти ~512 МБ |
| Прокси/HTTPS | Использовать существующий Caddy (`almarathon.com` → `web:3000`). Отдельный nginx не нужен: статику раздаёт Next.js |
| Переменные | `.env` на сервере (не в Git), тот же набор, что на Vercel (9.11) |
| Neon | `DATABASE_URL` с pooled-хостом (`-pooler`), `sslmode=require`; при платном плане — IP Allow с IP дроплета |
| Файлы | DO Spaces (S3-совместимое) или Vercel Blob (работает и вне Vercel по токену) — хранить вне контейнера |
| Расписание | system cron/контейнер с `curl -H "Authorization: Bearer $CRON_SECRET" https://.../api/cron/refresh-tokens` раз в сутки |
| Ресурсы | Текущие 2 ГБ RAM уже заняты n8n + backend + nginx; Next.js standalone ~150–300 МБ. Сборку образа на сервере с 2 ГБ выполнять нежелательно — собирать в GitHub Actions и пушить в registry (GHCR / DO Container Registry). Рекомендуемый минимум при сборке на сервере — 4 ГБ (Basic $24/мес) |
| Обновление | `docker compose pull web && docker compose up -d web`; откат — предыдущий тег образа |
| Бэкапы | БД — Neon (PITR по плану Neon); дроплет — DO Backups (20–30% стоимости дроплета) для `n8n_data` и `caddy_data` |
| Мониторинг | DO Monitoring (CPU/RAM/диск, алерты), внешний uptime-check `/api/health`, логи `docker logs` с ротацией (`max-size`) |

Цены DigitalOcean (проверено 2026-11-15, [Droplet Pricing](https://www.digitalocean.com/pricing/droplets)): Basic 2 ГБ/1 vCPU — $12/мес, 2 ГБ/2 vCPU — $18, 4 ГБ/2 vCPU — $24; посекундная тарификация с 2026-01-01. Тариф текущего дроплета — [Неизвестно].

---

## 9. Целевая архитектура Next.js + Neon + Drizzle

### 9.1. Принципы

- Один Next.js-проект заменяет `frontend/` + `backend/` + `nginx`. [Рекомендация, основано на 8.3: вся логика совместима с Route Handlers]
- n8n остаётся внешним сервисом на DigitalOcean; контракты HTTP с ним сохраняются 1:1 (`TASK_WEBHOOK_MAP`, `/api/internal/meta/actions`, `/api/webhooks/n8n/callback`). [Основано на `tasks.py:76-81`, `internal_meta.py`, `webhooks.py`]
- Без Redis, очередей и отдельных воркеров: в приложении нет фоновой работы, кроме суточного обновления токенов.
- Пути API сохраняются, где это снижает работу по перенастройке Meta/n8n (`/api/instagram/auth/callback`, `/api/internal/meta/actions`, `/api/webhooks/n8n/callback`).

### 9.2. Структура каталогов

```
app/
  layout.tsx                       <Script telegram-web-app.js strategy="beforeInteractive">
  page.tsx                         Dashboard            ← pages/Dashboard.tsx
  tasks/page.tsx                   ← pages/Tasks.tsx
  leads/page.tsx                   ← pages/Leads.tsx
  auto-reply-dm/page.tsx           ← pages/AutoReplyDM.tsx
  settings/page.tsx                ← pages/Settings.tsx
  privacy/page.tsx, terms/page.tsx ← pages/Privacy.tsx, Terms.tsx
  api/
    health/route.ts
    auth/telegram/route.ts         ← api/auth.py
    accounts/route.ts              GET            ← accounts.py:list_accounts
    accounts/[id]/route.ts         DELETE         ← unlink_account
    accounts/[id]/media/route.ts   GET            ← list_account_media
    instagram/meta/url/route.ts
    instagram/meta/start-page/route.ts
    instagram/auth/callback/route.ts
    instagram/status/route.ts      (без telegram_id в пути — берётся из сессии)
    instagram/refresh/route.ts
    instagram/facebook/{url,callback}/route.ts   (если поток сохраняется, см. 12.2)
    tasks/route.ts                 GET, POST
    tasks/[id]/route.ts            PATCH, DELETE
    tasks/[id]/toggle/route.ts, tasks/[id]/cancel/route.ts
    tasks/attachments/route.ts     выдача токена client upload
    analytics/dashboard/route.ts, analytics/leads/route.ts,
    analytics/leads/[id]/interactions/route.ts
    events/route.ts
    telegram/webhook/route.ts      ← telegram_webhook.py
    webhooks/n8n/callback/route.ts ← webhooks.py (с авторизацией)
    internal/meta/actions/route.ts ← internal_meta.py
    cron/refresh-tokens/route.ts   новое
components/                        ← frontend/src/components/*
lib/
  env.ts                           zod-валидация переменных
  db/client.ts                     drizzle + @neondatabase/serverless
  db/schema.ts                     схема (9.5)
  db/queries/{profiles,igAccounts,tasks,leads,events}.ts   доступ с обязательным ownerId
  auth/telegram.ts                 verifyInitData
  auth/session.ts                  sign/verify, requireSession()
  auth/service.ts                  requireN8nService(), requireCron()
  crypto/tokens.ts                 encrypt/decrypt AES-256-GCM
  meta/{instagramOAuth,graph,followers,facebookTokens}.ts
  telegram/botApi.ts               sendMessage, setWebhook
  n8n/dispatch.ts                  TASK_WEBHOOK_MAP
  tasks/payload.ts                 ← services/task_payload.py
  devices.ts                       ← services/login_devices.py, utils/deviceProfile.ts
drizzle/                           миграции
Dockerfile, docker-compose.yml     для DigitalOcean
vercel.json                        crons (или Vercel Schedules)
```

**Server Actions или Route Handlers.** Данные запрашиваются из клиентских компонентов с Bearer-сессией (Mini App), поэтому основной механизм — Route Handlers + SWR. Server Actions требуют cookie-сессии; при выборе cookie (см. 9.4) мутации задач можно перевести на Server Actions.

### 9.3. Авторизация через Telegram

1. Клиент читает `window.Telegram.WebApp.initData` и вызывает `POST /api/auth/telegram`.
2. `verifyInitData(initData, BOT_TOKEN)` — алгоритм `security.py:23-90`; TTL сократить до 1 ч (сейчас 24 ч).
3. upsert `customer_profiles` по `telegram_id`; upsert `user_login_devices`.
4. Выпуск сессии `{ sub: profileId, tg: telegramId, typ: 'session' }`, `exp` 12 ч, ключ `SESSION_SECRET`.
5. Обслуживание токенов Meta **не выполняется при входе** — перенесено в cron.

### 9.4. Механизм сессий

| Вариант | Плюсы | Минусы |
|---|---|---|
| A. Bearer в памяти/`sessionStorage` (как сейчас) **[Рекомендация]** | Работает в iframe Telegram Web и в WebView; нет CSRF | Нужен заголовок в каждом запросе; при перезапуске — повторный вход по initData (это уже так) |
| B. httpOnly cookie `SameSite=None; Secure; Partitioned` | Server Components/Actions видят сессию; токен недоступен JS | Поведение cookie третьей стороны в iframe Telegram Web зависит от браузера — требует проверки на всех клиентах |

### 9.5. Схема Drizzle (перенос 1:1, затем исправления из 5.6)

```ts
// lib/db/schema.ts — набросок по живой выгрузке information_schema (5.1).
// Длины varchar, enum, индексы, CHECK, столбцы всех таблиц подтверждены выгрузкой (5.1–5.2). Ниже — основные таблицы; enum объявлены выше.
export const contentTypeEnum = pgEnum('content_type_enum', ['REELS', 'STORY', 'ALL']);
export const mediaTypeEnum = pgEnum('media_type_enum', ['REELS', 'STORY', 'POST']);
export const interactionTypeEnum = pgEnum('interaction_type_enum', ['COMMENT', 'STORY_REPLY', 'DM', 'REELS_VIEW']);

export const customerProfiles = pgTable('customer_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  telegramId: varchar('telegram_id').notNull().unique(),
  email: varchar('email').unique(),
  phoneNumber: varchar('phone_number'),
  firstName: varchar('first_name'),
  lastName: varchar('last_name'),
  username: varchar('username'),
  photoUrl: text('photo_url'),
  languageCode: varchar('language_code'),
  subscriptionStatus: varchar('subscription_status').default('free'),
  subscriptionEndsAt: timestamp('subscription_ends_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  // legacy-дубли instagram_* — оставить до проверки n8n (см. 5.6)
  instagramPageId: varchar('instagram_page_id'),
  instagramAccessToken: text('instagram_access_token'),
  instagramId: text('instagram_id'),
  instagramUsername: text('instagram_username'),
  instagramConnected: boolean('instagram_connected').default(false),
  instagramConnectedAt: timestamp('instagram_connected_at'),   // without time zone, как в БД
});

export const igAccounts = pgTable('ig_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').references(() => customerProfiles.id),
  pageId: varchar('page_id').notNull().unique(),
  graphId: varchar('graph_id'),
  igbaId: varchar('igba_id'),
  username: varchar('username').notNull(),
  displayName: text('display_name'),
  profilePictureUrl: text('profile_picture_url'),
  followersCount: integer('followers_count').default(0),
  accessToken: text('access_token').notNull(),            // шифротекст после миграции
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
  isActive: boolean('is_active').default(true),
  mode: text('mode').default('development'),             // назначение неизвестно (5.1)
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  facebookAccessToken: text('facebook_access_token'),
  facebookUserId: text('facebook_user_id'),
  facebookTokenExpiresAt: timestamp('facebook_token_expires_at', { withTimezone: true }),
  facebookDataAccessExpiresAt: timestamp('facebook_data_access_expires_at', { withTimezone: true }),
  facebookTokenScopes: jsonb('facebook_token_scopes').notNull().default([]),
  facebookTokenIsValid: boolean('facebook_token_is_valid').notNull().default(false),
  facebookTokenRefreshRequired: boolean('facebook_token_refresh_required').notNull().default(false),
  facebookTokenLastCheckedAt: timestamp('facebook_token_last_checked_at', { withTimezone: true }),
  facebookTokenError: text('facebook_token_error'),
}, (t) => [unique().on(t.ownerId, t.pageId),            // есть в БД, избыточен (5.1)
           index('idx_ig_accounts_owner').on(t.ownerId), index('idx_ig_accounts_graph_id').on(t.graphId),
           ]);  // idx_ig_accounts_igba_id из репозитория в БД отсутствует

export const automationTasks = pgTable('automation_tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').references(() => customerProfiles.id),
  igAccountId: varchar('ig_account_id'),                   // в БД varchar без FK → uuid + FK отдельной миграцией
  taskType: varchar('task_type').notNull(),
  status: varchar('status').default('pending'),
  payload: jsonb('payload').default({}),
  result: jsonb('result'),
  errorMessage: text('error_message'),
  scheduleAt: timestamp('schedule_at', { withTimezone: true }),
  commentOnPost: boolean('comment_on_post').notNull().default(true),
  exactMatch: boolean('exact_match').notNull().default(true),
  allContentTypes: boolean('all_content_types').notNull().default(true),
  selectedMediaIds: jsonb('selected_media_ids').notNull().default([]),
  checkSubscription: boolean('check_subscription').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().$onUpdate(() => new Date()),
}, (t) => [index('idx_tasks_owner_status').on(t.ownerId, t.status), index('idx_tasks_created').on(t.createdAt)]);

export const automationFunnels = pgTable('automation_funnels', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').references(() => customerProfiles.id),
  igAccountId: uuid('ig_account_id').references(() => igAccounts.id),
  triggerKeywords: jsonb('trigger_keywords').notNull().default([]),
  contentType: contentTypeEnum('content_type').default('ALL'),   // REELS, STORY, ALL
  replyText: text('reply_text').notNull(),
  mediaLink: text('media_link'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const content = pgTable('content', {
  id: uuid('id').primaryKey().defaultRandom(),
  mediaId: varchar('media_id').notNull().unique(),
  mediaType: mediaTypeEnum('media_type').notNull(),              // REELS, STORY, POST
  caption: text('caption'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  viewsCount: integer('views_count').default(0),
  likesCount: integer('likes_count').default(0),
  commentsCount: integer('comments_count').default(0),
  sharesCount: integer('shares_count').default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  ownerId: uuid('owner_id').references(() => customerProfiles.id),
});

export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => customerProfiles.id),
  telegramId: bigint('telegram_id', { mode: 'number' }),
  eventName: text('event_name').notNull(),
  properties: jsonb('properties').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const aiAnalyticsSnapshots = pgTable('ai_analytics_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').references(() => customerProfiles.id),
  snapshotDate: date('snapshot_date').defaultNow(),
  totalNewLeads: integer('total_new_leads').default(0),
  conversionRate: numeric('conversion_rate').default('0.00'),
  aiInsights: text('ai_insights'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  instagramId: varchar('instagram_id', { length: 255 }).notNull(),
  username: varchar('username', { length: 100 }).notNull(),
  fullName: varchar('full_name', { length: 255 }),
  isFollower: boolean('is_follower').default(false),
  leadStatus: varchar('lead_status', { length: 50 }).default('COLD'),   // в БД DEFAULT 'Холодный', фактически везде COLD
  lastInteractionAt: timestamp('last_interaction_at', { withTimezone: true }).defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  ownerId: varchar('owner_id', { length: 255 }).references(() => igAccounts.pageId, { onDelete: 'set null' }), // page_id, не uuid
  pageId: varchar('page_id', { length: 255 }).references(() => igAccounts.pageId, { onDelete: 'set null' }),
}, (t) => [
  index('idx_users_owner_lead').on(t.ownerId, t.leadStatus),
  index('idx_users_page_id').on(t.pageId),
  uniqueIndex('users_owner_instagram_id_key').on(t.ownerId, t.instagramId).where(sql`${t.ownerId} IS NOT NULL`),
  uniqueIndex('users_page_instagram_id_key').on(t.pageId, t.instagramId).where(sql`${t.pageId} IS NOT NULL AND ${t.instagramId} IS NOT NULL`),
]);

export const interactions = pgTable('interactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  contentId: uuid('content_id').references(() => content.id, { onDelete: 'set null' }),
  interactionType: interactionTypeEnum('interaction_type').notNull(),   // COMMENT, STORY_REPLY, DM, REELS_VIEW
  textContent: text('text_content'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  fromId: varchar('from_id', { length: 255 }),
  fromUsername: varchar('from_username', { length: 100 }),
  mediaId: varchar('media_id', { length: 255 }),
  mediaProductType: varchar('media_product_type', { length: 50 }),
  eventField: varchar('event_field', { length: 50 }),
  eventTime: bigint('event_time', { mode: 'number' }),
  pageId: varchar('page_id', { length: 255 }).references(() => igAccounts.pageId, { onDelete: 'set null' }),
  eventObject: varchar('event_object', { length: 50 }),
  commentId: varchar('comment_id', { length: 255 }),
  statusResponse: boolean('status_response').default(false),
  tasksId: uuid('tasks_id'),                                            // FK нет; добавить отдельной миграцией (5.6)
  textAnswer: text('text_answer'),
  responseAt: timestamp('response_at', { withTimezone: true }),
  errorPrivatyCommentAt: timestamp('error_privaty_comment_at', { withTimezone: true }),
  textErrPrivatyComment: text('text_err_privaty_comment'),
  textAnswerMessageError: text('text_answer_message_error'),
  timeAnswerMessageErrorAt: timestamp('time_answer_message _error_at', { withTimezone: true }), // пробел в имени столбца
}, (t) => [
  uniqueIndex('idx_interactions_comment_id').on(t.commentId).where(sql`${t.commentId} IS NOT NULL`),
  index('idx_interactions_from_id').on(t.fromId),
  index('idx_interactions_media_id').on(t.mediaId),
  index('idx_interactions_page_id').on(t.pageId),
  index('idx_interactions_user').on(t.userId, t.createdAt.desc()),
]);

export const userLoginDevices = pgTable('user_login_devices', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull().references(() => customerProfiles.id, { onDelete: 'cascade' }),
  telegramId: varchar('telegram_id', { length: 100 }).notNull(),
  deviceKind: varchar('device_kind', { length: 20 }).notNull(),         // CHECK: phone | tablet | computer
  osType: varchar('os_type', { length: 20 }).notNull(),                 // CHECK: ios | android | windows | macos | linux | unknown
  telegramPlatform: varchar('telegram_platform', { length: 40 }).notNull().default('unknown'),
  loginCount: integer('login_count').notNull().default(1),
  firstLoginAt: timestamp('first_login_at', { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('user_login_devices_owner_device_os_key').on(t.ownerId, t.deviceKind, t.osType),
  index('idx_user_login_devices_owner').on(t.ownerId, t.lastLoginAt.desc()),
  index('idx_user_login_devices_telegram').on(t.telegramId),
]);
```

### 9.6. Доступ к данным и проверка прав

- Драйвер: `@neondatabase/serverless` (HTTP) на Vercel; на DigitalOcean подходит тот же драйвер или `pg` с pooled-строкой.
- Каждая функция в `lib/db/queries` принимает `ownerId` из `requireSession()`; Route Handler не формирует запросы самостоятельно.
- Лиды: `getOwnedPageIds(ownerId)` → `users.owner_id IN (…)` → `interactions` только для лида из этого набора (как `analytics.py:157-197`).
- Сервисные маршруты (`internal/meta/actions`, `webhooks/n8n/callback`) — `requireN8nService()`; callback дополнительно проверяет существование задачи.

### 9.7. Instagram и токены

- Потоки из 4.1 переносятся; state — подписан��ый токен `typ: 'ig_oauth'` + одноразовый nonce, хранящийся в cookie на домене приложения или в таблице `oauth_states` (новая, маленькая).
- Токены шифруются перед записью (`lib/crypto/tokens.ts`), расшифровываются только в `lib/meta/*`.
- Cron `GET /api/cron/refresh-tokens` (раз в сутки): для `ig_accounts` с `token_expires_at < now()+10 дней` → `GET https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=…`; обновить `access_token`, `token_expires_at`; ошибки → флаг для UI. Сюда же перенести `maintain_owner_facebook_tokens`, если Facebook-поток сохраняется.
- При отключении аккаунта — затирать `access_token`/`facebook_access_token`. (Ограничение схемы: `access_token NOT NULL` → хранить пустую строку или снять NOT NULL миграцией.)

### 9.8. Хранение секретов

Переменные нового проекта: `DATABASE_URL`, `BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_BOT_USERNAME`, `SESSION_SECRET`, `OAUTH_STATE_SECRET`, `TOKEN_ENCRYPTION_KEY`, `META_APP_ID`, `META_APP_SECRET`, `META_INSTAGRAM_APP_ID`, `META_INSTAGRAM_APP_SECRET`, `META_REDIRECT_URI`, `META_FACEBOOK_CONFIG_ID`, `META_FACEBOOK_REDIRECT_URI`, `META_API_VERSION`, `META_DEVELOPMENT_MODE`, `N8N_BASE_URL`, `N8N_API_KEY`, `N8N_SERVICE_TOKEN`, `CRON_SECRET`, `APP_URL`, `BLOB_READ_WRITE_TOKEN` (или `S3_*` для Spaces). Валидация при старте через `lib/env.ts`.

### 9.9. Взаимодействие с ботом и n8n

- Бот: `POST /api/telegram/webhook` (проверка `secret_token`) → ответы на `/start`, `/start ig_auth`; URL WebApp берётся из `APP_URL`, а не захардкожен.
- Уведомления о задачах: из callback n8n через `lib/telegram/botApi.ts`.
- n8n → приложение: публичный HTTPS вместо `http://backend:8000`; при размещении Next.js на том же дроплете — внутренний адрес `http://web:3000`.
- n8n → БД: отдельный n8n подключается к Supabase напрямую и самостоятельно читает/записывает данные (по сведениям владельца; интеграции приложения с n8n для доступа к БД нет). При переключении нужно отдельно перенастроить прямое подключение и узлы n8n на Neon; иначе процессы продолжат работать со старой БД. Точные workflows в аудите не проверялись.

### 9.10. Развёртывание на Vercel

Проект из нового GitHub-репозитория; Neon через интеграцию Marketplace; регион функций = регион Neon; Cron в `vercel.json`; production-домен `almarathon.com`; переменные — раздельно для Production и Preview (Preview: тестовый бот, Meta dev-режим, ветка Neon).

### 9.11. Развёртывание на DigitalOcean (Docker Compose)

```yaml
# набросок для нового репозитория — НЕ для старого проекта
services:
  web:
    image: ghcr.io/<org>/<repo>:<tag>
    restart: unless-stopped
    env_file: .env
    expose: ["3000"]
    healthcheck: { test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"], interval: 30s }
    deploy: { resources: { limits: { memory: 512M } } }
    logging: { driver: json-file, options: { max-size: "10m", max-file: "3" } }
    networks: [caddy]
networks:
  caddy: { external: true, name: instagram-bot-app_app-network }
```
Caddy: `almarathon.com { reverse_proxy web:3000 }`. Суточный cron на хосте вызывает `/api/cron/refresh-tokens`.

### 9.12. Гибридная архитектура

**[Вывод]** Гибрид уже существует де-факто: n8n работает на дроплете независимо от приложения. Поэтому «Vercel + n8n на DigitalOcean» не добавляет новых сервисов — это перенос только приложения. Перенос самого n8n в задачи миграции не входит.

### 9.13. Сравнение платформ (проверено 2026-11-15)

| Критерий | Vercel | DigitalOcean (Droplet + Docker) |
|---|---|---|
| Тип развёртывания | Управляемая serverless-платформа (Fluid compute) | IaaS, самостоятельное администрирование |
| Запуск Next.js | Нативно, без настройки | `output: 'standalone'` в Docker |
| Docker | Не нужен для Next.js | Основной способ |
| Длительные процессы | Нет (функция ≤ 300 с Hobby / 800 с Pro) | Да |
| Фоновые задачи | Cron Jobs (Hobby — 1 раз в сутки), Workflows/Queues | system cron, любые процессы |
| Neon | Интеграция Marketplace, ветки на Preview | Вручную через `DATABASE_URL` |
| Instagram API | Исходящие HTTPS без ограничений; лимит тела 4,5 МБ | Без ограничений |
| Telegram Mini App | HTTPS-домен автоматически | HTTPS через Caddy (есть) |
| Домены и HTTPS | Автоматически | Caddy, автоматические сертификаты |
| Масштабирование | Автоматическое | Вертикальное, вручную |
| Мониторинг и логи | Встроенные; хранение Hobby 1 ч / Pro 1 день | DO Monitoring + свои средства |
| Управление сервером | Не требуется | Обновления ОС, Docker, безопасность — на владельце |
| Стоимость | Hobby $0 (некоммерческое использование), Pro $20/мес/место + потребление | Дроплет $12–24/мес (+ бэкапы 20–30%) |
| Ограничения | Тело 4,5 МБ, эфемерная ФС, нет общей памяти между инстансами, Preview-URL непостоянны для OAuth | RAM текущего дроплета (2 ГБ) занята; единая точка отказа; ручной деплой |

### 9.14. Рекомендация по размещению

- **Основной вариант — Vercel (Pro) для Next.js + Neon + существующий дроплет только для n8n/Caddy.** Обоснование: вся логика укладывается в лимиты функций (8.3), снимается ручной деплой и сборка на сервере с 2 ГБ RAM (8.1), освобождаются ресурсы дроплета для n8n, Preview-ветки Neon позволяют безопасно тестировать миграции. Hobby не подходит для коммерческого сервиса по условиям Vercel.
- **Альтернатива — всё на DigitalOcean**: Next.js в Docker рядом с n8n за существующим Caddy, Neon как БД. Дешевле при росте трафика, сохраняет внутреннюю сеть с n8n (`http://web:3000`), но требует CI для сборки образов и увеличения дроплета до 4 ГБ.
- **Гибрид** (основной вариант по сути гибридный) обоснован тем, что n8n — существующий долгоживущий сервис, а не новой потребностью.

---

## 10. Таблица соответствия старых и новых модулей

| Старый проект | Назначение | Новый модуль Next.js | Способ переноса | Примечания |
|---|---|---|---|---|
| `frontend/src/main.tsx`, `index.html` | ��онтирование, SDK Telegram, mock | `app/layout.tsx` | Переписать | Mock — только при `NODE_ENV=development` |
| `frontend/src/App.tsx` | Маршруты, логин, start_param | App Router + `components/auth-gate.tsx` | Переписать | Публичные `/privacy`, `/terms` без авторизации |
| `pages/Dashboard.tsx` | Сводка | `app/page.tsx` | Перенос компонента | axios → SWR |
| `pages/Tasks.tsx` | Задачи | `app/tasks/page.tsx` | Перенос | Realtime → SWR `refreshInterval` |
| `pages/AutoReplyDM.tsx` + компоненты | Автоответы | `app/auto-reply-dm/page.tsx`, `components/*` | Перенос | Загрузка — client upload |
| `pages/Leads.tsx` | Лиды | `app/leads/page.tsx` | Перенос | |
| `pages/Settings.tsx` | Подключение Instagram | `app/settings/page.tsx` | Перенос | `telegram_id` в путях больше не нужен |
| `pages/Landing.tsx`, `Privacy.tsx`, `Terms.tsx` | Публичные страницы | `app/(public)/…` | Перенос; можно SSG | |
| `store/authStore.ts`, `utils/api.ts` | Сессия, HTTP | `lib/client/session.ts`, `lib/client/fetcher.ts` | Переписать | Убрать логирование токена |
| `utils/supabase.ts` | Realtime | — | **Нет аналога** (удаляется) | |
| `utils/deviceProfile.ts`, `openExternalUrl.ts`, `telegramMiniApp.ts`, `instagramConnectCooldown.ts` + тесты | Утилиты | `lib/client/*` | Копирование + Vitest | Тесты переносятся |
| `hooks/useTelegram.ts`, `useInstagram.ts`, `useTrack.ts` | Хуки | `hooks/*` | Перенос | |
| `backend/app/main.py` | Приложение, CORS, rate limit | `next.config`, Vercel Firewall | Конфигурация | CORS не нужен (тот же origin) |
| `core/config.py` | Настройки | `lib/env.ts` | Переписать на zod | |
| `core/security.py` | initData, JWT, сервисный токен | `lib/auth/*` | Переписать на TS | Добавить `typ`, раздельные ключи |
| `core/supabase.py` | Клиент БД | `lib/db/client.ts` | Замена на Drizzle | |
| `core/cache.py`, `core/rate_limit.py` | Кэш, лимит | — / Vercel Firewall / Caddy | **Нет прямого аналога** | Кэш фактически не используется |
| `api/auth.py` | Вход | `app/api/auth/telegram/route.ts` | Переписать | Без вызовов Meta при входе |
| `api/accounts.py` | Аккаунты, медиа | `app/api/accounts/**` | Переписать | `POST /api/accounts/` не переносить (не используется, небезопасен) |
| `api/meta_oauth.py` + `services/instagram_oauth.py` | OAuth Instagram/Facebook | `app/api/instagram/**`, `lib/meta/instagramOAuth.ts` | Переписать | `register` не переносить |
| `api/tasks.py` + `services/task_payload.py` | Задачи, вложения, n8n | `app/api/tasks/**`, `lib/n8n/dispatch.ts`, `lib/tasks/payload.ts` | Переписать | Контракт n8n без изменений |
| `api/funnels.py` | Legacy-автоответы | — | **Не переносить** маршруты; таблицу — перенести | Проверить использование n8n |
| `api/analytics.py` | Дашборд, лиды | `app/api/analytics/**`, `lib/db/queries/leads.ts` | Переписать | |
| `api/events.py` | Трекинг | `app/api/events/route.ts` | Переписать | |
| `api/internal_meta.py` + `services/instagram_followers.py` | Брокер для n8n | `app/api/internal/meta/actions/route.ts`, `lib/meta/followers.ts` | Переписать | Путь сохраняется |
| `api/webhooks.py` (n8n callback) | Статусы задач | `app/api/webhooks/n8n/callback/route.ts` | Переписать + авторизация | n8n начнёт передавать Bearer |
| `api/webhooks.py` (Meta) | Проксирование в n8n | — | **Не переносить** (по условиям задания webhooks не используются) | Если окажется нужным — с проверкой подписи |
| `api/telegram_webhook.py` | Бот | `app/api/telegram/webhook/route.ts`, `lib/telegram/botApi.ts` | Переписать | `secret_token` |
| `services/instagram_profile.py` | Обновление профиля | `lib/meta/graph.ts` | Переписать | |
| `services/facebook_tokens.py` | EAAV | `lib/meta/facebookTokens.ts` + cron | Переписать (если поток нужен) | См. 12.2 |
| `services/instagram_ids.py` | Разбор webhook | — | **Не переносить** (вызывается только тестами) | Логика может пригодиться n8n |
| `services/login_devices.py` + RPC | Устройства | `lib/devices.ts` | Переписать на upsert | |
| `backend/tests/*` | Спецификация | `tests/*.test.ts` (Vitest) | Перенести сценарии | |
| `docs/supabase_migrations.sql`, `backend/migrations/*` | Схема | `drizzle/` | Схема из раздела 9.5 (подтверждена живой БД); при необходимости `drizzle-kit introspect` | |
| Supabase Storage `automation-attachments` | Вложения | Vercel Blob / DO Spaces | **Не требуется:** запросы C1–C5 подтвердили отсутствие бакетов, объектов и ссылок в `payload` (5.5) | Новые вложения загружаются сразу в новое хранилище |
| Supabase Realtime | Обновление списка задач | SWR | **Нет прямого аналога** | |
| Supabase Auth | — | — | Не использовался | |
| `docker-compose.yml`, `backend/Dockerfile`, `nginx/` | Инфраструктура | `Dockerfile`, `docker-compose.yml` (новые) или Vercel | Новая конфигурация | nginx не нужен |
| `n8n/` | Workflows (часть) | вне нового проекта | Без изменений; перенастроить URL и учётные данные БД | |
| Фоновые задачи | **Отсутствуют** в приложении | `app/api/cron/refresh-tokens` | Новое | Единственная плановая задача |

---

## 11. Пошаговый план миграции

Каждый этап: **Цель / Задачи / Зависит от / Результат / Готово, когда**.

**Этап 0. Подготовка (до кода)**
- Цель: устранить блокирующие риски и неизвестные.
- Задачи: ротировать секреты (К1); выгрузить `pg_dump` данных Supabase (структура уже описана); экспортировать workflows n8n и выяснить, какие таблицы они читают/пишут через своё прямое подключение к Supabase; уточнить регион Supabase и дроплета; решить судьбу Facebook-потока и `automation_funnels`.
- Результат: `schema.sql`, список таблиц n8n, решения 12.2.
- Готово, когда: все пункты раздела 12.1 закрыты или приняты как риск.

**1. Создание GitHub-репозитория** — Цель: отдельный репозиторий. Задачи: приватный репозиторий, защита `main`, secret scanning, gitleaks в pre-commit/CI. Зависит от: 0. Готово: репозиторий с CI-заготовкой.

**2. Инициализация Next.js** — Задачи: Next.js (App Router), Tailwind 4, ESLint, `output: 'standalone'`. Зависит от: 1. Готово: пустое приложение собирается локально и в CI.

**3. TypeScript** — Задачи: `strict: true`, alias `@/*`, `lib/env.ts` (zod) со всеми переменными 9.8. Зависит от: 2. Готово: сборка падает при отсутствии обязательной переменной.

**4. Подключение Neon** — Задачи: проект Neon в регионе, выбранном в 0; ветки `main` и `dev`; pooled-строка. Зависит от: 0, 3. Готово: `SELECT 1` из Route Handler `/api/health`.

**5. Drizzle ORM** — Задачи: `drizzle.config.ts`, `lib/db/client.ts`, скрипты `db:generate`, `db:migrate`. Зависит от: 4. Готово: миграции применяются к ветке `dev`.

**6. Схема БД** — Задачи: восстановить дамп Supabase в ветку Neon → `drizzle-kit introspect` → сверка с разделом 5 → базовая миграция 1:1. Исправления (5.6) — отдельной миграцией после переноса данных. Зависит от: 0, 5. Готово: схема Neon совпадает с живой Supabase (diff пуст).

**7. Перенос данных** — Задачи: `pg_dump --data-only --schema=public` → загрузка в ветку Neon; проверка количества строк и FK; скрипт шифрования токенов; копирование Storage не требуется (5.5: бакетов, объектов и ссылок нет). Повторить финальный перенос в окне переключения (этап 19). Зависит от: 6. Готово: число строк совпадает по каждой таблице, выборочная проверка связей `ig_accounts → users → interactions`.

**8. Telegram-авторизация** — Задачи: `verifyInitData`, `POST /api/auth/telegram`, сессия, `requireSession`, upsert устройств; webhook бота с `secret_token`; тесты по `backend/tests/conftest.py`-сценариям. Зависит от: 6. Готово: вход из тестового бота возвращает сессию, подделанный initData → 401.

**9. Instagram-интеграция** — Задачи: OAuth (url, start-page, callback), шифрование токенов, статус/refresh, медиа, отключение с затиранием токена, cron обновления IGAA; Redirect URI в Meta для staging-домена. Зависит от: 8. Готово: подключение тестового аккаунта в Telegram (Android, iOS, Desktop), токен в БД зашифрован, cron обновляет токен в dev.

**10. Бизнес-логика backend** — Задачи: задачи (CRUD, toggle, cancel, нормализация `trigger_keywords`), диспетчеризация n8n, брокер `check_follower`, callback n8n с авторизацией и уведомлениями, лиды/дашборд, события. Зависит от: 8, 9. Готово: тесты, перенесённые из `backend/tests/test_*.py`, проходят; n8n (staging) успешно вызывает брокер и callback.

**11. Интерфейс** — Задачи: перенос страниц и компонентов (раздел 10), SWR вместо axios/Realtime, client upload вложений, удаление mock и логов. Зависит от: 10. Готово: все экраны работают в Telegram на трёх платформах.

**12. Проверка API и прав доступа** — Задачи: для каждого маршрута тест «чужой ресурс → 404/403»; запросы без сессии → 401; сервисные маршруты без токена → 401; OAuth-state не принимается как сессия. Зависит от: 10. Готово: матрица доступа (маршрут × роль) зелёная.

**13. Тестирование** — Задачи: Vitest (юнит), сценарии API, ручной регресс по чек-листу Mini App; нагрузочная проверка входа. Зависит от: 11, 12. Готово: CI зелёный, чек-лист пройден.

**14. Подготовка Vercel** — Задачи: проект, привязка репозитория, регион функций, Neon-интеграция, переменные Production/Preview, Cron, правила Firewall (rate limit на `/api/auth/*`, `/api/webhooks/*`). Зависит от: 13. Готово: Preview-деплой проходит smoke-тесты.

**15. Развёртывание на Vercel (staging-домен)** — Задачи: staging-домен (например `app-staging.<домен>`), Redirect URI Meta для него, тестовый бот с WebApp на staging. Зависит от: 14. Готово: полный сценарий (вход → подключение Instagram → задача → callback n8n → уведомление) на staging.

**16. Docker-конфигурация** — Задачи: Dockerfile (standalone), `docker-compose.yml` (9.11), сборка в GitHub Actions → GHCR. Зависит от: 13. Готово: образ запускается локально с `.env`, `/api/health` = 200.

**17. Развёртывание на DigitalOcean (staging)** — Задачи: сервис `web` в сети Caddy без публикации порта, Caddy-маршрут на staging-поддомен, host-cron для обновления токенов. Зависит от: 16. Готово: тот же сценарий, что в 15, на дроплете; потребление RAM измерено.

**18. Домены, HTTPS, переменные выбранной платформы** — Задачи: финальные Redirect URI в Meta для production-домена; URL WebApp в BotFather/кнопках; `setWebhook` с `secret_token`; переменные Production. Зависит от: 15 или 17. Готово: конфигурация задокументирована, проверена на staging.

**19. Готовность к запуску и переключение** — Задачи: окно обслуживания; остановка записи в старый backend (без изменения старого кода — переключением DNS/маршрута Caddy); финальный перенос данных (этап 7); перенастройка n8n (URL приложения, учётные данные Neon, Bearer для callback); переключение DNS/Caddy; мониторинг 48 ��; план отката — вернуть DNS/маршрут на старый стек (он остаётся нетронутым, данные, записанные после переключения, переносятся обратно вручную). Зависит от: 18. Готово: production работает, ошибок 5xx нет, cron отработал, старый стек остаётся доступным для отката.

### 11.1. Проверка совместимости на обеих платформах

| Проверка | Vercel | DigitalOcean |
|---|---|---|
| Вход по initData (Android, iOS, Desktop, Telegram Web) | ✓ | ✓ |
| Сессия в iframe Telegram Web | ✓ | ✓ |
| OAuth Instagram: старт в WebView → браузер/приложение → возврат в бота | ✓ (стабильный домен) | ✓ |
| Загрузка вложения 9 МБ | ✓ client upload (ожидаемо: прямой POST > 4,5 МБ → 413) | ✓ |
| n8n → брокер / callback с Bearer | ✓ публичный URL | ✓ внутренний и публичный URL |
| Cron обновления токенов | ✓ Vercel Cron | ✓ host-cron |
| Холодный старт входа (p95) | замер | замер |
| Задержка до Neon (p95 запроса) | замер, регион функций | замер, регион дроплета |
| RAM/CPU под нагрузкой | — | замер `docker stats` |

---

## 12. Риски, неизвестные детали и технические рекомендации

### 12.1. Неизвестно (проверить до этапа 6)

| # | Что | Почему важно | Как проверить |
|---|---|---|---|
| Н1 | Закрыто 2026-11-16: схема, данные, Storage и безопасность Supabase подтверждены (5.0, 5.8) | — | Остаётся Н2 (n8n) |
| Н1а | Назначение объектов БД, которых нет в коде: таблица `content`, `automation_funnels.content_type/media_link`, `customer_profiles.email/phone_number/subscription_ends_at`, `ig_accounts.mode` | Могут использоваться n8n или планироваться; нельзя удалять при переносе | Экспорт workflows n8n (Н2), вопрос владельцу |
| Н2 | Какие таблицы читает/пишет n8n и какими учётными данными | `users`, `interactions`, `ai_analytics_snapshots` пишутся вне репозитория; переключение БД сломает n8n | Экспорт workflows с сервера (`n8n_data`) |
| Н3 | Зарегистрирован ли `/api/webhooks/meta` в Meta App, куда указывает подписка | Противоречит исходным сведениям | Meta App Dashboard → Webhooks |
| Н4 | Ротированы ли ключи из истории Git | Критический риск К1 | Supabase Dashboard → API Keys; BotFather `/revoke` |
| Н5 | Регион Supabase и дроплета | Выбор региона Neon/Vercel | Supabase Settings; DO Dashboard |
| Н6 | Рост нагрузки. Текущий объём известен: 13 МБ вся БД (public около 1,2 МБ), до 51 строки в таблице, 7 профилей, 3 Instagram-аккаунта, 7 устройств; сервис в тестовой эксплуатации (5.8) | Темп роста и пик вебхуков Meta после выхода из dev-режима | Метрики Meta и n8n после запуска |
| Н7 | Закрыт ли порт 8000 фаерволом | С7 | DO Cloud Firewall / `ufw status` |
| Н8 | Работает ли Realtime-подписка фронтенда | В публикации только `automation_tasks`, политика только `TO authenticated`, фронтенд подключается как `anon` — события, вероятно, не доставляются (5.4) | Проверить в браузере обновление списка задач без перезагрузки |
| Н9 | Используется ли Facebook-поток (EAAV) в production | Объём переноса | Доля `ig_accounts` с непустым `facebook_access_token` (агрегат без значений) |
| Н10 | Используется ли `automation_funnels` n8n | Объём переноса | Workflows n8n |
| Н11 | Содержимое `docker compose setting.doc`, `docs/docker-compose.doc` (бинарные Word) | Возможны детали инфраструктуры или секреты | Открыть вручную |
| Н12 | Caddyfile | Маршруты, заголовки | Сервер `/home/almat/n8n-docker-caddy` |

### 12.2. Решения, которые нужно принять владельцу

1. Сохранять ли Facebook Login (EAAV) — сейчас используется только как резерв для `check_follower`.
2. Публичные или приватные вложения (Meta для отправки файла в DM требует доступный URL).
3. Платформа: основной вариант 9.14 или всё на DigitalOcean.
4. Тариф Vercel: Pro (коммерческое использование).

### 12.3. Риски миграции

| Риск | Вероятность | Влияние | Снижение |
|---|---|---|---|
| Поломка n8n после смены БД/URL | Высокая | Высокое | Н2 до начала; переключение n8n в том же окне; staging-копия workflow |
| Потеря доступа к Instagram из-за истёкших токенов | Средняя | Высокое | Cron обновления до запуска; UI-уведомление о переподключении |
| Новый Redirect URI не добавлен в Meta | Средняя | Высокое | Чек-лист этапа 18 |
| OAuth не работает в WebView Telegram на новом домене | Средняя | Среднее | Сохранить стартовую страницу; тест на трёх платформах |
| Расхождение схемы | Средняя | Высокое | Схема из 9.5 (подтверждена БД), сверка числа строк после переноса |
| Вложения > 4,5 МБ на Vercel | Высокая (лимит 10 МБ в UI) | Среднее | Client upload |
| Cookie-сессия в iframe Telegram Web | Средняя | Среднее | Bearer-сессия (9.4, вариант A) |
| Нехватка RAM дроплета (вариант DO) | Высокая | Среднее | Сборка в CI, дроплет 4 ГБ |
| Утечка секретов в новом репозитории | Низкая | Высокое | Secret scanning, gitleaks |

### 12.4. Технические рекомендации (сводно)

1. Ротация секретов — до любых работ.
2. Шифрование и затирание токенов; суточное обновление IGAA.
3. Разделённые ключи и типы для сессии и OAuth-state, одноразовый state.
4. Авторизация всех входящих webhook (Telegram, n8n; Meta — если понадобится).
5. Обслуживание токенов Meta — из входа в cron.
6. Схема: FK `ig_account_id`, NOT NULL `owner_id`, CHECK на статусы — после переноса 1:1.
7. Не переносить мёртвый код: `api/funnels.py` (маршруты), `POST /api/accounts/`, `/api/instagram/register`, `services/instagram_ids.py`, Meta webhook, `python-telegram-bot`, Realtime.
8. Тесты из `backend/tests` — как спецификация поведения для Vitest.
9. Документировать регистрацию webhook бота и URL WebApp в коде, а не вручную.
10. Мониторинг: uptime `/api/health`, алерты на 5xx и ошибки cron.

---

### Приложение. Что проверено и как

| Область | Метод |
|---|---|
| Код backend (10 роутеров, 7 сервисов, 5 core-модулей) | Полное чтение |
| Код frontend | Чтение `main.tsx`, `App.tsx`, `store`, `utils`, `hooks`, ключевых участков страниц; поиск всех вызовов API и Supabase |
| SQL | Все 13 файлов |
| Инфраструктура | `docker-compose.yml`, Dockerfile ×2, `nginx/*.conf`, `docs/SERVER_ARCHITECTURE.md`, `docs/droplet_state.md`, `SERVER_HANDOFF.md` |
| Зависимости | `requirements.txt`, `package.json`, `frontend/package-lock.json`; поиск фактических импортов |
| Секреты | Поиск по шаблонам в рабочем дереве и в истории Git (вывод — только коммит, файл и тип) |
| Supabase | Read-only SQL-выгрузки метаданных от владельца (2026-11-16, `sql.txt`, `sql 2.txt`) и список таблиц через коннектор: столбцы, ограничения, индексы, enum, функции с телами, триггеры, RLS, права, Storage, Realtime, размеры (5.0–5.5) |
| Документация пла��форм | Vercel Functions Limits, Cron Jobs, Pricing; Neon ↔ Vercel; DigitalOcean Droplet Pricing — 2026-11-15 |
| Состояние репозитория после аудита | `git status` — без изменений; `MIGRATION.md` — единственный новый файл |
