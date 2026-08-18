/*
 * n8n — узел Code in JavaScript1
 *
 * Куда вставлять:
 *   После узла Supabase/Postgres, который читает таблицу automation_tasks.
 *   Режим узла: Run Once for All Items (один запуск на все строки из БД).
 *
 * Зачем этот скрипт:
 *   Webhook Instagram присылает комментарий к конкретной публикации (media_id).
 *   В БД лежат правила авто-ответа. Правило может действовать:
 *     1) на все личные публикации аккаунта (галочка в Mini App);
 *     2) только на выбранные публикации (selected_media_ids).
 *   Скрипт находит правила, которые подходят и по публикации, и по кодовому слову,
 *   и отдаёт их следующему узлу (IF / отправка DM).
 *
 * Как читать результат:
 *   $json.matched === true  → есть условие ответа, можно слать DM
 *   $json.matched === false → подходящего правила нет, ветку ответа не запускать
 *   $json.scope             → 'all_personal' или 'selected'
 *   $json.reply_text        → текст ответного DM из правила
 */

/**
 * Зачем: Postgres/Supabase иногда отдают JSONB как строку, а не как объект.
 * Что делает: если значение похоже на JSON (`{...}` или `[...]`), разбирает его.
 * Как: при ошибке разбора возвращает исходное значение, чтобы не уронить узел.
 */
function parseJsonMaybe(value) {
  if (value == null) return value;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (trimmed[0] !== '{' && trimmed[0] !== '[') return value;
  try {
    return JSON.parse(trimmed);
  } catch (_error) {
    return value;
  }
}

/**
 * Зачем: media_id в правиле может прийти массивом, одной строкой или JSON-строкой.
 * Что делает: приводит любое из этих представлений к списку уникальных id.
 * Как: разбирает JSON при необходимости, режет пробелы, выбрасывает пустые и дубли.
 */
