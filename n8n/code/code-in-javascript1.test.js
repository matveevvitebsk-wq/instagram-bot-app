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

const { keywordHit, publicationOk, runN8n, triggerKeywords } = loadScript();

const dbRow = {
  id: '78102c0e-05a8-4cb6-8e8a-710b8eb890dd',
  owner_id: 'bebe715a-64e2-465b-ac48-a41fe6b2663f',
  ig_account_id: '81fb5239-3015-410b-944c-1d8cfdbaa737',
  task_type: 'dm_reply',
  status: 'pending',
  payload: {
    is_active: true,
    reply_text: 'Когда бежим?🤪',
    exact_match: true,
    content_type: 'ALL',
    trigger_keywords: ['Dtcs', 'Ffdfd'],
    selected_media_ids: [],
  },
  comment_on_post: true,
  exact_match: true,
  all_content_types: true,
  selected_media_ids: [],
  check_subscription: true,
};

const webhook = {
  body: {
    entry: [
      {
        id: '17841403480052658',
        time: 1787062205,
        changes: [
          {
            value: {
              from: { id: '1917627436259991', username: 'sveta_boltkova' },
              media: { id: '17882021514199226', media_product_type: 'REELS' },
              id: '18058300073782238',
              text: 'Супер🔥',
            },
            field: 'comments',
          },
        ],
      },
    ],
    object: 'instagram',
  },
};

function inputOf(rows) {
  return { all: () => rows.map((json) => ({ json })) };
}

function webhookFn(name) {
  if (name !== 'Webhook') throw new Error('missing');
  return { first: () => ({ json: webhook }) };
}

test('trigger_keywords всегда массив, trigger_keyword не читаем', () => {
  assert.deepEqual(triggerKeywords(dbRow), ['Dtcs', 'Ffdfd']);
  assert.deepEqual(
    triggerKeywords({ payload: { trigger_keywords: ['Dtcs'] } }),
    ['Dtcs'],
  );
  assert.deepEqual(
    triggerKeywords({ payload: { trigger_keyword: 'old', trigger_keywords: ['Dtcs'] } }),
    ['Dtcs'],
  );
  assert.deepEqual(triggerKeywords({ payload: { trigger_keyword: 'old' } }), []);
});

test('все личные публикации пропускают любой media_id', () => {
  assert.equal(publicationOk(dbRow, '17882021514199226'), true);
});

test('выбранные публикации — только id из списка', () => {
  const selected = {
    ...dbRow,
    all_content_types: false,
    selected_media_ids: ['17882021514199226'],
  };
  assert.equal(publicationOk(selected, '17882021514199226'), true);
  assert.equal(publicationOk(selected, 'other'), false);
});

test('точное совпадение кодового слова', () => {
  assert.equal(keywordHit('Dtcs', dbRow), true);
  assert.equal(keywordHit('dtcs', dbRow), true);
  assert.equal(keywordHit('Супер🔥', dbRow), false);
  assert.equal(keywordHit('нужен Dtcs', dbRow), false);
});

test('без exact_match достаточно подстроки', () => {
  const loose = { ...dbRow, exact_match: false };
  assert.equal(keywordHit('нужен Dtcs сегодня', loose), true);
});

test('слово найдено — на выход текст комментария', () => {
  const hitWebhook = {
    first: () => ({
      json: {
        body: {
          entry: [
            {
              changes: [
                {
                  value: {
                    media: { id: '17882021514199226' },
                    text: 'Dtcs',
                  },
                },
              ],
            },
          ],
        },
      },
    }),
  };
  const items = runN8n(inputOf([dbRow]), (name) => {
    if (name !== 'Webhook') throw new Error('missing');
    return hitWebhook;
  });
  assert.equal(items[0].json.text, 'Dtcs');
});

test('слова нет — пустая строка', () => {
  const items = runN8n(inputOf([dbRow]), webhookFn);
  assert.equal(items[0].json.text, '');
});
