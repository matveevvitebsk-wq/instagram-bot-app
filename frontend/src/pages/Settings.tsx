import { useState, useEffect } from 'react';
import api from '../utils/api';
import { useTelegram } from '@/hooks/useTelegram'; // НОВОЕ: для openLink

interface InstagramAccount {
  username: string;
  display_name: string;
  profile_picture_url: string;
  followers_count: number;
  mode: string;
  is_active: boolean;
}

export default function Settings() {
  const { openLink } = useTelegram(); // НОВОЕ
  const [account, setAccount] = useState<InstagramAccount | null>(null);
  const [isDev, setIsDev] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    api
      .get('/api/accounts/')
      .then((res) => {
        const active = res.data?.find((a: InstagramAccount) => a.is_active);
        if (active) {
          setAccount(active);
          setIsDev(active.mode === 'development');
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    const params = new URLSearchParams(window.location.search);
    if (params.get('instagram') === 'connected') {
      window.history.replaceState({}, '', '/settings');
    }
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      console.log('Получаем OAuth URL...');

      const res = await api.get('/api/auth/meta/url');

      console.log(res.data);

      // ИСПРАВЛЕНО: было window.location.href = res.data.url
      // window.location.href на внешний домен внутри Telegram WebView
      // либо блокируется, либо Meta детектит in-app browser и отдаёт ошибку.
      // openLink() открывает системный браузер — OAuth проходит корректно.
      openLink(res.data.url);
      // Оставляем connecting=true ненадолго, чтобы показать подсказку ниже.
      // Сбрасывать не обязательно — пользователь покидает Mini App.
    } catch (e) {
      console.error(e);
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    await api.delete('/api/auth/meta/disconnect');
    setAccount(null);
  };

  if (loading) {
    return (
      <div className='flex items-center justify-center h-64'>
        <div className='text-[var(--tg-theme-hint-color)]'>Загрузка...</div>
      </div>
    );
  }

  return (
    <div className='p-4 space-y-4'>
      <h1 className='text-xl font-bold text-[var(--tg-theme-text-color)]'>
        Настройки
      </h1>

      {isDev && account && (
        <div className='bg-yellow-500/15 border border-yellow-500/40 rounded-xl p-3'>
          <p className='text-yellow-400 text-sm font-medium'>
            Режим тестирования
          </p>
          <p className='text-yellow-300/80 text-xs mt-1'>
            Сервис работает в режиме разработки. Автоматизация доступна только
            для аккаунтов в списке тестеров Meta. После получения ИП будет
            доступно всем пользователям.
          </p>
        </div>
      )}

      <div className='bg-[var(--tg-theme-secondary-bg-color)] rounded-xl p-4 space-y-3'>
        <h2 className='text-base font-semibold text-[var(--tg-theme-text-color)]'>
          Instagram аккаунт
        </h2>

        {account ? (
          <div className='space-y-3'>
            <div className='flex items-center gap-3'>
              {account.profile_picture_url && (
                <img
                  src={account.profile_picture_url}
                  alt={account.username}
                  className='w-12 h-12 rounded-full object-cover'
                />
              )}
              <div>
                <p className='text-[var(--tg-theme-text-color)] font-medium'>
                  @{account.username}
                </p>
                <p className='text-[var(--tg-theme-hint-color)] text-sm'>
                  {account.followers_count?.toLocaleString()} подписчиков
                </p>
              </div>
              <div className='ml-auto'>
                <span className='bg-green-500/20 text-green-400 text-xs px-2 py-1 rounded-full'>
                  Подключён
                </span>
              </div>
            </div>
            <button
              onClick={handleDisconnect}
              className='w-full py-2 rounded-lg border border-red-500/40 text-red-400 text-sm'
            >
              Отключить аккаунт
            </button>
          </div>
        ) : (
          <div className='space-y-3'>
            <p className='text-[var(--tg-theme-hint-color)] text-sm'>
              Подключите Instagram Business или Creator аккаунт.
            </p>
            <div className='bg-blue-500/10 border border-blue-500/30 rounded-lg p-3'>
              <p className='text-blue-300 text-xs'>
                Сервис в режиме тестирования. Напишите нам в @mediahave_bot — мы
                добавим вас в список тестеров Meta.
              </p>
            </div>
            <button
              onClick={handleConnect}
              disabled={connecting}
              className='w-full py-3 rounded-xl bg-[var(--tg-theme-button-color)] text-[var(--tg-theme-button-text-color)] font-medium disabled:opacity-50'
            >
              {connecting ? 'Открываем Instagram...' : 'Подключить Instagram'}
            </button>
            {/* НОВОЕ: подсказка — OAuth открывается вне Mini App */}
            {connecting && (
              <p
                className='text-xs text-center'
                style={{ color: 'var(--tg-theme-hint-color)' }}
              >
                Откроется браузер для авторизации в Instagram. После подключения
                вернитесь в Telegram и откройте бота заново.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
// v4 — openLink вместо window.location.href для корректного OAuth из Telegram WebView
// import { useState, useEffect } from "react";
// import api from "../utils/api";

// interface InstagramAccount {
//   username: string;
//   display_name: string;
//   profile_picture_url: string;
//   followers_count: number;
//   mode: string;
//   is_active: boolean;
// }

// export default function Settings() {
//   const [account, setAccount] = useState<InstagramAccount | null>(null);
//   const [isDev, setIsDev] = useState(false);
//   const [loading, setLoading] = useState(true);
//   const [connecting, setConnecting] = useState(false);

//   useEffect(() => {
//     api.get("/api/accounts/")
//       .then((res) => {
//         const active = res.data?.find((a: InstagramAccount) => a.is_active);
//         if (active) {
//           setAccount(active);
//           setIsDev(active.mode === "development");
//         }
//       })
//       .catch(() => {})
//       .finally(() => setLoading(false));

//     const params = new URLSearchParams(window.location.search);
//     if (params.get("instagram") === "connected") {
//       window.history.replaceState({}, "", "/settings");
//     }
//   }, []);

//   const handleConnect = async () => {
//     setConnecting(true);
//     try {
//       const res = await api.get("/api/auth/meta/url");
//       window.location.href = res.data.url;
//     } catch {
//       setConnecting(false);
//     }
//   };

//   const handleDisconnect = async () => {
//     await api.delete("/api/auth/meta/disconnect");
//     setAccount(null);
//   };

//   if (loading) {
//     return (
//       <div className="flex items-center justify-center h-64">
//         <div className="text-[var(--tg-theme-hint-color)]">Загрузка...</div>
//       </div>
//     );
//   }

//   return (
//     <div className="p-4 space-y-4">
//       <h1 className="text-xl font-bold text-[var(--tg-theme-text-color)]">
//         Настройки
//       </h1>

//       {isDev && account && (
//         <div className="bg-yellow-500/15 border border-yellow-500/40 rounded-xl p-3">
//           <p className="text-yellow-400 text-sm font-medium">
//             Режим тестирования
//           </p>
//           <p className="text-yellow-300/80 text-xs mt-1">
//             Сервис работает в режиме разработки. Автоматизация доступна
//             только для аккаунтов в списке тестеров Meta. После получения ИП
//             будет доступно всем пользователям.
//           </p>
//         </div>
//       )}

//       <div className="bg-[var(--tg-theme-secondary-bg-color)] rounded-xl p-4 space-y-3">
//         <h2 className="text-base font-semibold text-[var(--tg-theme-text-color)]">
//           Instagram аккаунт
//         </h2>

//         {account ? (
//           <div className="space-y-3">
//             <div className="flex items-center gap-3">
//               {account.profile_picture_url && (
//                 <img
//                   src={account.profile_picture_url}
//                   alt={account.username}
//                   className="w-12 h-12 rounded-full object-cover"
//                 />
//               )}
//               <div>
//                 <p className="text-[var(--tg-theme-text-color)] font-medium">
//                   @{account.username}
//                 </p>
//                 <p className="text-[var(--tg-theme-hint-color)] text-sm">
//                   {account.followers_count?.toLocaleString()} подписчиков
//                 </p>
//               </div>
//               <div className="ml-auto">
//                 <span className="bg-green-500/20 text-green-400 text-xs px-2 py-1 rounded-full">
//                   Подключён
//                 </span>
//               </div>
//             </div>
//             <button
//               onClick={handleDisconnect}
//               className="w-full py-2 rounded-lg border border-red-500/40 text-red-400 text-sm"
//             >
//               Отключить аккаунт
//             </button>
//           </div>
//         ) : (
//           <div className="space-y-3">
//             <p className="text-[var(--tg-theme-hint-color)] text-sm">
//               Подключите Instagram Business или Creator аккаунт.
//             </p>
//             <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
//               <p className="text-blue-300 text-xs">
//                 Сервис в режиме тестирования. Напишите нам в @mediahave_bot
//                 — мы добавим вас в список тестеров Meta.
//               </p>
//             </div>
//             <button
//               onClick={handleConnect}
//               disabled={connecting}
//               className="w-full py-3 rounded-xl bg-[var(--tg-theme-button-color)] text-[var(--tg-theme-button-text-color)] font-medium disabled:opacity-50"
//             >
//               {connecting ? "Открываем Instagram..." : "Подключить Instagram"}
//             </button>
//           </div>
//         )}
//       </div>
//     </div>
//   );
// }
// // v3
