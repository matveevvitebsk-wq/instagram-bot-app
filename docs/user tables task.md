# User and Instagram account tables

> 2026-09-01 cursor clarify Instagram profile fields and avatar URL refresh
>
> 2026-09-05 cursor require Instagram app login and business account before OAuth
>
> 2026-09-05 cursor detect phone, tablet and computer OS before opening Instagram

The table is named `ig_accounts`, not `ig_accountts`.

## customer_profiles

Represents a MediaHave/Telegram user.

It stores:

Telegram ID, username, first/last name, and avatar
Subscription status
General profile information
Connection status
Legacy Instagram connection fields
Its ID is used as owner_id in tasks, leads, Instagram accounts, funnels, analytics, and events.

## ig_accounts

Represents an Instagram Business or Creator account connected via OAuth.

It stores:

Instagram username and display name
Instagram account/page identifiers
Profile image and follower count
OAuth access token and expiration
Active/disconnected status
Connection mode
Each row is associated with a customer_profiles row via owner_id.

In short:

customer_profiles = Telegram/MediaHave user
ig_accounts = Instagram account connected by that user
A single customer profile can own multiple Instagram accounts. ig_accounts should be the canonical location for Instagram credentials and account details.

Before OAuth, the Mini App asks the user to open the Instagram app and log in
with a Business or Creator account. See
[`instagram-app-prerequisite-2026-09-05.md`](instagram-app-prerequisite-2026-09-05.md).

The `profile_picture_url` value is a Meta CDN URL and may expire. The backend
refreshes `username`, `display_name`, and `profile_picture_url` through the
Instagram Graph API when `GET /api/accounts/` loads the active account.

---

# Таблицы пользователя и Instagram-аккаунта

Таблица называется `ig_accounts`, а не `ig_accountts`.

## customer_profiles

Представляет пользователя MediaHave/Telegram.

В ней хранятся:

ID в Telegram, имя пользователя, имя и фамилия, а также аватар
Статус подписки
Общая информация о профиле
Статус подключения
Поля подключения к устаревшей версии Instagram
Её ID используется в качестве owner_id в задачах, лидах, аккаунтах Instagram, воронках, аналитике и событиях.

## ig_accounts

Представляет аккаунт Instagram Business или Creator, подключённый через OAuth.

В нём хранятся:

Имя пользователя и отображаемое имя в Instagram
Идентификаторы аккаунта/страницы в Instagram
Изображение профиля и количество подписчиков
Токен доступа OAuth и срок его действия
Статус «активен»/«отключён»
Режим подключения
Каждая строка связана со строкой в таблице customer_profiles через owner_id.

Вкратце:

customer_profiles = пользователь Telegram/MediaHave
ig_accounts = аккаунт в Instagram, подключенный этим пользователем
Один профиль клиента может владеть несколькими аккаунтами в Instagram. ig_accounts должен быть каноническим хранилищем учетных данных и сведений об аккаунтах в Instagram.

Перед OAuth Mini App просит открыть приложение Instagram и войти в
бизнес-аккаунт. См.
[`instagram-app-prerequisite-2026-09-05.md`](instagram-app-prerequisite-2026-09-05.md).

`profile_picture_url` содержит URL Meta CDN, который может устаревать. При
загрузке активного аккаунта через `GET /api/accounts/` backend получает у
Instagram актуальные `username`, `display_name` и `profile_picture_url`, затем
обновляет строку `ig_accounts`. Токен доступа во frontend не возвращается.
