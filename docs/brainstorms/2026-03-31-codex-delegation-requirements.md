---
date: 2026-03-31
topic: codex-delegation
---

# Codex Delegation Mode for ce:work

## Problem Frame

Users running ce:work from Claude Code (or other non-Codex agents) may want to delegate the actual code-writing to Codex. Two motivations: (1) Codex may produce better code for certain tasks, and (2) delegating token-heavy implementation work to Codex conserves tokens on the user's current model.

PR #364 attempted this via a separate `ce-work-beta` skill with prose-based delegation instructions. The agent improvises CLI syntax each run, producing non-deterministic results confirmed as flaky in the PR author's own testing. The root cause: describing Codex CLI invocation in prose lets the agent guess differently every time.

ce-work-beta does have a structured 7-step External Delegate Mode (environment guards, availability checks, prompt file writing, circuit breaker), but the CLI invocation step itself is prose-based, causing the non-determinism. This feature ports the useful structural elements (guards, circuit breaker pattern) while replacing prose invocations with concrete bash templates.

## Delegation Flow

```
/ce:work delegate:codex ~/plan.md
         │
         ▼
┌──────────────────────────┐
│ Parse arguments           │
│ - Extract delegate flag   │
│ - Require plan file       │
│ - Check local.md default  │
│ - Resolution chain:       │
│   flag > local.md > off   │
└────────┬─────────────────┘
         │
         ▼
┌──────────────────────────┐     ┌───────────────────────┐
│ Environment guard         │────>│ Notify if explicit,   │
│ $CODEX_SANDBOX set?       │ yes │ use standard mode     │
│ $CODEX_SESSION_ID set?    │     └───────────────────────┘
└────────┬─────────────────┘
         │ no
         ▼
┌──────────────────────────┐     ┌───────────────────────┐
│ Availability check        │────>│ Fall back to          │
│ command -v codex          │ no  │ standard mode + notify│
└────────┬─────────────────┘     └───────────────────────┘
         │ yes
         ▼
┌──────────────────────────┐     ┌───────────────────────┐
│ Consent + mode selection  │────>│ Ask: disable          │
│ work_codex_consent set?   │ no  │ delegation?           │
│ Show warning + sandbox    │     │ Set local.md          │
│ mode choice (yolo/full-   │     └───────────────────────┘
│ auto). Recommend yolo.    │
│ (headless: require prior) │
└────────┬─────────────────┘
         │ accepted
         ▼
┌──────────────────────────┐
│ Per-unit execution loop   │
│ (SERIAL, not parallel)    │
│ For each implementation   │
│ unit in the plan:         │
│                           │
│ 1. Check unit eligibility │
│    (out-of-repo? trivial?)│
│    -> local if ineligible │
│ 2. Named stash snapshot   │
│ 3. Write prompt + schema  │
│    to .context/compound-  │
│    engineering/codex-      │
│    delegation/             │
│ 4. codex exec w/ flags    │
│ 5. Classify result:       │
│    CLI fail | task fail | │
│    verify fail | success  │
│ 6. Pass: commit, drop     │
│    stash, clean scratch   │
│    Fail: rollback,        │
│          increment ctr    │
│ 7. If 3 consecutive       │
│    failures: fall back    │
│    to standard mode       │
└──────────────────────────┘
```

## Requirements

**Activation and Configuration**

- R1. Codex delegation is an optional mode within ce:work, not a separate skill. ce-work-beta is superseded: its delegation logic is replaced by this feature; its non-delegation features (e.g., Frontend Design Guidance) should be ported to ce:work as a separate concern if valuable. Disposition of ce-work-beta (delete vs. retain without delegation) is a planning decision, not a product decision.
- R2. Delegation is triggered via a resolution chain: (1) per-invocation argument wins, (2) `work_delegate` setting in `.claude/compound-engineering.local.md` is fallback, (3) hard default is `false` (off).
- R3. Canonical activation argument is `delegate:codex`. The skill also recognizes fuzzy variants: `codex mode`, `codex`, `delegate codex`, and similar intent expressions. Agent intent recognition handles the fuzzy matching — the set does not need to be exhaustively enumerated.
- R4. Canonical deactivation argument is `delegate:local`. Also recognizes fuzzy variants like `no codex`, `local mode`, `standard mode`.
- R5. Delegation only applies to structured plan execution. Ad-hoc prompts without a plan file always use standard mode regardless of the delegation setting. When delegation mode is active for a plan, each implementation unit is delegated to Codex by default. The agent may execute a unit locally in standard mode when: (a) the unit explicitly requires modifications outside the repository root, or (b) the unit is trivially small (single-file config change, simple substitution) where delegation overhead exceeds the work. The agent states which mode it's using for each unit before execution.

