export const TELEGRAM_BOT_USERNAME = 'mediahave_bot';

export function telegramMiniAppUrl(startParam: string): string {
  return `https://t.me/${TELEGRAM_BOT_USERNAME}?startapp=${startParam}`;
}

export function instagramOAuthReturnStartParam(
  instagram: string | null,
): 'ig_connected' | 'ig_error' | null {
  if (instagram === 'connected') return 'ig_connected';
  if (instagram === 'error') return 'ig_error';
  return null;
}
