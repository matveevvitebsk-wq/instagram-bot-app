# Таблица входов пользователя

> 2026-09-05 cursor store device and OS types on each user login

## Результат

При входе в Mini App через Telegram backend записывает тип оборудования и
операционную систему в отдельную таблицу `user_login_devices`.

Такой таблицы раньше не было. `events` хранит произвольные события аналитики и
не считает входы по устройству.

## Структура

| Поле | Назначение |
| --- | --- |
| `owner_id` | Пользователь из `customer_profiles`. |
| `telegram_id` | Telegram ID пользователя. |
| `device_kind` | Тип оборудования: `phone`, `tablet`, `computer`. |
| `os_type` | Тип системы: `ios`, `android`, `windows`, `macos`, `linux`, `unknown`. |
| `telegram_platform` | Значение `Telegram.WebApp.platform`. |
| `login_count` | Сколько раз пользователь входил с этой пары устройство + система. |
| `first_login_at` | Первый вход с этой пары. |
| `last_login_at` | Последний вход с этой пары. |

Уникальность: `(owner_id, device_kind, os_type)`. Повторный вход увеличивает
`login_count` и обновляет `last_login_at`.

Общее число входов пользователя:

```sql
select owner_id, sum(login_count) as total_logins
from user_login_devices
group by owner_id;
```

## Когда пишется запись

`POST /api/auth/telegram` после успешной проверки `initData`. Frontend передаёт
`device_kind`, `os_type` и `telegram_platform`, определённые
`detectDevice()`.

Ошибка записи не блокирует выдачу JWT.

RLS включён, политик для `anon` и `authenticated` нет: таблицу пишет только
backend через service-role. Это ожидаемое INFO-предупреждение линтера
Supabase, а не открытый доступ.

## Файлы

| Файл | Назначение |
| --- | --- |
| `backend/migrations/20260905_add_user_login_devices.sql` | Миграция таблицы и функции. |
| `backend/app/services/login_devices.py` | Нормализация и вызов RPC. |
| `backend/app/api/auth.py` | Запись при входе. |
| `frontend/src/store/authStore.ts` | Отправка типа устройства при логине. |
