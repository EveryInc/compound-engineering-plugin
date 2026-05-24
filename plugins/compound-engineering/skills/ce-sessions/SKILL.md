---
name: ce-sessions
description: "Search and ask questions about coding agent session history across Claude Code, Codex, and Cursor. Use when asking what was worked on, what was tried before, how a problem was investigated across sessions, what happened recently, or any question about past agent sessions. Also use when the user references prior sessions, previous attempts, or past investigations — even without saying 'sessions' explicitly."
---

# /ce-sessions

Search session history across Claude Code, Codex, and Cursor and synthesize findings about what was worked on, tried, decided, or learned in prior sessions.

## Usage

```
/ce-sessions [question or topic]
/ce-sessions
```

## Pre-resolved context

**Git branch (pre-resolved):** !`git rev-parse --abbrev-ref HEAD 2>/dev/null || true`

If the line above resolved to a plain branch name (like `feat/my-branch`), use it for branch filtering and pass it to the synthesis subagent. If it still contains a backtick command string or is empty, derive the branch at runtime instead.

**Repo name (pre-resolved):** !`basename "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || true`

If the line above resolved to a plain repo folder name, use it for session discovery. Otherwise derive at runtime.

## Note: 2026

The current year is 2026. Use this when interpreting session timestamps.

## Guardrails

These rules apply at all times during orchestration and synthesis.

- **Never read entire session files into context.** Session files can be 1-7MB. Always use the extraction scripts to filter first, then reason over the filtered output.
- **Never extract or reproduce tool call inputs/outputs verbatim.** Summarize what was attempted and what happened.
- **Never include thinking or reasoning block content.** Claude Code thinking blocks are internal reasoning; Codex reasoning blocks are encrypted. Neither is actionable.
- **Never analyze the current session.** Its conversation history is already available to the caller.
- **Surface technical content, not personal content.** Sessions contain everything — credentials, frustration, half-formed opinions. Use judgment about what belongs in a technical summary and what doesn't.
- **Fail fast on access errors.** If session discovery fails on permissions, report the issue immediately. Do not retry the same operation with different tools or approaches — repeated retries waste tokens without changing the outcome.

## Execution

If no question argument is provided, ask what the user wants to know about their session history. Use the platform's blocking question tool: `AskUserQuestion` in Claude Code (call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded), `request_user_input` in Codex, `ask_user` in Gemini, `ask_user` in Pi (requires the `pi-ask-user` extension). Fall back to asking in plain text only when no blocking tool exists in the harness or the call errors (e.g., Codex edit modes) — not because a schema load is required. Never silently skip the question.

### Step 1 — Determine scan window

Infer a time range from the user's question. Start narrow; widen only if a narrow scan finds nothing relevant.

| Signal | Initial scan window |
|--------|---------------------|
| "today", "this morning" | 1 day |
| "recently", "last few days", "this week", or no time signal | 7 days |
| "last few weeks", "this month" | 30 days |
| "last few months", broad feature history | 90 days |

Claude Code retains session history for ~30 days by default. Wider windows may find nothing on Claude Code unless the user has extended retention.

### Step 2 — Discover sessions and extract metadata

Run the discovery + metadata pipeline (preserving the null-delimited xargs hardening that lets `extract-metadata.py` run in batch mode):

```bash
bash scripts/discover-sessions.sh <repo> <days> | tr '\n' '\0' | xargs -0 python3 scripts/extract-metadata.py --cwd-filter <repo>
```

Each output line is a JSON object describing a session (platform, file, size, ts, session, plus platform-specific fields). The final `_meta` line carries `files_processed` and `parse_errors`.

If the inventory's `_meta` line shows `files_processed: 0`, return "no relevant prior sessions" and stop.

If `parse_errors > 0`, note that some sessions could not be parsed and proceed with what was returned.

To narrow the platform set, add `--platform claude`, `--platform codex`, or `--platform cursor` to the `discover-sessions.sh` invocation. Default to all three.

### Step 3 — Filter and rank

Apply these filters in order to pick the sessions worth deep-diving:

1. **Branch filter (Claude Code only).** Keep sessions where `branch == dispatch_branch` exactly, or where the branch name contains a keyword from the question's topic (e.g., a question about "auth middleware" matches branches `feat/auth-fix`, `chore/auth-refactor`). Codex sessions don't carry `gitBranch` — skip this filter for them.

2. **If the branch filter returned zero sessions, or you're processing Codex sessions:**
   - Derive 2-4 keywords from the question's topic. For "a recent crash in the auth middleware where session-validation rejects valid tokens", derive `auth,middleware,session,token` (or similar).
   - Re-invoke the discovery pipeline with `--keyword K1,K2,...` appended to the `extract-metadata.py` invocation. The script returns sessions with non-zero `match_count` plus per-keyword counts.
   - **If `files_matched: 0`, return "no relevant prior sessions" and stop.** Do not extract anything.
   - If `files_matched > 0`, treat those sessions as candidates. Rank by `match_count`, break ties by per-keyword counts.

3. **Drop sessions outside the scan window.** Use `last_ts` when available, fall back to `ts`. Discard sessions where both fall before the window start.

4. **Exclude the current session** — its conversation history is already available to the caller.

5. **Apply the deep-dive cap.** Take at most **5 sessions total across all platforms**. Narrow by branch-match → `match_count` → file size > 30KB → recency.

6. **Proceed only if at least one session remains after filtering.** Otherwise return "no relevant prior sessions" and stop.

**Note: `gitBranch` is captured at the first user message only.** A session that began on `main` and did substantive work on a feature branch via mid-session `git checkout` records `branch: "main"`. Branch-match returning nothing is not conclusive evidence — that's why the keyword-filter fallback in step 2 is required.

