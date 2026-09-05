export const INSTAGRAM_PREREQUISITE_MESSAGE =
  'Сначала зарегистрируйтесь или войдите в Instagram приложение и ваш аккаунт должен быть бизнес-аккаунтом.';

const MOBILE_PLATFORMS = new Set(['ios', 'android', 'android_x']);

export function isMobileTelegramPlatform(
  platform?: string | null,
): boolean {
  return MOBILE_PLATFORMS.has((platform || '').toLowerCase());
}

export function getInstagramNativeUrl(platform?: string | null): string {
  const value = (platform || '').toLowerCase();
  if (value === 'android' || value === 'android_x') {
    return 'intent://instagram.com/#Intent;package=com.instagram.android;scheme=https;end';
  }
  return 'instagram://app';
}

export function getInstagramFallbackUrl(platform?: string | null): string {
  const value = (platform || '').toLowerCase();
  if (value === 'ios') {
    return 'https://apps.apple.com/app/instagram/id389801252';
  }
  if (value === 'android' || value === 'android_x') {
    return 'https://play.google.com/store/apps/details?id=com.instagram.android';
  }
  return 'https://www.instagram.com/accounts/login/';
}

export function waitForAppSwitch(timeoutMs = 1600): Promise<boolean> {
  if (typeof document === 'undefined') {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (switched: boolean) => {
      if (settled) return;
      settled = true;
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', onHidden);
      window.removeEventListener('blur', onHidden);
      window.clearTimeout(timer);
      resolve(switched);
    };

    const onHidden = () => {
      if (
        document.visibilityState === 'hidden' ||
        document.hidden ||
        !document.hasFocus()
      ) {
        finish(true);
      }
    };

    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', onHidden);
    window.addEventListener('blur', onHidden);

    const timer = window.setTimeout(() => finish(false), timeoutMs);
  });
}

export function waitUntilVisible(timeoutMs = 120000): Promise<void> {
  if (typeof document === 'undefined' || document.visibilityState === 'visible') {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const done = () => {
      document.removeEventListener('visibilitychange', onChange);
      window.removeEventListener('focus', onChange);
      window.clearTimeout(timer);
      resolve();
    };
    const onChange = () => {
      if (document.visibilityState === 'visible') done();
    };
    const timer = window.setTimeout(done, timeoutMs);
    document.addEventListener('visibilitychange', onChange);
    window.addEventListener('focus', onChange);
  });
}

function assignNativeUrl(url: string, platform?: string | null) {
  const iframe = document.createElement('iframe');
  iframe.src = url;
  iframe.style.display = 'none';
  document.body.appendChild(iframe);
  window.setTimeout(() => iframe.remove(), 2000);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  window.setTimeout(() => anchor.remove(), 1500);

  const value = (platform || '').toLowerCase();
  if (value === 'android' || value === 'android_x') {
    try {
      window.location.assign(url);
    } catch {
      // Telegram WebView may block a custom scheme; the store fallback handles that.
    }
  }
}

export async function openInstagramApp(options: {
  platform?: string | null;
  openHttps: (url: string) => void;
}): Promise<'opened' | 'missing' | 'desktop'> {
  const { platform, openHttps } = options;

  if (!isMobileTelegramPlatform(platform)) {
    openHttps(getInstagramFallbackUrl(platform));
    return 'desktop';
  }

  const switchedPromise = waitForAppSwitch();
  assignNativeUrl(getInstagramNativeUrl(platform), platform);
  const switched = await switchedPromise;

  if (!switched) {
    openHttps(getInstagramFallbackUrl(platform));
    return 'missing';
  }

  return 'opened';
}

export async function promptAndOpenInstagramApp(options: {
  platform?: string | null;
  showAlert: (text: string, callback?: () => void) => void;
  openHttps: (url: string) => void;
}): Promise<'opened' | 'missing' | 'desktop'> {
  const { platform, showAlert, openHttps } = options;

  await new Promise<void>((resolve) => {
    showAlert(INSTAGRAM_PREREQUISITE_MESSAGE, () => resolve());
  });

  return openInstagramApp({ platform, openHttps });
}
