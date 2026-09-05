import { detectDevice, type DeviceProfile } from '@/utils/deviceProfile';

export const INSTAGRAM_PREREQUISITE_MESSAGE =
  'Сначала зарегистрируйтесь или войдите в Instagram приложение и ваш аккаунт должен быть бизнес-аккаунтом.';

export function getInstagramLaunchUrl(): string {
  return 'instagram://app';
}

export function getInstagramDeviceHint(profile: DeviceProfile): string {
  if (profile.canOpenNativeInstagram && profile.os === 'ios') {
    return profile.kind === 'tablet'
      ? 'Обнаружен iPad. Запустится приложение Instagram. Войдите в бизнес-аккаунт сами, затем вернитесь в MediaHave.'
      : 'Обнаружен iPhone. Запустится приложение Instagram. Войдите в бизнес-аккаунт сами, затем вернитесь в MediaHave.';
  }
  if (profile.canOpenNativeInstagram && profile.os === 'android') {
    return profile.kind === 'tablet'
      ? 'Обнаружен планшет Android. Запустится приложение Instagram. Войдите в бизнес-аккаунт сами, затем вернитесь в MediaHave.'
      : 'Обнаружен смартфон Android. Запустится приложение Instagram. Войдите в бизнес-аккаунт сами, затем вернитесь в MediaHave.';
  }
  if (profile.os === 'windows') {
    return 'Обнаружен компьютер Windows. Запустите Instagram на смартфоне или планшете и войдите в бизнес-аккаунт сами.';
  }
  if (profile.os === 'macos') {
    return 'Обнаружен компьютер Apple. Запустите Instagram на iPhone или iPad и войдите в бизнес-аккаунт сами.';
  }
  if (profile.os === 'linux') {
    return 'Обнаружен компьютер Linux. Запустите Instagram на Android и войдите в бизнес-аккаунт сами.';
  }
  return 'Запустите Instagram на смартфоне и войдите в бизнес-аккаунт сами.';
}

export function resolveDeviceProfile(telegramPlatform?: string | null): DeviceProfile {
  return detectDevice({ telegramPlatform });
}

function launchNativeScheme(url: string) {
  const opened = window.open(url, '_blank');
  if (opened) {
    return;
  }

  const iframe = document.createElement('iframe');
  iframe.src = url;
  iframe.style.display = 'none';
  document.body.appendChild(iframe);
  window.setTimeout(() => iframe.remove(), 1500);
}

export function launchInstagramApp(options: {
  platform?: string | null;
}): 'launched' | 'unsupported' {
  const profile = resolveDeviceProfile(options.platform);
  if (!profile.canOpenNativeInstagram) {
    return 'unsupported';
  }

  launchNativeScheme(getInstagramLaunchUrl());
  return 'launched';
}
