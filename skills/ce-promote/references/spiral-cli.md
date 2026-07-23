# Spiral CLI reference

Spiral (`@every-env/spiral-cli`) drafts copy in a user's brand voice. `ce-promote` uses it as an **optional enhancement**: any absence, error, timeout, or unparseable output means treat Spiral as not-ready and draft directly — never block, never surface raw Spiral errors as a blocker.

## Detection — three states

Run `which spiral`, then `spiral auth status --json` (one argv-style command per shell call).

- **Absent** — `which spiral` finds nothing. → offer to install + connect.
- Otherwise parse `spiral auth status --json`:
  - **Ready** — `"authenticated": true` (equivalently `"status": "authenticated"`, any `source`). Draft with Spiral.
  - **Unauthed** — `"authenticated": false`. → offer to sign in.
  - **Older CLI** that ignores `--json` (output isn't JSON): fall back to the human-readable signal in that same output — ready iff it contains `spiral_sk_`, else unauthed.

## Offer setup (first run, declinable)

When Spiral is unauthed or absent, offer setup once. First check the opt-out so this never nags.

### Check the opt-out

Resolve the repo root (`git rev-parse --show-toplevel`, never CWD) and read `<root>/.compound-engineering/config.local.yaml` with the native file-read tool; a missing file or non-zero exit just means no opt-out.

If the contents have an **uncommented** top-level `ce_promote_spiral_optout: true` line, skip the offer and draft directly. **Ignore commented lines** — `ce-setup`'s template ships a `# ce_promote_spiral_optout: true` example, so a naive substring match would wrongly suppress the offer for every project that accepted the default template.

### Ask

Use the platform's blocking-question tool: `AskUserQuestion` in Claude Code (call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded), `request_user_input` in Codex, `ask_question` in Antigravity CLI (`agy`) / Pi. If no blocking tool exists or the call errors, present the same options as a numbered list in chat and wait for a reply — never silently skip.

Two options: sign in (or install) Spiral, or draft directly without it. Disclose that declining is durable for this repo, since **dismissal is itself the opt-out** — there is no separate "don't ask again" choice and the user is never asked twice.

### Act on the choice

- **Sign in** (installed, unauthed) — the **agent itself** runs `spiral login --json` (CLI >= 1.8.0): it's non-blocking and the **API key never touches the agent** (device-code flow, credential delivered server->CLI). **Never have the user paste an API key into chat.** Parse the JSON `status`:
  - `already_authenticated` (`{ "authenticated": true, "status": "already_authenticated", "prefix": "..." }`) — a credential already exists; draft with Spiral.
  - `pending` (`{ "status": "pending", "auth_url": "...", "user_code": "ABCD-2345", "expires_in": 900 }`) — surface the `auth_url` (and the `user_code` embedded in it, so the user can confirm the match) for the user to approve in a browser. Once they say they've approved, re-check `spiral auth status --json` — don't busy-loop with sleeps; let the user's confirmation drive the re-check. If it stays unclaimed or the code expires (~`expires_in`s), offer to retry or draft directly.
  - **Older CLI (< 1.8.0, no agent login):** if `spiral login --json` returns the legacy `API key required ... --token` text instead of JSON, suggest `npm i -g @every-env/spiral-cli@latest`, or have the user run `spiral login` themselves and re-check `spiral auth status`.
- **Install** (absent) — the pairing-code command installs and connects in one step: `npx @every-env/spiral-cli@latest setup --pairing-code <code>`. The code is single-use and expires in ~15 minutes, so direct the user to Settings → Connect an Agent at https://app.writewithspiral.com to copy a fresh command — do not hardcode a code. Once installed, if still unauthed, follow the **Sign in** flow above.
- **Draft directly** — record the opt-out (below), then draft directly. A failed or abandoned sign-in/install attempt does **not** record it — only an explicit "draft directly" dismissal does — so a user whose auth didn't complete still gets one clean re-offer next run.

### Record the opt-out (best-effort)

Add an **uncommented** top-level `ce_promote_spiral_optout: true` to `<root>/.compound-engineering/config.local.yaml` with the native file-write/edit tool, creating the file and its directory if needed (uncommenting `ce-setup`'s template line counts; leaving only the comment does not, and would re-prompt next run). If that path isn't already ignored (`git check-ignore -q <path>`), append `.compound-engineering/*.local.yaml` to git's **local exclude file**, resolving its path with `git rev-parse --git-path info/exclude` — correct in worktrees too, where `.git` is a *file*; do **not** hardcode `<root>/.git/info/exclude`, and do **not** use `.gitignore` (that dirties a tracked file on a drafts-only action; `ce-setup` owns the shared entry for teammates).

If the root can't be resolved or any write fails, draft anyway; the opt-out is a convenience, never a blocker. Confirm the write in one line, naming the file and the key so the user knows how to undo it.

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
- `url` opens that draft in the Spiral web app for editing. Drafts persist to the user's account — surface `session_id` + each `url` in your output.
- **Do not surface the `text` field** to the user — it's internal pipeline commentary. Only fall back to it if `drafts` is empty.
- With `--instant`, `status` should be `complete`. If it comes back `needs_input` (rare with `--instant`), don't relay Spiral's questions to the user — either answer from the context you already have via a `--session` follow-up, or draft that channel directly.

If parsing fails or `drafts` is empty, draft directly for the affected channels.

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

Phrase the prompt with the multiple channels named. Spiral returns **one set of drafts per channel**, each draft carrying its `channel`. In this mode **`--num-drafts` is ignored** — the count per channel is Spiral's call, not yours (verified live: "a tweet and a LinkedIn post" returned 3 X drafts + 2 LinkedIn drafts, 5 total). Group the returned `drafts` by `channel`; don't assume one per channel.

✅ `spiral write "announcing one-click CSV export — a tweet and a LinkedIn post" --instant --json`
✅ `spiral write "a campaign across email, LinkedIn, and Twitter for CSV export" --instant --json`

This one-call cross-channel set is the ideal fit for `ce-promote` when the user wants to announce across surfaces.
