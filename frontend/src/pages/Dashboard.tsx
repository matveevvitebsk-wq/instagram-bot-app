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

export default function Dashboard() {
  const { user } = useTelegram();
  const { connected, loading: igLoading } = useInstagram();
  const { track } = useTrack();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/api/analytics/dashboard')
      .then((res) => setData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const firstName = user?.first_name || 'Пользователь';

  const handleLockedClick = (label: string) => {
    track('locked_button_clicked', { button: label });
  };

  return (
    <div className='p-4 space-y-4'>
      {/* Шапка */}
      <div className='flex items-center justify-between pt-2'>
        <div>
          <h1
            className='text-xl font-semibold'
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
        <span
          className='text-xs px-2 py-1 rounded-full font-medium'
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
            Чтобы пользоваться задачами, авто-ответами в DM и лидами — привяжите бизнес-аккаунт в Настройках
          </p>
        </Link>
      )}

      {/* Карточки статистики */}
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
      className='rounded-2xl p-4'
      style={{ background: 'var(--tg-theme-secondary-bg-color)' }}
    >
      <p className='text-2xl mb-1'>{emoji}</p>
      <p
        className='text-2xl font-bold'
        style={{ color: danger ? '#ff3b30' : 'var(--tg-theme-text-color)' }}
      >
        {value}
      </p>
      <p className='text-xs' style={{ color: 'var(--tg-theme-hint-color)' }}>
        {label}
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
        className='rounded-2xl p-4 flex items-center gap-3 relative opacity-50 active:opacity-40 transition-opacity'
        style={{ background: 'var(--tg-theme-secondary-bg-color)' }}
      >
        <span className='text-2xl'>{emoji}</span>
        <span
          className='text-sm font-medium'
          style={{ color: 'var(--tg-theme-text-color)' }}
        >
          {label}
        </span>
        <span className='absolute top-2 right-2 text-xs'>🔒</span>
      </button>
    );
  }

  return (
    <Link
      to={to}
      className='rounded-2xl p-4 flex items-center gap-3 active:opacity-70 transition-opacity'
      style={{ background: 'var(--tg-theme-secondary-bg-color)' }}
    >
      <span className='text-2xl'>{emoji}</span>
      <span
        className='text-sm font-medium'
        style={{ color: 'var(--tg-theme-text-color)' }}
      >
        {label}
      </span>
    </Link>
  );
}
