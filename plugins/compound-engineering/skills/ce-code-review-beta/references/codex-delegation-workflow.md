# Codex Delegation Workflow (Code Review)

When `delegation_active` is true, mid-tier persona reviewers are delegated to the Codex CLI (`codex exec`) instead of the orchestrating agent's subagent primitive. The orchestrator retains control of scope detection, intent discovery, reviewer selection, merge/dedup, validation, synthesis, and all post-review fix/handoff work.

This workflow runs **only the persona reviewer dispatch step**. Everything before Stage 4 and everything from Stage 5 onward stays identical to `ce-code-review`.

## Reviewer Lane Split

Before executing this workflow, the orchestrator has already partitioned the reviewer team into two lanes (see SKILL.md Stage 4 Spawning):

- **Local lane** -- always run as in-platform subagents:
  - High-stakes (session model): `ce-correctness-reviewer`, `ce-security-reviewer`, `ce-adversarial-reviewer`
  - Unstructured-output agents (return prose / checklists, not findings JSON): `ce-agent-native-reviewer`, `ce-learnings-researcher`, `ce-schema-drift-detector`, `ce-deployment-verification-agent`
- **Delegated lane** -- run via this workflow: every other persona reviewer selected in Stage 3 (the always-on `ce-testing-reviewer`, `ce-maintainability-reviewer`, `ce-project-standards-reviewer`, plus any cross-cutting and stack-specific conditionals selected for the diff)

Both lanes dispatch concurrently. **Stage 5 merge does not begin until every reviewer in both lanes is terminal** (succeeded with a result OR classified as failed). The orchestrator maintains a per-reviewer status map and verifies all entries are terminal before entering merge — partial early-merge would silently drop slow reviewers.

Persona content for delegated reviewers is resolved in SKILL.md Stage 3c before this workflow runs. The orchestrator hands resolved persona content to this workflow as `{persona_content}` per the prompt template.

## Delegation Decision

If `review_delegate_decision` is `ask`, present the recommendation and wait for the user's choice before proceeding.

**When recommending Codex delegation:**

> "Codex delegation active. [N] mid-tier reviewers will be delegated; [M] high-stakes reviewers stay on the session model."
> 1. Delegate mid-tier to Codex *(recommended)*
> 2. Run all reviewers locally instead

If the user chooses local, set `delegation_active` to false and return to standard Stage 4 dispatch.

If `review_delegate_decision` is `auto` (the default), state the execution plan in one line and proceed without waiting: "Codex delegation active. Delegating [N] mid-tier reviewers; [M] stay local."

## Pre-Delegation Checks

Run these checks **once before dispatch**. If any check fails, fall back to standard subagent dispatch for **all** reviewers in this run. Do not partially delegate when checks fail.

**0. Platform Gate**

Codex delegation is only supported when the orchestrating agent is running in Claude Code. If the current session is Codex, Gemini CLI, OpenCode, or any other platform, set `delegation_active` to false and proceed in standard mode.

**1. Environment Guard**

Check whether the current agent is already running inside a Codex sandbox:

```bash
if [ -n "$CODEX_SANDBOX" ] || [ -n "$CODEX_SESSION_ID" ]; then
  echo "inside_sandbox=true"
else
  echo "inside_sandbox=false"
fi
```

If `inside_sandbox` is true, delegation would recurse or fail.

- If `delegation_source` is `argument`: emit "Already inside Codex sandbox -- using standard mode." and set `delegation_active` to false.
- If `delegation_source` is `config` or `default`: set `delegation_active` to false silently.

**2. Availability Check**

**Codex CLI path (pre-resolved):**
!`command -v codex 2>/dev/null || true`

If the line above shows an absolute path (starts with `/`, e.g., `/opt/homebrew/bin/codex`), the Codex CLI is available — proceed to the next check.
Otherwise — empty, an unresolved command string, or any other non-path value — run `command -v codex` via the Bash tool to verify at runtime. If that prints an absolute path, the Codex CLI is available; proceed. If it fails or prints nothing, emit "Codex CLI not found (install via `npm install -g @openai/codex` or `brew install codex`) -- using standard mode." and set `delegation_active` to false.

