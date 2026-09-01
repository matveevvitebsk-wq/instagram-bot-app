import { useEffect, useMemo, useState } from 'react';
import api from '@/utils/api';
import type { CommentReplyGif } from '@/components/AdvancedReplySettings';
import type { IgMediaItem } from '@/components/SelectedMediaPicker';

type PreviewTab = 'message' | 'comment';

interface ChatbotPreviewProps {
  accountId: string | null;
  username: string;
  selectedMediaIds: string[];
  triggerKeywords: string[];
  replyText: string;
  dmButtonEnabled: boolean;
  dmQuickReplyText: string;
  dmFollowupText: string;
  dmButtonText: string;
  dmButtonUrl: string;
  commentRepliesEnabled: boolean;
  commentReplies: string[];
  commentReplyGifs: Array<CommentReplyGif | null>;
}

function AccountAvatar({ username }: { username: string }) {
  const initial = username.trim().charAt(0).toUpperCase() || 'I';
  return (
    <span
      className='w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0'
      style={{
        color: '#ffffff',
        background: 'linear-gradient(135deg, #f9ce34, #ee2a7b, #6228d7)',
      }}
    >
      {initial}
    </span>
  );
}

export default function ChatbotPreview({
  accountId,
  username,
  selectedMediaIds,
  triggerKeywords,
  replyText,
  dmButtonEnabled,
  dmQuickReplyText,
  dmFollowupText,
  dmButtonText,
  dmButtonUrl,
  commentRepliesEnabled,
  commentReplies,
  commentReplyGifs,
}: ChatbotPreviewProps) {
  const [tab, setTab] = useState<PreviewTab>('message');
  const [media, setMedia] = useState<IgMediaItem[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const displayUsername = username.trim() || 'instagram_account';

  useEffect(() => {
    if (!accountId) {
      setMedia([]);
      return;
    }
    let cancelled = false;
    setMediaLoading(true);
    api
      .get(`/api/accounts/${accountId}/media`, { params: { limit: 12 } })
      .then((response) => {
        if (!cancelled) {
          setMedia(Array.isArray(response.data?.media) ? response.data.media : []);
        }
      })
      .catch(() => {
        if (!cancelled) setMedia([]);
      })
      .finally(() => {
        if (!cancelled) setMediaLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  const previewMedia = useMemo(() => {
    if (selectedMediaIds.length > 0) {
      const selected = media.find((item) => selectedMediaIds.includes(item.id));
      if (selected) return selected;
    }
    return media[0] ?? null;
  }, [media, selectedMediaIds]);

  const keyword = triggerKeywords[0] || 'Кодовое слово';
  const replyIndex = commentReplies.findIndex((reply) => reply.trim());
  const commentReply =
    replyIndex >= 0 ? commentReplies[replyIndex].trim() : 'Ответ на комментарий';
  const commentGif =
    replyIndex >= 0 ? (commentReplyGifs[replyIndex] ?? null) : null;

  return (
    <div className='space-y-4'>
      <div>
        <h2
          className='text-xl font-semibold'
          style={{ color: 'var(--tg-theme-text-color)' }}
        >
          Просмотр работы чат-бота
        </h2>
        <p
          className='text-xs mt-1'
          style={{ color: 'var(--tg-theme-hint-color)' }}
        >
          Так сообщения и комментарии будут выглядеть для клиента
        </p>
      </div>

      <div
        className='mx-auto w-full max-w-[310px] rounded-[2.5rem] p-3'
        style={{
          background: 'var(--tg-theme-bg-color)',
          border: '2px solid rgba(112, 132, 153, 0.35)',
          boxShadow: '0 12px 30px rgba(0,0,0,0.08)',
        }}
      >
        <div
          className='rounded-[1.9rem] overflow-hidden min-h-[430px] flex flex-col'
          style={{ background: 'var(--tg-theme-secondary-bg-color)' }}
        >
          <div
            className='px-4 py-3 flex items-center gap-2'
            style={{
              background: 'var(--tg-theme-bg-color)',
              borderBottom: '1px solid rgba(112, 132, 153, 0.18)',
            }}
          >
            <span aria-hidden>‹</span>
            <AccountAvatar username={displayUsername} />
            <div className='min-w-0 flex-1'>
              <p
                className='text-xs font-semibold truncate'
                style={{ color: 'var(--tg-theme-text-color)' }}
              >
                {displayUsername}
              </p>
              <p
                className='text-[10px] truncate'
                style={{ color: 'var(--tg-theme-hint-color)' }}
              >
                @{displayUsername}
              </p>
            </div>
            <span aria-hidden>☎</span>
            <span aria-hidden>▣</span>
          </div>

          {tab === 'message' ? (
            <div className='p-4 flex-1 space-y-3'>
              <p
                className='text-[10px] text-center'
                style={{ color: 'var(--tg-theme-hint-color)' }}
              >
                @{displayUsername} ответил вам после комментария
              </p>

              <div className='flex items-end gap-2'>
                <AccountAvatar username={displayUsername} />
                <div
                  className='rounded-2xl p-3 text-xs whitespace-pre-wrap flex-1'
                  style={{
                    background: 'var(--tg-theme-bg-color)',
                    color: 'var(--tg-theme-text-color)',
                  }}
                >
                  {replyText || 'Сообщение в Direct'}
                  {dmButtonEnabled && dmQuickReplyText.trim() && (
                    <div
                      className='mt-3 rounded-lg py-2 text-center font-medium'
                      style={{
                        color: 'var(--tg-theme-button-color)',
                        borderTop: '1px solid rgba(112, 132, 153, 0.18)',
                      }}
                    >
                      {dmQuickReplyText.trim()}
                    </div>
                  )}
                </div>
              </div>

              {dmButtonEnabled && dmQuickReplyText.trim() && (
                <div
                  className='ml-auto max-w-[70%] rounded-2xl px-3 py-2 text-xs'
                  style={{
                    background: 'var(--tg-theme-button-color)',
                    color: 'var(--tg-theme-button-text-color)',
                  }}
                >
                  {dmQuickReplyText.trim()}
                </div>
              )}

              {dmButtonEnabled && dmFollowupText.trim() && (
                <div className='flex items-end gap-2'>
                  <AccountAvatar username={displayUsername} />
                  <div
                    className='rounded-2xl p-3 text-xs whitespace-pre-wrap flex-1'
                    style={{
                      background: 'var(--tg-theme-bg-color)',
                      color: 'var(--tg-theme-text-color)',
                    }}
                  >
                    {dmFollowupText.trim()}
                    {dmButtonText.trim() && (
                      <a
                        href={dmButtonUrl}
                        target='_blank'
                        rel='noreferrer'
                        className='mt-3 rounded-lg py-2 text-center font-medium'
                        style={{
                          display: 'block',
                          color: 'var(--tg-theme-button-color)',
                          borderTop: '1px solid rgba(112, 132, 153, 0.18)',
                        }}
                      >
                        {dmButtonText.trim()}
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className='flex-1'>
              <div
                className='px-4 py-3'
                style={{ background: 'var(--tg-theme-bg-color)' }}
              >
                <div className='flex items-center gap-2 mb-2'>
                  <AccountAvatar username={displayUsername} />
                  <span
                    className='text-xs font-semibold'
                    style={{ color: 'var(--tg-theme-text-color)' }}
                  >
                    {displayUsername}
                  </span>
                </div>
                <div
                  className='h-36 rounded-xl overflow-hidden flex items-center justify-center'
                  style={{ background: 'rgba(112, 132, 153, 0.15)' }}
                >
                  {mediaLoading ? (
                    <span
                      className='text-xs'
                      style={{ color: 'var(--tg-theme-hint-color)' }}
                    >
                      Загрузка публикации...
                    </span>
                  ) : previewMedia?.preview_url ? (
                    <img
                      src={previewMedia.preview_url}
                      alt='Публикация Instagram'
                      className='w-full h-full object-cover'
                    />
                  ) : (
                    <span className='text-4xl' aria-label='Публикация'>
                      🖼️
                    </span>
                  )}
                </div>
              </div>

              <div className='p-4 space-y-4'>
                <p
                  className='text-xs font-semibold text-center'
                  style={{ color: 'var(--tg-theme-text-color)' }}
                >
                  Комментарии
                </p>
                <div className='flex gap-2'>
                  <span
                    className='w-8 h-8 rounded-full flex items-center justify-center text-xs shrink-0'
                    style={{ background: 'rgba(112, 132, 153, 0.2)' }}
                  >
                    К
                  </span>
                  <div>
                    <p
                      className='text-[10px]'
                      style={{ color: 'var(--tg-theme-hint-color)' }}
                    >
                      Клиент
                    </p>
                    <p
                      className='text-xs'
                      style={{ color: 'var(--tg-theme-text-color)' }}
                    >
                      {keyword}
                    </p>
                  </div>
                </div>

                <div className='flex gap-2'>
                  <AccountAvatar username={displayUsername} />
                  <div className='min-w-0'>
                    <p
                      className='text-[10px] font-semibold'
                      style={{ color: 'var(--tg-theme-text-color)' }}
                    >
                      {displayUsername}
                    </p>
                    <p
                      className='text-xs'
                      style={{
                        color: commentRepliesEnabled
                          ? 'var(--tg-theme-text-color)'
                          : 'var(--tg-theme-hint-color)',
                      }}
                    >
                      {commentRepliesEnabled
                        ? commentReply
                        : 'Автоответы на комментарии выключены'}
                    </p>
                    {commentRepliesEnabled && commentGif?.url && (
                      <img
                        src={commentGif.url}
                        alt={commentGif.name}
                        className='mt-2 w-24 h-20 object-cover rounded-lg'
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div
        className='grid grid-cols-2 gap-1 rounded-xl p-1'
        style={{ background: 'rgba(112, 132, 153, 0.12)' }}
      >
        {(
          [
            ['message', 'Сообщение'],
            ['comment', 'Комментарий'],
          ] as const
        ).map(([value, label]) => (
          <button
            type='button'
            key={value}
            onClick={() => setTab(value)}
            aria-pressed={tab === value}
            className='py-2 rounded-lg text-sm font-medium'
            style={{
              background:
                tab === value ? 'var(--tg-theme-bg-color)' : 'transparent',
              color:
                tab === value
                  ? 'var(--tg-theme-text-color)'
                  : 'var(--tg-theme-hint-color)',
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
