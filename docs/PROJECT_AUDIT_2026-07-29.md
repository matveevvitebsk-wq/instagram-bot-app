# Аудит проекта и production-инфраструктуры

Дата проверки: 29 июля 2026.  
Область: репозиторий `instagram-bot-app` и результаты команд, выполненных на DigitalOcean Droplet `n8n-server`. Секреты и их значения не включены.

## Вывод

Проект представляет собой Telegram Mini App для Instagram-автоматизации:

```text
Telegram WebApp → React/Vite (almarathon.com)
                         ↓ HTTPS API
                     FastAPI (api.almarathon.com)
                     ↙          ↘
             Supabase             n8n
                                      ↕
                               Meta / Instagram
```

На production используется один Droplet с двумя Docker Compose-проектами:

| Проект | Каталог | Сервисы |
|---|---|---|
| `instagram-bot-app` | `/opt/instagram-bot/instagram-bot-app` | `backend` (FastAPI), `nginx` (SPA) |
| `n8n-docker-caddy` | `/home/almat/n8n-docker-caddy` | `caddy`, `n8n` |

Caddy владеет портами 80/443 и маршрутизирует:

| Домен | Назначение |
|---|---|
| `almarathon.com` | `nginx:80` |
| `api.almarathon.com` | `backend:8000` |
| `n8n.almarathon.com` | `n8n:5678` |

Контейнеры соединены общей внешней сетью `instagram-bot-app_app-network`; у n8n есть отдельная `n8n-docker-caddy_n8n-network`.

## Подтверждённое состояние

- Backend запустился и его healthcheck вернул `200 OK`.
- `https://api.almarathon.com/health` отвечает `200` и сообщает `mode: development`.
- Главный сайт и n8n доступны через HTTPS.
- Caddy автоматически обслуживает TLS-сертификаты для всех трёх доменов.
- N8n и Caddy работали непрерывно 11 дней на момент проверки.
- Meta Developer настроен на `https://n8n.almarathon.com/webhook/fitnes-mary`; подписки включают `comments`, `messages`, реакции и другие события.
- Telegram Bot API возвращает пустой webhook URL: backend не получает обновления Telegram через `/api/webhooks/telegram`.

## Mary Fitness

`mary-fitness_14d7.json` — будущая часть проекта: n8n workflow обработки Instagram comments/DM.

Текущее состояние:

- workflow экспортирован, но не активен (`active: false`);
- Meta продолжает направлять запросы на `/webhook/fitnes-mary`;
- n8n логирует `unknown webhook`, поскольку неактивный workflow не регистрирует production endpoint.

Перед запуском:

1. Использовать актуальный экспорт workflow.
2. Перенести Meta access tokens и verify token из workflow JSON в n8n credentials либо переменные окружения.
3. Реализовать проверку `X-Hub-Signature-256`.
4. Активировать workflow.
5. Выполнить Meta Webhooks «Тестировать» для `comments` и проверить execution в n8n.

Callback URL и подписки Meta менять не требуется.

## Выявленные технические проблемы

### P0 — Meta endpoint в FastAPI возвращает 500

`GET /api/webhooks/meta` вернул `500 Internal Server Error`.

В `backend/app/core/config.py` поля объявлены в uppercase (`META_WEBHOOK_VERIFY_TOKEN`, `N8N_URL`), а `backend/app/api/webhooks.py` обращается к несуществующим lowercase-атрибутам:

- `settings.meta_webhook_verify_token`;
- `settings.n8n_base_url`.

В Pydantic эти обращения вызывают `AttributeError`. Необходимо унифицировать имена полей и обращения к ним, затем повторить верификацию Meta.

### P1 — не проверяются подписи входящих webhook

- FastAPI принимает Meta POST без проверки `X-Hub-Signature-256`.
- FastAPI Telegram endpoint не проверяет `X-Telegram-Bot-Api-Secret-Token`.
- Workflow Mary Fitness также не проверяет Meta signature.

Проверка подписи должна выполняться до обработки JSON и передавать в обработчик только аутентичные события.

### P1 — Telegram webhook не установлен

`getWebhookInfo` вернул `url: ""`. В коде есть endpoint `POST /api/webhooks/telegram`, но нет запуска polling и нет установки webhook.

Необходимо принять одно решение:

- установить Telegram webhook на `https://api.almarathon.com/api/webhooks/telegram` с secret token; или
- явно использовать отдельный polling/обработчик и документировать его.

### P2 — опубликован прямой порт n8n

Compose публикует `5678:5678` наружу. Это позволяет обходить Caddy. Следует проверить правила firewall; если прямой доступ не нужен, убрать публикацию порта и оставить n8n доступным только в Docker-сети и через Caddy.

### P2 — production-конфигурация неполна в Git

В репозитории нет Compose-конфигурации n8n/Caddy и нет экспортов workflow n8n. Полный production-стек нельзя воспроизвести из одной версии Git.

## Дополнительные наблюдения

- Ошибки `lookup backend` и `connection refused` в Caddy относятся к периоду пересоздания backend-контейнера. После запуска `/health` отвечает успешно.
- В репозитории отсутствуют автоматические тесты и CI/CD; развёртывание производится вручную.
- `.env.example` и экспорт workflow нельзя хранить с реальными секретами. Значения, уже оказавшиеся в файлах или переписке, следует перевыпустить.

## Рекомендуемый порядок работ

1. Исправить конфигурационные обращения FastAPI и добавить тесты webhook endpoint.
2. Внедрить проверку подписей Meta/Telegram.
3. Выбрать и документировать единственный путь доставки Meta-событий: напрямую в n8n либо через FastAPI.
4. Подготовить Mary Fitness к безопасной активации.
5. Версионировать обезличенную инфраструктурную конфигурацию и workflow export без секретов.
6. Ограничить сетевой доступ к n8n.