**3. Consent Flow**

If `consent_granted` is not true (from config `review_delegate_consent`):

Present a one-time consent prompt using the platform's blocking question tool (`AskUserQuestion` in Claude Code; this workflow only runs in Claude Code per Pre-Delegation Check 0). Stem: `Delegate persona reviewers to codex exec in read-only sandbox?` Two options: (1) Yes — enable delegation for this project, (2) No — disable delegation.

The consent prompt's accompanying explanation covers:
- Delegation sends each persona's review prompt to `codex exec` along with the diff, intent summary, and resolved persona file content (from SKILL.md Stage 3c). The delegated process returns findings JSON via the structured-output channel; no project files are written by Codex itself.
- The sandbox is hardcoded to `-s read-only`. Codex's read-only sandbox lets the model run shell commands but blocks write/modify access to the workspace. Empirically permits read-oriented git/gh commands (`git diff`, `git blame`, `gh pr view`) for evidence gathering.
- The other Codex sandbox modes (`workspace-write`, `danger-full-access`, and `--dangerously-bypass-approvals-and-sandbox`) are intentionally NOT offered for review delegation. Persona reviewers are read-only by contract — they don't edit project files, run tests, build, or touch network resources. Read-only covers 100% of documented persona behavior; broader sandboxes would be footguns with no defensible review use case. (`ce-work-beta` offers them because plan execution needs network and writes; review has neither requirement.)

On acceptance:
- Resolve the repo root: `git rev-parse --show-toplevel`. Write `review_delegate_consent: true` to `<repo-root>/.compound-engineering/config.local.yaml`
- To write: (1) if file or directory does not exist, create `<repo-root>/.compound-engineering/` and write the YAML file; (2) if file exists, merge new keys preserving existing keys
- Update `consent_granted` in the resolved state

On decline:
- Ask whether to disable delegation entirely for this project
- If yes: write `review_delegate: false` to `<repo-root>/.compound-engineering/config.local.yaml`. Set `delegation_active` to false, proceed in standard mode
- If no: set `delegation_active` to false for this invocation only, proceed in standard mode

**Headless and report-only mode handling:**
- **`mode:report-only`**: If `delegation_active` is true on entry, set it to false silently and continue in standard mode. Report-only's no-artifact contract is incompatible with the delegation workflow's mandatory scratch and artifact writes. Note the suppression in Coverage so the user sees that `delegate:codex` was overridden by `mode:report-only`.
- **`mode:headless`** with explicit `delegate:codex` argument and no recorded consent: **fail fast** with `Review failed (headless mode). Reason: delegate:codex requested but review_delegate_consent not recorded. Run interactive ce-code-review-beta once to grant consent, or omit delegate:codex.` Do not silently fall back — a programmatic caller needs a machine-readable signal that its argument was ignored.
- **`mode:headless`** with `delegate:codex` argument AND recorded consent: proceed normally; surface the lane split in Coverage.
- **`mode:autofix`**: delegation proceeds normally. Autofix's no-question rule applies to the post-review fix loop, not to delegation pre-checks; consent must already be recorded for autofix runs to delegate.

## Per-Reviewer Prompt File

At the start of delegated dispatch, create a per-run OS-temp scratch directory via `mktemp -d` and capture its **absolute path** for all downstream use. All prompt and result files for this invocation live under that directory. Do not use `.context/` — these scratch files are per-run throwaway, matching the repo Scratch Space convention for one-shot artifacts.

```bash
SCRATCH_DIR="$(mktemp -d -t ce-code-review-codex-XXXXXX)"
echo "$SCRATCH_DIR"
```

Refer to the echoed absolute path as `<scratch-dir>` throughout the rest of this workflow.

