// frontend/src/pages/Settings.tsx
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTelegram } from '../hooks/useTelegram';
import api from '../utils/api';
import { notifyInstagramConnection } from '../utils/instagramConnection';

interface InstagramAccount {
  id: string;
  username: string;
  display_name?: string | null;
  profile_picture_url?: string | null;
  connected: boolean;
  status: 'active' | 'pending' | 'error' | 'disconnected';
  token_expires_at?: string | null;
  facebook_token_is_valid?: boolean;
  facebook_token_refresh_required?: boolean;
  facebook_token_expires_at?: string | null;
  facebook_token_last_checked_at?: string | null;
  facebook_comments_available?: boolean;
}

const FACEBOOK_COMMENTS_DISABLED_MESSAGE =
  'Подключить Facebook для комментариев — временно не работает';

const Settings: React.FC = () => {
  const { tg, user } = useTelegram();
  const navigate = useNavigate();
  const [account, setAccount] = useState<InstagramAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAccountStatus = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      const response = await api.get(`/api/instagram/status/${user.id}`);
      setAccount(response.data);
      notifyInstagramConnection(Boolean(response.data?.connected));
    } catch (error) {
      console.error('Failed to fetch account status:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        void fetchAccountStatus();
      }
    };

    void fetchAccountStatus();
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [fetchAccountStatus]);

  const handleConnectInstagram = async () => {
    try {
      const telegramId = user?.id;

      if (!telegramId) {
        alert('Telegram ID not found');
        return;
      }

      const response = await api.get('/api/instagram/meta/url', {
        params: {
          telegram_id: telegramId,
        },
      });
      const authUrl = response.data.auth_url;

      window.location.assign(authUrl);
    } catch (error) {
      console.error('Instagram OAuth error: ', error);
    }
  };

  const handleRefreshTokens = async () => {
    if (refreshing) return;

    setRefreshing(true);
    try {
      // Backend validates/refreshes IGAA (and checks EAAV) in storage.
      // Bearer tokens are never returned to the Mini App.
      const response = await api.post('/api/instagram/tokens/refresh');
      const nextAccount = response.data?.account;
      if (nextAccount) {
        setAccount(nextAccount);
        notifyInstagramConnection(Boolean(nextAccount.connected));
      } else {
        await fetchAccountStatus();
      }

      const reauthNeeded = Number(response.data?.instagram?.reauth_required || 0) > 0;
      const message = reauthNeeded
        ? 'Токен Instagram требует повторного подключения.'
        : 'Токены проверены и обновлены на сервере.';

      if (tg?.showAlert) {
        tg.showAlert(message);
      } else {
        alert(message);
      }
    } catch (error) {
      console.error('Failed to refresh Meta tokens:', error);
      const message = 'Не удалось обновить токены. Попробуйте позже.';
      if (tg?.showAlert) {
        tg.showAlert(message);
      } else {
        alert(message);
      }
    } finally {
      setRefreshing(false);
    }
  };

  const showFacebookDisabledInfo = () => {
    if (tg?.showAlert) {
      tg.showAlert(FACEBOOK_COMMENTS_DISABLED_MESSAGE);
    } else {
      alert(FACEBOOK_COMMENTS_DISABLED_MESSAGE);
    }
  };

  const disconnectInstagram = async () => {
    if (!account?.id) return;

    try {
      await api.delete(`/api/accounts/${account.id}`);
      setAccount(null);
      notifyInstagramConnection(false);
      navigate('/', { replace: true });
    } catch (error) {
      console.error('Failed to disconnect Instagram account:', error);
      alert('Не удалось отключить Instagram аккаунт');
    }
  };

  const handleFinish = () => {
    const message =
      'Отключить Instagram аккаунт от MediaHave и удалить сохранённый токен?';

    if (tg) {
      tg.showConfirm(message, (confirmed) => {
        if (confirmed) void disconnectInstagram();
      });
    } else if (window.confirm(message)) {
      void disconnectInstagram();
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

  const accountInitial = (account?.display_name || account?.username || 'I')
    .charAt(0)
    .toUpperCase();

  return (
    <div className='p-4 pb-20'>
      <h2 className='text-xl font-semibold mb-4'>Настройки</h2>

      {/* Instagram Account Section */}
      <div
        className='rounded-2xl p-4 mb-4'
        style={{
          background: 'var(--tg-theme-secondary-bg-color)',
          border: '1px solid rgba(127,127,127,0.16)',
        }}
      >
        <h3 className='text-lg font-medium mb-3'>Instagram аккаунт</h3>

        {account?.connected ? (
          <div>
            <div className='flex items-center gap-3 min-w-0'>
              {account.profile_picture_url ? (
                <img
                  src={account.profile_picture_url}
                  alt={`Аватар @${account.username}`}
                  className='w-14 h-14 rounded-full object-cover shrink-0'
                  referrerPolicy='no-referrer'
                />
              ) : (
                <div
                  className='w-14 h-14 rounded-full flex items-center justify-center text-xl font-semibold shrink-0'
                  style={{
                    background:
                      'linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)',
                    color: '#fff',
                  }}
                  aria-hidden='true'
                >
                  {accountInitial}
                </div>
              )}
              <div className='min-w-0'>
                {account.display_name && (
                  <p
                    className='font-semibold break-words'
                    style={{ color: 'var(--tg-theme-text-color)' }}
                  >
                    {account.display_name}
                  </p>
                )}
                <p
                  className='font-medium break-all'
                  style={{ color: 'var(--tg-theme-text-color)' }}
                >
                  @{account.username}
                </p>
                <p
                  className={`text-sm ${account.status === 'active' ? 'text-green-600' : 'text-yellow-600'}`}
                >
                  {account.status === 'active' ? '✓ Активен' : '⏳ На проверке'}
                </p>
              </div>
            </div>

            <div
              className='grid grid-cols-2 gap-2 mt-4 pt-4'
              style={{ borderTop: '1px solid rgba(127,127,127,0.18)' }}
            >
              <button
                type='button'
                onClick={() => void handleRefreshTokens()}
                disabled={refreshing}
                className='w-full px-3 py-2.5 rounded-xl text-sm font-medium active:opacity-70 disabled:opacity-60'
                style={{
                  background: 'var(--tg-theme-button-color)',
                  color: 'var(--tg-theme-button-text-color)',
                }}
              >
                {refreshing ? 'Обновление…' : 'Обновить'}
              </button>
              <button
                onClick={handleFinish}
                className='w-full px-3 py-2.5 rounded-xl text-sm font-medium active:opacity-70'
                style={{
                  color: '#ff3b30',
                  border: '1px solid rgba(255,59,48,0.45)',
                  background: 'rgba(255,59,48,0.08)',
                }}
              >
                Отключить
              </button>
              <button
                type='button'
                disabled
                onClick={showFacebookDisabledInfo}
                title={FACEBOOK_COMMENTS_DISABLED_MESSAGE}
                aria-disabled='true'
                className='col-span-2 w-full px-3 py-2.5 rounded-xl text-sm font-medium cursor-not-allowed opacity-60'
                style={{
                  color: 'var(--tg-theme-hint-color)',
                  border: '1px solid var(--tg-theme-hint-color)',
                  background: 'rgba(127,127,127,0.08)',
                }}
              >
                {FACEBOOK_COMMENTS_DISABLED_MESSAGE}
              </button>
              <p className='col-span-2 text-xs text-center mt-1' style={{ color: 'var(--tg-theme-hint-color)' }}>
                Кнопка Facebook временно отключена. Публичные комментарии через
                Facebook API пока недоступны.
              </p>
            </div>
          </div>
        ) : (
          <div className='space-y-3'>
            <p className='text-gray-600 dark:text-gray-400 text-sm'>
              Подключите Instagram, если у вас есть аккаунт Business или Creator.
            </p>

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
