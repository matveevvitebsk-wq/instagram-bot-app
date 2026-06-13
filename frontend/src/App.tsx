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
import Landing from '@/pages/Landing';

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

  // Вне Telegram — показываем лендинг
  if (!initData && !isAuthenticated) {
    return <Landing />;
  }

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
