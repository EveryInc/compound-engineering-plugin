---
name: ce-work
description: Execute a plan or concrete work prompt end-to-end. Use when implementing from a plan document, a spec path, or a clear build request; use ce-debug for open-ended bugs. Standalone use owns the shipping tail; outer orchestrators pass `mode:return-to-caller [implementation_engine:<compact-json>] [implementation_run:<safe-id>] <plan path>` for implementation, recovery, and local verification only.
argument-hint: "[Plan path, work description, or recovery request with run id; blank uses latest] | [mode:return-to-caller [implementation_engine:<compact-json>] [implementation_run:<safe-id>] <plan path> for outer orchestrators]"
---

# Work Execution Command

## Setup

Run this once at the start of this invocation, before any subagent dispatch, and follow the directives it prints — except where one conflicts with this skill's own rules on asking the user questions, whether those rules are scoped to a non-interactive mode or apply in every mode, in which case this skill's rules win and no blocking question is asked. Run the fence exactly as written, as its own command: do not pipe or filter it (no `head`, `tail`, or `grep`), do not truncate its output, and do not bundle it into a batch with other commands. Its output opens with a `=== skill context` header and ends with `CE_CONTEXT_END`; if you received one of those lines without the other, the output was truncated — rerun the fence verbatim once. That recovery is the only rerun: otherwise do not rerun it within the same invocation; a later invocation of this or any other skill runs its own. If no Node runtime is available the skill proceeds unchanged.

```bash
SKILL_DIR="<absolute path of the directory containing the SKILL.md you just read>";
NODE="$(for c in node nodejs; do command -v "$c" >/dev/null 2>&1 && "$c" -e '' >/dev/null 2>&1 && { echo "$c"; break; }; done)";
if [ -n "$NODE" ]; then
"$NODE" "$SKILL_DIR/scripts/context.mjs" || echo "context script failed; continue with the skill's normal behavior";
else
echo "no Node runtime; continue with the skill's normal behavior";
fi
```

## Outcome

- **Result:** A fully implemented, locally verified change set from a plan, specification, or concrete work prompt.
- **Next consumer:** In standalone use, the shipping workflow takes the verified change through review and delivery. In Return-to-Caller Mode, the invoking workflow receives the structured implementation and verification envelope and owns its remaining gates.
- **Done:** Every in-scope task is complete, required verification evidence is recorded, relevant checks pass, and the run reaches either its owned shipping handoff (with a code-review receipt or explicit skip phrase — see Phase 3-4), a complete return envelope, or an explicit blocker.
- **Intent:** Finish the requested feature without renegotiating the plan or transferring canonical integration authority. Workers receive bounded units; the host orchestrator inspects actual changes and owns authoritative verification and canonical commits.

## Input Document

The **input document** for this run is the input this skill was invoked with — present in the current prompt or conversation, whether the user provided it directly or a calling skill passed it (e.g. `lfg` in `mode:pipeline`, which passes a plan path). It may be a plan or spec path, a `mode:` token followed by a path, or a bare work prompt. The rest of this skill refers to it as `<input_document>`; if nothing was provided, treat `<input_document>` as blank.

Invocation origin is not observable or relevant: apply the same source-resolution rules whether the user invoked `ce-work` explicitly or the host selected it automatically.

## Artifact Root

This skill discovers plans under `<root>/plans/`. Resolve `<root>` when you first compose a `<root>/` path (per the block below), never before you need it. A write to `<root>/...` and a read of `<root>/solutions/` both count as composing a `<root>/` path, so either one triggers resolution; only a run that touches no `<root>/` path at all -- a scratch-only or no-repo flow -- skips it; pass the resolved path to any subagent, not the config.

<!-- ce-docs-root:start -->
**Resolve the CE artifact root `<root>` before composing any artifact path.**

