export type DeviceKind = 'phone' | 'tablet' | 'computer';
export type DeviceOs = 'ios' | 'android' | 'windows' | 'macos' | 'linux' | 'unknown';

export interface DeviceProfile {
  kind: DeviceKind;
  os: DeviceOs;
  telegramPlatform: string;
  canOpenNativeInstagram: boolean;
}

const TELEGRAM_ANDROID = new Set(['android', 'android_x']);
const TELEGRAM_DESKTOP = new Set(['tdesktop', 'macos', 'unigram']);
const TELEGRAM_WEB = new Set(['weba', 'webk', 'web', 'unknown']);

export function normalizeTelegramPlatform(
  platform?: string | null,
): string {
  return (platform || 'unknown').trim().toLowerCase();
}

function osFromUserAgent(userAgent: string): DeviceOs {
  if (/ipad|iphone|ipod/i.test(userAgent)) return 'ios';
  if (/android/i.test(userAgent)) return 'android';
  if (/windows|win32|win64/i.test(userAgent)) return 'windows';
  if (/macintosh|mac os x/i.test(userAgent)) return 'macos';
  if (/linux|cros/i.test(userAgent)) return 'linux';
  return 'unknown';
}

function isIpad(userAgent: string, maxTouchPoints: number): boolean {
  return /ipad/i.test(userAgent) || (/macintosh/i.test(userAgent) && maxTouchPoints > 1);
}

function kindFromUserAgent(
  userAgent: string,
  maxTouchPoints: number,
  os: DeviceOs,
): DeviceKind {
  if (isIpad(userAgent, maxTouchPoints)) return 'tablet';
  if (/iphone|ipod/i.test(userAgent)) return 'phone';
  if (os === 'android') {
    if (/tablet|sm-t|nexus 7|nexus 9|pixel c/i.test(userAgent)) return 'tablet';
    if (!/mobile/i.test(userAgent)) return 'tablet';
    return 'phone';
  }
  return 'computer';
}

export function detectDevice(input?: {
  telegramPlatform?: string | null;
  userAgent?: string | null;
  maxTouchPoints?: number;
}): DeviceProfile {
  const telegramPlatform = normalizeTelegramPlatform(input?.telegramPlatform);
  const userAgent =
    input?.userAgent ??
    (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  const maxTouchPoints =
    input?.maxTouchPoints ??
    (typeof navigator !== 'undefined' ? navigator.maxTouchPoints || 0 : 0);

  let os: DeviceOs = osFromUserAgent(userAgent);
  let kind = kindFromUserAgent(userAgent, maxTouchPoints, os);

  if (telegramPlatform === 'ios') {
    os = 'ios';
    kind = isIpad(userAgent, maxTouchPoints) ? 'tablet' : 'phone';
  } else if (TELEGRAM_ANDROID.has(telegramPlatform)) {
    os = 'android';
    kind = kindFromUserAgent(userAgent, maxTouchPoints, 'android');
  } else if (telegramPlatform === 'macos' && !isIpad(userAgent, maxTouchPoints)) {
    os = 'macos';
    kind = 'computer';
  } else if (TELEGRAM_DESKTOP.has(telegramPlatform) || TELEGRAM_WEB.has(telegramPlatform)) {
    if (telegramPlatform === 'tdesktop' || telegramPlatform === 'unigram') {
      kind = 'computer';
      if (os === 'unknown') {
        os = osFromUserAgent(userAgent);
      }
    }
  }

  const canOpenNativeInstagram =
    (kind === 'phone' || kind === 'tablet') && (os === 'ios' || os === 'android');

  return {
    kind,
    os,
    telegramPlatform,
    canOpenNativeInstagram,
  };
}
