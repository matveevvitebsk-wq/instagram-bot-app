// Settings.tsx — привязка Instagram аккаунта
export default function Settings() {
  return (
    <div className="p-4 pt-6">
      <h1 className="text-xl font-semibold mb-4" style={{ color: "var(--tg-theme-text-color)" }}>⚙️ Настройки</h1>
      <p className="text-sm" style={{ color: "var(--tg-theme-hint-color)" }}>
        Здесь пользователь привязывает Instagram бизнес-аккаунт через Meta OAuth.
        Используйте /api/accounts эндпоинты из бэкенда.
      </p>
    </div>
  );
}
