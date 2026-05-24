---
title: "feat(resolve-pr-feedback): cross-invocation cluster analysis"
type: feat
status: completed
date: 2026-04-01
origin: docs/brainstorms/2026-04-01-cross-invocation-cluster-analysis-requirements.md
---

# Cross-Invocation Cluster Analysis for resolve-pr-feedback

## Overview

Replace the dead verify-loop re-entry gate signal in the resolve-pr-feedback skill with a cross-invocation awareness signal that detects recurring feedback patterns across multiple review rounds on the same PR. The change touches three files: the `get-pr-comments` script (data), the SKILL.md (orchestration), and the pr-comment-resolver agent (cluster handling).

## Problem Frame

The skill's cluster analysis has two gates: volume (3+ items) and verify-loop re-entry (2nd+ pass within same invocation). The verify-loop gate is dead — automated reviewers post minutes after push, but verify runs seconds after. This leaves volume as the only gate, which misses the highest-value scenario: a reviewer posts 1-2 threads per round about the same class of problem across multiple rounds. Cross-invocation awareness detects this pattern by checking for resolved threads alongside new ones — evidence of multi-round review. (see origin: `docs/brainstorms/2026-04-01-cross-invocation-cluster-analysis-requirements.md`)

## Requirements Trace

- R1. Cross-invocation awareness signal replaces verify-loop re-entry gate
- R2. Prior resolutions + new feedback = re-entry signal, even with 1 new item
- R3. Volume gate (3+) unchanged, OR'd with cross-invocation signal
- R4. Clustering input includes new + prior threads (bounded to last N)
- R5. Previously-resolved threads participate in category assignment and spatial grouping
- R6. Three-mode resolver assessment: band-aid (redo), correct-but-incomplete (investigate siblings), sound-and-independent (context only)
- R7. Cluster brief gains `<prior-resolutions>` element with metadata
- R8. Within-session verify loop subsumes into cross-invocation signal
- R9. Zero additional GraphQL calls — broaden existing query's jq filter
- R10. Bounded lookback: last N resolved threads (simplified from "rounds" — see Key Technical Decisions)

## Scope Boundaries

- No persistent state files or `.context/` storage
- No changes to the volume gate threshold or spatial grouping rules
- No changes to standard (non-cluster) thread handling
- No new scripts — extend the existing `get-pr-comments` script

## Context & Research

### Relevant Code and Patterns

- `plugins/compound-engineering/skills/resolve-pr-feedback/SKILL.md` — skill orchestration, steps 1-9
- `plugins/compound-engineering/skills/resolve-pr-feedback/scripts/get-pr-comments` — GraphQL query + jq filter; already fetches resolved threads in the query but drops them in jq (`isResolved == false`)
- `plugins/compound-engineering/agents/workflow/ce-pr-comment-resolver.agent.md` — resolver agent with standard and cluster modes

### Institutional Learnings

- **Script-first architecture** (`docs/solutions/skill-design/script-first-skill-architecture.md`): Classification and filtering logic must live in the script, not in SKILL.md instructions. The script should output pre-computed analysis so the model receives structured decisions, not raw data to classify. 60-75% token savings.
- **Explicit state machines** (`docs/solutions/skill-design/git-workflow-skills-need-explicit-state-machines-2026-03-27.md`): Model the cross-invocation gate as a decision table with explicit outcomes, not prose conditionals.
- **Pass paths, not content** (`docs/solutions/skill-design/pass-paths-not-content-to-subagents-2026-03-26.md`): The `<prior-resolutions>` element should contain metadata (thread IDs, categories, file paths, timestamps), not full comment bodies. The resolver reads full content on demand.
- **Status-gated resolution** (`docs/solutions/workflow/todo-status-lifecycle.md`): Previously-resolved threads must be enforced at the dispatch boundary — they participate in clustering but are never individually dispatched.

## Key Technical Decisions

