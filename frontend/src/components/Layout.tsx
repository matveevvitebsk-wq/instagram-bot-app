import { Outlet, NavLink } from 'react-router-dom';
import { useTelegram } from '@/hooks/useTelegram';

const navItems = [
  { path: '/', label: 'Главная', icon: '🏠' },
  { path: '/tasks', label: 'Задачи', icon: '⚡' },
  { path: '/leads', label: 'Лиды', icon: '👥' },
  { path: '/funnels', label: 'Воронки', icon: '🎯' },
  { path: '/settings', label: 'Настройки', icon: '⚙️' },
];

export default function Layout() {
  const { colorScheme } = useTelegram();
  // const location = useLocation();

  return (
    <div
      className='flex flex-col min-h-screen'
      style={{ background: 'var(--tg-theme-bg-color)' }}
    >
      {/* Основной контент — скроллится */}
      <main className='flex-1 overflow-y-auto pb-20'>
        <Outlet />
      </main>

      {/* Нижняя навигация — закреплена, адаптируется к safe area */}
      <nav
        className='fixed bottom-0 left-0 right-0 border-t safe-area-bottom z-50'
        style={{
          background: 'var(--tg-theme-secondary-bg-color)',
          borderColor: colorScheme === 'dark' ? '#3a3a3c' : '#e5e5ea',
        }}
      >
        <div className='flex items-center justify-around h-14 max-w-lg mx-auto'>
          {navItems.map(({ path, label, icon }) => (
            <NavLink
              key={path}
              to={path}
              end={path === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 h-full text-xs transition-opacity ${
                  isActive ? 'opacity-100' : 'opacity-40'
                }`
              }
              style={{ color: 'var(--tg-theme-button-color)' }}
            >
              <span className='text-lg leading-none mb-0.5'>{icon}</span>
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
