# SERVER_HANDOFF.md

Дата: 2026-07-09

---

# Назначение

Документ фиксирует текущее состояние сервера, проекта MediaHave и последовательность действий по обновлению проекта.

Использовать как основной документ при продолжении разработки, чтобы не повторять диагностику.

---

# Сервер

Пользователь

```
almat
```

Домашняя папка

```
/home/almat
```

---

# Основные каталоги

Docker Compose

```
/home/almat/n8n-docker-caddy
```

Исходный код проекта

```
/opt/instagram-bot/instagram-bot-app
```

---

# Структура проекта

```
/opt/instagram-bot/
    instagram-bot-app/
        backend/
        frontend/
        docs/
        nginx/
        docker-compose.yml
        .env
```

---

# Docker

Рабочий docker compose расположен здесь

```
/home/almat/n8n-docker-caddy/docker-compose.yml
```

Контейнеры

```
backend
frontend
n8n
caddy
```

Используемые Docker images

```
n8n-backend:latest

n8n-frontend:latest

docker.n8n.io/n8nio/n8n

caddy:latest
```

ВАЖНО

Docker НЕ собирается автоматически из исходников.

docker-compose запускает уже готовые Docker Images.

Поэтому после изменения кода необходимо выполнять docker build.

---

# Git

Рабочий репозиторий

```
/opt/instagram-bot/instagram-bot-app
```

Ветка

```
main
```

Remote

```
origin
```

---

# Git Status

На момент анализа обнаружены локальные изменения.

Modified

```
backend/app/api/meta_oauth.py

backend/app/api/tasks.py

backend/app/api/webhooks.py

backend/app/main.py

frontend/src/pages/Tasks.tsx

frontend/vite.config.ts
```

Untracked

```
backend/app/api/funnels.py
```

Перед git pull обязательно сохранить изменения.

---

# Команды диагностики сервера

Текущая папка

```bash
pwd
```

Содержимое

```bash
ls -la
```

Корень

```bash
ls -la /
```

Домашняя папка

```bash
ls -la /home
```

```bash
ls -la /home/almat
```

Папка проекта

```bash
ls -la /opt
```

```bash
ls -la /opt/instagram-bot
```

```bash
ls -la /opt/instagram-bot/instagram-bot-app
```

Поиск Git репозиториев

```bash
find / -name ".git" 2>/dev/null
```

Проверка Git

```bash
git status

git remote -v

git branch
```

---

# Проверка Docker

Все контейнеры

```bash
docker ps -a
```

Docker compose

```bash
cd /home/almat/n8n-docker-caddy

docker compose ps
```

Просмотр compose

```bash
cat docker-compose.yml
```

---

# Проверка обновлений GitHub

```bash
cd /opt/instagram-bot/instagram-bot-app

git fetch origin

git status

git log --oneline HEAD..origin/main
```

Если последняя команда ничего не выводит

обновлений нет.

---

# Сохранение локальных изменений

Создать резервную ветку

```bash
git checkout -b backup-$(date +%Y%m%d-%H%M)

git add .

git commit -m "Backup before update"
```

Вернуться

```bash
git checkout main
```

---

# Обновление проекта

```bash
git pull origin main
```

Если возник конфликт

НЕ продолжать.

Сначала проанализировать конфликт.

---

# Сборка Backend

```bash
cd /opt/instagram-bot/instagram-bot-app

docker build --no-cache -t n8n-backend:latest ./backend
```

---

# Сборка Frontend

```bash
docker build --no-cache -t n8n-frontend:latest ./frontend
```

---

# Перезапуск

```bash
cd /home/almat/n8n-docker-caddy

docker compose up -d --force-recreate backend frontend
```

---

# Проверка

```bash
docker compose ps
```

Логи Backend

```bash
docker compose logs -f backend
```

Логи Frontend

```bash
docker compose logs -f frontend
```

Выход

```
Ctrl+C
```

---

# Что необходимо сделать

## Высокий приоритет

- закончить funnels.py
- проверить Meta OAuth
- протестировать регистрацию второго пользователя
- протестировать webhook
- протестировать отправку DM
- проверить работу Supabase
- проверить регистрацию Funnel

---

## Средний приоритет

заменить Git Personal Access Token

```
https://Almavit:ghp_xxxxxxxxxx
```

на SSH

```
git@github.com:Almavit/instagram-bot-app.git
```

---

## Создать deploy.sh

Автоматизировать

```
git fetch

git pull

docker build backend

docker build frontend

docker compose up -d --force-recreate backend frontend

docker compose ps
```

---

# Следующий чат

Сразу сообщить:

Проект находится здесь

```
/opt/instagram-bot/instagram-bot-app
```

Docker Compose

```
/home/almat/n8n-docker-caddy
```

Backend и Frontend работают из Docker Images

```
n8n-backend:latest

n8n-frontend:latest
```

После изменения исходников необходимо выполнять

```
docker build

docker compose up -d --force-recreate
```

НЕ выполнять git pull без проверки

```
git status
```

и создания резервной ветки.

Всегда сначала читать существующие файлы, затем редактировать.

Не переписывать файлы полностью без необходимости.

```
cat файл
```

перед изменением обязателен.

---

# Итог

Структура сервера полностью определена.

Определены:

- расположение проекта
- расположение docker compose
- схема деплоя
- последовательность обновления
- последовательность диагностики
- состояние Git
- последовательность сборки
- последовательность запуска

Повторная диагностика сервера в следующих чатах больше не требуется, если структура не изменится.
