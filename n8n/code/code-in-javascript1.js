const inputData = $input.first().json.payload.trigger_keywords;

// Цепочка:
//   Webhook → … → ig_accounts → Get a row1 → Code in JavaScript1
//
// Get a row1 отдаёт строки automation_tasks.
// inputData — кодовые слова первой строки: ["Бежим", "Бегать"]
//
// Текст комментария берём из узла Webhook:
//   body.entry[0].changes[0].value.text  →  например "Супер🔥"
//
// Сравниваем text с trigger_keywords всех строк.
// Совпало → возвращаем этот text. Не совпало → "".

function asKeywords(raw) {
  // Всегда массив: одно слово → ["Бежим"], несколько → ["Бежим", "Бегать"]
  if (Array.isArray(raw)) {
    return raw.map((word) => String(word).trim()).filter(Boolean);
  }
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

// Все правила, которые вернул Get a row1 (одна или несколько строк)
const matched = $input.all().some(({ json: task }, index) => {
  const rawKeywords = index === 0
    ? inputData
    : (task.payload && task.payload.trigger_keywords);

  const words = asKeywords(rawKeywords).map((word) => word.toLowerCase());

  // Пустой комментарий или нет кодовых слов — это правило не подходит
  if (!commentNorm || words.length === 0) return false;

  // Выключенное правило не отвечает
  if (task.payload && task.payload.is_active === false) return false;

  // exact_match = true  → комментарий целиком равен слову ("Бежим" === "бежим")
  // exact_match = false → слово может быть внутри текста ("давайте бежим")
  if (task.exact_match === false) {
    return words.some((word) => commentNorm.includes(word));
  }
  return words.includes(commentNorm);
});

return [{ json: { text: matched ? commentText : '' } }];
