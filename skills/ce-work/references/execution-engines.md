# Execution Engines

`ce-work` has four implementation engines: inline/subagent, goal-mode, dynamic-workflow, and cross-model execution. The engine decides *how* implementation runs; it never changes *who* owns the shipping tail (see "Tail ownership" below). Native inline/subagent execution is dormant-by-default compatibility: it remains selected unless applicable live intent, a caller binding, or an enabled standing preference selects the fourth engine.

Engine selection applies only to code execution. Knowledge-work keeps its carve-out. Legacy plans and bare code prompts may select cross-model execution, but otherwise retain the inline/subagent flow in `SKILL.md`; goal-mode and dynamic-workflow selection remains specific to implementation-ready unified plans.

Invocation origin supplies no routing authority and may not be detectable. Resolve the same inputs whether `ce-work` was explicitly invoked or selected by the host: current-task intent, still-active session intent, typed caller binding, active project instructions, enabled checkout configuration, then native execution.

## Resolve cross-model routing before the capability probe

Resolve one implementation binding from applicable authority and scope; do not reduce routing to keyword matching or a closed state machine. Obey the host's instruction hierarchy first. Within the same authority, prefer narrower and more current intent, using these sources:

1. an explicit assignment or constraint in the current task;
2. a still-active session preference or constraint;
3. a typed caller binding at its recorded provenance (for example, an LFG current-task assignment retains current-task authority at the `ce-work` seam);
4. the project's active instructions and conventions already in context;
5. enabled per-checkout configuration; then
6. native execution.

Lower sources may fill an unspecified detail but cannot contradict or broaden a higher source. Incidental mentions in feature prose, quoted material, examples, comparisons, filenames, or discussion do not activate routing. If two applicable instructions of equal authority genuinely conflict on recipient or egress, surface the conflict instead of guessing.

A live request such as "use Codex" is preference-strength by default. Interpret unambiguous strict intent such as "must use Codex" or "only use Codex" as requirement-strength; intent is the contract, not any single keyword. The resolved mode is `prefer` or `require`.

Live or contextual intent may name one route or an ordered fallback list (for example, "prefer Cursor with Grok, then Codex"). Preserve that order and normalize each harness/model candidate with the same rules as standing configuration. A typed caller binding remains a single already-selected candidate; do not widen its exact four-field grammar into a list.

For example, current-task strict Composer resolves to Composer with `require` even when a caller Codex binding and config Cursor preference are both present. Without that task instruction, a caller Codex binding sourced from the current LFG task keeps that provenance. Without applicable live or caller intent, the ordered config candidates apply only when standing mode is enabled.

### Typed caller binding

An automatic caller may pass an `implementation_engine` object with exactly these four fields:

- `mode`: `prefer` or `require`
- `target`: `codex`, `claude`, `grok`, `cursor`, or `composer`
- `model`: an optional model pin, otherwise `null`
- `source`: the binding's caller-visible provenance

Accept this carrier only at the `ce-work` seam, beside `mode:return-to-caller`; its fields never enter planning or review input. On string-only skill hosts the initial envelope is `mode:return-to-caller implementation_engine:<compact-json> <plan-path>`, where `<compact-json>` is that exact four-field object with no formatting whitespace (for example `implementation_engine:{"mode":"prefer","target":"codex","model":null,"source":"lfg-current-turn"}`). The original no-carrier form stays `mode:return-to-caller <plan-path>`. Once resolved, preserve the binding and source in the durable run receipt. Downstream consumers and workers may narrow its authority or restrictions but never broaden them.

Return-to-caller recovery may add a separate `implementation_run:<safe-id>` carrier after the optional engine carrier and before the unchanged plan path. It is not an `implementation_engine` field and is accepted only for recovery. A safe id matches `^[A-Za-z0-9._-]{1,128}$` and contains at least one non-period character. Carrierless recovery is `mode:return-to-caller implementation_run:run-123 <plan-path>`; engine-bound recovery is `mode:return-to-caller implementation_engine:<compact-json> implementation_run:run-123 <plan-path>`. Reject malformed or duplicate carriers instead of treating them as plan text. The run id selects durable state; it never authorizes a fresh dispatch or a different route.

### Target and identity vocabulary

