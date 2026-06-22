---
name: ce-proof
description: Publish, view, comment on, and edit markdown via Proof (proofeditor.ai) — create a shareable doc, read a shared doc, and make comment/suggestion/block edits over its API. Use when the user says "view this in proof", "share to proof", "publish to proof", or wants a shareable markdown surface for a spec, plan, or draft, including publish handoffs from ce-brainstorm, ce-ideate, or ce-plan. Do not trigger on "proof" meaning evidence, math proofs, proof-of-concept, or "proofread this".
allowed-tools:
  - Bash
  - Read
  - Write
  - WebFetch
---

# Proof - Collaborative Markdown Editor

Proof is a collaborative document editor for humans and agents. It supports two modes:

1. **Web API** - Create and edit shared documents via HTTP (no install needed)
2. **Local Bridge** - Drive the macOS Proof app via localhost:9847

## Identity and Attribution

Every write to a Proof doc must be attributed. Two fields carry the agent's identity:

- **Machine ID (`by` on every op, `X-Agent-Id` header):** `ai:compound-engineering` — stable, lowercase-hyphenated, machine-parseable. Appears in marks, events, and the API response.
- **Display name (`name` on `POST /presence`):** `Compound Engineering` — human-readable, shown in Proof's presence chips and comment-author badges.

Set the display name once per doc session by posting to presence with the `X-Agent-Id` header; Proof binds the name to that agent ID for the session. These values are the defaults for any caller of this skill; a caller may pass a different `identity` pair if a distinct sub-agent should own the doc. Do not use `ai:compound` or other ad-hoc variants — identity stays uniform unless a caller explicitly overrides it.

## Publish Mode

The primary use is one-way publishing: take an existing local markdown file (a brainstorm, a plan, a learning, a draft), read its full contents and post them as the new doc's body (see "Workflow: Create and Share a New Document" for the source-file recipe — never publish placeholder content), and hand the user a shareable URL. The local file stays canonical — publishing does not sync anything back to disk. The user can open the link to read, comment, and share with others; the agent can also participate via the edit APIs below when given the URL. Two entry points, identical mechanics (see "Workflow: Create and Share a New Document"):

- **Direct user request** — a bare user phrase naming a local markdown file and asking to share it via Proof: "share this to proof", "publish this to proof", "open this in proof editor so I can review", "get me a proof link for this doc". The file is whichever markdown the user just created, edited, or referenced; if ambiguous, ask which file. This is a first-class entry point — do not require an upstream caller.
- **Upstream skill handoff** — `ce-brainstorm`, `ce-ideate`, or `ce-plan` finishes a draft and hands it off to publish for human review, passing the file path and title explicitly.

## Web API (Primary for Sharing)

### Create a Shared Document

No authentication required. Returns a shareable URL with access token.

```bash
curl -X POST https://www.proofeditor.ai/share/markdown \
  -H "Content-Type: application/json" \
  -d '{"title":"My Doc","markdown":"# Hello\n\nContent here."}'
```

**Response format:**
```json
{
  "slug": "abc123",
  "tokenUrl": "https://www.proofeditor.ai/d/abc123?token=xxx",
  "accessToken": "xxx",
  "ownerSecret": "yyy",
  "_links": {
    "state": "https://www.proofeditor.ai/api/agent/abc123/state",
    "ops": "https://www.proofeditor.ai/api/agent/abc123/ops"
  }
}
```

Use the `tokenUrl` as the shareable link. The `_links` give you the exact API paths.

### Read a Shared Document

If you already have a shared Proof URL, no browser automation is needed. Fetch the URL directly with content negotiation:

```bash
curl -s -H "Accept: application/json" "https://www.proofeditor.ai/d/{slug}?token=<token>"
curl -s -H "Accept: text/markdown" "https://www.proofeditor.ai/d/{slug}?token=<token>"
```

The JSON response includes the markdown, API links, and agent auth hints. Use `/state` when you need mutation metadata, marks, or presence:

```bash
curl -s "https://www.proofeditor.ai/api/agent/{slug}/state" \
  -H "x-share-token: <token>"
```

For comment-ingest workflows, prefer the server-side filter:

```bash
curl -s "https://www.proofeditor.ai/api/agent/{slug}/state?kinds=comment" \
  -H "x-share-token: <token>"
```

`state.marks` is a union of comments, suggestions, and provenance/authorship marks. The `?kinds=comment` filter avoids treating human-authored provenance marks as review comments.

