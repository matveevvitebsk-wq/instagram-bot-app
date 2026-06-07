import { useEffect, useState } from "react";
import { useTelegram } from "@/hooks/useTelegram";
import api from "@/utils/api";

interface Task {
  id: string;
  task_type: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  payload: Record<string, any>;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; emoji: string }> = {
  pending:   { label: "В очереди",  color: "#ff9500", emoji: "⏳" },
  running:   { label: "Выполняется",color: "#007aff", emoji: "🔄" },
  completed: { label: "Готово",     color: "#34c759", emoji: "✅" },
  failed:    { label: "Ошибка",     color: "#ff3b30", emoji: "❌" },
  cancelled: { label: "Отменено",   color: "#8e8e93", emoji: "🚫" },
};

const TASK_TYPES = [
  { value: "publish_post",   label: "Публикация поста",     emoji: "📸" },
  { value: "keyword_funnel", label: "Ключевая воронка",    emoji: "🎯" },
  { value: "dm_reply",       label: "Авто-ответ в DM",     emoji: "💬" },
  { value: "analytics",      label: "Сбор аналитики",      emoji: "📊" },
];

export default function Tasks() {
  const { hapticFeedback } = useTelegram();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedType, setSelectedType] = useState("keyword_funnel");
  const [keyword, setKeyword] = useState("");
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchTasks = () => {
    setLoading(true);
    api.get("/api/tasks/").then((res) => setTasks(res.data.tasks)).finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTasks();
    // Обновляем каждые 10 секунд (polling — Supabase Realtime настраивается отдельно)
    const interval = setInterval(fetchTasks, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleCreate = async () => {
    if (!keyword.trim()) return;
    setSubmitting(true);
    hapticFeedback("medium");

    try {
      await api.post("/api/tasks/", {
        task_type: selectedType,
        ig_account_id: "default", // TODO: выбор аккаунта
        payload: {
          trigger_keyword: keyword.toLowerCase(),
          reply_text: replyText,
        },
      });
      hapticFeedback("success");
      setKeyword("");
      setReplyText("");
      setShowForm(false);
      fetchTasks();
    } catch {
      hapticFeedback("error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (taskId: string) => {
    hapticFeedback("light");
    await api.delete(`/api/tasks/${taskId}`);
    fetchTasks();
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-xl font-semibold" style={{ color: "var(--tg-theme-text-color)" }}>
          ⚡ Задачи
        </h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-1.5 rounded-full text-sm font-medium transition-opacity active:opacity-70"
          style={{ background: "var(--tg-theme-button-color)", color: "var(--tg-theme-button-text-color)" }}
        >
          {showForm ? "Отмена" : "+ Создать"}
        </button>
      </div>

      {/* Форма создания задачи */}
      {showForm && (
        <div
          className="rounded-2xl p-4 space-y-3"
          style={{ background: "var(--tg-theme-secondary-bg-color)" }}
        >
          <p className="text-sm font-medium" style={{ color: "var(--tg-theme-text-color)" }}>
            Тип задачи
          </p>
          <div className="grid grid-cols-2 gap-2">
            {TASK_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => setSelectedType(t.value)}
                className="p-3 rounded-xl text-left text-sm transition-all"
                style={{
                  background: selectedType === t.value
                    ? "var(--tg-theme-button-color)"
                    : "var(--tg-theme-bg-color)",
                  color: selectedType === t.value
                    ? "var(--tg-theme-button-text-color)"
                    : "var(--tg-theme-text-color)",
                }}
              >
                <span className="text-lg block mb-1">{t.emoji}</span>
                {t.label}
              </button>
            ))}
          </div>

          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Ключевое слово (напр. ГАЙД)"
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
            style={{
              background: "var(--tg-theme-bg-color)",
              color: "var(--tg-theme-text-color)",
              border: "1px solid var(--tg-theme-hint-color)",
            }}
          />

          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Текст ответа в Direct..."
            rows={3}
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none resize-none"
            style={{
              background: "var(--tg-theme-bg-color)",
              color: "var(--tg-theme-text-color)",
              border: "1px solid var(--tg-theme-hint-color)",
            }}
          />

          <button
            onClick={handleCreate}
            disabled={submitting || !keyword.trim()}
            className="w-full py-3 rounded-xl font-medium text-sm transition-opacity disabled:opacity-50"
            style={{ background: "var(--tg-theme-button-color)", color: "var(--tg-theme-button-text-color)" }}
          >
            {submitting ? "Создаём..." : "Запустить задачу"}
          </button>
        </div>
      )}

      {/* Список задач */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-2xl animate-pulse" style={{ background: "var(--tg-theme-secondary-bg-color)" }} />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12" style={{ color: "var(--tg-theme-hint-color)" }}>
          <p className="text-4xl mb-3">⚡</p>
          <p>Задач пока нет</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => {
            const cfg = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.pending;
            const type = TASK_TYPES.find((t) => t.value === task.task_type);
            return (
              <div
                key={task.id}
                className="rounded-2xl p-4 flex items-center justify-between"
                style={{ background: "var(--tg-theme-secondary-bg-color)" }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{type?.emoji ?? "⚡"}</span>
                  <div>
                    <p className="text-sm font-medium" style={{ color: "var(--tg-theme-text-color)" }}>
                      {type?.label ?? task.task_type}
                    </p>
                    <p className="text-xs" style={{ color: cfg.color }}>
                      {cfg.emoji} {cfg.label}
                    </p>
                  </div>
                </div>
                {task.status === "pending" && (
                  <button
                    onClick={() => handleCancel(task.id)}
                    className="text-xs px-3 py-1.5 rounded-full"
                    style={{ color: "#ff3b30", background: "rgba(255,59,48,0.1)" }}
                  >
                    Отмена
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