Keep `target`, harness/intermediary route, requested model, served model, and receipt status separate. Target `cursor` means the Cursor harness with its configured default model. Target `composer` is shorthand for a Composer-family model requested through Cursor. The host must attempt the documented adapter recipe first. If the installed harness differs, it may inspect local CLI help or version information and adapt only within the same sanctioned harness/model family and only when the fixed adapter can still enforce the route and restrictions. Otherwise that candidate is unavailable. Disclose any compatible model alias or substitution and never relabel an unverified served model.

When the target resolves to the current host's default execution route and no distinct model or serving route was requested, collapse the request to native execution and record requested-versus-actual identity rather than shelling out to the same host.

### Per-checkout configuration

Standing configuration uses one mode plus an ordered route list:

```yaml
work_engine_mode: prefer
work_engine_preferences:
  - harness: cursor
    model: composer
  - harness: codex
    model: gpt-5.6
  - harness: claude
```

- `work_engine_mode`: `off | prefer | require`
- `work_engine_preferences`: one or more ordered candidate objects
- `harness`: `codex | claude | grok | cursor`
- optional `model`: a model id or family understood by that harness; omission means its configured default

Do not put CLI commands or flags in configuration. The list expresses implementation intent; the skill's adapter recipes and local inspection determine how to invoke it. Composer is therefore `{ harness: cursor, model: composer }`, while `{ harness: cursor }` means Cursor's configured default.

Normalize a qualified candidate to the controller's fixed route: Codex -> `codex`, Claude -> `claude`, native Grok -> `grok-cli`, Cursor with no model -> `cursor`, a Composer-family Cursor model -> `composer`, a Grok-family Cursor model -> `grok-cursor`, and another explicit Cursor model -> `cursor` with that controller-authorized model selector. A model selector is data, never shell syntax; if it cannot be represented by the fixed adapter's safe model token, the candidate is unavailable.

Traverse each ordered candidate during preflight. If a candidate is equivalent to the current host and its current/default model, continue to the next candidate rather than shelling out to self; an explicit different model in the same harness is still a distinct candidate. If a candidate is unavailable before egress, record why and continue to the next candidate. The first qualified candidate becomes the fixed recipient. After dispatch begins, the recipient is locked by the cross-model contract and list traversal stops.

`off` disables only the standing preference. It does not cancel applicable live intent or a typed caller binding. An enabled mode without a valid candidate list is unavailable rather than guessed. When the list is exhausted, `prefer` falls back natively with every attempted route and reason disclosed; `require` follows the interactive/headless blocker rule. Standing configuration supplies defaults, not permission to change recipient or broaden authority.

## Step 1: Probe host capability

An engine is usable only when the host exposes a callable primitive for it. Do not assume one exists from its name.

| Engine | Usable when | Claude Code reality |
|---|---|---|
| **Inline / subagent** | Always. The orchestrator runs units inline or dispatches subagents via the platform's subagent primitive (`Agent`/`Task` in Claude Code, `spawn_agent` in Codex, `subagent` in Pi). | Always callable in-session. This is the default. |
| **Goal-mode** | The host exposes a callable goal *tool* a skill can invoke — e.g. Codex `create_goal` (sets **and activates** a persistent objective for the current session) plus `update_goal(complete\|blocked)` for terminal status. | **No goal tools exposed.** `/goal` is a top-level user command only; a skill cannot invoke it or any goal tool. Emit a copyable `/goal` prompt for the user to paste, or run inline/subagents. **Codex differs — it does expose `create_goal` (see below).** |
| **Dynamic-workflow** | The host exposes a callable dynamic-workflow / ultracode-style orchestration primitive that returns structured results and blockers without mid-run user decisions. | **Not callable from inside a skill.** Dynamic workflows start from a user prompt (`ultracode:` or `/effort ultracode`). `ce-work` can only emit a copyable prompt block. |
| **Cross-model execution** | A resolved fixed route has a qualified, write-capable adapter and satisfies every caller restriction. Load `cross-model-execution.md` only after this engine is selected. | Availability depends on the installed target CLI and its qualified adapter, not on the host's native subagent tools. A same-host default request collapses to native execution. |