- **jq filter change, not GraphQL change**: The existing query fetches all threads including resolved ones. The `isResolved == false` filter is in jq. Broadening this filter adds resolved threads to the output at zero API cost. (see origin: R9)
- **Any resolved thread is a prior resolution — no author matching needed**: The brainstorm originally required detecting the skill's own prior replies. The plan simplifies this: any resolved thread on the PR is evidence of a prior review round. This eliminates the `gh api user` call, `author.login` matching, reply pattern detection, and the `set -e` error handling complexity. Multi-round review is the signal, regardless of who resolved the threads.
- **N bounds total resolved threads, not "rounds"**: The brainstorm defined "rounds" as groups of threads resolved in a single invocation, which required fragile timestamp-based clustering in jq. The plan simplifies to: take the last N resolved threads (by `createdAt` of the most recent comment). This is a trivial jq sort + limit. N=10 is the starting value (covering typical PR history without excessive data). Successive reviews naturally cluster around changed code, so thread-level bounding is sufficient.
- **No spatial overlap check**: The brainstorm's R11 specified a lightweight overlap check before full clustering. The plan drops this: successive reviews almost always cluster around the same code areas, so the overlap check would almost always pass. The cost it prevents (clustering with ~10 resolved threads + 1-2 new ones) is small. Skipping it keeps the orchestration simpler.
- **Script computes the cross-invocation envelope**: Per the script-first learning, the script outputs a `cross_invocation` object with `signal` (boolean) and `resolved_threads` (array). The SKILL.md receives pre-computed analysis.

## Open Questions

### Resolved During Planning

- **How to detect prior resolutions**: Any resolved thread = prior resolution. No author matching, no reply pattern matching, no user API call. Resolved threads exist alongside new ones in the script output.
- **How to bound the lookback**: Last N=10 resolved threads by most-recent comment timestamp. Simple jq sort + slice.
- **Whether to check spatial overlap first**: No. Successive reviews naturally cluster around changed code. The overlap check adds orchestration complexity for negligible token savings.

### Deferred to Implementation

- **Optimal value of N**: Starting at 10. If PRs with extensive resolved thread history show performance issues, reduce. If patterns are missed, increase.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
┌──────────────────────────────────────────────────────┐
│  get-pr-comments script (data layer)                 │
│                                                      │
│  GraphQL query (unchanged)                           │
│       │                                              │
│       ▼                                              │
│  jq filter (broadened)                               │
│       │                                              │
│       ├── review_threads: [unresolved, as before]    │
│       ├── pr_comments: [as before]                   │
│       ├── review_bodies: [as before]                 │
│       └── cross_invocation:                          │
│             signal: true/false                        │
│             resolved_threads: [                       │
│               { thread_id, path, line,               │
│                 first_comment_body, last_comment_at } │
│               ...last N by recency                   │
│             ]                                        │
└──────────────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────┐
│  SKILL.md (orchestration layer)                      │
│                                                      │
│  Step 1: Fetch (calls modified script)               │
│                                                      │
│  Step 2: Triage (as before)                          │
│                                                      │
│  Step 3: Cluster gate (CHANGED)                      │
│    ┌────────────────────────────────────────────┐    │
│    │ Volume (3+)? ─── YES ──> full clustering   │    │
│    │      │                                     │    │
│    │      NO                                    │    │
│    │      │                                     │    │
│    │ cross_invocation.signal? ─ NO ──> skip     │    │
│    │      │                                     │    │
│    │     YES                                    │    │
│    │      │                                     │    │
│    │ Full clustering (new + resolved threads)   │    │
│    └────────────────────────────────────────────┘    │
│                                                      │
│  Step 5: Dispatch                                    │
│    - resolved threads: cluster input only            │
│    - new threads: cluster or individual              │
│                                                      │
│  Step 8: Verify loop (simplified)                    │
│    - removes old verify-loop re-entry logic          │
│    - relies on cross-invocation signal next run      │
└──────────────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────┐
│  pr-comment-resolver agent (cluster mode)            │
│                                                      │
│  Receives <cluster-brief> with <prior-resolutions>   │
│                                                      │
│  Three-mode assessment:                              │
│    1. Band-aid: redo prior fixes holistically        │
│    2. Correct-but-incomplete: keep fixes,            │
│       investigate sibling code                       │
│    3. Sound-and-independent: context only            │
└──────────────────────────────────────────────────────┘
```

## Implementation Units

- [x] **Unit 1: Extend `get-pr-comments` script**

**Goal:** Broaden the jq filter to include resolved threads and output a cross-invocation envelope alongside the existing data.

**Requirements:** R1, R2, R9, R10

**Dependencies:** None

**Files:**
- Modify: `plugins/compound-engineering/skills/resolve-pr-feedback/scripts/get-pr-comments`

**Approach:**
- Widen the jq filter: keep the existing `review_threads` array (unresolved, non-outdated, as before). Add a new selection for resolved threads (`isResolved == true`), sorted by most-recent comment `createdAt`, limited to the last N=10.
- Output the existing three keys (`review_threads`, `pr_comments`, `review_bodies`) unchanged, plus a new `cross_invocation` object containing: `signal` (boolean — true when both resolved threads and unresolved review threads exist), and `resolved_threads` (array of objects with `thread_id`, `path`, `line`, `first_comment_body`, `last_comment_at`).
- No `gh api user` call. No author matching. No reply pattern detection. The signal is simply: resolved threads exist AND new threads exist.

**Patterns to follow:**
- Existing jq pipeline in `get-pr-comments` — extend the `$pr` extraction, don't restructure it
- Keep all logic in jq

**Test scenarios:**
- Happy path: PR with 2 resolved threads and 1 new thread -> `cross_invocation.signal: true`, `resolved_threads` has 2 entries, `review_threads` has 1
- Happy path: PR with no resolved threads -> `cross_invocation.signal: false`, `resolved_threads` empty
- Happy path: PR with resolved threads but no unresolved threads -> `cross_invocation.signal: false` (nothing new to cluster)
- Edge case: PR with 20 resolved threads -> only last 10 (by recency) included
- Edge case: PR with resolved threads but all unresolved threads are outdated -> `review_threads` empty, signal false

**Verification:**
- Run against a test PR with known resolved threads and verify the output JSON shape
- Existing `review_threads`, `pr_comments`, `review_bodies` output is identical to current behavior

---

- [x] **Unit 2: Update SKILL.md orchestration**

**Goal:** Replace the verify-loop re-entry gate with the cross-invocation signal, update cluster brief format, enforce dispatch boundary for resolved threads, and simplify the verify loop.

**Requirements:** R1, R2, R3, R4, R5, R7, R8

**Dependencies:** Unit 1 (script must output the cross-invocation envelope)

**Files:**
- Modify: `plugins/compound-engineering/skills/resolve-pr-feedback/SKILL.md`

**Approach:**

*Step 1 (Fetch)*: No change — the script now returns the cross-invocation envelope automatically.

*Step 2 (Triage)*: No changes. Triage classifies new vs already-handled among unresolved threads. Resolved threads from `cross_invocation` are not triage subjects — they're a separate input to clustering.

*Step 3 (Cluster Analysis)*: Replace the gate table:

| Gate signal | Check |
|---|---|
| **Volume** | 3+ new items from triage |
| **Cross-invocation** | `cross_invocation.signal == true` |

When cross-invocation gate fires: include resolved threads from `cross_invocation.resolved_threads` alongside new threads in category assignment and spatial grouping. Resolved threads get a `previously_resolved` marker.

Update cluster brief XML to include `<prior-resolutions>`:
```xml
<cluster-brief>
  <theme>[concern category]</theme>
  <area>[common directory path]</area>
  <files>[comma-separated file paths]</files>
  <threads>[comma-separated thread/comment IDs]</threads>
  <hypothesis>[one sentence]</hypothesis>
  <prior-resolutions>
    <thread id="PRRT_..." path="..." category="..."/>
  </prior-resolutions>
