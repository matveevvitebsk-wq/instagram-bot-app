export type ReminderUnit = 'minutes' | 'hours';

interface AdvancedReplySettingsProps {
  commentRepliesEnabled: boolean;
  onCommentRepliesEnabledChange: (value: boolean) => void;
  commentReplies: string[];
  onCommentRepliesChange: (value: string[]) => void;
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
  reminderEnabled,
  onReminderEnabledChange,
  reminderDelay,
  onReminderDelayChange,
  reminderUnit,
  onReminderUnitChange,
  disabled = false,
}: AdvancedReplySettingsProps) {
  const maxDelay = reminderUnit === 'minutes' ? 1440 : 72;

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
          {commentReplies.map((reply, index) => (
            <div key={index} className='flex items-center gap-2'>
              <textarea
                value={reply}
                onChange={(event) => updateReply(index, event.target.value)}
                placeholder='Например: Отправила, проверяй директ ❤️'
                rows={2}
                disabled={disabled || !commentRepliesEnabled}
                className='min-w-0 flex-1 px-3 py-2 rounded-xl text-sm outline-none resize-none disabled:opacity-50'
                style={{
                  background: 'var(--tg-theme-bg-color)',
                  color: 'var(--tg-theme-text-color)',
                  border: '1px solid rgba(112, 132, 153, 0.35)',
                }}
              />
              {commentReplies.length > 1 && (
                <button
                  type='button'
                  disabled={disabled || !commentRepliesEnabled}
                  onClick={() => removeReply(index)}
                  aria-label={`Удалить автоответ ${index + 1}`}
                  className='w-8 h-8 rounded-lg text-lg disabled:opacity-40'
                  style={{ color: '#ff3b30' }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>

        <button
          type='button'
          disabled={disabled || !commentRepliesEnabled}
          onClick={() => onCommentRepliesChange([...commentReplies, ''])}
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
