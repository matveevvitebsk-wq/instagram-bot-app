# MediaHave: состояние проекта и инструкция по сопровождению

> 2026-09-01 cursor document Instagram auto-reply wizard and avatar refresh
>
> 2026-09-05 cursor require Instagram app login and business account before OAuth
>
> 2026-09-05 cursor detect phone, tablet and computer OS before opening Instagram
>
> 2026-09-05 cursor store device and OS types on each user login
>
> 2026-09-05 cursor revert Instagram launch button and keep login device logging
>
> 2026-09-05 cursor store webhook sender IGSID on igba_id and users
>
> 2026-09-06 cursor store Instagram comment webhook fields on interactions
>
> 2026-09-06 cursor document Instagram comment webhook fields on interactions

Дата актуализации: 2026-09-05
Формат комментария об изменениях: `YYYY-MM-DD cursor <комментарий>`

## 1. Назначение документа

Это основной документ для продолжения разработки и обновления MediaHave.
Он описывает фактическое состояние репозитория, production-сервера, Supabase,
Instagram OAuth и Docker Compose.

Не используйте старые инструкции, в которых предлагается запускать сервисы
`backend frontend` из `/home/almat/n8n-docker-caddy`: в том Compose-проекте
таких сервисов нет.

## 2. Итоги выполненной работы

### Instagram OAuth

- Facebook OAuth со scope `instagram_business_*` заменён на Instagram Login.
- OAuth URL: `https://www.instagram.com/oauth/authorize`.
- Используется Instagram App ID из `META_INSTAGRAM_APP_ID`.
- Для обмена кода используется отдельный Instagram App Secret:
  `META_INSTAGRAM_APP_SECRET`.
- OAuth `state` подписывается JWT и действует 15 минут.
- Authorization code обменивается на short-lived token через
  `https://api.instagram.com/oauth/access_token`.
- Short-lived token обменивается на long-lived token через
  `https://graph.instagram.com/access_token`.
- После успешного callback пользователь возвращается в Mini App:
  `https://t.me/mediahave_bot?startapp=ig_connected`.
- Backend записывает точную ошибку Instagram token exchange в журнал, не
  показывая токены пользователю.

### Данные Instagram

После успешного подключения в `ig_accounts` сохраняются:

- `page_id` — Instagram professional account `user_id`, а не Facebook Page ID;
- `graph_id` — Instagram Graph `/me` `id`; совпадает с webhook
  `recipient.id` и с `sender.id` исходящих echo-сообщений бизнеса;
- `igba_id` — messaging IGSID (`sender.id` входящего DM / participant id).
  Его нельзя вычислить из `page_id` или `graph_id`; значение пишется только
  когда username совпал с подключённым аккаунтом;
- `username` — username, например `almat.running`;
- `display_name` — полное имя профиля из поля Instagram `name`;
- `profile_picture_url` — URL изображения профиля;
- `followers_count` — число подписчиков;
- `access_token` — long-lived Instagram token;
- `token_expires_at` — время истечения long-lived token;
- `is_active` — признак активного подключения.

`profile_picture_url` выдаётся через Meta CDN и может устаревать. При
`GET /api/accounts/` backend обновляет `username`, `display_name` и
`profile_picture_url` через Instagram Graph API, сохраняет изменения в
`ig_accounts` и не возвращает `access_token` во frontend.

`sender.id` входящего сообщения — это IGSID собеседника, не `page_id` и не
`graph_id`. Сравнивать его можно с `ig_accounts.igba_id` (подключённый
аккаунт) и с `users.instagram_id` (участник переписки).

Запись IGSID:

- `POST /api/webhooks/meta` сохраняет inbound `sender.id` в
  `users.instagram_id`. `recipient.id` / echo `sender.id` в `igba_id` не
  пишутся — это `graph_id` бизнеса.
- Комментарий с `from.username` / `from.id` пишет `igba_id`, если username
  совпал с активным `ig_accounts.username`.
- n8n может вызвать `POST /api/internal/meta/actions` с
  `operation=record_sender`, `target_igsid=sender.id` и `username`.
- Settings «Обновить» читает `/me/conversations` и пишет participant IGSID
  в `igba_id` только при совпадении username и только если id не равен
  `page_id` / `graph_id`.

### Интерфейс Mini App

