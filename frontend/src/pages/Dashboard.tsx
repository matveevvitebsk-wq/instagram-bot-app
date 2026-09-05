import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTelegram } from '@/hooks/useTelegram';
import { useInstagram } from '@/hooks/useInstagram';
import { useTrack } from '@/hooks/useTrack';
import api from '@/utils/api';

interface DashboardData {
  subscription: string;
  total_leads: number;
  tasks: Record<string, number>;
  weekly_snapshots: Array<{
    snapshot_date: string;
    total_new_leads: number;
    ai_insights?: string;
  }>;
}

const EMPTY_DASHBOARD_DATA: DashboardData = {
  subscription: 'free',
  total_leads: 0,
  tasks: {},
  weekly_snapshots: [],
};

export default function Dashboard() {
  const { user } = useTelegram();
  const { connected, loading: igLoading } = useInstagram();
  const { track } = useTrack();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (igLoading) return;
    if (!connected) {
      setData(EMPTY_DASHBOARD_DATA);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    api
      .get('/api/analytics/dashboard')
      .then((res) => {
        if (active) setData(res.data);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [connected, igLoading]);

  const firstName = user?.first_name || 'Пользователь';
  const userInitial = firstName.charAt(0).toUpperCase();

  const handleLockedClick = (label: string) => {
    track('locked_button_clicked', { button: label });
  };

  return (
    <div className='p-4 space-y-4'>
      {/* Шапка */}
      <div className='flex items-center justify-between gap-3 pt-2'>
        <div className='flex items-center gap-3 min-w-0'>
          {user?.photo_url ? (
            <img
              src={user.photo_url}
              alt={`Аватар ${firstName}`}
              className='w-12 h-12 rounded-full object-cover shrink-0'
              referrerPolicy='no-referrer'
            />
          ) : (
            <div
              className='w-12 h-12 rounded-full flex items-center justify-center text-lg font-semibold shrink-0'
              style={{
                background: 'var(--tg-theme-button-color)',
                color: 'var(--tg-theme-button-text-color)',
              }}
              aria-hidden='true'
            >
              {userInitial}
            </div>
          )}
          <div className='min-w-0'>
            <h1
              className='text-xl font-semibold truncate'
              style={{ color: 'var(--tg-theme-text-color)' }}
            >
              Привет, {firstName} 👋
            </h1>
            <p
              className='text-sm'
              style={{ color: 'var(--tg-theme-hint-color)' }}
            >
              Instagram Automation
            </p>
          </div>
        </div>
        <span
          className='text-xs px-2 py-1 rounded-full font-medium shrink-0'
          style={{
            background: 'var(--tg-theme-button-color)',
            color: 'var(--tg-theme-button-text-color)',
          }}
        >
          {data?.subscription ?? 'free'}
        </span>
      </div>

      {/* Баннер подключения Instagram */}
      {!igLoading && !connected && (
        <Link
          to='/settings'
          onClick={() => track('connect_banner_clicked')}
          className='block rounded-2xl p-4 active:opacity-80 transition-opacity'
          style={{ background: 'rgba(255,149,0,0.12)', border: '1px solid rgba(255,149,0,0.3)' }}
        >
          <p className='text-sm font-medium' style={{ color: '#ff9500' }}>
            ⚠️ Подключите Instagram
          </p>
          <p className='text-xs mt-1' style={{ color: 'var(--tg-theme-hint-color)' }}>
            Сначала войдите в Instagram на смартфоне. Аккаунт должен быть
            бизнес-аккаунтом. Затем привяжите его в Настройках.
          </p>
        </Link>
      )}

      {/* Карточки статистики */}
      <p
        className='text-xs font-semibold uppercase tracking-wide'
        style={{ color: 'var(--tg-theme-hint-color)' }}
      >
        Сводка
      </p>
      {loading ? (
        <div className='grid grid-cols-2 gap-3'>
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className='rounded-2xl h-24 animate-pulse'
              style={{ background: 'var(--tg-theme-secondary-bg-color)' }}
            />
          ))}
        </div>
      ) : (
        <div className='grid grid-cols-2 gap-3'>
          <StatCard
            emoji='👥'
            label='Всего лидов'
            value={data?.total_leads ?? 0}
          />
          <StatCard
            emoji='✅'
            label='Завершено'
            value={data?.tasks?.completed ?? 0}
          />
          <StatCard
            emoji='⏳'
            label='В очереди'
            value={data?.tasks?.pending ?? 0}
          />
          <StatCard
            emoji='❌'
            label='Ошибки'
            value={data?.tasks?.failed ?? 0}
            danger={(data?.tasks?.failed ?? 0) > 0}
          />
        </div>
      )}

      {/* AI Инсайты */}
      {data?.weekly_snapshots?.[0]?.ai_insights && (
        <div
          className='rounded-2xl p-4'
          style={{ background: 'var(--tg-theme-secondary-bg-color)' }}
        >
          <p
            className='text-xs font-medium mb-1'
            style={{ color: 'var(--tg-theme-hint-color)' }}
          >
            🤖 AI Инсайт
          </p>
          <p
            className='text-sm'
            style={{ color: 'var(--tg-theme-text-color)' }}
          >
            {data.weekly_snapshots[0].ai_insights}
          </p>
        </div>
      )}

      {/* Быстрые действия */}
      <p
        className='text-xs font-semibold uppercase tracking-wide pt-1'
        style={{ color: 'var(--tg-theme-hint-color)' }}
      >
        Действия
      </p>
      <div className='grid grid-cols-2 gap-3'>
        <QuickAction to='/tasks' emoji='⚡' label='Новая задача' locked={!connected} onLockedClick={handleLockedClick} />
        <QuickAction to='/auto-reply-dm' emoji='💬' label='Авто-ответ в DM' locked={!connected} onLockedClick={handleLockedClick} />
        <QuickAction to='/leads' emoji='👥' label='База лидов' locked={!connected} onLockedClick={handleLockedClick} />
        <QuickAction to='/settings' emoji='⚙️' label='Аккаунты' locked={false} onLockedClick={handleLockedClick} />
      </div>
    </div>
  );
}

