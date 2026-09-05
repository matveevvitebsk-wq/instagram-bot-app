import { useState } from 'react';
import { useTelegram } from '@/hooks/useTelegram';
import {
  INSTAGRAM_PREREQUISITE_MESSAGE,
  getInstagramDeviceHint,
  openInstagramApp,
  resolveDeviceProfile,
  waitUntilVisible,
} from '@/utils/instagramApp';

interface InstagramPrerequisiteDialogProps {
  open: boolean;
  onClose?: () => void;
  onReady: () => void;
}

export default function InstagramPrerequisiteDialog({
  open,
  onClose,
  onReady,
}: InstagramPrerequisiteDialogProps) {
  const { platform, openLink } = useTelegram();
  const [opening, setOpening] = useState(false);
  const device = resolveDeviceProfile(platform);

  if (!open) return null;

  const handleOpenInstagram = async () => {
    if (opening) return;
    setOpening(true);
    try {
      const result = await openInstagramApp({
        platform,
        openHttps: openLink,
      });
      if (result !== 'desktop') {
        await waitUntilVisible();
      }
      onReady();
    } finally {
      setOpening(false);
    }
  };

  return (
    <div
      className='fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-4'
      style={{ background: 'rgba(0,0,0,.45)' }}
      role='dialog'
      aria-modal='true'
      aria-labelledby='instagram-prerequisite-title'
    >
      <div
        className='w-full max-w-sm rounded-2xl p-4 space-y-3'
        style={{
          background: 'var(--tg-theme-bg-color)',
          color: 'var(--tg-theme-text-color)',
          boxShadow: '0 16px 40px rgba(0,0,0,.24)',
        }}
      >
        <h2 id='instagram-prerequisite-title' className='text-lg font-semibold'>
          Нужен Instagram
        </h2>
        <p className='text-sm leading-5'>{INSTAGRAM_PREREQUISITE_MESSAGE}</p>
        <p
          className='text-xs leading-4'
          style={{ color: 'var(--tg-theme-hint-color)' }}
        >
          {getInstagramDeviceHint(device)}
        </p>
        <button
          type='button'
          onClick={() => void handleOpenInstagram()}
          disabled={opening}
          className='w-full py-3 rounded-xl text-sm font-semibold active:opacity-70 disabled:opacity-60'
          style={{
            background: 'var(--tg-theme-button-color)',
            color: 'var(--tg-theme-button-text-color)',
          }}
        >
          {opening ? 'Открываем Instagram…' : 'Открыть Instagram'}
        </button>
        {onClose && (
          <button
            type='button'
            onClick={onClose}
            disabled={opening}
            className='w-full py-2.5 rounded-xl text-sm font-medium active:opacity-70'
            style={{ color: 'var(--tg-theme-hint-color)' }}
          >
            Отмена
          </button>
        )}
      </div>
    </div>
  );
}
