# Docker Compose Architecture

Дата: 2026-07-16

## Общая структура

Ubuntu Docker Host

├── Compose project: n8n-docker-caddy
│
│ ├── caddy container
│ │ Image: caddy:latest
│ │ Назначение:
│ │ - SSL сертификаты
│ │ - HTTPS вход
│ │ - Reverse Proxy
│ │
│ └── n8n container
│ Image: docker.n8n.io/n8nio/n8n:latest
│ Назначение:
│ - Workflow automation
│ - Telegram automation
│ - Instagram automation
│ - Webhooks
│
│ Volumes:
│ ├── caddy_data
│ │ - SSL сертификаты Caddy
│ │
│ └── n8n_data
│ - настройки n8n
│ - credentials
│ - workflows
│
│
└── Compose project: instagram-bot-app
|
├── backend container
│ Image: instagram-bot-app-backend
│ Назначение:
│ - FastAPI API
│ - Meta OAuth
│ - Telegram API
│ - связь с Supabase
│
├── frontend container
│ Image: instagram-bot-app-frontend
│ Назначение:
│ - React приложение
│ - пользовательский интерфейс
│
└── nginx container
Image: nginx:alpine
Назначение: - отдача React build - прокси frontend/backend

# Взаимодействие

Пользователь

↓

Caddy

↓

n8n.almarathon.com

↓

n8n container

Пользователь

↓

Caddy

↓

api.almarathon.com

↓

backend container

Пользователь

↓

Caddy

↓

almarathon.com

↓

frontend container

# Почему два Compose проекта

n8n-docker-caddy:

- отдельный независимый сервис автоматизации
- отдельный SSL
- отдельное обновление n8n

instagram-bot-app:

- код приложения
- frontend
- backend

# Контейнеры

caddy:
Отвечает за внешний HTTPS доступ.

n8n:
Выполняет автоматизации.

backend:
Обрабатывает API запросы.

frontend:
Отображает сайт.

nginx:
Локальная отдача React.

# Текущие рабочие контейнеры

n8n-docker-caddy:

n8n-docker-caddy-caddy-1
n8n-docker-caddy-n8n-1

instagram-bot-app:

backend
nginx

# Не использовать

Не создавать второй n8n.

Не создавать второй Caddy.

Не использовать nginx на портах 80/443.

Порты 80/443 принадлежат Caddy.

# Правильная схема

Internet
|
Caddy :80 :443
|

---

| |
n8n:5678 nginx/frontend/backend
|
n8n_data
