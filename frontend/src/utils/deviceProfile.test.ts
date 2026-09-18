import assert from 'node:assert/strict';
import { detectDevice } from './deviceProfile.ts';

function check(
  name: string,
  input: Parameters<typeof detectDevice>[0],
  expected: { kind: string; os: string; canOpenNativeInstagram: boolean },
) {
  const actual = detectDevice(input);
  assert.equal(actual.kind, expected.kind, `${name} kind`);
  assert.equal(actual.os, expected.os, `${name} os`);
  assert.equal(
    actual.canOpenNativeInstagram,
    expected.canOpenNativeInstagram,
    `${name} native`,
  );
}

check(
  'iPhone Telegram',
  {
    telegramPlatform: 'ios',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    maxTouchPoints: 5,
  },
  { kind: 'phone', os: 'ios', canOpenNativeInstagram: true },
);

check(
  'iPad Telegram',
  {
    telegramPlatform: 'ios',
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)',
    maxTouchPoints: 5,
  },
  { kind: 'tablet', os: 'ios', canOpenNativeInstagram: true },
);

check(
  'iPad as Macintosh',
  {
    telegramPlatform: 'ios',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    maxTouchPoints: 5,
  },
  { kind: 'tablet', os: 'ios', canOpenNativeInstagram: true },
);

check(
  'Android phone',
  {
    telegramPlatform: 'android',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36',
    maxTouchPoints: 5,
  },
  { kind: 'phone', os: 'android', canOpenNativeInstagram: true },
);

check(
  'Android tablet',
  {
    telegramPlatform: 'android_x',
    userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-T870) Safari/537.36',
    maxTouchPoints: 5,
  },
  { kind: 'tablet', os: 'android', canOpenNativeInstagram: true },
);

check(
  'Windows Telegram Desktop',
  {
    telegramPlatform: 'tdesktop',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    maxTouchPoints: 0,
  },
  { kind: 'computer', os: 'windows', canOpenNativeInstagram: false },
);

check(
  'macOS Telegram',
  {
    telegramPlatform: 'macos',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)',
    maxTouchPoints: 0,
  },
  { kind: 'computer', os: 'macos', canOpenNativeInstagram: false },
);

check(
  'Linux Telegram Desktop',
  {
    telegramPlatform: 'tdesktop',
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
    maxTouchPoints: 0,
  },
  { kind: 'computer', os: 'linux', canOpenNativeInstagram: false },
);

check(
  'Web Telegram on Windows',
  {
    telegramPlatform: 'weba',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
    maxTouchPoints: 0,
  },
  { kind: 'computer', os: 'windows', canOpenNativeInstagram: false },
);

console.log('deviceProfile cases passed');
