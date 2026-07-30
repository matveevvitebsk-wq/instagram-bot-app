import { useEffect, useState } from 'react';
import { useTelegram } from '@/hooks/useTelegram';
import api from '@/utils/api';

interface AutoReplyTask {
  id: string;
  task_type: 'keyword_funnel' | 'dm_reply';
  status: string;
  payload: {
    trigger_keyword?: string;
    reply_text?: string;
    content_type?: string;
    media_link?: string | null;
    is_active?: boolean;
    [key: string]: unknown;
  };
  created_at: string;
}

function isAutoReplyActive(task: AutoReplyTask) {
  return task.payload?.is_active ?? task.status !== 'cancelled';
}

export default function AutoReplyDM() {
  const { tg } = useTelegram();
  const [autoReplies, setAutoReplies] = useState<AutoReplyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [replyText, setReplyText] = useState('');
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [igAccountId, setIgAccountId] = useState<string | null>(null);

  useEffect(() => {
    void loadAutoReplies();
    void loadAccount();
  }, []);

  async function loadAccount() {
    try {
      const res = await api.get('/api/accounts/');
      const accounts = res.data?.accounts ?? res.data;
      const active = accounts.find((account: { is_active: boolean }) => account.is_active);
      if (active) setIgAccountId(active.id);
    } catch {
      // The form can still create an unassigned rule.
    }
  }

  async function loadAutoReplies() {
    try {
      const res = await api.get('/api/tasks/?auto_reply_only=true');
      setAutoReplies(res.data?.tasks ?? []);
    } catch {
      setError('Не удалось загрузить авто-ответы');
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setKeyword('');
    setReplyText('');
    setEditingId(null);
    setShowForm(false);
  }

  function openCreateForm() {
    if (showForm && !editingId) {
      resetForm();
      return;
    }
    setKeyword('');
    setReplyText('');
    setEditingId(null);
    setShowForm(true);
    setError(null);
  }

  function openEditForm(task: AutoReplyTask) {
    setKeyword(task.payload?.trigger_keyword ?? '');
    setReplyText(task.payload?.reply_text ?? '');
    setEditingId(task.id);
    setShowForm(true);
    setError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function saveAutoReply() {
    if (!keyword.trim() || !replyText.trim()) return;
    setSaving(true);
    setError(null);
    const payload = {
      trigger_keyword: keyword.trim(),
      reply_text: replyText.trim(),
    };

    try {
      if (editingId) {
        const currentTask = autoReplies.find((task) => task.id === editingId);
        const res = await api.patch(`/api/tasks/${editingId}`, {
          payload: { ...currentTask?.payload, ...payload },
        });
        setAutoReplies((previous) =>
          previous.map((task) => (task.id === editingId ? res.data : task)),
        );
      } else {
        const res = await api.post('/api/tasks/', {
          task_type: 'dm_reply',
          ig_account_id: igAccountId,
          payload: {
            ...payload,
            content_type: 'ALL',
            is_active: true,
          },
        });
        setAutoReplies((previous) => [res.data, ...previous]);
      }
      resetForm();
    } catch (requestError: any) {
      setError(
        requestError?.response?.data?.detail ||
          `Не удалось ${editingId ? 'сохранить' : 'создать'} авто-ответ`,
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleAutoReply(id: string) {
    setTogglingId(id);
    setError(null);
    try {
      const res = await api.patch(`/api/tasks/${id}/toggle`);
      setAutoReplies((previous) =>
        previous.map((task) => (task.id === id ? res.data : task)),
      );
    } catch (requestError: any) {
      setError(requestError?.response?.data?.detail || 'Не удалось изменить статус');
    } finally {
      setTogglingId(null);
    }
  }

  function confirmDelete(task: AutoReplyTask) {
    const message = `Удалить авто-ответ для ключевого слова «${task.payload?.trigger_keyword ?? ''}»?`;
    const remove = () => void deleteAutoReply(task.id);

    if (tg) {
      tg.showConfirm(message, (confirmed) => {
        if (confirmed) remove();
      });
    } else if (window.confirm(message)) {
      remove();
    }
  }

  async function deleteAutoReply(id: string) {
    setDeletingId(id);
    setError(null);
    try {
      await api.delete(`/api/tasks/${id}`);
      setAutoReplies((previous) => previous.filter((task) => task.id !== id));
      if (editingId === id) resetForm();
    } catch (requestError: any) {
      setError(requestError?.response?.data?.detail || 'Не удалось удалить авто-ответ');
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <div className='flex items-center justify-center h-48'>
        <div className='text-sm' style={{ color: 'var(--tg-theme-hint-color)' }}>
          Загрузка...
        </div>
      </div>
    );
  }

  return (
    <div className='p-4 pb-24 max-w-lg mx-auto'>
      <div className='flex items-center justify-between gap-3 mb-4'>
        <h1
          className='text-lg font-semibold'
          style={{ color: 'var(--tg-theme-text-color)' }}
        >
          Авто-ответ в DM
        </h1>
        <button
          onClick={openCreateForm}
          className='text-sm px-3 py-1.5 rounded-lg font-medium shrink-0'
          style={{
            background: 'var(--tg-theme-button-color)',
            color: 'var(--tg-theme-button-text-color)',
          }}
        >
          {showForm && !editingId ? 'Отмена' : '+ Создать'}
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
          <div className='flex items-center justify-between mb-3'>
            <p
              className='text-xs font-medium'
              style={{ color: 'var(--tg-theme-hint-color)' }}
            >
              {editingId ? 'РЕДАКТИРОВАНИЕ АВТО-ОТВЕТА' : 'НОВЫЙ АВТО-ОТВЕТ'}
            </p>
            {editingId && (
              <button
                onClick={resetForm}
                className='text-xs'
                style={{ color: 'var(--tg-theme-link-color)' }}
              >
                Отмена
              </button>
            )}
          </div>
          {!editingId && !igAccountId && (
            <div
              className='mb-3 p-2 rounded-lg text-xs'
              style={{ background: '#fef3c7', color: '#92400e' }}
            >
              ⚠️ Instagram аккаунт не подключён. Авто-ответ будет создан без
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
              onChange={(event) => setKeyword(event.target.value)}
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
              onChange={(event) => setReplyText(event.target.value)}
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
            onClick={() => void saveAutoReply()}
            disabled={saving || !keyword.trim() || !replyText.trim()}
            className='w-full py-2.5 rounded-lg text-sm font-medium disabled:opacity-50'
            style={{
              background: 'var(--tg-theme-button-color)',
              color: 'var(--tg-theme-button-text-color)',
            }}
          >
            {saving
              ? 'Сохранение...'
              : editingId
                ? 'Сохранить изменения'
                : 'Создать авто-ответ'}
          </button>
        </div>
      )}

      {autoReplies.length === 0 && !showForm && (
        <div
          className='text-center py-16 rounded-xl'
          style={{ background: 'var(--tg-theme-secondary-bg-color)' }}
        >
          <div className='text-4xl mb-3'>💬</div>
          <p
            className='text-sm font-medium mb-1'
            style={{ color: 'var(--tg-theme-text-color)' }}
          >
            Авто-ответов пока нет
          </p>
          <p
            className='text-xs px-6'
            style={{ color: 'var(--tg-theme-hint-color)' }}
          >
            Создайте правило — когда кто-то напишет ключевое слово в комментарии,
            бот автоматически отправит ему DM
          </p>
        </div>
      )}

      {autoReplies.length > 0 && (
        <div className='space-y-3'>
          {autoReplies.map((rule) => (
            <div
              key={rule.id}
              className='p-4 rounded-xl'
              style={{
                background: 'var(--tg-theme-secondary-bg-color)',
                opacity: isAutoReplyActive(rule) ? 1 : 0.65,
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
                    {rule.payload?.trigger_keyword ?? 'Без ключевого слова'}
                  </span>
                  {!isAutoReplyActive(rule) && (
                    <span
                      className='text-xs'
                      style={{ color: 'var(--tg-theme-hint-color)' }}
                    >
                      выкл
                    </span>
                  )}
                </div>
                <button
                  onClick={() => void toggleAutoReply(rule.id)}
                  disabled={togglingId === rule.id}
                  aria-label={`${isAutoReplyActive(rule) ? 'Выключить' : 'Включить'} авто-ответ`}
                  aria-pressed={isAutoReplyActive(rule)}
                  className='relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50'
                  style={{
                    background: isAutoReplyActive(rule)
                      ? 'var(--tg-theme-button-color)'
                      : 'var(--tg-theme-hint-color)',
                  }}
                >
                  <span
                    className='inline-block h-4 w-4 transform rounded-full bg-white transition-transform'
                    style={{
                      transform: isAutoReplyActive(rule)
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
                {rule.payload?.reply_text ?? ''}
              </p>
              <div className='flex items-end justify-between gap-3'>
                <span
                  className='text-xs'
                  style={{ color: 'var(--tg-theme-hint-color)' }}
                >
                  {(rule.payload?.content_type ?? 'ALL') === 'ALL'
                    ? 'Все типы контента'
                    : rule.payload?.content_type}
                </span>
                <div className='flex items-center gap-2 shrink-0'>
                  <button
                    onClick={() => openEditForm(rule)}
                    className='text-xs px-3 py-1.5 rounded-lg font-medium'
                    style={{
                      color: 'var(--tg-theme-button-color)',
                      border: '1px solid var(--tg-theme-button-color)',
                    }}
                  >
                    Изменить
                  </button>
                  <button
                    onClick={() => confirmDelete(rule)}
                    disabled={deletingId === rule.id}
                    className='text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-50'
                    style={{
                      color: '#ff3b30',
                      border: '1px solid rgba(255,59,48,0.45)',
                      background: 'rgba(255,59,48,0.08)',
                    }}
                  >
                    {deletingId === rule.id ? 'Удаление...' : 'Удалить'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
