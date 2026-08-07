import { useRef, useState, type KeyboardEvent, type ClipboardEvent } from 'react';

interface KeywordChipsInputProps {
  keywords: string[];
  onChange: (keywords: string[]) => void;
  exactMatch: boolean;
  onExactMatchChange: (value: boolean) => void;
  placeholder?: string;
  disabled?: boolean;
}

function splitKeywordTokens(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function uniqueAppend(existing: string[], incoming: string[]): string[] {
  const next = [...existing];
  for (const token of incoming) {
    const duplicate = next.some(
      (item) => item.toLowerCase() === token.toLowerCase(),
    );
    if (!duplicate) next.push(token);
  }
  return next;
}

export default function KeywordChipsInput({
  keywords,
  onChange,
  exactMatch,
  onExactMatchChange,
  placeholder = 'Введите кодовое слово',
  disabled = false,
}: KeywordChipsInputProps) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function commitTokens(raw: string) {
    const tokens = splitKeywordTokens(raw);
    if (tokens.length === 0) return;
    onChange(uniqueAppend(keywords, tokens));
    setDraft('');
  }

  function removeKeyword(index: number) {
    onChange(keywords.filter((_, i) => i !== index));
  }

  function clearAll() {
    onChange([]);
    setDraft('');
    inputRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commitTokens(draft);
      return;
    }

    if (event.key === 'Backspace' && draft === '' && keywords.length > 0) {
      event.preventDefault();
      onChange(keywords.slice(0, -1));
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData('text');
    if (!/[\n,]/.test(text)) return;
    event.preventDefault();
    commitTokens(`${draft}${text}`);
  }

  return (
    <div className='space-y-3'>
      <div>
        <label
          className='text-xs mb-1.5 block font-medium'
          style={{ color: 'var(--tg-theme-hint-color)' }}
        >
          Кодовые слова в комментарии
        </label>

        <div
          className='rounded-xl px-2.5 py-2 min-h-[48px] flex flex-wrap items-center gap-1.5 cursor-text'
          style={{
            background: 'var(--tg-theme-bg-color)',
            border: '1px solid var(--tg-theme-hint-color)',
            opacity: disabled ? 0.6 : 1,
          }}
          onClick={() => inputRef.current?.focus()}
        >
          {keywords.map((keyword, index) => (
            <span
              key={`${keyword}-${index}`}
              className='inline-flex items-center gap-1 max-w-full rounded-lg pl-2.5 pr-1 py-1 text-xs font-medium'
              style={{
                background: 'var(--tg-theme-secondary-bg-color)',
                color: 'var(--tg-theme-text-color)',
              }}
            >
              <span className='truncate'>{keyword}</span>
              <button
                type='button'
                aria-label={`Удалить «${keyword}»`}
                disabled={disabled}
                onClick={(event) => {
                  event.stopPropagation();
                  removeKeyword(index);
                }}
                className='shrink-0 w-5 h-5 rounded-md flex items-center justify-center text-sm leading-none disabled:opacity-50'
                style={{ color: 'var(--tg-theme-hint-color)' }}
              >
                ×
              </button>
            </span>
          ))}

          <input
            ref={inputRef}
            type='text'
            value={draft}
            disabled={disabled}
            onChange={(event) => {
              const value = event.target.value;
              if (value.includes(',') || value.includes('\n')) {
                commitTokens(value);
                return;
              }
              setDraft(value);
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onBlur={() => {
              if (draft.trim()) commitTokens(draft);
            }}
            placeholder={keywords.length === 0 ? placeholder : ''}
            className='flex-1 min-w-[120px] bg-transparent outline-none text-sm py-1'
            style={{ color: 'var(--tg-theme-text-color)' }}
          />

          {(keywords.length > 0 || draft) && !disabled && (
            <button
              type='button'
              aria-label='Очистить все кодовые слова'
              onClick={(event) => {
                event.stopPropagation();
                clearAll();
              }}
              className='ml-auto shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-sm'
              style={{
                color: 'var(--tg-theme-hint-color)',
                background: 'var(--tg-theme-secondary-bg-color)',
              }}
            >
              ×
            </button>
          )}
        </div>

        <p
          className='text-[11px] mt-1.5 leading-snug'
          style={{ color: 'var(--tg-theme-hint-color)' }}
        >
          Нажмите Enter или запятую, чтобы добавить слово
        </p>
      </div>

      <label className='flex items-center gap-2.5 cursor-pointer select-none'>
        <input
          type='checkbox'
          checked={exactMatch}
          disabled={disabled}
          onChange={(event) => onExactMatchChange(event.target.checked)}
          className='sr-only peer'
        />
        <span
          aria-hidden
          className='w-5 h-5 rounded-md flex items-center justify-center shrink-0 text-[11px] font-bold transition-colors'
          style={{
            background: exactMatch
              ? 'var(--tg-theme-button-color)'
              : 'var(--tg-theme-bg-color)',
            color: exactMatch
              ? 'var(--tg-theme-button-text-color)'
              : 'transparent',
            border: exactMatch
              ? '1px solid var(--tg-theme-button-color)'
              : '1px solid var(--tg-theme-hint-color)',
          }}
        >
          ✓
        </span>
        <span
          className='text-sm'
          style={{ color: 'var(--tg-theme-text-color)' }}
        >
          Точное совпадение
        </span>
        <span
          title='При точном совпадении бот реагирует только на комментарий, который целиком равен кодовому слову (без учёта регистра). Без галочки — достаточно, чтобы слово встречалось в тексте комментария.'
          className='inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-semibold'
          style={{
            color: 'var(--tg-theme-hint-color)',
            border: '1px solid var(--tg-theme-hint-color)',
          }}
          aria-label='Справка: точное совпадение'
        >
          ?
        </span>
      </label>
    </div>
  );
}

/** Normalize payload keywords from legacy single string or array. */
export function keywordsFromPayload(payload: {
  trigger_keywords?: unknown;
  trigger_keyword?: unknown;
}): string[] {
  if (Array.isArray(payload.trigger_keywords)) {
    return payload.trigger_keywords
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof payload.trigger_keyword === 'string' && payload.trigger_keyword.trim()) {
    return [payload.trigger_keyword.trim()];
  }
  return [];
}

export function formatKeywordsLabel(keywords: string[]): string {
  if (keywords.length === 0) return 'Без кодового слова';
  if (keywords.length === 1) return keywords[0];
  return `${keywords[0]} +${keywords.length - 1}`;
}
