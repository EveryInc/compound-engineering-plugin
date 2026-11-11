Doc review applied 1 fix. 5 proposed fixes, 10 decisions, 5 FYI observations remain (12 at P1). Coverage: coherence clean; feasibility 4; product-lens 3; scope-guardian 1; adversarial 4; cross-model on Codex (requested GPT-5.6-luna, independence verified) added product-lens 4, adversarial 5, whole-document 7.

**Applied**
- U6 files: added the eval catalog file and the pre-change base-ref constant, since the pack reads scenarios from the catalog, not the markdown table (feasibility).

**Proposed fixes** (entailed by the document; awaiting one grouped confirmation)

U4, standing-instruction offer
- The `ce-setup` kernel pins a "Steps 4-9" range and enumerates two offers, so adding a third breaks a test. Fold the chat offer into the Step 9 enumeration and add the kernel file to U4 (feasibility).

U5, documentation
- The guide must quote an asset U4 creates, but U5 depends only on U1. Add U4 as a dependency and copy the section from the finished asset (cross-model: Codex).

U7, learning capture
- The unit requires a Sources link it never edits. Add the plan file to U7 and a step that inserts the learning path (cross-model: Codex).

U2, mechanical guards
- The no-opt-out-flag check duplicates the existing conventions guard. Add `ce-noslop` to the model-invoked-callees set there and drop the duplicate scenario (feasibility).

U6, eval
- Modes, protected regions, idempotence, no-edit responses, the one-line summary, and write-only-on-request have no fixtures. Expand U6 with one fixture per branch and a claim-preservation oracle (cross-model: Codex).

**Decisions** (need your judgment)

1. [P1] U6. Recommendation: Apply. The eval cell loads one skill per run and grades by string terms, so the sibling and `lfg` before/after arms cannot run in it. Change: keep the pack for `ce-noslop`-only fixtures; run sibling arms in fresh host sessions with the working tree linked as the local plugin, pre-arm from the pre-U3 ref, graded by hand, results table in the PR (feasibility, adversarial, +1 anchor).
2. [P1] U6. Recommendation: Apply. Three of six consolidated siblings have no before/after case. Change: add paired cases for `ce-brainstorm`, `ce-promote`, `ce-resolve-pr-feedback` (cross-model: Codex).
3. [P1] Success Criteria. Recommendation: Apply. "Shorter sentences" and "reads at least as well" have no rubric or threshold, so a run can pass while first-read understanding does not improve. Change: define a fixed paired rubric for tell removal, first-read comprehension, claim preservation, and register, with post scores meeting or exceeding baseline per path and host (cross-model: Codex, three lenses).
4. [P1] Goal Capsule and R10. Recommendation: Apply. The chat half of the objective is opt-in per repo and never tested. Change: add a success criterion for a task-completion reply in a repo carrying the instruction, and qualify the objective's chat clause (product-lens).
5. [P1] U3 and R7. Recommendation: Apply. On converted hosts the plan did not measure, a sibling whose rules were deleted may find no skill to invoke. Change: state the safe failure direction in the invocation line, naming the seven tests, and list unmeasured hosts as accepted-unverified (adversarial).
6. [P2] R6. Recommendation: Apply. The understandability goal and the user-register minimum-edit rule pull apart on a user's own dense draft. Change: limit understandability edits in that register to sentence splits and actor restoration, and name the register the success criterion is graded under (adversarial).
7. [P1] R10 and U4. Recommendation: Apply. "Already carries one in any wording" has no predicate, so the offer can duplicate or wrongly skip. Change: define equivalence as covering the full bundled instruction and add exact, partial, and unrelated fixtures (cross-model: Codex, two lenses).
8. [P1] Scope Boundaries. Recommendation: Skip. The peer wants the five deferred siblings pulled into this PR; the deferral was deliberate to keep one PR reviewable (cross-model: Codex).
9. [P1] Goal Capsule. Recommendation: Apply. "The same result" is undefined across direct and sibling invocation. Change: define parity as identical rule application and claim preservation, with mode and register formatting allowed to differ (cross-model: Codex).
10. [P2] R4 and U6. Recommendation: Apply. "Several tells" conflicts with a fixture that holds two devices unchanged. Change: state the minimum count and align the fixture (cross-model: Codex).
11. [P1] Open Questions. Recommendation: Defer. Non-English behavior stays deferred with its stated default (cross-model: Codex).

**FYI observations**
- The user-facing editor is a positioning bet the Problem Frame does not own (product-lens).
- The re-growth guard is deferred though drift is the stated problem (product-lens).
- Stable catalog numbers have no current citing consumer (scope-guardian).
- The standing instruction also fires in leaf subagents whose contract forbids skill invocation (adversarial).
- Centralization cites no user-visible harm from the drift (cross-model: Codex).

Plan ready at `/Users/tmchow/orca/workspaces/compound-engineering-plugin/basketstar/docs/plans/2026-09-07-feat-ce-noslop-writing-skill-plan.md`. What would you like to do next?