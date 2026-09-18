import { ChangeEvent, useRef, useState } from 'react';
import api from '@/utils/api';

export type ReminderUnit = 'minutes' | 'hours';

export interface CommentReplyGif {
  name: string;
  url: string;
  content_type: string;
  size: number;
}

const COMMENT_EMOJIS = [
  '❤️',
  '✅',
  '🔥',
  '🙌',
  '🎁',
  '✨',
  '😊',
  '👇',
  '📩',
  '🚀',
  '💬',
  '⭐',
];

interface AdvancedReplySettingsProps {
  commentRepliesEnabled: boolean;
  onCommentRepliesEnabledChange: (value: boolean) => void;
  commentReplies: string[];
  onCommentRepliesChange: (value: string[]) => void;
  commentReplyGifs: Array<CommentReplyGif | null>;
  onCommentReplyGifsChange: (
    value: Array<CommentReplyGif | null>,
  ) => void;
  reminderEnabled: boolean;
  onReminderEnabledChange: (value: boolean) => void;
  reminderDelay: number;
  onReminderDelayChange: (value: number) => void;
  reminderUnit: ReminderUnit;
  onReminderUnitChange: (value: ReminderUnit) => void;
  disabled?: boolean;
}

interface ToggleProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}

function Toggle({ checked, onChange, label, disabled = false }: ToggleProps) {
  return (
    <button
      type='button'
      role='switch'
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className='relative inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:opacity-50 shrink-0'
      style={{
        background: checked
          ? 'var(--tg-theme-button-color)'
          : 'var(--tg-theme-hint-color)',
      }}
    >
      <span
        className='inline-block h-5 w-5 rounded-full bg-white transition-transform'
        style={{
          transform: checked ? 'translateX(26px)' : 'translateX(4px)',
        }}
      />
    </button>
  );
}

export function commentRepliesFromPayload(payload: {
  comment_replies?: unknown;
}): string[] {
  if (!Array.isArray(payload.comment_replies)) return [''];
  const replies = payload.comment_replies.filter(
    (item): item is string => typeof item === 'string',
  );
  return replies.length > 0 ? replies : [''];
}

export function commentReplyGifsFromPayload(
  payload: { comment_reply_gifs?: unknown },
  replyCount: number,
): Array<CommentReplyGif | null> {
  const raw = Array.isArray(payload.comment_reply_gifs)
    ? payload.comment_reply_gifs
    : [];
  return Array.from({ length: Math.max(1, replyCount) }, (_, index) => {
    const item = raw[index];
    if (
      item &&
      typeof item === 'object' &&
      typeof (item as CommentReplyGif).url === 'string' &&
      typeof (item as CommentReplyGif).name === 'string'
    ) {
      return item as CommentReplyGif;
    }
    return null;
  });
}

export function reminderUnitFromPayload(payload: {
  reminder_delay_unit?: unknown;
}): ReminderUnit {
  return payload.reminder_delay_unit === 'hours' ? 'hours' : 'minutes';
}

