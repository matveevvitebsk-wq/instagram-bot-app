export interface ReplyAttachment {
  name: string;
  url: string;
  content_type: string;
  size: number;
}

// 2026-08-31 cursor photo/GIF/emoji/file controls are temporarily inactive
// const EMOJIS = ['❤️', '✅', '🔥', '🙌', '🎁', '✨', '😊', '👇', '📩', '🚀', '💬', '⭐'];

export function attachmentsFromPayload(payload: {
  reply_attachments?: unknown;
}): ReplyAttachment[] {
  if (!Array.isArray(payload.reply_attachments)) return [];
  return payload.reply_attachments.filter(
    (item): item is ReplyAttachment =>
      Boolean(
        item &&
          typeof item === 'object' &&
          typeof (item as ReplyAttachment).url === 'string' &&
          typeof (item as ReplyAttachment).name === 'string',
      ),
  );
}

export function linksFromPayload(payload: { reply_links?: unknown }): string[] {
  if (!Array.isArray(payload.reply_links)) return [];
  return payload.reply_links.filter(
    (item): item is string => typeof item === 'string' && item.trim().length > 0,
  );
}

export function isValidDmButtonUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

interface ReplyDmComposerProps {
  replyText: string;
  onReplyTextChange: (value: string) => void;
  dmButtonEnabled: boolean;
  onDmButtonEnabledChange: (value: boolean) => void;
  dmButtonText: string;
  onDmButtonTextChange: (value: string) => void;
  dmButtonUrl: string;
  onDmButtonUrlChange: (value: string) => void;
  replyLinks: string[];
  onReplyLinksChange: (value: string[]) => void;
  replyAttachments: ReplyAttachment[];
  onReplyAttachmentsChange: (value: ReplyAttachment[]) => void;
  disabled?: boolean;
  onError: (message: string | null) => void;
}

