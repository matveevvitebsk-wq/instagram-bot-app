import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTelegram } from '@/hooks/useTelegram';
import api from '@/utils/api';
import { supabase } from '@/utils/supabase';
import {
  formatKeywordsLabel,
  keywordsFromPayload,
} from '@/components/KeywordChipsInput';

interface TaskPayload {
  trigger_keywords?: string[];
  reply_text?: string;
  is_active?: boolean;
  [key: string]: unknown;
}

interface Task {
  id: string;
  task_type: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  payload: TaskPayload;
  created_at: string;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; emoji: string }
> = {
  pending: { label: 'В очереди', color: '#ff9500', emoji: '⏳' },
  running: { label: 'Выполняется', color: '#007aff', emoji: '🔄' },
  completed: { label: 'Готово', color: '#34c759', emoji: '✅' },
  failed: { label: 'Ошибка', color: '#ff3b30', emoji: '❌' },
  cancelled: { label: 'Отменено', color: '#8e8e93', emoji: '🚫' },
};

const TASK_TYPE_CONFIG: Record<string, { label: string; emoji: string }> = {
  publish_post: { label: 'Публикация поста', emoji: '📸' },
  keyword_funnel: { label: 'Авто-ответ в DM', emoji: '💬' },
  dm_reply: { label: 'Авто-ответ в DM', emoji: '💬' },
  analytics: { label: 'Сбор аналитики', emoji: '📊' },
};

const CREATE_TASK_TYPES = [
  { value: 'publish_post', ...TASK_TYPE_CONFIG.publish_post },
  { value: 'analytics', ...TASK_TYPE_CONFIG.analytics },
];

const AUTO_REPLY_TYPES = new Set(['keyword_funnel', 'dm_reply']);
const EDITABLE_STATUSES = new Set(['pending', 'cancelled', 'failed']);

function isAutoReplyActive(task: Task) {
  return task.payload?.is_active ?? task.status !== 'cancelled';
}

