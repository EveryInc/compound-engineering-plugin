---
title: "Running Google Antigravity's ACP runtime as a cross-model peer: isolation, sign-in, and model selection"
date: 2026-10-15
category: integration-issues
module: "cross-model peer workers (skills/*/scripts/cross-model-*.sh)"
problem_type: integration_issue
component: tooling
symptoms:
  - "session/new fails with 'Authentication required' although the user is signed in to Antigravity"
  - "an Antigravity peer run never opens a session and sits until the 480s idle cap when no Google login is usable"
  - "`acpx antigravity sessions new` never returns when HOME points at a scratch directory"
  - "a ce-work unit on Antigravity stalls until timeout with mode=default and --approve-all"
  - "a signed-in user's Antigravity peer opens no session within 60s and reports a Google sign-in wait"
root_cause: wrong_api
resolution_type: code_fix
severity: medium
retire_when: "Antigravity's ACP runtime (agy_acp_server.par, 1.4.0 at writing) or the pinned acpx changes how it resolves settings, sign-in, or advertised models; re-run the live probes in the body against the new version."
tags:
  - "antigravity"
  - "acpx"
  - "cross-model"
  - "peer-delegation"
  - "gemini"
  - "gemini-home"
---

# Running Google Antigravity's ACP runtime as a cross-model peer: isolation, sign-in, and model selection

## Problem

The `antigravity` peer route runs Google's Antigravity ACP runtime (`agy_acp_server.par`, launched by acpx's built-in `antigravity` agent) as a Gemini peer. Its isolation, sign-in, and model behavior differ from the other peer CLIs in ways that are invisible until a live run fails: a misconfigured launch either leaks the user's own Gemini setup into the peer, hangs on a sign-in it can never complete, or stalls in a mode that never writes.

## Symptoms

- `session/new` returns JSON-RPC error "Authentication required" even when the user is signed in, because no `auth.type` is selected.
- With no usable login, the runtime never answers `session/new`; the run produces no output until the idle cap reaps it.
- `acpx antigravity sessions new` never returns under a scratch `HOME`.
- `ce-work` writes stall until timeout in `mode=default`.

## What Didn't Work

