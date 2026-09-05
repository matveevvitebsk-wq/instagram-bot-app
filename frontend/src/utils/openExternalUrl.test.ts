import assert from 'node:assert/strict';
import {
  INSTAGRAM_OAUTH_OPEN_OPTIONS,
  openExternalUrl,
} from './openExternalUrl.ts';

const AUTH_URL =
  'https://www.instagram.com/oauth/authorize?client_id=2007885943317419';

{
  const calls: Array<{ url: string; options: unknown }> = [];
  const opened: string[] = [];
  const method = openExternalUrl(
    AUTH_URL,
    {
      openLink: (url, options) => {
        calls.push({ url, options });
      },
    },
    (url) => {
      opened.push(url);
    },
  );

  assert.equal(method, 'telegram');
  assert.deepEqual(calls, [
    { url: AUTH_URL, options: INSTAGRAM_OAUTH_OPEN_OPTIONS },
  ]);
  assert.deepEqual(opened, []);
}

{
  const opened: string[] = [];
  const method = openExternalUrl(AUTH_URL, null, (url) => {
    opened.push(url);
  });

  assert.equal(method, 'window');
  assert.deepEqual(opened, [AUTH_URL]);
}

{
  assert.throws(
    () => openExternalUrl('instagram://user?username=mediahave'),
    /https/,
  );
}

console.log('openExternalUrl tests passed');
