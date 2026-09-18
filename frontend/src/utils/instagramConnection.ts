export const INSTAGRAM_CONNECTION_EVENT = 'instagram-connection-changed';

export function notifyInstagramConnection(connected: boolean) {
  window.dispatchEvent(
    new CustomEvent(INSTAGRAM_CONNECTION_EVENT, {
      detail: { connected },
    }),
  );
}
