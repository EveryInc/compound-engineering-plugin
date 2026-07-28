---
name: ce-proof
description: Publish, read, comment on, or edit markdown in Proof. Use for Proof links, sharing specs/plans/drafts, or publish handoffs from planning workflows; avoid proofread, math, evidence, or proof-of-concept meanings.
allowed-tools:
  - Bash
  - Read
  - Write
  - WebFetch
---

# Proof - Collaborative Markdown Editor

Proof is a collaborative document editor for humans and agents. This skill uses the **hosted web API** at `https://www.proofeditor.ai` (HTTP/`Bash`). If typed `proof_*` MCP tools are already available in the harness, prefer them; otherwise use the HTTP recipes below.

## Identity and Attribution

Every write to a Proof doc must be attributed. Two fields carry the agent's identity:

- **Machine ID (`by` on every op, `X-Agent-Id` header):** `ai:compound-engineering` — stable, lowercase-hyphenated, machine-parseable. Appears in marks, events, and the API response.
- **Display name (`name` on `POST /presence`):** `Compound Engineering` — human-readable, shown in Proof's presence chips and comment-author badges.

Set the display name once per doc session by posting to presence with the `X-Agent-Id` header; Proof binds the name to that agent ID for the session. These values are the defaults for any caller of this skill; a caller may pass a different `identity` pair if a distinct sub-agent should own the doc. Do not use `ai:compound` or other ad-hoc variants — identity stays uniform unless a caller explicitly overrides it.

## Publish Mode

The primary use is one-way publishing: take an existing local markdown file (a brainstorm, a unified plan, a learning, a draft), read its full contents and post them as the new doc's body (see "Workflow: Create and Share a New Document" for the source-file recipe — never publish placeholder content), and hand the user a shareable URL. The local file stays canonical — publishing does not sync anything back to disk. The user can open the link to read, comment, and share with others; the agent can also participate via the edit APIs below when given the URL. Two entry points, identical mechanics (see "Workflow: Create and Share a New Document"):

- **Direct user request** — a bare user phrase naming a local markdown file and asking to share it via Proof: "share this to proof", "publish this to proof", "open this in proof editor so I can review", "get me a proof link for this doc". The file is whichever markdown the user just created, edited, or referenced; if ambiguous, ask which file. This is a first-class entry point — do not require an upstream caller.
- **Upstream skill handoff** — `ce-brainstorm`, `ce-ideate`, or `ce-plan` finishes a draft and hands it off to publish for human review, passing the file path and title explicitly.

Only publish markdown. If the source is an HTML unified plan, do not upload it
to Proof; return the local browser/open path instead. When publishing a unified
plan, label the title by readiness when available, e.g. `Plan: <title>
(requirements-only)` or `Plan: <title> (implementation-ready)`.

Do not silently replace repo-tracked project docs with Proof links. Do not put secrets, credentials, API keys, private tokens, or sensitive personal data in Proof unless the user explicitly approves.

## Credentials

Document creation returns two credentials with different jobs:

- `accessToken` — everyday bearer for read, edit, presence, and events. Use this for all non-owner agent API calls.
- `ownerSecret` — owner authority only (delete and other owner-level ops). Never use it as the everyday bearer.

Store them separately for the session (shell vars or equivalent non-repo memory). Never write `ownerSecret` or `accessToken` into repo-tracked files, commits, or durable project logs. Never expose `ownerSecret` in user-facing UI copy.

Always hand humans the tokenized link (`tokenUrl`), never a bare `/d/<slug>` alone — the editor token doubles as claim capability for ownerless docs.

Public creates are ownerless until a signed-in Every user claims the doc in the browser (account menu → Claim ownership). Claiming permanently revokes `ownerSecret`; `accessToken` keeps working. After claim, delete and other owner ops belong to the owner's Every account — ask the owner, or use their Every session token. Do not retry delete with a revoked `ownerSecret`.

Treat a `403` with `code: "DOCUMENT_DELETE_FORBIDDEN"` and `reason: "CREDENTIAL_NOT_OWNER"`, or a `401` when presenting the creation `ownerSecret`, as evidence the secret was revoked (commonly after claim). Stop using that `ownerSecret`; ask the owner to delete or supply an Every owner session.

## Web API

Auth on document surfaces (preferred first):

- `Authorization: Bearer <accessToken>`
- `x-share-token: <accessToken>`
- `?token=<accessToken>` on the request URL

