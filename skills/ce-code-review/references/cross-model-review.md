# Cross-Model Adversarial Pass

Runs the adversarial review through a **different model family than the host**, in a separate read-only process, so its findings are independent of the in-process reviewers. The peer gets the **same** `references/personas/adversarial-reviewer.md` brief the in-process reviewer uses, returns the same `findings-schema.json` shape, and folds into Stage 5 as reviewer `adversarial-<peer>` — so agreement between it and the in-process `adversarial` persona promotes the finding (Stage 5 cross-reviewer agreement; render as `adversarial, adversarial-<peer>`).

All the invocation detail (composing the prompt from the persona, read-only flags, per-peer timeouts, capturing schema-shaped JSON) lives in the bundled script **`scripts/cross-model-adversarial-review.sh`**. This reference only decides *whether* to run it, *which peer*, and how to fold the result in. The pass is **non-blocking**: the script logs a reason and exits cleanly on any problem, writing no output file — a missing file is simply "no cross-model pass," never a failure.

## Gates — run only when all hold

1. `adversarial-reviewer` was selected in Stage 3 (reuse that diff gate — don't run a costly external CLI on a trivial diff).
2. Scope is `local-aligned` or standalone — the working tree IS the reviewed head. Skip in `pr-remote` / `branch-remote`: the peer reviews the local tree, which is not the PR/branch head.

## Step 1 — Identify host and peer (runtime self-id, no build-time)

```bash
if [ -n "${CURSOR_AGENT:-}${CURSOR_CONVERSATION_ID:-}" ]; then XHOST=cursor; XPEER=codex;
elif [ "${CLAUDECODE:-}" = "1" ]; then XHOST=claude; XPEER=codex;
elif [ -n "${CODEX_SANDBOX:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SESSION_ID:-}${CODEX_THREAD_ID:-}${CODEX_CI:-}" ]; then XHOST=codex; XPEER=claude;
else XHOST=unknown; XPEER=""; fi;
echo "XMODEL_HOST: $XHOST  PEER: ${XPEER:-none}"
```

Cursor and Claude prefer **codex** as the peer (a guaranteed different model family); Codex prefers **claude**. There is no single canonical marker Codex sets across surfaces (CLI, web, CI), and `shell_environment_policy`/IDE inheritance can strip env vars, so check the union above. Do **not** use the *other* CLI's home (e.g. `CODEX_HOME`) — it leaks into a Claude session. `unknown` → skip the pass silently. The script also re-validates the peer it is handed, so a wrong/missing peer fails safe.

## Step 2 — Announce (only on an interactive host — `claude` or `cursor` — AND default mode)

- Interactive host, default mode: surface a **prominent standalone line naming the peer** that will run (the peer CLI, plus its model if cheaply known), framed as an independent second model reviewing in parallel — placed with the Stage 3 team announce, not buried after it. Wording is yours; the falsifiable requirements: prominent, names the peer, reads as coverage not plumbing.
- Interactive host, peer not available (script will skip — CLI missing/unauthed): one quiet line that the cross-model pass was skipped and why. Never an error.
- `XHOST=codex`: announce **nothing** — run or skip silently.
- `mode:agent`: emit no prose.

## Step 3 — Run the bundled script (launch it in parallel with the persona reviewers)

The script is a CLI shell-out, not a subagent, so it doesn't consume the subagent concurrency budget. **Launch it as a background shell process in the same Stage 4 dispatch wave as the persona reviewers** so its runtime overlaps theirs, then collect before Stage 5.

Invoke it via the skill-dir anchor — set `SKILL_DIR` to the absolute directory of **this** skill's `SKILL.md` (the one you read to run ce-code-review), because the Bash tool's CWD is the user's project, not the skill dir, on every host:

```bash
SKILL_DIR="<absolute path of the directory containing the ce-code-review SKILL.md you read>";
bash "$SKILL_DIR/scripts/cross-model-adversarial-review.sh" "<peer>" "<base-ref>" "<run-dir>"
```

- `<peer>` = `XPEER` from Step 1 (`codex` or `claude`).
- `<base-ref>` = the Stage 1 `BASE` (the diff base the peer reviews via `git diff <base-ref>`).
- `<run-dir>` = the Stage 4 run dir (`/tmp/compound-engineering/ce-code-review/<run-id>/`). The script writes `adversarial-<peer>.json` there.

Set the Bash tool `timeout` to `660000` (11 min) — the script self-bounds (codex idle-timeout, default-180s stall with reasoning forced on for liveness; hard backstop `CROSS_MODEL_HARD_SECS`, default 600s) and exits cleanly. If the harness can't background a shell command, run it inline before awaiting the reviewers; correctness is unaffected, only wall-clock. The script needs no prompt or schema passed in — it reads the persona brief and `findings-schema.json` itself from the skill dir.

## Step 4 — Fold into Stage 5

- Read `<run-dir>/adversarial-<peer>.json`. If present, treat it as one reviewer return with `reviewer: adversarial-<peer>`, exactly like a persona artifact: its merge-tier fields enter Stage 5 dedup/promotion.
- **No file** (script skipped: no peer, CLI missing/unauthed, timeout, or unparseable output) → the pass simply didn't run. Note "cross-model pass: not run" in Coverage on an interactive host in default mode; stay silent under codex / `mode:agent`. Never fail the review.
- Empty `findings` → note "cross-model pass: no additional issues" in Coverage.
- A finding sharing a dedup fingerprint with the in-process `adversarial` persona promotes by one anchor step — the cross-model agreement signal, the strongest in the set (different model families, separate processes).

## What the script does (for maintainers — you don't invoke this directly)

`scripts/cross-model-adversarial-review.sh <peer> <base-ref> <run-dir>`:
- Self-locates the persona + schema via `BASH_SOURCE` (works from any CWD); derives the repo root from `git`.
- Composes the peer prompt from the canonical persona brief + a JSON-only contract. Codex fetches its own diff with read-only `git` inside its sandbox; Claude (which has no sandbox) is hard-denied `Bash`, so it gets the diff embedded and needs no shell. After capture, the script forces `reviewer = adversarial-<peer>` (the persona's example name `adversarial` would otherwise collide with the in-process reviewer and erase the cross-model agreement signal).
- Codex peer: `codex exec - -s read-only -o <out>` at high reasoning effort. No `--output-schema` (Codex strict mode rejects the permissive draft-07 schema); the full schema embedded in the prompt is its only contract, which produces complete schema-shaped findings (verified). The `-o` write is done by the codex CLI *outside* the model's sandbox, so it succeeds under `-s read-only` (verified); if it ever fails to materialize, the script recovers the same JSON from codex's captured stdout (belt-and-suspenders, no data lost).
- Claude peer: `claude -p --permission-mode dontAsk --disallowedTools Edit Write NotebookEdit --json-schema … --output-format json` (disallowed tools passed as separate variadic args, not one quoted string), captured from stdout (it can't write a file under those permissions), parsed via `.structured_output` with a `.result` fallback.
- Read-only differs by peer: codex `-s read-only` is a hard sandbox; claude `dontAsk` denies `Edit`/`Write`/`NotebookEdit`/`Bash` plus `mcp__*` (a user's pre-approved MCP write/deploy tools would otherwise run under `dontAsk`) and `Task` (a subagent would bypass the deny list) — so it can't mutate via shell, MCP, or a spawned subagent even under broad user allow-rules (deny overrides allow) — and reviews the embedded diff with read-only file access. Non-blocking everywhere: any gap → log + exit 0, no output file.
- Timeouts kill the whole **process group**, so no orphaned model call outlives the script. **Codex** streams its reasoning, so it runs in its own process group (`set -m`) under a watchdog that reaps the group — `kill -TERM` then `kill -KILL` after a grace, checking *group* liveness so a child that defers SIGTERM can't escape — when output stalls for `CROSS_MODEL_IDLE_SECS` (default 180s; reasoning is forced on via `-c hide_agent_reasoning=false` so the stream stays a reliable liveness signal even under a user config that hides it) or exceeds the hard backstop `CROSS_MODEL_HARD_SECS` (default 600s). Reaping the group directly (rather than signalling a `gtimeout` wrapper, whose `-k` only escalates on its *own* expiry) is what guarantees the peer dies. **Claude**'s `--output-format json` is single-shot, so it just gets a `gtimeout`/`timeout` hard cap.