- После подтверждения Instagram статус обновляется при возврате фокуса в Mini App.
- Баннер «Подключите Instagram» скрывается после подтверждённого подключения.
- Разделы «Задачи», «Лиды» и «Воронки» разблокируются после подключения.
- Кнопка «Обновить» вызывает `POST /api/instagram/refresh/{telegram_id}` и
  записывает `ig_accounts.graph_id` из Graph `/me`.
- Мастер автоответов разделён на четыре шага: условия запуска, сообщение
  Direct, расширенные настройки и предпросмотр Instagram.
- Сообщение Direct поддерживает редактируемую первую кнопку, последующее
  сообщение и последнюю кнопку с внешней ссылкой.
- Ответы на комментарии поддерживают несколько вариантов, случайный выбор,
  emoji и GIF.
- Предпросмотр показывает вкладки Direct и комментариев с `display_name`,
  `username` и `profile_picture_url` активного Instagram-аккаунта.
- Кнопка «Завершить» помечает привязку в `ig_accounts` неактивной, очищает
  Instagram-поля в `customer_profiles` и возвращает форму в стартовое состояние.
- Токен пока остаётся в неактивной строке `ig_accounts`; его физическое
  удаление или отзыв нужно реализовать отдельно.
- Сам Instagram-аккаунт при этом не удаляется.

### Исправления API

- Исправлен `GET /api/accounts/`: раньше duplicate-декоратор регистрировал
  обработчик, который возвращал пустой ответ.
- Убрано 30-секундное кеширование списка аккаунтов, мешавшее немедленной
  разблокировке интерфейса.
- Список аккаунтов актуализирует URL аватара и имя профиля через Instagram API,
  сохраняя данные из БД как резерв при временной ошибке Meta.
- Проверка Instagram-состояния повторяется после появления JWT и при возврате
  окна в активное состояние.

## 3. Структура репозитория

```text
instagram-bot-app/
├── backend/
│   ├── app/
│   │   ├── api/             # FastAPI routers
│   │   ├── core/            # config, security, Supabase, cache, rate limit
│   │   └── main.py          # FastAPI application
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/      # Layout и общие компоненты
│   │   ├── hooks/           # Telegram, Instagram, analytics hooks
│   │   ├── pages/           # Dashboard, Tasks, Leads, Funnels, Settings
│   │   ├── store/           # Zustand auth store
│   │   ├── utils/           # Axios и Supabase clients
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── Dockerfile           # Есть, но production Compose его не использует
│   ├── package.json
│   └── vite.config.ts
├── nginx/
│   ├── nginx.conf
│   └── ssl/
├── docs/
│   ├── supabase_migrations.sql
│   ├── SERVER_ARCHITECTURE.md
│   └── PROJECT_AUDIT_2026-07-29.md
├── docker-compose.yml
├── README.md
└── SERVER_HANDOFF.md
```

## 4. Frontend

Стек:

- React 18;
- TypeScript;
- Vite;
- Tailwind CSS;
- Zustand;
- Axios;
- Telegram WebApp API.

Основные маршруты:

- `/` — Dashboard;
- `/tasks` — задачи;
- `/leads` — лиды;
- `/funnels` — воронки;
- `/settings` — настройки и Instagram;
- `/privacy` — публичная политика конфиденциальности;
- `/terms` — публичные условия.

JWT хранится в `sessionStorage` под ключом `jwt` и автоматически добавляется
Axios-клиентом к API-запросам.

Production frontend собирается на сервере:

```bash
cd /opt/instagram-bot/instagram-bot-app/frontend
npm install
npm run build
```

Результат находится в `frontend/dist` и подключается в контейнер nginx как
read-only volume.

## 5. Backend

Стек:

- Python 3.13;
- FastAPI;
- Uvicorn;
- Supabase Python client;
- HTTPX;
- python-jose.

Основные API:

```text
POST   /api/auth/telegram
GET    /api/accounts/
POST   /api/accounts/
DELETE /api/accounts/{account_id}
GET    /api/instagram/meta/url
GET    /api/instagram/auth/callback
GET    /api/instagram/status/{user_id}
GET    /api/tasks/
POST   /api/tasks/
GET    /api/funnels/
POST   /api/funnels/
GET    /api/analytics/dashboard
GET    /api/analytics/leads
POST   /api/events/
GET    /health
```

Telegram auth:

1. Frontend передаёт Telegram `initData`.
2. Backend проверяет HMAC-SHA256 подпись.
3. Профиль создаётся или обновляется в `customer_profiles`.
4. Backend записывает тип оборудования и ОС в `user_login_devices` и
   увеличивает `login_count`.
5. Backend выдаёт JWT HS256.

Backend подключается к Supabase через service-role key. Этот ключ обходит RLS
и должен существовать только на сервере.

## 6. Supabase

Supabase-проект определяется переменной `SUPABASE_URL`. Локальной базы данных
в приложении нет.

### `customer_profiles`

Основные поля, используемые кодом:

```text
id
telegram_id
first_name
last_name
username
photo_url
language_code
subscription_status
instagram_page_id
instagram_access_token
instagram_id
instagram_username
instagram_connected
instagram_connected_at
```

Telegram-пользователь создаётся или обновляется по `telegram_id`.

### `user_login_devices`

```text
owner_id            FK → customer_profiles.id
telegram_id
device_kind         phone | tablet | computer
os_type             ios | android | windows | macos | linux | unknown
telegram_platform
login_count
first_login_at
last_login_at
```

Повторный вход с той же пары устройство + система увеличивает `login_count`.

### `ig_accounts`

```text
id                    UUID primary key
owner_id              FK → customer_profiles.id
page_id               Instagram professional account user_id
graph_id              Instagram Graph /me id (webhook recipient/sender for the business)
igba_id               messaging IGSID of the connected account (webhook sender.id)
username              Instagram username
display_name          полное имя Instagram-профиля
profile_picture_url   URL изображения профиля
followers_count       количество подписчиков
access_token          long-lived Instagram token
token_expires_at      время истечения token
is_active             активность привязки
created_at            время создания записи
```

### `automation_tasks`

```text
id
owner_id
ig_account_id
task_type
status
payload
result
error_message
schedule_at
comment_on_post     boolean — comments under author posts (feed/Reels/live)
exact_match         boolean — exact keyword match in comments (default true)
all_content_types   boolean — all content types vs optional responses
selected_media_ids  jsonb — Instagram media IDs for selected scope
check_subscription  boolean — verify follower before bot continues (default true)
created_at
updated_at
```

Runtime follow check is **not** done in n8n Graph nodes. FastAPI exposes
`POST /api/internal/meta/actions` with `operation=check_follower`, using
Meta `is_user_follow_business` and the webhook IGSID. The same endpoint
accepts `operation=record_sender` to store `sender.id` on `igba_id` /
`users.instagram_id`. See
[`docs/instagram-follower-check.md`](docs/instagram-follower-check.md).

### `users`

```text
id
owner_id              FK → customer_profiles.id, nullable
instagram_id          messaging IGSID (webhook sender.id)
username              Instagram username when known
```

`instagram_id` уникален. Это IGSID участника переписки, не `page_id`.
Для автора комментария туда пишутся `value.from.id` и `value.from.username`.

### `interactions`

Таблица входящих комментариев Instagram. `POST /api/webhooks/meta` пишет
строку при `field=comments`. Повтор с тем же `comment_id` обновляет запись.

```text
from_id               value.from.id — Instagram ID автора комментария
from_username         value.from.username
media_id              value.media.id — пост / Reels (сверяется с selected_media_ids)
media_product_type    value.media.media_product_type, например REELS
event_field           changes[].field, для комментариев comments
event_time            entry.time — Unix-время в секундах
page_id               entry.id — professional account, кому написали
event_object          body.object, для Instagram instagram
comment_id            value.id — id комментария, уникальный
text_content          value.text
interaction_type      COMMENT
user_id               FK → users.id, если автор уже есть в users
```

n8n может прислать тот же JSON как `{ "body": { "entry": [...], "object": "instagram" } }`.
Подробно по каждому полю:
[`docs/instagram-comment-webhook-fields.md`](docs/instagram-comment-webhook-fields.md).

### Другие таблицы, используемые кодом

Код также обращается к таблицам:

- `automation_funnels`;
- `users`;
- `interactions`;
- `ai_analytics_snapshots`;
- `events`;
- `user_login_devices` — счётчик входов по `device_kind` и `os_type`.

Они не создаются текущим `docs/supabase_migrations.sql`; перед новым
развёртыванием полную live-схему нужно выгрузить и синхронизировать.

