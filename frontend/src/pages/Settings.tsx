import { useEffect, useState } from "react";
import api from "@/utils/api";
import { useTrack } from "@/hooks/useTrack";
import { useTelegram } from "@/hooks/useTelegram";

interface IgAccount {
  id: string;
  page_id: string;
  is_active: boolean;
}

export default function Settings() {
  const [accounts, setAccounts] = useState<IgAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const { track } = useTrack();
  const { showAlert } = useTelegram();

  const loadAccounts = () => {
    setLoading(true);
    api.get("/api/accounts/")
      .then((res) => setAccounts(res.data.accounts ?? res.data ?? []))
      .catch(() => setAccounts([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadAccounts();
    const params = new URLSearchParams(window.location.search);
    if (params.get("ig_success")) {
      track("instagram_connected");
      showAlert("Instagram успешно подключён!");
      loadAccounts();
    }
    if (params.get("ig_error")) {
      track("instagram_connect_failed");
      showAlert("Не удалось подключить Instagram. Попробуйте снова.");
    }
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    track("instagram_connect_started");
    try {
      const res = await api.get("/api/auth/meta/url");
      window.location.href = res.data.url;
    } catch {
      showAlert("Ошибка получения ссылки авторизации");
      setConnecting(false);
    }
  };

  const handleDisconnect = async (id: string) => {
    track("instagram_disconnected");
    await api.delete(`/api/accounts/${id}`);
    loadAccounts();
  };

  return (
    <div className="p-4 pt-6 space-y-4">
      <h1
        className="text-xl font-semibold"
        style={{ color: "var(--tg-theme-text-color)" }}
      >
        ⚙️ Настройки
      </h1>

      {loading ? (
        <div
          className="h-20 rounded-2xl animate-pulse"
          style={{ background: "var(--tg-theme-secondary-bg-color)" }}
        />
      ) : accounts.length === 0 ? (
        <div
          className="rounded-2xl p-4 space-y-3"
          style={{ background: "var(--tg-theme-secondary-bg-color)" }}
        >
          <p
            className="text-sm"
            style={{ color: "var(--tg-theme-hint-color)" }}
          >
            Подключите Instagram бизнес-аккаунт, чтобы начать автоматизацию:
            авто-ответы в Direct, публикации по расписанию и AI аналитику.
          </p>
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="w-full py-3 rounded-xl font-medium text-sm transition-opacity disabled:opacity-50"
            style={{
              background: "var(--tg-theme-button-color)",
              color: "var(--tg-theme-button-text-color)",
            }}
          >
            {connecting ? "Открываем Instagram..." : "📷 Подключить Instagram"}
          </button>
        </div>
      ) : (
        accounts.map((acc) => (
          <div
            key={acc.id}
            className="rounded-2xl p-4 flex items-center justify-between"
            style={{ background: "var(--tg-theme-secondary-bg-color)" }}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">📷</span>
              <div>
                <p
                  className="text-sm font-medium"
                  style={{ color: "var(--tg-theme-text-color)" }}
                >
                  Instagram подключён
                </p>
                <p
                  className="text-xs"
                  style={{ color: "#34c759" }}
                >
                  ✅ Активен
                </p>
              </div>
            </div>
            <button
              onClick={() => handleDisconnect(acc.id)}
              className="text-xs px-3 py-1.5 rounded-full"
              style={{ color: "#ff3b30", background: "rgba(255,59,48,0.1)" }}
            >
              Отключить
            </button>
          </div>
        ))
      )}
    </div>
  );
}
