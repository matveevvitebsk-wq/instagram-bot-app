# Проверка Instagram перед регистрацией аккаунта

> 2026-09-05 cursor require Instagram app login and business account before OAuth

## Результат

Перед подключением Instagram Mini App больше не запускает OAuth сразу.
Сначала пользователь видит сообщение:

> Сначала зарегистрируйтесь или войдите в Instagram приложение и ваш аккаунт должен быть бизнес-аккаунтом.

Затем Mini App пытается открыть приложение Instagram на смартфоне. Если
приложение не установлено, открывается магазин: App Store на iOS или Google
Play на Android.

После возврата в Mini App продолжается обычное подключение через Instagram
Login.

## Почему это не системная проверка пакета

Telegram Mini App работает в WebView и не может спросить у Android или iOS,
установлен ли `com.instagram.android`. Поэтому проверка такая:

1. по нажатию кнопки открывается deep link `instagram://app` или Android
   `intent://` с пакетом Instagram;
2. если Mini App уходит в фон, приложение считается установленным;
3. если через 1.6 секунды Mini App остаётся на экране, открывается магазин.

На десктопе и в веб-версии Telegram открывается страница входа Instagram.

## Где срабатывает

- кнопка «Войти в существующий» на странице «Настройки»;
- запуск Mini App с `start_param=ig_auth`.

Сообщение также показано в карточке подключения на странице «Настройки» и в
баннере на главной.

## Основные файлы

| Файл | Назначение |
| --- | --- |
| `frontend/src/utils/instagramApp.ts` | Deep link, магазин и ожидание возврата. |
| `frontend/src/components/InstagramPrerequisiteDialog.tsx` | Диалог с сообщением и кнопкой «Открыть Instagram». |
| `frontend/src/pages/Settings.tsx` | Запуск проверки перед OAuth. |
| `frontend/src/App.tsx` | Та же проверка для `start_param=ig_auth`. |

OAuth и сохранение токена не менялись: после возврата пользователя по-прежнему
используются `/api/instagram/meta/url` и callback Instagram Login.
