import { detectDevice, type DeviceProfile } from '@/utils/deviceProfile';

export const INSTAGRAM_PREREQUISITE_MESSAGE =
  'Сначала зарегистрируйтесь или войдите в Instagram приложение и ваш аккаунт должен быть бизнес-аккаунтом.';

export function getInstagramNativeUrl(profile: DeviceProfile): string {
  if (profile.os === 'android') {
    return 'intent://instagram.com/#Intent;package=com.instagram.android;scheme=https;end';
  }
  return 'instagram://app';
}

export function getInstagramFallbackUrl(profile: DeviceProfile): string {
  if (profile.os === 'ios') {
    return 'https://apps.apple.com/app/instagram/id389801252';
  }
  if (profile.os === 'android') {
    return 'https://play.google.com/store/apps/details?id=com.instagram.android';
  }
  if (profile.os === 'windows') {
    return 'https://apps.microsoft.com/detail/9nblggh5l9xt';
  }
  return 'https://www.instagram.com/accounts/login/';
}

export function getInstagramDeviceHint(profile: DeviceProfile): string {
  if (profile.canOpenNativeInstagram && profile.os === 'ios') {
    return profile.kind === 'tablet'
      ? 'Обнаружен iPad. Откроется приложение Instagram или App Store.'
      : 'Обнаружен iPhone. Откроется приложение Instagram или App Store.';
  }
  if (profile.canOpenNativeInstagram && profile.os === 'android') {
    return profile.kind === 'tablet'
      ? 'Обнаружен планшет Android. Откроется приложение Instagram или Google Play.'
      : 'Обнаружен смартфон Android. Откроется приложение Instagram или Google Play.';
  }
  if (profile.os === 'windows') {
    return 'Обнаружен компьютер Windows. Instagram откроется в браузере или Microsoft Store. Для проверки мобильного приложения используйте смартфон или планшет.';
  }
  if (profile.os === 'macos') {
    return 'Обнаружен компьютер Apple. Instagram откроется в браузере. Для проверки приложения используйте iPhone или iPad.';
  }
  if (profile.os === 'linux') {
    return 'Обнаружен компьютер Linux. Instagram откроется в браузере. Для проверки приложения используйте Android-смартфон или планшет.';
  }
  return 'Устройство не определено как смартфон. Instagram откроется в браузере.';
}

export function resolveDeviceProfile(telegramPlatform?: string | null): DeviceProfile {
  return detectDevice({ telegramPlatform });
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

function assignNativeUrl(url: string, profile: DeviceProfile) {
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

  if (profile.os === 'android') {
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
  const profile = resolveDeviceProfile(platform);

  if (!profile.canOpenNativeInstagram) {
    openHttps(getInstagramFallbackUrl(profile));
    return 'desktop';
  }

  const switchedPromise = waitForAppSwitch();
  assignNativeUrl(getInstagramNativeUrl(profile), profile);
  const switched = await switchedPromise;

  if (!switched) {
    openHttps(getInstagramFallbackUrl(profile));
    return 'missing';
  }

  return 'opened';
}
