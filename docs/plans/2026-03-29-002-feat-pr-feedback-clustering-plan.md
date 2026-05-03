---
title: "feat(resolve-pr-feedback): Add feedback clustering to detect systemic issues"
type: feat
status: completed
date: 2026-03-29
deepened: 2026-03-29
---

# feat(resolve-pr-feedback): Add feedback clustering to detect systemic issues

## Overview

Add a gated cluster analysis phase to the resolve-pr-feedback skill that detects when concentrated, thematically similar feedback signals a systemic issue rather than isolated bugs. The analysis is gated — it only runs when feedback patterns warrant it (same-file concentration, high volume, or verify-loop re-entry), keeping the common case (2-3 unrelated comments) at zero extra cost. When clusters are detected, dispatch a single investigation-aware agent per cluster that reads the broader area before fixing, rather than N individual fixers playing whack-a-mole. Verify-loop re-entry (new feedback after a fix round) automatically triggers the gate, so cross-cycle patterns are caught without a separate detection mechanism.

## Problem Frame

The resolve-pr-feedback skill currently processes feedback items individually. The only grouping is same-file conflict avoidance (grouping threads that reference the same file into one agent dispatch). There is no semantic analysis of whether multiple feedback items collectively point to a deeper structural issue.

This leads to a whack-a-mole pattern:
1. Review bots post 4 comments about missing error handling across different functions in `auth.ts`
2. The skill fixes each one individually — adds a try/catch here, a null check there
3. The review bot re-runs and finds 3 more error handling gaps the individual fixes didn't cover
4. The cycle repeats because the underlying issue (the error handling *strategy* in that module) was never examined

The insight: individual comments don't say "this whole approach is wrong," but when you see 2+ comments about the same category of concern in the same area of code, the inference is that the approach in that area needs rethinking — not just N individual patches.

## Requirements Trace

- R1. Detect thematic+spatial clusters in feedback before dispatching fix agents
- R2. When clusters are detected, investigate the broader area before making targeted fixes
- R3. Treat verify-loop re-entry (new feedback after a fix round) as a signal to investigate more broadly via the cluster analysis gate
- R4. Preserve existing behavior for non-clustered feedback (isolated items still get individual agents)
- R5. Keep the skill prompt-driven (no code changes — this is all SKILL.md and agent markdown)
- R6. Gate cluster analysis on signal strength — don't run it unconditionally on every pass, only when feedback patterns warrant the cost

## Scope Boundaries

- No changes to the GraphQL scripts (fetch, reply, resolve)
- No changes to targeted mode (single-thread URL) — clustering only applies in full mode
- No new agents — extend the existing pr-comment-resolver agent with cluster context handling
- No changes to the verdict taxonomy (fixed, fixed-differently, replied, not-addressing, needs-human)
- Clustering is a signal for the orchestrator, not a new data structure or API

## Context & Research

### Relevant Code and Patterns

- `plugins/compound-engineering/skills/resolve-pr-feedback/SKILL.md` — the orchestrator skill, 285 lines
- `plugins/compound-engineering/agents/workflow/ce-pr-comment-resolver.agent.md` — the worker agent, 134 lines
- Current same-file grouping at SKILL.md lines 107-113 — conflict avoidance pattern to extend
- The ce:review skill's confidence-gated merge/dedup pipeline — precedent for pre-dispatch analysis
- The todo-resolve skill uses the same pr-comment-resolver agent and batching pattern

### Institutional Learnings

- **Whack-a-mole state machines** (`docs/solutions/skill-design/git-workflow-skills-need-explicit-state-machines-2026-03-27.md`): Skills handling multiple dimensions of state need explicit re-verification after every mutating action. Directly applicable — after fixing a cluster, re-verify the whole area, not just the individual threads.
- **Cluster before filter**: Pipeline ordering is an architectural invariant. Group/cluster related items before deciding how to address them, otherwise individually below-threshold items that are part of a meaningful pattern get discarded.
- **Status-gated resolution** (`docs/solutions/workflow/todo-status-lifecycle.md`): Quality gates belong upstream in triage, not at the resolve boundary. The cluster analysis step is exactly this — a quality gate before dispatch.
- **Pass paths not content** (`docs/solutions/skill-design/pass-paths-not-content-to-subagents-2026-03-26.md`): When dispatching cluster-aware agents, pass thread IDs and file paths, not full comment bodies.

