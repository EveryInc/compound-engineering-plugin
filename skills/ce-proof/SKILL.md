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

Proof is a collaborative document editor for humans and agents, reached through the hosted web API at `https://www.proofeditor.ai` (HTTP/`Bash`). **Outcome:** the user holds a working tokenized Proof link, or the doc carries the read, comment, suggestion, or edit they asked for. **Done:** the API returned `ok: true` (or a `202` re-read confirmed it), the intended change is visible in a fresh `v3/document` read, and the link plus a short summary went back to the user.

**Read `references/api.md` before the first Proof read or mutation, HTTP or MCP** — it owns the endpoints (`share/markdown`, `/api/agent/<slug>/v3/document`, `/api/agent/<slug>/v3/edit`, presence, title, `/api/documents/<slug>` DELETE), the operation tables, and the error/retry classes. **Read `references/workflows.md`** before reviewing a shared doc, creating and sharing one, or pulling a doc to a local file; those flows have exact recipes there. Do not invent agent mutation paths outside v3.

If typed `proof_*` MCP tools are already available in the harness (`proof_share_markdown`, `proof_v3_document`, `proof_v3_edit`, `proof_presence`, `proof_document_title`, `proof_document_delete`, `proof_report_bug`), prefer them; otherwise use the HTTP recipes. In MCP mode the server injects `by`, `X-Agent-Id`, and presence identity — pass the `?token=` value from the Proof URL as `shareToken` for edits and presence on docs the signed-in user does not own. Delete authority is unchanged in MCP mode: an unclaimed doc still needs its `ownerSecret`, a claimed doc its owner's session — an editor `accessToken` passed as `shareToken` cannot delete.

On Claude Code, each new `curl` pattern prompts for permission; suggest (do not silently add) the allowlist rule `"Bash(curl * https://www.proofeditor.ai/*)"` under `permissions.allow` if the user wants a quieter session.

## Identity

Every write is attributed with both fields, and they do not vary: machine ID `ai:compound-engineering` (as `by` on every op and the `X-Agent-Id` header) and display name `Compound Engineering` (as `name` on `POST /presence`, set once per doc session so Proof binds it to that agent ID). A caller may pass a different `identity` pair when a distinct sub-agent should own the doc; never improvise a variant such as `ai:compound`.

## Credentials and boundaries

- `accessToken` is the everyday bearer for read, edit, presence, and events. `ownerSecret` is owner authority only — delete and other owner-level ops — never the everyday bearer. Capture both at create time and persist `ownerSecret` for the session separately from `accessToken` (shell vars or equivalent) — it is required for owner delete while the doc is unclaimed. Neither belongs in repo-tracked files, commits, or durable logs, and `ownerSecret` never appears in user-facing copy.
- Hand humans the tokenized link (`tokenUrl`), never a bare `/d/<slug>` — the editor token doubles as claim capability for ownerless docs.
- Public creates are ownerless until a signed-in Every user claims the doc in the browser. Claiming permanently revokes `ownerSecret` while `accessToken` keeps working, so delete then needs the owner's Every session — ask the owner, or use their session token. A `403` with `code: "DOCUMENT_DELETE_FORBIDDEN"` and `reason: "CREDENTIAL_NOT_OWNER"`, or a `401` when presenting the creation `ownerSecret`, means the secret was revoked: stop using it rather than retrying. `reason: "DOCUMENT_HAS_NO_OWNER"` is the opposite — still unclaimed, so only the original `ownerSecret` can delete it and an Every session cannot.
- Never put secrets, credentials, API keys, private tokens, or sensitive personal data into a Proof doc unless the user explicitly approves, and never silently replace a repo-tracked project doc with a Proof link.
- Emptying the markdown does **not** scrub comment marks — quotes and commentary stay readable to anyone with the share credential, so a content wipe is not a privacy cleanup. Deleting the document is (with `ownerSecret` while unclaimed, or the owner after claim).
- Do not auto-delete after a publish handoff; review docs must linger. Delete when the user asks, or when finishing an explicitly ephemeral scratch doc.

## Publish mode

The primary use is one-way publishing: read an existing local markdown file in full, post its contents as the new doc's body, and hand the user the shareable URL. The local file stays canonical — publishing syncs nothing back to disk. Two entry points with identical mechanics: a bare user request naming a local markdown file ("share this to proof", "get me a proof link for this doc" — ask which file only if it is ambiguous; this needs no upstream caller), or a handoff from `ce-brainstorm`, `ce-ideate`, or `ce-plan` passing the file path and title.

Only publish markdown. If the source is an HTML unified plan, return the local browser/open path instead of uploading it. When publishing a unified plan, label the title by readiness when it is known, e.g. `Plan: <title> (requirements-only)` or `Plan: <title> (implementation-ready)`.

Publish the source file's bytes, never hand-written or placeholder content: `references/workflows.md` gives the `jq --rawfile` recipe that escapes newlines, quotes, and backticks correctly. After a publish handoff, surface the URL and return control.

## Editing

`GET /api/agent/<slug>/v3/document` and `POST /api/agent/<slug>/v3/edit` are the only agent read and mutation surfaces — comments, replies, resolutions, suggestions, and content changes are all `operations` in the v3 edit body, so a path you did not read in `references/api.md` is one you invented. Read `v3/document` as the source of truth before editing, then choose the narrowest operation that expresses the change: a scoped `replace` / `insert` / `delete` for prose; `suggest` when the change should be visible as tracked changes; `set_document` only when the user asks for whole-doc replacement or the change cannot be expressed narrowly. Targets are visible text in `markdown`, never raw markdown syntax or block refs. `comments[]` and `suggestions[]` from that read are the review state — reply, resolve, unresolve, accept, or reject by id; v3 has no delete-comment op, and a comment marked `orphaned: true` is still readable and replyable but its old quote is no longer a live anchor.

Stop classes, before retrying anything:

- `TARGET_AMBIGUOUS` — the anchor matched more than once and nothing changed. Disambiguate with `occurrence` / `before` / `after` from `error.candidates`; never assume silent first-match, and never blind-retry a comment.
- `retryable: false` — fix the request. `retryable: true` with `error.current` — re-resolve targets against `current`, then retry once.
- `202` / `PENDING`, or `ok: false` with `partial: true` — the write may have committed. Re-read `v3/document` before chaining or reporting success, and retry only the failed op (a repeated `Idempotency-Key` replays safely).
- Still failing after a fresh read and one safe retry — report the bug per `references/api.md` rather than looping.

Pulling a doc down to a local file overwrites that file, so when the pull is a side effect of some other action rather than what the user asked for, confirm the path first.
