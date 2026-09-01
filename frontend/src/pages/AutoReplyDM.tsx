import { useEffect, useState } from 'react';
import { useTelegram } from '@/hooks/useTelegram';
import api from '@/utils/api';
import KeywordChipsInput, {
  formatKeywordsLabel,
  keywordsFromPayload,
} from '@/components/KeywordChipsInput';
import SelectedMediaPicker, {
  selectedMediaIdsFromTask,
} from '@/components/SelectedMediaPicker';
import ReplyDmComposer, {
  ReplyAttachment,
  attachmentsFromPayload,
  isValidDmButtonUrl,
  linksFromPayload,
} from '@/components/ReplyDmComposer';
import AdvancedReplySettings, {
  CommentReplyGif,
  ReminderUnit,
  commentReplyGifsFromPayload,
  commentRepliesFromPayload,
  reminderUnitFromPayload,
} from '@/components/AdvancedReplySettings';

interface AutoReplyTask {
  id: string;
  task_type: 'keyword_funnel' | 'dm_reply';
  status: string;
  comment_on_post?: boolean;
  exact_match?: boolean;
  all_content_types?: boolean;
  selected_media_ids?: string[];
  check_subscription?: boolean;
  payload: {
    trigger_keywords?: string[];
    exact_match?: boolean;
    reply_text?: string;
    dm_button_enabled?: boolean;
    dm_quick_reply_text?: string;
    dm_followup_text?: string;
    dm_button_text?: string;
    dm_button_url?: string;
    reply_links?: string[];
    reply_attachments?: ReplyAttachment[];
    comment_replies_enabled?: boolean;
    comment_replies?: string[];
    comment_reply_gifs?: Array<CommentReplyGif | null>;
    comment_replies_random?: boolean;
    reminder_enabled?: boolean;
    reminder_delay?: number;
    reminder_delay_unit?: ReminderUnit;
    content_type?: string;
    selected_media_ids?: string[];
    media_link?: string | null;
    is_active?: boolean;
    [key: string]: unknown;
  };
  created_at: string;
}

function isExactMatch(task: AutoReplyTask) {
  if (typeof task.exact_match === 'boolean') return task.exact_match;
  return task.payload?.exact_match !== false;
}

function isAllContentTypes(task: AutoReplyTask) {
  if (typeof task.all_content_types === 'boolean') return task.all_content_types;
  return (task.payload?.content_type ?? 'ALL') === 'ALL';
}

function isAutoReplyActive(task: AutoReplyTask) {
  return task.payload?.is_active ?? task.status !== 'cancelled';
}

