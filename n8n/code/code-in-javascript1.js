const inputData = $input.first().json.payload.trigger_keywords;

// Сравниваем trigger_keywords из массива БД с text комментария.
// Нашли → этот text. Нет → "".

function asKeywords(raw) {
  if (Array.isArray(raw)) return raw.map((word) => String(word).trim()).filter(Boolean);
  return [];
}

function commentTextFrom(src) {
  const body = (src && src.body) || src || {};
  const value = body.entry && body.entry[0] && body.entry[0].changes && body.entry[0].changes[0]
    ? body.entry[0].changes[0].value
    : null;
  return value && value.text != null ? String(value.text) : '';
}

let commentText = '';
for (const name of ['Webhook', 'Instagram Webhook | Вебхук Instagram', 'Instagram Webhook', 'Вебхук Instagram']) {
  try {
    commentText = commentTextFrom($(name).first().json);
    if (commentText) break;
  } catch (_error) {}
}
if (!commentText) {
  for (const item of $input.all()) {
    commentText = commentTextFrom(item.json);
    if (commentText) break;
  }
}

const commentNorm = commentText.trim().toLowerCase();
const matched = $input.all().some(({ json: task }, index) => {
  const words = asKeywords(index === 0 ? inputData : task.payload && task.payload.trigger_keywords)
    .map((word) => word.toLowerCase());
  if (!commentNorm || words.length === 0) return false;
  if (task.payload && task.payload.is_active === false) return false;
  if (task.exact_match === false) return words.some((word) => commentNorm.includes(word));
  return words.includes(commentNorm);
});

return [{ json: { text: matched ? commentText : '' } }];
