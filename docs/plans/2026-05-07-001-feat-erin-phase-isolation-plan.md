---
title: "feat(erin): subagent wrapping for the work phase"
type: feat
status: active
date: 2026-05-07
origin: docs/brainstorms/2026-05-07-erin-phase-isolation-requirements.md
spike: docs/solutions/2026-05-07-agent-tool-depth-2-spike.md
---

> **🔬 Unit 1 spike result (2026-05-07):** Direct depth-2 Agent dispatch is NOT supported by the platform — subagents lack the `Agent` tool. Two workarounds verified: (A) constrain `/ce:work-wrapped` to inline-only execution with no Agent-dispatching sub-skills, sufficient for v1; (B) use `claude -p` subprocess to bypass the constraint when nested dispatch is genuinely needed (works, ~16s overhead per subprocess, streaming fidelity regression). v1 proceeds with Workaround A. See [findings](../solutions/2026-05-07-agent-tool-depth-2-spike.md). Units 2–4 below are revised to reflect Workaround A.

# Erin Phase Isolation: Subagent Wrapping for the Work Phase

**Target repos:**
- `ce-reviewers-jsl` — `orchestrators/erin.md`
- `compound-engineering-plugin` — `ce-run` skill (small hook), spike findings, dogfood notes

## Overview

Wrap Erin's `work` phase as an `Agent`-tool subagent so its tool churn runs in an isolated context instead of the main thread. Add a small `run-state.md` Erin maintains so workflows survive `/compact` mid-flow. Test it by running `/ce:run erin` on a real feature; let dogfood evidence drive what comes next.

This plan was rewritten substantially after Jason/Charles/Marty/Melissa/Sandy plan-review converged on "the previous plan is overbuilt — ship the cupcake, eat it, let usage tell you which layer to add next." (see origin: `docs/brainstorms/2026-05-07-erin-phase-isolation-requirements.md`)

## Problem Frame

Two distinct pains drive this work, and the prior version of this plan re-conflated them:

1. **Context bloat.** `/ce:work` runs in-thread; its tool churn fills the main conversation context, forcing manual `/compact` mid-workflow.
2. **Memory loss across `/compact`.** When Jeff `/compact`s, Erin loses the workflow thread.

Pain #2 is solved by **a single small file Erin reads on resume** — no subagent infrastructure. Pain #1 is solved by **dispatching `/ce:work` as a subagent**. v1 ships both, but treats them as independent mechanisms with the smallest possible coupling.

The success signal is qualitative: did Jeff complete a representative real workflow with `/ce:run erin` *without* manually `/compact`-ing mid-flow, AND if he chose to `/compact`, did Erin resume cleanly? Token-percentage targets were reviewer-flagged as output metrics in disguise; the real outcome is Jeff's flow state.

## Requirements Trace

This plan satisfies the load-bearing requirements from the origin document. Many requirements (R30–R32 explicit non-goals, several deferred-to-planning items) are now covered by *omission* rather than positive design — the simplification was the point.

- **R1, R2, R3** (platform spike, hard gate): Unit 1 — qualitative gate, not numeric thresholds (per plan-review)
- **R4–R9** (`wrapped: true` flag, dispatch, args, prompt scope, model resolution): Units 2 + 3
- **R10–R12** (only `work` wrapped in v1): Unit 3
- **R13–R17** (handoff contract): inlined into Unit 3 prose, not extracted as a spec — minimal schema
- **R18, R19** (Erin verifies via git diff, empty-success check): Unit 3 — keep these; drop floor/ratio/calibration as premature
- **R20** (discrepancy ratio): **DROPPED from v1.** Reviewer consensus: ship just the empty-success check; if false positives bite, add tiers. Re-add on evidence, not anticipation.
- **R21** (re-spawn once with corrective prompt): Unit 3
- **R22** (surface to user on second failure): Unit 3
- **R23** (needs-input is hard halt): Unit 3
- **R24, R25** (Erin disagrees / override / re-dispatch / escalate): **DROPPED as a formal protocol.** Erin uses judgment as she always has. Re-add if a real disagreement loop appears.
- **R26–R28** (run-state for `/compact` survival): Unit 3
- **R29** (pre-plan run-state migration): **DROPPED.** Run-state stays at `docs/runs/<run-id>/` for the entire workflow; plan file gets a single frontmatter line forward-linking to the run dir if desired. No migration, no `MOVED.md`, no recovery branch.
- **R30–R32** (explicit non-goals): preserved as omissions in Erin's prose
- **Synthetic test scenarios**: **DROPPED.** Replaced by Unit 4 (one real-feature dogfood). The mock fixture was reviewer-flagged as "fiction validating fiction."

