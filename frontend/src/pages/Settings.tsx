// frontend/src/pages/Settings.tsx
import React, { useState, useEffect } from 'react';
import { useTelegram } from '../hooks/useTelegram';
import api from '../utils/api';

interface InstagramAccount {
  id: string;
  username: string;
  connected: boolean;
  status: 'active' | 'pending' | 'error';
}

const Settings: React.FC = () => {
  const { tg, user } = useTelegram();
  const [account, setAccount] = useState<InstagramAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRegistration, setShowRegistration] = useState(false);
  const [regForm, setRegForm] = useState({
    username: '',
    email: '',
    password: '',
    fullName: '',
  });
  const [regStep, setRegStep] = useState<
    'initial' | 'instagram' | 'verification'
  >('initial');

  useEffect(() => {
    fetchAccountStatus();
  }, []);

  const fetchAccountStatus = async () => {
    try {
      const response = await api.get('/api/accounts/status');
      setAccount(response.data);
    } catch (error) {
      console.error('Failed to fetch account status:', error);
    } finally {
      setLoading(false);
    }
  };

  // const handleConnectInstagram = () => {
  //   // Открываем Instagram OAuth
  //   const clientId = import.meta.env.VITE_INSTAGRAM_CLIENT_ID;
  //   const redirectUri = import.meta.env.VITE_INSTAGRAM_REDIRECT_URI;
  //   const scope =
  //     'instagram_basic,instagram_content_publish,pages_read_engagement,pages_manage_metadata';

  //   const authUrl = `https://www.facebook.com/v23.0/dialog/oauth?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&response_type=code`;

  //   // Открываем в новом окне или в Telegram WebView
  //   if (tg) {
  //     tg.openLink(authUrl);
  //     console.log(user);
  //   } else {
  //     window.open(authUrl, '_blank');
  //   }
  // };

  const handleConnectInstagram = async () => {
    try {
      const response = await api.get('/api/auth/meta/url');

      const authUrl = response.data.auth_url;

      if (tg) {
        tg.openLink(authUrl);
      } else {
        window.open(authUrl, '_blank');
      }
    } catch (error) {
      console.error('Instagram OAuth error:', error);
    }
  };

  const handleRegisterInstagram = () => {
    setShowRegistration(true);
    setRegStep('initial');
  };

  const handleSubmitRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegStep('instagram');

    // Имитация открытия Instagram
    setTimeout(() => {
      setRegStep('verification');
    }, 2000);
  };

  const handleStartInstagramAuth = () => {
    // Здесь начинается процесс регистрации через Instagram
    // Открываем Instagram для регистрации
    const instagramUrl = 'https://www.instagram.com/accounts/emailsignup/';

    if (tg) {
      tg.openLink(instagramUrl);
    } else {
      window.open(instagramUrl, '_blank');
    }
  };

  if (loading) {
    return (
      <div className='flex items-center justify-center h-full'>
        <div className='text-center'>
          <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto'></div>
          <p className='mt-2 text-gray-500'>Загрузка...</p>
        </div>
      </div>
    );
  }

  return (
    <div className='p-4 pb-20'>
      <h2 className='text-xl font-semibold mb-4'>Настройки</h2>

      {/* Instagram Account Section */}
      <div className='bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-4'>
        <h3 className='text-lg font-medium mb-3'>Instagram аккаунт</h3>

        {account?.connected ? (
          <div className='space-y-2'>
            <div className='flex items-center justify-between'>
              <div>
                <p className='font-medium'>@{account.username}</p>
                <p
                  className={`text-sm ${account.status === 'active' ? 'text-green-600' : 'text-yellow-600'}`}
                >
                  {account.status === 'active' ? '✓ Активен' : '⏳ На проверке'}
                </p>
              </div>
              <button
                onClick={handleConnectInstagram}
                className='px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700'
              >
                Обновить
              </button>
            </div>
          </div>
        ) : (
          <div className='space-y-3'>
            <p className='text-gray-600 dark:text-gray-400 text-sm'>
              Подключите Instagram Business или Creator аккаунт.
            </p>

            {/* Кнопка регистрации */}
            <button
              onClick={handleRegisterInstagram}
              className='w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-pink-700 transition-all'
            >
              📸 Создать Instagram аккаунт
            </button>

            {/* Кнопка входа (существующий аккаунт) */}
            <button
              onClick={handleConnectInstagram}
              className='w-full py-3 border-2 border-blue-600 text-blue-600 rounded-lg font-medium hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all'
            >
              🔑 Войти в существующий
            </button>

            <div className='text-center text-xs text-gray-500 mt-2'>
              Сервис в режиме тестирования.
              <br />
              Напишите нам в{' '}
              <a
                href='https://t.me/mediahave_bot'
                className='text-blue-600 hover:underline'
              >
                @mediahave_bot
              </a>{' '}
              — мы добавим вас в список тестеров Meta.
            </div>
          </div>
        )}
      </div>

      {/* Модальное окно регистрации */}
      {showRegistration && (
        <div className='fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4'>
          <div className='bg-white dark:bg-gray-800 rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto'>
            <div className='p-6'>
              <div className='flex justify-between items-start mb-4'>
                <h3 className='text-xl font-bold'>Создать Instagram аккаунт</h3>
                <button
                  onClick={() => setShowRegistration(false)}
                  className='text-gray-500 hover:text-gray-700'
                >
                  ✕
                </button>
              </div>

              {regStep === 'initial' && (
                <form onSubmit={handleSubmitRegistration}>
                  <div className='space-y-3'>
                    <div>
                      <label className='block text-sm font-medium mb-1'>
                        Имя пользователя
                      </label>
                      <input
                        type='text'
                        value={regForm.username}
                        onChange={(e) =>
                          setRegForm({ ...regForm, username: e.target.value })
                        }
                        className='w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600'
                        placeholder='username'
                        required
                      />
                    </div>
                    <div>
                      <label className='block text-sm font-medium mb-1'>
                        Email
                      </label>
                      <input
                        type='email'
                        value={regForm.email}
                        onChange={(e) =>
                          setRegForm({ ...regForm, email: e.target.value })
                        }
                        className='w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600'
                        placeholder='email@example.com'
                        required
                      />
                    </div>
                    <div>
                      <label className='block text-sm font-medium mb-1'>
                        Пароль
                      </label>
                      <input
                        type='password'
                        value={regForm.password}
                        onChange={(e) =>
                          setRegForm({ ...regForm, password: e.target.value })
                        }
                        className='w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600'
                        placeholder='••••••••'
                        required
                        minLength={6}
                      />
                    </div>
                    <div>
                      <label className='block text-sm font-medium mb-1'>
                        Полное имя
                      </label>
                      <input
                        type='text'
                        value={regForm.fullName}
                        onChange={(e) =>
                          setRegForm({ ...regForm, fullName: e.target.value })
                        }
                        className='w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600'
                        placeholder='John Doe'
                      />
                    </div>

                    <button
                      type='submit'
                      className='w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-pink-700 transition-all mt-2'
                    >
                      Продолжить
                    </button>
                  </div>
                </form>
              )}

              {regStep === 'instagram' && (
                <div className='text-center py-8'>
                  <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4'></div>
                  <p className='text-lg font-medium'>Открываем Instagram...</p>
                  <p className='text-gray-500 text-sm mt-2'>
                    Пожалуйста, подождите
                  </p>
                </div>
              )}

              {regStep === 'verification' && (
                <div className='text-center py-8'>
                  <div className='text-6xl mb-4'>📸</div>
                  <h4 className='text-xl font-bold mb-2'>Почти готово!</h4>
                  <p className='text-gray-600 dark:text-gray-400 mb-4'>
                    Для завершения регистрации откройте Instagram и подтвердите
                    аккаунт.
                  </p>
                  <button
                    onClick={handleStartInstagramAuth}
                    className='w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-pink-700 transition-all'
                  >
                    📱 Открыть Instagram
                  </button>
                  <button
                    onClick={() => setShowRegistration(false)}
                    className='w-full py-2 text-gray-500 hover:text-gray-700 text-sm mt-2'
                  >
                    Закрыть
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Telegram bot info */}
      <div className='bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mt-4'>
        <div className='flex items-start space-x-3'>
          <span className='text-2xl'>🤖</span>
          <div>
            <p className='font-medium'>@mediahave_bot</p>
            <p className='text-sm text-gray-600 dark:text-gray-400'>
              Поддержка и помощь в настройке
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
