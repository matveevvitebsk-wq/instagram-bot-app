import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useTelegram } from '@/hooks/useTelegram';
// ИСПРАВЛЕНО (15.07.2026): добавлен openLink для OAuth внутри Telegram
import { useAuthStore } from '@/store/authStore';
import { useTrack } from '@/hooks/useTrack';
import Dashboard from '@/pages/Dashboard';
import Tasks from '@/pages/Tasks';
import Leads from '@/pages/Leads';
import AutoReplyDM from '@/pages/AutoReplyDM';
import Settings from '@/pages/Settings';
import Layout from '@/components/Layout';
import LoadingScreen from '@/components/LoadingScreen';
import Landing from '@/pages/Landing';
import Privacy from '@/pages/Privacy';
import Terms from '@/pages/Terms';

const PUBLIC_PATHS = ['/privacy', '/terms'];

export default function App() {
  // ИСПРАВЛЕНО (15.07.2026): добавлен openLink в деструктуризацию
  const { initData, isReady, platform, tg, openLink } = useTelegram();

  console.log('Telegram initDataUnsafe:', tg?.initDataUnsafe);
  console.log('START PARAM:', tg?.initDataUnsafe?.start_param);

  useEffect(() => {
    console.log(
      'Telegram start_param:',
      window.Telegram?.WebApp?.initDataUnsafe?.start_param,
    );

    console.log(
      'Telegram initDataUnsafe:',
      window.Telegram?.WebApp?.initDataUnsafe,
    );
  }, []);
  const { login, isAuthenticated, isLoading } = useAuthStore();
  const { track } = useTrack();

  const isPublicPath = PUBLIC_PATHS.includes(window.location.pathname);

  useEffect(() => {
    if (isReady && initData && !isAuthenticated) {
      login(initData);
    }
  }, [isReady, initData, isAuthenticated, login]);

  useEffect(() => {
    if (isAuthenticated) {
      track('app_opened', { platform });
    }
  }, [isAuthenticated]);

  // ═══════════════════════════════════════════════════════
  // НОВОЕ (15.07.2026)
  //
  // Обработка запуска через:
  // https://t.me/mediahave_bot?startapp=ig_auth
  //
  // Telegram открывает Mini App заново,
  // мы проверяем start_param и запускаем OAuth.
  // ═══════════════════════════════════════════════════════

  useEffect(() => {
    const startParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param;

    if (startParam === 'ig_auth' && initData) {
      // ИСПРАВЛЕНО (15.07.2026): используем VITE_API_URL вместо хардкода
      const apiUrl =
        import.meta.env.VITE_API_URL || 'https://api.almarathon.com';
      const url =
        `${apiUrl}/api/instagram/meta/start-page` +
        `?initData=${encodeURIComponent(initData)}`;

      console.log('Запуск Instagram OAuth:', url);

      openLink(url);
    }
  }, [initData, openLink]);

  if (isPublicPath) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path='/privacy' element={<Privacy />} />
          <Route path='/terms' element={<Terms />} />
        </Routes>
      </BrowserRouter>
    );
  }

  if (!isReady || isLoading) return <LoadingScreen />;
  if (!initData && !isAuthenticated) return <Landing />;

  return (
    <BrowserRouter>
      <Routes>
        <Route path='/' element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path='tasks' element={<Tasks />} />
          <Route path='leads' element={<Leads />} />
          <Route path='auto-reply-dm' element={<AutoReplyDM />} />
          <Route path='funnels' element={<Navigate to='/auto-reply-dm' replace />} />
          <Route path='settings' element={<Settings />} />
        </Route>
        <Route path='/privacy' element={<Privacy />} />
        <Route path='/terms' element={<Terms />} />
        <Route path='*' element={<Navigate to='/' replace />} />
      </Routes>
    </BrowserRouter>
  );
}