Canonical agent read/write (v3 only — do not invent other agent mutation paths):

- Read: `GET /api/agent/<slug>/v3/document`
- Write: `POST /api/agent/<slug>/v3/edit`

### Create a Shared Document

No authentication required on the public create route. Returns a shareable URL with tokens.

```bash
curl -sS -X POST https://www.proofeditor.ai/share/markdown \
  -H "Content-Type: application/json" \
  -d '{"title":"My Doc","markdown":"# Hello\n\nContent here."}'
```

**Response fields to keep:**

```json
{
  "slug": "abc123",
  "tokenUrl": "https://www.proofeditor.ai/d/abc123?token=xxx",
  "accessToken": "xxx",
  "ownerSecret": "yyy",
  "shareUrl": "https://www.proofeditor.ai/d/abc123",
  "_links": {
    "read": "https://www.proofeditor.ai/api/agent/abc123/v3/document",
    "edit": { "method": "POST", "href": "/api/agent/abc123/v3/edit" },
    "delete": { "method": "DELETE", "href": "/api/documents/abc123" }
  }
}
```

Use `tokenUrl` as the shareable link. Extract `slug`, `accessToken`, and `ownerSecret` immediately — `ownerSecret` is required for cleanup while the doc is still unclaimed.

### Read a Shared Document

If you already have a shared Proof URL, fetch with content negotiation or v3:

```bash
curl -sS -H "Accept: application/json" "https://www.proofeditor.ai/d/{slug}?token=<token>"
curl -sS -H "Accept: text/markdown" "https://www.proofeditor.ai/d/{slug}?token=<token>"

curl -sS "https://www.proofeditor.ai/api/agent/{slug}/v3/document" \
  -H "Authorization: Bearer <token>" \
  -H "X-Agent-Id: ai:compound-engineering"
# -> { ok, revision, title, markdown, comments[], suggestions[], mutationReady? }
```

ACTIVE docs can be read tokenlessly via `v3/document`. Mutations, presence, and events need a tokenized credential. Tokenless `GET /d/<slug>` JSON reports `role: null` and no mutation links — that is truthful capability reporting, not a browser lock.

`comments[]` and `suggestions[]` on the v3 read are the source of review state. Use a comment's `id` for `reply` / `resolve` / `unresolve`. Use a suggestion's `id` for `accept` / `reject`. v3 supports resolving and unresolving comments; it does **not** support deleting comments.

When `mutationReady` is `false`, `revision` may be `null` — omit `baseRevision` and re-read shortly.

### Edit a Shared Document

Send `{ by, baseRevision?, operations: [...] }` to `POST /api/agent/{slug}/v3/edit`. Targets are **visible text** in `markdown` (not raw markdown syntax, not block refs). There is no base token. `baseRevision` (integer from the last read) is an optional conflict guard — omit it to apply at head. `Idempotency-Key` is optional; use one for important writes and retries.

```bash
curl -sS -X POST "https://www.proofeditor.ai/api/agent/{slug}/v3/edit" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -H "X-Agent-Id: ai:compound-engineering" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "by":"ai:compound-engineering",
    "operations":[
      {"op":"replace","find":"old visible text","with":"new text"},
      {"op":"comment","on":"text to anchor on","body":"Is this still accurate?"}
    ]
  }'
```

**Content operations:**

| op | body |
|---|---|
| `replace` | `find`, `with` (optional `occurrence` / `before` / `after`) |
| `insert` | `after` or `before` + `markdown` (anchor: quote, `heading:Title`, `section:Title`, `"start"`, or `"end"`) |
| `delete` | `find` |
| `set_document` | `markdown` (whole-doc replace as a minimal diff; safe with live collaborators) |

**Review operations:**

| op | body |
|---|---|
| `comment` | `on`, `body` (optional `occurrence`) |
| `reply` | `comment` (id), `body`, optional `resolve: true` |
| `resolve` / `unresolve` | `comment` (id) |
| `suggest` | `kind: "insert"\|"delete"\|"replace"`, `find`, `with?` (`with` required for insert/replace) |
| `accept` / `reject` | `suggestion` (id) |

### Edit Strategy

Prefer the narrowest op:

1. Literal or scoped prose change → `replace` / `insert` / `delete`
2. Visible track-changes desired → `suggest` (then `accept`/`reject` as needed)
3. Whole-doc replacement → `set_document` only when the user asks for full replacement or the change cannot be expressed narrowly

