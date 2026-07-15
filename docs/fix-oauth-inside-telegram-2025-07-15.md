# Исправление: OAuth Instagram внутри Telegram (15.07.2026)

## Проблема

При нажатии "Подключить Instagram" в Telegram Mini App ссылка открывалась в **системном браузере** (Chrome/Safari), а не внутри Telegram. Пользователь покидал приложение.

### Почему так происходило

1. **`try_browser: 'internal'` — неофициальный параметр.** Telegram Mini App API его игнорирует. Telegram сам решает, где открыть ссылку, и в новых версиях (8.0+) по умолчанию открывает системный браузер.

2. **`try_browser: 'external'` — официальный параметр**, но он намеренно открывает системный браузер (это его задача).

3. **Старый код на ПК** пытался создать deep link `"https://t.me" + stateParam` — это битая ссылка, state от Instagram не является путём в Telegram.

## Решение: Server-side OAuth через прокси-страницу

Создана HTML-страница на **том же домене** (`api.almarathon.com`), которая открывается во **встроенном браузере Telegram** (in-app). Вся OAuth-цепочка происходит внутри Telegram.

### Как это работает

```
Mini App → кнопка "Подключить Instagram"
  → openLink("https://api.almarathon.com/api/auth/meta/start-page?initData=...")
  → Telegram открывает во встроенном браузере (in-app) — НЕ покидаем Telegram
  → Бэкенд проверяет аккаунт в БД по initData:
      ├─ ЕСТЬ в БД → показывает "Уже подключено @username" с кнопкой "Вернуться"
      └─ НЕТ в БД → редирект на Instagram OAuth
           → Instagram редиректит на /api/auth/meta/callback (тот же домен)
           → Сохраняем токены в Supabase
           → Показываем HTML "Instagram подключён @username" с кнопкой "Вернуться"
  → Пользователь нажимает "Вернуться" → вкладка закрывается → он в Telegram
```

### Ключевые моменты

- **initData** передаётся через URL-параметр, чтобы страница могла идентифицировать пользователя без Telegram WebView API
- **Callback** отдаёт HTML-страницу вместо редиректа на внешний домен (`almarathon.com/settings`)
- Если аккаунт **уже есть в БД** — Instagram даже не открывается, сразу "Уже подключено"

---

## Изменённые файлы

### 1. `frontend/src/hooks/useTelegram.ts`

**Что изменено:** Функция `openLink`

**Было (проблема):**

```ts
// try_browser: 'internal' — неофициальный параметр, игнорируется Telegram
webApp.openLink(url, {
  try_instant_view: false,
  try_browser: 'internal',
});
```

**Стало (исправление):**

```ts
// Без try_browser — Telegram сам открывает во встроенном браузере (in-app)
webApp.openLink(url, { try_instant_view: false });
```

**Почему:** Параметр `try_browser: 'internal'` не существует в официальном API Telegram. Он игнорируется, и Telegram открывает ссылку по умолчанию (в новых версиях — системный браузер). Без этого параметра на мобильных устройствах Telegram открывает ссылку во встроенном браузере.

---

### 2. `frontend/src/pages/Settings.tsx`

**Что изменено:** Функция `handleConnect`

**Было (проблема):**

```ts
const handleConnect = async () => {
  setConnecting(true);
  const res = await api.get('/api/auth/meta/url');
  openLink(res.data.url); // ← открывает URL Instagram напрямую
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

**Почему:** Вместо прямого открытия Instagram OAuth URL, теперь открывается прокси-страница на `api.almarathon.com`. Она:

1. Проверяет наличие аккаунта в БД
2. Если есть — показывает "Уже подключено" (Instagram не открывается)
3. Если нет — редиректит на Instagram OAuth

Также добавлен `initData` из хука `useTelegram()` для идентификации пользователя на прокси-странице.

---

### 3. `backend/app/api/meta_oauth.py`

#### 3.1. Новый эндпоинт `/start-page`

**Добавлен:** `GET /api/auth/meta/start-page`

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

Редирект на внешний домен (`almarathon.com`) выкидывал пользователя из встроенного браузера Telegram в системный браузер.

**Стало (исправление):**

```python
return HTMLResponse(content=f"""...""", status_code=200)
```

Отдаёт HTML-страницу "Instagram подключён @username" с кнопкой "Вернуться в Telegram". Пользователь остаётся во встроенном браузере Telegram.

#### 3.3. Восстановлен эндпоинт `/url` (обратная совместимость)

**Восстановлен:** `GET /api/auth/meta/url`

**Почему:** Старый фронтенд (сборка на production) всё ещё вызывает этот эндпоинт. Удаление ломало старый фронт (404). Оставлен для обратной совместимости, помечен как `[DEPRECATED]`.

---

## Как это работает после исправления

### Сценарий 1: Аккаунт уже подключён

```
Пользователь → кнопка "Подключить Instagram"
  → openLink("https://api.almarathon.com/api/auth/meta/start-page?initData=...")
  → Встроенный браузер Telegram
  → Бэкенд: аккаунт ЕСТЬ в БД
  → HTML: "✅ Instagram подключён @username. Уже подключён к сервису."
  → Кнопка "Вернуться в Telegram" → пользователь в Mini App
```

### Сценарий 2: Аккаунта нет (первое подключение)

```
Пользователь → кнопка "Подключить Instagram"
  → openLink("https://api.almarathon.com/api/auth/meta/start-page?initData=...")
  → Встроенный браузер Telegram
  → Бэкенд: аккаунта НЕТ → редирект на Instagram OAuth
  → Пользователь авторизуется в Instagram
  → Instagram редиректит на /api/auth/meta/callback
  → Бэкенд сохраняет токены в Supabase
  → HTML: "✅ Instagram подключён @username. Успешно подключён."
  → Кнопка "Вернуться в Telegram" → пользователь в Mini App
```

### Сценарий 3: Ошибка (не удалось определить пользователя)

```
Пользователь → кнопка "Подключить Instagram"
  → openLink("https://api.almarathon.com/api/auth/meta/start-page?initData=...")
  → Встроенный браузер Telegram
  → Бэкенд: initData невалидный или отсутствует
  → HTML: "❌ Ошибка авторизации. Откройте через Telegram Mini App."
```

---

## Что нужно сделать для вступления в силу

1. **Перезапустить бэкенд** на сервере (чтобы применить изменения в `meta_oauth.py`)
2. **Собрать и задеплоить новый фронтенд** (чтобы применить изменения в `Settings.tsx` и `useTelegram.ts`)

После деплоя нового фронтенда старый эндпоинт `/url` можно будет удалить.