**Environment Safety**

- R6. When running inside a Codex sandbox (detected by `$CODEX_SANDBOX` or `$CODEX_SESSION_ID` environment variables), delegation is disabled and ce:work proceeds in standard mode. If the user explicitly requested delegation (via argument), emit a brief notification: "Already inside Codex sandbox — using standard mode." If delegation was only enabled via local.md default, proceed silently.
- R7. All delegation logic lives in the skill itself. Converters do not modify skill behavior for cross-platform compatibility — the environment guard handles platform detection at runtime.

**Availability and Fallback**

- R8. Before delegation, check `command -v codex`. If the Codex CLI is not on PATH, fall back to standard mode with a brief notification: "Codex CLI not found — using standard mode."
- R9. No minimum version check for now. If a future CLI change breaks delegation, the invocation fails loudly and the fix is a single bash line update.

**Consent and Mode Selection**

- R10. First time delegation activates in a project, show a one-time consent flow that: (1) explains what delegation does and the security implications, (2) presents the sandbox mode choice with a recommendation, and (3) records the user's decisions. The sandbox modes are:
  - **yolo** (recommended): Maps to `--yolo` (`--dangerously-bypass-approvals-and-sandbox`). Full system access including network. Required for verification steps that run tests or install dependencies. Explain why this is recommended.
  - **full-auto**: Maps to `--full-auto`. Workspace-write sandbox, no network access. Tests/installs that need network will fail. Suitable for pure code-writing tasks without verification dependencies.
- R11. On user acceptance, store `work_codex_consent: true` and `work_codex_sandbox: yolo` (or `full-auto`) in `.claude/compound-engineering.local.md`. Do not show the consent flow again for this project.
- R12. On user decline, ask whether to disable codex delegation entirely. If yes, set `work_delegate: false` in local.md and proceed in standard mode.
- R13. In headless mode, delegation proceeds only if `work_codex_consent` is already `true` in local.md. If not set or `false`, fall back to standard mode silently. Headless runs never prompt for consent and never silently escalate to unsandboxed mode without prior interactive consent.

**Execution Mechanism**

- R14. Delegation uses concrete bash commands, not prose instructions. The exact invocation template:

  ```bash
  # Read sandbox mode from settings (default: yolo)
  if [ "$CODEX_SANDBOX_MODE" = "full-auto" ]; then
    SANDBOX_FLAG="--full-auto"
  else
    SANDBOX_FLAG="--yolo"
  fi

  codex exec \
    $SANDBOX_FLAG \
    --output-schema .context/compound-engineering/codex-delegation/result-schema.json \
    -o .context/compound-engineering/codex-delegation/result-<unit-id>.json \
    - < .context/compound-engineering/codex-delegation/prompt-<unit-id>.md
  ```

  The agent executes this verbatim — no improvisation of CLI syntax.

- R15. Sandbox posture defaults to `yolo` (`--yolo`, shorthand for `--dangerously-bypass-approvals-and-sandbox`) but the user may choose `full-auto` during the consent flow (R10). The choice is stored in `work_codex_sandbox` in local.md. `yolo` is recommended because `--full-auto` blocks network access, which is required for verification steps (running tests, installing dependencies). If `full-auto` is chosen and causes repeated verification failures, the circuit breaker (R18) handles fallback.