### Edit a Shared Document

Comment, suggestion, and rewrite operations go to `POST https://www.proofeditor.ai/api/agent/{slug}/ops`. Block edits use `/api/agent/{slug}/edit/v2`.

**Note:** Use the `/api/agent/{slug}/ops` path (from `_links` in create response), NOT `/api/documents/{slug}/ops`.

**Authentication for protected docs:**
- Header: `x-share-token: <token>` or `Authorization: Bearer <token>`
- Token comes from the URL parameter: `?token=xxx` or the `accessToken` from create response
- Header: `X-Agent-Id: ai:compound-engineering` (required for presence; include on ops for consistent attribution)

**Wire-format reminder.** `/api/agent/{slug}/ops` uses a top-level `type` field; `/api/agent/{slug}/edit/v2` uses an `operations` array where each entry has `op`. Do not mix — sending `op` to `/ops` returns 422.

**Every mutation requires a `baseToken`.** Reuse the `mutationBase.token` from the most recent `/state` or `/snapshot` read, then update it from successful mutation responses (`.mutationBase.token`). On `BASE_TOKEN_REQUIRED` or `STALE_BASE`, re-read and retry once. Only do a pre-mutation read if no prior read has happened in this session or you need fresh document/comment/snapshot content.

`/edit/v2` block refs are a separate concern: they can drift across revisions, so re-fetch `/snapshot` for fresh refs before a block edit if any writes have landed since your last snapshot.

### Edit Strategy: Avoid Whole-Doc Rewrite

Do not default to full-document replacement. Pick the narrowest edit primitive that matches the requested change:

1. **Literal repeated change:** use `/edit/v2` with `find_replace_in_doc` (optionally constrained by `fromRef`, `toRef`, or `block_filter`). This is the fastest and least error-prone path for terminology renames, punctuation/style sweeps, and other exact text substitutions.
2. **Known block or section change:** use `/edit/v2` block operations from a fresh `/snapshot`: `replace_block`, `insert_before`, `insert_after`, `delete_block`, `replace_range`, or `find_replace_in_block`.
3. **Visible track-changes desired:** use `/ops` `suggestion.add` (pending or `status: "accepted"`) when the user should see a suggestion mark and reject/revert affordance for that specific edit.
4. **Whole-doc replacement:** use `rewrite.apply` only as a last resort when the user explicitly asks to replace the entire document, when the intended change is genuinely global and cannot be expressed as block/range/find-replace operations, and when no live clients are present. Before rewriting, read current state, preserve comments/marks expectations, and mention that the rewrite is broad.

When in doubt, start with `/snapshot` and build a small `/edit/v2` batch. A narrow failed edit is easier to inspect and retry than a broad rewrite, and it avoids clobbering concurrent human work.

**Retry discipline after mutation errors — verify before retrying.** An error response is not proof that nothing was written.

- `STALE_BASE`, `BASE_TOKEN_REQUIRED`, `MISSING_BASE`, `INVALID_BASE_TOKEN` — pre-commit, token-related. Re-read `/state`, rebuild the request body with a fresh `baseToken`, and retry once with a new `Idempotency-Key`.
- `ANCHOR_NOT_FOUND`, `ANCHOR_AMBIGUOUS` — pre-commit, but the `quote` no longer uniquely matches content. Re-reading does not help by itself; the caller must tighten or regenerate the anchor before retrying. Do not auto-retry blindly.
- `INVALID_OPERATIONS`, `INVALID_REQUEST`, `INVALID_REF`, `INVALID_BLOCK_MARKDOWN`, `INVALID_RANGE`, `INVALID_MARKDOWN`, 422 — pre-commit, but the payload is wrong. Do not retry blindly; fix the payload first.
- `COLLAB_SYNC_FAILED`, `REWRITE_BARRIER_FAILED`, `PROJECTION_STALE`, `INTERNAL_ERROR`, 5xx, network timeout, and any **202 with `collab.status: "pending"`** — the canonical doc may have been written even though the call looks like a failure. Before any retry, re-read `/state` and check whether the intended mark/edit is already present; only retry if it isn't.
- `Idempotency-Key` (see below) protects against double-apply *on the same request* (e.g., TCP-level retry). It does not help if you build a new request body and send a second call — that is a new logical write with a new key.

Duplicate-mark incidents usually come from retrying a `comment.add` or `suggestion.add` after a timeout without verifying. When in doubt: re-read, diff, then decide.

