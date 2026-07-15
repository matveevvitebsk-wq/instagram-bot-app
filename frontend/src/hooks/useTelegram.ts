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
  // ══════════════════════════════════════════════════════════════════════
  // ВОССТАНОВЛЕНО (15.07.2026): openLink без try_browser
  // ══════════════════════════════════════════════════════════════════════
  // Убран try_browser: 'internal' — этот параметр неофициальный,
  // Telegram его игнорирует и открывает системный браузер.
  //
  // Теперь openLink(url) вызывает webApp.openLink(url) БЕЗ опций.
  // Telegram сам решает, как открыть ссылку:
  //   - на мобильных — во встроенном браузере Telegram (in-app)
  //   - на десктопе — в системном браузере
  //
  // Страница https://api.almarathon.com/api/auth/meta/start-page
  // может быть открыта во встроенном браузере, что и нужно.
  // После OAuth Instagram редиректит на тот же домен (api.almarathon.com),
  // поэтому пользователь НЕ покидает Telegram.
  //
  // ══════════════════════════════════════════════════════════════════════
  openLink: (url: string) => void;
  // НОВОЕ (15.07.2026)
  // Открывает ссылку t.me внутри Telegram,
  // используется для запуска Mini App через startapp
  openTelegramLink: (url: string) => void;
}

export const useTelegram = (): UseTelegramReturn => {
  const [isReady, setIsReady] = useState(false);
  const tg: TelegramWebApp | null =
    typeof window !== "undefined" ? (window.Telegram?.WebApp ?? null) : null;

  console.log(
    "Telegram WebApp:",
    window.Telegram?.WebApp
  );

  console.log(
    "initDataUnsafe:",
    window.Telegram?.WebApp?.initDataUnsafe
  );

  console.log(
    "start_param:",
    window.Telegram?.WebApp?.initDataUnsafe?.start_param
  );


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
  // ИСПРАВЛЕНО (15.07.2026): openLink — без try_browser
  // ══════════════════════════════════════════════════════════════════════
  // ПРОБЛЕМА: try_browser: 'internal' — неофициальный параметр,
  // Telegram его игнорирует. Параметр try_browser: 'external' —
  // официальный, но открывает системный браузер (покидаем Telegram).
  //
  // РЕШЕНИЕ: убираем try_browser вообще. Telegram сам выбирает
  // где открыть ссылку. На мобильных — встроенный браузер (in-app),
  // что позволяет оставаться в Telegram.
  //
  // АРХИТЕКТУРА Server-side OAuth:
  //   1. Settings.tsx → openLink("https://api.almarathon.com/api/auth/meta/start-page")
  //   2. Бэкенд отдаёт HTML-страницу, которая проверяет наличие аккаунта в БД
  //   3. Если аккаунта нет — редирект на Instagram OAuth
  //   4. Instagram редиректит на api.almarathon.com (тот же домен)
  //   5. После OAuth — страница "Подключено" с кнопкой "Вернуться в Telegram"
  // ══════════════════════════════════════════════════════════════════════
  const openLink = useCallback(
    (url: string) => {
      const webApp = window.Telegram?.WebApp;

      if (!webApp) {
        window.open(url, "_blank");
        return;
      }

      // ← ИСПРАВЛЕНО (15.07.2026): без try_browser
      // Telegram сам откроет ссылку во встроенном браузере (на мобильных)
      webApp.openLink(url, { try_instant_view: false });
    },
    []
  );

  // ═══════════════════════════════════════════════════════
  // НОВОЕ (15.07.2026)
  //
  // Открытие Telegram deep-link.
  // Используется для:
  // https://t.me/mediahave_bot?startapp=ig_auth
  //
  // В отличие от openLink(), эта функция открывает
  // Telegram-ссылки внутри приложения Telegram.
  // ═══════════════════════════════════════════════════════

  const openTelegramLink = useCallback(
    (url: string) => {

      console.log(
        "OPEN TELEGRAM LINKS:",
        url
      );

      const webApp = window.Telegram?.WebApp;

      if (!webApp) {
        console.log("Telegram WebApp отсутствует");
        window.open(url, "_blank");
        return;
      }

      webApp.openTelegramLink(url);
    },
    []
  );

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
    openTelegramLink,
  };
};