- **Read** `docs_root` from `<repo-root>/.compound-engineering/config.yaml` only (`<repo-root>` = `git rev-parse --show-toplevel`). Do not read it from `config.local.yaml`. Unset -> `<root>` is `docs`, exactly as before.
- **Validate** a set value: a repo-relative directory whose real, symlink-resolved path stays inside the repo and is neither the repo root nor under `.git/`. Otherwise stop with an error naming `docs_root` and the value -- never fall back to `docs`.
- **Use** `<root>` as the sole artifact location: create it if absent, compose each path as `<root>/<subdir>` with this skill's own subdirectory, and never also read `docs`.
<!-- ce-docs-root:end -->

## Execution Workflow

**Bundled reference loading is fail-closed.** Resolve every bundled reference or script path named below from this skill's loaded `SKILL.md` directory, using the skill full path supplied by the harness; never glob the target repository to find a bundled file. If the harness does not expose that directory or a required file cannot be read, stop before the action governed by it and report the missing reference instead of approximating the protocol or continuing natively.

**Repository workspace availability.** Repo-local implementation writes require a writable checkout. Before treating the current working directory as the project, confirm it is a git checkout you can edit. If this session has no writable checkout, but the user named a repository and the harness exposes a remote repo-work surface with a writable checkout, run the implementation work on that surface and treat that checkout as the canonical workspace for verification, commits, and handoff. Otherwise skip repo-local writes and report that no writable checkout is available; do not synthesize file changes from a non-repo scratch directory.

### Phase 0: Input Triage

**Recovery activation comes first.** Before normal plan, path, blank-input, or bare-prompt classification, interpret whether the user is semantically asking to resume, inspect status, reap, or clean up an existing external implementation run and has supplied its run id. This is intent recognition, not verb-only matching. Validate the id with the controller's safe-id contract: `^[A-Za-z0-9._-]{1,128}$` and at least one non-period character. When this direct recovery intent is present, read `references/cross-model-execution.md`, use that run id as authoritative for the requested controller operation, and return the observed state or blocker. Recovery must not dispatch a new worker, select a new route, fall through to latest-plan discovery, or run either shipping tail. When every unit is already cleaned, **completed recovery is read-only reconciliation**: Do not rerun test, build, format, install, generation, or `verify-run`; report the stored unit and plan-wide verification receipts. If recovery intent is clear but the run id is missing, request the id instead of guessing or classifying the text as new work.

**Otherwise, parse a leading mode token.** If `<input_document>` begins with `mode:return-to-caller` (or the legacy aliases `mode:caller-owned-tail` / `caller:lfg`), strip that token before anything else and enter **Return-to-Caller Mode** (see § Return-to-Caller Mode) — implement and locally verify only, then return the structured envelope instead of running the standalone shipping tail. Before the plan path, accept up to two optional carriers in this fixed order: first one compact JSON object prefixed exactly `implementation_engine:`, then one run id prefixed exactly `implementation_run:`. The engine object remains the typed caller binding and must contain exactly `mode`, `target`, `model`, and `source` with the types and values defined in `references/execution-engines.md`; the run carrier is accepted only for return-to-caller recovery and must satisfy the safe-id contract above. Reject malformed JSON, missing/extra fields, an unsafe run id, or a duplicate carrier. The entire remaining string is the plan path. A mode token or carrier with no following path is an error; report it instead of treating control data as a bare prompt. Without either optional carrier, the original `mode:return-to-caller <plan-path>` form is unchanged and standing configuration remains eligible.

When `implementation_run:<safe-id>` is present, recovery wins over ordinary input classification: read `references/cross-model-execution.md`, use `resume --run-id <safe-id>` as the authoritative entrypoint, and return the normal Return-to-Caller envelope after reconciliation. Preserve the supplied `implementation_engine` binding when present. Do not resolve a different route, redispatch, reimplement, rerun completed verification, or start another caller tail.

When a valid `implementation_engine:` binding is present without recovery, **pre-controller discovery is read-only**. Do not run baseline, test, build, format, install, or generation commands in the canonical checkout before resolving the binding and initializing the external controller: those commands can create ignored or untracked artifacts before the controller records its clean starting point. Limit triage to reads such as metadata, source, configuration, branch, status, and command-availability probes. If a non-read probe is genuinely required to decide whether the route can start, run it only with artifact suppression and prove the canonical Git snapshot is byte-for-byte unchanged before continuing; otherwise stop with a route blocker.

