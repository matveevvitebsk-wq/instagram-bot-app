import { useEffect, useState } from 'react'; // GOOGLE II: Добавлен импорт React, если проект ругается на глобальный JSX
// import { useEffect, useState } from "react";
import api from '../utils/api';

interface Funnel {
  id: string;
  trigger_keyword: string;
  reply_text: string;
  content_type: string;
  media_link: string | null;
  is_active: boolean;
  created_at: string;
}

export default function Funnels() {
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [replyText, setReplyText] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [igAccountId, setIgAccountId] = useState<string | null>(null);

  useEffect(() => {
    loadFunnels();
    loadAccount();
  }, []);

  async function loadAccount() {
    try {
      const res = await api.get('/api/accounts/');
      const active = res.data.find((a: any) => a.is_active);
      if (active) setIgAccountId(active.id);
    } catch {}
  }

  async function loadFunnels() {
    try {
      const res = await api.get('/api/funnels/');
      setFunnels(res.data);
    } catch {
      setError('Не удалось загрузить воронки');
    } finally {
      setLoading(false);
    }
  }

  async function createFunnel() {
    if (!keyword.trim() || !replyText.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await api.post('/api/funnels/', {
        trigger_keyword: keyword.trim(),
        reply_text: replyText.trim(),
        ig_account_id: igAccountId,
      });
      setFunnels((prev) => [res.data, ...prev]);
      setKeyword('');
      setReplyText('');
      setShowForm(false);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Ошибка при создании воронки');
    } finally {
      setCreating(false);
    }
  }

  async function toggleFunnel(id: string) {
    try {
      const res = await api.patch(`/api/funnels/\${id}/toggle`);
      setFunnels((prev) =>
        prev.map((f) =>
          f.id === id ? { ...f, is_active: res.data.is_active } : f,
        ),
      );
    } catch {
      setError('Не удалось изменить статус');
    }
  }

  async function deleteFunnel(id: string) {
    try {
      await api.delete(`/api/funnels/\${id}`);
      setFunnels((prev) => prev.filter((f) => f.id !== id));
    } catch {
      setError('Не удалось удалить воронку');
    }
  }

  if (loading)
    return (
      <div className='flex items-center justify-center h-48'>
        <div
          className='text-sm'
          style={{ color: 'var(--tg-theme-hint-color)' }}
        >
          Загрузка...
        </div>
      </div>
    );

  return (
    <div className='p-4 pb-24 max-w-lg mx-auto'>
      <div className='flex items-center justify-between mb-4'>
        <h1
          className='text-lg font-semibold'
          style={{ color: 'var(--tg-theme-text-color)' }}
        >
          Воронки
        </h1>
        <button
          onClick={() => {
            setShowForm((v) => !v);
            setError(null);
          }}
          className='text-sm px-3 py-1.5 rounded-lg font-medium'
          style={{
            background: 'var(--tg-theme-button-color)',
            color: 'var(--tg-theme-button-text-color)',
          }}
        >
          {showForm ? 'Отмена' : '+ Создать'}
        </button>
      </div>

      {error && (
        <div
          className='mb-4 p-3 rounded-lg text-sm'
          style={{ background: '#fee2e2', color: '#dc2626' }}
        >
          {error}
        </div>
      )}

      {showForm && (
        <div
          className='mb-4 p-4 rounded-xl'
          style={{ background: 'var(--tg-theme-secondary-bg-color)' }}
        >
          <p
            className='text-xs font-medium mb-3'
            style={{ color: 'var(--tg-theme-hint-color)' }}
          >
            НОВАЯ ВОРОНКА
          </p>
          {!igAccountId && (
            <div
              className='mb-3 p-2 rounded-lg text-xs'
              style={{ background: '#fef3c7', color: '#92400e' }}
            >
              ⚠️ Instagram аккаунт не подключён. Воронка будет создана без
              привязки к аккаунту.
            </div>
          )}
          <div className='mb-3'>
            <label
              className='text-xs mb-1 block'
              style={{ color: 'var(--tg-theme-hint-color)' }}
            >
              Ключевое слово
            </label>
            <input
              type='text'
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder='например: цена'
              className='w-full px-3 py-2 rounded-lg text-sm outline-none'
              style={{
                background: 'var(--tg-theme-bg-color)',
                color: 'var(--tg-theme-text-color)',
                border: '1px solid var(--tg-theme-hint-color)',
              }}
            />
          </div>
          <div className='mb-4'>
            <label
              className='text-xs mb-1 block'
              style={{ color: 'var(--tg-theme-hint-color)' }}
            >
              Текст ответного DM
            </label>
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder='Привет! Вот наш прайс: ...'
              rows={3}
              className='w-full px-3 py-2 rounded-lg text-sm outline-none resize-none'
              style={{
                background: 'var(--tg-theme-bg-color)',
                color: 'var(--tg-theme-text-color)',
                border: '1px solid var(--tg-theme-hint-color)',
              }}
            />
          </div>
          <button
            onClick={createFunnel}
            disabled={creating || !keyword.trim() || !replyText.trim()}
            className='w-full py-2.5 rounded-lg text-sm font-medium disabled:opacity-50'
            style={{
              background: 'var(--tg-theme-button-color)',
              color: 'var(--tg-theme-button-text-color)',
            }}
          >
            {creating ? 'Создание...' : 'Создать воронку'}
          </button>
        </div>
      )}

      {funnels.length === 0 && !showForm && (
        <div
          className='text-center py-16 rounded-xl'
          style={{ background: 'var(--tg-theme-secondary-bg-color)' }}
        >
          <div className='text-4xl mb-3'>🎯</div>
          <p
            className='text-sm font-medium mb-1'
            style={{ color: 'var(--tg-theme-text-color)' }}
          >
            Воронок пока нет
          </p>
          <p
            className='text-xs px-6'
            style={{ color: 'var(--tg-theme-hint-color)' }}
          >
            Создайте воронку — когда кто-то напишет ключевое слово в
            комментарии, бот автоматически отправит им DM
          </p>
        </div>
      )}

      {funnels.length > 0 && (
        <div className='space-y-3'>
          {funnels.map((funnel) => (
            <div
              key={funnel.id}
              className='p-4 rounded-xl'
              style={{
                background: 'var(--tg-theme-secondary-bg-color)',
                opacity: funnel.is_active ? 1 : 0.6,
              }}
            >
              <div className='flex items-center justify-between mb-2'>
                <div className='flex items-center gap-2'>
                  <span
                    className='text-xs px-2 py-0.5 rounded-full font-mono font-medium'
                    style={{
                      background: 'var(--tg-theme-button-color)',
                      color: 'var(--tg-theme-button-text-color)',
                    }}
                  >
                    {funnel.trigger_keyword}
                  </span>
                  {!funnel.is_active && (
                    <span
                      className='text-xs'
                      style={{ color: 'var(--tg-theme-hint-color)' }}
                    >
                      выкл
                    </span>
                  )}
                </div>
                <button
                  onClick={() => toggleFunnel(funnel.id)}
                  className='relative inline-flex h-6 w-11 items-center rounded-full transition-colors'
                  style={{
                    background: funnel.is_active
                      ? 'var(--tg-theme-button-color)'
                      : 'var(--tg-theme-hint-color)',
                  }}
                >
                  <span
                    className='inline-block h-4 w-4 transform rounded-full bg-white transition-transform'
                    style={{
                      transform: funnel.is_active
                        ? 'translateX(24px)'
                        : 'translateX(4px)',
                    }}
                  />
                </button>
              </div>
              <p
                className='text-sm mb-3 leading-relaxed'
                style={{ color: 'var(--tg-theme-text-color)' }}
              >
                {funnel.reply_text}
              </p>
              <div className='flex items-center justify-between'>
                <span
                  className='text-xs'
                  style={{ color: 'var(--tg-theme-hint-color)' }}
                >
                  {funnel.content_type === 'ALL'
                    ? 'Все типы контента'
                    : funnel.content_type}
                </span>
                <button
                  onClick={() => deleteFunnel(funnel.id)}
                  className='text-xs px-2 py-1 rounded-lg'
                  style={{ color: '#ef4444', background: '#fee2e220' }}
                >
                  Удалить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
