# Instagram Automation — Telegram Mini App

Полный стек: React + FastAPI + N8n + Supabase + Telegram WebApp API.
Работает на всех платформах: iOS, Android, Windows, Linux, macOS.

---

## Структура проекта

```
instagram-bot-app/
├── .vscode/
│   ├── settings.json       # Настройки редактора (форматирование, линтинг)
│   ├── extensions.json     # Рекомендуемые расширения
│   ├── launch.json         # Debug конфигурации (F5)
│   └── tasks.json          # Задачи (Ctrl+Shift+B)
│
├── frontend/               # React + Vite + Tailwind (Telegram Mini App)
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx    # Главный экран, статистика
│   │   │   ├── Tasks.tsx        # Создание и управление задачами
│   │   │   ├── Leads.tsx        # Лиды из Instagram
│   │   │   ├── Funnels.tsx      # Управление воронками
│   │   │   └── Settings.tsx     # Привязка аккаунта
│   │   ├── components/
│   │   │   ├── Layout.tsx       # Нижняя навигация (cross-platform)
│   │   │   └── LoadingScreen.tsx
│   │   ├── hooks/
│   │   │   └── useTelegram.ts   # Обёртка Telegram WebApp API
│   │   ├── store/
│   │   │   └── authStore.ts     # Zustand: состояние авторизации
│   │   ├── utils/
│   │   │   └── api.ts           # Axios + JWT interceptor
│   │   ├── App.tsx              # Роутер + auth guard
│   │   ├── main.tsx             # Точка входа, init Telegram
│   │   └── index.css            # Telegram CSS переменные
│   ├── index.html               # ВАЖНО: telegram-web-app.js первым!
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── package.json
│
├── backend/                # FastAPI (Python 3.12)
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth.py          # POST /api/auth/telegram
│   │   │   ├── accounts.py      # CRUD Instagram аккаунтов
│   │   │   ├── tasks.py         # Задачи автоматизации
│   │   │   ├── webhooks.py      # Callbacks от N8n и Meta
│   │   │   └── analytics.py     # Аналитика дашборда
│   │   ├── core/
│   │   │   ├── config.py        # Pydantic Settings (.env)
│   │   │   ├── security.py      # Telegram verify + JWT
│   │   │   └── supabase.py      # Supabase клиент
│   │   └── main.py              # FastAPI app + роуты
│   ├── Dockerfile
│   └── requirements.txt
│
├── n8n/
│   └── workflows/          # JSON экспорты N8n workflow
│
├── nginx/
│   └── nginx.conf          # Reverse proxy + SSL
│
├── docs/
│   └── supabase_migrations.sql  # SQL для Supabase
│
├── docker-compose.yml
├── .env.example
└── .gitignore
```

---

## Шаг 1 — Установка инструментов (разовая настройка)

### Все платформы (Windows / Linux / macOS):

1. **VS Code** — https://code.visualstudio.com/
2. **Node.js 20 LTS** — https://nodejs.org/
3. **Python 3.12** — https://www.python.org/
4. **Docker Desktop** — https://www.docker.com/products/docker-desktop/
5. **Git** — https://git-scm.com/

После установки VS Code откройте проект и нажмите **"Install All"** во всплывающем
уведомлении о рекомендуемых расширениях.

---

## Шаг 2 — Первоначальная настройка

```bash
# Клонируем / переходим в папку
cd instagram-bot-app

# Копируем и заполняем .env
cp .env.example .env
# Откройте .env в VS Code и заполните все переменные
```

---

## Шаг 3 — Supabase

1. Зарегистрируйтесь на https://supabase.com
2. Создайте новый проект
3. Скопируйте из Settings → API:
   - Project URL → `SUPABASE_URL`
   - `anon` key → `SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`
4. Откройте **SQL Editor** и выполните `docs/supabase_migrations.sql`
5. Включите Realtime для таблицы `automation_tasks`:
   Database → Replication → включите `automation_tasks`

---

## Шаг 4 — Telegram Bot

1. Откройте @BotFather в Telegram
2. `/newbot` → дайте имя → получите токен → `BOT_TOKEN=...`
3. `/newapp` → выберите бота → укажите URL вашего приложения → `WEBAPP_URL=...`
4. Для локальной разработки используйте **ngrok**:
   ```bash
   # Windows:
   choco install ngrok   # или скачайте с ngrok.com
   ngrok http 3000

   # Linux/macOS:
   brew install ngrok
   ngrok http 3000
   ```
   Полученный `https://xxxx.ngrok.io` → установите как WEBAPP_URL в @BotFather

---

## Шаг 5 — Локальная разработка

### Вариант A — через VS Code Tasks (рекомендуется):
- `Ctrl+Shift+B` → выберите нужную задачу

### Вариант B — вручную в терминале:

```bash
# Терминал 1 — Backend
cd backend
python -m venv .venv

# Windows:
.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

```bash
# Терминал 2 — Frontend
cd frontend
npm install
npm run dev
```

Откройте http://localhost:3000 — вне Telegram увидите заглушку
(нормально! Mini App работает только внутри Telegram).

### Тестирование в Telegram (локально):
1. Запустите ngrok: `ngrok http 3000`
2. Установите полученный URL в @BotFather как WebApp URL
3. Откройте бота в Telegram → кнопка открытия Mini App

---

## Шаг 6 — Деплой на DigitalOcean

```bash
# На сервере DO:
git clone <your-repo> && cd instagram-bot-app
cp .env.example .env && nano .env  # заполните переменные

# SSL сертификат (Let's Encrypt):
apt install certbot -y
certbot certonly --standalone -d your-domain.com
cp /etc/letsencrypt/live/your-domain.com/fullchain.pem nginx/ssl/
cp /etc/letsencrypt/live/your-domain.com/privkey.pem nginx/ssl/

# Сборка фронтенда:
cd frontend && npm install && npm run build && cd ..

# Запуск:
docker compose up -d

# Проверка логов:
docker compose logs -f backend
```

---

## Что было исправлено из вашего проекта

| Проблема | Решение |
|---|---|
| `verify_token` хардкодом в N8n If3 ноде | Вынесен в `.env` → `META_WEBHOOK_VERIFY_TOKEN` |
| Нет авторизации через Telegram | Добавлена полная верификация `initData` по HMAC-SHA256 |
| Нет таблицы `automation_tasks` | SQL миграция в `docs/supabase_migrations.sql` |
| `customer_profiles` без `telegram_id` | `ALTER TABLE` добавляет нужные колонки |
| Токен Instagram хранится открытым | Комментарий с pgcrypto шифрованием |
| N8n доступен напрямую без auth | Nginx проксирует, N8n за Basic Auth |
| Нет обратной связи N8n → Telegram | `POST /api/webhooks/n8n/callback` отправляет push |

---

## Платформенная совместимость

Mini App корректно работает на всех платформах через:
- `tg.expand()` — полноэкранный режим
- `safe-area-inset-*` — учёт iPhone notch, Android навигации
- CSS переменные `--tg-theme-*` — автоматическая тёмная/светлая тема
- `-webkit-tap-highlight-color: transparent` — убирает flash на тапах
- `user-scalable=no` в viewport — отключает пинч-зум (UX на мобильных)