**Resolve a session-carried plan before blank or bare-prompt classification.** When the current request is continuation language such as "proceed" and the conversation identifies exactly one current plan/spec path that was authored, selected, or accepted for this work, treat that path as `<input_document>`. If multiple session plans are plausible, ask which one; do not choose by recency. Do not replace a concrete new work request with an unrelated earlier plan. This rule depends only on visible conversation state, never on whether invocation was explicit or automatic.

**Every non-recovery code path must resolve its implementation engine before execution.** Once metadata or prompt triage identifies code work, but before reading active implementation units, creating tasks, writing files, or committing, read `references/execution-engines.md` and perform its route-resolution gate. This applies with or without an `implementation_engine:` carrier: apply that reference's ordinary-key cascade (`<repo-root>/.compound-engineering/config.local.yaml`, then `config.yaml`) to `work_engine_mode` and `work_engine_preferences` independently, because standing configuration remains eligible in both standalone and carrierless Return-to-Caller Mode. Do not choose inline/native execution until that gate has ruled out or validly exhausted the applicable higher-authority routes.

Determine how to proceed based on what was provided in `<input_document>` (after any mode token is stripped).

**Plan document** (input is a file path to an existing plan or specification): read the plan's metadata first — YAML frontmatter for a markdown plan, or the visible header text for an HTML plan (both formats carry the same fields).

- If it carries `artifact_contract: ce-unified-plan/v1`, classify `artifact_readiness` before reading the body.
  - `artifact_readiness: requirements-only` -> stop and tell the user this Product Contract needs `ce-plan` enrichment before implementation. Offer the exact `ce-plan <plan-path>` handoff.
  - `artifact_readiness: implementation-ready` plus `execution: code` -> continue to Phase 1 using the unified-plan reader strategy below.
  - Any other readiness value or any non-code/unclassified execution mode -> do not auto-execute as code. Route `execution: knowledge-work` to the non-code carve-out; otherwise ask the user to return to `ce-plan` to produce an implementation-ready code plan.
  - Progress-like values (`active`, `in_progress`, `completed`, `done`) are invalid readiness values. Stop and ask for plan repair rather than guessing.
- If it carries `execution: knowledge-work`, this is a **non-code plan** — read `references/non-code-execution.md` and follow that carve-out instead of the rest of this workflow.
- Otherwise (legacy plan, field absent, or `execution: code`) -> continue to Phase 1 and run the normal code lifecycle.

**Blank invocation latest-plan discovery:** when `<input_document>` is blank, glob `<root>/plans/*.md` and `<root>/plans/*.html`, inspect metadata for the newest candidates, and only auto-select a plan that is `artifact_readiness: implementation-ready` plus `execution: code` or a legacy code plan. Stop instead of silently executing when the newest matching artifact is requirements-only, `execution: knowledge-work`, an approach-plan, or an unclassified universal/answer-seeking output. Ask for an explicit path or a `ce-plan` enrichment step. **Superseded sibling:** if a requirements-only candidate has a same-basename file in the other format (`<basename>.md` / `<basename>.html`) that is `implementation-ready`, a format conversion left the requirements-only copy stale — select the implementation-ready sibling and execute it rather than stopping.

**Bare prompt** (input is a description of work, not a file path): read `references/work-intake.md` and follow its scan-and-route steps before Phase 1. Trivial work (1-2 files, no behavioral change) must skip only the task list, then run step 4's mandatory engine-resolution gate before implementing directly, with no unit execution loop. Do not treat an unclear prompt as external-worker authority. If discovery cannot state a concrete goal, bounded scope, and authoritative verification, clarify or route to `ce-plan` before any cross-model egress.

---

### Phase 1: Quick Start

1. **Read Plan and Clarify** _(skip if arriving from Phase 0 with a bare prompt)_ — read `references/work-intake.md` for how to size the read, what to pull from the plan, and when to stop and ask. Treat the plan as a decision artifact, not an execution script: ask anything unclear before implementing rather than after. **Do not edit the plan body during execution** — progress lives in git commits and the task tracker, and legacy `- [ ]` / `- [x]` marks or a `status:` field are not state.