## Scope Boundaries

- **No `tina.md` persona file.** Wrapping is infrastructure.
- **No contract spec document.** The handoff format is described inline in Erin's prose. If a second consumer needs the contract documented separately, extract then.
- **No FLOOR / ratio / calibration logic.** Just empty-success check.
- **No discrepancy claimed-vs-verified machinery.** Drop `claimed_*` fields from the handoff entirely; `git diff` is ground truth, no need to police a self-report Erin can verify directly.
- **No mock fixture, no scenario test suite.** Dogfood validates v1.
- **No atomic write-temp-rename ceremony.** Erin uses the Write tool; mtime reconciliation is the recovery mechanism.
- **No pre-plan migration.** Run-state lives in `docs/runs/<run-id>/` for the workflow's lifetime.
- **No plan-rename detection.** Acknowledged as rare; surface naturally if it happens.
- **No formal Erin-disagrees protocol.** Just judgment.
- **No bounded re-dispatch counts.** Trust Erin; revisit if loops appear.
- **No JSONL event log.** Foreground subagent terminal streaming is the visibility channel.
- **No dialogue-relay for needs-input.** Hard halt; user re-runs `/ce:run erin` with answers in args.
- **No generic `wrapped: <persona>` primitive in `ce-run`.** Just a small `wrapped: true` recognition hook.
- **Only the `work` phase wrapped in v1.** `review`, `plan-review`, `everyday-usability` are reconsidered after dogfood evidence.
- **Wrapped `/ce:work` is pinned to Inline execution strategy.** Per Unit 1 spike: subagents lack the `Agent` tool, so `/ce:work`'s Serial-subagent / Parallel-subagent / Swarm strategies cannot run inside the wrapped subagent. Erin's dispatch prompt explicitly forces Inline strategy and forbids nested skill invocations that would dispatch (e.g., `/ce:review`). Plans that genuinely need internal fan-out are out of scope for v1; if the need appears, escalate to Workaround B per the spike findings.

## Context & Research

### Relevant Code and Patterns

- `ce-reviewers-jsl/orchestrators/erin.md` — confirmed exists; gains `wrapped: true` on the work phase + a new behavior section.
- `compound-engineering-plugin/plugins/compound-engineering/skills/ce-run/SKILL.md` — confirmed exists; gains a small wrapped-phase hook.
- Existing reviewer subagent dispatches in `/ce:review` — depth-1 pattern reference.
- Other orchestrator files (`angie.md`, `lfg.md`, `max.md`) — prose style reference.

### Institutional Learnings

- CLAUDE.md flags subagent-spawning-subagents as a known constraint for *orchestrators*. This plan dispatches the `/ce:work` *skill* at depth-2, not Erin herself. Spike (Unit 1) verifies depth-2 skill dispatch.
- The `orchestrating-swarms` skill exists for a different shape (TeammateTool, persistent inboxes); not applicable.

## Key Technical Decisions

