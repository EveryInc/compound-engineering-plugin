# Cross-Model Adversarial Pass

Runs the adversarial review through a **different model family than the host**, in a separate process, so its findings are independent of the in-process reviewers. Output uses the same `findings-schema.json` as every reviewer and folds into Stage 5 as reviewer `adversarial-<peer>` — so when it and the in-process `adversarial` persona flag the same issue, Stage 5 cross-reviewer agreement promotes it.

This is additive, not a replacement for the `adversarial-reviewer` persona. It is **non-blocking**: any host-detect miss, auth gap, timeout, or parse failure skips the pass and never fails the review.

## Gates — run only when all hold

1. `adversarial-reviewer` was selected in Stage 3 (reuse that diff gate — never run a costly external CLI on a trivial diff).
2. Scope is `local-aligned` or standalone — the working tree IS the reviewed head. Skip in `pr-remote` / `branch-remote`: the peer CLI reviews the local tree, which is not the PR/branch head.
3. A peer is identified and `ready` (Steps 1-2).

## Step 1 — Identify host and peer (runtime self-id, no build-time)

```bash
if [ -n "${CURSOR_AGENT:-}${CURSOR_CONVERSATION_ID:-}" ]; then XHOST=cursor; XPEER=codex
elif [ "${CLAUDECODE:-}" = "1" ]; then XHOST=claude; XPEER=codex
elif [ -n "${CODEX_SANDBOX:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SESSION_ID:-}" ]; then XHOST=codex; XPEER=claude
else XHOST=unknown; XPEER=""; fi
echo "XMODEL_HOST: $XHOST  PEER: ${XPEER:-none}"
```