### Step 4 — Set up scratch space

Create a per-run throwaway scratch directory:

```bash
SCRATCH=$(mktemp -d -t ce-sessions-XXXXXX)
```

Capture the absolute path; thread it into Step 5 and Step 6. The OS handles cleanup on session end; an explicit `rm -rf "$SCRATCH"` at the end of Step 7 is harmless and makes intent explicit.

### Step 5 — Extract per-session content (file-mediated)

For each selected session, run the skeleton extractor with `--output` so content writes directly to the scratch file — extraction bytes never round-trip through the orchestrator's tool results:

```bash
python3 scripts/extract-skeleton.py --output "$SCRATCH/<session-id>.skeleton.txt" < <session-file>
```

Stdout receives only a one-line JSON status (`{"_meta": true, "wrote": "...", "bytes": N, ...}`). Capture `bytes` and `parse_errors` from each status line.

**Conditional tail-extract** — if a skeleton terminates mid-investigation (last visible turn is a tool call with no resolution, or the assistant is mid-debugging without a conclusion), re-extract with a `tail` shape:

```bash
python3 scripts/extract-skeleton.py --output "$SCRATCH/<session-id>.skeleton.tail.txt" < <session-file>
```

(The skeleton script does not accept a `tail:N` cap directly; if a tail-only view is needed, post-process the scratch file in shell with `tail -n 50` after extraction. Use this only when the head output suggests the session was truncated mid-investigation.)

**Conditional errors-mode** — for sessions where investigation dead-ends are likely valuable:

```bash
python3 scripts/extract-errors.py --output "$SCRATCH/<session-id>.errors.txt" < <session-file>
```

Use selectively — only when understanding what went wrong adds value. Cursor agent transcripts don't log tool results, so errors-mode produces nothing for Cursor sessions.

### Step 6 — Dispatch synthesis subagent

Dispatch the `ce-session-historian` subagent via the platform's subagent primitive (`Agent` in Claude Code, `spawn_agent` in Codex, `subagent` in Pi via the `pi-subagents` extension). Omit the `mode` parameter so the user's configured permission settings apply. Run on the mid-tier model (e.g., `model: "sonnet"` in Claude Code) — the synthesizer doesn't need frontier reasoning.

The dispatch prompt is the agent's input contract. Pass these fields:

- `problem_topic` — one sentence naming the concrete question. Lift from the user's argument or, if missing, from the answer to the no-arg prompt.
- `scratch_dir` — absolute path to `$SCRATCH`.
- `sessions` — an array of objects, one per extracted session, each with:
  - `path` — absolute path to the skeleton file (and optionally `errors_path` for the errors file when extracted)
  - `platform` — `claude`, `codex`, or `cursor`
  - `branch` — git branch when present (Claude Code only)
  - `cwd` — working directory when present (Codex only)
  - `ts` and `last_ts` — session timestamps
  - `match_count` and `keyword_matches` — when keyword filtering was used
- `output_schema` — the structure the agent's response should follow. Default schema:
  ```
  Structure your response with these sections (omit any with no findings):
  - What was tried before
  - What didn't work
  - Key decisions
  - Related context
  ```
  When the caller (e.g., `ce-compound`) supplies a schema in the skill argument, pass it through verbatim.

Example dispatch shape:

```
Synthesize findings from these prior sessions:

Problem topic: <one-line topic>

Sessions to read (paths in $SCRATCH):
1. /tmp/ce-sessions-XXXX/abc123.skeleton.txt
   platform=claude branch=feat/auth-fix ts=2026-05-01
2. /tmp/ce-sessions-XXXX/def456.skeleton.txt  errors=/tmp/ce-sessions-XXXX/def456.errors.txt
   platform=codex cwd=/Users/.../my-project ts=2026-05-03
...

Output schema:
- What was tried before
- What didn't work
- Key decisions
- Related context

Filter rule: only surface findings directly relevant to this specific problem.
Ignore unrelated work from the same sessions or branches.
```

The agent reads each path via the platform's native file-read tool and returns prose findings. Bulk extraction content lives only in the agent's subagent context — the orchestrator's working state stays at file paths plus small inventory metadata.

### Step 7 — Return findings

Return the synthesizer's output text to the caller verbatim. If discovery or keyword filtering returned zero sessions (Step 2 or Step 3), return the literal string `no relevant prior sessions` instead.

Optionally clean up scratch:

```bash
rm -rf "$SCRATCH"
```

The OS handles cleanup eventually regardless; the explicit cleanup is for readers who expect it.

## Output

When the caller (typically a user typing `/ce-sessions`, or another skill invoking ce-sessions via the platform's skill-invocation primitive) does not specify an output format, include a brief header noting what was searched:

```
**Sessions searched**: [count] ([N] Claude Code, [N] Codex, [N] Cursor) | [date range]
```

Then the synthesizer's prose findings. When the caller supplies a schema, honor it verbatim and omit the default header.

## Time budget

Stop as soon as a complete answer is available. A confident "no relevant prior sessions" within seconds is a complete answer; do not extend the search to fill time. The structural caps in Step 3 (max 5 sessions deep-dived) and Step 5 (conditional tail/errors extraction) bound runtime by construction.

## Error handling

If the discovery pipeline fails (e.g., unreadable home directory, permission failure), surface the error to the caller. Do not substitute git log, file listings, or other sources — this skill's contract is session metadata and synthesis.

If extraction `--output` write fails (disk full, permission), surface a clear error and do not dispatch the synthesizer with partial paths.

If `_meta` reports `parse_errors > 0` from any script, note partial extraction in the dispatch prompt and proceed; the synthesizer flags partial in findings.
