// frontend/src/pages/Settings.tsx
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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

const Settings: React.FC = () => {
  const { tg, user, openLink } = useTelegram();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [account, setAccount] = useState<InstagramAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [connecting, setConnecting] = useState<'instagram' | 'facebook' | null>(
    null,
  );

  const notify = useCallback((message: string) => {
    if (tg?.showAlert) {
      tg.showAlert(message);
    } else {
      window.alert(message);
    }
  }, [tg]);

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

  // After Meta OAuth redirect: backend saved tokens to ig_accounts automatically.
  useEffect(() => {
    const instagram = searchParams.get('instagram');
    const facebook = searchParams.get('facebook');
    if (!instagram && !facebook) return;

    const message =
      instagram === 'connected'
        ? 'Instagram подключён. IGAA токен сохранён на сервере.'
        : facebook === 'connected'
          ? 'Facebook подключён. EAAV токен сохранён на сервере.'
          : instagram === 'error'
            ? 'Не удалось подключить Instagram. Проверьте, что вы тестер приложения Meta.'
            : facebook === 'error'
              ? 'Не удалось подключить Facebook. Сначала подключите Instagram, затем повторите.'
              : null;

    if (message) {
      notify(message);
    }

    void fetchAccountStatus();
    const next = new URLSearchParams(searchParams);
    next.delete('instagram');
    next.delete('facebook');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, fetchAccountStatus, notify]);

  const startOAuth = async (provider: 'instagram' | 'facebook') => {
    const telegramId = user?.id;
    if (!telegramId) {
      notify('Telegram ID not found');
      return;
    }

    setConnecting(provider);
    try {
      const path =
        provider === 'instagram'
          ? '/api/instagram/meta/url'
          : '/api/instagram/facebook/url';
      const response = await api.get(path, {
        params: { telegram_id: telegramId },
      });
      const authUrl = response.data.auth_url as string;
      // Meta OAuth must leave the Mini App WebView; openLink is the supported path.
      openLink(authUrl);
    } catch (error) {
      console.error(`${provider} OAuth error:`, error);
      notify(
        provider === 'instagram'
          ? 'Не удалось начать подключение Instagram.'
          : 'Не удалось начать подключение Facebook.',
      );
    } finally {
      setConnecting(null);
    }
  };

  const handleRefreshTokens = async () => {
    if (refreshing) return;

    setRefreshing(true);
    try {
      const response = await api.post('/api/instagram/tokens/refresh');
      const nextAccount = response.data?.account;
      if (nextAccount) {
        setAccount(nextAccount);
        notifyInstagramConnection(Boolean(nextAccount.connected));
      } else {
        await fetchAccountStatus();
      }

      const reauthNeeded =
        Number(response.data?.instagram?.reauth_required || 0) > 0;
      notify(
        reauthNeeded
          ? 'Токен Instagram требует повторного подключения.'
          : 'Токены проверены и обновлены на сервере.',
      );
    } catch (error) {
      console.error('Failed to refresh Meta tokens:', error);
      notify('Не удалось обновить токены. Попробуйте позже.');
    } finally {
      setRefreshing(false);
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
      notify('Не удалось отключить Instagram аккаунт');
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
  const facebookConnected =
    Boolean(account?.facebook_token_is_valid) &&
    !account?.facebook_token_refresh_required;

  return (
    <div className='p-4 pb-20'>
      <h2 className='text-xl font-semibold mb-4'>Настройки</h2>

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
                <p
                  className='text-xs mt-1'
                  style={{ color: 'var(--tg-theme-hint-color)' }}
                >
                  IGAA: {account.token_expires_at ? 'сохранён на сервере' : 'есть / срок неизвестен'}
                  {' · '}
                  EAAV:{' '}
                  {facebookConnected
                    ? 'сохранён на сервере'
                    : 'не подключён'}
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
                type='button'
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
                onClick={() => void startOAuth('instagram')}
                disabled={connecting === 'instagram'}
                className='col-span-2 w-full px-3 py-2.5 rounded-xl text-sm font-medium active:opacity-70 disabled:opacity-60'
                style={{
                  border: '1px solid var(--tg-theme-button-color)',
                  color: 'var(--tg-theme-button-color)',
                  background: 'transparent',
                }}
              >
                {connecting === 'instagram'
                  ? 'Открытие Instagram…'
                  : 'Переподключить Instagram (получить IGAA)'}
              </button>
              <button
                type='button'
                onClick={() => void startOAuth('facebook')}
                disabled={connecting === 'facebook'}
                className='col-span-2 w-full px-3 py-2.5 rounded-xl text-sm font-medium active:opacity-70 disabled:opacity-60'
                style={{
                  background: facebookConnected
                    ? 'rgba(34,197,94,0.12)'
                    : 'var(--tg-theme-button-color)',
                  color: facebookConnected
                    ? '#16a34a'
                    : 'var(--tg-theme-button-text-color)',
                  border: facebookConnected
                    ? '1px solid rgba(34,197,94,0.35)'
                    : 'none',
                }}
              >
                {connecting === 'facebook'
                  ? 'Открытие Facebook…'
                  : facebookConnected
                    ? '✓ Facebook токен сохранён — переподключить'
                    : 'Подключить Facebook (получить EAAV)'}
              </button>
              <p
                className='col-span-2 text-xs text-center mt-1'
                style={{ color: 'var(--tg-theme-hint-color)' }}
              >
                Токены получает backend через OAuth Meta и сразу пишет в таблицу
                ig_accounts. В приложение они не возвращаются.
              </p>
            </div>
          </div>
        ) : (
          <div className='space-y-3'>
            <p className='text-gray-600 dark:text-gray-400 text-sm'>
              Подключите Instagram Business/Creator. После согласия Meta токен
              IGAA автоматически сохранится в базе.
            </p>

            <button
              type='button'
              onClick={() => void startOAuth('instagram')}
              disabled={connecting === 'instagram'}
              className='w-full py-3 border-2 border-blue-600 text-blue-600 rounded-lg font-medium hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all disabled:opacity-60'
            >
              {connecting === 'instagram'
                ? 'Открытие Instagram…'
                : '🔑 Войти в существующий'}
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
