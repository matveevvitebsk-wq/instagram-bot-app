/*
 * n8n — Code in JavaScript1
 *
 * EN: Paste into the Code node that runs after Supabase/Postgres
 *     `automation_tasks` lookup. Mode: Run Once for All Items.
 * RU: Вставьте в узел Code in JavaScript1 после выборки
 *     `automation_tasks`. Режим: Run Once for All Items.
 *
 * Matches an Instagram comment to auto-reply rules for:
 *   - all personal publications (`all_content_types` / content_type=ALL)
 *   - selected publications (`selected_media_ids` contains comment media_id)
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

function asBoolean(value, fallback) {
  if (value === true || value === 'true' || value === 1 || value === '1') return true;
  if (value === false || value === 'false' || value === 0 || value === '0') return false;
  return fallback;
}

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .trim()
    .toLowerCase();
}

function getPayload(task) {
  const parsed = parseJsonMaybe(task?.payload);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  return {};
}

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

function selectedMediaIds(task) {
  const fromColumn = asStringList(task?.selected_media_ids);
  if (fromColumn.length > 0) return fromColumn;
  return asStringList(getPayload(task).selected_media_ids);
}

function isAutoReplyTask(task) {
  const taskType = String(task?.task_type ?? '').trim();
  if (!taskType) return true;
  return taskType === 'dm_reply' || taskType === 'keyword_funnel';
}

function isTaskActive(task) {
  const status = String(task?.status ?? '').trim().toLowerCase();
  if (status === 'cancelled' || status === 'failed') return false;
  const payload = getPayload(task);
  if (payload.is_active === false || payload.is_active === 'false') return false;
  return true;
}

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

function isExactMatch(task) {
  const fromColumn = asBoolean(task?.exact_match, null);
  if (fromColumn !== null) return fromColumn;
  return asBoolean(getPayload(task).exact_match, true);
}

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

const WEBHOOK_NODE_NAMES = [
  'Webhook',
  'Instagram Webhook | Вебхук Instagram',
  'Instagram Webhook',
  'Вебхук Instagram',
];

const TASK_NODE_NAMES = [
  'Get automation_tasks',
  'Supabase',
  'Postgres',
  'Postgres1',
];

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

if (typeof $input !== 'undefined') {
  return runN8n($input, typeof $ === 'function' ? $ : null);
}

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
