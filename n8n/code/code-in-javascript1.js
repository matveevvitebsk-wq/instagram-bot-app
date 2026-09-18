const inputData = $input.first().json.payload.trigger_keywords;

// Цепочка: Webhook → … → ig_accounts → Get a row1 → этот узел
//
// Сравниваем текст комментария из Webhook
//   body.entry[0].changes[0].value.text
// с кодовыми словами из БД: payload.trigger_keywords
//
// exact_match = true  → строки должны совпасть целиком
//   "Супер🔥" и "супер!👏" — это РАЗНЫЕ слова, совпадения нет
// exact_match = false → достаточно, чтобы слово встретилось внутри текста

function payloadOf(task) {
  const raw = task && task.payload;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch (_error) {
      return {};
    }
  }
  return {};
}

function asKeywords(raw) {
  if (Array.isArray(raw)) {
    return raw.map((word) => String(word).trim()).filter(Boolean);
  }
  if (typeof raw === 'string' && raw.trim()) return [raw.trim()];
  return [];
}

const webhook = $('Webhook').first().json;
const body = webhook.body || webhook;
const commentValue =
  body.entry &&
  body.entry[0] &&
  body.entry[0].changes &&
  body.entry[0].changes[0] &&
  body.entry[0].changes[0].value
    ? body.entry[0].changes[0].value
    : {};
const commentText = String(commentValue.text || '').trim();
const commentNorm = commentText.toLowerCase();

const checked = [];
let matchedWord = '';

const matched = $input.all().some(({ json: task }, index) => {
  const payload = payloadOf(task);
  const rawKeywords = index === 0 ? inputData : payload.trigger_keywords;
  const words = asKeywords(rawKeywords);
  checked.push({
    task_id: task.id || null,
    keywords: words,
    exact_match: task.exact_match !== false,
  });

  if (!commentNorm || words.length === 0) return false;
  if (payload.is_active === false) return false;

  const lower = words.map((word) => word.toLowerCase());
  if (task.exact_match === false) {
    const hit = words.find((_word, i) => commentNorm.includes(lower[i]));
    if (hit) {
      matchedWord = hit;
      return true;
    }
    return false;
  }

  const hitIndex = lower.indexOf(commentNorm);
  if (hitIndex >= 0) {
    matchedWord = words[hitIndex];
    return true;
  }
  return false;
});

return [{
  json: {
    text: matched ? commentText : '',
    comment: commentText,
    matched_keyword: matchedWord,
    checked,
  },
}];