## Key Technical Decisions

- **Cluster analysis lives in the orchestrator (SKILL.md), not the agent**: The orchestrator sees all feedback and can detect cross-thread patterns. Individual agents only see their assigned threads. The orchestrator synthesizes the cluster brief; the agent receives it as context alongside the thread details.

- **Extend existing grouping rather than replacing it**: The current same-file grouping (SKILL.md lines 107-113) already groups threads that reference the same file. Cluster analysis is a semantic layer on top of this — it groups by theme + proximity, and the same-file grouping becomes a special case of spatial proximity.

- **Single agent per cluster, not a new "investigator" agent**: The pr-comment-resolver agent already reads code, evaluates validity, and fixes. For clusters, it receives additional context (the cluster brief and all related threads) and follows an extended workflow: read the broader area first, assess root cause, then decide between holistic fix and individual fixes. This avoids a new agent and keeps the existing parallel dispatch architecture.

- **Cross-cycle detection is a gate signal, not a separate mechanism**: When the Verify step finds new feedback after a fix round, that re-entry automatically triggers the cluster analysis gate. No separate concern-category matching or structural comparison needed — the cluster analysis step handles thematic grouping with the just-fixed file context. This avoids the fragility of comparing LLM-generated category labels across inference passes.

- **Cluster threshold: 2+ items with shared theme AND proximity**: A single comment is never a cluster. Two items sharing both thematic similarity and spatial proximity form the minimum cluster. The threshold is deliberately low because the cost of investigating more broadly is small (agent time is cheap) and the cost of missing a systemic issue is high (another review loop).

- **Cluster analysis is gated, not always-on**: Running cluster analysis on every pass adds latency and token cost for the common case (2-3 unrelated comments). Instead, cluster analysis only fires when the feedback already shows concentration signals. The gate uses cheap, structural checks that are byproducts of triage — not new LLM inference. Gate signals: (a) volume threshold (4+ new items total — enough that patterns are plausible), or (b) verify-loop re-entry (new feedback appeared after a fix round — the strongest signal). Same-file concentration is deliberately excluded as a gate signal because it's the most common feedback pattern and is already handled by existing same-file grouping; it would cause the gate to fire on the majority of runs. If no gate signal fires, skip cluster analysis entirely and proceed directly to plan/dispatch as today.

- **Verify-loop re-entry is a gate signal, not a separate comparison mechanism**: Cross-cycle detection does not need its own concern-category matching or structural comparison. The fact that new feedback appeared after a fix round IS the whack-a-mole signal. Any verify-loop re-entry automatically triggers the cluster analysis gate. The cluster analysis step itself handles the thematic grouping — it doesn't need a separate mechanism to tell it "this is cross-cycle." On re-entry, the cluster analysis step receives which files were just fixed as additional context, so it can assess whether new feedback relates to just-fixed areas.

## Open Questions

### Resolved During Planning

- **Should clusters replace or supplement individual dispatch?** Supplement. Non-clustered items still get individual agents. A cluster dispatches one agent that handles all its threads together. Both can happen in the same run.
- **Should the agent decide holistic vs. individual, or the orchestrator?** The agent. The orchestrator detects the cluster and synthesizes the brief, but the agent reads the code and is better positioned to judge whether individual fixes suffice or a broader change is needed.
- **How does the cluster brief get passed?** In a `<cluster-brief>` XML block in the agent prompt — structurally delimited for unambiguous activation. The brief contains: theme label, affected directory/area, file paths, thread IDs, and a one-sentence hypothesis. No full comment bodies — the agent reads threads itself. This prevents accidental cluster mode activation (e.g., todo-resolve passing text that coincidentally mentions "cluster") and follows the pass-paths-not-content principle.

### Deferred to Implementation

