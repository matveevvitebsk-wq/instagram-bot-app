import { useEffect, useMemo, useState } from 'react';
import api from '@/utils/api';
import type { CommentReplyGif } from '@/components/AdvancedReplySettings';
import type { IgMediaItem } from '@/components/SelectedMediaPicker';

type PreviewTab = 'message' | 'comment';

interface ChatbotPreviewProps {
  accountId: string | null;
  username: string;
  displayName: string;
  profilePictureUrl: string | null;
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

function Avatar({
  username,
  profilePictureUrl,
  size = 34,
}: {
  username: string;
  profilePictureUrl: string | null;
  size?: number;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const initial = username.trim().charAt(0).toUpperCase() || 'I';

  useEffect(() => setImageFailed(false), [profilePictureUrl]);

  return (
    <span
      className='relative rounded-full flex items-center justify-center font-semibold shrink-0 overflow-hidden'
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, size * 0.35),
        color: '#fff',
        background: 'linear-gradient(135deg, #f9ce34, #ee2a7b, #6228d7)',
      }}
    >
      {initial}
      {profilePictureUrl && !imageFailed && (
        <img
          src={profilePictureUrl}
          alt={`Фото профиля @${username}`}
          className='absolute inset-0 w-full h-full object-cover'
          onError={() => setImageFailed(true)}
        />
      )}
    </span>
  );
}

function PersonAvatar() {
  return (
    <span className='relative w-8 h-8 rounded-full bg-[#d6e5ff] flex items-end justify-center overflow-hidden shrink-0'>
      <span className='absolute top-[6px] w-3 h-3 rounded-full bg-white' />
      <span className='absolute bottom-[-2px] w-6 h-4 rounded-t-full bg-white' />
    </span>
  );
}