**`Idempotency-Key` header** is recommended on every mutation for safe automation retries; required when `/state.contract.idempotencyRequired` is true. Use the same key only when resending the exact same serialized request body. If the body changes — including because you replaced `baseToken` after `STALE_BASE` — mint a new key or Proof will reject it as key reuse with a different payload.

**Comment on text:**
```json
{"type": "comment.add", "quote": "text to comment on", "by": "ai:compound-engineering", "text": "Your comment here", "baseToken": "<token>"}
```

**Reply to a comment:**
```json
{"type": "comment.reply", "markId": "<id>", "by": "ai:compound-engineering", "text": "Reply text", "baseToken": "<token>"}
```

**Reply and resolve in one mutation:**
```json
{"type": "comment.reply", "markId": "<id>", "by": "ai:compound-engineering", "text": "Fixed.", "resolve": true, "baseToken": "<token>"}
```

**Batch existing-thread comment mutations:**
```json
{"by": "ai:compound-engineering", "baseToken": "<token>", "operations": [
  {"type": "comment.reply", "markId": "<id-1>", "text": "Fixed.", "resolve": true},
  {"type": "comment.reply", "markId": "<id-2>", "text": "Leaving this open because X."}
]}
```

Batch `/ops` supports `comment.reply`, `comment.resolve`, and `comment.unresolve` for existing threads. Use it to reply to and resolve multiple threads in one call instead of issuing separate reply and resolve requests per thread.

**Resolve / unresolve a comment:**
```json
{"type": "comment.resolve", "markId": "<id>", "by": "ai:compound-engineering", "baseToken": "<token>"}
{"type": "comment.unresolve", "markId": "<id>", "by": "ai:compound-engineering", "baseToken": "<token>"}
```

**Suggest a replacement (pending — user must accept/reject):**
```json
{"type": "suggestion.add", "kind": "replace", "quote": "original text", "by": "ai:compound-engineering", "content": "replacement text", "baseToken": "<token>"}
```

**Suggest and immediately apply (tracked but committed — user can reject to revert):**
```json
{"type": "suggestion.add", "kind": "replace", "quote": "original text", "by": "ai:compound-engineering", "content": "replacement text", "status": "accepted", "baseToken": "<token>"}
```

`status: "accepted"` creates the suggestion mark and commits the change in one call. The mark persists as an audit trail with per-edit attribution and a reject-to-revert affordance. Works with `kind: "insert" | "delete" | "replace"`.

**Accept or reject an existing suggestion:**
```json
{"type": "suggestion.accept", "markId": "<id>", "by": "ai:compound-engineering", "baseToken": "<token>"}
{"type": "suggestion.reject", "markId": "<id>", "by": "ai:compound-engineering", "baseToken": "<token>"}
```

`suggestion.resolve` is not supported — use accept or reject instead.

**Whole-doc rewrite (last resort):**
```json
{"type": "rewrite.apply", "content": "full new markdown", "by": "ai:compound-engineering", "baseToken": "<token>"}
```

Prefer `find_replace_in_doc` or block-level `/edit/v2` operations first. `rewrite.apply` is broad, disruptive, and blocked while live clients are connected.

**Block-level edits via `/edit/v2`** (separate endpoint, separate shape):
```bash
curl -X POST "https://www.proofeditor.ai/api/agent/{slug}/edit/v2" \
  -H "Content-Type: application/json" \
  -H "x-share-token: <token>" \
  -H "X-Agent-Id: ai:compound-engineering" \
  -H "Idempotency-Key: <uuid>" \
  -d '{
    "by": "ai:compound-engineering",
    "baseToken": "mt1:<token>",
    "operations": [
      {"op": "replace_block", "ref": "b3", "block": {"markdown": "Updated paragraph."}},
      {"op": "insert_after", "ref": "b3", "blocks": [{"markdown": "## New section"}]}
    ]
  }'
```

Per-op body shape (singular `block` vs plural `blocks` is load-bearing — sending the wrong one returns 422):

| op | body fields |
|---|---|
| `replace_block` | `ref`, `block: {markdown}` |
| `insert_after` | `ref`, `blocks: [{markdown}, ...]` |
| `insert_before` | `ref`, `blocks: [{markdown}, ...]` |
| `delete_block` | `ref` |
| `replace_range` | `fromRef`, `toRef`, `blocks: [{markdown}, ...]` |
| `find_replace_in_block` | `ref`, `find`, `replace`, `occurrence: "first" \| "all"` |
| `find_replace_in_doc` | `find`, `replace`, `occurrence: "first" \| "all"`, optional `fromRef`, `toRef`, `block_filter` |