### Выгрузка структуры Supabase

```bash
npx supabase login
npx supabase init
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db dump --linked --schema public -f docs/supabase_schema.sql
```

Docker должен быть запущен. Dump по умолчанию содержит структуру, но не данные.

### Применение последних колонок `ig_accounts`

```sql
ALTER TABLE public.ig_accounts
    ADD COLUMN IF NOT EXISTS display_name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS profile_picture_url TEXT,
    ADD COLUMN IF NOT EXISTS followers_count BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;

UPDATE public.ig_accounts
SET display_name = NULL
WHERE display_name = username;
```

Существующий Instagram-аккаунт должен пройти OAuth повторно, чтобы заполнить
`display_name`, `profile_picture_url`, `followers_count` и `token_expires_at`.

### Проверка `igba_id`

```sql
ALTER TABLE public.ig_accounts
    ADD COLUMN IF NOT EXISTS igba_id VARCHAR(255);

SELECT id, username, page_id, graph_id, igba_id
FROM public.ig_accounts
WHERE is_active = true;
```

`igba_id` должен отличаться от `page_id` и `graph_id`. Для `sveta_boltkova`
ожидаемый messaging IGSID — `1917627436259991`.

## 7. Instagram OAuth: текущий поток

```text
Settings
  → GET /api/instagram/meta/url?telegram_id=...
  → Telegram.WebApp.openLink(api.almarathon.com/.../meta/start-page)
  → Android intent / iOS Universal Link в приложение Instagram
  → пользователь подтверждает permissions
  → GET /api/instagram/auth/callback?code=...&state=...
  → short-lived token
  → long-lived token
  → GET graph.instagram.com/{version}/me
  → upsert ig_accounts
  → update customer_profiles
  → HTML «Открыть приложение в Telegram»
  → https://t.me/mediahave_bot?startapp=ig_connected
  → Mini App проверяет GET /api/accounts/
```

Страница `instagram.com/accounts/login/?force_authentication` — это веб-логин
без сессии приложения Instagram. После нескольких попыток Instagram отвечает
`HTTP 429`. Не открывайте эту ссылку повторно.

«Опаньки… обновите Android WebView» в окне MediaHave-bot — это падение
встроенного браузера Telegram на `intent://` или на 429. Нужно меню ⋮ →
«Открыть в Chrome», а не обновление WebView.

Используемые scopes:

```text
instagram_business_basic
instagram_business_manage_messages
instagram_business_manage_comments
instagram_business_content_publish
instagram_business_manage_insights
```

В development mode авторизоваться могут только администраторы, разработчики и
Instagram testers, принявшие приглашение в Meta Dashboard.

## 8. Переменные окружения

Ниже перечислены только имена. Значения и секреты нельзя коммитить.

Backend:

```text
BOT_TOKEN
TELEGRAM_BOT_USERNAME
WEBAPP_URL
FRONTEND_URL
BACKEND_URL
JWT_SECRET
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_ANON_KEY
META_APP_ID
META_APP_SECRET
META_INSTAGRAM_APP_ID
META_INSTAGRAM_APP_SECRET
META_WEBHOOK_VERIFY_TOKEN
META_REDIRECT_URI
N8N_URL
N8N_API_KEY
DEVELOPMENT_MODE
CORS_ORIGINS
```

Frontend build-time:

```text
VITE_API_URL
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

`META_APP_SECRET` и `META_INSTAGRAM_APP_SECRET` — разные значения:

- `META_APP_SECRET` относится к Meta/Facebook App;
- `META_INSTAGRAM_APP_SECRET` относится к Instagram App ID.

## 9. Docker Compose

В production используются два независимых Compose-проекта.

### MediaHave application

Каталог:

```text
/opt/instagram-bot/instagram-bot-app
```

Сервисы из repository `docker-compose.yml`:

- `backend` — собирается из `./backend`, контейнер `backend`, порт `8000`;
- `nginx` — образ `nginx:alpine`, контейнер `nginx`, отдаёт `frontend/dist`.

В этом Compose нет сервиса `frontend`: frontend — статические файлы внутри
nginx volume.

### n8n и Caddy

Каталог:

```text
/home/almat/n8n-docker-caddy
```

Там находятся только отдельные сервисы n8n и Caddy. Не выполняйте из этого
каталога команды для `backend` или `frontend`.

### Сеть и маршрутизация

Общая external network:

```text
instagram-bot-app_app-network
```

Production-схема:

```text
Internet
  → Caddy :80/:443
      → almarathon.com      → nginx:80
      → api.almarathon.com  → backend:8000
      → n8n.almarathon.com  → n8n:5678
