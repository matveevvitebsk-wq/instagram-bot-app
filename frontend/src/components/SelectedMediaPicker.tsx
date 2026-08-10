import { useCallback, useEffect, useState } from 'react';
import api from '@/utils/api';

export interface IgMediaItem {
  id: string;
  caption: string;
  media_type: string;
  preview_url?: string | null;
  permalink?: string | null;
  timestamp?: string | null;
}

interface SelectedMediaPickerProps {
  accountId: string | null;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}

export default function SelectedMediaPicker({
  accountId,
  selectedIds,
  onChange,
  disabled = false,
}: SelectedMediaPickerProps) {
  const [media, setMedia] = useState<IgMediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [after, setAfter] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const loadMedia = useCallback(
    async (cursor?: string | null, append = false) => {
      if (!accountId) {
        setMedia([]);
        setError('Подключите Instagram, чтобы выбрать публикации');
        return;
      }

      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);

      try {
        const res = await api.get(`/api/accounts/${accountId}/media`, {
          params: {
            limit: 25,
            ...(cursor ? { after: cursor } : {}),
          },
        });
        const items: IgMediaItem[] = res.data?.media ?? [];
        setMedia((previous) => (append ? [...previous, ...items] : items));
        setAfter(res.data?.paging?.after ?? null);
        setHasMore(Boolean(res.data?.paging?.has_more));
      } catch (requestError: any) {
        if (!append) setMedia([]);
        setError(
          requestError?.response?.data?.detail ||
            'Не удалось загрузить публикации',
        );
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [accountId],
  );

  useEffect(() => {
    void loadMedia(null, false);
  }, [loadMedia]);

  function toggleMedia(id: string) {
    if (disabled) return;
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((item) => item !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  return (
    <div
      className='rounded-xl p-3 space-y-2'
      style={{ background: 'var(--tg-theme-secondary-bg-color)' }}
    >
      <div className='flex items-center justify-between gap-2'>
        <div>
          <p
            className='text-xs font-medium'
            style={{ color: 'var(--tg-theme-text-color)' }}
          >
            Выбранные публикации
          </p>
          <p
            className='text-[11px] mt-0.5'
            style={{ color: 'var(--tg-theme-hint-color)' }}
          >
            Отметьте посты для обработки
            {selectedIds.length > 0 ? ` · выбрано ${selectedIds.length}` : ''}
          </p>
        </div>
        <button
          type='button'
          disabled={disabled || loading || !accountId}
          onClick={() => void loadMedia(null, false)}
          className='text-[11px] px-2 py-1 rounded-lg disabled:opacity-50'
          style={{
            color: 'var(--tg-theme-button-color)',
            border: '1px solid var(--tg-theme-button-color)',
          }}
        >
          Обновить
        </button>
      </div>

      {loading && (
        <p
          className='text-xs py-6 text-center'
          style={{ color: 'var(--tg-theme-hint-color)' }}
        >
          Загрузка публикаций...
        </p>
      )}

      {!loading && error && (
        <p className='text-xs py-4 text-center' style={{ color: '#dc2626' }}>
          {error}
        </p>
      )}

      {!loading && !error && media.length === 0 && (
        <p
          className='text-xs py-6 text-center'
          style={{ color: 'var(--tg-theme-hint-color)' }}
        >
          Публикаций пока нет
        </p>
      )}

      {!loading && media.length > 0 && (
        <div className='flex gap-2 overflow-x-auto pb-1 -mx-0.5 px-0.5'>
          {media.map((item) => {
            const selected = selectedIds.includes(item.id);
            return (
              <button
                key={item.id}
                type='button'
                disabled={disabled}
                onClick={() => toggleMedia(item.id)}
                className='relative shrink-0 w-24 h-24 rounded-xl overflow-hidden disabled:opacity-50'
                style={{
                  background: 'var(--tg-theme-bg-color)',
                  outline: selected
                    ? '2px solid var(--tg-theme-button-color)'
                    : '1px solid rgba(112, 132, 153, 0.35)',
                }}
                aria-pressed={selected}
                aria-label={
                  selected
                    ? `Снять выбор с публикации ${item.id}`
                    : `Выбрать публикацию ${item.id}`
                }
              >
                {item.preview_url ? (
                  <img
                    src={item.preview_url}
                    alt=''
                    className='w-full h-full object-cover'
                    loading='lazy'
                  />
                ) : (
                  <span
                    className='w-full h-full flex items-center justify-center text-[10px] px-1 text-center'
                    style={{ color: 'var(--tg-theme-hint-color)' }}
                  >
                    {item.media_type || 'MEDIA'}
                  </span>
                )}

                <span
                  aria-hidden
                  className='absolute top-1.5 right-1.5 w-5 h-5 rounded-md flex items-center justify-center text-[11px] font-bold'
                  style={{
                    background: selected
                      ? 'var(--tg-theme-button-color)'
                      : 'rgba(0,0,0,0.55)',
                    color: selected
                      ? 'var(--tg-theme-button-text-color)'
                      : '#ffffff',
                    border: selected
                      ? '1px solid var(--tg-theme-button-color)'
                      : '1px solid rgba(255,255,255,0.35)',
                  }}
                >
                  {selected ? '✓' : ''}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {!loading && hasMore && (
        <button
          type='button'
          disabled={disabled || loadingMore}
          onClick={() => void loadMedia(after, true)}
          className='w-full py-2 rounded-lg text-xs font-medium disabled:opacity-50'
          style={{
            background: 'var(--tg-theme-bg-color)',
            color: 'var(--tg-theme-button-color)',
            border: '1px solid var(--tg-theme-button-color)',
          }}
        >
          {loadingMore ? 'Загрузка...' : 'Показать ещё'}
        </button>
      )}
    </div>
  );
}

export function selectedMediaIdsFromTask(task: {
  selected_media_ids?: unknown;
  payload?: { selected_media_ids?: unknown };
}): string[] {
  const fromColumn = task.selected_media_ids;
  if (Array.isArray(fromColumn)) {
    return fromColumn
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  const fromPayload = task.payload?.selected_media_ids;
  if (Array.isArray(fromPayload)) {
    return fromPayload
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}