Read `/snapshot` to get block `ref` IDs and `mutationBase.token`. `ref` values are opaque request tokens tied to the snapshot/baseToken; re-read `/snapshot` before follow-up block edits if writes have landed. `operations` commits atomically — either every op lands or none do — so one `/edit/v2` call can batch dozens of block edits safely and efficiently. Successful full responses include the next `mutationBase.token` and fresh `snapshot.blocks[].ref` values for chaining.

For literal doc-wide sweeps, prefer `find_replace_in_doc` over many block replacements or a whole-doc rewrite. Validate large batches with `?dryRun=1` or `?validate=1`; use `?return=minimal` when you only need `ok`, `revision`, `appliedCount`, and the next `mutationBase`.

**Editing while a client is connected is fine.** `/edit/v2`, `suggestion.add` (including `status: "accepted"`), and all comment ops work during active collab. Only `rewrite.apply` is blocked by `LIVE_CLIENTS_PRESENT` — it would clobber in-flight Yjs edits.

**When the loop breaks.** If a mutation keeps failing after a fresh read and one retry, or state across reads looks inconsistent, call `POST https://www.proofeditor.ai/api/bridge/report_bug` with the failing request ID, slug, and raw response. The server enriches and files an issue.

### Known Limitations (Web API)

- Bridge-style endpoints (`/d/{slug}/bridge/*`) require client version headers (`x-proof-client-version`, `x-proof-client-build`, `x-proof-client-protocol`) and return 426 CLIENT_UPGRADE_REQUIRED without them. Use `/api/agent/{slug}/ops` instead.

## Local Bridge (macOS App)

Requires Proof.app running. Bridge at `http://localhost:9847`.

**Required headers:**
- `X-Agent-Id: ai:compound-engineering` (identity for presence; keep aligned with `by`)
- `Content-Type: application/json`
- `X-Window-Id: <uuid>` (when multiple docs open)

### Key Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/windows` | List open documents |
| GET | `/state` | Read markdown, cursor, word count |
| GET | `/marks` | List all suggestions and comments |
| POST | `/marks/suggest-replace` | `{"quote":"old","by":"ai:compound-engineering","content":"new"}` |
| POST | `/marks/suggest-insert` | `{"quote":"after this","by":"ai:compound-engineering","content":"insert"}` |
| POST | `/marks/suggest-delete` | `{"quote":"delete this","by":"ai:compound-engineering"}` |
| POST | `/marks/comment` | `{"quote":"text","by":"ai:compound-engineering","text":"comment"}` |
| POST | `/marks/reply` | `{"markId":"<id>","by":"ai:compound-engineering","text":"reply"}` |
| POST | `/marks/resolve` | `{"markId":"<id>","by":"ai:compound-engineering"}` |
| POST | `/marks/accept` | `{"markId":"<id>"}` |
| POST | `/marks/reject` | `{"markId":"<id>"}` |
| POST | `/rewrite` | Last-resort whole-doc replacement: `{"content":"full markdown","by":"ai:compound-engineering"}` |
| POST | `/presence` | `{"status":"reading","summary":"..."}` |
| GET | `/events/pending` | Poll for user actions |

### Presence Statuses

`thinking`, `reading`, `idle`, `acting`, `waiting`, `completed`

## Workflow: Review a Shared Document

When given a Proof URL like `https://www.proofeditor.ai/d/abc123?token=xxx`:

1. Extract the slug (`abc123`) and token from the URL
2. Read the document via content negotiation on the shared URL or via `/api/agent/{slug}/state` when you need marks/mutation metadata
3. For content edits, prefer `/edit/v2` `find_replace_in_doc` or block operations; use `/ops` for comments, suggestions, and comment replies/resolution
4. The author sees changes in real-time

