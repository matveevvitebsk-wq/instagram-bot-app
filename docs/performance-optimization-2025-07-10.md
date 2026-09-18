# Оптимизация производительности — 10.07.2026

## Проблема

Высокая загрузка CPU на сервере DigitalOcean. Причина — избыточные запросы от фронтенда к бэкенду, отсутствие кэширования, отсутствие ограничений ресурсов контейнеров.

---

## 1. Polling → Supabase Realtime (главная причина)

### Было

`frontend/src/pages/Tasks.tsx` — каждые 10 секунд отправлял запрос `GET /api/tasks/` на бэкенд, который шёл в Supabase. При нескольких пользователях — 60–120 запросов в минуту.

### Стало

Подписка на изменения через WebSocket Supabase Realtime. Обновления приходят **только когда задача реально меняется**. Ноль лишних запросов в простое.

### Затронутые файлы

**Создан:** `frontend/src/utils/supabase.ts`

```typescript
import { createClient } from '@supabase/supabase-js';
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);
```

Supabase клиент для браузера. Использует anon key (безопасно для публичного клиента).

**Изменён:** `frontend/src/pages/Tasks.tsx`

```typescript
// Было:
const interval = setInterval(fetchTasks, 10000); // каждые 10 секунд
return () => clearInterval(interval);

// Стало:
const channel = supabase
  .channel('tasks-changes')
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'automation_tasks' },
    () => fetchTasks(),
  )
  .subscribe();
return () => {
  supabase.removeChannel(channel);
};
```

Замена постоянного опроса на подписку Realtime.

**Создан:** `frontend/.env`

```
VITE_SUPABASE_URL=https://belqsqksiibgqbgzohvo.supabase.co
VITE_SUPABASE_ANON_KEY=***
```

Переменные окружения для Supabase клиента на фронтенде.

### Взаимосвязь

```
Пользователь открывает страницу "Задачи"
  → Tasks.tsx mount
    → supabase.channel('tasks-changes').subscribe()
      → WebSocket соединение с Supabase
        → Ждёт изменений в таблице automation_tasks
          → N8n завершает задачу → callback → UPDATE в Supabase
            → Realtime пушит событие на фронтенд
              → fetchTasks() обновляет UI
```

---

## 2. Rate Limiter (защита от флуда)

### Было

Любой клиент мог отправить неограниченное количество запросов к API.

### Стало

Не более 120 запросов в минуту с одного IP. При превышении — HTTP 429.

### Затронутые файлы

**Создан:** `backend/app/core/rate_limit.py`

```python
class RateLimitMiddleware(BaseHTTPMiddleware):
    """Ограничивает количество запросов с одного IP в минуту."""
    def __init__(self, app, requests_per_minute: int = 60):
        self.history: dict[str, list[float]] = defaultdict(list)
    async def dispatch(self, request: Request, call_next):
        # проверка лимита...
```

In-memory rate limiter. Хранит временные метки запросов для каждого IP.

**Изменён:** `backend/app/main.py`

```python
from app.core.rate_limit import RateLimitMiddleware
# ...
app.add_middleware(RateLimitMiddleware, requests_per_minute=120)
```

Подключение rate limiter к FastAPI приложению.

### Взаимосвязь

```
Любой HTTP запрос → FastAPI
  → RateLimitMiddleware проверяет IP и историю запросов
    → Если >120 запросов за минуту → 429 Too Many Requests
    → Иначе → запрос проходит дальше к роутеру
```

---

## 3. In-memory кэширование

### Было

Каждый запрос к аналитике и списку аккаунтов шёл напрямую в Supabase, даже если данные не изменились.

### Стало

Результаты кэшируются на 30 секунд в памяти бэкенда. Повторные запросы отдают кэш без обращения к Supabase.

### Затронутые файлы

**Создан:** `backend/app/core/cache.py`

```python
class TTLCache:
    """In-memory кэш с TTL. Ключ = имя функции + аргументы."""
    def get(self, key): ...
    def set(self, key, value): ...
    def invalidate(self, key): ...

def cached(ttl: int = 30):
    """Декоратор для кэширования результатов асинхронных функций."""
```

Универсальный декоратор для кэширования.

**Изменён:** `backend/app/api/analytics.py`

```python
from app.core.cache import cached

@router.get("/dashboard")
@cached(ttl=30)  # <-- добавлено
async def get_dashboard(current_user):
    ...
```

