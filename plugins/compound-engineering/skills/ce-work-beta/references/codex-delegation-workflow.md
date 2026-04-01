# Codex Delegation Workflow

When `delegation_active` is true, code implementation is delegated to the Codex CLI (`codex exec`) instead of being implemented directly. The orchestrating Claude Code agent retains control of planning, review, git operations, and orchestration.

## Delegation Decision

If `work_delegation_decision` is `ask`, present the recommendation before proceeding.

**When recommending Codex delegation:**

> "Codex delegation active. [N] implementation units -- delegating in one batch."
> 1. Delegate to Codex *(recommended)*
> 2. Execute with Claude Code instead

**When recommending Codex delegation, multiple batches:**

> "Codex delegation active. [N] implementation units -- delegating in [X] batches."
> 1. Delegate to Codex *(recommended)*
> 2. Execute with Claude Code instead

**When recommending Claude Code (all units are trivial):**

> "Codex delegation active, but these are small changes where the cost of delegating outweighs having Claude Code do them."
> 1. Execute with Claude Code *(recommended)*
> 2. Delegate to Codex anyway

If `work_delegation_decision` is `auto` (the default), state the execution plan in one line and proceed without waiting: "Codex delegation active. Delegating [N] units in [X] batch(es)." or "Codex delegation active. All units are trivial -- executing with Claude Code."

## Pre-Delegation Checks

Run these checks **once before the first batch**. If any check fails, fall back to standard mode for the remainder of the plan execution. Do not re-run on subsequent batches.

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
- If `delegation_source` is `local.md` or `default`: set `delegation_active` to false silently.

**2. Availability Check**

```bash
command -v codex
```

If the Codex CLI is not on PATH: emit "Codex CLI not found -- using standard mode." and set `delegation_active` to false.

**3. Consent Flow**

If `consent_granted` is not true (from local.md `work_codex_consent`):

Present a one-time consent warning using the platform's blocking question tool (AskUserQuestion in Claude Code). The consent warning explains:
- Delegation sends implementation units to `codex exec` as a structured prompt
- **yolo mode** (`--yolo`): Full system access including network. Required for verification steps that run tests or install dependencies. **Recommended.**
- **full-auto mode** (`--full-auto`): Workspace-write sandbox, no network access.

Present the sandbox mode choice: (1) yolo (recommended), (2) full-auto.

On acceptance:
- Write `work_codex_consent: true` and `work_codex_sandbox: <chosen-mode>` to `.claude/compound-engineering.local.md` YAML frontmatter
- To write local.md: (1) if file does not exist, create it with YAML frontmatter wrapper; (2) if file exists with valid frontmatter, merge new keys preserving existing keys; (3) if file exists without frontmatter or with malformed frontmatter, prepend a valid frontmatter block and preserve existing body content below the closing `---`
- Update `consent_granted` and `sandbox_mode` in the resolved state

On decline:
- Ask whether to disable delegation entirely for this project
- If yes: write `work_delegate: false` to local.md, set `delegation_active` to false, proceed in standard mode
- If no: set `delegation_active` to false for this invocation only, proceed in standard mode

**Headless consent:** If running in a headless or non-interactive context, delegation proceeds only if `work_codex_consent` is already `true` in local.md. If consent is not recorded, set `delegation_active` to false silently.

## Batching

Delegate all units in one batch. If the plan exceeds 5 units, split into batches at the plan's own phase boundaries, or in groups of roughly 5 -- never splitting units that share files. Skip delegation entirely if every unit is trivial.

## Prompt Template

At the start of delegated execution, generate a short unique run ID (e.g., 8 hex chars from a timestamp or random source). All scratch files for this invocation go under `.context/compound-engineering/codex-delegation/<run-id>/`. Create the directory if it does not exist.

Before each batch, write a prompt file to `.context/compound-engineering/codex-delegation/<run-id>/prompt-batch-<batch-num>.md`.

Build the prompt from the batch's implementation units using these XML-tagged sections:

```xml
<task>
[For a single-unit batch: Goal from the implementation unit.
For a multi-unit batch: list each unit with its Goal, stating the concrete
job, repository context, and expected end state for each.]
</task>

<files>
[Combined file list from all units in the batch -- files to create, modify, or read.]
</files>

<patterns>
[File paths from all units' "Patterns to follow" fields. If no patterns:
"No explicit patterns referenced -- follow existing conventions in the
modified files."]
</patterns>

<approach>
[For a single-unit batch: Approach from the unit.
For a multi-unit batch: list each unit's approach, noting dependencies
and suggested ordering.]
</approach>

<constraints>
- Do NOT run git commit, git push, or create PRs -- the orchestrating agent handles all git operations
- Restrict all modifications to files within the repository root
- Keep changes tightly scoped to the stated task -- avoid unrelated refactors, renames, or cleanup
- Resolve the task fully before stopping -- do not stop at the first plausible answer
- If you discover mid-execution that you need to modify files outside the repo root, complete what you can within the repo and report what you could not do via the result schema issues field
</constraints>

<testing>
Before writing tests, check whether the plan's test scenarios cover all
categories that apply to each unit. Supplement gaps before writing tests:
- Happy path: core input/output pairs from each unit's goal
- Edge cases: boundary values, empty/nil inputs, type mismatches
- Error/failure paths: invalid inputs, permission denials, downstream failures
- Integration: cross-layer scenarios that mocks alone won't prove

Write tests that name specific inputs and expected outcomes. If your changes
touch code with callbacks, middleware, or event handlers, verify the
interaction chain works end-to-end.
</testing>

<verify>
After implementing, run ALL test files together in a single command (not
per-file). Cross-file contamination (e.g., mocked globals leaking between
test files) only surfaces when tests run in the same process. If tests
fail, fix the issues and re-run until they pass. Do not report status
"completed" unless verification passes. This is your responsibility --
the orchestrator will not re-run verification independently.

[Test and lint commands from the project. Use the union of all units'
verification commands as a single combined invocation.]
</verify>

<output_contract>
Report your result via the --output-schema mechanism. Fill in every field:
- status: "completed" ONLY if all changes were made AND verification passes,
  "partial" if incomplete, "failed" if no meaningful progress
- files_modified: array of file paths you changed
- issues: array of strings describing any problems, gaps, or out-of-scope
  work discovered
- summary: one-paragraph description of what was done
</output_contract>
```