```bash
SHARE_URL="https://www.proofeditor.ai/d/abc123?token=xxx"
curl -s -H "Accept: application/json" "$SHARE_URL"
curl -s -H "Accept: text/markdown" "$SHARE_URL"

# Read once for content + the initial baseToken.
# After each successful mutation, update BASE from the response's mutationBase.token.
STATE=$(curl -s "https://www.proofeditor.ai/api/agent/abc123/state" \
  -H "x-share-token: xxx")
BASE=$(printf '%s' "$STATE" | jq -r '.mutationBase.token')
# Inspect doc fields as needed: printf '%s' "$STATE" | jq '.markdown, .revision'

# Comment
OP_RESP=$(curl -s -X POST "https://www.proofeditor.ai/api/agent/abc123/ops" \
  -H "Content-Type: application/json" \
  -H "x-share-token: xxx" \
  -H "X-Agent-Id: ai:compound-engineering" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d "$(jq -n --arg base "$BASE" '{type:"comment.add",quote:"text",by:"ai:compound-engineering",text:"comment",baseToken:$base}')")
NEXT_BASE=$(printf '%s' "$OP_RESP" | jq -r '.mutationBase.token // empty')
[ -n "$NEXT_BASE" ] && BASE="$NEXT_BASE"

# Suggest edit (tracked, pending)
OP_RESP=$(curl -s -X POST "https://www.proofeditor.ai/api/agent/abc123/ops" \
  -H "Content-Type: application/json" \
  -H "x-share-token: xxx" \
  -H "X-Agent-Id: ai:compound-engineering" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d "$(jq -n --arg base "$BASE" '{type:"suggestion.add",kind:"replace",quote:"old",by:"ai:compound-engineering",content:"new",baseToken:$base}')")
NEXT_BASE=$(printf '%s' "$OP_RESP" | jq -r '.mutationBase.token // empty')
[ -n "$NEXT_BASE" ] && BASE="$NEXT_BASE"

# Suggest and immediately apply (tracked, committed)
OP_RESP=$(curl -s -X POST "https://www.proofeditor.ai/api/agent/abc123/ops" \
  -H "Content-Type: application/json" \
  -H "x-share-token: xxx" \
  -H "X-Agent-Id: ai:compound-engineering" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d "$(jq -n --arg base "$BASE" '{type:"suggestion.add",kind:"replace",quote:"old",by:"ai:compound-engineering",content:"new",status:"accepted",baseToken:$base}')")
NEXT_BASE=$(printf '%s' "$OP_RESP" | jq -r '.mutationBase.token // empty')
[ -n "$NEXT_BASE" ] && BASE="$NEXT_BASE"

# Direct content edit (preferred when visible suggestion marks are not needed)
SNAPSHOT=$(curl -s "https://www.proofeditor.ai/api/agent/abc123/snapshot" \
  -H "x-share-token: xxx")
EDIT_BASE=$(printf '%s' "$SNAPSHOT" | jq -r '.mutationBase.token')
curl -X POST "https://www.proofeditor.ai/api/agent/abc123/edit/v2?return=minimal" \
  -H "Content-Type: application/json" \
  -H "x-share-token: xxx" \
  -H "X-Agent-Id: ai:compound-engineering" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d "$(jq -n --arg base "$EDIT_BASE" '{by:"ai:compound-engineering",baseToken:$base,operations:[{op:"find_replace_in_doc",find:"old",replace:"new",occurrence:"all"}]}')"
```

## Workflow: Create and Share a New Document

**Publishing a local file (the primary case):** read the file and JSON-encode its full contents into the `markdown` field with `jq --rawfile` so newlines, quotes, and backticks are escaped correctly. Never hand-write the body or leave the inline placeholder — that publishes a placeholder doc instead of the source artifact (the plan, requirements, or ideation file the caller passed).

