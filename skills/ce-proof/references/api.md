# Proof web API reference

Required read before any Proof HTTP call. Endpoints, operation tables, error handling, and lifecycle; the skill body carries the identity, credential, and safety boundaries.

## Web API

On Claude Code, each new `curl` pattern prompts for permission. Suggest the allowlist rule `"Bash(curl * https://www.proofeditor.ai/*)"` under `permissions.allow` if the user wants a quieter session; do not add it silently.

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

`comments[]` and `suggestions[]` on the v3 read are the source of review state. Use a comment's `id` for `reply` / `resolve` / `unresolve`. Use a suggestion's `id` for `accept` / `reject`. v3 supports resolving and unresolving comments; it does **not** support deleting comments. A comment with `orphaned: true` and an empty `quote` has lost its anchor — its thread is still readable and replyable, but do not treat its old target text as a live anchor.

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
| `modify_suggestion` | `suggestion` (id), `with` — replace the proposed text of a pending plain insert/replace suggestion |

`suggest` also accepts typed structural forms (`command: "table.*"`, `"format.*"`, `"node.update"`, and atom `target: {node: "image"|"hr"|...}`); see `https://www.proofeditor.ai/agent-docs` before using them. A request holds at most 100 operations; `set_document` accepts at most 2 MiB of markdown.

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
- Retryable `CONFLICT` on a structural suggestion — a connected editor is on an older suggestion reader; retry after it reconnects. Non-retryable `CONFLICT` — the op crosses frontmatter, raw HTML, or unknown content; use a whole-block op or leave it
- `accept` that keeps failing with `SUGGESTION_OWNERSHIP_MISSING` after a fresh read — the suggestion is wedged; `reject` it (always allowed) and recreate instead of retrying `accept`
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

