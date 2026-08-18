/*
 * n8n — Code in JavaScript1
 * После узла БД (automation_tasks). Режим: Run Once for All Items.
 *
 * Шаги:
 * 1. Берём из БД правила авто-ответа. Кодовые слова — только trigger_keywords[]:
 *    одно слово → ["Dtcs"], несколько → ["Dtcs", "Ffdfd"]. trigger_keyword не используем.
 * 2. Берём текст комментария из webhook: body.entry[0].changes[0].value.text
 *    Пример: "Супер🔥"
 * 3. Ищем этот текст в trigger_keywords (с учётом exact_match).
 *    Нашли → возвращаем текст комментария. Не нашли → "".
 */

// payload правила; Postgres иногда отдаёт его строкой
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

// Всегда массив в квадратных скобках
function triggerKeywords(task) {
  const raw = payloadOf(task).trigger_keywords;
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof raw === 'string' && raw.trim()) return [raw.trim()];
  return [];
}

// Правило действует на все посты или только на выбранные media_id
function publicationOk(task, mediaId) {
  if (task.all_content_types === true) return true;
  const ids = Array.isArray(task.selected_media_ids) ? task.selected_media_ids : [];
  return ids.map(String).includes(String(mediaId));
}

function isActive(task) {
  if (String(task.status || '').toLowerCase() === 'cancelled') return false;
  if (payloadOf(task).is_active === false) return false;
  return true;
}

// exact_match: весь комментарий = слово. Иначе слово может быть внутри текста.
function keywordHit(commentText, task) {
  const text = String(commentText || '').trim().toLowerCase();
  const words = triggerKeywords(task).map((word) => word.toLowerCase());
  if (!text || words.length === 0) return false;
  if (task.exact_match === false) return words.some((word) => text.includes(word));
  return words.includes(text);
}

function readComment(inputApi, getNodeFn) {
  const sources = [];
  const items = typeof inputApi?.all === 'function' ? inputApi.all() : [];
  for (const item of items) sources.push(item.json);
  const names = ['Webhook', 'Instagram Webhook | Вебхук Instagram', 'Instagram Webhook', 'Вебхук Instagram'];
  for (const name of names) {
    try {
      if (typeof getNodeFn === 'function') sources.push(getNodeFn(name).first().json);
    } catch (_error) {
      // узла с таким именем нет — пробуем следующее
    }
  }

  for (const src of sources) {
    const body = (src && src.body) || src || {};
    const value = body.entry && body.entry[0] && body.entry[0].changes && body.entry[0].changes[0]
      ? body.entry[0].changes[0].value
      : null;
    if (value && value.text != null) {
      return {
        text: String(value.text),
        mediaId: String((value.media && value.media.id) || ''),
      };
    }
  }
  return { text: '', mediaId: '' };
}

function isTaskRow(row) {
  return Boolean(row && (row.task_type || (row.payload && row.payload.trigger_keywords)));
}

function runN8n(inputApi, getNodeFn) {
  const comment = readComment(inputApi, getNodeFn);
  const tasks = (typeof inputApi?.all === 'function' ? inputApi.all() : [])
    .map((item) => item.json)
    .filter(isTaskRow);

  const found = tasks.some(
    (task) => isActive(task) && publicationOk(task, comment.mediaId) && keywordHit(comment.text, task),
  );

  // Нашли кодовое слово → текст комментария. Нет → пустая строка.
  return [{ json: { text: found ? comment.text : '' } }];
}

if (typeof $input !== 'undefined') {
  return runN8n($input, typeof $ === 'function' ? $ : null);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    keywordHit,
    publicationOk,
    readComment,
    runN8n,
    triggerKeywords,
  };
}