Peer mapping: Cursor and Claude both prefer **codex** (a guaranteed different model family/process — Cursor's own model is configurable, so codex is the reliable cross-model peer); Codex prefers **claude**. Each host is matched on its own session signals, with a fallback marker because the primary one is not set in every release/mode: Cursor = `CURSOR_AGENT` or `CURSOR_CONVERSATION_ID`; Claude Code = `CLAUDECODE=1`; Codex = `CODEX_SANDBOX`/`CODEX_SANDBOX_NETWORK_DISABLED` (set by `codex exec -s`) **or** `CODEX_SESSION_ID` (an interactive Codex session may set only the latter — without the fallback, a real Codex session falls through to `unknown` and the pass silently never runs). Presence of the *other* CLI's home (e.g. `CODEX_HOME`) is NOT a host signal — it is exported even inside a Claude session. `unknown` → skip the pass silently. If a new host/release changes these markers, the failure mode is a silent skip, not a wrong peer — verify the markers when adding a host.

## Step 2 — Peer preflight (installed + authed)

Peer = codex:

```bash
if ! command -v codex >/dev/null 2>&1; then XMODE=not_installed
elif [ -z "${CODEX_API_KEY:-}${OPENAI_API_KEY:-}" ] && [ ! -f "${CODEX_HOME:-$HOME/.codex}/auth.json" ]; then XMODE=not_authed
else XMODE=ready; fi
echo "XPEER_MODE: $XMODE"
```

Peer = claude:

```bash
# jq is required to parse Claude's JSON envelope (Step 5); treat its absence as not-installed.
if ! command -v claude >/dev/null 2>&1 || ! command -v jq >/dev/null 2>&1; then XMODE=not_installed
elif ! claude auth status >/dev/null 2>&1; then XMODE=not_authed
else XMODE=ready; fi
echo "XPEER_MODE: $XMODE"
```

## Step 3 — Announce (only on an interactive host — `claude` or `cursor` — AND default mode)

- `XHOST` is `claude` or `cursor`, default mode, `XMODE=ready`: print one line — `Cross-model adversarial pass: running via <peer>.`
- `XHOST` is `claude` or `cursor`, default mode, `XMODE` not ready: print one subtle line — `Cross-model adversarial pass skipped (<peer> not available).` Never phrase it as an error.
- `XHOST=codex`: announce **nothing** — run or skip silently.
- `mode:agent`: emit no prose in any case.

## Step 4 — Build the peer prompt + schema (injection-safe: write to files, never inline diff bytes)

`<run-id>` is the Stage 4 run id; `<base>` is the Stage 1 `BASE`; `<repo-root>` is `git rev-parse --show-toplevel`.

- Read `references/findings-schema.json` (the orchestrator has it as a read-time reference) and write it verbatim to `/tmp/compound-engineering/ce-code-review/<run-id>/xmodel-schema.json`.
- Compose `/tmp/compound-engineering/ce-code-review/<run-id>/xmodel-prompt.txt` from the **same** `references/personas/adversarial-reviewer.md` brief the in-process pass uses, then append:
  > Run: `git diff <base>` to see the changes on this branch and review ONLY those changes. Return ONE JSON object matching the provided schema, with `reviewer` set to `adversarial-<peer>`. No prose outside the JSON.

The peer fetches the diff itself with read-only `git`; never paste diff bytes into the prompt.

## Step 5 — Run the peer (verified flags — empirically re-test before changing any)

Peer = codex (host = claude or cursor):

```bash
XDIR=/tmp/compound-engineering/ce-code-review/<run-id>
codex exec - \
  -C <repo-root> -s read-only \
  --output-schema "$XDIR/xmodel-schema.json" \
  -o "$XDIR/adversarial-codex.json" \
  -c 'model_reasoning_effort="high"' \
  < "$XDIR/xmodel-prompt.txt"
```

Prompt is fed on stdin via `-` (documented: "if `-` is used, instructions are read from stdin") rather than a `"$(cat …)"` argv — avoids ARG_MAX/quoting edge cases on a large brief, and stdin EOF means no hang (no `< /dev/null` needed). `--output-schema` is **best-effort**: some Codex models reject a response schema. If the configured model errors on it, drop `--output-schema` (or pin `-m` to a structured-output-capable model) — `-o` still writes the model's final message and the prompt already demands JSON-only, so Stage 5's malformed-drop handles a non-conforming return.

Peer = claude (host = codex):

```bash
XDIR=/tmp/compound-engineering/ce-code-review/<run-id>
claude -p --model opus --permission-mode dontAsk \
  --disallowedTools "Edit Write NotebookEdit" --max-turns 15 --no-session-persistence \
  --json-schema "$(cat "$XDIR/xmodel-schema.json")" --output-format json \
  "$(cat "$XDIR/xmodel-prompt.txt")" < /dev/null > "$XDIR/adversarial-claude.raw.json"
# Prefer the parsed structured object; fall back to the .result string if it is absent/null.
jq -e '.structured_output' "$XDIR/adversarial-claude.raw.json" > "$XDIR/adversarial-claude.json" 2>/dev/null \
  || jq -r '.result // empty' "$XDIR/adversarial-claude.raw.json" > "$XDIR/adversarial-claude.json"
```

**Run this as a blocking Bash call** (set the Bash tool `timeout` to `300000`, 5 min) and wait for it to finish before Stage 5 — the cross-model return must be on disk before the merge reads it. `< /dev/null` prevents the stdin-deadlock hang on the Claude path (the Codex path gets EOF from its prompt file).

Read-only is enforced differently per peer, and they are not equally strong: **codex `-s read-only` is a hard sandbox**. **Claude's `dontAsk` is permission-gated, not a kernel sandbox** — it auto-runs only read-only Bash and the user's `permissions.allow` entries and denies the rest without prompting, so a user who has broadly allow-listed Bash (e.g. `Bash(*)`) could still let the peer mutate. The peer only needs read-only `git`, so this matters only with broad pre-existing allow-rules; `--disallowedTools "Edit Write NotebookEdit"` blocks the file-edit tools regardless.

The capture mechanisms differ by necessity: codex `-o` is written by Codex itself (not a sandboxed model command), so it works under `-s read-only`. Claude under `dontAsk` + disallowed `Write` cannot write a file, so capture stdout — `--output-format json` returns an envelope whose `.structured_output` is the parsed, schema-valid object; the `jq` fallback above uses `.result` (the same JSON as a string) when `.structured_output` is absent or null, so a successful run is never silently dropped.

## Step 6 — Fold into Stage 5

- Read `<run-dir>/adversarial-<peer>.json`. Treat it as one reviewer return with `reviewer: adversarial-<peer>`, exactly like a persona artifact: its merge-tier fields enter Stage 5 dedup/promotion; `why_it_matters` / `evidence` stay on disk.
- Empty `findings` → note "cross-model pass: no additional issues" in Coverage; do not fail.
- Missing or malformed file (peer errored, timed out, or returned non-JSON) → degrade: skip silently for `mode:agent` / `XHOST=codex`; on an interactive host (`claude`/`cursor`) in default mode print one line `cross-model pass unavailable — continuing.` Stage 5's malformed-drop already protects the merge.
- A finding sharing a dedup fingerprint with the in-process `adversarial` persona promotes by one anchor step — the cross-model agreement signal. Name both reviewers in the Reviewer column (e.g. `adversarial, adversarial-codex`).

## Error handling (all non-blocking)

- Auth: stderr mentions auth / login / unauthorized / api key → treat as `not_authed` skip.
- Timeout (codex exit 124 / claude killed): note "cross-model peer timed out (5m)"; continue.
- Codex sandbox with `CODEX_SANDBOX_NETWORK_DISABLED`: the shelled-out `claude` cannot reach the API → failure skip; this is expected, not an error.

## Verified flags (do not change without an empirical re-test)

| Concern | claude `-p` (peer) | codex `exec` (peer) |
|---------|--------------------|---------------------|
| read-only | `--permission-mode dontAsk` + `--disallowedTools "Edit Write NotebookEdit"` (permission-gated, not a hard sandbox) | `-s read-only` (hard sandbox) |
| schema out | `--json-schema "$(cat schema)"` + `--output-format json` -> `.structured_output`, fall back to `.result` | `--output-schema <file>` (best-effort) + `-o <file>` |
| prompt in | `"$(cat prompt)"` argv + `< /dev/null` | `-` on stdin: `< prompt-file` |
| effort/model | `--model opus` | `-c 'model_reasoning_effort="high"'` (pin `-m` if the model rejects `--output-schema`) |
| turn cap | `--max-turns 15` | (wall-clock timeout) |
| no hang | `< /dev/null` | stdin EOF from prompt file |
| parse dep | `jq` (preflighted in Step 2) | none (`-o` writes the file) |
| auth probe | `claude auth status` (exit 0 = authed) | env key or `~/.codex/auth.json` |

`--max-turns` is valid but absent from `claude --help`; confirm flags against the running CLI, not just help text. The whole pass is non-blocking: every gap above degrades to a silent skip, never a failed review.