2. **Setup Environment**

   Two things must hold before the first edit: the work lands on a feature branch, and nothing the user did not offer up gets committed or published by this run. Neither is a question for the user — a branch move is a one-command undo, so do it and say so in one line.

   **Branch.** Determine the default branch (`origin/HEAD`; else what the host reports as the default, e.g. `gh repo view --json defaultBranchRef`; else `main`/`master` when one exists). If you are on it, detached, or cannot tell, create a feature branch named from the plan or work description (e.g. `feat/user-authentication`) and re-read `git branch --show-current`. Base it on the fresh remote tip (`git fetch origin <default>`, then `origin/<default>`) when `HEAD` has no commits beyond it, so the work builds on current code; base it on `HEAD` when it does (those commits stay visible to the idempotency check, and the shipping gate decides whether they publish) or when there is no remote; the safe direction when unsure is a spare branch, never incremental commits on the real default. Otherwise continue on the branch you were invoked on — that is where the work belongs; do not rename it and do not ask whether to. A worktree is used only when the user asked for one this session (`ce-worktree`); the default branch is committed to only when the user explicitly said so this session.

   **Pre-work scope.** Before editing, record `git status --short --untracked-files=all` (the user's in-progress files) and whether `HEAD` carries commits not on the remote default (`git log origin/<default>..HEAD`; "unknown" without a remote). Nothing in that set is yours to commit or publish, and it rides along on the branch move untouched — no stash, no question, no effect on naming. It is enforced without a menu:
   - Incremental commits stage only work-owned files and are path-limited (Phase 2), so untouched WIP never enters a commit; the Phase 4 handoff passes every pre-work file this run did not commit as `exclude:<paths>`, and ships locally via `ce-commit` when pre-existing unpushed commits are on the branch (`references/shipping-workflow.md`).
   - A unit that must edit a file that was already dirty is the one case a commit cannot separate. Ask once, covering every such file, at the first commit that would include one: commit those files with the user's edits included, or leave them uncommitted (an exclusion for the rest of the run, named in the final summary as unshipped). In Return-to-Caller Mode do not ask and do not edit the file — return `status: blocked` naming it, so the user's WIP stays intact and commit-or-stash-and-rerun is a clean recovery.

3. **Create Task List** _(skip if Phase 0 already built one, or if Phase 0 routed as Trivial)_ — use the platform's task-tracking capability when available (`TaskCreate`/`TaskUpdate`/`TaskList` in Claude Code, `update_plan` in Codex, or the equivalent elsewhere), and follow `references/work-intake.md` for how tasks are derived, named, and ordered. If no such capability exists, continue without simulating a task list in chat.

4. **Choose Execution Engine, then Strategy**

   **Route resolution is a mandatory pre-write gate.** Before any implementation write, native worker dispatch, or implementation commit, read `references/execution-engines.md`; inspect applicable live/session/project intent, any typed caller binding, and `.compound-engineering/config.local.yaml` then `config.yaml` when they exist; then resolve and record the engine. Do not infer native execution merely because no typed carrier was supplied. Native is eligible only after this gate finds no higher-authority cross-model selection or exhausts a `prefer` route under the reference's fallback contract.

   First pick the **engine** that runs implementation: inline/subagent, goal-mode, dynamic-workflow, or cross-model execution. When no applicable live intent, typed caller binding, or enabled standing configuration selects cross-model execution, native execution remains the default inline/subagent path. The loaded reference decides the rest — authority-and-scope route resolution, the ordered standing preference contract, which hosts expose a callable goal-mode or dynamic-workflow primitive and what to do where they do not, the plan-shape selection table, and the resume-tail rules. An engine choice never changes tail ownership: after implementation, resume standalone quality gates in normal use, or return the return-to-caller envelope when invoked by `lfg`.

   If and only if cross-model execution is selected, you must read `references/cross-model-execution.md` before any repository content, bounded mutation authority, or other material crosses the fixed route. That reference defines the fixed-route transaction, controller commands, failure stops, and receipts. Do not approximate it with an ordinary subagent dispatch.

   **A successful controller `init` locks that unit to the selected cross-model engine.** From that point, advance it through the controller protocol or return blocked with its recovery path. Never reclassify it as trivial, abandon it for speed, or implement it natively unless the protocol later returns an explicit fallback authorization.

   For a bare prompt with no resolved plan, the loaded reference requires a private **bounded implementation brief** before controller initialization: synthesize only the concrete request, discovered scope, acceptance/verification, inherited constraints, exclusions, and conservative unit breakdown. Do not send raw conversation history. If those fields cannot be populated without guessing, do not egress; return to Phase 0 clarification or planning. This bridge is identical for explicit and automatically selected invocations.

   Before dispatching any worker or scheduling a parallel wave, read `references/execution-strategy.md` — it owns the strategy table, the Parallel Safety Check, the bounded unit packet, the fresh-worker invariant, and the orchestrator's integration duties. Two boundaries hold no matter which strategy it selects. **For ordinary native workers, isolation is the harness's job, never ce-work's** — never run `git worktree add` yourself for inline/subagent, goal-mode, or dynamic-workflow execution; the only exception is the external cross-model controller, which owns its detached sibling worktrees outside the repository. An external cross-model worker also must not run `git add`, `git commit`, or another Git index write. Leave its working tree uncommitted; the host snapshots that tree into an isolated transport commit.

### Phase 2: Execute

Before the first implementation write — including a Trivial route that skipped the task list — you must read `references/implementation-loop.md`. Follow that reference for every task's evidence choice, implementation, verification, and completion stops, and for incremental commits, pattern-following, continuous testing, simplification boundaries, UI work, and progress tracking.

One commit rule holds without that read: stage and commit only the files this unit owns, and path-limit the commit itself (`git commit -m "feat(scope): …" -- <those files>`). A bare `git commit` takes the whole index, so anything the user had staged before this run started (Phase 1 Step 2's pre-work scope) would ride into it.

### Phase 3-4: Quality Check and Finishing Work

When all Phase 2 tasks are complete and execution transitions to quality check, you must read `references/shipping-workflow.md` for the full shipping workflow. Do not skip this.

**Code-review completion gate (standalone shipping only — default on).** This standalone run is **not done** — and must not call `ce-commit-push-pr` / `ce-commit` (or a project-defined shipping process, which overrides those defaults per `shipping-workflow.md`) or report ship-complete — until exactly one of:

1. **Review receipt:** you invoked `ce-code-review` through the host's normal skill-invocation mechanism and hold a **completed** receipt — `mode:agent` JSON with `status: complete` plus `artifact_path` or `run_id`, or default-mode markdown with Actionable Findings, Coverage, and Verdict — then ran apply/residuals per `shipping-workflow.md`. Do **not** treat `status: failed`, `degraded`, or `skipped` as a completed receipt even if `artifact_path`/`run_id` is present; those enter the unavailable path in `shipping-workflow.md`; or
2. **Explicit skip phrase** in the shipping summary, exactly one of: `Code review: skipped (mechanical diff)`, `Code review: skipped (ce-code-review unavailable)`, or (interactive only, after a real harness-native review ran because `ce-code-review` could not) `Code review: harness-native fallback`, each with a one-line reason.

**Mechanical** means only formatting, dependency-version bumps, lint-only fixes, or generated artifacts — including multi-file mechanical-only diffs (e.g. package manifest + lockfile, formatter output across files). **Not mechanical:** behavior-bearing work (single- or multi-file), control-flow/error-class/tests-for-behavior changes, or applying external/prior review findings. **Never substitute** mental self-review, "findings already applied," or ad-hoc skimming. Harness-native `/review` alone is **not** a substitute when `ce-code-review` can load; it only satisfies the gate via the `harness-native fallback` phrase after the documented unavailable path. Full path lives in `shipping-workflow.md`. This gate does **not** apply in Return-to-Caller Mode — the caller owns review.

**Review is review, not fix.** `ce-code-review` is review-only: it returns findings and never edits the checkout, commits, or applies them. `references/shipping-workflow.md` owns the review-then-fix sequence and its residual-work gate; `references/review-findings-followup.md` owns eligibility filtering and batching applicable findings by file for the fix subagents.

## Return-to-Caller Mode

`mode:return-to-caller [implementation_engine:<compact-json>] [implementation_run:<safe-id>] <plan-path>` (legacy alias: `mode:caller-owned-tail`) is
reserved for orchestrators such as `lfg` that own the post-implementation
shipping gates (final simplify, code review, PR creation, and CI watching).
In this mode `ce-work` performs implementation and local verification only —
including mid-implementation Phase 2 "Simplify as You Go" — then returns a
structured summary instead of running the standalone shipping tail.

Return:

- `status`: `complete`, `blocked`, or `failed`
- `plan_path`
- `changed_files`
- `u_ids_attempted`
- `u_ids_completed`
- `verification_results`
- `verification_evidence`: one entry per attempted behavior-bearing unit, plus any non-behavioral unit where tests were intentionally skipped. Each entry states the unit/task, `behavior_changed`, `existing_tests_inspected`, `tests_added_or_changed`, tests used unchanged, red failure or characterization observed when applicable, verification commands/results, and any exception reason. For units executed by subagents, this entry is assembled from each worker's returned evidence (Phase 1 Step 4), not reconstructed from the diff — the red-before-implementation observation exists only in the worker's report.
- `implementation_engine_binding`: the resolved one-run `mode`, `target`, `model`, and `source`, or `null` when native execution was selected without a binding
- `requested_route` and `actual_route`: target plus harness/intermediary identity, kept separate when fallback or same-family substitution occurred
- `requested_model` and `actual_model`: the request and receipt-attributed served identity (`unverified` when the route supplies no trustworthy receipt)
- `fallback_reason`: `null` when none, otherwise the observed route-unavailable or substitution reason
- `run_id`: durable external run identifier, or `null` for native execution
- `source_kind` and `source_digest`: controller-recorded implementation authority (`plan` plus its digest in Return-to-Caller Mode; standalone bare-prompt runs use `prompt`)
- `unit_receipts`: route, model, detached-process, integration, verification, canonical-commit, and cleanup state for each attempted unit
- `plan_checkpoint`: the disclosed checkpoint commit when the selected plan was the only canonical dirt, otherwise `null`
- `blockers`
- `recovery_path`: preserved owner-checked run/workspace location when recovery remains, otherwise `null`
- `settled_decision_conflicts`: conflicts with `session-settled:`-labeled KTDs or Key Decisions encountered during implementation — each entry names the labeled entry, the evidence, and how it was routed (proceeded-and-flagged vs blocker); empty when none
- `behavior_change`: whether behavior-bearing code changed
- `standalone_shipping_skipped: true`

Return `status: complete` only when behavior-bearing work has verification evidence or a deliberate exception. If a previous return-to-caller run implemented code but omitted evidence, a later same-plan return-to-caller run should use the idempotency check to inspect the existing work, complete the evidence, and return without reimplementing.

Engine selection (`references/execution-engines.md`) still applies in this mode,
but only for implementation. In return-to-caller mode do not emit a copyable
goal/workflow prompt — a manual paste step strands the caller; run
inline/subagents or return a blocker instead. Any goal/workflow engine used here
must not open a PR, run the owner workflow tail, or bypass the caller-owned
gates.

## Key Principles

- A KTD or Product Contract Key Decision carrying a `session-settled:` annotation (classes `user-directed` / `user-approved`) records a decision the user already made — it is not yours to improve. A product decision's label arrives through the Key Decision whose `Governs R…` links name your unit's Rs, not through a KTD. This scopes to labeled entries only: details the plan leaves open remain your judgment, and a real defect discovered inside a settled approach is still surfaced at full strength — the label never suppresses defect evidence. If implementation reveals a labeled decision is invalidating-grade unworkable (infeasible, wrong-thing, destructive), that is a genuine blocker: surface it rather than silently working around or "fixing" the decision.
- Get clarification once at the start, then execute. The goal is to finish the feature, not to build process — but a finished feature still carries the shipping receipts above.
