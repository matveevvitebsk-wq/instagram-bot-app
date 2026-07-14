# DigitalOcean Droplet State Documentation

Дата фиксации:
2026-07-14

Сервер:

- Provider: DigitalOcean
- Droplet name: n8n-server
- OS: Ubuntu
- User: almat
- Project path:
  /opt/instagram-bot/instagram-bot-app

---

# 1. Серверная информация

## Ресурсы

RAM:
Total: 1.9 GiB
Used: 776 MiB
Free: 100 MiB
Available: 1.2 GiB
Swap: 4 GiB

## Docker

Версия:

Docker 28.x

Состояние:

docker system df

Images:
3
Size:
2.992 GB

Containers:
3
Size:
62 MB

Volumes:
2
Size:
1.882 MB

---

# 2. Проекты

Основной проект:
/opt/instagram-bot/instagram-bot-app

Структура:

instagram-bot-app/

+-- backend/
¦ +-- Dockerfile
¦ +-- app/
¦ ¦ +-- main.py
¦ ¦ +-- routes/
¦ ¦ +-- services/
¦ ¦ L-- models/
¦ L-- requirements.txt
¦
+-- frontend/
¦ +-- Dockerfile
¦ +-- src/
¦ L-- dist/
¦
+-- nginx/
¦ +-- nginx.conf
¦ L-- ssl/
¦ +-- fullchain.pem
¦ L-- privkey.pem
¦
+-- docker-compose.yml
¦
L-- .env

---

# 3. Docker Compose Services

Команда:

docker compose config --services

Сервисы:

n8n
backend
nginx

---

# 4. Docker Containers

Текущее состояние:

docker ps

## nginx

Container:

nginx

Image:

nginx:alpine

Ports:

80:80
443:443

Status:

Up

Назначение:

- Reverse proxy
- SSL termination
- Frontend hosting
- Backend routing
- n8n routing

---

## backend

Container:

backend

Image:

instagram-bot-app-backend

Port:
8000

Status:
healthy

Framework:
FastAPI
Uvicorn

Health endpoint:
GET /health

Ответ:

```json
{
 "status":"ok",
 "version":"1.0.0",
 "mode":"development"
}
n8n

Container:

n8n

Image:

n8nio/n8n:latest

Internal port:

5678

Назначение:

Automation workflows
Instagram automation
Telegram workflows
Meta webhook processing

5. Домены
SSL Certificate

Файл:

nginx/ssl/fullchain.pem

SAN:

DNS:almarathon.com
DNS:api.almarathon.com
DNS:n8n.almarathon.com
DNS:www.almarathon.com
6. Nginx Routing
almarathon.com

Назначение:

Frontend React SPA

Конфигурация:

server_name almarathon.com;

Root:

/usr/share/nginx/html

Проверка:
curl -I https://almarathon.com

Результат:

HTTP/1.1 200 OK
www.almarathon.com

Настройка:

Redirect

www.almarathon.com
        |
        v
https://almarathon.com

Проверка:

curl -I https://www.almarathon.com

Результат:
HTTP/1.1 301 Moved Permanently

Location:
https://almarathon.com/
api.almarathon.com

Назначение:

FastAPI Backend

Proxy:

api.almarathon.com
        |
        v
backend:8000

Проверка:

curl https://api.almarathon.com/health

Ответ:

{
 "status":"ok",
 "version":"1.0.0",
 "mode":"development"
}

OpenAPI:

https://api.almarathon.com/openapi.json
n8n.almarathon.com

Назначение:

n8n interface

Proxy:

n8n.almarathon.com
        |
        v
n8n:5678

Проверка:

curl -I https://n8n.almarathon.com

Результат:

HTTP/1.1 200 OK
7. Backend API

Основные endpoints:

Telegram Auth
POST
/api/auth/telegram
Instagram Accounts
GET
/api/accounts/

/POST
/api/accounts/
Tasks
GET
/api/tasks/

/POST
/api/tasks/
Meta Webhook

Verify:

GET
/api/webhooks/meta

Events:

POST
/api/webhooks/meta
N8N Callback
POST
/api/webhooks/n8n/callback
8. Instagram / Meta Integration

Используется:

Meta Graph API

Endpoints:

/api/auth/meta/url
/api/auth/meta/callback
/api/auth/meta/disconnect

Webhook:

/api/webhooks/meta

Текущий статус:

Backend endpoint существует
Webhook route зарегистрирован

Проблема:

META_VERIFY_TOKEN отсутствует в environment

Проверка:

docker exec backend env | grep META

Результат:

нет переменной
9. Environment Variables

Проверено:

BOT_TOKEN

Есть:

BOT_TOKEN=*****

Отсутствует:

META_VERIFY_TOKEN
10. Проверки
Nginx config

Команда:

docker exec nginx nginx -t

Результат:

syntax is ok
configuration is successful
Backend health
curl http://localhost:8000/health

Результат:

OK

External API
curl https://api.almarathon.com/health

Результат:

OK

11. Известные проблемы
1. Meta webhook verification

Ошибка:

Internal Server Error

Причина:

Отсутствует:

META_VERIFY_TOKEN

Решение:

Добавить в:

.env

пример:

META_VERIFY_TOKEN=test123

После:

docker compose restart backend
2. n8n webhook test

Проверка:

curl https://n8n.almarathon.com/webhook-test/

Ответ:

404

Причина:

Нет активного workflow webhook.

3. Логи nginx с неизвестными JS файлами

Примеры:

GET /js/lkk_ch.js
GET /bot-connect.js
GET /antibot-client.js

Источник:

Автоматические интернет-сканеры.

Это НЕ является ошибкой nginx.

12. Текущее состояние системы

Статус:

Docker работает
nginx работает
SSL работает
Frontend доступен
Backend доступен
n8n доступен
Meta webhook требует META_VERIFY_TOKEN
Нужно проверить Instagram OAuth flow

13. Последние команды обслуживания

Перезапуск:

docker compose restart nginx
docker compose restart backend

Проверка:

docker ps
docker logs nginx --tail 50
docker logs backend --tail 50
docker logs n8n --tail 50
curl https://api.almarathon.com/health
curl https://almarathon.com
curl https://n8n.almarathon.com
openssl x509 -in nginx/ssl/fullchain.pem -text -noout | grep DNS
docker system df
free -h

Следующим шагом стоит добавить в этот файл ещё:
1. содержимое `docker-compose.yml`;
2. список всех `.env` переменных без секретов;
3. схему сети Docker (`docker network inspect`);
4. список volumes и их назначение.
```