For each delegated reviewer, write a prompt file to `<scratch-dir>/prompt-<reviewer-name>.md`. The prompt is the same review-context bundle the local lane receives, formatted as the existing subagent template (see `references/subagent-template.md`) with `{run_id}` left empty so the delegated process does NOT attempt to write the per-agent artifact file. The orchestrator writes the artifact from the returned JSON after the run (see "Compact Split After Return" below).

```xml
<task>
You are a specialist code reviewer running as a delegated process. Read the persona, scope rules, and output contract, then review the diff and return findings as JSON conforming to the schema.
</task>

<persona>
{persona_content}
</persona>

<scope-rules>
{diff_scope_rules}
</scope-rules>

<output-contract>
{output_contract}
</output-contract>

<pr-context>
{pr_metadata}
</pr-context>

<review-context>
Reviewer name: {reviewer_name}

Intent: {intent_summary}

Changed files: {file_list}

Diff:
{diff}
</review-context>

<constraints>
- Do NOT edit project files. You are operationally read-only.
- Do NOT run git mutations (commit, push, checkout, branch). The orchestrator handles git.
- Do NOT run project test or build commands. Review the diff statically.
- Read-oriented git/gh commands (git diff, git show, git blame, git log, gh pr view) are allowed for evidence gathering — the read-only sandbox permits them.
- Restrict any file reads to within the repository root.
- Return the FULL findings JSON (all schema fields including why_it_matters and evidence). The orchestrator partitions into compact and detail tiers itself.
</constraints>
```

**Variable substitution at orchestration time:**

| Variable | Source |
|----------|--------|
| `{persona_content}` | Stage 3c resolved persona file body (frontmatter stripped). If Stage 3c did not run or returned empty, treat as a configuration error and classify the reviewer as failed — do NOT dispatch with an empty `<persona>` block. |
| `{diff_scope_rules}` | Full content of `references/diff-scope.md` |
| `{output_contract}` | Full content of `references/subagent-template.md` output-contract section. Modify exactly one line: replace the "Artifact file (when run ID is present)" step with "Skip artifact-file writing — the orchestrator writes the artifact from your returned JSON after the run. Return the FULL JSON via --output-schema, including why_it_matters and evidence." |
| `{pr_metadata}` | Stage 1 PR metadata (title, body, URL) when available; empty string otherwise |
| `{reviewer_name}` | The persona's name (e.g., `kieran-rails`) — used as the artifact filename stem and result filename |
| `{intent_summary}` | Stage 2 intent summary |
| `{file_list}` | Stage 1 changed-files list |
| `{diff}` | Stage 1 unified diff |

The output-contract content is loaded from this skill's `references/subagent-template.md`. Do not attempt to load files from outside the skill directory.

## Result Schema

Write the result schema to `<scratch-dir>/result-schema.json` once at the start of delegated dispatch. The schema is the **full** findings schema from `references/findings-schema.json` — Codex returns the full artifact-tier shape (including `why_it_matters` and `evidence`); the orchestrator does the compact split itself.

Pass the schema as `--output-schema <scratch-dir>/result-schema.json` on every `codex exec` invocation.

Each delegated reviewer's result is written to `<scratch-dir>/result-<reviewer-name>.json` via the `-o` flag. Files are left in place after the run for debugging; OS temp handles eventual cleanup.

If the result JSON is absent or malformed after a successful exit code, classify as reviewer failure (see Result classification below).

## Dispatch Loop

The delegated lane and local lane dispatch concurrently, but the delegated lane uses a **preflight-then-fanout** pattern, not pure parallel-from-the-start. The orchestrator should:

1. Kick off all local-lane subagents through the standard bounded scheduler.
2. **Preflight one delegated reviewer first.** Pick any delegated reviewer (deterministic choice: alphabetically first by name). Launch and poll it through Steps A and B below. If it succeeds, proceed to step 3. If it fails (either CLI failure or reviewer failure), set `delegation_active` to false for the remainder of this run, re-dispatch that reviewer plus all other delegated reviewers through the standard local subagent path, and emit: "Codex preflight failed -- delegation disabled, all reviewers running locally." Reason: when codex auth is broken, config is wrong, or the model name is unrecognized, every parallel launch fails the same way; preflight catches that with one failure cost instead of N.
3. **Fan out the remaining delegated reviewers in parallel.** Run Step A (launch) for every remaining delegated reviewer. The dispatch is independent across reviewers — no batching, no shared state.
4. **Poll all outstanding reviewers concurrently.** Issue a polling Bash call (Step B) per outstanding reviewer; reviewers may finish in any order. Update the per-reviewer status map (`pending` / `succeeded` / `failed`) as each terminates.
5. **Barrier before Stage 5.** Verify every reviewer in both lanes has a terminal status (`succeeded` or `failed`) before merging. The orchestrator does not enter Stage 5 while any reviewer is `pending`. A local-lane reviewer that completes early waits.

**Step A — Launch (background, separate Bash call per reviewer):**

```bash
codex exec \
  -s read-only \
  --output-schema "<scratch-dir>/result-schema.json" \
  -o "<scratch-dir>/result-<reviewer-name>.json" \
  - < "<scratch-dir>/prompt-<reviewer-name>.md"
```

The sandbox is hardcoded to `read-only`. Persona reviewers do not write project files, run tests, build, or touch network resources — read-only covers all documented behavior and the consent flow does not offer alternatives (see Consent Flow above for the rationale). If a future reviewer persona genuinely requires writes, introduce a `review_delegate_sandbox` config key and consent option at that time, with the use case attached.

**Conditional flags** — only include each line when the corresponding skill-state value is set:

- If `delegate_model` is set, insert `  -m "<delegate_model>" \` as a line before the `-s` flag.
- If `delegate_effort` is set, insert `  -c 'model_reasoning_effort="<delegate_effort>"' \` as a line before the `-s` flag.

When either value is unset, omit its line entirely — Codex resolves the default from the user's `~/.codex/config.toml`.

Critical: `run_in_background: true` must be set as a **Bash tool parameter** so the call returns immediately and has no timeout ceiling. A shell `&` suffix in a foreground call still hits the 2-minute default timeout.

Quoting is critical for the `-c` flag when present: use single quotes around the entire key=value and double quotes around the TOML string value inside. Example: `-c 'model_reasoning_effort="high"'`.

Do not improvise CLI flags or modify this invocation template beyond the documented conditional insertions. The codex CLI flag surface as of 0.128.0: `-s`/`--sandbox`, `-m`/`--model`, `-c`/`--config`, `--output-schema`, `-o`/`--output-last-message`, `--dangerously-bypass-approvals-and-sandbox`. Earlier presets `--full-auto` and `--yolo` are NOT current flags; do not emit them.

**Step B — Poll (foreground, separate Bash calls):**

After each launch call returns, make a separate foreground Bash tool call that polls for that reviewer's result file. Reviewers may finish in any order; poll all outstanding ones in parallel by issuing one polling command per reviewer.

The polling cap is configurable via `review_delegate_timeout_seconds` (default 900s = 15 minutes per reviewer). High-effort reasoning on large diffs can run 5-10 minutes; the default has headroom for slow first-launch model loads.

```bash
RESULT_FILE="<scratch-dir>/result-<reviewer-name>.json"
TIMEOUT_SECS="<review_delegate_timeout_seconds, default 900>"
ROUND_SECS=60
ROUNDS_PER_CALL=6   # 6 × 10s = 60s per Bash call, returns to orchestrator for status update
SLEEP_SECS=10

for i in $(seq 1 "$ROUNDS_PER_CALL"); do
  test -s "$RESULT_FILE" && echo "DONE" && exit 0
  sleep "$SLEEP_SECS"
