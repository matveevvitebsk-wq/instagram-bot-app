export const INSTAGRAM_OAUTH_OPEN_OPTIONS = {
  try_instant_view: false,
  // Android Telegram often opens https links in its in-app browser unless a
  // system browser is requested. Instagram rejects that WebView.
  try_browser: 'chrome' as const,
};

export interface ExternalLinkWebApp {
  openLink?: (
    url: string,
    options?: {
      try_instant_view?: boolean;
      try_browser?: 'chrome' | 'firefox' | 'safari';
    },
  ) => void;
}

export type ExternalLinkMethod = 'telegram' | 'window';

/**
 * Open Instagram OAuth outside the Mini App document.
 *
 * `window.location.assign(instagram.com/...)` replaces Telegram's WebView.
 * Instagram then serves `/accounts/login/?force_authentication` without the
 * native app session and often returns 4xx → net::ERR_HTTP_RESPONSE_CODE_FAILURE.
 */
export function openExternalUrl(
  url: string,
  webApp?: ExternalLinkWebApp | null,
  openWindow: (url: string) => void = (href) => {
    window.open(href, '_blank', 'noopener,noreferrer');
  },
): ExternalLinkMethod {
  if (!url.startsWith('https://')) {
    throw new Error('Instagram OAuth must open an https URL');
  }

  if (webApp?.openLink) {
    try {
      webApp.openLink(url, INSTAGRAM_OAUTH_OPEN_OPTIONS);
    } catch {
      webApp.openLink(url, { try_instant_view: false });
    }
    return 'telegram';
  }

  openWindow(url);
  return 'window';
}
