// Funnels.tsx — управление воронками автоответов (automation_funnels)
export default function Funnels() {
  return (
    <div className="p-4 pt-6">
      <h1 className="text-xl font-semibold mb-4" style={{ color: "var(--tg-theme-text-color)" }}>🎯 Воронки</h1>
      <p className="text-sm" style={{ color: "var(--tg-theme-hint-color)" }}>
        Управление ключевыми словами и шаблонами ответов из таблицы automation_funnels.
        CRUD через /api/funnels — добавьте этот роутер в backend/app/api/.
      </p>
    </div>
  );
}