- **Exact wording of the cluster analysis prompt**: The heuristics are defined but the prompt phrasing that gets the LLM orchestrator to reliably detect clusters will need iteration.
- **Whether the "holistic fix" mode needs examples in the agent**: The agent may need 1-2 examples of cluster-aware evaluation in its `<examples>` section. Testing will show if the current examples plus the new workflow instructions are sufficient.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
Current flow:
  Fetch -> Triage -> Plan -> Dispatch(per-thread) -> Commit -> Reply -> Verify -> Summary

New flow:
  Fetch -> Triage -> [Gate Check] -> Plan -> Dispatch -> Commit -> Reply -> Verify -> Summary
                         |                     |                              |
                    Gate fires?            If clusters:                  New feedback?
                    /        \             1 agent/cluster               /          \
                 YES          NO           If isolated:              YES            NO
                  |            |            1 agent/thread        (re-entry         done
           Cluster Analysis    |            (same as today)     triggers gate)
                  |            |
           Synthesize briefs   |
                  \           /
                   v         v
                 Plan step (unified)
```

**Cluster analysis gate:**

The gate uses cheap structural checks — byproducts of triage, not new LLM inference. Cluster analysis only runs when at least one gate signal fires:

| Gate signal | Source | Cost |
|---|---|---|
| Volume: 4+ new items total | Item count from triage | Zero — simple count |
| Verify-loop re-entry: this is the 2nd+ pass | Iteration state | Zero — binary flag |

Same-file concentration is deliberately NOT a gate signal. Multiple items on the same file is the most common feedback pattern and is already handled by existing same-file grouping for conflict avoidance. Running cluster analysis every time 2+ items hit the same file would add overhead to the majority of runs for little benefit. Same-file concentration is valuable *inside* the analysis (once the gate has fired for another reason) as a spatial proximity signal, but shouldn't open the gate itself.

If no gate signal fires (the common case: 1-3 items across different files), skip cluster analysis entirely and proceed to plan/dispatch with zero clustering overhead. If the first pass misses a cluster due to low volume, verify-loop re-entry catches it on the second pass.

**Cluster detection decision matrix:**

Spatial proximity is a hard requirement for clustering. Thematic similarity without proximity is better handled by cross-cycle escalation (Unit 4), which catches the case where the same theme keeps producing new issues across the codebase.

| Thematic similarity | Spatial proximity | Item count | Action |
|---|---|---|---|
| Yes | Yes (same file) | 2+ | Cluster -> investigate area |
| Yes | Yes (same directory/module) | 2+ | Cluster -> investigate area |
| Yes | No (unrelated locations) | any | No cluster (cross-cycle escalation catches recurring themes) |
| No | Yes (same file) | any | Same-file grouping only (existing behavior for conflict avoidance) |
| No | No | any | Individual dispatch (existing behavior) |

Spatial proximity means: same file, or files in the same directory subtree (e.g., `src/auth/login.ts` and `src/auth/middleware.ts` are proximate; `src/auth/login.ts` and `src/database/pool.ts` are not).

**Cluster brief structure:**

The cluster brief is passed to agents in a `<cluster-brief>` XML block for unambiguous activation. Contents are constrained to avoid inflating agent context:

```xml
<cluster-brief>
  <theme>Missing input validation</theme>
  <area>src/auth/</area>
  <files>src/auth/login.ts, src/auth/register.ts, src/auth/middleware.ts</files>
  <threads>PRRT_abc123, PRRT_def456, PRRT_ghi789</threads>
  <hypothesis>Individual validation gaps suggest the module lacks a consistent validation strategy</hypothesis>
</cluster-brief>
```

No full comment bodies in the brief. The agent reads threads via their IDs.

**Cross-cycle escalation:**

```
Verify re-fetch finds new threads
  -> Any new feedback after a fix round = verify-loop re-entry
  -> Re-entry automatically triggers the cluster analysis gate
  -> Cluster analysis receives additional context: files just fixed in previous cycle
  -> Cap at 2 fix-verify iterations before surfacing to user