Кэширование дашборда — самого частого запроса.

**Изменён:** `backend/app/api/accounts.py`

```python
from app.core.cache import cached

@router.get("/")
@cached(ttl=30)  # <-- добавлено
async def list_accounts(current_user):
    ...
```

Кэширование списка аккаунтов — запрашивается в Settings и Funnels.

### Взаимосвязь

```
Пользователь открывает Dashboard
  → GET /api/analytics/dashboard
    → cached проверяет кэш по ключу "get_dashboard:(user_id)"
      → Если есть и не истёк 30с → вернуть кэшированный результат
      → Если нет → запрос в Supabase → сохранить в кэш → вернуть
```

---

## 4. Resource Limits в Docker

### Было

Контейнеры могли использовать неограниченно CPU и память. n8n (Node.js) мог "задушить" backend при выполнении воркфлоу.

### Стало

Каждый сервис ограничен:

| Сервис  | CPU  | Memory |
| ------- | ---- | ------ |
| n8n     | 0.5  | 512MB  |
| backend | 0.5  | 256MB  |
| nginx   | 0.25 | 128MB  |

### Затронутые файлы

**Изменён:** `docker-compose.yml`

```yaml
n8n:
  deploy:
    resources:
      limits:
        cpus: '0.5'
        memory: 512M
backend:
  deploy:
    resources:
      limits:
        cpus: '0.5'
        memory: 256M
nginx:
  deploy:
    resources:
      limits:
        cpus: '0.25'
        memory: 128M
```

### Взаимосвязь

```
Docker Compose запускает 3 контейнера
  → Каждый контейнер имеет жёсткий лимит CPU и памяти
    → Ни один сервис не может занять все ресурсы дроплета
    → n8n выполняет воркфлоу но не выходит за 0.5 CPU
    → Backend всегда получает свою долю CPU
```

---

## 5. Workers Reduction

### Было

`CMD ["uvicorn", ..., "--workers", "2"]` — 2 воркера на 1 vCPU. Создавало лишние переключения контекста.

### Стало

Один воркер — оптимально для async Python на маленьком дроплете.

### Затронутые файлы

**Изменён:** `backend/Dockerfile`

```dockerfile
# Было:
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]

# Стало:
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
```

### Взаимосвязь

```
1 vCPU дроплет
  → 2 workers = конкурентное переключение между процессами
    → Потери на context switch 15-20%
  → 1 worker + async/await
    → FastAPI обрабатывает запросы асинхронно
    → Нет лишних переключений → больше полезной работы
```

---

## Сводка изменений

| #   | Файл                             | Тип        | Суть                              |
| --- | -------------------------------- | ---------- | --------------------------------- |
| 1   | `frontend/src/utils/supabase.ts` | ✅ Создан  | Supabase клиент для Realtime      |
| 2   | `frontend/src/pages/Tasks.tsx`   | 🔄 Изменён | Polling → WebSocket подписка      |
| 3   | `frontend/.env`                  | ✅ Создан  | Переменные для Supabase           |
| 4   | `backend/app/core/rate_limit.py` | ✅ Создан  | Rate limiter middleware           |
| 5   | `backend/app/main.py`            | 🔄 Изменён | Подключён rate limiter            |
| 6   | `backend/app/core/cache.py`      | ✅ Создан  | TTL кэш с декоратором             |
| 7   | `backend/app/api/analytics.py`   | 🔄 Изменён | Кэш для дашборда                  |
| 8   | `backend/app/api/accounts.py`    | 🔄 Изменён | Кэш для списка аккаунтов          |
| 9   | `docker-compose.yml`             | 🔄 Изменён | Resource limits для всех сервисов |
| 10  | `backend/Dockerfile`             | 🔄 Изменён | Workers: 2 → 1                    |

## Ожидаемый эффект

До оптимизации:

```
Пользователь открывает Tasks → каждые 10с запрос к /api/tasks/ → Supabase
  → 10 пользователей = 60 запросов/мин
    → CPU: 40-60% на обработку HTTP + SQL
```

После оптимизации:

```
Пользователь открывает Tasks → WebSocket подписка → 0 запросов/мин в простое
  → Только при изменении задачи → 1 запрос
    → CPU: 5-10% в простое
```

## После деплоя

```bash
# Пересобрать и запустить
docker compose down
docker compose build backend
docker compose up -d
```