Rule of thumb: **probe for the callable tool, don't infer from the command's existence.** If the host exposes a callable goal tool (Codex `create_goal`), goal-mode is a real callable engine — use it. If it exposes only a user-typed `/goal` (Claude Code), goal-mode is prompt-emission only — emit a copyable prompt. The literal `/goal` slash command is not skill-invocable on any host; the *tool* path is what makes Codex callable.

**Codex specifically.** Codex exposes goal **tools** to skills (gated by `features.goals`, so probe for their presence): `create_goal(objective)` sets **and activates** a persistent objective — the **current session** then works toward it automatically (it steers this agent; it is not a background worker and returns no awaitable envelope) — and `update_goal(status: complete|blocked)` reports terminal status when the objective is genuinely met (or repeatedly blocked). So a Codex skill can **start goal-mode directly, with no copy-paste**: call `create_goal` with the objective (same content as the copyable prompt below). That is the skill's whole job — `create_goal` activates the objective and the **current session works toward it automatically**, and the goal lifecycle marks it `complete` (via `update_goal`) when the Definition of Done is met. **The skill does NOT call `update_goal`** — the working session handles that on its own (it is terminal-status only, not a mid-stream edit). The literal `/goal` slash command remains user-typed-only; the tool path is the callable one. (Claude Code exposes no goal tools at all, so it stays copy-paste-only.)

## Step 2: Pick the engine by plan shape

When more than one engine is callable, choose by the plan's decomposition shape:

| Plan shape | Engine | Why |
|---|---|---|
| Sequential or modest U-ID decomposition; units share files or depend on each other | **Inline / subagent** (default), or a **goal-mode** prompt for sustained focus when callable | The DoD already defines the end condition; ordinary persistence finishes it. |
| Many independent U-IDs with disjoint file ownership; codebase-wide sweep; large migration; adversarial cross-checking | **Dynamic-workflow** when callable; otherwise parallel subagents | Workflow scripts hold branching, loops, and intermediate worker state outside the main context and coordinate many agents. Prefer this over goal-mode for large fan-out. |
| Host exposes no callable goal/workflow primitive (e.g. Claude Code in-session) | **Inline / subagent** | Preserve the same heading-scan / DoD / U-ID discipline without relying on unavailable host features. |
| Applicable live intent, a caller binding, or enabled config resolves a qualified fixed external route | **Cross-model execution** | Another harness/model authors bounded units while the host retains canonical integration, verification, commits, and tail ownership. |

For a bare prompt, cross-model execution is eligible only after Phase 0 has established a concrete goal, bounded scope, and authoritative verification. The cross-model reference turns that discovery into a private prompt brief and conservative P-unit packet. An unclear bare prompt returns to clarification/planning before egress; it does not fall through to a smarter external worker and ask that worker to invent the scope.

Recommend exactly one path. Present a non-default engine as an "advanced / large-scale option" only when the plan shape plausibly warrants it — never as an equal coin-flip.

## Step 3: Run the chosen engine

### Inline / subagent (default)

Follow the dispatch strategy in `SKILL.md` Phase 1 Step 4 (inline, serial subagents, or parallel subagents) and the Phase 2 execution loop. `ce-work` owns task creation, unit sequencing, dispatch, verification, and commits.

### Cross-model execution

Read `cross-model-execution.md` only after routing selects this engine. Resolve and disclose its fixed recipient and restrictions before egress, then follow its serial external-unit transaction through the bundled controller, detached runner, and fixed adapter. If the route is unavailable at preflight, apply the preference/requirement behavior defined there; never let the detached worker select a fallback recipient.

### Goal-mode and dynamic-workflow

**With a callable goal tool (Codex `create_goal`):** call `create_goal` with the objective — the content of the copyable prompt below, minus the leading `/goal`. This activates the objective and the **current session** works toward it; there is no separate worker and no envelope to await, so the session continues to its tail (Step 4) and the goal lifecycle marks completion. **The skill does not call `update_goal`** — the working session does that itself. **Use `create_goal` only in standalone use, never in return-to-caller mode** — return-to-caller requires `ce-work` to return control to the caller, but `create_goal` would keep the session pursuing the objective instead of returning; run inline/subagents there.

**No callable goal tool, or dynamic-workflow (Claude Code today):** do **not** attempt to invoke them. Instead:

