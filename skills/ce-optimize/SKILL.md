---
name: ce-optimize
description: "Optimize a named target with a measured loop: attribute a workload's cost, or score variants and keep winners. Use when a working system's metric should move and the winning change is not already known. Use ce-debug when the job is diagnosis; use ce-work when the change is already known."
argument-hint: "[path to optimization spec YAML, or describe the optimization goal]"
---

# Optimize a measurable target

**Outcome:** confirmed improvements to the named target live on an `optimize/<spec-name>` branch, with a disk log. The user takes over at wrap-up.

**Intent:** the next action is the cheapest step that would change what gets implemented. Attribute the cost of a named workload before searching implementations. Search and keep a scored variant space without requiring a profile.

**Done when:** a stopping criterion was met, every declared required target is met or another stop was met first, the final state is written and verified on disk, and the user has been given the post-completion options. If the run instead stopped at a check it could not pass, say what blocked it.

Invoking this skill authorizes reading the repo, building the harness, and (after the Phase 1 approval gate) isolated experiments and keep/revert commits on `optimize/<spec-name>`. Ask when spend is uncapped, when a new dependency appears, when wrap-up would push or open a PR, or when only the user can choose among the post-completion options. Do not ask again to run the next experiment inside those limits.

Independent calls and dispatches that do not depend on each other go in one response. Serialize only real dependencies.

Report findings, user decisions, blockers, and results. During longer work, give occasional updates on what was learned and what remains. Routine preparation and phase or batch transitions need no separate announcement. Keep accounting in the log and final recap unless it affects a current decision.

Explain the target, evidence, and decision in ordinary task language. Workflow labels (such as 'harness' or 'parallel readiness') belong in artifacts unless the user asks about those mechanics. State unknown duration or cost as unknown; caps are limits, not forecasts.

A step is done only after it ran. Describing a measurement, dispatch, or checkpoint is not doing it. Do not end a turn while in-scope work remains merely described.

## Interaction Method

Use the host's blocking question tool already in the current tool list (match by capability, not by a host-specific name). Presence in the current tool list is proof the tool exists; never call a user-facing question tool to discover whether it exists. If a matching tool is listed but unloaded, use the host's tool-discovery primitive to load that capability: do not search for another host's tool name. Fall back to numbered options on the host's chat surface only when no such tool is in the list or a real question call errors. Never skip the question silently.

## Artifact Root

Resolve `<root>` the first time you compose a path under it. Reading learnings under `<root>/solutions/` counts as composing one. Give any subagent the resolved path, not the config.

<!-- ce-docs-root:start -->
**Resolve the CE artifact root `<root>` before composing any artifact path.**

- **Read** `docs_root` from `<repo-root>/.compound-engineering/config.yaml` only (`<repo-root>` = `git rev-parse --show-toplevel`). Do not read it from `config.local.yaml`. Unset -> `<root>` is `docs`, exactly as before.
- **Validate** a set value: a repo-relative directory whose real, symlink-resolved path stays inside the repo and is neither the repo root nor under `.git/`. Otherwise stop with an error naming `docs_root` and the value -- never fall back to `docs`.
- **Use** `<root>` as the sole artifact location: create it if absent, compose each path as `<root>/<subdir>` with this skill's own subdirectory, and never also read `docs`.
<!-- ce-docs-root:end -->

## Persistence Discipline

The experiment log on disk is the source of truth. Write order is measure, write, verify, then show the user. **Read `references/persistence.md` now** for checkpoints CP-0 through CP-5, the file layout, and resume. The phases below mark where each checkpoint falls.

## The phases

Four phases run in order. Each one names the reference it cannot start without. A fresh run skips none of them: a harder optimization spends longer in a phase, it does not run fewer phases.

**A resume is not a fresh run.** On a resume, re-enter Phase 0 only far enough to detect the run and to recover any `result.yaml` markers the log is missing. Then continue from the phase the log records: skip the work the log proves finished, and re-enter any approval check it does not. A checkpoint proves the work that produced it, never a user decision: the log holds no record of approval, so a resume that has not seen the user approve presents the Phase 1 gate again.

**Phase 0: Setup.** The input is a goal, or a path to a spec YAML. It comes from the user or from a calling skill. If neither supplied one, ask: "What would you like to optimize? Describe the goal, or provide a path to an optimization spec YAML file." Load or build the spec and save it (CP-0): **read `references/spec.md`**. Then search prior learnings, detect run identity, and create the branch and scratch space. **Read `references/measurement.md`** for the rest of Phase 0 and Phase 1.

**Phase 1: Measurement scaffolding.** Build or validate the harness, write the baseline (CP-1), probe parallelism, check the worktree budget. Two gates stop the run:

- **Clean-tree gate.** Do not continue while any file in `scope.mutable` or `scope.immutable` has uncommitted changes. The reference defines the check and what to ask for.
- **User approval gate.** Present what Phase 1 assembled; the reference lists what to include. If the primary type is `judge` and `max_total_cost_usd` is unset, say plainly that spend is uncapped. Offer proceed, fix issues, and adjust spec. Adjusting the spec is only available while the log holds nothing derived from it (no hypothesis backlog and no experiments) and it sends the run back through Phase 1 so the baseline matches the new spec. Once anything derived from the spec is on file, the spec is fixed for the run. **Do not enter Phase 2 until the user explicitly approves.** Then re-read the spec and baseline from disk.

**Phase 2: Hypothesis generation.** Analyze the current approach, rank the hypotheses, record the backlog (CP-2). Do not dispatch an implementation experiment while a cheaper locating measurement would change keep or skip. **Read `references/loop.md`** for this phase and Phase 3. One gate: **dependency pre-approval.** Collect every new dependency across all hypotheses and present the full list for bulk approval. A dependency the user does not approve stays in the backlog, is skipped in batch selection, and comes back at wrap-up.

**Phase 3: Optimization loop.** Select a batch, dispatch experiments, persist each result as it lands (CP-3), evaluate with `scripts/decide.mjs`, update state and the digest (CP-4), then check whether to stop. Stop as soon as any one of seven criteria holds: every declared required target is met, max iterations, max hours, judge budget exhausted, plateau, a user interrupt, or no runnable hypothesis left. `references/loop.md` states each one exactly. Otherwise start the next batch.

**Phase 4: Wrap-up.** **Read `references/wrap-up.md`** for the deferred hypotheses, the summary, what is preserved, cleanup, and the post-completion options to present. CP-5 marks the log final. **Write it only after the user picks an option that does not return to Phase 3.** Two options do return: Continue, and approving a deferred dependency.
