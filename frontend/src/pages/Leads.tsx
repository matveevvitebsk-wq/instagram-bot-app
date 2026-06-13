// Leads.tsx — список лидов из Instagram аудитории
export default function Leads() {
  return (
    <div className='p-4 pt-6'>
      <h1
        className='text-xl font-semibold mb-4'
        style={{ color: 'var(--tg-theme-text-color)' }}
      >
        👥 Лиды
      </h1>
      <p className='text-sm' style={{ color: 'var(--tg-theme-hint-color)' }}>
        Здесь отображается аудитория, собранная из Instagram (комментаторы, DM,
        реакции на Stories). Реализуйте таблицу с фильтрацией по lead_status из
        Supabase таблицы users.
      </p>
    </div>
  );
}