- **Standalone interactive use:** print a copyable prompt block for the user to paste, then continue inline/subagents if the user does not paste it. Do not stall waiting for a paste.
- **Return-to-caller use (e.g. under `lfg`):** do **not** emit a copyable prompt — a manual paste step strands the caller. Run inline/subagents instead, or return a blocker if the plan genuinely requires an unavailable engine.

Whichever path, the goal/workflow must not open a PR, finalize the session, or bypass the owning workflow's gates.

Copyable goal-mode prompt (standalone — emit verbatim, substituting only the literal plan path). **It must be plan-agnostic: it should read identically for any plan except the substituted path.** Deletion test before emitting — if your draft names a specific command, file path, U-ID dependency relationship, stop condition, or Definition-of-Done item, it copied from the plan; cut it (the goal reads those from the plan). For PR/shipping, don't hardcode an open-a-PR or do-not-open-a-PR directive; instead carry the precedence line below — the goal follows the plan's PR/landing strategy if it has one, with the repo's conventions and the user's preferences overriding it (both of which the executing agent already has).

```text
/goal Implement <plan-path> to its Definition of Done.

The plan is the authority — don't read it whole. Scan headings, read the Goal Capsule, then work the units in dependency order, reading each unit plus its cited R/F/AE/KTD and any Product Contract Key Decision whose exact `Governs R…` links name that unit's cited R-IDs as you go. Run the plan's Verification Contract gates and satisfy each unit's test scenarios. Track progress outside the plan file, not in it.

This top-level goal owns the implementation tail: run simplification and code review when the diff meets the repo's normal criteria, apply eligible fixes, and surface residual findings. Follow the plan's PR/landing strategy if it defines one; the repo's conventions and the user's preferences override it. Surface a genuine blocker — something that changes scope or contradicts the plan — instead of guessing; use your judgment on details the plan leaves open.

Done when the transcript shows: every non-deferrable Per-Unit DoD row has an observed verification result; the Verification Contract's required checks passed or are documented as not applicable; applicable simplification/review gates ran or were explicitly skipped with reason; dead-end or experimental code from approaches that did not pan out has been removed from the diff; and no progress/status was written into the plan file. Before declaring done, re-open the plan and re-check the active units, Verification Contract, and Definition of Done against the diff — context may have been compacted to a summary that dropped detail.
```

Copyable dynamic-workflow prompt (large fan-out — emit verbatim):

```text
ultracode: Execute <plan-path> as an end-to-end dynamic workflow.

Use the plan as authority. Build the workflow around the Implementation Units and Definition of Done. Parallelize only independent U-IDs with disjoint file ownership, keep intermediate agent results inside the workflow, run simplification/review/verification gates inside the workflow tail, and return a final summary with changed files, U-IDs completed, verification results, residual findings, and blockers.
```

Keep emitted prompts under 4,000 characters and always substitute the literal plan path.

## Step 4: Resume the correct tail

After any engine finishes implementation, inspect the diff and continue at the tail that matches the caller. The engine never owns more than implementation + local verification on its own.

| Mode | After implementation, `ce-work` ... |
|---|---|
| **Standalone** (user invoked `ce-work` directly, or `ce-plan` handed off interactively) | Resumes its normal post-implementation tail — Phase 3-4 quality gates, simplification, review, commit, and handoff in `references/shipping-workflow.md`. A goal-mode run does not skip these; verify they ran or were explicitly skipped with reason. |
| **Return-to-caller** (`mode:return-to-caller`, e.g. under `lfg`) | Performs implementation and local verification only, then returns the structured summary in `SKILL.md` § Return-to-Caller Mode (`standalone_shipping_skipped: true`). Does not run simplify/review/PR/CI — the caller owns those. |

Using goal-mode or a dynamic workflow is a way to get better sustained implementation focus, not a way to skip the owning workflow's finish discipline.

## Progress visibility (independent of tail ownership)

Tail ownership decides who opens the **final** PR; it does not forbid progress signals during a long run. For multi-hour goals, meaningful commits as units complete and an optional scratch progress artifact (outside the plan body) are encouraged so a long trajectory stays observable. Only final PR creation is gated: a standalone top-level goal may open a **draft** PR only when it explicitly owns that channel; in return-to-caller mode `ce-work` must not open any PR, but may commit and return a progress report in its structured envelope. Never write progress or status into the plan body — git, commits, and the envelope carry it.
