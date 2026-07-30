import { useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useTelegram } from '@/hooks/useTelegram';
import { useInstagram } from '@/hooks/useInstagram';
import { useTrack } from '@/hooks/useTrack';

const navItems = [
  { path: '/', label: 'Главная', icon: '🏠', locked: false },
  { path: '/tasks', label: 'Задачи', icon: '⚡', locked: true },
  { path: '/leads', label: 'Лиды', icon: '👥', locked: true },
  { path: '/auto-reply-dm', label: 'Авто-ответ в DM', icon: '💬', locked: true },
  { path: '/settings', label: 'Настройки', icon: '⚙️', locked: false },
];

export default function Layout() {
  const { colorScheme, showAlert } = useTelegram();
  const { connected, loading } = useInstagram();
  const { track } = useTrack();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const protectedPaths = ['/tasks', '/leads', '/auto-reply-dm', '/funnels'];
    if (
      !loading &&
      !connected &&
      protectedPaths.some((path) => location.pathname.startsWith(path))
    ) {
      navigate('/', { replace: true });
    }
  }, [connected, loading, location.pathname, navigate]);

  const handleNavClick = (e: React.MouseEvent, locked: boolean, label: string) => {
    if (locked && !connected) {
      e.preventDefault();
      track('locked_nav_clicked', { tab: label });
      showAlert('Подключите Instagram в Настройках, чтобы открыть этот раздел');
      navigate('/settings');
    }
  };

  return (
    <div
      className='flex flex-col min-h-screen'
      style={{ background: 'var(--tg-theme-bg-color)' }}
    >
      <main className='flex-1 overflow-y-auto pb-20'>
        <Outlet />
      </main>
      <nav
        className='fixed bottom-0 left-0 right-0 border-t safe-area-bottom z-50'
        style={{
          background: 'var(--tg-theme-secondary-bg-color)',
          borderColor: colorScheme === 'dark' ? '#3a3a3c' : '#e5e5ea',
        }}
      >
        <div className='flex items-center justify-around h-14 max-w-lg mx-auto'>
          {navItems.map(({ path, label, icon, locked }) => {
            const isBlocked = locked && !connected;
            const isActive = location.pathname === path || (path === '/' && location.pathname === '/');
            return (
              <NavLink
                key={path}
                to={path}
                end={path === '/'}
                onClick={(e) => handleNavClick(e, locked, label)}
                className={`flex flex-col items-center justify-center flex-1 h-full text-xs transition-opacity relative ${
                  isActive ? 'opacity-100' : 'opacity-40'
                } ${isBlocked ? 'opacity-30' : ''}`}
                style={{ color: 'var(--tg-theme-button-color)' }}
              >
                <span className='text-lg leading-none mb-0.5'>{icon}</span>
                <span className='text-[10px] leading-tight text-center'>{label}</span>
                {isBlocked && (
                  <span className='absolute top-0 right-2 text-[10px]'>🔒</span>
                )}
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
