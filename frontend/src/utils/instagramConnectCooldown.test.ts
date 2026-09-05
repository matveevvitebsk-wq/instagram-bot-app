import assert from 'node:assert/strict';
import {
  INSTAGRAM_CONNECT_COOLDOWN_MS,
  instagramConnectWaitMs,
} from './instagramConnectCooldown.ts';

assert.equal(instagramConnectWaitMs(null, 1_000), 0);
assert.equal(instagramConnectWaitMs(1_000, 1_000), INSTAGRAM_CONNECT_COOLDOWN_MS);
assert.equal(instagramConnectWaitMs(1_000, 1_000 + INSTAGRAM_CONNECT_COOLDOWN_MS), 0);
assert.equal(instagramConnectWaitMs(1_000, 1_010), INSTAGRAM_CONNECT_COOLDOWN_MS - 10);

console.log('instagramConnectCooldown tests passed');
