# `ce-proof`

> Publish, share, view, comment on, and edit markdown documents via [Proof](https://www.proofeditor.ai), Every's collaborative markdown editor.

`ce-proof` is the **collaborative-doc** skill. Proof is a real-time markdown editor where humans and agents can both work on the same document. The skill's primary use is **one-way publishing**: take a local markdown file (a brainstorm, a plan, a learning, a draft), create a shared Proof doc from it, and hand the user a shareable URL. The local file stays canonical — publishing does not sync anything back to disk. The skill also reads shared Proof docs and makes comment/suggestion/content edits over Proof's **v3 web API** when the agent is handed a URL to participate.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Publishes local markdown to a shareable Proof doc, reads shared docs, and edits via Proof's v3 HTTP API |
| When to use it | "Share to Proof", "publish to Proof", "view this in Proof"; auto-invoked on `ce-brainstorm` / `ce-plan` / `ce-ideate` publish handoffs |
| What it produces | A shareable Proof URL (publish), or edits/comments on a shared doc you point it at |
| API surface | Hosted web API at `proofeditor.ai` — `v3/document` (read) and `v3/edit` (write) |
| Sync direction | One-way publish by default — the local file stays canonical. Pulling a Proof doc back to local is a separate, explicit action |
| Ownership | Capture `accessToken` (everyday) and `ownerSecret` (delete); claim in the UI revokes `ownerSecret` |

---

## The Problem

Sharing markdown drafts for review is harder than it looks:

- **Chat is the wrong surface** — pasting a 2,000-line plan into chat for "feedback" loses the structure
- **Pasting comments is lossy** — "see the bullet on line 47" doesn't anchor; a week later nobody remembers what bullet
- **Tracked changes need infrastructure** — "suggest this edit" is meaningful only when there's a real accept/reject affordance
- **Identity drifts** — when an agent edits, who edited? Without consistent attribution, comment authorship in the rendered doc is wrong
- **Credentials are easy to drop** — create returns an `ownerSecret` that is the only delete credential for ownerless docs; agents that copy incomplete examples leave undeletable orphans
- **PII / secrets in transit** — uploading content to a third-party editor is a real concern; the user needs to know what's leaving local

## The Solution

`ce-proof` runs publishing and collaboration through Proof's structured v3 API:

- **One-way publish** — create a shared doc from a local markdown file and return a shareable URL; the local file stays canonical
- **Web API** — no install needed; create, read, edit via HTTP; user gets a shareable URL with an access token
- **v3 one-read / one-write** — `GET /api/agent/<slug>/v3/document` and `POST /api/agent/<slug>/v3/edit`; visible-text targets; optional `baseRevision`; no base tokens
- **Credential roles** — `accessToken` for everyday calls; `ownerSecret` for owner delete; always hand `tokenUrl`
- **Consistent identity** — `by: "ai:compound-engineering"` on every op; `name: "Compound Engineering"` bound once via `/presence`
- **Narrow-first edit ladder** — `replace` / `insert` / `delete` → `suggest` when track-changes matter → `set_document` last (collab-safe)
- **Retry against `error.current`** — closed error envelope with `retryable`; re-read on `202` / `PENDING`

---

## What Makes It Novel

### 1. CE publish shell on Proof's current agent contract

Proof's official agent docs define v3 + ownership. `ce-proof` keeps compound-engineering's product shell (publish-primary, fixed identity, pull-to-local, upstream handoffs) while teaching that current HTTP contract — not a stale dual-endpoint agent surface.

### 2. One-way publish as the primary mode

Publishing is the chain's primary use case:

- Create a shared Proof doc from a local markdown file via `POST /share/markdown`; user gets a URL
- Bind the display name via `POST /presence`
- Surface the `tokenUrl` — the user opens it to read, comment, and share with others

The local file remains the canonical record; nothing syncs back to disk as a side effect of publishing. Two entry points, identical mechanics:

- **Direct user request** — bare phrase like "share this to proof" or "publish this to proof"
- **Upstream skill handoff** — `ce-brainstorm` / `ce-ideate` / `ce-plan` finishes a draft and hands it to publish

### 3. Owner credential lifecycle

Create returns both `accessToken` and `ownerSecret`. The skill requires extracting both, keeping `ownerSecret` in session memory only (never in the repo tree), and using it for `DELETE /api/documents/<slug>` when the user wants cleanup of an unclaimed doc. Publish handoffs do **not** auto-delete — review URLs must linger. If a human claims the doc, `ownerSecret` is permanently revoked; `accessToken` keeps working and delete moves to the owner.

### 4. v3 mutation discipline

Every edit goes through `v3/edit` with an `operations` array. Targets are visible text. Ambiguous matches fail closed with `TARGET_AMBIGUOUS` + candidates. Content ops are atomic; review ops follow. Retryable failures carry `error.current` so the agent re-resolves instead of blind-retrying.

### 5. Atomic pull-to-local (separate, explicit action)

Publishing is one-way, but a user can still pull a Proof doc's current state down to a local markdown file as a deliberate step. The skill reads `v3/document`, streams `.markdown` with `jq -jr`, and renames atomically. It asks for confirmation when the pull is a side-effect.

### 6. Consistent agent identity

The skill enforces `by: "ai:compound-engineering"` on every op and `X-Agent-Id: ai:compound-engineering` in headers. Display name `Compound Engineering` is bound once per session via `/presence`. **Don't use `ai:compound` or other ad-hoc variants** — identity stays uniform unless a caller explicitly overrides.

---

## Quick Example

`/ce-plan` finishes a notification-mute plan and the user picks "Publish to Proof" at the Phase 5.4 menu. Plan invokes `ce-proof` with the plan path and title.

The skill creates a Proof doc via `POST /share/markdown` with the plan content, retains `accessToken` + `ownerSecret`, returns the `tokenUrl`, and binds the display name via `POST /presence`. It surfaces the URL to the user and returns control to `ce-plan` Phase 5.4 — the local plan file remains canonical and untouched.

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
- You don't have network access (web API needs `proofeditor.ai`)
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
- **Cleanup** — when the user asks to remove an unclaimed doc you created, `DELETE` with the session `ownerSecret`

---

## Reference

| API surface | When |
|-------------|------|
| `POST /share/markdown` | Create / publish |
| `GET /api/agent/{slug}/v3/document` | Read markdown + comments + suggestions |
| `POST /api/agent/{slug}/v3/edit` | Content and review mutations |
| `DELETE /api/documents/{slug}` | Owner delete (`ownerSecret` or Every owner session) |

| v3 content op | Purpose |
|---------------|---------|
| `replace` / `insert` / `delete` | Narrow prose edits (visible-text targets) |
| `set_document` | Whole-doc replacement (last resort; collab-safe) |

| v3 review op | Purpose |
|--------------|---------|
| `comment` / `reply` / `resolve` / `unresolve` | Comment threads (no comment delete) |
| `suggest` / `accept` / `reject` | Tracked suggestions |

Identity defaults: `by: "ai:compound-engineering"`, `X-Agent-Id: ai:compound-engineering`, `name: "Compound Engineering"`.

---

## FAQ

**Does publishing sync edits back to my local file?**
No. Publishing is one-way — it creates a shared Proof doc and returns a URL; the local file stays canonical. If you want the current Proof state on disk, pull it down explicitly (a separate, confirmed action that writes atomically).

**Why two tokens on create?**
`accessToken` is the everyday bearer for read/edit/presence. `ownerSecret` is the only credential that can delete an ownerless agent-created doc. Dropping `ownerSecret` leaves an undeletable orphan.

**Should I rewrite the whole doc?**
Almost never as a first move. Prefer `replace` / `insert` / `delete`. Use `suggest` when visible track changes matter. Use `set_document` only when the user asked for full replacement or the change cannot be represented narrowly.

**What's the right mutation pattern?**
Read `v3/document` once, send one `v3/edit` with the operations you need, then inspect the settled response (or re-read on `202`). On retryable errors, re-resolve against `error.current`.

**Why the `ai:compound-engineering` identity?**
For consistent attribution. Mark authorship in the rendered doc shows who edited; if the agent uses `ai:compound` one day and `ai:compound-engineering` the next, the audit trail looks fragmented. The skill enforces one identity unless a caller explicitly overrides.

**Can I edit a doc while a user is connected?**
Yes. v3 content and review ops work during active collab. `set_document` is applied as a minimal diff and is documented as safe with live collaborators.

**Does emptying a doc remove comments?**
No. Emptying markdown does not scrub comment marks. Delete the document with `ownerSecret` (while unclaimed) or ask the owner after claim.

**What if the upload fails?**
The skill retries once. If it still fails, callers get a clear error and can decide what to do (often: stay in the chain skill's menu without the Proof handoff, or fall back to local-only). Persistent failures get reported to Proof via `POST /api/bridge/report_bug` for diagnosis.

---

## See Also

- [`/ce-brainstorm`](./ce-brainstorm.md) — Phase 4 "Publish to Proof" handoff
- [`/ce-plan`](./ce-plan.md) — Phase 5.4 "Publish to Proof" handoff
- [`/ce-ideate`](./ce-ideate.md) — Phase 5 "Publish to Proof" option
- [Proof](https://www.proofeditor.ai) — the editor itself; this skill is the agent client
- [Proof agent docs](https://www.proofeditor.ai/agent-docs) — hosted agent contract
