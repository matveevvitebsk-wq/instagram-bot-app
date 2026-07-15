# Исправление: OAuth Instagram внутри Telegram (15.07.2026)

## Проблема

При нажатии "Подключить Instagram" в Telegram Mini App ссылка открывалась в **системном браузере** (Chrome/Safari), а не внутри Telegram. Пользователь покидал приложение.

### Почему так происходило

1. **`try_browser: 'internal'` — неофициальный параметр.** Telegram Mini App API его игнорирует. Telegram сам решает, где открыть ссылку, и в новых версиях (8.0+) по умолчанию открывает системный браузер.

2. **`try_browser: 'external'` — официальный параметр**, но он намеренно открывает системный браузер (это его задача).

3. **Старый код на ПК** пытался создать deep link `"https://t.me" + stateParam` — это битая ссылка, state от Instagram не является путём в Telegram.

4. **Старый фронтенд на production** вызывает `GET /api/auth/meta/url`, получает URL Instagram и открывает его через `openLink()`. Это всегда открывает системный браузер.

## Решение: Server-side OAuth через прокси-страницу

Создана HTML-страница на **том же домене** (`api.almarathon.com`), которая открывается во **встроенном браузере Telegram** (in-app). Вся OAuth-цепочка происходит внутри Telegram.

### Как это работает

```
Mini App → кнопка "Подключить Instagram"
  → openLink("https://api.almarathon.com/api/auth/meta/start-page?initData=...")
  → Telegram открывает во встроенном браузере (in-app) — НЕ покидаем Telegram

  → [прокси-страница /start-page]
  → Бэкенд проверяет аккаунт в БД по initData:

      ├─ ЕСТЬ в БД → HTML "✅ Instagram подключён @username"
      │               Кнопка "Вернуться в Telegram"
      │
      └─ НЕТ в БД → редирект на Instagram OAuth
                      ↓
           Instagram показывает окно подтверждения:
           "Ранее вы подключили приложение n8n-call-api-IG
            к аккаунту Instagram. Хотите продолжить?"
                      ↓
           Пользователь нажимает "Разрешить"
                      ↓
           Instagram редиректит на /api/auth/meta/callback (тот же домен)
                      ↓
           Бэкенд: code → short-lived token → long-lived token (60 дней)
                  Получает данные аккаунта (username, followers, etc.)
                  Сохраняет в Supabase (таблица ig_accounts)
                      ↓
           HTML "✅ Instagram подключён @username"
           Кнопка "Вернуться в Telegram"

  → Пользователь нажимает "Вернуться"
  → Вкладка встроенного браузера закрывается
  → Пользователь снова в Telegram Mini App
  → Функции приложения разблокированы
```

### Ключевые моменты

- **initData** передаётся через URL-параметр, чтобы страница могла идентифицировать пользователя без Telegram WebView API
- **Callback** отдаёт HTML-страницу вместо редиректа на внешний домен (`almarathon.com/settings`)
- Если аккаунт **уже есть в БД** — Instagram даже не открывается, сразу "Уже подключено"
- **Токены обновляются** (short-lived → long-lived 60 дней) на бэкенде, пользователь этого не видит
- **Изменения вступают в силу только после деплоя** на сервер

---

## Изменённые файлы (3 шт.)

### 1. `frontend/src/hooks/useTelegram.ts`

**Что изменено:** Функция `openLink`

**Было (проблема):**

```ts
webApp.openLink(url, {
  try_instant_view: false,
  try_browser: 'internal', // ← неофициальный параметр, игнорируется
});
```

**Стало (исправление):**

```ts
webApp.openLink(url, { try_instant_view: false });
// Без try_browser — Telegram сам открывает во встроенном браузере (in-app)
```

**Почему:** Параметр `try_browser: 'internal'` не существует в официальном API Telegram. Он игнорируется. Без него на мобильных Telegram открывает ссылку во встроенном браузере.

---

### 2. `frontend/src/pages/Settings.tsx`

**Что изменено:** Функция `handleConnect`

**Было (проблема):**

```ts
const handleConnect = async () => {
  setConnecting(true);
  const res = await api.get('/api/auth/meta/url');
  openLink(res.data.url); // ← открывает URL Instagram напрямую → системный браузер
};
```

**Стало (исправление):**

```ts
const handleConnect = () => {
  setConnecting(true);
  const encodedInitData = encodeURIComponent(initData || '');
  const startPageUrl = `${
    import.meta.env.VITE_API_URL || 'https://api.almarathon.com'
  }/api/auth/meta/start-page?initData=${encodedInitData}`;
  openLink(startPageUrl); // ← открывает прокси-страницу на том же домене
};
```

**Почему:** Вместо прямого URL Instagram открывается прокси-страница на `api.almarathon.com`. Она:

1. Проверяет наличие аккаунта в БД по initData
2. Если есть — показывает "Уже подключено" (Instagram не открывается)
3. Если нет — редиректит на Instagram OAuth

Также добавлен `initData` из хука `useTelegram()` для идентификации пользователя на прокси-странице.

---

### 3. `backend/app/api/meta_oauth.py`

#### 3.1. Добавлен эндпоинт `/start-page`

**`GET /api/auth/meta/start-page`**

**Параметры:** `initData` (query) — Telegram initData для идентификации пользователя

**Логика:**

1. Парсит `initData`, извлекает `telegram_id`
2. Проверяет в Supabase, есть ли активный Instagram аккаунт у этого пользователя
3. **Если есть** — отдаёт HTML-страницу "Уже подключено @username" с кнопкой "Вернуться в Telegram"
4. **Если нет** — редиректит на Instagram OAuth URL
5. **Если не удалось определить пользователя** — отдаёт HTML-страницу с ошибкой

#### 3.2. Изменён callback `/callback`

**Было (проблема):**

```python
return RedirectResponse(
    f"https://almarathon.com/settings?instagram=connected&username=..."
)
```

Редирект на внешний домен (`almarathon.com`) выкидывает из встроенного браузера Telegram в системный.

**Стало (исправление):**

```python
return HTMLResponse(content=f"""...""", status_code=200)
```

Отдаёт HTML-страницу "Instagram подключён @username" с кнопкой "Вернуться в Telegram". Пользователь остаётся во встроенном браузере Telegram.

#### 3.3. Восстановлен эндпоинт `/url` (обратная совместимость)

**`GET /api/auth/meta/url`** — восстановлен, помечен `[DEPRECATED]`.

**Почему:** Старый фронтенд (сборка на production) вызывает этот эндпоинт. Удаление ломало старый фронт (404 на production). Оставлен для обратной совместимости, пока новый фронт не задеплоен.

---

## Как это работает после исправления

### Сценарий 1: Аккаунт уже подключён (есть в БД)

```
Пользователь → кнопка "Подключить Instagram"
  → openLink(".../start-page?initData=...")
  → Встроенный браузер Telegram
  → Бэкенд: аккаунт ЕСТЬ в БД
  → HTML: "✅ Instagram подключён @username. Уже подключён к сервису."
  → Кнопка "Вернуться в Telegram" → пользователь в Mini App
```

### Сценарий 2: Аккаунта нет (первое подключение)

```
Пользователь → кнопка "Подключить Instagram"
  → openLink(".../start-page?initData=...")
  → Встроенный браузер Telegram
  → Бэкенд: аккаунта НЕТ → редирект на Instagram OAuth
  → Instagram: "Ранее вы подключили приложение n8n-call-api-IG
                к аккаунту Instagram. Хотите продолжить?"
  → Пользователь → "Разрешить"
  → Instagram → редирект на /api/auth/meta/callback
  → Бэкенд: обмен токенов, получение данных, сохранение в Supabase
  → HTML: "✅ Instagram подключён @username. Успешно подключён."
  → Кнопка "Вернуться в Telegram" → пользователь в Mini App
  → Функции приложения разблокированы
```

### Сценарий 3: Ошибка (не удалось определить пользователя)

```
Пользователь → кнопка "Подключить Instagram"
  → openLink(".../start-page?initData=...")
  → Встроенный браузер Telegram
  → Бэкенд: initData невалидный или отсутствует
  → HTML: "❌ Ошибка авторизации. Откройте через Telegram Mini App."
```

---

## Деплой на сервер

**ВНИМАНИЕ:** Изменения вступают в силу **только после деплоя**. Пока код не задеплоен — на production работает старая версия, и ссылка открывается в браузере.

### Команды для деплоя (вводить на сервере)

```bash
# 1. Запушить локальные изменения на GitHub (если ещё не сделано)
git add .
git commit -m "fix: OAuth Instagram внутри Telegram (server-side OAuth)"
git push origin main

# 2. На сервере — получить изменения
git pull origin main

# 3. Полностью остановить проект
docker compose down

# 4. Пересобрать backend без кэша
docker build --no-cache -t instagram-bot-app-backend ./backend

# 5. Пересобрать frontend без кэша
docker build --no-cache -t instagram-bot-app-frontend ./frontend

# 6. Пересоздать все контейнеры
docker compose up -d --force-recreate

# 7. Проверить состояние контейнеров
docker compose ps
```

### Проверка после деплоя

1. Открыть в браузере: `https://api.almarathon.com/api/auth/meta/start-page?initData=test`
   — если виден HTML-дизайн с заголовком "Ошибка авторизации" — бэкенд обновлён

2. Открыть Telegram Mini App, нажать "Подключить Instagram"
   — ссылка должна открыться во встроенном браузере Telegram

### После деплоя нового фронтенда

Старый эндпоинт `/api/auth/meta/url` можно будет удалить (он больше не нужен).
