/// <reference types="vite/client" />

declare module "*.css" {
    const content: string;
    export default content;
}

// Telegram WebApp типы
interface TelegramWebApp {
    initData: string;
    version: string;
    initDataUnsafe: {
        user?: {
            id: number;
            first_name: string;
            last_name?: string;
            username?: string;
            language_code?: string;
            photo_url?: string;
            is_premium?: boolean;
        };
        auth_date?: number;
        hash?: string;
    };
    colorScheme: "light" | "dark";
    platform: string;
    expand: () => void;
    ready: () => void;
    close: () => void;
    onEvent: (event: string, callback: () => void) => void;
    BackButton: {
        show: () => void;
        hide: () => void;
        onClick: (cb: () => void) => void;
        offClick: (cb?: () => void) => void;
    };
    MainButton: {
        setText: (text: string) => void;
        show: () => void;
        hide: () => void;
        onClick: (cb: () => void) => void;
        offClick: (cb?: () => void) => void;
    };
    HapticFeedback: {
        impactOccurred: (style: "light" | "medium" | "heavy") => void;
        notificationOccurred: (type: "error" | "success" | "warning") => void;
    };
    showAlert: (message: string, callback?: () => void) => void;
    showConfirm: (message: string, callback: (confirmed: boolean) => void) => void;
    // ══════════════════════════════════════════════════════════════════════
    // ИСПРАВЛЕНО (15.07.2026): добавлен try_browser в опции openLink
    // ══════════════════════════════════════════════════════════════════════
    // ПРОБЛЕМА: отсутствовал параметр try_browser, из-за чего TS выдавал
    // ошибку при использовании try_browser: 'external' в useTelegram.ts
    //
    // РЕШЕНИЕ: добавлен try_browser?: 'internal' | 'external' в опции
    // openLink. Это официальный параметр Telegram Mini App API 8.0+.
    //
    // try_browser: 'external' — открывает ссылку в системном браузере
    // (Chrome/Safari), а не во встроенном браузере Telegram.
    // Это критически важно для OAuth Meta/Instagram, т.к. in-app браузер
    // Telegram блокируется Meta (детект по user-agent).
    //
    // try_browser: 'internal' — открывает во встроенном браузере Telegram.
    // ══════════════════════════════════════════════════════════════════════
    // ══════════════════════════════════════════════════════════════════════
    // ВОССТАНОВЛЕНО (15.07.2026): полный тип try_browser
    // ══════════════════════════════════════════════════════════════════════
    // try_browser: "internal" — открывает ссылку во встроенном браузере
    // Telegram (внутри приложения, не покидая Telegram).
    //
    // try_browser: "chrome" | "firefox" | "safari" — открывает в указанном
    // браузере (системный браузер, вне Telegram).
    //
    // Используем "internal" чтобы OAuth-ссылкa открывалась внутри Telegram.
    // ══════════════════════════════════════════════════════════════════════
    openLink: (url: string, options?: {
        try_instant_view?: boolean;
        try_browser?: "internal" | "chrome" | "firefox" | "safari";  // ← ВОССТАНОВЛЕНО (15.07.2026)
    }) => void;
    // ДОБАВЛЕНО: Новый метод для работы с внутренними ссылками Telegram (Deep Links).
    // Необходим для перенаправления пользователя на прокси-бота на десктопных платформах.
    openTelegramLink: (url: string) => void;
}

declare interface Window {
    Telegram?: {
        WebApp: TelegramWebApp;
    };
}
// /// <reference types="vite/client" />

// declare module "*.css" {
//     const content: string;
//     export default content;
// }

// // Telegram WebApp типы
// interface TelegramWebApp {
//     initData: string;
//     initDataUnsafe: {
//         user?: {
//             id: number;
//             first_name: string;
//             last_name?: string;
//             username?: string;
//             language_code?: string;
//             photo_url?: string;
//             is_premium?: boolean;
//         };
//         auth_date?: number;
//         hash?: string;
//     };
//     colorScheme: "light" | "dark";
//     platform: string;
//     expand: () => void;
//     ready: () => void;
//     close: () => void;
//     onEvent: (event: string, callback: () => void) => void;
//     BackButton: {
//         show: () => void;
//         hide: () => void;
//         onClick: (cb: () => void) => void;
//         offClick: (cb?: () => void) => void;
//     };
//     MainButton: {
//         setText: (text: string) => void;
//         show: () => void;
//         hide: () => void;
//         onClick: (cb: () => void) => void;
//         offClick: (cb?: () => void) => void;
//     };
//     HapticFeedback: {
//         impactOccurred: (style: "light" | "medium" | "heavy") => void;
//         notificationOccurred: (type: "error" | "success" | "warning") => void;
//     };
//     showAlert: (message: string, callback?: () => void) => void;
//     showConfirm: (message: string, callback: (confirmed: boolean) => void) => void;
// }

// declare interface Window {
//     Telegram?: {
//         WebApp: TelegramWebApp;
//     };
// }