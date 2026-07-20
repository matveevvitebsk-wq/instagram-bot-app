import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Инициализируем Telegram WebApp
// Работает на всех платформах — if (window.Telegram?.WebApp) защищает
// от запуска вне Telegram (браузер при разработке)
// if (window.Telegram?.WebApp) {
//   const tg = window.Telegram.WebApp;

//   // Расширяем окно на весь экран (работает на iOS, Android, Desktop)
//   tg.expand();

//   // Сигналим что приложение готово (убирает splash-экран Telegram)
//   tg.ready();

//   // Применяем тему Telegram к CSS переменным (auto light/dark)
//   document.documentElement.setAttribute(
//     "data-theme",
//     tg.colorScheme || "light"
//   );
// }

// Временно для разработки в браузере
if (!window.Telegram?.WebApp) {
  (window as any).Telegram = {
    WebApp: {
      initData: 'mock',
      initDataUnsafe: {
        user: { id: 123456789, first_name: 'Тест', username: 'testuser' },
      },
      expand: () => {},
      ready: () => {},
      colorScheme: 'light',
      platform: 'web',
      BackButton: {
        show: () => {},
        hide: () => {},
        onClick: () => {},
        offClick: () => {},
      },
      MainButton: {
        setText: () => {},
        show: () => {},
        hide: () => {},
        onClick: () => {},
        offClick: () => {},
      },
      HapticFeedback: {
        impactOccurred: () => {},
        notificationOccurred: () => {},
      },
      onEvent: () => {},
      close: () => {},
    },
  };
}
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
