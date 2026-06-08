import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useTelegram } from '@/hooks/useTelegram';
import { useAuthStore } from '@/store/authStore';
import Dashboard from '@/pages/Dashboard';
import Tasks from '@/pages/Tasks';
import Leads from '@/pages/Leads';
import Funnels from '@/pages/Funnels';
import Settings from '@/pages/Settings';
import Layout from '@/components/Layout';
import LoadingScreen from '@/components/LoadingScreen';

export default function App() {
  const { initData, isReady } = useTelegram();
  const { login, isAuthenticated, isLoading } = useAuthStore();

  // Автоматический вход при открытии Mini App
  useEffect(() => {
    if (isReady && initData && !isAuthenticated) {
      login(initData);
    }
  }, [isReady, initData, isAuthenticated, login]);

  // Пока Telegram SDK инициализируется или идёт авторизация — спиннер
  if (!isReady || isLoading) {
    return <LoadingScreen />;
  }

  // // Если вне Telegram (браузер разработчика) — показываем заглушку
  // if (!initData && !isAuthenticated) {
  //   return (
  //     <div className="flex items-center justify-center h-screen bg-tg-bg">
  //       <div className="text-center p-6">
  //         <p className="text-2xl mb-2">🤖</p>
  //         <p className="font-medium text-tg-text">Открывайте через Telegram</p>
  //         <p className="text-sm text-tg-hint mt-1">Это Telegram Mini App</p>
  //       </div>
  //     </div>
  //   );
  // }

  return (
    <BrowserRouter>
      <Routes>
        <Route path='/' element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path='tasks' element={<Tasks />} />
          <Route path='leads' element={<Leads />} />
          <Route path='funnels' element={<Funnels />} />
          <Route path='settings' element={<Settings />} />
        </Route>
        <Route path='*' element={<Navigate to='/' replace />} />
      </Routes>
    </BrowserRouter>
  );
}