done
echo "Waiting for Codex..."
```

After each Bash call, the orchestrator checks elapsed time against `review_delegate_timeout_seconds`. If elapsed exceeds the timeout, classify as CLI failure (treat as hung). Otherwise issue another polling command. The shorter per-call window (60s instead of multi-minute) keeps the orchestrator's status map fresh without blocking a single Bash call for the full timeout.

**Polling termination conditions:**

- **Result file appears** -- proceed to result classification normally.
- **Background process exits with non-zero code** -- classify as CLI failure for this reviewer (see below).
- **Background process exits with zero code but result file is absent** -- classify as reviewer failure.
- **Cumulative elapsed time exceeds `review_delegate_timeout_seconds`** without the result file appearing and without a background process notification -- treat as a hung process. Classify as CLI failure for this reviewer.

## Result Classification

| # | Signal | Classification | Action |
|---|--------|---------------|--------|
| 1 | Exit code != 0 | CLI failure | Mark this reviewer as failed in Stage 5 Coverage. Increment `consecutive_failures`. |
| 2 | Exit code 0, result JSON missing or malformed | Reviewer failure | Mark failed in Coverage. Increment `consecutive_failures`. |
| 3 | Exit code 0, result JSON present and schema-valid | Success | Pass JSON to Stage 5 merge unchanged (after compact split). Reset `consecutive_failures` to 0. |

Reviewer failure does NOT roll back any work — there is nothing to roll back; persona reviewers are read-only. The merge pipeline simply runs with one fewer reviewer's findings, the same way it would handle a local-lane reviewer that timed out.

## Compact Split After Return

When a delegated reviewer succeeds, the result JSON contains the full artifact-tier finding shape (with `why_it_matters` and `evidence`). The orchestrator does the compact split itself, in this exact order — never reverse:

1. **Validate** the returned JSON against `references/findings-schema.json`. If invalid (top-level shape wrong, required per-finding fields missing, enum violations), classify as reviewer failure per the Result Classification table. Do not write the artifact for invalid returns.
2. **Write the full JSON** to `/tmp/compound-engineering/ce-code-review/<run-id>/<reviewer-name>.json` — the same path persona subagents would write to via the artifact contract. Headless detail-enrichment (SKILL.md Stage 6) reads detail-tier fields from this file; writing the stripped version would silently empty the `Why:` and `Evidence:` lines in headless output.
3. **Build the compact return** for Stage 5 by stripping `why_it_matters` and `evidence` from each finding. Top-level fields (`reviewer`, `findings`, `residual_risks`, `testing_gaps`) pass through unchanged.
4. **Pass the compact JSON** to Stage 5 merge alongside compact returns from the local-lane reviewers.

Reversing steps 2 and 3 is a silent failure mode — the validate→write-full→strip→merge order is load-bearing.

## Circuit Breaker

The preflight gate (Dispatch Loop step 2) handles the most common failure cascade: if codex is misconfigured at the platform level, preflight catches it with one failure cost. The circuit breaker handles the residual case where intermittent reviewer failures accumulate after preflight succeeded.

Track `consecutive_failures` across delegated reviewers within this run. Reset to 0 on every success. After 3 consecutive failures, set `delegation_active` to false for the **remainder of this run only**, re-dispatch any reviewers still in `pending` state through the standard local subagent path, and emit: "Codex delegation disabled after 3 consecutive failures -- remaining reviewers running locally."

Reviewers that already succeeded keep their results — their artifacts are already on disk and their compact returns are already in the merge queue. The breaker only affects pending and not-yet-launched reviewers.

Per-run state; the next invocation starts fresh.

This is per-run; the next invocation of `ce-code-review-beta` starts fresh with `consecutive_failures` reset.

## Scratch Cleanup

No explicit cleanup needed — OS temp handles eventual cleanup (macOS `$TMPDIR` periodic purge; Linux/WSL `/tmp` reboot or periodic cleanup). Leaving `<scratch-dir>` in place after the run preserves intermediate artifacts for debugging.

## Mixed-Model Attribution

When some reviewers ran on Codex and others ran locally:
- Stage 6 Coverage section should note which reviewers ran on which lane (e.g., `"kieran-rails (codex)"` vs `"kieran-rails (sonnet)"`)
- This helps the user evaluate review quality differences between lanes during the beta and decide whether to keep delegation enabled