- **Ship the cupcake.** v1 is: dispatch `/ce:work` via Agent + write a tiny run-state file + read it on resume + verify with `git diff`. That's it. Every defensive subsystem the prior plan added (FLOOR, ratio rule, mock fixture, atomic ceremony, plan-rename detection, three-option Erin-disagrees protocol) was reviewer-flagged as defending against problems that haven't happened. Cut to minimum; add tiers on evidence.
- **Run-state and wrapping are independent mechanisms.** Pain #2 (`/compact` survival) is fully solved by run-state.md alone. Pain #1 (context bloat) is solved by wrapping. They ship together because the work touches one file (Erin's persona), but they don't depend on each other functionally — if the spike fails, run-state still ships and is useful.
- **Qualitative spike gate, not numeric thresholds.** Per Charles + Jason + Marty: the platform doesn't expose per-subagent token cost as a public API. Inventing 20%/50% thresholds against an undefined primitive is fighting the constraint. Real gate: 5 successful depth-2 dispatches, terminal streaming visible, AND the dogfood run feels meaningfully less context-cramped than today. The latter is Jeff's call.
- **Drop `claimed_*` from the handoff.** Per Charles: if `git diff` is truth, the subagent shouldn't be asked to claim. Erin reads `git diff --stat <pre-sha>` (no `..HEAD`, includes uncommitted) for verified evidence. The handoff carries outcome prose and artifacts only. This eliminates the entire discrepancy-detection subsystem.
- **Just the empty-success check, no tiered sanity.** If `status: success` but `git diff` shows zero files and zero lines → re-spawn once with corrective prompt; surface on second failure. Floor / ratio rules added on evidence, not anticipation.
- **`ce-run` gets a small recognition hook.** One paragraph in ce-run's phase loop: "if `wrapped: true`, follow the orchestrator's wrapped-phase behavior instead of in-thread skill invocation." The orchestrator (Erin) owns dispatch parameters and post-return logic. Hook is a deterministic executor branch, not a generic primitive.
- **`needs-input` is a hard halt.** Subagent surfaces the question via the handoff; Erin halts; user re-runs `/ce:run erin` with answers in args. No in-flight resume; preserves /ce:work idempotency.
- **Run-state in `docs/runs/<run-id>/` for the entire workflow.** No migration to plan dir. The plan file may include a `run_dir:` frontmatter line forward-linking, but that's optional decoration. One location, no branching state-handling.
- **Use `git diff --stat <pre-sha>` (no `..HEAD`).** Includes working-tree changes; legitimate `/ce:work` runs may stage but not commit.
- **No ceremony around atomic writes.** Erin uses the Write tool; on a partial-write crash, the resume protocol reads run-state and reconciles against handoff mtime. The recovery is mtime-based, not write-protocol-based.
- **Trust Erin's between-phase judgment.** Drop the formal override/re-dispatch/escalate protocol. If real disagreement loops appear in dogfood, add a bound; otherwise leave Erin's prose unencumbered.

## Open Questions

### Resolved During Planning

- **Spike form:** qualitative observable gate (5 successful dispatches + streaming visible + dogfood-feel). No numeric thresholds.
- **Discrepancy strategy:** empty-success only in v1; tiered rules added on evidence.
- **Atomic write strategy:** none required; mtime reconciliation is recovery.
- **Run-state location across plan transition:** stays in `docs/runs/<run-id>/`; no migration.
- **Erin disagrees protocol:** none; judgment as today.
- **`ce-run` change:** small recognition hook, one paragraph.

### Deferred to Implementation

- **Handoff frontmatter exact fields.** Probably just `phase`, `started`, `completed`, `status`. Locked during Unit 3.
- **Run-state frontmatter exact fields.** Probably `current_phase`, `current_phase_status`, `pre_dispatch_sha` (when applicable), `last_updated`. Locked during Unit 3.
- **Spike harness form.** Bash if non-interactive Claude Code supports depth-2 dispatch reliably; manual reproducible scenarios otherwise. Decided in Unit 1.
- **Corrective-prompt template for re-spawn.** Drafted during Unit 3, refined post-dogfood if needed.

## High-Level Technical Design

> *Directional guidance for review, not implementation specification.*

**Erin's wrapped-phase behavior (Unit 3 prose):**

```
on entering a wrapped phase (ce-run yields control via the hook):
  1. write run-state.md: current_phase=<name>, current_phase_status=about_to_dispatch
  2. capture pre_dispatch_sha = git rev-parse HEAD
  3. update run-state.md: current_phase_status=dispatched, pre_dispatch_sha=<sha>
  4. dispatch via Agent tool (model: opus, prompt: skill invocation + args)

on subagent return:
  5. read handoff at docs/runs/<run-id>/handoffs/<phase>.md (or docs/plans/...
     handoffs/ if a plan dir is preferred — locked in Unit 3)
  6. parse(git diff --stat <pre_dispatch_sha>) → verified files, verified lines
  7. empty-success check: if status==success AND verified files=0 AND verified lines=0
        → suspicious; re-spawn once with corrective prompt
        → if second attempt also empty: surface to Jeff with options
  8. if status==needs-input: halt, surface questions, no resume
  9. else: update run-state.md with verified evidence + outcome
  10. proceed (Erin's judgment as today; no formal disagreement protocol)

on /ce:run erin resume after /compact:
  i. read run-state.md
  ii. ls handoffs/ for any handoff with mtime > run-state.md mtime → reconcile
  iii. proceed from current_phase + current_phase_status
```

**Run-state.md (minimal):**