export default function AutoReplyDM() {
  const { tg } = useTelegram();
  const [autoReplies, setAutoReplies] = useState<AutoReplyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [step, setStep] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [exactMatch, setExactMatch] = useState(true);
  const [commentOnPost, setCommentOnPost] = useState(true);
  const [checkSubscription, setCheckSubscription] = useState(true);
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);
  const [replyText, setReplyText] = useState('');
  const [dmButtonEnabled, setDmButtonEnabled] = useState(false);
  const [dmQuickReplyText, setDmQuickReplyText] = useState('');
  const [dmFollowupText, setDmFollowupText] = useState('');
  const [dmButtonText, setDmButtonText] = useState('');
  const [dmButtonUrl, setDmButtonUrl] = useState('');
  const [replyLinks, setReplyLinks] = useState<string[]>([]);
  const [replyAttachments, setReplyAttachments] = useState<ReplyAttachment[]>(
    [],
  );
  const [commentRepliesEnabled, setCommentRepliesEnabled] = useState(false);
  const [commentReplies, setCommentReplies] = useState<string[]>(['']);
  const [commentReplyGifs, setCommentReplyGifs] = useState<
    Array<CommentReplyGif | null>
  >([null]);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderDelay, setReminderDelay] = useState(10);
  const [reminderUnit, setReminderUnit] =
    useState<ReminderUnit>('minutes');
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
      const list = Array.isArray(accounts) ? accounts : [];
      const active =
        list.find((account: { is_active?: boolean }) => account.is_active) ??
        list[0];
      if (active?.id) setIgAccountId(active.id);
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
    setKeywords([]);
    setExactMatch(true);
    setCommentOnPost(true);
    setCheckSubscription(true);
    setSelectedMediaIds([]);
    setReplyText('');
    setDmButtonEnabled(false);
    setDmQuickReplyText('');
    setDmFollowupText('');
    setDmButtonText('');
    setDmButtonUrl('');
    setReplyLinks([]);
    setReplyAttachments([]);
    setCommentRepliesEnabled(false);
    setCommentReplies(['']);
    setCommentReplyGifs([null]);
    setReminderEnabled(false);
    setReminderDelay(10);
    setReminderUnit('minutes');
    setStep(1);
    setEditingId(null);
    setShowForm(false);
  }

  function openCreateForm() {
    if (showForm && !editingId) {
      resetForm();
      return;
    }
    setKeywords([]);
    setExactMatch(true);
    setCommentOnPost(true);
    setCheckSubscription(true);
    setSelectedMediaIds([]);
    setReplyText('');
    setDmButtonEnabled(false);
    setDmQuickReplyText('');
    setDmFollowupText('');
    setDmButtonText('');
    setDmButtonUrl('');
    setReplyLinks([]);
    setReplyAttachments([]);
    setCommentRepliesEnabled(false);
    setCommentReplies(['']);
    setCommentReplyGifs([null]);
    setReminderEnabled(false);
    setReminderDelay(10);
    setReminderUnit('minutes');
    setStep(1);
    setEditingId(null);
    setShowForm(true);
    setError(null);
  }

  function openEditForm(task: AutoReplyTask) {
    const onAllPosts = Boolean(task.comment_on_post);
    setKeywords(keywordsFromPayload(task.payload ?? {}));
    setExactMatch(isExactMatch(task));
    setCommentOnPost(onAllPosts);
    setCheckSubscription(task.check_subscription !== false);
    // Checkbox on → all posts; off → selected posts only (picker).
    setSelectedMediaIds(onAllPosts ? [] : selectedMediaIdsFromTask(task));
    setReplyText(task.payload?.reply_text ?? '');
    setDmButtonEnabled(task.payload?.dm_button_enabled === true);
    setDmQuickReplyText(task.payload?.dm_quick_reply_text ?? '');
    setDmFollowupText(task.payload?.dm_followup_text ?? '');
    setDmButtonText(task.payload?.dm_button_text ?? '');
    setDmButtonUrl(task.payload?.dm_button_url ?? '');
    setReplyLinks(linksFromPayload(task.payload ?? {}));
    setReplyAttachments(attachmentsFromPayload(task.payload ?? {}));
    const loadedCommentReplies = commentRepliesFromPayload(task.payload ?? {});
    setCommentRepliesEnabled(task.payload?.comment_replies_enabled === true);
    setCommentReplies(loadedCommentReplies);
    setCommentReplyGifs(
      commentReplyGifsFromPayload(
        task.payload ?? {},
        loadedCommentReplies.length,
      ),
    );
    setReminderEnabled(task.payload?.reminder_enabled === true);
    setReminderDelay(
      typeof task.payload?.reminder_delay === 'number'
        ? Math.max(1, task.payload.reminder_delay)
        : 10,
    );
    setReminderUnit(reminderUnitFromPayload(task.payload ?? {}));
    setStep(1);
    setEditingId(task.id);
    setShowForm(true);
    setError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function goToStep(nextStep: number) {
    setError(null);
    if (nextStep === 2) {
      if (keywords.length === 0) {
        setError('Добавьте хотя бы одно кодовое слово');
        return;
      }
      if (!commentOnPost && selectedMediaIds.length === 0) {
        setError('Выберите хотя бы одну публикацию');
        return;
      }
    }
    if (nextStep === 3 && !replyText.trim()) {
      setError('Введите текст сообщения в Direct');
      return;
    }
    if (nextStep === 3 && dmButtonEnabled) {
      if (!dmQuickReplyText.trim()) {
        setError('Введите текст первой кнопки');
        return;
      }
      if (!dmFollowupText.trim()) {
        setError('Введите сообщение после нажатия первой кнопки');
        return;
      }
      if (!dmButtonText.trim()) {
        setError('Введите текст последней кнопки');
        return;
      }
      if (!isValidDmButtonUrl(dmButtonUrl)) {
        setError('Введите корректную ссылку кнопки с http:// или https://');
        return;
      }
    }
    setStep(nextStep);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function saveAutoReply() {
    if (keywords.length === 0 || !replyText.trim()) return;
    const normalizedCommentReplyItems = commentReplies
      .map((reply, index) => ({
        text: reply.trim(),
        gif: commentReplyGifs[index] ?? null,
      }))
      .filter((item) => item.text);
    const normalizedCommentReplies = normalizedCommentReplyItems.map(
      (item) => item.text,
    );
    if (commentRepliesEnabled && normalizedCommentReplies.length === 0) {
      setError('Добавьте хотя бы один автоответ на комментарий');
      return;
    }
    // Checked "all publications" → all posts. Unchecked → must pick media.
    const useAllPosts = commentOnPost;
    if (!useAllPosts && selectedMediaIds.length === 0) {
      setError('Выберите хотя бы одну публикацию');
      return;
    }
    setSaving(true);
    setError(null);
    const mediaIds = useAllPosts ? [] : selectedMediaIds;
    const payload = {
      trigger_keywords: keywords,
      exact_match: exactMatch,
      content_type: useAllPosts ? 'ALL' : 'OPTIONAL',
      selected_media_ids: mediaIds,
      reply_text: replyText.trim(),
      dm_button_enabled: dmButtonEnabled,
      dm_quick_reply_text: dmQuickReplyText.trim(),
      dm_followup_text: dmFollowupText.trim(),
      dm_button_text: dmButtonText.trim(),
      dm_button_url: dmButtonUrl.trim(),
      reply_links: replyLinks,
      reply_attachments: replyAttachments,
      comment_replies_enabled: commentRepliesEnabled,
      comment_replies: normalizedCommentReplies,
      comment_reply_gifs: normalizedCommentReplyItems.map((item) => item.gif),
      comment_replies_random: true,
      reminder_enabled: reminderEnabled,
      reminder_delay: reminderDelay,
      reminder_delay_unit: reminderUnit,
    };

    try {
      if (editingId) {
        const currentTask = autoReplies.find((task) => task.id === editingId);
        const mergedPayload: Record<string, unknown> = {
          ...currentTask?.payload,
          ...payload,
        };
        delete mergedPayload.trigger_keyword;
        const res = await api.patch(`/api/tasks/${editingId}`, {
          payload: mergedPayload,
          comment_on_post: commentOnPost,
          exact_match: exactMatch,
          all_content_types: useAllPosts,
          selected_media_ids: mediaIds,
          check_subscription: checkSubscription,
        });
        setAutoReplies((previous) =>
          previous.map((task) => (task.id === editingId ? res.data : task)),
        );
      } else {
        const res = await api.post('/api/tasks/', {
          task_type: 'dm_reply',
          ig_account_id: igAccountId,
          comment_on_post: commentOnPost,
          exact_match: exactMatch,
          all_content_types: useAllPosts,
          selected_media_ids: mediaIds,
          check_subscription: checkSubscription,
          payload: {
            ...payload,
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
    const label = formatKeywordsLabel(keywordsFromPayload(task.payload ?? {}));
    const message = `Удалить авто-ответ для «${label}»?`;
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
      {!(showForm && editingId) && (
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
      )}

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
          className='mb-4 p-4 rounded-xl space-y-4'
          style={{ background: 'var(--tg-theme-secondary-bg-color)' }}
        >
          <div className='flex items-center justify-between'>
            <p
              className='text-xs font-medium'
              style={{ color: 'var(--tg-theme-hint-color)' }}
            >
              {editingId ? 'РЕДАКТИРОВАНИЕ' : 'НОВЫЙ АВТО-ОТВЕТ'} · ШАГ {step} ИЗ 3
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
              className='p-2 rounded-lg text-xs'
              style={{ background: '#fef3c7', color: '#92400e' }}
            >
              ⚠️ Instagram аккаунт не подключён. Авто-ответ будет создан без
              привязки к аккаунту.
            </div>
          )}

          {step === 1 && (
            <>
          <div
            className='rounded-xl px-3 py-3 flex items-center justify-between gap-3'
            style={{
              background: 'var(--tg-theme-bg-color)',
              border: '1px solid rgba(112, 132, 153, 0.35)',
            }}
          >
            <div className='min-w-0'>
              <p
                className='text-sm font-medium'
                style={{ color: 'var(--tg-theme-text-color)' }}
              >
                Проверить подписку
              </p>
              <p
                className='text-[11px] mt-0.5 leading-snug'
                style={{ color: 'var(--tg-theme-hint-color)' }}
              >
                Чат-бот проверит подписку в Direct,
                когда человек напишет сообщение
              </p>
            </div>
            <button
              type='button'
              role='switch'
              aria-checked={checkSubscription}
              aria-label='Проверить подписку'
              disabled={saving}
              onClick={() => setCheckSubscription((value) => !value)}
              className='relative inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:opacity-50 shrink-0'
              style={{
                background: checkSubscription
                  ? 'var(--tg-theme-button-color)'
                  : 'var(--tg-theme-hint-color)',
              }}
            >
              <span
                className='inline-block h-5 w-5 transform rounded-full bg-white transition-transform'
                style={{
                  transform: checkSubscription
                    ? 'translateX(26px)'
                    : 'translateX(4px)',
                }}
              />
            </button>
          </div>

          {/* Comment trigger block */}
          <div
            className='rounded-xl p-3 space-y-3'
            style={{
              background: 'var(--tg-theme-bg-color)',
              border: '1px solid rgba(112, 132, 153, 0.35)',
            }}
          >
            <label className='flex items-center gap-2.5 cursor-pointer select-none'>
              <span
                className='w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0'
                style={{
                  background: 'var(--tg-theme-secondary-bg-color)',
                }}
                aria-hidden
              >
                💬
              </span>
              <span className='flex-1 min-w-0'>
                <span
                  className='text-sm font-medium leading-snug block'
                  style={{ color: 'var(--tg-theme-text-color)' }}
                >
                  Авто-ответ на все личные публикации
                </span>
              </span>
              <input
                type='checkbox'
                checked={commentOnPost}
                disabled={saving}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setCommentOnPost(checked);
                  // Checked = all posts (no picker). Unchecked = selected posts only.
                  if (checked) setSelectedMediaIds([]);
                }}
                className='sr-only'
                aria-label='Авто-ответ на все личные публикации'
              />
              <span
                aria-hidden
                className='w-5 h-5 rounded-md flex items-center justify-center text-[11px] font-bold shrink-0'
                style={{
                  background: commentOnPost
                    ? 'var(--tg-theme-button-color)'
                    : 'var(--tg-theme-bg-color)',
                  color: commentOnPost
                    ? 'var(--tg-theme-button-text-color)'
                    : 'transparent',
                  border: commentOnPost
                    ? '1px solid var(--tg-theme-button-color)'
                    : '1px solid var(--tg-theme-hint-color)',
                }}
              >
                ✓
              </span>
            </label>

            <div
              className='rounded-xl p-3'
              style={{ background: 'var(--tg-theme-secondary-bg-color)' }}
            >
              <p
                className='text-xs font-medium mb-3'
                style={{ color: 'var(--tg-theme-text-color)' }}
              >
                Комментарий с кодовым словом
              </p>
              <KeywordChipsInput
                keywords={keywords}
                onChange={setKeywords}
                exactMatch={exactMatch}
                onExactMatchChange={setExactMatch}
                disabled={saving}
              />
            </div>

            {!commentOnPost && (
              <SelectedMediaPicker
                accountId={igAccountId}
                selectedIds={selectedMediaIds}
                onChange={setSelectedMediaIds}
                disabled={saving}
                active
              />
            )}
          </div>

              <div className='flex justify-end'>
                <button
                  type='button'
                  onClick={() => goToStep(2)}
                  className='px-8 py-2.5 rounded-xl text-sm font-medium'
                  style={{
                    background: 'var(--tg-theme-button-color)',
                    color: 'var(--tg-theme-button-text-color)',
                  }}
                >
                  Далее
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <ReplyDmComposer
                replyText={replyText}
                onReplyTextChange={setReplyText}
                dmButtonEnabled={dmButtonEnabled}
                onDmButtonEnabledChange={setDmButtonEnabled}
                dmQuickReplyText={dmQuickReplyText}
                onDmQuickReplyTextChange={setDmQuickReplyText}
                dmFollowupText={dmFollowupText}
                onDmFollowupTextChange={setDmFollowupText}
                dmButtonText={dmButtonText}
                onDmButtonTextChange={setDmButtonText}
                dmButtonUrl={dmButtonUrl}
                onDmButtonUrlChange={setDmButtonUrl}
                replyLinks={replyLinks}
                onReplyLinksChange={setReplyLinks}
                replyAttachments={replyAttachments}
                onReplyAttachmentsChange={setReplyAttachments}
                disabled={saving}
                onError={setError}
              />

              <div className='flex gap-3'>
                <button
                  type='button'
                  onClick={() => goToStep(1)}
                  className='flex-1 py-2.5 rounded-xl text-sm font-medium'
                  style={{ border: '1px solid var(--tg-theme-hint-color)' }}
                >
                  Назад
                </button>
                <button
                  type='button'
                  onClick={() => goToStep(3)}
                  disabled={saving || !replyText.trim()}
                  className='flex-1 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50'
                  style={{
                    background: 'var(--tg-theme-button-color)',
                    color: 'var(--tg-theme-button-text-color)',
                  }}
                >
                  Далее
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <AdvancedReplySettings
                commentRepliesEnabled={commentRepliesEnabled}
                onCommentRepliesEnabledChange={setCommentRepliesEnabled}
                commentReplies={commentReplies}
                onCommentRepliesChange={setCommentReplies}
                commentReplyGifs={commentReplyGifs}
                onCommentReplyGifsChange={setCommentReplyGifs}
                reminderEnabled={reminderEnabled}
                onReminderEnabledChange={setReminderEnabled}
                reminderDelay={reminderDelay}
                onReminderDelayChange={setReminderDelay}
                reminderUnit={reminderUnit}
                onReminderUnitChange={(unit) => {
                  setReminderUnit(unit);
                  setReminderDelay((delay) =>
                    Math.min(delay, unit === 'minutes' ? 1440 : 72),
                  );
                }}
                disabled={saving}
              />

              <div className='flex flex-col gap-3'>
                <button
                  type='button'
                  onClick={() => goToStep(2)}
                  className='w-full py-2.5 rounded-xl text-sm font-medium'
                  style={{ border: '1px solid var(--tg-theme-hint-color)' }}
                >
                  Назад
                </button>
                <button
                  type='button'
                  onClick={() => void saveAutoReply()}
                  disabled={saving}
                  className='w-full py-2.5 rounded-xl text-sm font-medium disabled:opacity-50'
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
            </>
          )}
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
            Создайте правило — когда кто-то напишет кодовое слово в комментарии,
            бот автоматически отправит ему DM
          </p>
        </div>
      )}

      {autoReplies.length > 0 && !editingId && (
        <div className='space-y-3'>
          {autoReplies.map((rule) => {
            const ruleKeywords = keywordsFromPayload(rule.payload ?? {});
            const ruleMediaCount = selectedMediaIdsFromTask(rule).length;
            const ruleAttachments = attachmentsFromPayload(rule.payload ?? {});
            const ruleLinks = linksFromPayload(rule.payload ?? {});
            return (
              <div
                key={rule.id}
                className='p-4 rounded-xl'
                style={{
                  background: 'var(--tg-theme-secondary-bg-color)',
                  opacity: isAutoReplyActive(rule) ? 1 : 0.65,
                }}
              >
                <div className='flex items-start justify-between gap-3 mb-2'>
                  <div className='flex flex-wrap items-center gap-1.5 min-w-0'>
                    {ruleKeywords.length > 0 ? (
                      ruleKeywords.map((keyword, index) => (
                        <span
                          key={`${rule.id}-${keyword}-${index}`}
                          className='text-xs px-2 py-0.5 rounded-lg font-mono font-medium'
                          style={{
                            background: 'var(--tg-theme-button-color)',
                            color: 'var(--tg-theme-button-text-color)',
                          }}
                        >
                          {keyword}
                        </span>
                      ))
                    ) : (
                      <span
                        className='text-xs'
                        style={{ color: 'var(--tg-theme-hint-color)' }}
                      >
                        Без кодового слова
                      </span>
                    )}
                    {rule.comment_on_post && (
                      <span
                        className='text-[10px] px-1.5 py-0.5 rounded'
                        style={{
                          color: 'var(--tg-theme-button-color)',
                          border: '1px solid var(--tg-theme-button-color)',
                        }}
                      >
                        комментарии
                      </span>
                    )}
                    {isExactMatch(rule) && (
                      <span
                        className='text-[10px] px-1.5 py-0.5 rounded'
                        style={{
                          color: 'var(--tg-theme-hint-color)',
                          border: '1px solid var(--tg-theme-hint-color)',
                        }}
                      >
                        точное
                      </span>
                    )}
                  </div>
                  <div className='shrink-0 text-right max-w-[46%]'>
                    <p
                      className='text-[11px] font-medium leading-snug mb-1'
                      style={{ color: 'var(--tg-theme-text-color)' }}
                    >
                      Ответы на комментарии
                    </p>
                    <div className='flex items-center justify-end gap-2'>
                      <span
                        className='text-[10px] leading-none'
                        style={{ color: 'var(--tg-theme-hint-color)' }}
                      >
                        {isAutoReplyActive(rule)
                          ? 'Вкл — бот отвечает'
                          : 'Выкл — ответы отключены'}
                      </span>
                      <button
                        onClick={() => void toggleAutoReply(rule.id)}
                        disabled={togglingId === rule.id}
                        aria-label={
                          isAutoReplyActive(rule)
                            ? 'Выключить ответы на комментарии'
                            : 'Включить ответы на комментарии'
                        }
                        aria-pressed={isAutoReplyActive(rule)}
                        className='relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 shrink-0'
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
                  </div>
                </div>
                <p
                  className='text-sm mb-3 leading-relaxed'
                  style={{ color: 'var(--tg-theme-text-color)' }}
                >
                  {rule.payload?.reply_text ?? ''}
                </p>
                {(ruleAttachments.length > 0 || ruleLinks.length > 0) && (
                  <p
                    className='text-[11px] mb-3'
                    style={{ color: 'var(--tg-theme-hint-color)' }}
                  >
                    {[
                      ruleAttachments.length
                        ? `файлов: ${ruleAttachments.length}`
                        : null,
                      ruleLinks.length ? `ссылок: ${ruleLinks.length}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
                <div className='flex items-end justify-between gap-3'>
                  <span
                    className='text-xs'
                    style={{ color: 'var(--tg-theme-hint-color)' }}
                  >
                    {isAllContentTypes(rule)
                      ? 'Все типы контента'
                      : `Выборочные ответы${
                          ruleMediaCount ? ` · ${ruleMediaCount}` : ''
                        }`}
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
            );
          })}
        </div>
      )}
    </div>
  );
}
