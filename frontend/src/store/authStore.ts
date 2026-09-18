import { create } from "zustand";
import api from "@/utils/api";
import { detectDevice } from "@/utils/deviceProfile";

interface AuthState {
  token: string | null;
  user: Record<string, any> | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  login: (initData: string) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: sessionStorage.getItem("jwt"),
  user: null,
  isAuthenticated: !!sessionStorage.getItem("jwt"),
  isLoading: false,
  error: null,

  login: async (initData: string) => {
    set({ isLoading: true, error: null });
    try {
      const device = detectDevice({
        telegramPlatform:
          typeof window !== "undefined"
            ? window.Telegram?.WebApp?.platform
            : undefined,
      });
      const res = await api.post("/api/auth/telegram", {
        init_data: initData,
        device_kind: device.kind,
        os_type: device.os,
        telegram_platform: device.telegramPlatform,
      });
      const { access_token, user } = res.data;

      console.log("🔑 Ответ от бэкенда:", res.data);

      console.log("🔑 Сохраняем токен:", access_token);


      // Сохраняем в sessionStorage (очищается при закрытии вкладки)
      // НЕ localStorage — чувствительные данные не должны храниться дольше сессии
      sessionStorage.setItem("jwt", access_token);

      set({
        token: access_token,
        user,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (err: any) {
      set({
        error: err.response?.data?.detail ?? "Ошибка авторизации",
        isLoading: false,
      });
    }
  },

  logout: () => {
    sessionStorage.removeItem("jwt");
    set({ token: null, user: null, isAuthenticated: false });
  },
}));
