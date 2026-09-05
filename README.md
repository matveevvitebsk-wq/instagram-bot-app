# MediaHave — Telegram Mini App для Instagram

> 2026-09-01 cursor document Instagram auto-reply wizard and profile preview
>
> 2026-09-05 cursor require Instagram app login and business account before OAuth
>
> 2026-09-05 cursor detect phone, tablet and computer OS before opening Instagram
>
> 2026-09-05 cursor store device and OS types on each user login
>
> 2026-09-05 cursor revert Instagram launch button and keep login device logging

MediaHave — Telegram Mini App для подключения профессионального Instagram-
аккаунта и автоматизации задач, лидов и воронок.

Актуальное состояние: 2026-09-05.

Подробная инструкция по сопровождению, серверу, Supabase и диагностике:
[`SERVER_HANDOFF.md`](SERVER_HANDOFF.md).

## Возможности

- авторизация пользователя через Telegram WebApp `initData`;
- JWT-сессия для защищённых backend API;
- Instagram API with Instagram Login;
- подключение Instagram Business или Creator аккаунта;
- хранение Instagram-профиля и long-lived token в Supabase;
- задачи автоматизации;
- воронки;
- аналитика Dashboard;
- блокировка разделов до подключения Instagram;
- автоматическое обновление интерфейса после OAuth;
- при входе записывает тип устройства и ОС в `user_login_devices`;
- четырёхшаговый мастер автоответов с сообщениями Direct, ответами на
  комментарии, напоминаниями и предпросмотром Instagram;
- актуализация имени, логина и URL аватара подключённого Instagram-аккаунта;
- отключение Instagram от MediaHave.

Страница «Лиды» пока является заготовкой. Часть n8n-интеграций и миграций
требует дополнительной проверки.

## Технологии

Frontend:

- React 18;
- TypeScript;
- Vite;
- Tailwind CSS;
- Zustand;
- Axios;
- Telegram WebApp API;
- Supabase Realtime для задач.

Backend:

- Python 3.13;
- FastAPI;
- Uvicorn;
- HTTPX;
- Supabase Python client;
- python-jose.

Infrastructure:

- Docker Compose;
- nginx;
- Caddy;
- n8n;
- Supabase PostgreSQL.

## Структура проекта

```text
instagram-bot-app/
├── backend/
│   ├── app/
│   │   ├── api/             # API routers
│   │   ├── core/            # config, auth, Supabase, cache
│   │   └── main.py
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── pages/
│   │   ├── store/
│   │   └── utils/
│   ├── package.json
│   └── vite.config.ts
├── nginx/
│   └── nginx.conf
├── docs/
│   ├── supabase_migrations.sql
│   ├── SERVER_ARCHITECTURE.md
│   └── PROJECT_AUDIT_2026-07-29.md
├── docker-compose.yml
├── SERVER_HANDOFF.md
└── README.md
```

## Архитектура production

Используются два независимых Compose-проекта.

MediaHave:

```text
/opt/instagram-bot/instagram-bot-app
```

Сервисы:

- `backend` — FastAPI;
- `nginx` — раздаёт собранный `frontend/dist`.

n8n и Caddy:

```text
/home/almat/n8n-docker-caddy
```

Схема маршрутизации:

```text
Internet
  → Caddy :80/:443
      → almarathon.com      → nginx
      → api.almarathon.com  → backend:8000
      → n8n.almarathon.com  → n8n:5678
```

В repository `docker-compose.yml` нет сервиса `frontend`. Frontend собирается
на хосте и подключается к nginx через volume.

## Переменные окружения

Создайте `.env` на основе списка ниже. Не коммитьте реальные значения.

```env
# Telegram
BOT_TOKEN=
WEBAPP_URL=https://almarathon.com
FRONTEND_URL=https://almarathon.com
BACKEND_URL=https://api.almarathon.com

# JWT
JWT_SECRET=

# Supabase
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ANON_KEY=

# Meta / Instagram
META_APP_ID=
META_APP_SECRET=
META_INSTAGRAM_APP_ID=
META_INSTAGRAM_APP_SECRET=
META_WEBHOOK_VERIFY_TOKEN=
META_REDIRECT_URI=https://api.almarathon.com/api/instagram/auth/callback

# n8n
N8N_URL=https://n8n.almarathon.com
N8N_API_KEY=

# Application
DEVELOPMENT_MODE=true
CORS_ORIGINS=https://almarathon.com,https://t.me

# Frontend build-time
VITE_API_URL=https://api.almarathon.com
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

`META_APP_SECRET` и `META_INSTAGRAM_APP_SECRET` — разные секреты.
Instagram Login использует `META_INSTAGRAM_APP_ID` и
`META_INSTAGRAM_APP_SECRET`.

## Локальная разработка

### Backend

```bash
cd backend
python -m venv .venv
```

Windows:

```powershell
.venv\Scripts\activate
```

Linux/macOS:

```bash
source .venv/bin/activate
```

Установка и запуск:

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend доступен на `http://localhost:3000`, backend — на
`http://localhost:8000`.

Полноценная Telegram-авторизация работает только внутри Telegram Mini App.

## Проверка сборки

Backend:

```bash
cd backend
python -m compileall app
```

Frontend:

```bash
cd frontend
npm run build
```

`npm run lint` сейчас требует миграции конфигурации на ESLint 9
(`eslint.config.js` отсутствует).

Backend содержит автоматические тесты для payload задач, внутренних Meta API,
проверки подписки и обновления профиля Instagram. CI пока не настроен.

## Supabase

Основные таблицы:

- `customer_profiles` — Telegram-пользователи;
- `ig_accounts` — подключённые Instagram-аккаунты;
- `automation_tasks` — задачи;
- `automation_funnels` — воронки;
- `users` — лиды;
- `events` — события;
- `user_login_devices` — входы по типу устройства и ОС;
- `ai_analytics_snapshots` — аналитические снимки.

Частичная migration находится в:

```text
docs/supabase_migrations.sql
```

Она содержит `ig_accounts`, `automation_tasks` и расширение
`customer_profiles`. Полную production-схему следует выгрузить из Supabase и
добавить недостающие migrations.

Экспорт структуры:

```bash
npx supabase login
npx supabase init
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db dump --linked --schema public -f docs/supabase_schema.sql
```

Основные поля `ig_accounts`:

```text
owner_id
page_id
username
display_name
profile_picture_url
followers_count
access_token
token_expires_at
is_active
```

`page_id` содержит Instagram professional account `user_id`, а не Facebook
Page ID. `display_name` содержит полное имя профиля, а `username` — Instagram
username. `profile_picture_url` является URL Meta CDN: endpoint
`GET /api/accounts/` запрашивает актуальное значение через Instagram API и
обновляет его в `ig_accounts`.

## Instagram OAuth

Текущий поток:

```text
Settings
  → GET /api/instagram/meta/url
  → Telegram.WebApp.openLink(api.almarathon.com/.../meta/start-page)
  → Android intent / iOS Universal Link в приложение Instagram
  → GET /api/instagram/auth/callback
  → short-lived token
  → long-lived token
  → Instagram profile
  → Supabase
  → главная страница Mini App
```

Не открывайте `instagram.com/accounts/login` внутри Mini App или повторно в
браузере: Instagram отвечает `HTTP 429` / `force_authentication`, даже если
приложение Instagram уже запущено.

Scopes:

```text
instagram_business_basic
instagram_business_manage_messages
instagram_business_manage_comments
instagram_business_content_publish
instagram_business_manage_insights
```

В development mode подключаться могут только Instagram testers,
администраторы и разработчики приложения, принявшие приглашение в Meta
Dashboard.

## Production deploy

Выполняйте команды только из application repository:

```bash
cd /opt/instagram-bot/instagram-bot-app

git status --short
git fetch origin
git log --oneline HEAD..origin/main
git pull --ff-only origin main

cd frontend
npm install
npm run build
cd ..

docker compose build --no-cache backend
docker compose up -d --force-recreate --no-deps backend
docker compose restart nginx
docker compose ps
```

Не выполняйте:

```bash
cd /home/almat/n8n-docker-caddy
docker compose up -d backend frontend
```

В этом Compose-проекте нет сервисов `backend` и `frontend`.

## Проверка production

```bash
curl https://api.almarathon.com/health
docker compose ps
docker compose logs --since=5m backend
docker exec nginx nginx -t
docker exec nginx ls -la /usr/share/nginx/html
```

Проверка OAuth endpoint внутри backend:

```bash
docker exec backend python -c "from app.core.config import settings; print(settings.meta_oauth_url)"
```

Ожидается:

```text
https://www.instagram.com/oauth/authorize
```

## Безопасность

- не коммитьте `.env`, access tokens, bot tokens и app secrets;
- Supabase service-role key должен использоваться только backend;
- Instagram access tokens сейчас хранятся открытым текстом;
- `.env.example` содержит секретоподобные значения и требует очистки;
- production secrets необходимо ротировать после любой утечки;
- Meta webhook должен проверять подпись `X-Hub-Signature-256`.

## Известные ограничения

- страница Leads не завершена;
- часть используемых таблиц отсутствует в migration-файле;
- отсутствуют автоматические тесты и CI;
- OAuth browser нельзя гарантированно закрыть программно;
- HTTP 429 на `instagram.com/accounts/login` снимается ожиданием 15–30 минут,
  повторно открывать эту ссылку не нужно;
- «Опаньки» в Telegram Android лечится меню ⋮ → «Открыть в Chrome», а не
  обновлением Android WebView;
- токены Instagram требуют автоматического refresh до `token_expires_at`;
- rate limiter и cache работают в памяти одного backend-процесса.

## Документация

- [`SERVER_HANDOFF.md`](SERVER_HANDOFF.md) — основной актуальный handoff;
- [`docs/SERVER_ARCHITECTURE.md`](docs/SERVER_ARCHITECTURE.md) — схема сервера;
- [`docs/supabase_migrations.sql`](docs/supabase_migrations.sql) — SQL;
- [`docs/PROJECT_AUDIT_2026-07-29.md`](docs/PROJECT_AUDIT_2026-07-29.md) — аудит;
- [`docs/instagram-auto-reply-wizard-2026-09-01.md`](docs/instagram-auto-reply-wizard-2026-09-01.md) —
  результаты разработки мастера автоответов и предпросмотра Instagram;
- [`docs/user-login-devices.md`](docs/user-login-devices.md) —
  таблица входов по типу оборудования и операционной системы;
- [`docs/instagram-oauth-webview-2026-09-05.md`](docs/instagram-oauth-webview-2026-09-05.md) —
  почему Instagram login падает с 429 / force_authentication;
- [`docs/automation-task-payload.md`](docs/automation-task-payload.md) —
  структура JSON payload сценария автоответа;
- [`docs/fix-oauth-inside-telegram-2025-07-15.md`](docs/fix-oauth-inside-telegram-2025-07-15.md) —
  исторический OAuth design, частично устарел.

## Формат изменений

Комментарии и commit messages для проекта:

```text
YYYY-MM-DD cursor <краткий комментарий>
```
