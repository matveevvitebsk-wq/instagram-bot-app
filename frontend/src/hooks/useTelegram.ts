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

  // НОВОЕ: openLink — правильный способ покидать Mini App для внешних OAuth-флоу.
  // tg.openLink() открывает системный браузер (или Telegram in-app browser с try_instant_view: false),
  // что даёт Meta/Instagram нормальный user-agent и позволяет OAuth пройти корректно.
  // Вне Telegram (разработка в обычном браузере) — фолбэк на window.open.
  const openLink = useCallback((url: string) => {
    const webApp = window.Telegram?.WebApp;

    // Ранний возврат, если открыто в обычном браузере вне Telegram
    if (!webApp) {
      window.open(url, "_blank");
      return;
    }

    // Проверяем, ПК это или мобилка
    const desktopPlatforms = ['tdesktop', 'macos', 'weba'];
    const isDesktop = desktopPlatforms.includes(webApp.platform);

    if (isDesktop && typeof webApp.openTelegramLink === 'function') {
      try {
        // 1. Достаем параметр state из ссылки Инстаграма
        const stateParam = new URL(url).searchParams.get("state") || "";

        // 2. Строка ссылки без хитрых кавычек (через обычные плюсы)
        // ===!!! ВНИМАНИЕ: ЗАМЕНИТЕ ТЕКСТ ПОД СТРЕЛКАМИ НИЖЕ !!!===
        //                       vvvvvvvvvvvvvvvvvvvvvvvvvvv
        const tgDeepLink = "https://t.me" + stateParam;

        // Открываем внутреннее окно Mini App на ПК
        webApp.openTelegramLink(tgDeepLink);
      } catch (e) {
        // Если ссылка сломалась, пробуем открыть как обычно
        webApp.openLink(url, { try_instant_view: false });
      }
    } else {
      // На телефонах открываем во встроенном браузере Telegram
      webApp.openLink(url, { try_instant_view: false });
    }
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