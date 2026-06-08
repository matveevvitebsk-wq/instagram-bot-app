/// <reference types="vite/client" />

declare module "*.css" {
    const content: string;
    export default content;
}

// Telegram WebApp типы
interface TelegramWebApp {
    initData: string;
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
}

declare interface Window {
    Telegram?: {
        WebApp: TelegramWebApp;
    };
}