function asStringList(value) {
  const parsed = parseJsonMaybe(value);
  if (parsed == null || parsed === '') return [];
  const items = Array.isArray(parsed) ? parsed : [parsed];
  const ids = [];
  const seen = new Set();
  for (const item of items) {
    if (item == null) continue;
    const id = String(item).trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * Зачем: в БД boolean иногда лежит как true/false, иногда как 'true'/'false'/0/1.
 * Что делает: приводит значение к настоящему boolean.
 * Как: если распознать не удалось, возвращает fallback (значение по умолчанию).
 */
function asBoolean(value, fallback) {
  if (value === true || value === 'true' || value === 1 || value === '1') return true;
  if (value === false || value === 'false' || value === 0 || value === '0') return false;
  return fallback;
}

/**
 * Зачем: сравнение кодовых слов должно быть устойчивым к регистру и пробелам.
 * Что делает: нижний регистр, обрезка пробелов, замена неразрывного пробела на обычный.
 * Как: это подготовка текста перед exact/substring-сравнением.
 */
function normalizeText(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Зачем: параметры правила (кодовые слова, текст DM, content_type) живут в payload.
 * Что делает: достаёт payload правила как объект.
 * Как: если payload — JSON-строка, разбирает; если битый/пустой — возвращает {}.
 */
function getPayload(task) {
  const parsed = parseJsonMaybe(task?.payload);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  return {};
}

/**
 * Зачем: в UI можно задать несколько кодовых слов; старые записи хранят одно.
 * Что делает: собирает список кодовых слов правила.
 * Как: сначала trigger_keywords[], иначе одно trigger_keyword. Пустые отбрасывает.
 */
function getKeywords(task) {
  const payload = getPayload(task);
  if (Array.isArray(payload.trigger_keywords)) {
    return payload.trigger_keywords
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof payload.trigger_keyword === 'string' && payload.trigger_keyword.trim()) {
    return [payload.trigger_keyword.trim()];
  }
  return [];
}

/**
 * Зачем: id выбранных публикаций пишутся и в колонку, и дублируются в payload.
 * Что делает: возвращает список Instagram media_id, на которые действует правило.
 * Как: колонка selected_media_ids главнее; если она пустая — берём payload.
 */
function selectedMediaIds(task) {
  const fromColumn = asStringList(task?.selected_media_ids);
  if (fromColumn.length > 0) return fromColumn;
  return asStringList(getPayload(task).selected_media_ids);
}

/**
 * Зачем: в automation_tasks лежат и авто-ответы, и другие типы задач.
 * Что делает: пропускает только правила авто-ответа в DM.
 * Как: dm_reply / keyword_funnel. Если тип пустой (узел отдал «голые» поля) — не режем.
 */
function isAutoReplyTask(task) {
  const taskType = String(task?.task_type ?? '').trim();
  if (!taskType) return true;
  return taskType === 'dm_reply' || taskType === 'keyword_funnel';
}

/**
 * Зачем: выключенное правило не должно слать DM.
 * Что делает: проверяет, что правило включено.
 * Как: status cancelled/failed — стоп; payload.is_active === false — стоп (тумблер в UI).
 */
function isTaskActive(task) {
  const status = String(task?.status ?? '').trim().toLowerCase();
  if (status === 'cancelled' || status === 'failed') return false;
  const payload = getPayload(task);
  if (payload.is_active === false || payload.is_active === 'false') return false;
  return true;
}

/**
 * Условие «все личные публикации».
 *
 * Зачем: в Mini App галочка «Авто-ответ на все личные публикации».
 *        Если она включена, правило срабатывает на любой пост/Reels аккаунта.
 *
 * Как определяем (по приоритету):
 *   1) колонка all_content_types = true  → все публикации
 *   2) колонка all_content_types = false → не все, значит только выбранные
 *   3) иначе смотрим payload.content_type: ALL / OPTIONAL / SELECTED
 *   4) иначе comment_on_post: false = выбранные; true и пустой список id = все
 *   5) запасной вариант: нет выбранных id → считаем «все публикации»
 */
function isAllPersonalPublications(task) {
  const payload = getPayload(task);
  const allContentTypes = asBoolean(task?.all_content_types, null);
  if (allContentTypes === true) return true;
  if (allContentTypes === false) return false;

  const contentType = String(payload.content_type ?? '').trim().toUpperCase();
  if (contentType === 'ALL') return true;
  if (contentType === 'OPTIONAL' || contentType === 'SELECTED') return false;

  const commentOnPost = asBoolean(task?.comment_on_post, null);
  if (commentOnPost === false) return false;
  if (commentOnPost === true && selectedMediaIds(task).length === 0) return true;

  return selectedMediaIds(task).length === 0;
}

/**
 * Условие «правило действует на эту публикацию».
 *
 * Зачем: комментарий приходит к одному media_id. Нужно понять, отвечать ли на него.
 *
 * Как:
 *   - все личные публикации → ok, scope = all_personal (media_id не проверяем)
 *   - выбранные публикации → ok только если media_id есть в selected_media_ids
 *   - нет media_id или список выбранных пуст → не подходит
 */
function publicationScopeApplies(task, mediaId) {
  if (isAllPersonalPublications(task)) {
    return { ok: true, scope: 'all_personal' };
  }
  const selected = selectedMediaIds(task);
  if (!mediaId || selected.length === 0) {
    return { ok: false, scope: 'selected' };
  }
  return {
    ok: selected.includes(String(mediaId)),
    scope: 'selected',
  };
}

/**
 * Зачем: галочка «Точное совпадение» в форме кодовых слов.
 * Что делает: читает режим сравнения комментария с кодовым словом.
 * Как: колонка exact_match главнее payload; если нигде нет — по умолчанию true.
 */
function isExactMatch(task) {
  const fromColumn = asBoolean(task?.exact_match, null);
  if (fromColumn !== null) return fromColumn;
  return asBoolean(getPayload(task).exact_match, true);
}

/**
 * Условие «кодовое слово совпало».
 *
 * Зачем: авто-ответ должен сработать только на нужную фразу в комментарии.
 *
 * Как:
 *   - точное совпадение: весь текст комментария равен кодовому слову (без регистра)
 *   - без галочки: достаточно, чтобы слово встречалось внутри комментария
 *   - несколько слов в правиле: достаточно совпадения любого одного
 */
function keywordMatch(commentText, task) {
  const keywords = getKeywords(task);
  if (keywords.length === 0) return { ok: false, keyword: null };
  const normalizedComment = normalizeText(commentText);
  if (!normalizedComment) return { ok: false, keyword: null };
  const exact = isExactMatch(task);

  for (const keyword of keywords) {
    const normalizedKeyword = normalizeText(keyword);
    if (!normalizedKeyword) continue;
    const matched = exact
      ? normalizedComment === normalizedKeyword
      : normalizedComment.includes(normalizedKeyword);
    if (matched) return { ok: true, keyword };
  }
  return { ok: false, keyword: null };
}

/**
 * Зачем: во вход n8n попадают и строки задач, и webhook, и обёртки {data:[...]}.
 * Что делает: отвечает, похож ли объект на строку automation_tasks.
 * Как: ищем поля правила (task_type, payload, selected_media_ids, …), а не токена аккаунта.
 */
function looksLikeTask(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  return Boolean(
    obj.task_type ||
      obj.payload ||
      obj.selected_media_ids !== undefined ||
      obj.all_content_types !== undefined ||
      obj.comment_on_post !== undefined ||
      obj.trigger_keyword ||
      obj.trigger_keywords,
  );
}

/**
 * Зачем: Postgres может отдать одну строку, массив rows, или {data: [...]} от Supabase.
 * Что делает: вытаскивает из объекта все правила и кладёт их в bucket.
 * Как: рекурсивно обходит tasks/data, иначе добавляет сам объект, если он похож на задачу.
 */
function collectTasksFromObject(obj, bucket) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj.tasks)) {
    obj.tasks.forEach((task) => collectTasksFromObject(task, bucket));
    return;
  }
  if (Array.isArray(obj.data) && obj.data.some(looksLikeTask)) {
    obj.data.forEach((task) => collectTasksFromObject(task, bucket));
    return;
  }
  if (looksLikeTask(obj)) bucket.push(obj);
}

