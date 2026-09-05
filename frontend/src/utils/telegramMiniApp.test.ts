import assert from 'node:assert/strict';
import {
  instagramOAuthReturnStartParam,
  telegramMiniAppUrl,
} from './telegramMiniApp.ts';

assert.equal(
  telegramMiniAppUrl('ig_connected'),
  'https://t.me/mediahave_bot?startapp=ig_connected',
);
assert.equal(instagramOAuthReturnStartParam('connected'), 'ig_connected');
assert.equal(instagramOAuthReturnStartParam('error'), 'ig_error');
assert.equal(instagramOAuthReturnStartParam(null), null);

console.log('telegramMiniApp tests passed');
