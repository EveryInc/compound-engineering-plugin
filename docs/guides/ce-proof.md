# `ce-proof`

> Publish a local markdown file to a shareable [Proof](https://www.proofeditor.ai) URL, or read, comment on, and edit an existing Proof doc.

Proof is a real-time markdown editor where humans and agents work in the same document. `ce-proof` is the plugin's bridge to it. Despite the name, it does not proofread, check math, gather evidence, or build proofs of concept.

The usual job is a one-way publish: take a local markdown file (a brainstorm, a plan, a learning, a draft), create a shared Proof doc, and hand back a URL. The local file stays canonical. Publishing writes nothing back to disk.

Given a Proof URL instead of a file, it reads the doc and can comment, suggest, or edit through Proof's hosted v3 API. Pulling remote content down to a local file is a separate, explicit action.

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

Only markdown is published. An HTML plan stays local; the skill returns the local browser path instead of uploading it. Don't put secrets or private personal data in Proof unless you explicitly approve the upload.

---

## The Problem

Sharing a long markdown draft for review is awkward. Chat loses structure, and a 2,000-line plan pasted into a thread is hard to comment on. "See the bullet on line 47" does not stay attached to that bullet a week later. Suggested edits need accept/reject, not a second copy of the file.

The API side has its own traps. Agent edits need a stable identity, or the comment trail looks like several different authors. Create returns an `ownerSecret` that is the only delete credential for an unclaimed doc; drop it and the doc can never be cleaned up. And an upload is a real third-party transfer, so you should know what is leaving disk.

## The Solution

`ce-proof` talks to Proof's hosted API at `proofeditor.ai`. Publish reads the local markdown, posts it to `POST /share/markdown`, binds the display name, and returns the `tokenUrl`. Nothing syncs back.

For collaboration it reads `v3/document` and writes through `v3/edit`, choosing the narrowest operation that expresses the change: a scoped replace, insert, or delete first, then suggestions, then whole-doc replace only when you asked for it or a narrow edit cannot express the change.

A pull is explicit. It reads the current Proof markdown and writes it atomically to a local path. If the pull is a side effect of something else, the skill asks first.

Cleanup deletes an unclaimed doc with the session `ownerSecret` when you ask. Publish handoffs never auto-delete; review docs need to linger.

If typed `proof_*` MCP tools are already available, the skill prefers those. Otherwise it uses HTTP.

---

## What Makes It Novel

### One-way publish is the default

The chain use is "give me a link." The local file remains the record. Two entries land here: a direct request ("share this to proof", "get me a proof link for this doc") and an upstream handoff from `ce-ideate` (markdown output) or a non-software `ce-brainstorm` or `ce-plan`.

Software brainstorm and software plan menus do not offer Proof. Invoke `/ce-proof` yourself on the markdown file. HTML artifacts are never uploaded.

When the source is a unified plan and its readiness metadata is known, the Proof title carries it: `Plan: <title> (requirements-only)` or `Plan: <title> (implementation-ready)`.

### Two credentials, different jobs

Create returns `accessToken` (everyday read, edit, presence) and `ownerSecret` (delete, while the doc is unclaimed). The skill keeps `ownerSecret` in session memory only and never writes tokens into the repo. It always shares the `tokenUrl`, not a bare `/d/<slug>`, because the editor token doubles as the claim capability.

If someone claims the doc in the Proof UI, `ownerSecret` is revoked for good. `accessToken` still works, and delete then belongs to the owner's Every account.

### Narrow edits before big ones

Edit targets are visible text, not raw markdown syntax. Ambiguous matches fail closed rather than guessing at the first occurrence. `set_document` comes last and is applied as a minimal diff, so it is safe with live collaborators. Emptying the markdown does not remove comment marks; a privacy cleanup means deleting the document.

Every write is attributed as `by: "ai:compound-engineering"` with display name `Compound Engineering`. Callers can override the pair on purpose; improvised variants like `ai:compound` are not allowed.

---

## Quick Example

You ask to share a notification-mute plan. The skill reads the markdown, posts it to `/share/markdown`, keeps `accessToken` and `ownerSecret` in session memory, binds the display name, and prints the `tokenUrl`. The local plan file is untouched.

You open the URL, leave inline comments, and send the link to a teammate. Nothing syncs back. If a wrap-up menu handed this off, that menu comes back so you can start work, create an issue, or stop.

Later, `/ce-proof pull this Proof document to docs/reviews/notification-mute.md` writes the current Proof markdown to that path.

---

## When to Reach For It

Use `ce-proof` when:

- You want a shareable URL for a markdown brainstorm, plan, learning, or draft
- A wrap-up menu offered "Publish to Proof" (`ce-ideate` markdown, non-software brainstorm, non-software plan)
- You have a Proof URL and want the agent to read, comment, or edit
- You want the current Proof state on disk as a deliberate pull

Skip it when:

- You want a document reviewed for gaps or quality. That is `/ce-doc-review`, or `/ce-code-review` for code.
- The artifact is HTML. Open the local file; Proof does not ingest HTML.
- The doc is small enough that chat is enough.
- You are offline. The skill needs `proofeditor.ai`.
- The content is too sensitive to upload.

---

## Use as Part of the Workflow

Wrap-up menus that offer Proof: non-software `/ce-brainstorm`, non-software `/ce-plan`, and `/ce-ideate` Phase 5 on markdown output.

The handoff is one-way. `ce-proof` publishes, prints the URL, and returns control. The originating skill's local file stays canonical, so that menu can re-render as it was.

Software brainstorm and software plan menus do not include Proof. Publish those markdown files with a direct `/ce-proof` invoke.

---

## Use Standalone

- Publish a file: `/ce-proof share docs/plans/foo.md to Proof`
- Publish the file just edited: `share this to proof`
- Work from a URL: `/ce-proof https://www.proofeditor.ai/d/abc123?token=xxx`
- Pull to disk: an explicit path, atomic write, confirmed when it is a side effect
- Cleanup: delete an unclaimed doc this session created, using the session `ownerSecret`

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

Content ops: `replace` / `insert` / `delete`, then `set_document` last. Review ops: `comment` / `reply` / `resolve` / `unresolve` (no comment delete), `suggest` (text, plus typed table/format/atom/node forms) / `modify_suggestion` / `accept` / `reject`. Limits: 100 ops per request, 2 MiB per `set_document`.

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

- [`/ce-brainstorm`](./ce-brainstorm.md): non-software wrap-up offers Proof
- [`/ce-plan`](./ce-plan.md): non-software wrap-up offers Proof
- [`/ce-ideate`](./ce-ideate.md): Phase 5 "Publish to Proof" on markdown output
- [Proof](https://www.proofeditor.ai): the editor
- [Proof agent docs](https://www.proofeditor.ai/agent-docs): hosted agent contract