/**
 * Зачем: комментарий приходит в разных формах (сырой Meta webhook, каноническое событие,
 *        уже разобранные поля). Дальше нужен один плоский объект.
 * Что делает: достаёт текст, media_id, автора и id комментария.
 * Как (по очереди):
 *   1) каноническое событие base-workflow: json.change.*
 *   2) конверт Meta: body.entry[].changes[].value
 *   3) уже плоские поля comment_text / media_id
 *   4) вложенные json/body/value/event
 */
function extractComment(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 6) return null;

  if (obj.change && (obj.change.text != null || obj.change.media_id || obj.change.id)) {
    return {
      comment_id: obj.change.id ?? obj.event_id ?? null,
      comment_text: obj.change.text ?? '',
      media_id: obj.change.media_id ?? obj.change.media?.id ?? null,
      media_product_type: obj.change.media_product_type ?? obj.change.media?.media_product_type ?? null,
      sender_id: obj.sender_id ?? obj.change.from?.id ?? null,
      sender_username: obj.change.from?.username ?? null,
      instagram_account_id: obj.instagram_account_id ?? obj.recipient_id ?? null,
      verb: obj.change.verb ?? null,
    };
  }

  const body = obj.body && typeof obj.body === 'object' ? obj.body : obj;
  const entries = Array.isArray(body.entry) ? body.entry : Array.isArray(obj.entry) ? obj.entry : [];
  if (entries.length > 0) {
    const entry = entries[0] ?? {};
    const changeWrapper = Array.isArray(entry.changes) ? entry.changes[0] : null;
    const value = changeWrapper?.value ?? {};
    if (value.text != null || value.media || value.id) {
      return {
        comment_id: value.id ?? null,
        comment_text: value.text ?? '',
        media_id: value.media?.id ?? value.media_id ?? null,
        media_product_type: value.media?.media_product_type ?? null,
        sender_id: value.from?.id ?? null,
        sender_username: value.from?.username ?? null,
        instagram_account_id: entry.id ?? null,
        verb: value.verb ?? null,
      };
    }
  }

  if (obj.comment_text != null || obj.media_id != null || obj.comment_id != null) {
    return {
      comment_id: obj.comment_id ?? obj.id ?? null,
      comment_text: obj.comment_text ?? obj.text ?? '',
      media_id: obj.media_id ?? obj.media?.id ?? null,
      media_product_type: obj.media_product_type ?? obj.media?.media_product_type ?? null,
      sender_id: obj.sender_id ?? obj.from?.id ?? null,
      sender_username: obj.sender_username ?? obj.from?.username ?? null,
      instagram_account_id: obj.instagram_account_id ?? obj.page_id ?? null,
      verb: obj.verb ?? null,
    };
  }

  for (const nested of [obj.json, obj.body, obj.value, obj.event]) {
    const found = extractComment(nested, depth + 1);
    if (found) return found;
  }
  return null;
}

