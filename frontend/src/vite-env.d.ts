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
    // НОВОЕ: открывает URL вне WebView Mini App (системный браузер или Telegram in-app browser).
    // Обязателен для OAuth-редиректов на внешние домены (Meta/Instagram и т.п.).
    openLink: (url: string, options?: {
        try_instant_view?: boolean;
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