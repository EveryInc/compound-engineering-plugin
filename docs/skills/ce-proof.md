# `ce-proof`

> Publish, share, view, comment on, and edit markdown documents via [Proof](https://www.proofeditor.ai), Every's collaborative markdown editor.

`ce-proof` is the **collaborative-doc** skill. Proof is a real-time markdown editor where humans and agents can both work on the same document. The skill's primary use is **one-way publishing**: take a local markdown file (a brainstorm, a plan, a learning, a draft), create a shared Proof doc from it, and hand the user a shareable URL. The local file stays canonical — publishing does not sync anything back to disk. The skill also reads shared Proof docs and makes comment/suggestion/block edits over Proof's API when the agent is handed a URL to participate in. It exposes both Proof's web API (no install; create, read, edit shared docs via HTTP) and the local bridge (drives the macOS Proof app at `localhost:9847`).

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Publishes local markdown to a shareable Proof doc, reads shared docs, and makes comment / suggestion / block edits over the API |
| When to use it | "Share to Proof", "publish to Proof", "view this in Proof"; auto-invoked on `ce-brainstorm` / `ce-plan` / `ce-ideate` publish handoffs |
| What it produces | A shareable Proof URL (publish), or edits/comments on a shared doc you point it at |
| Two layers | Web API (HTTP, no install) and Local Bridge (drives macOS Proof app) |
| Sync direction | One-way publish by default — the local file stays canonical. Pulling a Proof doc back to local is a separate, explicit action |

---

## The Problem

Sharing markdown drafts for review is harder than it looks:

- **Chat is the wrong surface** — pasting a 2,000-line plan into chat for "feedback" loses the structure
- **Pasting comments is lossy** — "see the bullet on line 47" doesn't anchor; a week later nobody remembers what bullet
- **Tracked changes need infrastructure** — "suggest this edit" is meaningful only when there's a real accept/reject affordance
- **Identity drifts** — when an agent edits, who edited? Without consistent attribution, comment authorship in the rendered doc is wrong
- **State management is fragile** — concurrent edits collide; mutations need base tokens; retry logic is full of footguns
- **PII / secrets in transit** — uploading content to a third-party editor is a real concern; the user needs to know what's leaving local

## The Solution

`ce-proof` runs publishing and collaboration through Proof's structured API:

- **One-way publish** — create a shared doc from a local markdown file and return a shareable URL; the local file stays canonical
- **Web API** for shared docs — no install needed; create, read, edit via HTTP; user gets a shareable URL with an access token
- **Direct shared-link reads** — agents can fetch Proof URLs with `Accept: application/json` or `Accept: text/markdown`, no browser automation needed
- **Local Bridge** when the macOS Proof app is running — drives the open document directly via `localhost:9847`
- **Consistent identity** — `by: "ai:compound-engineering"` on every op; `name: "Compound Engineering"` bound once via `/presence`
- **Efficient edit passes** — filtered comment reads, one block-edit batch for content changes, one comment batch for replies/resolutions
- **Rewrite-last edit strategy** — exact replacements and block edits first; whole-doc replacement only when truly unavoidable
- **`baseToken` discipline** — seed from a read, chain the next token from mutation responses; on `STALE_BASE` re-read and retry once; verify before retry on potentially-applied mutations
- **Idempotency keys** for safe exact-request retries without duplicate writes

---

## What Makes It Novel

### 1. Web API + Local Bridge — both supported, same identity model

Proof exposes two surfaces:

- **Web API** at `proofeditor.ai` — anyone with the share URL can read/edit; great for shared review
- **Local Bridge** at `localhost:9847` — drives the open Proof.app on macOS directly; great for one-machine workflows

The skill documents both. Identity stays consistent: `ai:compound-engineering` machine ID, `Compound Engineering` display name. A caller can override the identity pair if a distinct sub-agent should own the doc.

### 2. One-way publish as the primary mode

Publishing is the chain's primary use case:

- Create a shared Proof doc from a local markdown file via `POST /share/markdown`; user gets a URL
- Bind the display name via `POST /presence`
- Surface the URL — the user opens it to read, comment, and share with others

The local file remains the canonical record; nothing syncs back to disk as a side effect of publishing. Two entry points, identical mechanics:

- **Direct user request** — bare phrase like "share this to proof" or "publish this to proof"
- **Upstream skill handoff** — `ce-brainstorm` / `ce-ideate` / `ce-plan` finishes a draft and hands it to publish

### 3. Mutation discipline — token chaining + verify-before-retry

Every Proof mutation requires a `baseToken`. The skill teaches the right pattern:

- **Read once, chain tokens** — seed from `/state` or `/snapshot`, then reuse the next `mutationBase.token` returned by successful mutations
- **On `STALE_BASE` / `BASE_TOKEN_REQUIRED` / `MISSING_BASE` / `INVALID_BASE_TOKEN`** — re-read `/state`, rebuild the body with a fresh token, retry once with a new idempotency key
- **On `INVALID_OPERATIONS` / `INVALID_REQUEST` / 422 errors** — fix the payload first, don't retry blindly
- **On `COLLAB_SYNC_FAILED` / 5xx / network timeout / `202 with collab.status: "pending"`** — the canonical doc *may* have been written; re-read `/state` and check whether the intended mark/edit is already present **before retrying**
- **`Idempotency-Key`** is recommended on every mutation; required when contract demands it. Reuse the same key only for an exact same-body resend; if the body changes (including a fresh `baseToken`), mint a new key

> Duplicate-mark incidents usually come from retrying a `comment.add` or `suggestion.add` after a timeout without verifying. When in doubt: re-read, diff, then decide.

### 4. Two endpoint shapes — `/ops` and `/edit/v2`

Proof has two write surfaces with **load-bearing differences** the skill teaches:

- **`/api/agent/{slug}/ops`** — top-level `type` for one mark op, or top-level `operations` for batched comment thread mutations. Best for comments, suggestions, replies, and resolves.
- **`/api/agent/{slug}/edit/v2`** — `operations` array where each entry has `op`. Atomic batch — every op lands or none. Best for block-level edits and bulk sweeps (`replace_block`, `insert_after`, `find_replace_in_doc`, etc.)

Sending an `op`-shaped operation to `/ops` returns 422; the wire format isn't interchangeable. The skill documents both.

### 5. Efficient comment passes — edit batch, then comment batch

When the agent participates in a shared doc's comment threads, the efficient pass shape is:

- Read `GET /state?kinds=comment` so provenance/authorship marks never pollute the needs-reply list
- Apply agreed content edits with one `/edit/v2` batch where possible
- Use `find_replace_in_doc` for literal doc-wide replacements such as terminology or punctuation sweeps
- Reply to and resolve handled threads in one `/ops` batch using `comment.reply` with `resolve: true`

This turns an 8-comment review from dozens of sequential reply/resolve/state-read requests into a small number of authoritative mutations.

### 6. Rewrite Is The Last Resort

Agents should not start by replacing the full document. The preferred edit ladder is:

- `find_replace_in_doc` for exact repeated substitutions
- `/edit/v2` block operations for known paragraphs, list items, sections, insertions, and deletions
- `suggestion.add` when visible track changes are the desired review surface
- `rewrite.apply` only when the user explicitly wants a whole-doc replacement or the change cannot be expressed safely with narrower operations

That keeps human comments stable, avoids clobbering live collaborators, and makes retries easier to reason about.

### 7. Tracked suggestion with `status: "accepted"`

`suggestion.add` defaults to creating a pending suggestion the user must accept/reject. The skill also exposes `status: "accepted"` — creates the suggestion mark **and** commits the change in one call. The mark persists as audit trail with per-edit attribution; the user can still reject to revert. Useful when the agent is confident and the user wants to see what landed without an explicit accept step.

### 8. `LIVE_CLIENTS_PRESENT` awareness

While a client is connected to a Proof doc, the skill knows what's safe:

- **`/edit/v2`** — works during active collab
- **`suggestion.add`** (including `status: "accepted"`) — works during active collab
- **All comment ops** — work during active collab
- **`rewrite.apply`** — blocked by `LIVE_CLIENTS_PRESENT`; would clobber in-flight Yjs edits

The skill tells callers to reserve `rewrite.apply` for no-client scenarios and use the granular ops or `/edit/v2` during active sessions.

### 9. Atomic pull-to-local (separate, explicit action)

Publishing is one-way, but a user can still pull a Proof doc's current state down to a local markdown file as a deliberate, separate step (e.g., after others edited the shared doc). When they do, the write is **atomic**:

```bash
# Stream .markdown bytes directly to a temp sibling, then rename.
TMP="${LOCAL}.proof-sync.$$"
jq -jr '.markdown' "$STATE_TMP" > "$TMP" && mv "$TMP" "$LOCAL"
```

`jq -jr` (no trailing newline, raw string) preserves byte-for-byte content including trailing newlines. `mv` within the same filesystem is atomic — a crashed write leaves the original untouched, never half-written. The skill asks the user to confirm before writing when the pull isn't directly asked for — silent overwrites are surprising.

### 10. Consistent agent identity

The skill enforces `by: "ai:compound-engineering"` on every op and `X-Agent-Id: ai:compound-engineering` in headers. Display name `Compound Engineering` is bound once per session via `/presence`. **Don't use `ai:compound` or other ad-hoc variants** — identity stays uniform unless a caller explicitly overrides for a sub-agent context.

---

## Quick Example

`/ce-plan` finishes a notification-mute plan and the user picks "Publish to Proof" at the Phase 5.4 menu. Plan invokes `ce-proof` with the plan path and title.

The skill creates a Proof doc via `POST /share/markdown` with the plan content, returns a URL with token, and binds the display name via `POST /presence`. It surfaces the URL to the user and returns control to `ce-plan` Phase 5.4 — the local plan file at `docs/plans/2026-05-04-001-feat-notification-mute-plan.md` is untouched and remains canonical.

The user opens the URL in their browser, reads the plan, adds inline comments, and shares the link with a teammate. Nothing syncs back to disk; the menu re-renders so the user can start `/ce-work`, create an issue, or pause.

---

## When to Reach For It

Reach for `ce-proof` when:

- You want a shareable URL for a markdown doc (brainstorm, plan, learning, draft)
- A chain skill (`ce-brainstorm`, `ce-plan`, `ce-ideate`) handed off to publish for human review
- You're working from a Proof URL and want the agent to read, comment, or edit
- You want to pull a shared Proof doc's current state back down to a local file

Skip `ce-proof` when:

- The doc is small enough that chat-paste-and-discuss works fine
- You don't have network access (web API needs `proofeditor.ai`); the local bridge is macOS-only
- The content is too sensitive to upload to a third-party editor — keep it local

---

## Use as Part of the Workflow

`ce-proof` integrates with the chain at multiple publish touchpoints:

- **`/ce-brainstorm` Phase 4** — "Publish to Proof" handoff for sharing the markdown requirements-only unified plan
- **`/ce-plan` Phase 5.4** — "Publish to Proof" handoff for sharing the plan
- **`/ce-ideate` Phase 5** — "Publish to Proof" option (markdown output only)
- **`/ce-compound`** — for sharing a learning before committing to `docs/solutions/`

In every case the handoff is one-way: `ce-proof` publishes, surfaces the URL, and returns control. The originating skill's local artifact stays canonical, so the upstream menu re-renders unchanged — there's no review-state machine to reconcile.

---

## Use Standalone

Direct invocation for ad-hoc Proof work:

- **Publish local markdown** — `/ce-proof "share docs/plans/foo.md to Proof"`
- **From a Proof URL** — `/ce-proof https://www.proofeditor.ai/d/abc123?token=xxx` (read state, add comments, suggest edits)
- **Publish the just-edited file** — "share this to proof" picks up whichever markdown was just touched
- **Pull a Proof doc to local** — sync current Proof state to a markdown file (atomic write; explicit, confirmed)

---

## Reference

| API surface | When |
|-------------|------|
| Web API at `proofeditor.ai` | Default; no install; shareable URLs |
| Local Bridge at `localhost:9847` | macOS Proof.app running; one-machine workflow |

| Op (Web API `/ops`) | Purpose |
|---------------------|---------|
| `comment.add` | Comment on a quote |
| `comment.reply` | Reply within a thread; `resolve: true` replies and closes in one mutation |
| `comment.resolve` / `comment.unresolve` | Toggle thread resolution |
| `suggestion.add` | Tracked edit (pending or `status: "accepted"`) |
| `suggestion.accept` / `suggestion.reject` | Resolve a suggestion |
| `rewrite.apply` | Last-resort whole-doc replacement (blocked by `LIVE_CLIENTS_PRESENT`) |

| Endpoint | Wire format | Best for |
|----------|-------------|----------|
| `/api/agent/{slug}/ops` | Top-level `type` or comment `operations` batch | Marks, batched replies/resolves |
| `/api/agent/{slug}/edit/v2` | `operations: [{op, ...}, ...]` | Atomic block batches and `find_replace_in_doc` sweeps |

Identity defaults: `by: "ai:compound-engineering"`, `X-Agent-Id: ai:compound-engineering`, `name: "Compound Engineering"`. `Idempotency-Key` recommended on every mutation and required when the contract says so.

---

## FAQ

**Does publishing sync edits back to my local file?**
No. Publishing is one-way — it creates a shared Proof doc and returns a URL; the local file stays canonical. If you want the current Proof state on disk, pull it down explicitly (a separate, confirmed action that writes atomically).

**Why two endpoint shapes?**
Different concerns. `/ops` handles mark mutations, including batched existing-thread comment replies/resolves. `/edit/v2` handles atomic batches of block-level edits and document-wide literal replacement. The wire formats differ — sending `op` shape to `/ops` returns 422.

**Should I rewrite the whole doc?**
Almost never as a first move. Use `find_replace_in_doc` for literal sweeps and block-level `/edit/v2` for scoped edits. Use `rewrite.apply` only when the user asked for full replacement or the change cannot be represented with narrower operations.

**What's the right mutation pattern?**
Read `/state?kinds=comment` for comment work or `/snapshot` for block refs, capture `mutationBase.token`, then update your cached token from successful mutation responses. On `STALE_BASE`, re-read and retry once with fresh token. On potentially-applied errors (5xx, timeout, `202 pending`), re-read and check whether the change is already present before retrying — duplicate marks come from retrying without verifying.

**Why the `ai:compound-engineering` identity?**
For consistent attribution. Mark authorship in the rendered doc shows who edited; if the agent uses `ai:compound` one day and `ai:compound-engineering` the next, the audit trail looks fragmented. The skill enforces one identity unless a caller explicitly overrides.

**Can I edit a doc while a user is connected?**
Yes for `/edit/v2`, `suggestion.add` (including `status: "accepted"`), and all comment ops. No for `rewrite.apply` — it's blocked by `LIVE_CLIENTS_PRESENT` because it would clobber in-flight Yjs edits.

**What if the upload fails?**
The skill retries once. If it still fails, callers get a clear error and can decide what to do (often: stay in the chain skill's menu without the Proof handoff, or fall back to local-only). Persistent failures get reported to Proof via `POST /api/bridge/report_bug` for diagnosis.

---

## See Also

- [`/ce-brainstorm`](./ce-brainstorm.md) — Phase 4 "Publish to Proof" handoff
- [`/ce-plan`](./ce-plan.md) — Phase 5.4 "Publish to Proof" handoff
- [`/ce-ideate`](./ce-ideate.md) — Phase 5 "Publish to Proof" option
- [Proof](https://www.proofeditor.ai) — the editor itself; this skill is the agent client