```markdown
---
run_id: 2026-05-07-14-23-00-erin-foo
current_phase: work
current_phase_status: completed
pre_dispatch_sha: abc123  # only when wrapped phase is in flight or recently completed
last_updated: 2026-05-07T14:48:30Z
---

## Workflow Trace
- 2026-05-07T13:00Z brainstorm: completed
- 2026-05-07T13:45Z plan: completed
- 2026-05-07T14:23Z work: dispatched (wrapped, sha abc123)
- 2026-05-07T14:48Z work: completed (verified 7 files / 142 lines)

## Recommended Next Action
[One sentence — what comes next.]
```

**Handoff.md (minimal — no claimed_*):**

```markdown
---
phase: work
started: 2026-05-07T14:23Z
completed: 2026-05-07T14:48Z
status: success
---

## Outcome
[One sentence.]

## Artifacts
- Plan: docs/plans/...
- Commits: <sha1> <sha2>

## Recommended Next Phase Action
[One sentence.]

## Judgment Calls For Erin
[Optional — omit when nothing to flag.]
```

## Implementation Units

- [ ] **Unit 1: Platform spike — depth-2 dispatch reliability + streaming visibility (HARD GATE)**

**Goal:** Verify Claude Code's `Agent` tool supports depth-2 subagent dispatch (Opus parent → Opus child → 2 parallel Sonnet grandchildren) with visible streaming. Qualitative gate, not numeric thresholds.

**Requirements:** R1, R2, R3 (revised — qualitative)

**Dependencies:** None.

**Files:**
- Create: `compound-engineering-plugin/tests/spikes/depth-2-dispatch.<ext>` (form determined by feasibility)
- Create: `compound-engineering-plugin/docs/solutions/2026-05-07-agent-tool-depth-2-spike.md`

**Approach:**
- **Sub-step (0): Feasibility probe.** Determine if non-interactive Claude Code (`-p` mode or equivalent) supports depth-2 Agent dispatch. If yes → Bash harness. If no → manual reproducible scenarios.
- **Sub-step (1): Dispatch.** 5 runs of: Opus subagent → 2 parallel Sonnet subagents performing small synthetic tasks. Capture: success/failure per run, qualitative streaming observation.
- **Sub-step (2): Findings doc.** Records: probe result, harness form, 5/5 dispatch result, streaming observation. Optional notes on observed parent-context impact (qualitative; "felt lighter / similar / heavier" is acceptable).

Time-box to one week. If after one week the probe shows non-interactive depth-2 isn't reliable, harness becomes manual scenarios — that's not a fail, it's a form choice.

**Test scenarios:**
- *Happy path:* 5/5 runs succeed; streaming visible.
- *Failure path — dispatch unreliable:* if any run fails (excluding transient model rate limits), spike fails; redesign before further units.
- *Failure path — streaming opaque:* if leaf tool calls are invisible during the dispatch, spike fails on streaming; redesign.

**Verification:**
- Findings doc exists.
- 5/5 dispatch and streaming both pass: proceed to Unit 2.
- Either fails: halt and surface to Jeff with the findings.

---

- [ ] **Unit 2: ce-run wrapped-phase recognition hook**

**Goal:** Add a small branch to ce-run's phase loop that recognizes `wrapped: true` and yields to the orchestrator's wrapped-phase behavior.

**Requirements:** R5 (revised — hook, not primitive)

**Dependencies:** Unit 1 passes.

**Files:**
- Modify: `compound-engineering-plugin/plugins/compound-engineering/skills/ce-run/SKILL.md`

**Approach:**
- In Step 5 ("Execute phases"), after the existing optional/skip-when logic, add: "If the phase has `wrapped: true` in its frontmatter, do NOT invoke the skill in-thread. Instead, follow the orchestrator's wrapped-phase behavior section in its persona file. The orchestrator owns dispatch parameters; ce-run only recognizes the flag and yields control."
- One-paragraph rationale note: this is a hook with one defined consumer (Erin), not a generic primitive. No schemas defined here.

**Test scenarios:**
- *Integration:* `/ce:run erin <feature>` reaches the work phase → ce-run yields to Erin's wrapped-phase prose. Verified by Unit 4 dogfood.
- *No-regression:* other orchestrators (Angie, Edith, Max, etc.) without `wrapped: true` continue dispatching in-thread. Verified by inspection.

**Verification:**
- ce-run/SKILL.md contains the new branch + rationale.
- All other ce-run instructions unchanged.