## Result Schema

Write the result schema to `.context/compound-engineering/codex-delegation/<run-id>/result-schema.json` once at the start of delegated execution:

```json
{
  "type": "object",
  "properties": {
    "status": { "enum": ["completed", "partial", "failed"] },
    "files_modified": { "type": "array", "items": { "type": "string" } },
    "issues": { "type": "array", "items": { "type": "string" } },
    "summary": { "type": "string" }
  },
  "required": ["status", "files_modified", "issues", "summary"],
  "additionalProperties": false
}
```

Each batch's result is written to `.context/compound-engineering/codex-delegation/<run-id>/result-batch-<batch-num>.json` via the `-o` flag. On plan failure, files are left in place for debugging.

**Known limitation:** `--output-schema` only works with `gpt-5` family models (e.g., `o4-mini`, `gpt-5.4`), not `gpt-5-codex` or `codex-` prefixed models (Codex CLI bug #4181). If the result JSON is absent or malformed after a successful exit code, classify as task failure.

## Execution Loop

Initialize a `consecutive_failures` counter at 0 before the first batch.

**Clean-baseline preflight:** Before the first batch, verify there are no uncommitted changes to tracked files:

```bash
git diff --quiet HEAD
```

This intentionally ignores untracked files. Only staged or unstaged modifications to tracked files make rollback unsafe.

If tracked files are dirty, stop and present options: (1) commit current changes, (2) stash explicitly (`git stash push -m "pre-delegation"`), (3) continue in standard mode (sets `delegation_active` to false). Do not auto-stash user changes.

**Delegation invocation:** For each batch:

1. Write the prompt file using the Prompt Template above
2. Execute the Codex CLI verbatim:

```bash
if [ "$SANDBOX_MODE" = "full-auto" ]; then
  SANDBOX_FLAG="--full-auto"
else
  SANDBOX_FLAG="--yolo"
fi

codex exec \
  $SANDBOX_FLAG \
  --output-schema .context/compound-engineering/codex-delegation/<run-id>/result-schema.json \
  -o .context/compound-engineering/codex-delegation/<run-id>/result-batch-<batch-num>.json \
  - < .context/compound-engineering/codex-delegation/<run-id>/prompt-batch-<batch-num>.md
```

Do not improvise CLI flags or modify this invocation template.

**Result classification:** Codex is responsible for running verification internally and fixing failures before reporting -- the orchestrator does not re-run verification independently.

| # | Signal | Classification | Action |
|---|--------|---------------|--------|
| 1 | Exit code != 0 | CLI failure | Rollback to HEAD. Fall back to standard mode for ALL remaining work. |
| 2 | Exit code 0, result JSON missing or malformed | Task failure | Rollback to HEAD. Increment `consecutive_failures`. |
| 3 | Exit code 0, `status: "failed"` | Task failure | Rollback to HEAD. Increment `consecutive_failures`. |
| 4 | Exit code 0, `status: "partial"` | Partial success | Keep the diff. Complete remaining work locally, verify, and commit. Increment `consecutive_failures`. |
| 5 | Exit code 0, `status: "completed"` | Success | Commit changes. Reset `consecutive_failures` to 0. |

**Rollback procedure:**

```bash
git checkout -- .
git clean -fd -- <paths from the batch's combined Files list>
```

Do NOT use bare `git clean -fd` without path arguments.

**Commit on success:**

```bash
git add <files from result's files_modified>
git commit -m "feat(<scope>): <batch summary>"
```

**Between batches** (plans split into multiple batches): Report what completed, test results, and what's next. Continue immediately unless the user intervenes -- the checkpoint exists so the user *can* steer, not so they *must*.

**Circuit breaker:** After 3 consecutive failures, set `delegation_active` to false and emit: "Codex delegation disabled after 3 consecutive failures -- completing remaining units in standard mode."

**Scratch cleanup:** After the last batch completes:

```bash
rm -rf .context/compound-engineering/codex-delegation/<run-id>/
```

## Mixed-Model Attribution

When some units are executed by Codex and others locally:
- If all units used delegation: attribute to the Codex model
- If all units used standard mode: attribute to the current agent's model
- If mixed: note which units were delegated in the PR description and credit both models