```

## 10. Правильный production deploy

Всегда выполнять из каталога приложения:

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

Если `git status --short` показывает локальные изменения, сначала выяснить их
происхождение. Не использовать `git reset --hard`.

### Только backend

```bash
cd /opt/instagram-bot/instagram-bot-app
git pull --ff-only origin main
docker compose build --no-cache backend
docker compose up -d --force-recreate --no-deps backend
```

### Только frontend

```bash
cd /opt/instagram-bot/instagram-bot-app/frontend
npm install
npm run build
cd ..
docker compose restart nginx
```

## 11. Проверка после deploy

```bash
curl https://api.almarathon.com/health
docker compose ps
docker compose logs --since=5m backend
docker exec backend python -c "from app.core.config import settings; print(settings.meta_oauth_url)"
docker exec nginx nginx -t
docker exec nginx ls -la /usr/share/nginx/html
```

Ожидаемый OAuth URL:

```text
https://www.instagram.com/oauth/authorize
```

Для просмотра точной причины ошибки Instagram:

```bash
docker compose logs --since=15m backend | grep -E "Instagram|callback"
```

Не публикуйте callback URL с authorization code: код одноразовый и
краткоживущий.

## 12. Локальная разработка и проверки

Backend:

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Проверки перед commit:

```bash
cd backend
python -m compileall app

cd ../frontend
npm run build
```

`npm run lint` сейчас не работает с ESLint 9, потому что в проекте отсутствует
`eslint.config.js`.

Автоматических backend/frontend тестов и CI в репозитории пока нет.

## 13. Команды, использованные во время работ

Git:

```bash
git status --short --branch
git diff
git log -5 --oneline
git pull --ff-only origin main
git add <конкретные файлы>
git commit
git push origin main
```

Frontend и backend:

```bash
npm run build
python -m compileall app
docker compose build --no-cache backend
docker compose up -d --force-recreate --no-deps backend
docker compose restart nginx
docker compose logs -f backend
```

Диагностика контейнера:

```bash
docker exec backend python -c "import app.core.config as c; print(c.__file__); print(c.settings.meta_oauth_url)"
sha256sum backend/app/core/config.py
docker exec backend sha256sum /app/app/core/config.py
docker inspect backend --format 'image={{.Config.Image}} working_dir={{index .Config.Labels "com.docker.compose.project.working_dir"}} config={{index .Config.Labels "com.docker.compose.project.config_files"}}'
```

## 14. Известные ограничения и следующие задачи

Высокий приоритет:

- удалить реальные секреты из `.env.example` и немедленно ротировать их;
- зашифровать Instagram access tokens в Supabase;
- очищать или отзывать access token в неактивной строке `ig_accounts` при
  отключении аккаунта;
- добавить и проверить подпись Meta webhook;
- синхронизировать полную live Supabase schema с migrations;
- добавить миграции для `automation_funnels`, `events`,
  `ai_analytics_snapshots`, `users` и `interactions`;
- устранить обращения к устаревшим именам settings в tasks/webhooks;
- реализовать UI страницы Leads;
- добавить автоматическое обновление Instagram long-lived tokens;
- добавить тесты и CI.

Технические ограничения:

- браузер может запретить программное `window.close()`;
- Instagram OAuth нельзя надёжно встроить в iframe;
- access token сейчас хранится открытым текстом;
- rate limiter и cache работают в памяти одного процесса;
- frontend environment variables `VITE_*` применяются только во время build.

## 15. Ключевые правила сопровождения

1. Не запускать application backend из `/home/almat/n8n-docker-caddy`.
2. Не использовать несуществующий Compose service `frontend`.
3. Перед `git pull` всегда выполнять `git status --short`.
4. Не коммитить `.env`, токены, app secrets и service-role keys.
5. После backend-изменений пересобирать контейнер `backend`.
6. После frontend-изменений выполнять `npm run build` и restart nginx.
7. После изменения Supabase schema сохранять SQL migration в Git.
8. Комментарии изменений оформлять как
   `YYYY-MM-DD cursor <комментарий>`.
