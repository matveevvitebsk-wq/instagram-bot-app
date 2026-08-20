const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(
  path.join(__dirname, 'code-in-javascript1.js'),
  'utf8',
);

function runScript($input, $) {
  return new Function('$input', '$', source)($input, $);
}

const task = {
  id: '78102c0e-05a8-4cb6-8e8a-710b8eb890dd',
  task_type: 'dm_reply',
  status: 'pending',
  payload: {
    is_active: true,
    reply_text: 'Когда бежим?🤪',
    exact_match: true,
    content_type: 'ALL',
    trigger_keywords: ['Бежим', 'Бегать'],
    selected_media_ids: [],
  },
  exact_match: true,
  all_content_types: true,
  selected_media_ids: [],
};

const webhookBody = {
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
  const items = rows.map((json) => ({ json }));
  return {
    first: () => items[0],
    all: () => items,
  };
}

function $(name) {
  if (name !== 'Webhook') throw new Error('missing');
  return { first: () => ({ json: webhookBody }) };
}

test('первая строка читает trigger_keywords из первой записи БД', () => {
  assert.match(source, /const inputData = \$input\.first\(\)\.json\.payload\.trigger_keywords;/);
  const items = runScript(inputOf([task]), $);
  assert.equal(items[0].json.text, '');
});

test('слова нет в trigger_keywords — пустая строка', () => {
  const items = runScript(inputOf([task]), $);
  assert.equal(items[0].json.text, '');
});

test('слово совпало — на выход текст комментария', () => {
  const $hit = (name) => {
    if (name !== 'Webhook') throw new Error('missing');
    return {
      first: () => ({
        json: {
          body: {
            entry: [
              {
                changes: [
                  {
                    value: { text: 'Бежим', media: { id: '17882021514199226' } },
                  },
                ],
              },
            ],
          },
        },
      }),
    };
  };
  const items = runScript(inputOf([task]), $hit);
  assert.equal(items[0].json.text, 'Бежим');
});

test('ищет trigger_keywords во всех строках массива из БД', () => {
  const other = {
    ...task,
    id: 'other',
    payload: { ...task.payload, trigger_keywords: ['Супер🔥'] },
  };
  const items = runScript(inputOf([task, other]), $);
  assert.equal(items[0].json.text, 'Супер🔥');
});