export default function Tasks() {
  const navigate = useNavigate();
  const { tg, hapticFeedback } = useTelegram();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [replyText, setReplyText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editKeyword, setEditKeyword] = useState('');
  const [editReplyText, setEditReplyText] = useState('');
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [togglingTaskId, setTogglingTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const deletedTaskIds = useRef(new Set<string>());
  const latestTaskRequest = useRef(0);

  const fetchTasks = useCallback(async (silent = false) => {
    const requestId = ++latestTaskRequest.current;
    if (!silent) setLoading(true);
    try {
      const response = await api.get('/api/tasks/');
      if (requestId !== latestTaskRequest.current) return;
      const loadedTasks: Task[] = response.data?.tasks ?? [];
      setTasks(
        loadedTasks.filter((task) => !deletedTaskIds.current.has(task.id)),
      );
    } catch (requestError) {
      if (requestId !== latestTaskRequest.current) return;
      console.error('Ошибка загрузки задач:', requestError);
      setError('Не удалось загрузить задачи');
    } finally {
      if (requestId === latestTaskRequest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();

    if (!supabase) return;
    const channel = supabase
      .channel('tasks-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'automation_tasks' },
        () => void fetchTasks(true),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchTasks]);

  function toggleCreateForm() {
    setShowForm((visible) => !visible);
    setSelectedType(null);
    setError(null);
  }

  function openAutoReplyTab() {
    setShowForm(false);
    navigate('/auto-reply-dm');
  }

  async function handleCreate() {
    if (!selectedType || !keyword.trim()) return;
    setSubmitting(true);
    setError(null);
    hapticFeedback('medium');

    try {
      await api.post('/api/tasks/', {
        task_type: selectedType,
        ig_account_id: 'default',
        payload: {
          trigger_keywords: [keyword.trim().toLowerCase()],
          reply_text: replyText.trim(),
        },
      });
      hapticFeedback('success');
      setKeyword('');
      setReplyText('');
      setSelectedType(null);
      setShowForm(false);
      fetchTasks(true);
    } catch (requestError: any) {
      setError(requestError?.response?.data?.detail || 'Не удалось создать задачу');
      hapticFeedback('error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(taskId: string) {
    setError(null);
    try {
      hapticFeedback('light');
      await api.patch(`/api/tasks/${taskId}/cancel`);
      setTasks((previous) =>
        previous.map((task) =>
          task.id === taskId ? { ...task, status: 'cancelled' } : task,
        ),
      );
    } catch (requestError: any) {
      setError(requestError?.response?.data?.detail || 'Не удалось отменить задачу');
    }
  }

  async function toggleAutoReply(taskId: string) {
    setTogglingTaskId(taskId);
    setError(null);
    try {
      const response = await api.patch(`/api/tasks/${taskId}/toggle`);
      setTasks((previous) =>
        previous.map((task) => (task.id === taskId ? response.data : task)),
      );
      hapticFeedback('light');
    } catch (requestError: any) {
      setError(requestError?.response?.data?.detail || 'Не удалось изменить статус');
      hapticFeedback('error');
    } finally {
      setTogglingTaskId(null);
    }
  }

  function startEditing(task: Task) {
    setEditingTaskId(task.id);
    setEditKeyword(keywordsFromPayload(task.payload ?? {}).join(', '));
    setEditReplyText(task.payload?.reply_text ?? '');
    setError(null);
  }

  async function saveTask(task: Task) {
    if (!editKeyword.trim()) return;
    setSavingTaskId(task.id);
    setError(null);
    const payload: TaskPayload & { trigger_keyword?: unknown } = {
      ...task.payload,
      trigger_keywords: editKeyword
        .split(/[\n,]+/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
      reply_text: editReplyText.trim(),
    };
    delete payload.trigger_keyword;

    try {
      const response = await api.patch(`/api/tasks/${task.id}`, { payload });
      setTasks((previous) =>
        previous.map((item) => (item.id === task.id ? response.data : item)),
      );
      setEditingTaskId(null);
      hapticFeedback('success');
    } catch (requestError: any) {
      setError(requestError?.response?.data?.detail || 'Не удалось изменить задачу');
      hapticFeedback('error');
    } finally {
      setSavingTaskId(null);
    }
  }

  function confirmDelete(task: Task) {
    const message = 'Удалить задачу без возможности восстановления?';
    const remove = () => void deleteTask(task.id);

    if (tg) {
      tg.showConfirm(message, (confirmed) => {
        if (confirmed) remove();
      });
    } else if (window.confirm(message)) {
      remove();
    }
  }

  async function deleteTask(taskId: string) {
    setDeletingTaskId(taskId);
    setError(null);
    deletedTaskIds.current.add(taskId);
    setTasks((previous) => previous.filter((task) => task.id !== taskId));
    if (editingTaskId === taskId) setEditingTaskId(null);

    try {
      await api.delete(`/api/tasks/${taskId}`);
      await fetchTasks(true);
      hapticFeedback('success');
    } catch (requestError: any) {
      deletedTaskIds.current.delete(taskId);
      await fetchTasks(true);
      setError(requestError?.response?.data?.detail || 'Не удалось удалить задачу');
      hapticFeedback('error');
    } finally {
      setDeletingTaskId(null);
    }
  }

  return (
    <div className='p-4 pb-24 space-y-4'>
      <div className='flex items-center justify-between pt-2'>
        <h1
          className='text-xl font-semibold'
          style={{ color: 'var(--tg-theme-text-color)' }}
        >
          ⚡ Задачи
        </h1>
        <button
          onClick={toggleCreateForm}
          className='px-4 py-1.5 rounded-full text-sm font-medium transition-opacity active:opacity-70'
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
          className='p-3 rounded-xl text-sm'
          style={{ background: '#fee2e2', color: '#dc2626' }}
        >
          {error}
        </div>
      )}

      {showForm && (
        <div
          className='rounded-2xl p-4 space-y-3'
          style={{ background: 'var(--tg-theme-secondary-bg-color)' }}
        >
          <p
            className='text-sm font-medium'
            style={{ color: 'var(--tg-theme-text-color)' }}
          >
            Тип задачи
          </p>
          <div className='grid grid-cols-2 gap-2'>
            <button
              onClick={openAutoReplyTab}
              className='p-3 rounded-xl text-left text-sm transition-all'
              style={{
                background: 'var(--tg-theme-bg-color)',
                color: 'var(--tg-theme-text-color)',
              }}
            >
              <span className='text-lg block mb-1'>💬</span>
              Авто-ответ в DM
            </button>
            {CREATE_TASK_TYPES.map((type) => (
              <button
                key={type.value}
                onClick={() => setSelectedType(type.value)}
                className='p-3 rounded-xl text-left text-sm transition-all'
                style={{
                  background:
                    selectedType === type.value
                      ? 'var(--tg-theme-button-color)'
                      : 'var(--tg-theme-bg-color)',
                  color:
                    selectedType === type.value
                      ? 'var(--tg-theme-button-text-color)'
                      : 'var(--tg-theme-text-color)',
                }}
              >
                <span className='text-lg block mb-1'>{type.emoji}</span>
                {type.label}
              </button>
            ))}
          </div>

          {selectedType && (
            <>
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder='Параметр задачи'
                className='w-full rounded-xl px-3 py-2.5 text-sm outline-none'
                style={{
                  background: 'var(--tg-theme-bg-color)',
                  color: 'var(--tg-theme-text-color)',
                  border: '1px solid var(--tg-theme-hint-color)',
                }}
              />
              <textarea
                value={replyText}
                onChange={(event) => setReplyText(event.target.value)}
                placeholder='Описание задачи...'
                rows={3}
                className='w-full rounded-xl px-3 py-2.5 text-sm outline-none resize-none'
                style={{
                  background: 'var(--tg-theme-bg-color)',
                  color: 'var(--tg-theme-text-color)',
                  border: '1px solid var(--tg-theme-hint-color)',
                }}
              />
              <button
                onClick={() => void handleCreate()}
                disabled={submitting || !keyword.trim()}
                className='w-full py-3 rounded-xl font-medium text-sm disabled:opacity-50'
                style={{
                  background: 'var(--tg-theme-button-color)',
                  color: 'var(--tg-theme-button-text-color)',
                }}
              >
                {submitting ? 'Создаём...' : 'Запустить задачу'}
              </button>
            </>
          )}
        </div>
      )}

      {loading ? (
        <div className='space-y-2'>
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className='h-20 rounded-2xl animate-pulse'
              style={{ background: 'var(--tg-theme-secondary-bg-color)' }}
            />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <div
          className='text-center py-12'
          style={{ color: 'var(--tg-theme-hint-color)' }}
        >
          <p className='text-4xl mb-3'>⚡</p>
          <p>Задач пока нет</p>
        </div>
      ) : (
        <div className='space-y-2'>
          {tasks.map((task) => {
            const statusConfig = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.pending;
            const typeConfig = TASK_TYPE_CONFIG[task.task_type] ?? {
              label: task.task_type,
              emoji: '⚡',
            };
            const canEdit =
              AUTO_REPLY_TYPES.has(task.task_type) &&
              EDITABLE_STATUSES.has(task.status);
            const canDelete = task.status !== 'running';
            const isEditing = editingTaskId === task.id;
            const keywordsLabel = formatKeywordsLabel(
              keywordsFromPayload(task.payload ?? {}),
            );

            return (
              <div
                key={task.id}
                className='rounded-2xl p-4 min-h-[104px]'
                style={{ background: 'var(--tg-theme-secondary-bg-color)' }}
              >
                <div className='grid grid-cols-[28px_minmax(0,1fr)_auto] grid-rows-[auto_1fr] gap-x-2.5 min-h-[72px]'>
                  <span className='text-xl row-span-2 self-center w-7 text-center'>
                    {typeConfig.emoji}
                  </span>

                  <div className='row-span-2 min-w-0 self-center'>
                    <p
                      className='text-sm font-medium leading-[18px]'
                      style={{ color: 'var(--tg-theme-text-color)' }}
                    >
                      {typeConfig.label}
                    </p>
                    {keywordsLabel !== 'Без кодового слова' && (
                      <p
                        className='text-xs truncate mt-0.5'
                        style={{ color: 'var(--tg-theme-hint-color)' }}
                      >
                        {keywordsLabel}
                      </p>
                    )}
                    <p
                      className='text-xs leading-4'
                      style={{ color: statusConfig.color }}
                    >
                      {statusConfig.emoji} {statusConfig.label}
                    </p>
                  </div>

                  {AUTO_REPLY_TYPES.has(task.task_type) && (
                    <button
                      onClick={() => void toggleAutoReply(task.id)}
                      disabled={togglingTaskId === task.id}
                      aria-label={`${isAutoReplyActive(task) ? 'Выключить' : 'Включить'} авто-ответ`}
                      aria-pressed={isAutoReplyActive(task)}
                      className='relative w-11 h-5 rounded-full justify-self-end disabled:opacity-50 transition-colors'
                      style={{
                        background: isAutoReplyActive(task)
                          ? 'var(--tg-theme-button-color)'
                          : 'var(--tg-theme-hint-color)',
                      }}
                    >
                      <span
                        className='absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform'
                        style={{
                          transform: isAutoReplyActive(task)
                            ? 'translateX(24px)'
                            : 'translateX(0)',
                        }}
                      />
                    </button>
                  )}

                  <div className='col-start-3 row-start-2 flex items-end justify-end gap-2 self-end'>
                    {task.status === 'pending' &&
                      !AUTO_REPLY_TYPES.has(task.task_type) && (
                      <button
                        onClick={() => void handleCancel(task.id)}
                        className='h-6 min-w-[72px] px-3 rounded-lg text-[11px] font-medium'
                        style={{
                          border: '1px solid var(--tg-theme-hint-color)',
                          color: 'var(--tg-theme-text-color)',
                        }}
                      >
                        Отмена
                      </button>
                    )}
                    {canEdit && (
                      <button
                        onClick={() =>
                          isEditing ? setEditingTaskId(null) : startEditing(task)
                        }
                        className='h-6 min-w-[82px] px-3 rounded-lg text-[11px] font-medium'
                        style={{
                          color: 'var(--tg-theme-button-color)',
                          border: '1px solid var(--tg-theme-button-color)',
                        }}
                      >
                        {isEditing ? 'Закрыть' : 'Изменить'}
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => confirmDelete(task)}
                        disabled={deletingTaskId === task.id}
                        className='h-6 min-w-[72px] px-3 rounded-lg text-[11px] font-medium disabled:opacity-50'
                        style={{
                          color: '#ff3b30',
                          border: '1px solid rgba(255,59,48,0.45)',
                          background: 'rgba(255,59,48,0.08)',
                        }}
                      >
                        {deletingTaskId === task.id ? '...' : 'Удалить'}
                      </button>
                    )}
                  </div>
                </div>

                {isEditing && (
                  <div className='mt-3 pt-3 space-y-2 border-t border-black/10'>
                    <input
                      value={editKeyword}
                      onChange={(event) => setEditKeyword(event.target.value)}
                      placeholder='Ключевое слово'
                      className='w-full rounded-lg px-3 py-2 text-sm outline-none'
                      style={{
                        background: 'var(--tg-theme-bg-color)',
                        color: 'var(--tg-theme-text-color)',
                      }}
                    />
                    <textarea
                      value={editReplyText}
                      onChange={(event) => setEditReplyText(event.target.value)}
                      placeholder='Текст ответа в DM'
                      rows={3}
                      className='w-full rounded-lg px-3 py-2 text-sm outline-none resize-none'
                      style={{
                        background: 'var(--tg-theme-bg-color)',
                        color: 'var(--tg-theme-text-color)',
                      }}
                    />
                    <button
                      onClick={() => void saveTask(task)}
                      disabled={savingTaskId === task.id || !editKeyword.trim()}
                      className='w-full py-2 rounded-lg text-sm font-medium disabled:opacity-50'
                      style={{
                        background: 'var(--tg-theme-button-color)',
                        color: 'var(--tg-theme-button-text-color)',
                      }}
                    >
                      {savingTaskId === task.id ? 'Сохранение...' : 'Сохранить'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