If a `find`/anchor matches more than once, the server rejects with `TARGET_AMBIGUOUS` and `error.candidates` — nothing is changed. Disambiguate with `occurrence` (`"first"`, `"last"`, or 0-based index) or `before`/`after`. Never assume silent first-match.

Content ops in one request apply atomically; review ops then apply in order. If a review op fails after content committed, the response is `ok: false` with `partial: true` — re-read and retry only the failed op (same `Idempotency-Key` safely replays).

**Errors** use `{ ok:false, error:{ code, message, retryable, opIndex?, target?, candidates?, current? } }`. Codes: `AUTH`, `NOT_FOUND`, `INVALID_REQUEST`, `TARGET_NOT_FOUND`, `TARGET_AMBIGUOUS`, `CONFLICT`, `TOO_LARGE`, `BUSY`, `PENDING`, `INTERNAL`.

- `retryable: false` — fix the request; do not blind-retry
- `retryable: true` with `error.current` — re-resolve targets against `current` and retry once
- `TARGET_AMBIGUOUS` — add `occurrence` / `before` / `after` from `candidates`
- `BUSY` — brief backoff and retry
- Settled `200` with `ok:true` — inspect returned `revision` / document; chain without an extra read when the body is complete
- `202` / `PENDING` — write may have committed; re-read `v3/document` before chaining or reporting success

After every successful edit: confirm `ok:true`, confirm the intended text/comment/suggestion, then report the Proof link with a short summary.

### Presence

```bash
curl -sS -X POST "https://www.proofeditor.ai/api/agent/{slug}/presence" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -H "X-Agent-Id: ai:compound-engineering" \
  -d '{"name":"Compound Engineering","status":"reading","summary":"Joining the doc"}'
```

Common statuses: `reading`, `thinking`, `acting`, `waiting`, `completed`, `error`.

### Title

```bash
curl -sS -X PUT "https://www.proofeditor.ai/api/documents/{slug}/title" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"title":"Updated document title"}'
```

### Delete

Only owner credentials can delete:

```bash
curl -sS -X DELETE "https://www.proofeditor.ai/api/documents/{slug}" \
  -H "Authorization: Bearer <ownerSecret>"
```

Viewer, commenter, and editor `accessToken` values cannot delete. Success returns `shareState: "DELETED"`; later reads return deleted-document responses (`410` on many routes).

**Lifecycle:** Do **not** auto-delete after every publish handoff — review docs must linger. Persist `ownerSecret` for the session. Delete when the user asks to remove/clean up, or when finishing an explicitly ephemeral scratch doc the user is done with.

### Marks and privacy

Emptying the markdown (including `set_document` to blank/minimal content) does **not** scrub comment marks. Quote and commentary fields can remain readable via `v3/document` to anyone with the share credential. Without owner delete authority, content wipe is not a privacy cleanup — delete the document with `ownerSecret` (while unclaimed) or ask the owner after claim.

### When the loop breaks

If a mutation keeps failing after a fresh read and one safe retry, call `POST https://www.proofeditor.ai/api/bridge/report_bug` with the failing request ID, slug, and raw response. The server enriches and files an issue. Ask before including the user's name/email.

## Workflow: Review a Shared Document

When given a Proof URL like `https://www.proofeditor.ai/d/abc123?token=xxx`:

1. Extract the slug and token
2. Bind presence with the CE identity defaults
3. Read via `v3/document`
4. Edit with `v3/edit` (narrow content ops; review ops for comments/suggestions)