```

No separate concern-category matching for cross-cycle detection. The re-entry itself is the signal. The cluster analysis step (which only runs because the gate fired) handles the thematic grouping and determines whether new feedback relates to just-fixed areas.

## Implementation Units

- [x] **Unit 1: Add gated cluster analysis step to SKILL.md**

**Goal:** Insert a gated step between Triage (Step 2) and Plan (Step 3) that checks whether feedback patterns warrant cluster analysis, and only runs the analysis when they do. The common case (2-3 unrelated comments) skips this step entirely.

**Requirements:** R1, R4, R6

**Dependencies:** None

**Files:**
- Modify: `plugins/compound-engineering/skills/resolve-pr-feedback/SKILL.md`

**Approach:**
- Add new "Step 2.5: Cluster Analysis (Gated)" after the triage step
- **Gate check first**: Before any thematic analysis, check two structural signals: (a) volume — 4+ new items total, (b) verify-loop re-entry — this is the 2nd+ pass through the workflow. If neither fires, skip to Plan step with zero clustering overhead. Same-file concentration is not a gate signal (it's the most common pattern and already handled by existing same-file grouping), but it is used inside the analysis as a spatial proximity indicator once the gate has fired
- **If gate fires**: Group items by concern category AND spatial proximity. Concern categories are broad labels assigned during this step (error handling, validation, type safety, naming, performance, etc.) — not free-text; use a fixed category list so labels are consistent and comparable. Use the decision matrix from the technical design section to determine actionable clusters
- When clusters are found, synthesize a `<cluster-brief>` XML block per cluster: the theme, affected files/areas, the hypothesis, and the list of thread IDs. On verify-loop re-entry, include which files were just fixed in the previous cycle as additional context
- Items not in any cluster remain as individual items (preserving existing behavior)
- If the gate fired but no clusters are found after thematic analysis, proceed with all items as individual (the gate was a false positive — no cost beyond the analysis itself)
- Renumber subsequent steps (current Step 3 becomes Step 4, etc.)

**Patterns to follow:**
- The existing same-file grouping at SKILL.md lines 107-113 — extend this concept semantically
- The ce:review skill's merge/dedup pipeline across personas — precedent for cross-item analysis before dispatch

**Test scenarios:**
- Happy path: 5 items across different files, 3 share a validation theme in same directory -> gate fires (volume >= 4), cluster detected for the 3 validation items, other 2 dispatched individually
- Edge case: 3 items about same theme on same file -> gate does NOT fire (below volume threshold, not a re-entry). Same-file grouping handles conflict avoidance. If the first pass misses a deeper issue and verify finds new feedback, re-entry catches it on the second pass
- Edge case: 2 unrelated items on different files -> gate does NOT fire, cluster analysis skipped entirely
- Edge case: verify-loop re-entry with only 1 new item -> gate fires (re-entry signal), analysis runs with context about just-fixed files
- Happy path: 1 clustered group + 2 isolated items -> cluster gets a brief in `<cluster-brief>` XML block, isolated items pass through unchanged
- Edge case: gate fires (volume), 4 items on same file but all different themes -> analysis runs, finds no thematic cluster, proceeds with same-file grouping only (false positive gate, low cost)
- Edge case: items in same directory subtree (e.g., `src/auth/login.ts` and `src/auth/middleware.ts`) -> proximate, eligible for clustering
- Edge case: 2 items with same theme in completely unrelated files -> NOT clustered (no spatial proximity)

**Verification:**
- Gate check runs on every pass at near-zero cost (2 structural checks: item count and re-entry flag)
- Cluster analysis only runs when gate fires
- The common case (1-3 items) skips cluster analysis entirely
- Same-file grouping continues to work independently for conflict avoidance regardless of whether the gate fires
- Renumbering is consistent throughout the document. Specific cross-references to update: (1) "skip steps 3-7 and go straight to step 8" (line 67), (2) "verification step (step 7)" (line 111), (3) "proceed to step 6" (line 117), (4) "repeat from step 1" (line 189), (5) "step 2" (line 222), (6) Targeted Mode "Full Mode steps 5-6" (line 267)

---

- [x] **Unit 2: Modify dispatch logic for cluster-aware processing**

**Goal:** Change Steps 3-4 (Plan and Implement) so that clusters dispatch a single agent with the cluster brief and all related threads, while isolated items dispatch individually as before.

**Requirements:** R2, R4

**Dependencies:** Unit 1

**Files:**
- Modify: `plugins/compound-engineering/skills/resolve-pr-feedback/SKILL.md`

**Approach:**
- In the Plan step, task items now include both clusters (with their briefs) and isolated items
- In the Implement step, for each cluster: dispatch ONE pr-comment-resolver agent that receives the `<cluster-brief>` XML block, all thread details in the cluster, and an instruction to read the broader area before fixing
- For isolated items: dispatch exactly as today (one agent per thread, same-file grouping still applies)
- Batching rule adjusts: clusters count as 1 dispatch unit regardless of how many threads they contain; batching of 4 applies to dispatch units (clusters + isolated items), not raw thread count
- Sequential fallback ordering: when the platform does not support parallel dispatch, dispatch cluster units first (they are higher-leverage), then isolated items
- The agent for a cluster returns one summary per thread it handled (same verdict structure), plus a `cluster_assessment` field describing what broader investigation revealed and whether a holistic or individual approach was taken

**Patterns to follow:**
- Existing same-file grouping and batching logic at SKILL.md lines 107-113
- The pr-comment-resolver's multi-thread-on-same-file handling — similar pattern, extended to multi-thread-on-same-theme

**Test scenarios:**
- Happy path: 1 cluster of 3 threads + 2 isolated threads -> 3 dispatch units (1 cluster agent + 2 individual agents), all within the batch-of-4 limit
- Happy path: cluster agent receives the `<cluster-brief>` XML block and all 3 thread details in its prompt
- Edge case: 8 isolated items, no clusters -> existing behavior unchanged (2 batches of 4)
- Edge case: sequential fallback -> clusters dispatched before isolated items
- Edge case: 2 clusters of 3 each + 2 isolated -> 4 dispatch units (2 cluster agents + 2 individual agents)
- Happy path: cluster agent returns per-thread verdicts (one summary per thread, same structure as individual agents)

**Verification:**
- Clustered threads are handled by a single agent dispatch with the cluster brief as context
- Isolated threads are dispatched individually as before
- Batching counts dispatch units, not raw threads

---

- [x] **Unit 3: Extend pr-comment-resolver for cluster investigation**

**Goal:** Add cluster-aware workflow to the pr-comment-resolver agent so it can receive a cluster brief and investigate the broader area before making targeted fixes.

**Requirements:** R2

**Dependencies:** Unit 2

**Files:**
- Modify: `plugins/compound-engineering/agents/workflow/ce-pr-comment-resolver.agent.md`

**Approach:**
- Add a "Cluster Mode" section to the agent, structured as a mode detection table (following ce:review's pattern): if a `<cluster-brief>` XML block is present in the prompt, activate cluster mode; otherwise, standard single-thread mode
- Cluster mode workflow: (1) Parse the `<cluster-brief>` block for theme, area, file paths, thread IDs, and hypothesis. (2) Read the broader area — not just the referenced lines, but the full file(s) and closely related code in the same directory. (3) Assess whether the individual comments are symptoms of a deeper structural issue. (4) If yes: make a holistic fix that addresses the root cause, then verify each thread is resolved by the broader fix. (5) If no: fix each thread individually as in standard mode.
- The agent returns the standard per-thread verdict summaries plus a `cluster_assessment` field: a brief description of what broader investigation revealed and whether a holistic or individual approach was taken. This field is consumed by the orchestrator's Summary step to present cluster investigation results to the user
- Add 1-2 examples showing cluster-aware evaluation (e.g., 3 error handling comments -> agent reads broader area, identifies missing error boundary pattern, adds it, resolves all 3 threads)
- Update the agent's frontmatter description to reflect that it handles one or more related threads (e.g., "Evaluates and resolves one or more related PR review threads -- assesses validity, implements fixes, and returns structured summaries with reply text. Spawned by the resolve-pr-feedback skill.")
- Preserve existing single-thread behavior unchanged when no `<cluster-brief>` block is present

**Patterns to follow:**
- Existing multi-thread-on-same-file handling in the agent (it already handles multiple threads sequentially when grouped by file)
- The evaluation rubric's existing structure — cluster mode adds a preliminary "read broader area" step before applying the rubric to each thread

**Test scenarios:**
- Happy path: agent receives cluster brief about "missing validation" across 3 functions -> reads full file, identifies validation pattern gap, adds validation helper and applies to all 3 locations, returns 3 `fixed` verdicts + cluster_assessment
- Happy path: agent receives cluster brief but determines individual fixes suffice (comments are coincidentally in same area but unrelated root causes) -> fixes individually, cluster_assessment says "individual fixes appropriate"
- Edge case: cluster brief + 1 thread that's actually `not-addressing` -> agent still investigates broadly for the valid threads, returns `not-addressing` for the invalid one
- Happy path: no `<cluster-brief>` block provided -> existing single-thread behavior unchanged (including when dispatched by todo-resolve, which never sends a cluster brief)
- Integration: cluster agent's per-thread verdicts flow correctly into the orchestrator's commit/reply/resolve steps
- Integration: cluster_assessment field is consumed by the Summary step to present investigation results to the user

**Verification:**
- Agent reads the broader area before fixing when `<cluster-brief>` block is present
- Agent returns per-thread verdicts compatible with the orchestrator's existing commit/reply/resolve flow
- Existing single-thread behavior is preserved when no `<cluster-brief>` block is present
- The `<cluster-brief>` XML delimiter prevents accidental cluster mode activation from other consumers (e.g., todo-resolve)

---

- [x] **Unit 4: Add verify-loop re-entry handling and iteration cap**

**Goal:** Modify the Verify step so that any verify-loop re-entry (new feedback after a fix round) automatically triggers the cluster analysis gate from Unit 1, and cap iterations to prevent infinite loops.

**Requirements:** R3, R6

**Dependencies:** Unit 1

**Files:**
- Modify: `plugins/compound-engineering/skills/resolve-pr-feedback/SKILL.md`

**Approach:**
- In the Verify step, after re-fetching feedback, if new threads remain: record the files and themes just fixed in this cycle, then loop back to Triage (Step 2). The cluster analysis gate in Step 2.5 fires automatically because "verify-loop re-entry" is one of its gate signals. No separate comparison or concern-category matching needed — the cluster analysis step itself handles thematic grouping with the just-fixed context
- On re-entry, pass the list of files modified in the previous cycle to the cluster analysis step so it can assess whether new feedback relates to just-fixed areas
- Add an iteration cap: after 2 fix-verify cycles, surface remaining issues to the user with context about the recurring pattern rather than continuing to loop. Frame it as: "Multiple rounds of feedback on [area/theme] suggest a deeper issue. Here's what we've fixed so far and what keeps appearing." (Consistent with ce:review's `max_rounds: 2` bounded re-review loop)
- The iteration cap applies per-run, not per-cluster

**Patterns to follow:**
- The existing verify-and-repeat logic at SKILL.md lines 186-189
- The whack-a-mole state machine pattern from `docs/solutions/skill-design/git-workflow-skills-need-explicit-state-machines-2026-03-27.md`
- The `needs-human` escalation pattern already in the skill — iteration cap uses the same "surface to user with structured context" approach
- The ce:review `max_rounds: 2` bounded loop precedent

**Test scenarios:**
- Happy path: fix 3 issues, verify re-fetch finds 2 new issues -> re-entry triggers gate, cluster analysis runs with just-fixed context, new items may form a cluster with the just-fixed area context
- Happy path: fix 3 issues, verify re-fetch finds 1 unrelated issue on different file -> re-entry triggers gate, cluster analysis runs but finds no cluster (1 item, different area), proceeds with individual dispatch
- Edge case: 2 fix-verify cycles -> after 2nd cycle, surface to user with "recurring pattern" framing instead of looping again
- Edge case: fix round resolves everything, verify finds zero new threads -> clean exit, no re-entry
- Edge case: re-entry with only 1 new item on a file that was just fixed -> gate fires (re-entry), cluster analysis has just-fixed context to assess the connection
- Integration: verify-loop re-entry feeds into the same gated cluster analysis step from Unit 1 (not a separate mechanism)

**Verification:**
- Any verify-loop re-entry triggers the cluster analysis gate
- The cluster analysis step receives just-fixed file context on re-entry
- Iteration cap prevents infinite fix-verify loops
- No separate concern-category matching or structural comparison needed for cross-cycle detection

## System-Wide Impact

- **Interaction graph:** The resolve-pr-feedback skill dispatches pr-comment-resolver agents. This change modifies what context those agents receive (`<cluster-brief>` XML block) and how the orchestrator decides dispatch grouping. The commit/reply/resolve flow downstream is unchanged — cluster agents return the same per-thread verdict structure. The `cluster_assessment` field flows into the Summary step as a new section: "Cluster investigations: [count clusters investigated, what was found, holistic vs individual approach taken]."
- **Error propagation:** If cluster analysis fails or produces no clusters, the skill falls back to existing individual dispatch. The cluster analysis step is additive — failure means the existing behavior, not a broken workflow. "Fails" means the orchestrator produces zero clusters from the analysis — in which case all items are dispatched individually. The user sees no difference from the existing behavior.
- **State lifecycle risks:** The cross-cycle detection compares "just resolved" threads to "newly appeared" threads. This comparison happens within a single skill run and does not persist state across runs. No new state storage needed.
- **API surface parity:** The todo-resolve skill also uses pr-comment-resolver but dispatches for individual todos, not PR feedback clusters. No changes needed to todo-resolve — the cluster mode in pr-comment-resolver only activates when a cluster brief is present.
- **Unchanged invariants:** Targeted mode (single URL) is completely unaffected — it is a separate entry path and never triggers cluster analysis. The verdict taxonomy, reply format, GraphQL scripts, and commit/push flow are all unchanged. The pr-comment-resolver agent's existing single-thread behavior is preserved when no `<cluster-brief>` block is present, ensuring todo-resolve and any other consumers are unaffected.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Cluster detection is too aggressive (groups unrelated items) | Require both thematic similarity AND spatial proximity. The decision matrix has clear thresholds. Easy to tune prompt wording if false positives appear. |
| Cluster detection is too conservative (misses real patterns) | Low threshold (2+ items). Agent time is cheap — false positive clusters just mean a broader read before fixing, which rarely hurts. |
| Cluster agent makes a holistic fix that breaks something the individual fixes wouldn't have | The agent still returns per-thread verdicts. The verify step catches regressions. The iteration cap prevents infinite loops. |
| Verify-loop re-entry triggers gate unnecessarily (new feedback is unrelated to just-fixed work) | Low cost — the gate fires, cluster analysis runs, finds no cluster, and proceeds with individual dispatch. The only overhead is the analysis step itself, which is lightweight when no clusters exist. |
| Cluster analysis runs too often (gate too sensitive) | Only 2 signals: volume >= 4 and re-entry. Volume threshold is tunable. False positive gates add only the analysis step overhead — no agent dispatch, no broader-area reads. |
| Cluster analysis runs too rarely (gate too conservative) | The gate is additive — if it misses a cluster on the first pass (e.g., 3 items about the same theme, below volume threshold), verify-loop re-entry catches it on the second pass. One extra review cycle is an acceptable cost for keeping the common case fast. |
| Prompt length growth in SKILL.md | The gated cluster analysis step adds ~40-60 lines. The skill is currently 285 lines. This keeps it under 350, well within reasonable skill length. |

## Sources & References

- Related code: `plugins/compound-engineering/skills/resolve-pr-feedback/SKILL.md`
- Related code: `plugins/compound-engineering/agents/workflow/ce-pr-comment-resolver.agent.md`
- Institutional learning: `docs/solutions/skill-design/git-workflow-skills-need-explicit-state-machines-2026-03-27.md`
- Institutional learning: `docs/solutions/workflow/todo-status-lifecycle.md`
- Institutional learning: `docs/solutions/skill-design/pass-paths-not-content-to-subagents-2026-03-26.md`
