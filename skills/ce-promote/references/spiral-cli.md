# Spiral CLI reference

Spiral (`@every-env/spiral-cli`) drafts copy in a user's brand voice. `ce-promote` uses it as an **optional enhancement** — every call must be wrapped so a missing, unauthed, or erroring CLI never blocks the skill.

## Detection — three states

```bash
which spiral
spiral auth status --json 2>/dev/null
```

- **Absent** — `which spiral` finds nothing. → Path 0 (offer to install + connect).
- Otherwise parse `spiral auth status --json`:
  - **Ready** — `"authenticated": true` (equivalently `"status": "authenticated"`, any `source`). Use Path A.
  - **Unauthed** — `"authenticated": false`. → Path 0 (offer to sign in).
  - **Older CLI** that ignores `--json` (output isn't JSON): fall back to the human-readable signal in that same output — ready iff it contains `spiral_sk_`, else unauthed.

Prefer the JSON `authenticated` flag over substring-matching `spiral_sk_` — the flag is the designed contract, and the substring is only the backward-compat fallback. Any error or timeout → treat as not-ready and continue; never block.

## Path 0 — Offer setup (first run, declinable)

When Spiral is unauthed or absent, offer setup once. First check the opt-out so this never nags.

### Check the opt-out

Read the project config (resolve the repo root, never CWD):

```bash
cat "$(git rev-parse --show-toplevel 2>/dev/null)/.compound-engineering/config.local.yaml" 2>/dev/null || echo '__NO_CONFIG__'
```

If the contents have an **uncommented** top-level `ce_promote_spiral_optout: true` line, **skip Path 0** and go straight to Path B. **Ignore commented lines** — `ce-setup`'s template ships a `# ce_promote_spiral_optout: true` example, and a commented line is documentation, not an opt-out (a naive substring match would wrongly suppress the offer for any project that accepted the default template). Otherwise, offer setup.

### Ask

Use the platform's blocking-question tool: `AskUserQuestion` in Claude Code (call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded), `request_user_input` in Codex, `ask_question` in Antigravity CLI (`agy`) / Pi. If no blocking tool exists or the call errors, present the same options as a numbered list in chat and wait for a reply — never silently skip.

For the **unauthed** state, the **agent itself** runs `spiral login --json` (CLI >= 1.8.0): it's non-blocking and the API key never passes through the agent — the agent shares the returned `auth_url`, the user approves in a browser, and the credential is delivered server->CLI. The blocking question is mainly the escape hatch.

Use the question stem to teach the mechanic, offer the escape hatch, AND disclose that declining is durable (so the permanent side effect isn't hidden behind a transient-sounding label): "Spiral personalizes and humanizes the copy in your voice. [It's installed but not signed in / It isn't installed yet] — sign in now, or have the agent draft directly without Spiral? (Declining drafts your copy now and won't bring up Spiral again in this project; you can set it up anytime by asking.)"

Offer exactly **two** options (labels must be self-contained):

- **Unauthed** state: `Sign in to Spiral` · `Draft directly without Spiral`
- **Absent** state: `Install Spiral` · `Draft directly without Spiral`

There is deliberately no separate "don't ask again" option: **dismissing is itself the opt-out.** A single first-run decline records the flag and the offer never recurs in this repo. This is what keeps a per-ship skill from nagging — never make the user choose a special variant to stop being asked.

### Act on the choice

- **Sign in to Spiral** (installed, unauthed) — the agent runs `spiral login --json` itself. It's non-blocking, and the **API key never touches the agent** (the token is exchanged server->CLI via a device-code flow). Parse the JSON `status`:
  - `already_authenticated` — `{ "authenticated": true, "status": "already_authenticated", "prefix": "..." }`: a credential already exists; nothing to approve. Go to Path A. (To switch accounts the user runs `spiral logout` first.)
  - `pending` — `{ "status": "pending", "auth_url": "...", "user_code": "ABCD-2345", "expires_in": 900 }`: surface the `auth_url` for the user to open and approve in their browser (the `user_code` is embedded in the URL — show it too so they can confirm it matches), then wait. Once the user says they've approved, confirm by running `spiral auth status --json`: it returns `"authenticated": true` when claimed, or `"status": "pending"` if not yet (re-check, don't busy-loop with sleeps — let the user's confirmation drive the re-check). If it stays unclaimed or the code expires (~`expires_in`s), offer to retry or fall to Path B. On success -> Path A.
  - **Never have the user paste an API key into chat** — with agent login the agent never handles the key at all.
  - **Older CLI (< 1.8.0, no agent login):** if `spiral login --json` returns the legacy `API key required ... --token` text instead of JSON, suggest `npm i -g @every-env/spiral-cli@latest`, or have the user run `spiral login` themselves in their terminal (browser sign-in) and re-check `spiral auth status`. If they would rather not, go to Path B.
- **Install Spiral** (absent) — the pairing-code command installs and connects in one step. Direct the user to Settings → Connect an Agent at https://app.writewithspiral.com to copy their command, which looks like:
  ```bash
  npx @every-env/spiral-cli@latest setup --pairing-code <code>
  ```
  The pairing code is single-use and expires in ~15 minutes, so the user must fetch a fresh one from the web app — do not hardcode it. Once installed, if still unauthed, follow the **Sign in to Spiral** flow above (`spiral login --json`). If the user can't or won't install, go to Path B.
- **Draft directly without Spiral** — record the opt-out (below) so the offer never re-prompts in this repo, then go to Path B. (A failed/abandoned **sign-in or install** attempt does NOT record the opt-out — only an explicit "draft directly" dismissal does — so a user whose auth didn't complete still gets one clean re-offer next run.)

### Record the opt-out (best-effort)

Resolve the repo root, then add `ce_promote_spiral_optout: true` as a top-level key to `<root>/.compound-engineering/config.local.yaml`, using the native file-write/edit tool:

- **File already exists:** ensure an **uncommented** `ce_promote_spiral_optout: true` line is present — add one (or uncomment the example) unless an uncommented one already exists. A commented `# ce_promote_spiral_optout: true` (from `ce-setup`'s template) does **not** count as present; leaving only the comment would let the comment-ignoring read path re-prompt next run.
- **File absent:** create it (and its `.compound-engineering/` directory) with the key, AND make sure the machine-local config won't be committed. Check whether the root-relative path `<root>/.compound-engineering/config.local.yaml` is already ignored (`git check-ignore -q <path>`); if it isn't, append `.compound-engineering/*.local.yaml` to git's **local exclude file** — resolve that file's path with `git rev-parse --git-path info/exclude` (this is correct in worktrees too, where `.git` is a *file* and `info/exclude` lives in the common git dir; do **not** hardcode `<root>/.git/info/exclude`). Use the local exclude, **not** `.gitignore`: it keeps the rule local and avoids dirtying a tracked file on what was a drafts-only action. `ce-setup` is the canonical place that adds the shared `.gitignore` entry for teammates. Without any ignore, a user who runs `/ce-promote` before `/ce-setup` could accidentally commit machine-local opt-out state.

If the root can't be resolved or any write fails, proceed to Path B anyway; the opt-out is a convenience, never a blocker.

After recording, confirm it in one line so the write isn't silent and the user knows how to undo it — e.g. "Got it — I won't bring up Spiral here again (saved to `.compound-engineering/config.local.yaml`, kept out of git). Want it back later? Just ask, or remove the `ce_promote_spiral_optout` key." Keep it to a single line; don't belabor it.

## Generate

```bash
spiral write "<prompt>" --instant --num-drafts <1-5> --json
```

- `--instant` — skip clarifying questions. **Always use it**; this is a headless context with no human mid-call.
- `--json` — machine-readable output. Always use it.
- `--num-drafts <1-5>` — number of drafts (single-channel mode only; see gotcha).
- `--workspace <uuid>` — scope to a brand-voice workspace. List with `spiral workspaces`. Use only if the user names one.
- `--style <uuid>` — pin a specific voice/style. Use only if the user names one.

### Output shape

JSON with (fields verified against the Spiral CLI `write` output):

```json
{
  "session_id": "uuid",
  "status": "complete | needs_input",
  "drafts": [
    { "id": "uuid", "title": "...", "content": "markdown", "channel": "x",
      "url": "https://app.writewithspiral.com/chat/<session>?draft=<id>", "display_hint": "inline | expandable" }
  ],
  "text": "pipeline commentary — DO NOT show the user unless drafts is empty",
  "style_used": null,
  "quota_remaining": 42
}
```

- `channel` (lowercase) is one of `x`, `linkedin`, `email`, `newsletter`, `blog`, `instagram_tiktok`, `research`, or `null`.
- `url` opens that draft in the Spiral web app for editing. Drafts persist to the user's account — surface `session_id` + each `url` in your output (Phase 4).
- **Do not surface the `text` field** to the user — it's internal pipeline commentary. Only fall back to it if `drafts` is empty.
- With `--instant`, `status` should be `complete`. If it comes back `needs_input` (rare with `--instant`), don't relay Spiral's questions to the user — either answer from the context you already have via a `--session` follow-up, or fall back to Path B for that channel.

If parsing fails or `drafts` is empty, fall back to direct drafting for the affected channels.

## The multi-channel / cue-word gotcha (important)

Multi-channel output is **phrasing-driven, not a flag.** Spiral enters "campaign mode" when the prompt contains **≥2 channel keywords** (tweet/X, LinkedIn, email, blog, …) **OR** any cue word: `campaign`, `across`, `multi-channel`, `everywhere`, `cross-post`.

Two consequences to encode:

### (a) To get N variations of ONE channel

Ask for `"3 tweet options for <feature>"` and:

- **Avoid** the cue words above. Ironically, a prompt literally containing `campaign` or `multi-channel` trips campaign mode — so describe the task **without** those words.
- Pass `--num-drafts 3`.

If you accidentally include a cue word, Spiral decides it's a single campaign piece and returns **1 draft**, ignoring `--num-drafts`.

✅ `spiral write "3 tweet options for one-click CSV export" --instant --num-drafts 3 --json`
❌ `spiral write "a tweet campaign for CSV export" --instant --num-drafts 3 --json`  (collapses to 1 draft)

### (b) To get a real multi-channel set

Phrase the prompt with the multiple channels named. Spiral returns **one set of drafts per channel**, each draft carrying its `channel`. In this mode **`--num-drafts` is ignored** — per-channel counts apply.

✅ `spiral write "announcing one-click CSV export — a tweet and a LinkedIn post" --instant --json`
✅ `spiral write "a campaign across email, LinkedIn, and Twitter for CSV export" --instant --json`

This one-call cross-channel set is the ideal fit for `ce-promote` when the user wants to announce across surfaces.

**Spiral picks per-channel counts itself.** In campaign mode the count per channel is Spiral's call, not yours — e.g. "a tweet and a LinkedIn post" (verified live) returned 3 X drafts + 2 LinkedIn drafts (5 total), each tagged with its `channel`. Group the returned `drafts` by `channel` for Phase 4; don't assume one per channel.

## Failure handling

Detection that comes back not-ready routes through Path 0 above. Once on Path A, any of these → fall back to direct drafting (SKILL.md Path B), silently, for the affected channels:

- `spiral write` exits non-zero, hangs, or emits non-JSON
- `drafts` is empty or missing expected fields

Never surface raw Spiral errors to the user as a blocker. The skill always produces drafts.