```bash
TOKEN="xxx"
SLUG="abc123"
AGENT="ai:compound-engineering"

curl -sS -X POST "https://www.proofeditor.ai/api/agent/$SLUG/presence" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Agent-Id: $AGENT" \
  -d '{"name":"Compound Engineering","status":"reading","summary":"Reviewing doc"}'

DOC=$(curl -sS "https://www.proofeditor.ai/api/agent/$SLUG/v3/document" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Agent-Id: $AGENT")
REVISION=$(printf '%s' "$DOC" | jq -r '.revision // empty')

# Comment on visible text
curl -sS -X POST "https://www.proofeditor.ai/api/agent/$SLUG/v3/edit" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Agent-Id: $AGENT" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d "$(jq -n --argjson rev "${REVISION:-null}" '{
    by:"ai:compound-engineering",
    baseRevision: (if $rev == null then null else $rev end),
    operations:[{op:"comment",on:"text to comment on",body:"Your comment here"}]
  } | if .baseRevision == null then del(.baseRevision) else . end')"

# Narrow content edit
curl -sS -X POST "https://www.proofeditor.ai/api/agent/$SLUG/v3/edit" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Agent-Id: $AGENT" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"by":"ai:compound-engineering","operations":[{"op":"replace","find":"old","with":"new"}]}'

# Tracked suggestion
curl -sS -X POST "https://www.proofeditor.ai/api/agent/$SLUG/v3/edit" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Agent-Id: $AGENT" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"by":"ai:compound-engineering","operations":[{"op":"suggest","kind":"replace","find":"old","with":"new"}]}'
```

## Workflow: Create and Share a New Document

**Publishing a local file (the primary case):** read the file and JSON-encode its full contents into the `markdown` field with `jq --rawfile` so newlines, quotes, and backticks are escaped correctly. Never hand-write the body or leave an inline placeholder — that publishes a placeholder doc instead of the source artifact.

```bash
SRC="path/to/plan.md"
TITLE="Plan: Foo"

RESPONSE=$(jq -n --arg title "$TITLE" --rawfile md "$SRC" '{title:$title, markdown:$md}' \
  | curl -sS -X POST https://www.proofeditor.ai/share/markdown \
    -H "Content-Type: application/json" -d @-)

URL=$(echo "$RESPONSE" | jq -r '.tokenUrl')
SLUG=$(echo "$RESPONSE" | jq -r '.slug')
TOKEN=$(echo "$RESPONSE" | jq -r '.accessToken')
OWNER_SECRET=$(echo "$RESPONSE" | jq -r '.ownerSecret')   # required for owner delete while unclaimed

# Keep OWNER_SECRET in session memory only — never write it into the repo tree.

curl -sS -X POST "https://www.proofeditor.ai/api/agent/$SLUG/presence" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Agent-Id: ai:compound-engineering" \
  -d '{"name":"Compound Engineering","status":"reading","summary":"Uploaded doc"}'

echo "$URL"
```

After publish handoffs from planning workflows, surface the URL and return control — do not delete the doc automatically.

When the user later asks to clean up an unclaimed doc you created:

```bash
curl -sS -X DELETE "https://www.proofeditor.ai/api/documents/$SLUG" \
  -H "Authorization: Bearer $OWNER_SECRET"
```

## Workflow: Pull a Proof Doc to Local

Sync the current Proof doc state to a local markdown file. Used for:

- Ad-hoc snapshots of a Proof doc to disk
- Pulling a shared Proof doc that the user (or others) edited back down to a local working copy
- Refreshing a local working copy against the live Proof version

Canonical read for this workflow: `GET /api/agent/$SLUG/v3/document`.

```bash
SLUG=<slug>
TOKEN=<accessToken>
LOCAL=<absolute-path>

STATE_TMP=$(mktemp)
curl -sS "https://www.proofeditor.ai/api/agent/$SLUG/v3/document" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Agent-Id: ai:compound-engineering" > "$STATE_TMP"
REVISION=$(jq -r '.revision // empty' "$STATE_TMP")

TMP="${LOCAL}.proof-sync.$$"
jq -jr '.markdown' "$STATE_TMP" > "$TMP" && mv "$TMP" "$LOCAL"
rm "$STATE_TMP"
```

`jq -jr` streams markdown bytes without going through a shell variable, so trailing newlines survive. `mv` within the same filesystem is atomic.

**Confirm before writing when the pull isn't directly asked for.** If a workflow ends up pulling as a side-effect of a different action, surface the impending write with a short confirm like "Sync Proof doc to `<localPath>`?" A silent overwrite is surprising.

## Safety

- Use `v3/document` as source of truth before editing
- Prefer narrow `replace` / `insert` / `delete` before `suggest` or `set_document`
- Always include `by: "ai:compound-engineering"` on writes and `X-Agent-Id: ai:compound-engineering` in headers
- Use `accessToken` for everyday calls; reserve `ownerSecret` for owner delete
- Never commit share tokens or owner secrets to the project tree
- On `TARGET_AMBIGUOUS` / retryable errors, re-resolve against `error.current` — do not double-apply comments blindly