/**
 * Зачем: в n8n данные предыдущего узла — в $input, а webhook — в другом узле.
 * Что делает: безопасно читает все item.json узла по имени через $('ИмяУзла').
 * Как: если узла нет или он ещё не выполнялся, n8n бросает ошибку — ловим и отдаём [].
 */
function readNodeItems(getNodeFn, name) {
  if (typeof getNodeFn !== 'function') return [];
  try {
    const node = getNodeFn(name);
    if (!node || typeof node.all !== 'function') return [];
    return node.all().map((item) => item.json);
  } catch (_error) {
    return [];
  }
}

// Имена узлов, откуда берём комментарий. Если webhook называется иначе — добавьте имя сюда.
const WEBHOOK_NODE_NAMES = [
  'Webhook',
  'Instagram Webhook | Вебхук Instagram',
  'Instagram Webhook',
  'Вебхук Instagram',
];

// Имена узлов выборки правил из БД. Нужны, если Code стоит не сразу после Postgres.
const TASK_NODE_NAMES = [
  'Get automation_tasks',
  'Supabase',
  'Postgres',
  'Postgres1',
];

/**
 * Процедура сбора входных данных.
 *
 * Зачем: комментарий и правила приходят из разных узлов, их нужно сложить вместе.
 * Что делает: собирает comment + список automation_tasks без дублей.
 * Как:
 *   1) берём все item текущего узла ($input)
 *   2) дополнительно читаем webhook и Postgres по известным именам
 *   3) из каждого источника пробуем вытащить комментарий и строки задач
 */
function collectCommentAndTasks(inputApi, getNodeFn) {
  const sources = [];
  const inputItems = typeof inputApi?.all === 'function' ? inputApi.all() : [];
  for (const item of inputItems) sources.push(item.json);

  for (const name of WEBHOOK_NODE_NAMES.concat(TASK_NODE_NAMES)) {
    for (const json of readNodeItems(getNodeFn, name)) sources.push(json);
  }

  let comment = null;
  const tasks = [];
  const seenTaskKeys = new Set();

  for (const source of sources) {
    if (!comment) comment = extractComment(source);
    const bucket = [];
    collectTasksFromObject(source, bucket);
    for (const task of bucket) {
      const key = String(task.id ?? JSON.stringify(task));
      if (seenTaskKeys.has(key)) continue;
      seenTaskKeys.add(key);
      tasks.push(task);
    }
  }

  return { comment, tasks };
}

/**
 * Предварительный отсев комментария, на который нельзя отвечать.
 *
 * Зачем: не слать DM на удаление/скрытие комментария и не отвечать самому себе.
 * Как:
 *   - комментарий не разобрали → comment_not_found
 *   - verb remove/hide/unhide/edited → служебное событие, не новый комментарий
 *   - sender_id == instagram_account_id → это комментарий самого аккаунта
 */
function shouldSkipComment(comment) {
  if (!comment) return { skip: true, reason: 'comment_not_found' };
  const verb = String(comment.verb ?? '').toLowerCase();
  if (verb === 'remove' || verb === 'hide' || verb === 'unhide' || verb === 'edited') {
    return { skip: true, reason: `comment_verb_${verb}` };
  }
  if (comment.sender_id && comment.instagram_account_id && String(comment.sender_id) === String(comment.instagram_account_id)) {
    return { skip: true, reason: 'own_comment' };
  }
  return { skip: false, reason: null };
}