</cluster-brief>
```

Remove the `<just-fixed-files>` element — subsumed by `<prior-resolutions>`.

*Step 5 (Dispatch)*: Add dispatch boundary rule: resolved threads participate in clustering and appear in cluster briefs, but are NEVER individually dispatched. Only new threads get individual or cluster dispatch.

*Step 8 (Verify)*: Simplify. Remove "Record which files were modified and which concern categories were addressed" and the verify-loop re-entry language. If new threads remain after 2 fix-verify cycles, escalate. Cross-invocation signal handles re-entry across sessions; within-session re-entry works because replies from earlier cycles make threads resolved on re-fetch.

**Patterns to follow:**
- Existing gate table format in step 3
- Existing cluster brief XML structure
- Existing dispatch boundary logic in step 5

**Test scenarios:**
- Happy path: 1 new thread + cross-invocation signal -> cluster analysis runs, resolved threads included
- Happy path: 3 new threads + no cross-invocation signal -> volume gate fires, no resolved threads
- Happy path: 1 new thread + no cross-invocation signal -> both gates skip, no clustering
- Edge case: cross-invocation cluster with 1 new + 2 resolved -> brief includes all 3, dispatch only addresses the new thread (plus siblings the resolver identifies)
- Edge case: resolved thread in a cluster -> in the brief for context, NOT dispatched individually
- Integration: verify loop re-fetches after this session's fixes, resolved threads from this cycle appear in `cross_invocation`

**Verification:**
- Gate table in step 3 has exactly two rows (Volume, Cross-invocation)
- No references to "verify-loop re-entry" remain
- `<just-fixed-files>` removed from cluster brief documentation
- Step 5 has "resolved threads are cluster-only" rule
- Step 8 no longer tracks files/categories or references re-entry as a gate signal

---

- [x] **Unit 3: Update pr-comment-resolver agent for cross-invocation clusters**

**Goal:** Add handling for the `<prior-resolutions>` element in cluster mode and implement the three-mode assessment for cross-invocation clusters.

**Requirements:** R6, R7

**Dependencies:** Unit 2 (SKILL.md must send the new cluster brief format)

**Files:**
- Modify: `plugins/compound-engineering/agents/workflow/ce-pr-comment-resolver.agent.md`

**Approach:**

Update the Cluster Mode Workflow section:

Step 1 (Parse cluster brief): Add `<prior-resolutions>` to parsed elements.

Step 3 (Assess root cause): When `<prior-resolutions>` is present, expand from two modes (systemic vs coincidental) to three:

- **Band-aid fixes** — prior fixes addressed symptoms, not root cause. Approach: re-examine prior fix locations, implement holistic fix.
- **Correct but incomplete** — prior fixes were right for their files, but the recurring pattern likely exists in untouched sibling code. This is the highest-value mode. Approach: keep prior fixes, fix the new thread, proactively investigate files in the same directory/module for the same pattern. Report findings in cluster assessment.
- **Sound and independent** — prior fixes adequate, new thread is genuinely unrelated. Approach: fix individually, use prior context for awareness only.

Add a cross-invocation example showing the "correct but incomplete" mode.

Update `cluster_assessment` return to include which mode was applied and, for "correct but incomplete" mode, which additional files were investigated.

**Patterns to follow:**
- Existing cluster mode workflow structure
- Existing example format in `<examples>`
- Existing `cluster_assessment` return structure

**Test scenarios:**
- Happy path: cluster with `<prior-resolutions>` where pattern extends to untouched code -> "correct but incomplete", investigates siblings
- Happy path: cluster with `<prior-resolutions>` where prior fixes were shallow -> "band-aid", holistic fix
- Happy path: cluster with `<prior-resolutions>` where new thread is unrelated -> "sound and independent"
- Happy path: cluster WITHOUT `<prior-resolutions>` -> existing two-mode assessment, no behavior change
- Edge case: `<prior-resolutions>` present but empty -> fall back to existing behavior

**Verification:**
- Cluster mode workflow mentions all three assessment modes
- `<prior-resolutions>` is listed as a parsed element
- New example demonstrates "correct but incomplete" mode
- `cluster_assessment` format documented for all three modes
- References to `<just-fixed-files>` removed (subsumed by `<prior-resolutions>`)
- Existing standard mode and non-prior cluster mode unchanged

## System-Wide Impact

- **Interaction graph:** `get-pr-comments` is called by SKILL.md step 1 and step 8 (verify). Both callers now receive the `cross_invocation` envelope. Step 8's re-fetch picks up this session's replies as resolved threads.
- **Error propagation:** No new external calls to fail. The only change is a jq filter broadening — if resolved threads are missing from the GraphQL response, `cross_invocation.signal` is false (graceful degradation).
- **API surface parity:** The script's existing three output keys are unchanged. Callers that don't read `cross_invocation` are unaffected.
- **Unchanged invariants:** Targeted mode is unaffected. Volume gate threshold, spatial grouping rules, and individual dispatch logic are unchanged.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Resolved threads from manual (non-skill) resolution included as prior resolutions | Acceptable — any resolved thread is evidence of prior review attention. If it was manually resolved without a fix, clustering with it may produce a "sound and independent" assessment, which is the correct outcome |
| Resolved threads with 50+ comments hit pagination limits | Existing query fetches `comments(first: 50)`. The `last_comment_at` timestamp comes from whatever comments are fetched — graceful degradation |
| "Correct but incomplete" mode causes resolver to touch files not in review threads | Bounded by the cluster's `<area>` (directory path). Resolver already reads broadly in cluster mode |
| Within-session verify loop depends on GitHub API reflecting resolved state quickly | GitHub's GraphQL is eventually consistent. If a just-resolved thread hasn't propagated, the cross-invocation signal won't fire for that thread on re-fetch — it will be caught on the next invocation instead. Acceptable degradation |

## Sources & References

- **Origin document:** [docs/brainstorms/2026-04-01-cross-invocation-cluster-analysis-requirements.md](docs/brainstorms/2026-04-01-cross-invocation-cluster-analysis-requirements.md)
- Related skill: `plugins/compound-engineering/skills/resolve-pr-feedback/SKILL.md`
- Related agent: `plugins/compound-engineering/agents/workflow/ce-pr-comment-resolver.agent.md`
- Related script: `plugins/compound-engineering/skills/resolve-pr-feedback/scripts/get-pr-comments`
- Learnings: `docs/solutions/skill-design/script-first-skill-architecture.md`, `docs/solutions/skill-design/git-workflow-skills-need-explicit-state-machines-2026-03-27.md`
