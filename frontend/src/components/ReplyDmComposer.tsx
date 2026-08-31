import { ChangeEvent, KeyboardEvent, useRef, useState } from 'react';
import api from '@/utils/api';

export interface ReplyAttachment {
  name: string;
  url: string;
  content_type: string;
  size: number;
}

const EMOJIS = ['❤️', '✅', '🔥', '🙌', '🎁', '✨', '😊', '👇', '📩', '🚀', '💬', '⭐'];

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

interface ReplyDmComposerProps {
  replyText: string;
  onReplyTextChange: (value: string) => void;
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
  replyLinks,
  onReplyLinksChange,
  replyAttachments,
  onReplyAttachmentsChange,
  disabled = false,
  onError,
}: ReplyDmComposerProps) {
  const [linkDraft, setLinkDraft] = useState('');
  const [showEmojis, setShowEmojis] = useState(false);
  const [uploading, setUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const gifInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function addLink() {
    const rawLink = linkDraft.trim();
    if (!rawLink) return;
    const normalizedLink = /^https?:\/\//i.test(rawLink)
      ? rawLink
      : `https://${rawLink}`;
    try {
      const parsed = new URL(normalizedLink);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
      const href = parsed.toString();
      if (!replyLinks.includes(href)) {
        onReplyLinksChange([...replyLinks, href]);
      }
      const spacer = replyText && !replyText.endsWith(' ') ? ' ' : '';
      if (!replyText.includes(href)) {
        onReplyTextChange(`${replyText}${spacer}${href}`);
      }
      setLinkDraft('');
      onError(null);
    } catch {
      onError('Введите корректную ссылку');
    }
  }

  function handleLinkKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      addLink();
    }
  }

  async function uploadAttachment(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setUploading(true);
    onError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await api.post('/api/tasks/attachments', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30000,
      });
      onReplyAttachmentsChange([...replyAttachments, response.data]);
    } catch (requestError: unknown) {
      const detail =
        typeof requestError === 'object' &&
        requestError &&
        'response' in requestError
          ? (requestError as { response?: { data?: { detail?: string } } })
              .response?.data?.detail
          : null;
      onError(detail || 'Не удалось загрузить файл');
    } finally {
      setUploading(false);
    }
  }

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

      {uploading && (
        <p className='text-xs' style={{ color: 'var(--tg-theme-hint-color)' }}>
          Загрузка файла...
        </p>
      )}

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
