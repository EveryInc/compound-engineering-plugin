# `ce-proof`

> Create, share, view, comment on, and run human-in-the-loop review loops over markdown documents via [Proof](https://www.proofeditor.ai), Every's collaborative markdown editor.

`ce-proof` is the **collaborative-doc** skill. Proof is a real-time markdown editor where humans and agents both work on the same document — the user annotates with comments and suggestions in their browser; the agent ingests those threads and applies tracked edits. The skill exposes both Proof's web API (no install; create, read, edit shared docs via HTTP) and the local bridge (drives the macOS Proof app at `localhost:9847`). Most chain skills use it for HITL review handoffs.

The most common use is **HITL review mode**: upload a local markdown file (a brainstorm, a plan, a learning), let the user annotate in Proof's UI, ingest each comment thread as a tracked edit, then sync the reviewed doc back to disk atomically.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Uploads markdown to Proof, lets the user comment / suggest in the web UI, ingests feedback as in-thread replies and tracked edits, syncs the reviewed doc back to local |
| When to use it | "Share to Proof", "view this in Proof", "HITL this doc with me", "iterate with Proof on this draft"; auto-invoked on `ce-brainstorm` / `ce-plan` / `ce-ideate` HITL handoffs |
| What it produces | A shareable Proof URL, an iterative review loop, and (when the source is a local file) a synced markdown file with the user's edits |
| Two layers | Web API (HTTP, no install) and Local Bridge (drives macOS Proof app) |

---

## The Problem

Reviewing markdown drafts collaboratively is harder than it looks:

- **Chat is the wrong surface** — pasting a 2,000-line plan into chat for "feedback" loses the structure
- **Pasting comments is lossy** — "see the bullet on line 47" doesn't anchor; a week later nobody remembers what bullet
- **Tracked changes need infrastructure** — "suggest this edit" is meaningful only when there's a real accept/reject affordance
- **Identity drifts** — when an agent edits, who edited? Without consistent attribution, comment authorship in the rendered doc is wrong
- **State management is fragile** — concurrent edits collide; mutations need base tokens; retry logic is full of footguns
- **PII / secrets in transit** — uploading content to a third-party editor is a real concern; the user needs to know what's leaving local

## The Solution

`ce-proof` runs collaboration through Proof's structured API:

- **Web API** for shared docs — no install needed; create, read, edit via HTTP; user gets a shareable URL with an access token
- **Local Bridge** when the macOS Proof app is running — drives the open document directly via `localhost:9847`
- **HITL review mode** as the primary chain integration — atomic upload + iterative ingest + atomic end-sync to disk
- **Consistent identity** — `by: "ai:compound-engineering"` on every op; `name: "Compound Engineering"` bound once via `/presence`
- **`baseToken` discipline** — read once, mutate many; on `STALE_BASE` re-read and retry once; verify before retry on potentially-applied mutations
- **Idempotency keys** for safe retries on the same logical write

---

## What Makes It Novel

### 1. Web API + Local Bridge — both supported, same identity model

Proof exposes two surfaces:

- **Web API** at `proofeditor.ai` — anyone with the share URL can read/edit; great for shared review
- **Local Bridge** at `localhost:9847` — drives the open Proof.app on macOS directly; great for one-machine workflows

The skill documents both. Identity stays consistent: `ai:compound-engineering` machine ID, `Compound Engineering` display name. Callers running HITL review in different sub-agent contexts can override the identity pair if a distinct sub-agent should own the doc.

### 2. HITL review as a structured mode

The Human-in-the-Loop Review path (loaded from `references/hitl-review.md`) is the chain's primary use case:

- Upload a local markdown file to Proof; user gets a URL
- User annotates in Proof's web UI (comments, suggested edits)
- Skill ingests the threads — reads each comment, replies in-thread, applies agreed edits as tracked suggestions (`status: "accepted"` for in-place commits with audit trail)
- On end-sync, syncs the final markdown back to the local file **atomically** (write to temp sibling, then `mv`)

Two entry points, identical mechanics:
- **Direct user request** — bare phrase like "share this to proof so we can iterate" or "HITL this doc"
- **Upstream skill handoff** — `ce-brainstorm` / `ce-ideate` / `ce-plan` finishes a draft and passes it for review

### 3. Mutation discipline — `baseToken` reuse + verify-before-retry

Every Proof mutation requires a `baseToken`. The skill teaches the right pattern:

- **Read once, mutate many** — `mutationBase.token` from `/state` is good for many mutations; `STALE_BASE` is recoverable
- **On `STALE_BASE` / `BASE_TOKEN_REQUIRED` / `MISSING_BASE` / `INVALID_BASE_TOKEN`** — re-read `/state`, retry once with same payload + fresh token
- **On `INVALID_OPERATIONS` / `INVALID_REQUEST` / 422 errors** — fix the payload first, don't retry blindly
- **On `COLLAB_SYNC_FAILED` / 5xx / network timeout / `202 with collab.status: "pending"`** — the canonical doc *may* have been written; re-read `/state` and check whether the intended mark/edit is already present **before retrying**
- **`Idempotency-Key`** is recommended on every mutation; required when contract demands it. Same key on retry collapses the duplicate; new key means a new logical write

> Duplicate-mark incidents usually come from retrying a `comment.add` or `suggestion.add` after a timeout without verifying. When in doubt: re-read, diff, then decide.

### 4. Two endpoint shapes — `/ops` and `/edit/v2`

Proof has two write surfaces with **load-bearing differences** the skill teaches:

- **`/api/agent/{slug}/ops`** — top-level `type` field; one operation per call. Best for marks (`comment.add`, `suggestion.add`, `comment.reply`, etc.)
- **`/api/agent/{slug}/edit/v2`** — `operations` array where each entry has `op`. Atomic batch — every op lands or none. Best for block-level edits (`replace_block`, `insert_after`, `find_replace_in_block`, etc.)

Sending an `op`-shaped operation to `/ops` returns 422; the wire format isn't interchangeable. The skill documents both.

### 5. Tracked suggestion with `status: "accepted"`

`suggestion.add` defaults to creating a pending suggestion the user must accept/reject. The skill also exposes `status: "accepted"` — creates the suggestion mark **and** commits the change in one call. The mark persists as audit trail with per-edit attribution; the user can still reject to revert. Useful when the agent is confident and the user wants to see what landed without an explicit accept step.

### 6. `LIVE_CLIENTS_PRESENT` awareness

While a client is connected to a Proof doc, the skill knows what's safe:

- **`/edit/v2`** — works during active collab
- **`suggestion.add`** (including `status: "accepted"`) — works during active collab
- **All comment ops** — work during active collab
- **`rewrite.apply`** — blocked by `LIVE_CLIENTS_PRESENT`; would clobber in-flight Yjs edits

The skill tells callers to reserve `rewrite.apply` for no-client scenarios and use the granular ops or `/edit/v2` during active sessions.

### 7. Atomic end-sync to local file

When the source was a local markdown file, end-sync writes the reviewed Proof state back to disk **atomically**:

```bash
# Stream .markdown bytes directly to a temp sibling, then rename.
TMP="${LOCAL}.proof-sync.$$"
jq -jr '.markdown' "$STATE_TMP" > "$TMP" && mv "$TMP" "$LOCAL"
```

`jq -jr` (no trailing newline, raw string) preserves byte-for-byte content including trailing newlines. `mv` within the same filesystem is atomic — a crashed write leaves the original untouched, never half-written.

The skill also asks the user to confirm before writing when the pull isn't directly asked for (e.g., as a side-effect of HITL completion) — silent overwrites are surprising.

### 8. Consistent agent identity

The skill enforces `by: "ai:compound-engineering"` on every op and `X-Agent-Id: ai:compound-engineering` in headers. Display name `Compound Engineering` is bound once per session via `/presence`. **Don't use `ai:compound` or other ad-hoc variants** — identity stays uniform unless a caller explicitly overrides for a sub-agent context.

---

## Quick Example

`/ce-plan` finishes a notification-mute plan and the user picks "Open in Proof" at the Phase 5.4 menu. Plan invokes `ce-proof` in HITL-review mode with the plan path and title.

The skill creates a Proof doc via `POST /share/markdown` with the plan content. Returns a URL with token. Binds the display name via `POST /presence`. Surfaces the URL to the user.

User opens the URL in their browser. Adds 4 inline comments and 2 suggested edits over 10 minutes. Says "ready" in chat.

The skill reads `/state`, finds 6 new marks. For each comment thread:
- Reads the thread fresh
- Composes a reply addressing the concern (with `comment.reply`)
- For agreed edits, posts a tracked suggestion (`suggestion.add` with `status: "accepted"`) — change lands with an audit-trail mark

After all threads are processed, the skill asks the user to confirm the end-sync. User confirms. The skill atomically writes the reviewed markdown back to `docs/plans/2026-05-04-001-feat-notification-mute-plan.md`. Returns control to `ce-plan` Phase 5.4 with `status: proceeded` and `localSynced: true`.

---

## When to Reach For It

Reach for `ce-proof` when:

- You want a shareable URL for a markdown doc (brainstorm, plan, learning, draft)
- You want HITL review with comment threads, tracked edits, and atomic disk sync at the end
- A chain skill (`ce-brainstorm`, `ce-plan`, `ce-ideate`) handed off for human review
- You're working from a Proof URL and want the agent to participate

Skip `ce-proof` when:

- The doc is small enough that chat-paste-and-discuss works fine
- You don't have network access (web API needs `proofeditor.ai`); the local bridge is macOS-only
- The content is too sensitive to upload to a third-party editor — keep it local

---

## Use as Part of the Workflow

`ce-proof` integrates with the chain at multiple HITL touchpoints:

- **`/ce-brainstorm` Phase 4** — "Open in Proof" handoff for collaborative iteration on the requirements doc
- **`/ce-plan` Phase 5.4** — "Open in Proof" handoff for HITL review of the plan
- **`/ce-ideate` Phase 6** — "Open and iterate in Proof" option (default save destination for non-software topics)
- **`/ce-compound`** — for sharing a learning before committing to `docs/solutions/`

After HITL review completes, the originating skill regains control with one of four statuses:
- `proceeded` with `localSynced: true` — disk was synced; continue
- `proceeded` with `localSynced: false` — Proof has the new version, local is stale; offer to pull
- `done_for_now` — user paused; offer to pull current Proof state
- `aborted` — fall back to the menu without changes

---

## Use Standalone

Direct invocation for ad-hoc Proof work:

- **Upload local markdown** — `/ce-proof "share docs/plans/foo.md to Proof for iteration"`
- **From a Proof URL** — `/ce-proof https://www.proofeditor.ai/d/abc123?token=xxx` (read state, add comments, suggest edits)
- **HITL on the just-edited file** — "share this to proof so we can iterate" picks up whichever markdown was just touched
- **Pull a Proof doc to local** — sync current Proof state to a markdown file (atomic write)

---

## Reference

| API surface | When |
|-------------|------|
| Web API at `proofeditor.ai` | Default; no install; shareable URLs |
| Local Bridge at `localhost:9847` | macOS Proof.app running; one-machine workflow |

| Op (Web API `/ops`) | Purpose |
|---------------------|---------|
| `comment.add` | Comment on a quote |
| `comment.reply` | Reply within a thread |
| `comment.resolve` / `comment.unresolve` | Toggle thread resolution |
| `suggestion.add` | Tracked edit (pending or `status: "accepted"`) |
| `suggestion.accept` / `suggestion.reject` | Resolve a suggestion |
| `rewrite.apply` | Whole-doc replacement (blocked by `LIVE_CLIENTS_PRESENT`) |

| Endpoint | Wire format | Best for |
|----------|-------------|----------|
| `/api/agent/{slug}/ops` | Top-level `type` | Marks (comment, suggestion) |
| `/api/agent/{slug}/edit/v2` | `operations: [{op, ...}, ...]` | Atomic block batches |

Identity defaults: `by: "ai:compound-engineering"`, `name: "Compound Engineering"`. `Idempotency-Key` recommended on every mutation.

---

## FAQ

**Why two endpoint shapes?**
Different concerns. `/ops` handles per-call mark mutations (one comment, one suggestion). `/edit/v2` handles atomic batches of block-level edits (one call commits 12 block changes or none). The wire formats differ — sending `op` shape to `/ops` returns 422.

**What's the right mutation pattern?**
Read `/state` once, capture `mutationBase.token`, reuse for many mutations. On `STALE_BASE`, re-read and retry once with fresh token. On potentially-applied errors (5xx, timeout, `202 pending`), re-read and check whether the change is already present before retrying — duplicate marks come from retrying without verifying.

**Why the `ai:compound-engineering` identity?**
For consistent attribution. Mark authorship in the rendered doc shows who edited; if the agent uses `ai:compound` one day and `ai:compound-engineering` the next, the audit trail looks fragmented. The skill enforces one identity unless a caller explicitly overrides.

**What does HITL review mode do?**
Upload a local markdown file to Proof, let the user annotate via comments and suggestions in the web UI, ingest each thread (read fresh, reply, apply agreed edits as tracked suggestions), then sync the reviewed markdown back to the local file atomically. The full loop spec is in `references/hitl-review.md`.

**Can I edit a doc while a user is connected?**
Yes for `/edit/v2`, `suggestion.add` (including `status: "accepted"`), and all comment ops. No for `rewrite.apply` — it's blocked by `LIVE_CLIENTS_PRESENT` because it would clobber in-flight Yjs edits.

**What if the upload fails?**
The skill retries once. If it still fails, callers get a clear error and can decide what to do (often: stay in the chain skill's menu without the Proof handoff, or fall back to local-only). Persistent failures get reported to Proof via `POST /api/bridge/report_bug` for diagnosis.

---

## See Also

- [`/ce-brainstorm`](./ce-brainstorm.md) — Phase 4 "Open in Proof" handoff
- [`/ce-plan`](./ce-plan.md) — Phase 5.4 "Open in Proof" handoff
- [`/ce-ideate`](./ce-ideate.md) — Phase 6 "Open and iterate in Proof" option
- [Proof](https://www.proofeditor.ai) — the editor itself; this skill is the agent client