export default function AdvancedReplySettings({
  commentRepliesEnabled,
  onCommentRepliesEnabledChange,
  commentReplies,
  onCommentRepliesChange,
  commentReplyGifs,
  onCommentReplyGifsChange,
  reminderEnabled,
  onReminderEnabledChange,
  reminderDelay,
  onReminderDelayChange,
  reminderUnit,
  onReminderUnitChange,
  disabled = false,
}: AdvancedReplySettingsProps) {
  const maxDelay = reminderUnit === 'minutes' ? 1440 : 72;
  const [emojiPickerIndex, setEmojiPickerIndex] = useState<number | null>(null);
  const [uploadingGifIndex, setUploadingGifIndex] = useState<number | null>(
    null,
  );
  const [gifError, setGifError] = useState<string | null>(null);
  const pendingGifIndex = useRef<number | null>(null);
  const gifInputRef = useRef<HTMLInputElement>(null);

  function updateReply(index: number, value: string) {
    onCommentRepliesChange(
      commentReplies.map((reply, replyIndex) =>
        replyIndex === index ? value : reply,
      ),
    );
  }

  function removeReply(index: number) {
    const next = commentReplies.filter(
      (_, replyIndex) => replyIndex !== index,
    );
    onCommentRepliesChange(next.length > 0 ? next : ['']);
    const nextGifs = commentReplyGifs.filter(
      (_, replyIndex) => replyIndex !== index,
    );
    onCommentReplyGifsChange(nextGifs.length > 0 ? nextGifs : [null]);
    setEmojiPickerIndex(null);
  }

  function addReply() {
    onCommentRepliesChange([...commentReplies, '']);
    onCommentReplyGifsChange([...commentReplyGifs, null]);
  }

  function appendEmoji(index: number, emoji: string) {
    updateReply(index, `${commentReplies[index] ?? ''}${emoji}`);
  }

  function chooseGif(index: number) {
    pendingGifIndex.current = index;
    gifInputRef.current?.click();
  }

  async function uploadGif(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const replyIndex = pendingGifIndex.current;
    event.target.value = '';
    if (!file || replyIndex === null) return;

    setUploadingGifIndex(replyIndex);
    setGifError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await api.post('/api/tasks/attachments', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30000,
      });
      const next = [...commentReplyGifs];
      next[replyIndex] = response.data as CommentReplyGif;
      onCommentReplyGifsChange(next);
    } catch (requestError: unknown) {
      const detail =
        typeof requestError === 'object' &&
        requestError &&
        'response' in requestError
          ? (requestError as { response?: { data?: { detail?: string } } })
              .response?.data?.detail
          : null;
      setGifError(detail || 'Не удалось загрузить GIF');
    } finally {
      setUploadingGifIndex(null);
      pendingGifIndex.current = null;
    }
  }

  function removeGif(index: number) {
    const next = [...commentReplyGifs];
    next[index] = null;
    onCommentReplyGifsChange(next);
  }

  function updateDelay(rawValue: string) {
    const parsed = Number.parseInt(rawValue, 10);
    onReminderDelayChange(
      Number.isFinite(parsed) ? Math.min(maxDelay, Math.max(1, parsed)) : 1,
    );
  }

  return (
    <div className='space-y-5'>
      <div>
        <h2
          className='text-xl font-semibold'
          style={{ color: 'var(--tg-theme-text-color)' }}
        >
          Дополнительные настройки
        </h2>
      </div>

      <section className='space-y-3'>
        <div className='flex items-center justify-between gap-3'>
          <div className='min-w-0'>
            <p
              className='text-sm font-medium'
              style={{ color: 'var(--tg-theme-text-color)' }}
            >
              Автоответы на комментарии
            </p>
            <p
              className='text-xs mt-0.5'
              style={{ color: 'var(--tg-theme-hint-color)' }}
            >
              Используем их в случайном порядке
            </p>
          </div>
          <Toggle
            checked={commentRepliesEnabled}
            onChange={onCommentRepliesEnabledChange}
            label='Автоответы на комментарии'
            disabled={disabled}
          />
        </div>

        <div className='space-y-2'>
          {commentReplies.map((reply, index) => {
            const replyGif = commentReplyGifs[index] ?? null;
            const controlsDisabled = disabled || !commentRepliesEnabled;
            return (
              <div
                key={index}
                className='rounded-xl overflow-hidden'
                style={{
                  background: 'var(--tg-theme-bg-color)',
                  border: '1px solid rgba(112, 132, 153, 0.35)',
                  opacity: controlsDisabled ? 0.5 : 1,
                }}
              >
                <textarea
                  value={reply}
                  onChange={(event) => updateReply(index, event.target.value)}
                  placeholder='Например: Отправила, проверяй директ ❤️'
                  rows={2}
                  disabled={controlsDisabled}
                  className='w-full px-3 pt-3 pb-1 text-sm outline-none resize-none bg-transparent'
                  style={{ color: 'var(--tg-theme-text-color)' }}
                />

                {replyGif && (
                  <div className='px-3 py-2 flex items-center gap-2'>
                    <img
                      src={replyGif.url}
                      alt={replyGif.name}
                      className='w-20 h-16 rounded-lg object-cover'
                    />
                    <span
                      className='text-xs min-w-0 flex-1 truncate'
                      style={{ color: 'var(--tg-theme-hint-color)' }}
                    >
                      {replyGif.name}
                    </span>
                    <button
                      type='button'
                      onClick={() => removeGif(index)}
                      disabled={controlsDisabled}
                      className='text-xs'
                      style={{ color: '#ff3b30' }}
                    >
                      Удалить GIF
                    </button>
                  </div>
                )}

                <div
                  className='flex items-center gap-1 px-2 py-1.5'
                  style={{
                    borderTop: '1px solid rgba(112, 132, 153, 0.18)',
                  }}
                >
                  <button
                    type='button'
                    disabled={controlsDisabled}
                    onClick={() =>
                      setEmojiPickerIndex((current) =>
                        current === index ? null : index,
                      )
                    }
                    className='px-2 py-1 rounded-lg text-sm disabled:cursor-not-allowed'
                    aria-label={`Добавить смайлик в автоответ ${index + 1}`}
                  >
                    😊
                  </button>
                  <button
                    type='button'
                    disabled={controlsDisabled || uploadingGifIndex !== null}
                    onClick={() => chooseGif(index)}
                    className='px-2 py-1 rounded-lg text-xs font-semibold disabled:cursor-not-allowed'
                    aria-label={`Добавить GIF в автоответ ${index + 1}`}
                  >
                    {uploadingGifIndex === index ? 'Загрузка...' : 'GIF'}
                  </button>
                  <span className='flex-1' />
                  {commentReplies.length > 1 && (
                    <button
                      type='button'
                      disabled={controlsDisabled}
                      onClick={() => removeReply(index)}
                      aria-label={`Удалить автоответ ${index + 1}`}
                      className='w-8 h-8 rounded-lg text-lg disabled:opacity-40'
                      style={{ color: '#ff3b30' }}
                    >
                      ×
                    </button>
                  )}
                </div>

                {emojiPickerIndex === index && (
                  <div
                    className='flex flex-wrap gap-1 p-2'
                    style={{
                      borderTop: '1px solid rgba(112, 132, 153, 0.18)',
                    }}
                  >
                    {COMMENT_EMOJIS.map((emoji) => (
                      <button
                        type='button'
                        key={emoji}
                        disabled={controlsDisabled}
                        onClick={() => appendEmoji(index, emoji)}
                        className='w-8 h-8 text-lg rounded-lg'
                        aria-label={`Добавить ${emoji}`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <input
            ref={gifInputRef}
            type='file'
            accept='image/gif'
            className='hidden'
            onChange={(event) => void uploadGif(event)}
          />
          {gifError && (
            <p className='text-xs' style={{ color: '#ff3b30' }}>
              {gifError}
            </p>
          )}
        </div>

        <button
          type='button'
          disabled={disabled || !commentRepliesEnabled}
          onClick={addReply}
          className='w-full py-2.5 rounded-xl text-sm font-medium disabled:opacity-50'
          style={{
            background: 'var(--tg-theme-bg-color)',
            color: 'var(--tg-theme-text-color)',
            border: '1px solid rgba(112, 132, 153, 0.35)',
          }}
        >
          ＋ Добавить автоответ
        </button>
      </section>

      <div
        aria-hidden
        style={{ borderTop: '1px solid rgba(112, 132, 153, 0.2)' }}
      />

      <section className='space-y-3'>
        <div className='flex items-center justify-between gap-3'>
          <div className='min-w-0'>
            <p
              className='text-sm font-medium'
              style={{ color: 'var(--tg-theme-text-color)' }}
            >
              Напомнить перейти по ссылке
            </p>
            <p
              className='text-xs mt-0.5'
              style={{ color: 'var(--tg-theme-hint-color)' }}
            >
              Отправить напоминание после сообщения в Direct
            </p>
          </div>
          <Toggle
            checked={reminderEnabled}
            onChange={onReminderEnabledChange}
            label='Напомнить перейти по ссылке'
            disabled={disabled}
          />
        </div>

        <div className='flex gap-2'>
          <input
            type='number'
            min={1}
            max={maxDelay}
            value={reminderDelay}
            onChange={(event) => updateDelay(event.target.value)}
            disabled={disabled || !reminderEnabled}
            aria-label='Задержка напоминания'
            className='w-24 px-3 py-2 rounded-xl text-sm outline-none disabled:opacity-50'
            style={{
              background: 'var(--tg-theme-bg-color)',
              color: 'var(--tg-theme-text-color)',
              border: '1px solid rgba(112, 132, 153, 0.35)',
            }}
          />
          <select
            value={reminderUnit}
            onChange={(event) =>
              onReminderUnitChange(event.target.value as ReminderUnit)
            }
            disabled={disabled || !reminderEnabled}
            aria-label='Единица времени напоминания'
            className='flex-1 px-3 py-2 rounded-xl text-sm outline-none disabled:opacity-50'
            style={{
              background: 'var(--tg-theme-bg-color)',
              color: 'var(--tg-theme-text-color)',
              border: '1px solid rgba(112, 132, 153, 0.35)',
            }}
          >
            <option value='minutes'>Минуты</option>
            <option value='hours'>Часы</option>
          </select>
        </div>
      </section>
    </div>
  );
}
