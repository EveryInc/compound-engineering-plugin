---
title: "grok arm posture validation (ce-deep-review Phase 0, U1): grok 0.2.8 headless is blocked by a relay-auth bug — deferred from v1"
date: 2026-05-28
last_updated: 2026-05-28
category: skill-design
module: compound-engineering / cross-model-review-eval
tags: [cross-model, grok, sandbox, validation, ce-deep-review, phase-0]
problem_type: integration_issue
---

# grok arm posture validation (ce-deep-review Phase 0 / U1)

Empirical validation of the Grok Build CLI as a cross-model reviewer arm for `ce-deep-review`,
run on the original developer's machine on 2026-05-28. Plan: `docs/plans/2026-05-28-003-feat-ce-deep-review-skill-plan.md` (U1).

## Verdict: grok DEFERRED from v1 (Phase 0 gate "drop grok")

grok 0.2.8 **cannot complete a single headless `-p` review on this machine** due to a
worker/relay authentication bug. The arm *design* is sound (all required flags exist; the
sandbox posture is ideal), so this is "drop from v1 and re-test on a version bump," not "wrong
approach." v1 ships without grok (codex + agy).

## Environment

- `grok 0.2.8 (730d2470cda)` at `~/.grok/bin/grok`.
- Auth: `~/.grok/auth.json` (OIDC cached token). `grok models` reports "You are logged in with
  grok.com" — **shell-level auth is healthy** (log: `auth_mode: Oidc`, `is_expired: false`,
  `cached_token handler set api_key (SessionToken)`).
- Offline auth signal (R9): presence of `~/.grok/auth.json` containing a non-empty
  `https://auth.x.ai::<id>` scope entry. (No `XAI_API_KEY` env var in use; no flat `expires_at`.)

## CLI surface (grok 0.2.8) — all U1-assumed flags are present

Confirmed via `grok --help`:

- `--permission-mode <MODE>` — values include `plan` (read-only). ✅
- `--disable-web-search` ✅
- `--sandbox <PROFILE>` (env `GROK_SANDBOX`) ✅
- `-p, --single <PROMPT>` (single-turn, prints to stdout and exits) ✅; also `--prompt-file <PATH>`, `--prompt-json <JSON>`.
- `--output-format <plain|json|streaming-json>` ✅
- `--no-subagents`, `--verbatim`, `--max-turns <N>`, `--cwd <CWD>` ✅
- Tool control: `--tools <allowlist>`, `--disallowed-tools`, `--allow`, `--deny`.

The brainstorm's grok flag assumptions hold against 0.2.8. (`--max-turns 1`, however, is **wrong** — see below.)

## Sandbox posture (validated, ideal) — `read-only`

grok ships **built-in seatbelt profiles** (custom ones live in `~/.grok/sandbox.toml`). From
`~/.grok/sandbox-events.jsonl` (`platform: macos/seatbelt`, `enforced: true`):

| profile | restrict_network | workspace writable | notes |
|---|---|---|---|
| `workspace` | false | yes | default dev posture |
| `read-only` | **true** | **no** (RW only `~/.grok` + tmp) | **ideal arm posture** |
| `strict` | true | yes (system paths RO) | workspace RW |

`read-only` gives the floor R5 wants: the model's web-search/fetch **tools** are network-blocked
and the workspace is not writable. (grok's own control-plane API to xAI is a separate transport,
not blocked by the tool-network restriction — so the arm can still produce a review.)

## The blocker: headless `-p` worker relay-auth failure

Every headless `-p` invocation fails:

```
ERROR worker quit with fatal: Transport channel closed, when Auth(AuthorizationRequired)
ERROR error= Internal error: "max_turns exceeded: limit is N, but got N+2 messages"
```

Reproduced under all of:
- trivial prompt (`say hi`), full review prompt; `--output-format json` and `plain`;
- clean cwd (`--cwd <tmp>`), tools disabled (`--tools ""`), `--no-subagents`, `--disable-web-search`, `--permission-mode plan`;
- `--max-turns` 1, 5, 8, 10, 30 (message count always creeps ~2 over the limit — the worker spins retrying the failed auth, burning messages until max-turns trips);
- **after `grok login`** (user re-ran) and **after `grok agent --reauth`** (user re-ran).

Root cause (diagnosed via `~/.grok/logs/unified.jsonl` + `grok agent headless --help`): the
**shell** process auths fine, but the headless **agent worker runs "over the Grok WebSocket
relay"** (a separate auth path from the shell login), and *that* relay auth fails with
`AuthorizationRequired`. Because the shell login is healthy, neither `grok login` nor
`grok agent --reauth` clears it. This is a grok 0.2.8 headless/relay bug on this machine, not a
stale credential.

Secondary observation (isolation): with tools enabled in the repo cwd, grok went **agentic** —
it tried to use the `qmd` MCP and search `docs/plans/` ("There are many plans in docs/plans/…
qmd__search") instead of reviewing the inline text. Confirms the arm must run from a **clean cwd
with tools disabled** (both to keep it a single-shot reviewer and to prevent ambient-repo egress).

## When grok is fixed: the validated would-be posture

**Re-probe:** `scripts/eval/cross_model_review/validation/grok-smoke.sh` runs the intended posture
against the sentinel and reports `BLOCKED` (relay bug still present) vs `PASS` (relay fixed → arm
can ship). Run it after any grok version bump. Land this in `arms.py` once it passes:

```
grok --cwd <clean-tmp> -p "<lens rubric + doc>" \
  --output-format json --disable-web-search --no-subagents \
  --tools "" --permission-mode plan --sandbox read-only \
  --max-turns <adequate, NOT 1>
```

- `--max-turns 1` is wrong: a single review uses ~6+ internal messages. Use a generous bound (or omit) so a legitimate single-shot review isn't cut off.
- `--sandbox read-only` enforces the FS+network-tool floor at the seatbelt layer (defense-in-depth beyond `--permission-mode plan` + `--tools ""`).
- Pass the doc via stdin or `--prompt-file` (consistent with the harness's isolation model).

## Phase 0 gate consequence

Per the plan's Phase 0 gate ("grok validation fails → drop grok from v1"): **grok is dropped from
v1.** Combined with the agy posture finding (separate doc), v1's cross-model arms are codex + agy
(with agy confined via an OS sandbox — see the agy validation doc). Re-test grok on a version bump.