function StatCard({
  emoji,
  label,
  value,
  danger = false,
}: {
  emoji: string;
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <div
      className='rounded-2xl p-4 min-h-28'
      style={{
        background: 'var(--tg-theme-secondary-bg-color)',
        border: '1px solid rgba(127,127,127,0.14)',
      }}
    >
      <div className='flex items-start justify-between gap-2'>
        <p
          className='text-xs font-medium'
          style={{ color: 'var(--tg-theme-hint-color)' }}
        >
          {label}
        </p>
        <span
          className='w-8 h-8 rounded-lg flex items-center justify-center text-lg'
          style={{ background: 'rgba(127,127,127,0.12)' }}
          aria-hidden='true'
        >
          {emoji}
        </span>
      </div>
      <p
        className='text-3xl font-bold mt-2'
        style={{ color: danger ? '#ff3b30' : 'var(--tg-theme-text-color)' }}
      >
        {value}
      </p>
    </div>
  );
}

function QuickAction({
  to,
  emoji,
  label,
  locked,
  onLockedClick,
}: {
  to: string;
  emoji: string;
  label: string;
  locked: boolean;
  onLockedClick: (label: string) => void;
}) {
  if (locked) {
    return (
      <button
        onClick={() => onLockedClick(label)}
        className='rounded-xl p-3 min-h-16 flex items-center gap-3 relative opacity-45 active:opacity-35 transition-opacity text-left shadow-sm'
        style={{
          background: 'var(--tg-theme-button-color)',
          color: 'var(--tg-theme-button-text-color)',
        }}
      >
        <span
          className='w-9 h-9 rounded-lg flex items-center justify-center text-xl shrink-0'
          style={{ background: 'rgba(255,255,255,0.18)' }}
        >
          {emoji}
        </span>
        <span className='text-sm font-semibold leading-tight flex-1'>{label}</span>
        <span className='absolute top-2 right-2 text-xs'>🔒</span>
      </button>
    );
  }

  return (
    <Link
      to={to}
      className='rounded-xl p-3 min-h-16 flex items-center gap-3 active:opacity-70 transition-opacity shadow-sm'
      style={{
        background: 'var(--tg-theme-button-color)',
        color: 'var(--tg-theme-button-text-color)',
      }}
    >
      <span
        className='w-9 h-9 rounded-lg flex items-center justify-center text-xl shrink-0'
        style={{ background: 'rgba(255,255,255,0.18)' }}
      >
        {emoji}
      </span>
      <span className='text-sm font-semibold leading-tight flex-1'>{label}</span>
      <span className='text-base opacity-75' aria-hidden='true'>
        ›
      </span>
    </Link>
  );
}
