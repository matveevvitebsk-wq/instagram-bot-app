const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function loadScript() {
  const source = fs.readFileSync(
    path.join(__dirname, 'code-in-javascript1.js'),
    'utf8',
  );
  const module = { exports: {} };
  const fn = new Function('module', 'exports', 'console', source);
  fn(module, module.exports, console);
  return module.exports;
}

const {
  extractComment,
  isAllPersonalPublications,
  keywordMatch,
  matchReplyConditions,
  publicationScopeApplies,
  runN8n,
  selectedMediaIds,
} = loadScript();

const MEDIA_A = '17882021514199226';
const MEDIA_B = '17882021514199999';

function comment(overrides = {}) {
  return {
    comment_id: '18077951459368103',
    comment_text: 'прайс',
    media_id: MEDIA_A,
    media_product_type: 'REELS',
    sender_id: '1917627436259991',
    sender_username: 'sveta_boltkova',
    instagram_account_id: '17841403480052658',
    verb: 'add',
    ...overrides,
  };
}

function task(overrides = {}) {
  const defaultPayload = {
    trigger_keywords: ['прайс'],
    trigger_keyword: 'прайс',
    exact_match: true,
    content_type: 'ALL',
    selected_media_ids: [],
    reply_text: 'Вот прайс',
    is_active: true,
  };
  const { payload: payloadOverride, ...rest } = overrides;
  const payload =
    typeof payloadOverride === 'string'
      ? payloadOverride
      : { ...defaultPayload, ...(payloadOverride ?? {}) };
  return {
    id: 'task-all',
    task_type: 'dm_reply',
    status: 'pending',
    owner_id: 'owner-1',
    ig_account_id: 'ig-1',
    comment_on_post: true,
    exact_match: true,
    all_content_types: true,
    selected_media_ids: [],
    check_subscription: true,
    payload,
    ...rest,
  };
}

test('extractComment reads Meta webhook envelope', () => {
  const extracted = extractComment({
    body: {
      object: 'instagram',
      entry: [
        {
          id: '17841403480052658',
          changes: [
            {
              field: 'comments',
              value: {
                from: { id: '1917627436259991', username: 'sveta_boltkova' },
                media: { id: MEDIA_A, media_product_type: 'REELS' },
                id: '18077951459368103',
                text: 'прайс',
              },
            },
          ],
        },
      ],
    },
  });
  assert.equal(extracted.media_id, MEDIA_A);
  assert.equal(extracted.comment_text, 'прайс');
  assert.equal(extracted.instagram_account_id, '17841403480052658');
});

test('all personal publications match any media id', () => {
  const all = task();
  assert.equal(isAllPersonalPublications(all), true);
  assert.deepEqual(publicationScopeApplies(all, MEDIA_B), {
    ok: true,
    scope: 'all_personal',
  });
  const { matches } = matchReplyConditions(comment({ media_id: MEDIA_B }), [all]);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].scope, 'all_personal');
  assert.equal(matches[0].reply_text, 'Вот прайс');
});

test('selected publications match only listed media ids', () => {
  const selected = task({
    id: 'task-selected',
    comment_on_post: false,
    all_content_types: false,
    selected_media_ids: [MEDIA_A],
    payload: {
      trigger_keywords: ['прайс'],
      content_type: 'OPTIONAL',
      selected_media_ids: [MEDIA_A],
      reply_text: 'Ответ на выбранный пост',
      is_active: true,
    },
  });
  assert.equal(isAllPersonalPublications(selected), false);
  assert.equal(publicationScopeApplies(selected, MEDIA_A).ok, true);
  assert.equal(publicationScopeApplies(selected, MEDIA_B).ok, false);

  const hit = matchReplyConditions(comment(), [selected]);
  assert.equal(hit.matches.length, 1);
  assert.equal(hit.matches[0].scope, 'selected');

  const miss = matchReplyConditions(comment({ media_id: MEDIA_B }), [selected]);
  assert.equal(miss.matches.length, 0);
  assert.equal(miss.reason, 'no_matching_reply_condition');
});

test('selected_media_ids falls back to payload and JSON strings', () => {
  const selected = task({
    all_content_types: false,
    comment_on_post: false,
    selected_media_ids: '[]',
    payload: JSON.stringify({
      trigger_keywords: ['прайс'],
      content_type: 'OPTIONAL',
      selected_media_ids: [MEDIA_A],
      reply_text: 'ok',
      is_active: true,
    }),
  });
  assert.deepEqual(selectedMediaIds(selected), [MEDIA_A]);
  assert.equal(publicationScopeApplies(selected, MEDIA_A).ok, true);
});