---

- [ ] **Unit 3: Erin orchestrator behavior update**

**Goal:** Add `wrapped: true` to the work phase entry. Add minimal behavior prose covering dispatch, git-diff verification, empty-success check, needs-input halt, run-state writes, and resume protocol.

**Requirements:** R4, R7-R12, R18-R19, R21-R23, R26-R28 (revised — minimal)

**Dependencies:** Units 1 and 2 complete.

**Files:**
- Modify: `ce-reviewers-jsl/orchestrators/erin.md`

**Approach:**
- Frontmatter: add `wrapped: true` to the `work` phase entry.
- New behavior section "## Wrapped phases":
  - **Dispatch sequence.** Write run-state.md `about_to_dispatch` → capture pre-dispatch SHA → update run-state with SHA → Agent dispatch (model opus, prompt: skill invocation + args; no review-preferences in v1).
  - **Inline-only execution constraint (Workaround A).** Subagents in Claude Code do not have the `Agent` tool (verified by Unit 1 spike). The wrapped `/ce:work` invocation MUST therefore be constrained to inline execution. Erin's dispatch prompt must include: (1) "Choose **Inline** execution strategy in Phase 1 step 4; do NOT use Serial subagents, Parallel subagents, or Swarm Mode — they will fail at depth-2." (2) "Do NOT invoke `/ce:review`, `/ce:plan`, or any other skill that internally dispatches via `Agent` — those are separate Erin phases and must not be nested inside the wrapped `work` phase." Without these clauses the wrapped phase will error mid-flight when it tries to dispatch and the Agent tool isn't available. If a future plan genuinely needs internal fan-out, escalate to Workaround B (`claude -p` subprocess) per the spike findings — out of scope for v1.
  - **Verification on return.** Read handoff. Run `git diff --stat <pre_sha>` (no `..HEAD`) for verified files/lines.
  - **Empty-success check.** If `status in {success, partial}` AND verified files=0 AND verified lines=0 → re-spawn once with corrective prompt naming the missing evidence; surface on second occurrence.
  - **Failure recovery.** Re-spawn once on detectable failure (Agent error, malformed handoff frontmatter, missing referenced artifacts); surface on second.
  - **needs-input is a hard halt.** Subagent's questions surfaced to Jeff; workflow stops; Jeff re-runs `/ce:run erin` with answers in args.
  - **Run-state writes.** Pre-dispatch (with SHA), post-return (with verified evidence + outcome). Write tool's built-in atomicity is sufficient.
  - **Resume protocol.** Read run-state.md; scan `<run-dir>/handoffs/` for any handoff with mtime newer than run-state.md mtime → reconcile; proceed from `current_phase` + `current_phase_status`.
- **Run-state location.** `docs/runs/<run-id>/run-state.md` for the workflow's entire lifetime. No migration.
- **No formal Erin-disagrees protocol** — Erin reads the handoff and uses judgment as she always has between phases.

**Test scenarios:** Coverage by Unit 4 dogfood.

**Verification:**
- Erin's frontmatter has `wrapped: true` on exactly the work phase.
- Body contains the new "## Wrapped phases" section.
- Existing prose (review-preferences, persona voice, gate descriptions, non-wrapped behavior) preserved unchanged.

---

- [ ] **Unit 4: Dogfood on one real feature**

**Goal:** Run `/ce:run erin` on a real feature end-to-end with the wrapped work phase. Note what worked, what broke, what feels different. Decide v2 scope from the experience, not anticipation.

**Requirements:** Validates the entire v1 (success criteria, all behavioral requirements).

**Dependencies:** Units 1, 2, 3 complete.

**Files:**
- Create: `compound-engineering-plugin/docs/solutions/2026-05-XX-erin-wrapping-dogfood.md` — running notes during the dogfood run + post-mortem

**Approach:**
- Pick a real feature Jeff would run `/ce:run erin` on anyway (not synthetic). Run the workflow end-to-end with v1's wrapped work phase.
- During the run, note: did the work-phase dispatch work? Did streaming feel adequate? Did context feel less crowded than today? Did the empty-success check fire (or not)? Did `needs-input` hit (and what happened)? Did Jeff `/compact` mid-flow (intentionally or not)? Did resume work?
- After the run, write a short post-mortem in solutions/: what behaved as designed, what surprised, what should v2 add or change. This becomes the input to whatever comes next (wrapping `review`? Running per-phase token measurement? Adding the FLOOR rule because of a real false positive?).

