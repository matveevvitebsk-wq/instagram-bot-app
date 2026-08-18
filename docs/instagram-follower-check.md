# Instagram follower check

## Decision

Implement the Graph API call in **FastAPI**, not in n8n.

n8n should only read `automation_tasks.check_subscription` and, when it is
true, send a command to the backend. The backend resolves the connected
account, uses the stored token, calls Meta, and returns a sanitized boolean.

This matches the existing Meta action-broker plan in
[`meta-token-n8n-architecture.md`](./meta-token-n8n-architecture.md): n8n
orchestrates, FastAPI owns tokens and Graph execution.

## How you know if someone follows the connected account

Instagram does not give third-party apps a followers list, a “lookup by
username” follow check, or a webhook when someone follows you.

`ig_accounts.followers_count` is only the **count** of followers on the
connected professional account. It cannot answer “does user X follow me?”.

The official field is **`is_user_follow_business`** on Meta’s User Profile
API. You look up the person by their Instagram-scoped ID (**IGSID**), which
arrives on a messaging or comment webhook:

- Messaging: `entry.messaging[].sender.id`
- Comments: `entry.changes[].value.from.id`

Instagram Login (this project’s IGAA token):

```text
GET https://graph.instagram.com/{version}/{IGSID}
  ?fields=is_user_follow_business,is_business_follow_user,username
  &access_token={IGAA}
```

Facebook Login / Page token (EAAV), if that is the only credential:

```text
GET https://graph.facebook.com/{version}/{IGSID}
  ?fields=is_user_follow_business,is_business_follow_user,username
  &access_token={EAAV}
```

`is_user_follow_business: true` means the person follows the professional
account. `is_business_follow_user` is the reverse (the business follows them).

Required Instagram Login scopes already requested by this app:

- `instagram_business_basic`
- `instagram_business_manage_messages`

## Limits that affect auto-reply

1. You cannot check an arbitrary username. You need the IGSID from an event
   that belongs to the connected account.
2. Meta requires **messaging consent** for the User Profile API. A person
   grants it by sending a DM, tapping an icebreaker, or using the persistent
   menu. A comment alone is not enough: Graph returns
   `User consent is required to access the user profile`.
3. Therefore **do not gate the first private reply on follow status**. Send
   the private reply, then check follow status on the inbound DM if
   `check_subscription` is true.

Recommended n8n path:

```text
comment keyword match
  → private reply (“напишите в Direct / подпишитесь”)
inbound DM
  → if check_subscription is false → continue funnel
  → POST /api/internal/meta/actions  operation=check_follower
  → follows=true  → continue funnel
  → follows=false → ask to follow and write again
  → consent_required → wait for a real inbound message, then retry
```

## Backend contract

```text
POST /api/internal/meta/actions
Authorization: Bearer <N8N_SERVICE_TOKEN or N8N_API_KEY>
```

```json
{
  "operation": "check_follower",
  "target_igsid": "1784...",
  "ig_account_id": "uuid-from-automation_tasks",
  "instagram_account_id": "entry.id",
  "task_id": "uuid-of-automation-rule",
  "event_id": "optional-meta-event-id"
}
```

Provide `ig_account_id` and/or `instagram_account_id` (`ig_accounts.page_id`).
If `task_id` is set and that rule has `check_subscription=false`, the backend
skips Graph and returns `follows: true` so the workflow can keep a single
gate.

Success:

```json
{
  "ok": true,
  "operation": "check_follower",
  "skipped": false,
  "follows": true,
  "is_user_follow_business": true,
  "is_business_follow_user": false,
  "username": "commenter",
  "consent_required": false,
  "retryable": false,
  "error_code": null,
  "account_id": "...",
  "instagram_account_id": "...",
  "token_kind": "igaa"
}
```

The response never contains an access token. n8n HTTP Request nodes must call
this endpoint instead of `graph.instagram.com` / `graph.facebook.com`.
