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
}

export const useTelegram = (): UseTelegramReturn => {
  const [isReady, setIsReady] = useState(false);
  const tg: TelegramWebApp | null =
    typeof window !== "undefined" ? (window.Telegram?.WebApp ?? null) : null;

  useEffect(() => {
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
  };
};