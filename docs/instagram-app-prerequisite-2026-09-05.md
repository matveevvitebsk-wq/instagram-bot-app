# Проверка Instagram перед регистрацией аккаунта

> 2026-09-05 cursor require Instagram app login and business account before OAuth
>
> 2026-09-05 cursor detect phone, tablet and computer OS before opening Instagram

## Результат

Перед подключением Instagram Mini App больше не запускает OAuth сразу.
Сначала пользователь видит сообщение:

> Сначала зарегистрируйтесь или войдите в Instagram приложение и ваш аккаунт должен быть бизнес-аккаунтом.

Дальше действие зависит от устройства и системы.

## Как определяется оборудование

Mini App не получает модель телефона из системы. Используется сочетание:

1. `Telegram.WebApp.platform` — `ios`, `android`, `android_x`, `macos`,
   `tdesktop`, `weba`, `webk`;
2. `navigator.userAgent` — Windows, macOS, Linux, iPhone, iPad, Android;
3. `navigator.maxTouchPoints` — чтобы отличить iPad, который часто маскируется
   под Macintosh.

| Устройство | Система | Что открывается |
| --- | --- | --- |
| Смартфон | iOS / Apple | Приложение Instagram, иначе App Store |
| Планшет | iPadOS / Apple | Приложение Instagram, иначе App Store |
| Смартфон | Android | Приложение Instagram через `intent://`, иначе Google Play |
| Планшет | Android | Приложение Instagram через `intent://`, иначе Google Play |
| Компьютер | Windows | Браузер или Microsoft Store |
| Компьютер | macOS / Apple | Браузер Instagram |
| Компьютер | Linux | Браузер Instagram |
| Неизвестно | — | Браузер Instagram |

На компьютере нельзя надёжно открыть мобильное приложение Instagram. Поэтому
показывается подсказка использовать смартфон или планшет.

## Почему это не системная проверка пакета

Telegram Mini App работает в WebView и не может спросить у Android или iOS,
установлен ли `com.instagram.android`. Поэтому на телефоне и планшете проверка
такая:

1. по нажатию кнопки открывается deep link `instagram://app` или Android
   `intent://` с пакетом Instagram;
2. если Mini App уходит в фон, приложение считается установленным;
3. если через 1.6 секунды Mini App остаётся на экране, открывается магазин
   этой системы.

## Где срабатывает

- кнопка «Войти в существующий» на странице «Настройки»;
- запуск Mini App с `start_param=ig_auth`.

Сообщение также показано в карточке подключения на странице «Настройки» и в
баннере на главной.

## Основные файлы

| Файл | Назначение |
| --- | --- |
| `frontend/src/utils/deviceProfile.ts` | Тип устройства и ОС. |
| `frontend/src/utils/instagramApp.ts` | Deep link, магазин и ожидание возврата. |
| `frontend/src/components/InstagramPrerequisiteDialog.tsx` | Диалог с сообщением и кнопкой «Открыть Instagram». |
| `frontend/src/pages/Settings.tsx` | Запуск проверки перед OAuth. |
| `frontend/src/App.tsx` | Та же проверка для `start_param=ig_auth`. |

OAuth и сохранение токена не менялись: после возврата пользователя по-прежнему
используются `/api/instagram/meta/url` и callback Instagram Login.