- **Driving the `agy` CLI directly.** `agy -p` takes the prompt as its own value (so `-p --output-format …` swallows the next flag and stdin is rejected), argv caps the prompt at 128 KiB on Linux, `--mode plan` is silently disabled by `--disable-slash-commands`, and the CLI's JSON output carries no model field. acpx's ACP agent replaced all of this.
- **Gemini CLI as the Gemini peer.** Its personal Google sign-in is refused server-side with `UNSUPPORTED_CLIENT` ("migrate to the Antigravity suite", google-gemini/gemini-cli#28846), so most users could not use it.
- **A scratch `HOME` for full isolation.** It isolated the peer for `exec` once, but it also moves npm's cache (npx re-fetches acpx every run), and `acpx antigravity sessions new` never opened a session under it. Isolation turned out to need only `GEMINI_HOME`.
- **Relying on the shared idle cap for sign-in failures.** An unauthenticated runtime with `oauth-personal` selected waits for a browser OAuth callback indefinitely, so the run burned the full 480s idle cap (8 minutes) and the skip reason named idleness, not sign-in.
- **`mode=default` for ce-work writes.** With `--approve-all` the runtime issued shell probes and never wrote before the timeout; `mode=auto_edit` created and edited files.

## Solution

All in the byte-identical acpx transport block shared by the four worker scripts, plus per-worker route cases:

- **Private `GEMINI_HOME` per run** that selects the personal login: `acpx_antigravity_home` writes the runtime's settings file (the `antigravity-acp` folder inside that home) with `{"auth":{"type":"oauth-personal"}}` inside the run's private scratch, and copies the user's file login (`acp_token.json` from `${GEMINI_HOME:-~/.gemini}/antigravity-acp/`) in at mode 0600 when it exists (`skills/ce-code-review/scripts/cross-model-adversarial-review.sh`, `acpx_antigravity_home`). The real `HOME` stays, so npm's cache and the macOS keychain login keep working.
- **Strip Google credential variables** with `env -u` before the first assignment, so an ambient API key or cloud project never bills instead of the subscription (`cross-model-adversarial-review.sh:285`).
- **Session-start check**: `acpx_session_state` reports `starting | pending | open`; a session still `pending` after `ACPX_SESSION_START_SECS` (default 60s, `cross-model-adversarial-review.sh:317-318`) is reaped and reported as a pre-egress sign-in skip, since nothing has been sent.
- **Model choice before egress**: request `gemini-4-argon`; when acpx ends before the prompt with "did not advertise that model. Available models: …", run once more with `gemini-3.8-flash` (`cross-model-adversarial-review.sh:1082`). A configured model is exact.
- **ce-work**: `--config-option mode=auto_edit` for writes (`skills/ce-work/scripts/cross-model-work.sh:343`), and a `--check-model` preflight that opens a session with `acpx … --model <m> antigravity sessions new` (no prompt) under the real `HOME`, then deletes the session record it created under `~/.acpx` (`cross-model-work.sh:393`, `:418`, `:432`).

## Why This Works

- The runtime resolves skills and settings from `GEMINI_HOME` (plus the working directory's `.agents/skills` and `.gemini/skills`), not from `HOME`. In a live probe with the real `HOME` and a private `GEMINI_HOME`, the peer listed only the private skill directories, and nothing was read from or written to the user's `~/.gemini` config. Conversations and transcripts land in the runtime's `antigravity-acp` folder inside `GEMINI_HOME`, so deleting the scratch deletes them.
- The runtime stores its login in one of two places. On macOS with a working default keychain it uses the keychain (service `gemini`, account `antigravity-acp`), which does not depend on `GEMINI_HOME`. Otherwise it uses the file `<GEMINI_HOME>/antigravity-acp/acp_token.json`: always on Linux, when `AGY_ACP_FORCE_FILE_STORAGE=1` is set, or when the keychain probe fails. The runtime's `_default_token_path` docstring says it performs no migration from other locations. So a private home must be given a copy of the file login, or a file-backed user stalls on a browser sign-in (#1879). The original version of this doc claimed the runtime copied the token in by itself. That was wrong, and the probe that seemed to confirm it ran on a keychain login.
- The copy is not written back. A refreshed access token is dropped with the scratch, which costs one refresh per run against the long-lived refresh token. Writing back could race concurrent peers or overwrite a newer sign-in.
- The `agy` CLI keeps its own token under `~/.gemini/antigravity-cli/`, and the runtime does not read it. To sign the runtime in, put `{"auth":{"type":"oauth-personal"}}` in `~/.gemini/antigravity-acp/settings.json` and run `npx acpx@<pin> antigravity exec` once in a terminal.
- Without `auth.type`, `session/new` refuses with "Authentication required" before trying any login.
- acpx validates `--model` against the session's advertised bare ids (`configOptions[id=model]`, e.g. `gemini-3.8-flash`; `models.availableModels` lists tier-suffixed ids that `--model` does not accept) and fails before `session/prompt`. That makes the Argon-to-Flash walk free of egress. The advertised list is account-dependent and differs from `agy models`.
- acpx always records sessions under `$HOME/.acpx` (no override variable), and under a scratch `HOME` the runtime never opened the session, so the no-prompt model check has to run with the real `HOME` and clean up its own record.

## Prevention

- Re-probe live when the acpx pin or the runtime version changes: auth with a private `GEMINI_HOME` on both credential backends (force the file one with `AGY_ACP_FORCE_FILE_STORAGE=1`; a keychain login hides a missing file token), the unadvertised-model message (the fallback keys on "did not advertise"), the write mode, and that nothing new appears under `~/.gemini` beyond the runtime's own binary cache (`~/.gemini/antigravity/bin`).
- Keep the route tests that pin the isolated environment: `tests/skills/ce-code-review-cross-model-routes.test.ts` (the `antigravity route` block) asserts `GEMINI_HOME` with `oauth-personal`, stripped `GEMINI_API_KEY`/`GOOGLE_CLOUD_PROJECT`, the fallback, and the sign-in stall skip.
- Treat a long session start as sign-in until proven otherwise, but expect false positives on a cold npx cache or a saturated machine: the 60s window counts from launch.

## Related Issues

- GitHub issue #1798 (add Antigravity as a cross-model peer).
- GitHub issue #1879 (file-backed logins never reached the private `GEMINI_HOME`).
- [Quiet-interval floors for streaming peer routes](../skill-design/quiet-interval-floors-for-streaming-peer-routes.md): the shared idle cap the session-start check sits in front of.
- [Requested vs verified model identity](../skill-design/requested-vs-verified-model-identity.md): the route reports no served model, so receipts record `unverified`.
- [Verify a new target platform's format against the CLI binary](../conventions/antigravity-target-empirical-format-verification.md): the converter target for Antigravity, a separate surface with the same verify-live lesson.