**Test scenarios:**
- *Happy path:* workflow completes; Jeff's qualitative read is "context felt better."
- *Friction path:* something breaks (sanity check fires wrongly, streaming opaque, resume confused) — captured in the post-mortem with enough detail to inform v2.

**Verification:**
- The dogfood run completed (success or instructive failure).
- Post-mortem doc exists with concrete observations and v2 recommendations.

## System-Wide Impact

- **Interaction graph:** ce-run gains a small wrapped-phase recognition branch (Unit 2). Erin's prose owns dispatch and post-return behavior (Unit 3). Other orchestrators unaffected.
- **Error propagation:** Failures in the wrapped subagent surface via the handoff doc and return value. Erin retries once or surfaces.
- **State lifecycle:**
  - `/compact` between dispatch and return: handoff-mtime > run-state-mtime detection on resume reconciles.
  - `/compact` between SHA capture and run-state SHA-update: pre-dispatch run-state write happens FIRST as recovery anchor.
  - `/compact` between subagent return and Erin's post-return run-state write: same handoff-mtime detection.
  - Half-written run-state.md: Write tool's built-in atomicity covers this on most platforms; mtime reconciliation provides ground truth if state looks stale.
- **API surface parity:** No external API changes. Wrapped subagent prompt scope excludes review-preferences in v1 — fine because review isn't wrapped.
- **Unchanged invariants:** all other orchestrators, `/ce:work` skill, `/ce:review` reviewer dispatch (depth-1), existing plans/runs.

## Risks & Dependencies

| Risk | Type | Response |
|------|------|----------|
| Spike (Unit 1) finds depth-2 dispatch unreliable | Failure response | Halt; surface findings; redesign |
| Spike finds streaming opaque ("black box for N minutes") | Failure response | Halt; depth-2 isn't viable for v1's UX bet |
| ce-run hook doesn't reliably trigger Erin's wrapped behavior | Mitigation via Unit 4 | Dogfood catches it; iterate ce-run prose if needed |
| `/ce:work` is not idempotent enough for `needs-input` re-runs | Acceptance | R23 hard halt accepts this in v1; documented "wasted work, not destructive" |
| Empty-success check false-positives (e.g., legitimate /ce:work runs that stage but don't commit) | Mitigation | `git diff --stat <pre-sha>` without `..HEAD` includes working tree |
| Wrapping `work` doesn't actually save much main-thread context (assumption unmeasured) | Acceptance | Unit 4 dogfood validates qualitatively. If v1 doesn't help, redesign — don't build v2 |
| Plan file renamed mid-workflow → handoff dir orphaned (kept at runs/<run-id>/, not plans/<stem>/, in v1) | Mitigation by location | Run-state lives at `docs/runs/<run-id>/` regardless of plan filename. Decoupled. |
| Future contributor reads erin.md and doesn't grok the wrapping pattern | Acceptance + Unit 4 + post-merge | Sandy's cognitive-load concern noted; if confusion appears in real use, add a "How wrapping works" doc. v1 keeps it inline. |

## Documentation / Operational Notes

- **Spike findings** (Unit 1) → `docs/solutions/`. Institutional learning for future depth-2 work.
- **Dogfood post-mortem** (Unit 4) → `docs/solutions/`. Drives v2 scope decisions on evidence.
- **ce-run hook** (Unit 2) — documented inline in SKILL.md as "hook, not primitive."
- **Erin persona** (Unit 3) — only user-visible behavior change. Jeff will notice that `/ce:run erin` runs `work` differently.
- **No deployment, monitoring, feature-flag, or rollout concerns.** Local tooling. Rollout = merge → behavior changes on next `/ce:run erin`.

## Sources & References

- **Origin document:** `docs/brainstorms/2026-05-07-erin-phase-isolation-requirements.md`
- **Plan-review feedback** (Jason / Charles / Marty / Melissa / Sandy) drove the v3 simplification. Their convergent guidance: ship the cupcake; let dogfood drive what comes next.
- **CLAUDE.md (compound-engineering-plugin):** subagent-spawning-subagents constraints
- **Reference orchestrators:** `ce-reviewers-jsl/orchestrators/erin.md`, `lfg.md`, `max.md`
- **Modified skill:** `compound-engineering-plugin/plugins/compound-engineering/skills/ce-run/SKILL.md` — small wrapped-phase hook
