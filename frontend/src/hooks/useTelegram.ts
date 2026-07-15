import { useEffect, useState, useCallback } from "react";

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
  is_premium?: boolean;
}

interface UseTelegramReturn {
  tg: TelegramWebApp | null;
  user: TelegramUser | null;
  initData: string;
  colorScheme: "light" | "dark";
  platform: string;
  isReady: boolean;
  showBackButton: (callback: () => void) => void;
  hideBackButton: () => void;
  showMainButton: (text: string, callback: () => void) => void;
  hideMainButton: () => void;
  showAlert: (text: string) => void;
  showConfirm: (text: string, callback: (confirmed: boolean) => void) => void;
  hapticFeedback: (type: "light" | "medium" | "heavy" | "error" | "success" | "warning") => void;
  closeApp: () => void;
  // НОВОЕ: открывает ссылку в системном браузере (Safari/Chrome), а не в WebView Mini App.
  // ОБЯЗАТЕЛЬНО использовать для любых внешних OAuth-редиректов (Meta/Instagram и т.д.) —
  // window.location.href внутри Telegram WebView для внешних доменов не работает надёжно.
  openLink: (url: string) => void;
}

export const useTelegram = (): UseTelegramReturn => {
  const [isReady, setIsReady] = useState(false);
  const tg: TelegramWebApp | null =
    typeof window !== "undefined" ? (window.Telegram?.WebApp ?? null) : null;

  useEffect(() => {
    console.log("Version:", tg?.version);
    console.log("Platform:", tg?.platform);
    if (tg) {
      tg.ready();
      tg.expand();
      setIsReady(true);
      tg.onEvent("themeChanged", () => {
        document.documentElement.setAttribute(
          "data-theme",
          tg.colorScheme || "light"
        );
      });
    } else {
      setIsReady(true);
    }
  }, [tg]);

  const showBackButton = useCallback(
    (callback: () => void) => {
      if (!tg) return;
      tg.BackButton.show();
      tg.BackButton.onClick(callback);
    },
    [tg]
  );

  const hideBackButton = useCallback(() => {
    if (!tg) return;
    tg.BackButton.hide();
    tg.BackButton.offClick();
  }, [tg]);

  const showMainButton = useCallback(
    (text: string, callback: () => void) => {
      if (!tg) return;
      tg.MainButton.setText(text);
      tg.MainButton.show();
      tg.MainButton.onClick(callback);
    },
    [tg]
  );

  const hideMainButton = useCallback(() => {
    if (!tg) return;
    tg.MainButton.hide();
    tg.MainButton.offClick();
  }, [tg]);

  const hapticFeedback = useCallback(
    (type: "light" | "medium" | "heavy" | "error" | "success" | "warning") => {
      if (!tg?.HapticFeedback) return;
      if (["error", "success", "warning"].includes(type)) {
        tg.HapticFeedback.notificationOccurred(
          type as "error" | "success" | "warning"
        );
      } else {
        tg.HapticFeedback.impactOccurred(type as "light" | "medium" | "heavy");
      }
    },
    [tg]
  );

  // ══════════════════════════════════════════════════════════════════════
  // ИСПРАВЛЕНО (15.07.2026): openLink для внешних OAuth-флоу
  // ══════════════════════════════════════════════════════════════════════
  //
  // ПРОБЛЕМА:
  //   1. Старый код пытался на ПК извлечь state из URL Instagram и создать
  //      deep link "https://t.me" + stateParam — это БИТАЯ ССЫЛКА.
  //      state от Instagram — это параметр OAuth, а не путь в Telegram.
  //      В результате на ПК OAuth не работал.
  //
  //   2. На мобильных openLink() открывал встроенный браузер Telegram
  //      (in-app browser), который Meta/Instagram часто блокируют
  //      (детектят user-agent in-app браузера и отклоняют OAuth).
  //
  // РЕШЕНИЕ:
  //   - На ВСЕХ платформах (ПК и мобильные) используем один подход:
  //     webApp.openLink(url, options) с параметром try_browser: 'external'.
  //
  //   - try_browser: 'external' — заставляет Telegram открыть ссылку
  //     в системном браузере (Chrome/Safari), а не в in-app браузере.
  //     Это даёт Meta/Instagram нормальный user-agent и позволяет OAuth
  //     пройти корректно.
  //
  //   - ВАЖНО: try_browser: 'external' работает с версии Telegram
  //     Mini App 8.0+. Если версия ниже — фоллбэк на openLink() без
  //     опции (откроется во встроенном браузере).
  //
  //   - Вне Telegram (обычный браузер при разработке) — window.open.
  //
  // ══════════════════════════════════════════════════════════════════════
  const openLink = useCallback((url: string) => {
    const webApp = window.Telegram?.WebApp;

    // Вне Telegram (обычный браузер) — открываем через window.open
    if (!webApp) {
      window.open(url, "_blank");
      return;
    }

    // Telegram Mini App API версия 8.0+ поддерживает try_browser
    // ║ Версия   ║ Описание                                    ║
    // ║ < 6.0    ║ openLink() открывает во встроенном браузере  ║
    // ║ 6.0 - 7.9║ openLink() с try_instant_view: false         ║
    // ║ 8.0+     ║ openLink() с try_browser: 'external'         ║
    const version = parseFloat(webApp.version || "0");
    const supportsExternalBrowser = version >= 8.0;

    if (supportsExternalBrowser) {
      // ← ИСПРАВЛЕНО (15.07.2026): используем try_browser: 'external'
      //   чтобы OAuth Meta/Instagram открывался в системном браузере
      webApp.openLink(url, {
        try_instant_view: false,
        try_browser: 'external',  // ← ключевая опция: системный браузер
      });
      return;
    }

    // Фоллбэк для старых версий (< 8.0): открываем как обычно
    // ← ИСПРАВЛЕНО (15.07.2026): убрана битая логика для ПК
    webApp.openLink(url, { try_instant_view: false });
  }, []);


  // const openLink = useCallback(
  //   (url: string) => {
  //     console.log("Platform:", tg?.platform);
  //     console.log("URL:", url);
  //     console.log("Version:", window.Telegram?.WebApp.version);
  //     console.log("Platform:", window.Telegram?.WebApp.platform);
  //     console.log("WebApp:", window.Telegram?.WebApp);

  //     if (tg?.openLink) {
  //       // Открывает ссылку во встроенном браузере Telegram,
  //       // а не в Chrome/Safari.
  //       tg.openLink(url, {
  //         try_instant_view: false,
  //         try_browser: "internal",
  //       });
  //     } else {
  //       window.open(url, "_blank");
  //     }
  //   },
  //   [tg]
  // );



  return {
    tg,
    user: (tg?.initDataUnsafe?.user as TelegramUser) ?? null,
    initData: tg?.initData ?? "",
    colorScheme: tg?.colorScheme ?? "light",
    platform: tg?.platform ?? "unknown",
    isReady,
    showBackButton,
    hideBackButton,
    showMainButton,
    hideMainButton,
    showAlert: (text) => tg?.showAlert(text),
    showConfirm: (text, cb) => tg?.showConfirm(text, cb),
    hapticFeedback,
    closeApp: () => tg?.close(),
    openLink,
  };
};