test('exact keyword match requires the whole comment', () => {
  const rule = task({ exact_match: true, payload: { trigger_keywords: ['прайс'], reply_text: 'ok' } });
  assert.equal(keywordMatch('прайс', rule).ok, true);
  assert.equal(keywordMatch('нужен прайс пожалуйста', rule).ok, false);
});

test('non-exact keyword match accepts a substring', () => {
  const rule = task({
    exact_match: false,
    payload: { trigger_keywords: ['прайс'], exact_match: false, reply_text: 'ok' },
  });
  assert.equal(keywordMatch('нужен прайс пожалуйста', rule).ok, true);
});

test('inactive and cancelled rules do not match', () => {
  const cancelled = task({ status: 'cancelled' });
  const inactive = task({ payload: { trigger_keywords: ['прайс'], reply_text: 'ok', is_active: false } });
  assert.equal(matchReplyConditions(comment(), [cancelled, inactive]).matches.length, 0);
});

test('own comments are skipped', () => {
  const result = matchReplyConditions(
    comment({
      sender_id: '17841403480052658',
      instagram_account_id: '17841403480052658',
    }),
    [task()],
  );
  assert.equal(result.matches.length, 0);
  assert.equal(result.reason, 'own_comment');
});

test('selected-scope rules are returned before all-personal rules', () => {
  const all = task({ id: 'all' });
  const selected = task({
    id: 'selected',
    all_content_types: false,
    comment_on_post: false,
    selected_media_ids: [MEDIA_A],
    payload: {
      trigger_keywords: ['прайс'],
      content_type: 'OPTIONAL',
      selected_media_ids: [MEDIA_A],
      reply_text: 'selected',
      is_active: true,
    },
  });
  const { matches } = matchReplyConditions(comment(), [all, selected]);
  assert.equal(matches.length, 2);
  assert.equal(matches[0].scope, 'selected');
  assert.equal(matches[1].scope, 'all_personal');
});

test('runN8n reads webhook node plus task rows from $input', () => {
  const inputApi = {
    all: () => [
      {
        json: task({
          all_content_types: false,
          comment_on_post: false,
          selected_media_ids: [MEDIA_A],
          payload: {
            trigger_keywords: ['прайс'],
            content_type: 'OPTIONAL',
            selected_media_ids: [MEDIA_A],
            reply_text: 'DM',
            is_active: true,
          },
        }),
      },
    ],
  };
  const getNodeFn = (name) => {
    if (name !== 'Webhook') throw new Error('missing');
    return {
      all: () => [
        {
          json: {
            body: {
              entry: [
                {
                  id: '17841403480052658',
                  changes: [
                    {
                      value: {
                        from: { id: '1917627436259991' },
                        media: { id: MEDIA_A },
                        id: 'c1',
                        text: 'прайс',
                      },
                    },
                  ],
                },
              ],
            },
          },
        },
      ],
    };
  };

  const items = runN8n(inputApi, getNodeFn);
  assert.equal(items.length, 1);
  assert.equal(items[0].json.matched, true);
  assert.equal(items[0].json.scope, 'selected');
  assert.equal(items[0].json.reply_text, 'DM');
  assert.equal(items[0].json.media_id, MEDIA_A);
});

test('runN8n returns matched=false when the media is not selected', () => {
  const inputApi = {
    all: () => [
      {
        json: task({
          all_content_types: false,
          comment_on_post: false,
          selected_media_ids: [MEDIA_A],
          payload: {
            trigger_keywords: ['прайс'],
            content_type: 'OPTIONAL',
            reply_text: 'DM',
            is_active: true,
          },
        }),
      },
    ],
  };
  const getNodeFn = (name) => {
    if (name !== 'Webhook') throw new Error('missing');
    return {
      all: () => [
        {
          json: {
            body: {
              entry: [
                {
                  id: '17841403480052658',
                  changes: [
                    {
                      value: {
                        from: { id: '1917627436259991' },
                        media: { id: MEDIA_B },
                        id: 'c1',
                        text: 'прайс',
                      },
                    },
                  ],
                },
              ],
            },
          },
        },
      ],
    };
  };
  const items = runN8n(inputApi, getNodeFn);
  assert.equal(items[0].json.matched, false);
  assert.equal(items[0].json.reason, 'no_matching_reply_condition');
});