export default function ReplyDmComposer({
  replyText,
  onReplyTextChange,
  dmButtonEnabled,
  onDmButtonEnabledChange,
  dmButtonText,
  onDmButtonTextChange,
  dmButtonUrl,
  onDmButtonUrlChange,
  replyLinks,
  onReplyLinksChange,
  replyAttachments,
  onReplyAttachmentsChange,
  disabled = false,
}: ReplyDmComposerProps) {
  // 2026-08-31 cursor photo/GIF/emoji/file/link controls are temporarily inactive
  // const [linkDraft, setLinkDraft] = useState('');
  // const [showEmojis, setShowEmojis] = useState(false);
  // const [uploading, setUploading] = useState(false);
  // const photoInputRef = useRef<HTMLInputElement>(null);
  // const gifInputRef = useRef<HTMLInputElement>(null);
  // const fileInputRef = useRef<HTMLInputElement>(null);

  // 2026-08-31 cursor link form is temporarily inactive
  // function addLink() {
  //   const rawLink = linkDraft.trim();
  //   if (!rawLink) return;
  //   const normalizedLink = /^https?:\/\//i.test(rawLink)
  //     ? rawLink
  //     : `https://${rawLink}`;
  //   try {
  //     const parsed = new URL(normalizedLink);
  //     if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
  //     const href = parsed.toString();
  //     if (!replyLinks.includes(href)) {
  //       onReplyLinksChange([...replyLinks, href]);
  //     }
  //     const spacer = replyText && !replyText.endsWith(' ') ? ' ' : '';
  //     if (!replyText.includes(href)) {
  //       onReplyTextChange(`${replyText}${spacer}${href}`);
  //     }
  //     setLinkDraft('');
  //     onError(null);
  //   } catch {
  //     onError('Введите корректную ссылку');
  //   }
  // }
  //
  // function handleLinkKeyDown(event: KeyboardEvent<HTMLInputElement>) {
  //   if (event.key === 'Enter') {
  //     event.preventDefault();
  //     addLink();
  //   }
  // }

  // 2026-08-31 cursor photo/GIF/emoji/file uploads are temporarily inactive
  // async function uploadAttachment(event: ChangeEvent<HTMLInputElement>) {
  //   const file = event.target.files?.[0];
  //   event.target.value = '';
  //   if (!file) return;
  //
  //   setUploading(true);
  //   onError(null);
  //   try {
  //     const formData = new FormData();
  //     formData.append('file', file);
  //     const response = await api.post('/api/tasks/attachments', formData, {
  //       headers: { 'Content-Type': 'multipart/form-data' },
  //       timeout: 30000,
  //     });
  //     onReplyAttachmentsChange([...replyAttachments, response.data]);
  //   } catch (requestError: unknown) {
  //     const detail =
  //       typeof requestError === 'object' &&
  //       requestError &&
  //       'response' in requestError
  //         ? (requestError as { response?: { data?: { detail?: string } } })
  //             .response?.data?.detail
  //         : null;
  //     onError(detail || 'Не удалось загрузить файл');
  //   } finally {
  //     setUploading(false);
  //   }
  // }

  return (
    <div className='space-y-3'>
      <div>
        <h2
          className='text-base font-semibold mb-1'
          style={{ color: 'var(--tg-theme-text-color)' }}
        >
          Текст ответа в личных сообщениях
        </h2>
        <p
          className='text-xs mb-3'
          style={{ color: 'var(--tg-theme-hint-color)' }}
        >
          Добавьте текст, ссылки, фото, GIF или файлы для Direct.
        </p>
        <textarea
          value={replyText}
          onChange={(event) => onReplyTextChange(event.target.value)}
          placeholder='Введите текст личного сообщения'
          rows={5}
          disabled={disabled}
          className='w-full px-3 py-2 rounded-xl text-sm outline-none resize-none'
          style={{
            background: 'var(--tg-theme-bg-color)',
            color: 'var(--tg-theme-text-color)',
            border: '1px solid var(--tg-theme-hint-color)',
          }}
        />
      </div>

      <div
        className='rounded-xl p-3 space-y-3'
        style={{
          background: 'var(--tg-theme-bg-color)',
          border: '1px solid rgba(112, 132, 153, 0.35)',
        }}
      >
        <div className='flex items-center justify-between gap-3'>
          <div className='min-w-0'>
            <p
              className='text-sm font-medium'
              style={{ color: 'var(--tg-theme-text-color)' }}
            >
              Кнопка со ссылкой
            </p>
            <p
              className='text-xs mt-0.5'
              style={{ color: 'var(--tg-theme-hint-color)' }}
            >
              Например, для фразы «Жми кнопку ниже» укажите текст «Жми»
            </p>
          </div>
          <button
            type='button'
            role='switch'
            aria-checked={dmButtonEnabled}
            aria-label='Кнопка со ссылкой в Direct'
            disabled={disabled}
            onClick={() => onDmButtonEnabledChange(!dmButtonEnabled)}
            className='relative inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:opacity-50 shrink-0'
            style={{
              background: dmButtonEnabled
                ? 'var(--tg-theme-button-color)'
                : 'var(--tg-theme-hint-color)',
            }}
          >
            <span
              className='inline-block h-5 w-5 rounded-full bg-white transition-transform'
              style={{
                transform: dmButtonEnabled
                  ? 'translateX(26px)'
                  : 'translateX(4px)',
              }}
            />
          </button>
        </div>

        <div>
          <label
            className='text-xs mb-1.5 block'
            style={{ color: 'var(--tg-theme-hint-color)' }}
          >
            Текст кнопки
          </label>
          <input
            type='text'
            value={dmButtonText}
            maxLength={20}
            onChange={(event) => onDmButtonTextChange(event.target.value)}
            placeholder='Жми'
            disabled={disabled || !dmButtonEnabled}
            className='w-full px-3 py-2 rounded-xl text-sm outline-none disabled:opacity-50'
            style={{
              background: 'var(--tg-theme-secondary-bg-color)',
              color: 'var(--tg-theme-text-color)',
              border: '1px solid rgba(112, 132, 153, 0.35)',
            }}
          />
          <p
            className='text-[10px] text-right mt-1'
            style={{ color: 'var(--tg-theme-hint-color)' }}
          >
            {dmButtonText.length} / 20
          </p>
        </div>

        <div>
          <label
            className='text-xs mb-1.5 block'
            style={{ color: 'var(--tg-theme-hint-color)' }}
          >
            Ссылка кнопки
          </label>
          <input
            type='url'
            value={dmButtonUrl}
            onChange={(event) => onDmButtonUrlChange(event.target.value)}
            placeholder='https://site.ru или https://t.me/group'
            disabled={disabled || !dmButtonEnabled}
            className='w-full px-3 py-2 rounded-xl text-sm outline-none disabled:opacity-50'
            style={{
              background: 'var(--tg-theme-secondary-bg-color)',
              color: 'var(--tg-theme-text-color)',
              border: '1px solid rgba(112, 132, 153, 0.35)',
            }}
          />
        </div>

        {dmButtonEnabled &&
          dmButtonText.trim() &&
          isValidDmButtonUrl(dmButtonUrl) && (
          <a
            href={dmButtonUrl}
            target='_blank'
            rel='noreferrer'
            className='block w-full py-2.5 rounded-xl text-center text-sm font-medium'
            style={{
              background: 'var(--tg-theme-button-color)',
              color: 'var(--tg-theme-button-text-color)',
            }}
          >
            {dmButtonText.trim()}
          </a>
        )}
      </div>

      {/* 2026-08-31 cursor photo/GIF/emoji/file controls are temporarily inactive
      <div className='flex flex-wrap gap-2'>
        <button
          type='button'
          disabled={disabled || uploading}
          onClick={() => photoInputRef.current?.click()}
          className='px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-50'
          style={{ background: 'var(--tg-theme-bg-color)' }}
        >
          📷 Фото
        </button>
        <button
          type='button'
          disabled={disabled || uploading}
          onClick={() => gifInputRef.current?.click()}
          className='px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-50'
          style={{ background: 'var(--tg-theme-bg-color)' }}
        >
          GIF
        </button>
        <button
          type='button'
          disabled={disabled}
          onClick={() => setShowEmojis((visible) => !visible)}
          className='px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-50'
          style={{ background: 'var(--tg-theme-bg-color)' }}
        >
          😊 Смайлики
        </button>
        <button
          type='button'
          disabled={disabled || uploading}
          onClick={() => fileInputRef.current?.click()}
          className='px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-50'
          style={{ background: 'var(--tg-theme-bg-color)' }}
        >
          📎 Файл
        </button>
        <input
          ref={photoInputRef}
          type='file'
          accept='image/jpeg,image/png,image/webp'
          className='hidden'
          onChange={(event) => void uploadAttachment(event)}
        />
        <input
          ref={gifInputRef}
          type='file'
          accept='image/gif'
          className='hidden'
          onChange={(event) => void uploadAttachment(event)}
        />
        <input
          ref={fileInputRef}
          type='file'
          accept='.pdf,.doc,.docx,.txt,image/*'
          className='hidden'
          onChange={(event) => void uploadAttachment(event)}
        />
      </div>

      {showEmojis && (
        <div
          className='flex flex-wrap gap-2 p-2 rounded-xl'
          style={{ background: 'var(--tg-theme-bg-color)' }}
        >
          {EMOJIS.map((emoji) => (
            <button
              type='button'
              key={emoji}
              disabled={disabled}
              onClick={() => onReplyTextChange(`${replyText}${emoji}`)}
              className='w-8 h-8 text-lg'
              aria-label={`Добавить ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
      */}
      <div className='flex flex-wrap gap-2'>
        <button
          type='button'
          disabled
          className='px-3 py-2 rounded-lg text-xs font-medium opacity-50 cursor-not-allowed'
          style={{ background: 'var(--tg-theme-bg-color)' }}
        >
          📷 Фото
        </button>
        <button
          type='button'
          disabled
          className='px-3 py-2 rounded-lg text-xs font-medium opacity-50 cursor-not-allowed'
          style={{ background: 'var(--tg-theme-bg-color)' }}
        >
          GIF
        </button>
        <button
          type='button'
          disabled
          className='px-3 py-2 rounded-lg text-xs font-medium opacity-50 cursor-not-allowed'
          style={{ background: 'var(--tg-theme-bg-color)' }}
        >
          😊 Смайлики
        </button>
        <button
          type='button'
          disabled
          className='px-3 py-2 rounded-lg text-xs font-medium opacity-50 cursor-not-allowed'
          style={{ background: 'var(--tg-theme-bg-color)' }}
        >
          📎 Файл
        </button>
      </div>

      {replyAttachments.map((attachment, index) => (
        <div
          key={`${attachment.url}-${index}`}
          className='flex items-center justify-between gap-2 text-xs px-3 py-2 rounded-lg'
          style={{ background: 'var(--tg-theme-bg-color)' }}
        >
          <span className='truncate'>📎 {attachment.name}</span>
          <button
            type='button'
            aria-label={`Удалить ${attachment.name}`}
            disabled={disabled}
            onClick={() =>
              onReplyAttachmentsChange(
                replyAttachments.filter((_, itemIndex) => itemIndex !== index),
              )
            }
            style={{ color: '#ff3b30' }}
          >
            Удалить
          </button>
        </div>
      ))}

      {/* 2026-08-31 cursor link form is temporarily inactive
      <div className='flex gap-2'>
        <input
          type='url'
          value={linkDraft}
          disabled={disabled}
          onChange={(event) => setLinkDraft(event.target.value)}
          onKeyDown={handleLinkKeyDown}
          placeholder='https://example.com'
          className='min-w-0 flex-1 px-3 py-2 rounded-xl text-sm outline-none'
          style={{
            background: 'var(--tg-theme-bg-color)',
            color: 'var(--tg-theme-text-color)',
            border: '1px solid var(--tg-theme-hint-color)',
          }}
        />
        <button
          type='button'
          disabled={disabled}
          onClick={addLink}
          className='px-3 rounded-xl text-sm font-medium disabled:opacity-50'
          style={{
            color: 'var(--tg-theme-button-color)',
            border: '1px solid var(--tg-theme-button-color)',
          }}
        >
          + Ссылка
        </button>
      </div>
      */}
      <div className='flex gap-2'>
        <input
          type='url'
          value=''
          disabled
          placeholder='https://example.com'
          className='min-w-0 flex-1 px-3 py-2 rounded-xl text-sm outline-none opacity-50 cursor-not-allowed'
          style={{
            background: 'var(--tg-theme-bg-color)',
            color: 'var(--tg-theme-text-color)',
            border: '1px solid var(--tg-theme-hint-color)',
          }}
        />
        <button
          type='button'
          disabled
          className='px-3 rounded-xl text-sm font-medium opacity-50 cursor-not-allowed'
          style={{
            color: 'var(--tg-theme-button-color)',
            border: '1px solid var(--tg-theme-button-color)',
          }}
        >
          + Ссылка
        </button>
      </div>

      {replyLinks.map((link, index) => (
        <div
          key={`${link}-${index}`}
          className='flex items-center justify-between gap-2 text-xs'
        >
          <a
            href={link}
            target='_blank'
            rel='noreferrer'
            className='truncate'
            style={{ color: 'var(--tg-theme-link-color)' }}
          >
            {link}
          </a>
          <button
            type='button'
            disabled={disabled}
            onClick={() =>
              onReplyLinksChange(
                replyLinks.filter((_, itemIndex) => itemIndex !== index),
              )
            }
            style={{ color: '#ff3b30' }}
          >
            Удалить
          </button>
        </div>
      ))}
    </div>
  );
}