```bash
SRC="docs/plans/2026-05-04-001-feat-foo-plan.md"   # source file from the caller
TITLE="Plan: Foo"                                   # caller-provided title

# 1. Create — from a local source file:
RESPONSE=$(jq -n --arg title "$TITLE" --rawfile md "$SRC" '{title:$title, markdown:$md}' \
  | curl -s -X POST https://www.proofeditor.ai/share/markdown \
    -H "Content-Type: application/json" -d @-)
# (Ad-hoc inline content instead of a file:
#  -d '{"title":"My Doc","markdown":"# Title\n\nContent here."}')

# 2. Extract URL and token
URL=$(echo "$RESPONSE" | jq -r '.tokenUrl')
SLUG=$(echo "$RESPONSE" | jq -r '.slug')
TOKEN=$(echo "$RESPONSE" | jq -r '.accessToken')

# 3. Bind display name via presence
curl -s -X POST "https://www.proofeditor.ai/api/agent/$SLUG/presence" \
  -H "Content-Type: application/json" \
  -H "x-share-token: $TOKEN" \
  -H "X-Agent-Id: ai:compound-engineering" \
  -d '{"name":"Compound Engineering","status":"reading","summary":"Uploaded doc"}'

# 4. Share the URL
echo "$URL"

# 5. Make comment/suggestion edits using the ops endpoint (baseToken required)
BASE=$(curl -s "https://www.proofeditor.ai/api/agent/$SLUG/state" \
  -H "x-share-token: $TOKEN" | jq -r '.mutationBase.token')
OP_RESP=$(curl -s -X POST "https://www.proofeditor.ai/api/agent/$SLUG/ops" \
  -H "Content-Type: application/json" \
  -H "x-share-token: $TOKEN" \
  -H "X-Agent-Id: ai:compound-engineering" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d "$(jq -n --arg base "$BASE" '{type:"comment.add",quote:"Content here",by:"ai:compound-engineering",text:"Added a note",baseToken:$base}')")
NEXT_BASE=$(printf '%s' "$OP_RESP" | jq -r '.mutationBase.token // empty')
[ -n "$NEXT_BASE" ] && BASE="$NEXT_BASE"

# For content edits, prefer /edit/v2 over rewrite.apply.
SNAPSHOT=$(curl -s "https://www.proofeditor.ai/api/agent/$SLUG/snapshot" \
  -H "x-share-token: $TOKEN")
EDIT_BASE=$(printf '%s' "$SNAPSHOT" | jq -r '.mutationBase.token')
curl -X POST "https://www.proofeditor.ai/api/agent/$SLUG/edit/v2?return=minimal" \
  -H "Content-Type: application/json" \
  -H "x-share-token: $TOKEN" \
  -H "X-Agent-Id: ai:compound-engineering" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d "$(jq -n --arg base "$EDIT_BASE" '{by:"ai:compound-engineering",baseToken:$base,operations:[{op:"find_replace_in_doc",find:"Content",replace:"Updated content",occurrence:"all"}]}')"
```

## Workflow: Pull a Proof Doc to Local

Sync the current Proof doc state to a local markdown file. Used for:

- Ad-hoc snapshots of a Proof doc to disk (before closing the tab, archiving, handing off)
- Pulling a shared Proof doc that the user (or others) edited back down to a local working copy
- Refreshing a local working copy against the live Proof version

```bash
SLUG=<slug>
TOKEN=<accessToken>
LOCAL=<absolute-path>

# One read to a temp file — avoids passing markdown through $(...), which would strip trailing newlines.
STATE_TMP=$(mktemp)
curl -s "https://www.proofeditor.ai/api/agent/$SLUG/state" \
  -H "x-share-token: $TOKEN" > "$STATE_TMP"
REVISION=$(jq -r '.revision' "$STATE_TMP")

# Atomic write: stream .markdown bytes directly to a temp sibling, then rename.
TMP="${LOCAL}.proof-sync.$$"
jq -jr '.markdown' "$STATE_TMP" > "$TMP" && mv "$TMP" "$LOCAL"
rm "$STATE_TMP"
```

`jq -jr` (`-j` no trailing newline, `-r` raw string) streams the markdown bytes straight to the temp file without going through a shell variable, so trailing newlines survive intact. `mv` within the same filesystem is atomic — a crashed write leaves the original untouched rather than a half-written file.

**Confirm before writing when the pull isn't directly asked for.** If a workflow ends up pulling as a side-effect of a different action, surface the impending write with a short confirm like "Sync Proof doc to `<localPath>`?" A silent overwrite is surprising — the user may have forgotten the local file exists in that session, or expected Proof to stay canonical until they explicitly asked to pull.

## Safety

- Use `/state` content as source of truth before editing
- During active collab use `edit/v2` (direct block changes) or `suggestion.add` (tracked changes); reserve `rewrite.apply` for no-client scenarios since it's blocked by `LIVE_CLIENTS_PRESENT` when anyone is connected
- Prefer `find_replace_in_doc` and block-level `/edit/v2` edits before considering `rewrite.apply`
- Don't span table cells in a single replace
- Always include `by: "ai:compound-engineering"` on every op and `X-Agent-Id: ai:compound-engineering` in headers for consistent attribution
- Reuse `baseToken` from your most recent `/state` or `/snapshot` read; on `STALE_BASE`, re-read and retry once
