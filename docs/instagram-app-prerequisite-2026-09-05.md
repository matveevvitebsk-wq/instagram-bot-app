# Проверка Instagram перед регистрацией аккаунта

> 2026-09-05 cursor require Instagram app login and business account before OAuth
>
> 2026-09-05 cursor detect phone, tablet and computer OS before opening Instagram
>
> 2026-09-05 cursor launch Instagram app instead of navigating Mini App away

## Почему была ошибка «Не удалось загрузить MediaHave-bot»

Mini App живёт внутри WebView Telegram. Код заменял страницу MediaHave через
`window.location.assign` на `instagram://`, `intent://`, магазин или OAuth URL.
Telegram воспринимал это как выгрузку Mini App и показывал:

> Ошибка. Не удалось загрузить MediaHave-bot.

Магазин, сайт Instagram и несуществующий
`/api/instagram/meta/start-page` тоже уводили WebView со страницы приложения.

## Как должно работать

Нужно не открывать браузер или магазин, а запустить приложение Instagram.
Вход в Instagram пользователь делает сам. MediaHave при этом остаётся
запущенным.

1. показать сообщение про бизнес-аккаунт;
2. по кнопке «Запустить Instagram» вызвать `instagram://app` через
   `window.open` или скрытый iframe;
3. не вызывать `window.location.assign`;
4. не открывать App Store, Google Play и instagram.com;
5. не запускать OAuth сразу после запуска Instagram.

Подключение MediaHave к Instagram — отдельная кнопка «Подключить аккаунт».
Она открывает OAuth через `Telegram.WebApp.openLink`, не заменяя Mini App.

## Как определяется оборудование

Mini App не получает модель телефона из системы. Используется сочетание:

1. `Telegram.WebApp.platform` — `ios`, `android`, `android_x`, `macos`,
   `tdesktop`, `weba`, `webk`;
2. `navigator.userAgent` — Windows, macOS, Linux, iPhone, iPad, Android;
3. `navigator.maxTouchPoints` — чтобы отличить iPad, который часто маскируется
   под Macintosh.

| Устройство | Система | Действие |
| --- | --- | --- |
| Смартфон / планшет | iOS или Android | Запускается приложение Instagram |
| Компьютер | Windows, macOS, Linux | Показывается подсказка запустить Instagram на телефоне |

## Основные файлы

| Файл | Назначение |
| --- | --- |
| `frontend/src/utils/instagramApp.ts` | Запуск Instagram без ухода со страницы Mini App. |
| `frontend/src/components/InstagramPrerequisiteDialog.tsx` | Сообщение и кнопка «Запустить Instagram». |
| `frontend/src/pages/Settings.tsx` | Запуск Instagram и отдельное подключение аккаунта. |