function Phone({
  children,
  tab,
  onTabChange,
}: {
  children: React.ReactNode;
  tab: PreviewTab;
  onTabChange: (tab: PreviewTab) => void;
}) {
  return (
    <>
      <div
        className='mx-auto w-full max-w-[310px] rounded-[42px] border border-[#a8a8a8] p-[10px]'
        style={{
          background: '#f7f7f7',
          boxShadow:
            '0 14px 34px rgba(0,0,0,.10), inset 0 0 0 2px rgba(255,255,255,.8)',
        }}
      >
        <div className='h-[515px] rounded-[33px] overflow-hidden bg-white flex flex-col text-black'>
          {children}
          <div className='h-[22px] bg-white flex items-center justify-center shrink-0'>
            <span className='w-[116px] h-[4px] rounded-full bg-black' />
          </div>
        </div>
      </div>

      <div className='grid grid-cols-2 gap-1 rounded-xl p-1 bg-[#f0f0f4]'>
        {(
          [
            ['message', 'Сообщение'],
            ['comment', 'Комментарий'],
          ] as const
        ).map(([value, label]) => (
          <button
            type='button'
            key={value}
            onClick={() => onTabChange(value)}
            aria-pressed={tab === value}
            className='py-2 rounded-lg text-sm font-medium transition-colors'
            style={{
              background: tab === value ? '#fff' : 'transparent',
              color: tab === value ? '#050505' : '#8e8e93',
              boxShadow:
                tab === value ? '0 1px 3px rgba(0,0,0,.08)' : undefined,
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </>
  );
}

export default function ChatbotPreview({
  accountId,
  username,
  displayName,
  profilePictureUrl,
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
  const accountUsername = username.trim() || 'instagram_account';
  const accountName = displayName.trim() || accountUsername;

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

  const keyword = triggerKeywords.find((item) => item.trim()) || 'Кодовое слово';
  const replyIndex = commentReplies.findIndex((reply) => reply.trim());
  const commentReply =
    replyIndex >= 0
      ? commentReplies[replyIndex].trim()
      : 'Отправила, проверяй директ ❤️';
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
          Предпросмотр диалога в интерфейсе Instagram
        </p>
      </div>

      <Phone tab={tab} onTabChange={setTab}>
        {tab === 'message' ? (
          <div className='flex-1 min-h-0 flex flex-col bg-white'>
            <div className='h-[62px] px-3 flex items-center border-b border-[#efefef] shrink-0'>
              <span className='text-[28px] font-light leading-none mr-2'>‹</span>
              <Avatar
                username={accountUsername}
                profilePictureUrl={profilePictureUrl}
                size={34}
              />
              <div className='min-w-0 flex-1 ml-2 leading-tight'>
                <p className='text-[12px] font-semibold truncate'>{accountName}</p>
                <p className='text-[9px] text-[#737373] truncate'>
                  {accountUsername}
                </p>
              </div>
              <span className='text-lg mr-3' aria-label='Аудиозвонок'>
                ♡
              </span>
              <span className='text-lg' aria-label='Видеозвонок'>
                ▣
              </span>
            </div>

            <div className='px-4 py-2 text-[9px] leading-[12px] text-center text-[#737373] border-b border-[#f6f6f6]'>
              @{accountUsername} отправил(-а) вам сообщение в ответ на комментарий
              к публикации
            </div>

            <div className='flex-1 min-h-0 px-3 pt-4 pb-2 flex flex-col overflow-y-auto'>
              <div className='mt-auto space-y-3'>
                <div className='flex items-end gap-2'>
                  <Avatar
                    username={accountUsername}
                    profilePictureUrl={profilePictureUrl}
                    size={31}
                  />
                  <div className='max-w-[205px] rounded-[18px] bg-[#f3f3f5] px-3 pt-3 pb-1 text-[11px] leading-[15px] whitespace-pre-wrap'>
                    {replyText || 'Сообщение в Direct'}
                    {dmButtonEnabled && dmQuickReplyText.trim() && (
                      <div className='-mx-3 mt-3 border-t border-white bg-white rounded-b-[18px] py-2 text-center font-medium'>
                        {dmQuickReplyText.trim()}
                      </div>
                    )}
                  </div>
                </div>

                {dmButtonEnabled && dmQuickReplyText.trim() && (
                  <div className='ml-auto max-w-[72%] rounded-[18px] bg-gradient-to-br from-[#bc71ff] to-[#7956ef] px-3 py-2 text-[11px] text-white'>
                    {dmQuickReplyText.trim()}
                  </div>
                )}

                {dmButtonEnabled && dmFollowupText.trim() && (
                  <div className='flex items-end gap-2'>
                    <Avatar
                      username={accountUsername}
                      profilePictureUrl={profilePictureUrl}
                      size={31}
                    />
                    <div className='max-w-[205px] rounded-[18px] bg-[#f3f3f5] px-3 pt-3 pb-1 text-[11px] leading-[15px] whitespace-pre-wrap'>
                      {dmFollowupText.trim()}
                      {dmButtonText.trim() && (
                        <a
                          href={dmButtonUrl || undefined}
                          target='_blank'
                          rel='noreferrer'
                          className='-mx-3 mt-3 border-t border-white bg-white rounded-b-[18px] py-2 text-center font-medium block text-black'
                        >
                          {dmButtonText.trim()}
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className='px-3 pb-2 flex items-center gap-2 shrink-0'>
              <Avatar
                username={accountUsername}
                profilePictureUrl={profilePictureUrl}
                size={31}
              />
              <div className='h-[30px] flex-1 rounded-full border border-[#dbdbdb] flex items-center justify-end px-3 text-base'>
                ♡
              </div>
            </div>
          </div>
        ) : (
          <div className='flex-1 min-h-0 flex flex-col bg-[#b4b5b9]'>
            <div className='h-[79px] px-3 pt-3 bg-[#b4b5b9] shrink-0'>
              <div className='text-[9px] tracking-wide text-center'>INSTAGRAM</div>
              <div className='flex items-center -mt-1'>
                <span className='text-[28px] font-light'>‹</span>
                <p className='text-[14px] font-semibold flex-1 text-center pr-5'>
                  Публикации
                </p>
              </div>
            </div>

            <div className='h-[57px] px-2 bg-[#c3c3c5] flex items-center gap-2 shrink-0'>
              <Avatar
                username={accountUsername}
                profilePictureUrl={profilePictureUrl}
                size={32}
              />
              <span className='text-[11px] font-semibold'>{accountUsername}</span>
            </div>

            <div className='h-[54px] overflow-hidden bg-[#acadb1] shrink-0'>
              {mediaLoading ? (
                <div className='h-full flex items-center justify-center text-[10px]'>
                  Загрузка публикации...
                </div>
              ) : previewMedia?.preview_url ? (
                <img
                  src={previewMedia.preview_url}
                  alt='Публикация Instagram'
                  className='w-full h-full object-cover opacity-60'
                />
              ) : null}
            </div>

            <div className='flex-1 min-h-0 rounded-t-[30px] bg-white px-4 pt-3 pb-2 flex flex-col'>
              <span className='w-8 h-[3px] rounded-full bg-[#8e8e93] mx-auto mb-3' />
              <p className='text-[14px] font-semibold text-center pb-3 border-b border-[#efefef]'>
                Комментарии
              </p>

              <div className='flex-1 overflow-y-auto pt-3 space-y-3'>
                <div className='flex gap-2'>
                  <PersonAvatar />
                  <div className='text-[11px] leading-[15px]'>
                    <p>
                      <span className='font-semibold'>Имя</span>{' '}
                      <span className='text-[#8e8e93]'>Сейчас</span>
                    </p>
                    <p className='text-[13px]'>{keyword}</p>
                    <p className='text-[#8e8e93]'>Ответить</p>
                  </div>
                </div>

                <div className='flex gap-2 ml-1'>
                  <Avatar
                    username={accountUsername}
                    profilePictureUrl={profilePictureUrl}
                    size={32}
                  />
                  <div className='text-[11px] leading-[15px] min-w-0'>
                    <p>
                      <span className='font-semibold'>{accountUsername}</span>{' '}
                      <span className='text-[#8e8e93]'>Сейчас</span>
                    </p>
                    <p className='text-[13px]'>
                      {commentRepliesEnabled
                        ? commentReply
                        : 'Автоответы на комментарии выключены'}
                    </p>
                    {commentRepliesEnabled && commentGif?.url && (
                      <img
                        src={commentGif.url}
                        alt={commentGif.name}
                        className='mt-1 w-20 h-14 object-cover rounded-md'
                      />
                    )}
                    <p className='text-[#8e8e93]'>Ответить</p>
                  </div>
                </div>
              </div>

              <div className='pl-10 flex justify-between text-base pb-2' aria-hidden>
                <span>♥</span><span>👌</span><span>👍</span><span>🥺</span>
                <span>😱</span><span>👏</span><span>😍</span>
              </div>
              <div className='flex items-center gap-2'>
                <Avatar
                  username={accountUsername}
                  profilePictureUrl={profilePictureUrl}
                  size={32}
                />
                <div className='h-[32px] flex-1 rounded-full border border-[#dbdbdb] flex items-center justify-end px-3 text-base'>
                  ♡
                </div>
              </div>
            </div>
          </div>
        )}
      </Phone>
    </div>
  );
}
