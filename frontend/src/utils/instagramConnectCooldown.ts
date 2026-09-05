export const INSTAGRAM_CONNECT_COOLDOWN_MS = 45_000;

export function instagramConnectWaitMs(
  lastStartedAt: number | null,
  now = Date.now(),
): number {
  if (!lastStartedAt) return 0;
  return Math.max(0, INSTAGRAM_CONNECT_COOLDOWN_MS - (now - lastStartedAt));
}