# DigitalOcean Droplet State Documentation

Дата фиксации:
2026-07-14

Сервер:

- Provider: DigitalOcean
- Droplet name: n8n-server
- OS: Ubuntu
- User: almat
- Project path:
  /opt/instagram-bot/instagram-bot-app

---

# 1. Серверная информация

## Ресурсы

RAM:
Total: 1.9 GiB
Used: 776 MiB
Free: 100 MiB
Available: 1.2 GiB
Swap: 4 GiB

## Docker

Версия:

Docker 28.x

Состояние:

docker system df

Images:
3
Size:
2.992 GB

Containers:
3
Size:
62 MB

Volumes:
2
Size:
1.882 MB

---

# 2. Проекты

Основной проект:
/opt/instagram-bot/instagram-bot-app

Структура:

instagram-bot-app/

+-- backend/
¦ +-- Dockerfile
¦ +-- app/
¦ ¦ +-- main.py
¦ ¦ +-- routes/
¦ ¦ +-- services/
¦ ¦ L-- models/
¦ L-- requirements.txt
¦
+-- frontend/
¦ +-- Dockerfile
¦ +-- src/
¦ L-- dist/
¦
+-- nginx/
¦ +-- nginx.conf
¦ L-- ssl/
¦ +-- fullchain.pem
¦ L-- privkey.pem
¦
+-- docker-compose.yml
¦
L-- .env

---

# 3. Docker Compose Services

Команда:

docker compose config --services

Сервисы:

n8n
backend
nginx

---

# 4. Docker Containers

Текущее состояние:

docker ps

## nginx

Container:

nginx

Image:

nginx:alpine

Ports:

80:80
443:443

Status:

Up

Назначение:

- Reverse proxy
- SSL termination
- Frontend hosting
- Backend routing
- n8n routing

---

## backend

Container:

backend

Image:

instagram-bot-app-backend

Port:
8000

Status:
healthy

Framework:
FastAPI
Uvicorn

Health endpoint:
GET /health

Ответ:

```json
{
 "status":"ok",
 "version":"1.0.0",
 "mode":"development"
}
n8n

Container:

n8n

Image:

n8nio/n8n:latest

Internal port:

5678

Назначение:

Automation workflows
Instagram automation
Telegram workflows
Meta webhook processing

5. Домены
SSL Certificate

Файл:

nginx/ssl/fullchain.pem

SAN:

DNS:almarathon.com
DNS:api.almarathon.com
DNS:n8n.almarathon.com
DNS:www.almarathon.com
6. Nginx Routing
almarathon.com

Назначение:

Frontend React SPA

Конфигурация:

server_name almarathon.com;

Root:

/usr/share/nginx/html

Проверка:
curl -I https://almarathon.com

Результат:

HTTP/1.1 200 OK
www.almarathon.com

Настройка:

Redirect

www.almarathon.com
        |
        v
https://almarathon.com

Проверка:

curl -I https://www.almarathon.com

Результат:
HTTP/1.1 301 Moved Permanently

Location:
https://almarathon.com/
api.almarathon.com

Назначение:

FastAPI Backend

Proxy:

api.almarathon.com
        |
        v
backend:8000

Проверка:

curl https://api.almarathon.com/health

Ответ:

{
 "status":"ok",
 "version":"1.0.0",
 "mode":"development"
}

OpenAPI:

https://api.almarathon.com/openapi.json
n8n.almarathon.com

Назначение:

n8n interface

Proxy:

n8n.almarathon.com
        |
        v
n8n:5678

Проверка:

curl -I https://n8n.almarathon.com

Результат:

HTTP/1.1 200 OK
7. Backend API

Основные endpoints:

Telegram Auth
POST
/api/auth/telegram
Instagram Accounts
GET
/api/accounts/

/POST
/api/accounts/
Tasks
GET
/api/tasks/

/POST
/api/tasks/
Meta Webhook

Verify:

GET
/api/webhooks/meta

Events:

POST
/api/webhooks/meta
N8N Callback
POST
/api/webhooks/n8n/callback
8. Instagram / Meta Integration

Используется:

Meta Graph API

Endpoints:

/api/auth/meta/url
/api/auth/meta/callback
/api/auth/meta/disconnect

Webhook:

/api/webhooks/meta

Текущий статус:

Backend endpoint существует
Webhook route зарегистрирован

Проблема:

META_VERIFY_TOKEN отсутствует в environment

Проверка:

docker exec backend env | grep META

Результат:

нет переменной
9. Environment Variables

Проверено:

BOT_TOKEN

Есть:

BOT_TOKEN=*****

Отсутствует:

META_VERIFY_TOKEN
10. Проверки
Nginx config

Команда:

docker exec nginx nginx -t

Результат:

syntax is ok
configuration is successful
Backend health
curl http://localhost:8000/health

Результат:

OK

External API
curl https://api.almarathon.com/health

Результат:

OK

11. Известные проблемы
1. Meta webhook verification

Ошибка:

Internal Server Error

Причина:

Отсутствует:

META_VERIFY_TOKEN

Решение:

Добавить в:

.env

пример:

META_VERIFY_TOKEN=test123

После:

docker compose restart backend
2. n8n webhook test

Проверка:

curl https://n8n.almarathon.com/webhook-test/

Ответ:

404

Причина:

Нет активного workflow webhook.

3. Логи nginx с неизвестными JS файлами

Примеры:

GET /js/lkk_ch.js
GET /bot-connect.js
GET /antibot-client.js

Источник:

Автоматические интернет-сканеры.

Это НЕ является ошибкой nginx.

12. Текущее состояние системы

Статус:

Docker работает
nginx работает
SSL работает
Frontend доступен
Backend доступен
n8n доступен
Meta webhook требует META_VERIFY_TOKEN
Нужно проверить Instagram OAuth flow

13. Последние команды обслуживания

Перезапуск:

docker compose restart nginx
docker compose restart backend

Проверка:

docker ps
docker logs nginx --tail 50
docker logs backend --tail 50
docker logs n8n --tail 50
curl https://api.almarathon.com/health
curl https://almarathon.com
curl https://n8n.almarathon.com
openssl x509 -in nginx/ssl/fullchain.pem -text -noout | grep DNS
docker system df
free -h

Следующим шагом стоит добавить в этот файл ещё:
1. содержимое `docker-compose.yml`;
2. список всех `.env` переменных без секретов;
3. схему сети Docker (`docker network inspect`);
4. список volumes и их назначение.
```

### Версии компонентов

| Компонент        | Версия    | Описание                                           |
| ---------------- | --------- | -------------------------------------------------- |
| n8n              | 2.25.7    | Автоматизация workflow, Instagram/Telegram webhook |
| Python           | 3.13.14   | Backend runtime                                    |
| React            | 18.3.1    | Frontend framework                                 |
| React DOM        | 18.3.1    | React browser rendering                            |
| React Router DOM | 6.27.0    | Маршрутизация frontend                             |
| Vite             | 5.4.10    | Сборка frontend                                    |
| Node.js          | 22-alpine | Используется при сборке frontend                   |
| Docker           | 28.2.2    | Контейнеризация                                    |

---

# 14. Frontend архитектура

Frontend находится:

frontend/

Frontend НЕ является отдельным Docker Compose сервисом.

Текущие Docker Compose сервисы:
n8n
backend
nginx

Сборка frontend выполняется через Dockerfile:

```dockerfile
FROM node:22-alpine AS builder

```

Frontend не запускается через npm на сервере. npm используется только внутри Docker build stage (node:22-alpine). Production раздаётся nginx.