/**
 * Главная процедура: какие правила из БД подходят к этому комментарию.
 *
 * Зачем: это и есть «получить условия ответа» — все / выбранные публикации + кодовое слово.
 *
 * Как для каждой строки automation_tasks:
 *   1) это авто-ответ и оно включено?
 *   2) публикация входит в область правила (все личные или выбранные)?
 *   3) кодовое слово совпало (точно или как подстрока)?
 *
 * Если несколько правил подошли, сначала идут selected (более узкие), потом all_personal.
 */
function matchReplyConditions(comment, tasks) {
  const skip = shouldSkipComment(comment);
  if (skip.skip) {
    return { matches: [], reason: skip.reason };
  }

  const matches = [];
  for (const task of tasks) {
    if (!isAutoReplyTask(task) || !isTaskActive(task)) continue;

    const scope = publicationScopeApplies(task, comment.media_id);
    if (!scope.ok) continue;

    const keyword = keywordMatch(comment.comment_text, task);
    if (!keyword.ok) continue;

    const payload = getPayload(task);
    matches.push({
      matched: true,
      scope: scope.scope,
      task_id: task.id ?? null,
      ig_account_id: task.ig_account_id ?? null,
      owner_id: task.owner_id ?? null,
      reply_text: payload.reply_text ?? null,
      keywords: getKeywords(task),
      matched_keyword: keyword.keyword,
      exact_match: isExactMatch(task),
      check_subscription: asBoolean(task.check_subscription, asBoolean(payload.check_subscription, true)),
      comment_on_post: asBoolean(task.comment_on_post, true),
      all_content_types: isAllPersonalPublications(task),
      selected_media_ids: selectedMediaIds(task),
      comment_id: comment.comment_id,
      comment_text: comment.comment_text,
      media_id: comment.media_id,
      media_product_type: comment.media_product_type,
      sender_id: comment.sender_id,
      sender_username: comment.sender_username,
      instagram_account_id: comment.instagram_account_id,
    });
  }

  matches.sort((left, right) => {
    if (left.scope !== right.scope) return left.scope === 'selected' ? -1 : 1;
    return 0;
  });

  return {
    matches,
    reason: matches.length === 0 ? 'no_matching_reply_condition' : null,
  };
}

/**
 * Точка входа узла n8n.
 *
 * Зачем: Code-узел обязан вернуть массив item [{ json: ... }].
 * Что делает: собирает данные, применяет условия, формирует выход.
 * Как:
 *   - есть совпадения → по одному item на правило (можно слать несколько DM)
 *   - нет совпадений → один item с matched:false, чтобы IF мог спокойно отсечь ветку
 */
function runN8n(inputApi, getNodeFn) {
  const { comment, tasks } = collectCommentAndTasks(inputApi, getNodeFn);
  const { matches, reason } = matchReplyConditions(comment, tasks);

  if (matches.length === 0) {
    return [{
      json: {
        matched: false,
        reason,
        comment_id: comment?.comment_id ?? null,
        comment_text: comment?.comment_text ?? null,
        media_id: comment?.media_id ?? null,
        sender_id: comment?.sender_id ?? null,
        instagram_account_id: comment?.instagram_account_id ?? null,
        task_count: tasks.length,
      },
    }];
  }

  return matches.map((match) => ({ json: match }));
}

// В n8n $input всегда есть: сразу выполняем процедуру и возвращаем items.
if (typeof $input !== 'undefined') {
  return runN8n($input, typeof $ === 'function' ? $ : null);
}

// Вне n8n (тесты Node.js) экспортируем функции, не запуская узел.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    asStringList,
    collectCommentAndTasks,
    extractComment,
    isAllPersonalPublications,
    keywordMatch,
    matchReplyConditions,
    publicationScopeApplies,
    runN8n,
    selectedMediaIds,
  };
}