- R16. When delegation mode is active, ALL units execute serially — both delegated and locally-executed units. Git stash is a global stack; mixing parallel and serial execution on the same working tree causes stash entanglement. This means delegation mode and swarm mode (Agent Teams) are mutually exclusive. Before each delegated unit, the loop assumes a clean working tree (enforced by ce:work's Phase 1 setup and by mandatory commits after each successful unit). Snapshot the working tree via named stash: `git stash push --include-untracked -m "ce-codex-<unit-id>"`. On failure, rollback via `git checkout -- . && git clean -fd && git stash drop "$(git stash list | grep 'ce-codex-<unit-id>' | head -1 | cut -d: -f1)"`. On success, commit the changes, then drop the named stash.

- R17. The structured prompt template is written to a file at `.context/compound-engineering/codex-delegation/prompt-<unit-id>.md` rather than piped via stdin, to avoid ARG_MAX limits for large CURRENT PATTERNS sections. The template includes: TASK (goal from implementation unit), FILES TO MODIFY (file list), CURRENT PATTERNS (relevant code context), APPROACH (from implementation unit), CONSTRAINTS (no git commit, restrict modifications to files within the repository root, scoped changes, line limit, mandatory result reporting), and VERIFY (test/lint commands). Prompt files are cleaned up after each successful unit.

- R18. A consecutive failure counter tracks delegation failures. After 3 consecutive failures, the skill falls back to standard mode for remaining units with a notification.

- R19. Failure classification uses a multi-signal approach. `codex exec` returns exit code 0 even when the task fails — the exit code only reflects CLI infrastructure, not task success.

  | Category | Signal | Action |
  |---|---|---|
  | **CLI failure** | Exit code != 0 | Hard failure — fall back to standard mode |
  | **Result absent** | Exit code 0, result JSON missing or malformed | Count as task failure |
  | **Task failure** | Exit code 0, result schema `status: "failed"` | Count toward circuit breaker, rollback |
  | **Task partial** | Exit code 0, result schema `status: "partial"` | Keep changes, report gaps to main agent |
  | **Verify failure** | Exit code 0, `status: "completed"`, VERIFY fails | Count toward circuit breaker, rollback |
  | **Success** | Exit code 0, `status: "completed"`, VERIFY passes | Commit, drop stash, continue |

- R20. A result schema file is written alongside the prompt file. Codex is instructed via `--output-schema` to produce structured JSON conforming to this schema. The `-o` flag writes the result to `result-<unit-id>.json`. The schema:

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

  The prompt CONSTRAINTS section includes mandatory result reporting instructions telling Codex it MUST fill in the schema honestly: `status: "completed"` only if all changes were made, `"partial"` if incomplete, `"failed"` if no meaningful progress. Known limitation: `--output-schema` only works with `gpt-5` family models, not `gpt-5-codex` or `codex-` prefixed models (Codex CLI bug #4181). If the result JSON is absent or malformed, classify as task failure.

- R21. The prompt constraint tells Codex to restrict all modifications to files within the repository root. If Codex discovers mid-execution that it needs to modify files outside the repo root, it should complete what it can within the repo and report what it couldn't do via the result schema `issues` field. The main agent then handles the out-of-repo work in standard mode. Out-of-repo changes cannot be detected or rolled back by git stash — this is an accepted risk mitigated by the prompt constraint and per-unit pre-screening (R5).

**Settings in compound-engineering.local.md**

- R22. New YAML frontmatter keys in `.claude/compound-engineering.local.md`:
  - `work_delegate`: `codex`/`false` (default: `false`) — delegation target when enabled
  - `work_codex_consent`: `true`/`false` — whether the user has completed the one-time consent flow
  - `work_codex_sandbox`: `yolo`/`full-auto` (default: `yolo`) — sandbox posture for codex exec

## Success Criteria

- Codex successfully implements implementation units from ce:plan output across a variety of task types (new features, bug fixes, refactors)
- CLI invocations are deterministic — no agent improvisation of shell syntax across runs
- Delegation activates only when explicitly requested (argument or local.md), only with a plan file, and never when running inside Codex
- Failed delegation rolls back cleanly via named git stash without corrupting tracked repository files
- The result schema provides reliable signal for success/failure classification
- Users who never enable delegation experience zero change in ce:work behavior

## Scope Boundaries

- **Not a separate skill.** ce-work-beta is superseded. This modifies ce:work directly.
- **No app-server integration.** We use bare `codex exec`, not the codex-companion.mjs app server or the codex plugin's rescue skill. The delegation pattern is fire-prompt -> wait -> inspect-result, which is exactly what `codex exec` provides.
- **No ad-hoc delegation.** Delegation only applies to structured plan execution with a plan file. Bare prompts without plans always use standard mode.
- **No minimum version gating.** Added later if a breaking CLI change actually occurs.
- **No periodic re-consent.** One acceptance per project. Version-gated or calendar-based re-consent can be added later if needed.
- **No converter changes.** The skill handles platform detection internally via environment variable checks.
- **No out-of-repo detection.** Git stash cannot protect files outside the repo. Defense is prompt constraint + per-unit pre-screening, not post-execution validation.
- **No timeout for v1.** Neither `codex exec` nor the most mature codex integration (osc-work) implements timeouts. Added later if users report hung processes.

## Key Decisions

- **Modify ce:work, not a separate skill**: Avoids skill proliferation. Users stay in their existing workflow. ce-work-beta's delegation section is superseded; its structural patterns (guards, circuit breaker) are ported.
- **`delegate:codex` namespace, not `mode:codex`**: Existing `mode:` tokens describe interaction style (headless, autofix). Delegation describes execution target. Separate namespace avoids semantic overloading.
- **Bare `codex exec` over app-server**: App server offers structured output and thread management, but requires fragile path discovery into another plugin's versioned install directory. `codex exec` is one line of bash, works identically in subagents, and does exactly what fire-and-wait delegation needs.
- **User-selected sandbox mode (yolo default, full-auto option)**: yolo is recommended because `--full-auto` blocks network access needed for test/lint commands. But users who prefer sandboxed execution can choose `full-auto`, accepting that verification may fail. The circuit breaker handles repeated failures.
- **One-time consent with mode selection**: Consent is about informed awareness, not ongoing compliance. The sandbox mode choice is part of the consent flow and persisted in local.md.
- **Per-unit delegation eligibility, not all-or-nothing**: Default is to delegate all units, but the agent pre-screens units that need out-of-repo access or are trivially small. This avoids delegating work that can't succeed in the unsandboxed environment and reduces overhead for trivial changes.
- **Prompt file over stdin**: Writing prompts to `.context/compound-engineering/codex-delegation/` avoids ARG_MAX limits, provides debugging artifacts on failure, and follows the repo's scratch space convention.
- **Complete-and-report over error-and-rollback**: When Codex discovers it needs out-of-repo access mid-execution, it completes in-repo changes and reports what it couldn't do. Preserves useful work rather than wasting it.
- **Plan-only delegation**: Ad-hoc prompts use standard mode. Delegation requires the structured plan decomposition to build effective prompts and provide meaningful implementation units.
- **Serial execution for all units when delegation is active**: Git stash is a global stack. Mixing parallel and serial execution causes stash entanglement. When delegation mode is on, all units (including locally-executed ones) run serially. This makes delegation mode and swarm mode (Agent Teams) mutually exclusive — a deliberate tradeoff of parallelism for the ability to use Codex.
- **`--output-schema` for result classification**: `codex exec` returns exit code 0 even on task failure. The structured result schema combined with VERIFY commands provides reliable success/failure signal. Prompt-enforced honest reporting plus cross-validation with VERIFY catches model misreporting.
- **No timeout for v1**: `codex exec` has no built-in timeout, and the most mature integration (osc-work) doesn't implement one either. Added if users report hung processes.

## Dependencies / Assumptions

- Codex CLI `exec` subcommand with `--yolo`, `--full-auto`, `--output-schema`, `-o`, and `-m` flags remains stable
- `--output-schema` works with `gpt-5` family models. Known bug #4181 breaks it for `gpt-5-codex` / `codex-` prefixed models — delegation should use `gpt-5` family models (e.g., `o4-mini`, `gpt-5.4`)
- `$CODEX_SANDBOX` and `$CODEX_SESSION_ID` environment variables continue to be set when running inside Codex
- `.claude/compound-engineering.local.md` YAML frontmatter reading/writing infrastructure must be built as part of this work — no existing skill currently reads or writes these keys. This is a prerequisite, not an assumption.

## Outstanding Questions

### Deferred to Planning

- [Affects R17][Needs research] What is the optimal prompt template structure for maximizing Codex code quality? The printing-press skill provides one template; the codex plugin's prompting skill (`gpt-5-4-prompting`) may offer insights on how to structure prompts for Codex/GPT models specifically.
- [Affects R14][Technical] Where exactly in ce:work's Phase 2 task execution loop does the delegation branch? Need to read the current task-worker dispatch logic to identify the cleanest insertion point.
- [Affects R18][Technical] Should the circuit breaker (3 consecutive failures) reset per-unit or persist across the entire plan execution? Per-unit is more forgiving; per-plan is more conservative.
- [Affects R22][Technical] How does the agent parse `.claude/compound-engineering.local.md` YAML frontmatter at runtime? Is there an existing utility or must the skill instruct the agent to parse it directly via bash?
- [Affects R20][Needs testing] How reliably does `--output-schema` constrain Codex's final response? Need to test with representative implementation prompts to validate the result classification approach. Use `--ephemeral` flag during testing to avoid session file clutter (production invocations do not use `--ephemeral` — session persistence is valuable for debugging).
- [Affects R20][Technical] Fallback behavior when `--output-schema` fails (wrong model family, malformed output): define the exact classification logic when the result JSON is absent.

## Next Steps

-> `/ce:plan` for structured implementation planning
