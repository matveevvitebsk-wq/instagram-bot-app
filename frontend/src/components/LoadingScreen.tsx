export default function LoadingScreen() {
  return (
    <div
      className="flex flex-col items-center justify-center h-screen"
      style={{ background: "var(--tg-theme-bg-color)" }}
    >
      <div className="text-5xl mb-4 animate-bounce">📱</div>
      <div
        className="w-8 h-8 border-2 rounded-full animate-spin"
        style={{
          borderColor: "var(--tg-theme-hint-color)",
          borderTopColor: "var(--tg-theme-button-color)",
        }}
      />
      <p className="mt-4 text-sm" style={{ color: "var(--tg-theme-hint-color)" }}>
        Загрузка...
      </p>
    </div>
  );
}
