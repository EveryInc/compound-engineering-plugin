# `ce-proof`

> Publish a local markdown file to a shareable [Proof](https://www.proofeditor.ai) URL, or read, comment on, and edit an existing Proof doc.

`ce-proof` is a **publish and collaborate** utility, not a review skill and not a proofreader. Proof is a real-time markdown editor. Humans and agents can work in the same document.

The usual job is **one-way publish**: take a local markdown file (a brainstorm, a plan, a learning, a draft), create a shared Proof doc, and hand back a URL. The local file stays canonical. Publishing does not write anything back to disk.

It also reads a Proof URL and can comment, suggest, or edit over Proof's hosted v3 web API. Pulling remote content down to a local file is a separate, explicit action.

It does not review documents, check math, gather evidence, or stand in for a proof of concept. If the source is an HTML unified plan, it does not upload it. It returns the local browser path instead.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Publishes local markdown to a shareable Proof URL, or reads, comments on, and edits a Proof doc you point it at |
| When to use it | You want a shareable link, a wrap-up menu offered "Publish to Proof", or the agent should work from a Proof URL |
| What it produces | A shareable `tokenUrl` (publish), comments or edits on a shared doc, or a local markdown file (explicit pull) |
| What's next | Open the URL, share it, or return to the skill that handed off. The local file is unchanged. |
| Sync | One-way by default. A pull is a separate, confirmed write. |

---

## Example invocations

Publishing creates a new shared doc. A URL argument reads or edits that doc. A pull writes remote content to disk.

```text
# Publish a named markdown file and keep the local file canonical
/ce-proof share docs/plans/notification-mute.md to Proof

# Same request in everyday language; the file is the one just created or edited
/ce-proof share this to Proof

# Publish a learning or other draft, not only a plan
/ce-proof publish docs/solutions/notification-mute-race.md to Proof

# Read, comment on, or edit an existing shared doc
/ce-proof https://www.proofeditor.ai/d/example?token=example

# Pull current Proof content onto disk. This overwrites the local file.
/ce-proof pull this Proof document to docs/reviews/notification-mute.md

# Remove an unclaimed doc this session created
/ce-proof delete the Proof doc we just published
```

Only markdown is published. An HTML plan stays local. Do not put secrets or private personal data in Proof unless you explicitly approve the upload.

---

## The Problem

Sharing a long markdown draft for review is awkward:

- Chat loses structure. A 2,000-line plan pasted into a thread is hard to comment on.
- "See the bullet on line 47" does not stay attached to that bullet a week later.
- Suggested edits need accept/reject, not a second copy of the file.
- Agent edits need a stable identity, or the comment trail looks like several different authors.
- Create returns an `ownerSecret` that is the only delete credential for an unclaimed doc. Drop it and the doc cannot be cleaned up.
- Upload is a real third-party transfer. You should know what is leaving disk.

## The Solution

`ce-proof` talks to Proof's hosted API at `proofeditor.ai`:

- **Publish** reads the local markdown, posts it to `POST /share/markdown`, binds the display name, and returns the `tokenUrl`. Nothing syncs back.
- **Collaborate** reads `v3/document` and writes through `v3/edit`: narrow replace/insert/delete first, then suggestions, then whole-doc replace only when you asked for it or a narrow edit cannot express the change.
- **Pull** is explicit. It reads the current Proof markdown and writes it atomically to a local path. If the pull is a side effect of something else, the skill asks first.
- **Cleanup** deletes an unclaimed doc with the session `ownerSecret` when you ask. Publish handoffs do not auto-delete.

If typed `proof_*` MCP tools are already available, the skill prefers those. Otherwise it uses HTTP.

---

## What Makes It Novel

### One-way publish is the default

The chain use is "give me a link." The local file remains the record. Two equivalent entries:

- A direct request: "share this to proof", "publish this to proof", "get me a proof link for this doc"
- An upstream handoff from `ce-ideate` (markdown output), non-software `ce-brainstorm`, or non-software `ce-plan`

Software brainstorm and software plan menus do not offer Proof. Invoke `/ce-proof` yourself on the markdown file. HTML artifacts are not uploaded.

When the source is a unified plan, the Proof title is labeled by readiness when that metadata is available, for example `Plan: <title> (requirements-only)` or `Plan: <title> (implementation-ready)`.

### Two credentials, different jobs

Create returns `accessToken` (everyday read, edit, presence) and `ownerSecret` (delete while the doc is unclaimed). The skill keeps `ownerSecret` in session memory only. It never writes tokens into the repo. Always share the `tokenUrl`, not a bare `/d/<slug>`.

If someone claims the doc in the Proof UI, `ownerSecret` is revoked for good. `accessToken` still works. Delete then belongs to the Every owner account.

### Narrow edits, then suggestions, then whole-doc

Targets are visible text, not raw markdown syntax. Ambiguous matches fail closed. `set_document` is last and is applied as a minimal diff, so it is safe with live collaborators. Emptying the markdown does not remove comment marks. Delete the document if you need a privacy cleanup.

Identity defaults are `by: "ai:compound-engineering"` and display name `Compound Engineering`. Do not use `ai:compound` unless a caller overrides the pair on purpose.

---

## Quick Example

You ask to share a notification-mute plan. The skill reads the markdown, posts it to `/share/markdown`, keeps `accessToken` and `ownerSecret` in session memory, binds the display name, and prints the `tokenUrl`. The local plan file is untouched.

You open the URL, leave inline comments, and send the link to a teammate. Nothing syncs back. If a wrap-up menu handed this off, that menu comes back so you can start work, create an issue, or stop.

Later, `/ce-proof pull this Proof document to docs/reviews/notification-mute.md` writes the current Proof markdown to that path. If the pull is a side effect of another action, the skill asks first.

---

## When to Reach For It

Use `ce-proof` when:

- You want a shareable URL for a markdown brainstorm, plan, learning, or draft
- A wrap-up menu offered "Publish to Proof" (`ce-ideate` markdown, non-software brainstorm, non-software plan)
- You have a Proof URL and want the agent to read, comment, or edit
- You want the current Proof state on disk as a deliberate pull

Skip it when:

- You want a document reviewed for gaps or quality → `/ce-doc-review` (or `/ce-code-review` for code)
- The artifact is HTML → open the local file; Proof does not ingest HTML
- The doc is small enough that chat is enough
- You are offline (`proofeditor.ai` is required)
- The content is too sensitive to upload

---

## Use as Part of the Workflow

Wrap-up menus that offer Proof:

- Non-software `/ce-brainstorm` and `/ce-plan`
- `/ce-ideate` Phase 5, markdown output only

The handoff is one-way. `ce-proof` publishes, prints the URL, and returns control. The originating skill's local file stays canonical, so that menu can re-render as it was.

Software brainstorm and software plan menus do not include Proof. Publish those markdown files with a direct `/ce-proof` invoke.

---

## Use Standalone

- **Publish a file:** `/ce-proof share docs/plans/foo.md to Proof`
- **Publish the file just edited:** `share this to proof`
- **Work from a URL:** `/ce-proof https://www.proofeditor.ai/d/abc123?token=xxx`
- **Pull to disk:** an explicit path, atomic write, confirmed when it is a side effect
- **Cleanup:** delete an unclaimed doc this session created, using the session `ownerSecret`

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ or `share this to Proof` | Publishes the markdown file just created, edited, or referenced. Asks which file if that is unclear. |
| `<path>` / `share <path> to Proof` | Publishes that markdown file. HTML is refused. |
| `<Proof URL>` | Reads the doc, then comments or edits if that is what you asked. |
| `pull … to <path>` | Writes current Proof markdown to that local path. Confirms first when the pull is a side effect. |
| `delete` / `clean up` | Deletes an unclaimed doc this session created. After claim, ask the owner. |

| API | When |
|-----|------|
| `POST /share/markdown` | Create / publish |
| `GET /api/agent/{slug}/v3/document` | Read markdown, comments, suggestions |
| `POST /api/agent/{slug}/v3/edit` | Content and review mutations |
| `DELETE /api/documents/{slug}` | Owner delete (`ownerSecret` or Every owner session) |

Content ops: `replace` / `insert` / `delete`, then `set_document` last. Review ops: `comment` / `reply` / `resolve` / `unresolve` (no comment delete), `suggest` / `accept` / `reject`.

Identity defaults: `by: "ai:compound-engineering"`, `X-Agent-Id: ai:compound-engineering`, `name: "Compound Engineering"`.

---

## FAQ

**Does publishing sync edits back to my local file?**
No. Publishing creates a shared doc and returns a URL. Pull explicitly if you want the current Proof state on disk.

**Why two tokens on create?**
`accessToken` is the everyday bearer. `ownerSecret` is the only credential that can delete an ownerless agent-created doc. Dropping `ownerSecret` leaves an undeletable orphan.

**Should I rewrite the whole doc?**
Almost never as a first move. Prefer `replace` / `insert` / `delete`. Use `suggest` when visible track changes matter. Use `set_document` only for a full replacement you asked for, or a change that cannot be expressed narrowly.

**Can I edit a doc while a user is connected?**
Yes. v3 content and review ops work during live collab. `set_document` is applied as a minimal diff.

**Does emptying a doc remove comments?**
No. Delete the document with `ownerSecret` while it is unclaimed, or ask the owner after claim.

**What if the upload fails?**
The skill retries once. After that you get an error and can stay in the originating menu without the Proof link. Persistent failures can be reported to Proof via `POST /api/bridge/report_bug`.

---

## See Also

- [`/ce-brainstorm`](./ce-brainstorm.md): non-software wrap-up still offers Proof
- [`/ce-plan`](./ce-plan.md): non-software wrap-up still offers Proof
- [`/ce-ideate`](./ce-ideate.md): Phase 5 "Publish to Proof" on markdown output
- [Proof](https://www.proofeditor.ai): the editor
- [Proof agent docs](https://www.proofeditor.ai/agent-docs): hosted agent contract
