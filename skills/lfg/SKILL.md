---
name: lfg
description: "Run the full autonomous shipping pipeline end-to-end, hands-off with no check-ins: plan, implement, review and fix, commit, push a branch, open a PR, and watch CI to green. Use only when the user explicitly asks to build or ship something autonomously all the way to an open PR, or invokes lfg directly — it pushes and opens a PR without stopping. Not for in-the-loop work where the user reviews each step: use ce-plan to plan, ce-work to implement a plan, ce-debug to fix a bug, or ce-commit-push-pr to commit and open a PR for existing changes."
argument-hint: "[feature description; optionally assign implementation to a model or harness]"
---

CRITICAL: You MUST execute every step below IN ORDER. Do NOT skip any required step. Do NOT jump ahead to coding or implementation. The plan phase (step 1) MUST be completed and verified BEFORE any work begins. Violating this order produces bad output.

When invoking any skill referenced below, resolve its name against the available-skills list the host platform provides and use that exact entry. Some platforms list skills under a plugin namespace (e.g., `compound-engineering:ce-plan`); others list the bare name. Invoking a short-form guess that isn't in the list will fail — always match a listed entry verbatim before calling the Skill/Task tool.

## Task Visibility

Before step 1, use the platform's task-tracking capability when available to publish a short stage-level view of the remaining pipeline. Derive it from the user-meaningful outcomes below rather than mirroring all ten steps or exposing internal gates. Before invoking a child skill, replace or clear LFG's view so only the child skill's task surface is visible; after it returns, recreate or refresh LFG's remaining pipeline work before invoking the next child. Add conditional work only when its gate fires. If no task-tracking capability is available, continue normally without simulating a task list in chat.

## Implementation-only routing carrier

Before step 1, interpret whether the invoking conversation expresses **semantic intent to assign the implementation stage** to another harness or model. This is judgment, not keyword or prompt-token matching: an explicit instruction such as "use Codex for implementation" creates a binding, while a plain mention of Codex, Composer, or another model in feature content, quoted material, comparison text, or a filename does not. Preference is the default; "only use Composer for implementation" is requirement-strength because its meaning rejects native fallback, but infer that strength from the full instruction rather than one particular word.

When that intent names one implementation candidate, remove the implementation-routing directive from the feature request that enters planning and retain one transient `implementation_engine` object with exactly these four fields:

- `mode`: `prefer` or `require`
- `target`: `codex`, `claude`, `grok`, `cursor`, or `composer`
- `model`: the explicit model pin, otherwise `null`
- `source`: caller-visible provenance identifying the current LFG instruction

When the current instruction instead names an ordered fallback list, do not truncate it to the scalar carrier. Remove it from the product request exactly as above, retain the whole ordered assignment as current-task implementation intent, and pass no `implementation_engine:` object. At the CE Work seam, that still-active current-task assignment outranks config and is normalized/preflighted in order. This is stage-scoped context, not plan content; if the host cannot preserve that context across its skill invocation, stop with a routing-carrier blocker rather than silently dropping later candidates.

Never pass this object or the removed directive to `ce-plan`, `ce-doc-review`, `ce-code-review`, the settled-decisions brief, or any planning or review input. The carrier is stage-scoped authority, not product content or a settled product decision. Keep the sanitized feature request otherwise unchanged. Do not construct a carrier from standing configuration here: when no explicit implementation binding exists, `ce-work` owns resolution of still-applicable session/project intent and standing per-checkout configuration.

1. Invoke the `ce-plan` skill with the sanitized feature request prepared above (or the unchanged arguments you were invoked with when no implementation directive was present).

   Before invoking, compose a **settled-decisions brief** from the invoking conversation and pass it with those arguments: direction (1-2 lines); settled decisions, each with four required fields — the decision, its provenance class (`user-directed` or `user-approved`), the rejected alternative, and a one-line reason; open areas; and a standing report-conflicts line. An entry whose rejected alternative cannot be stated demotes to a directive or open area. Scope topically — only decisions about the feature being shipped; when in doubt, demote (re-litigation is the safe floor; importing stale settlements is not). If the conversation contains no settled decisions, skip composition entirely and invoke `ce-plan` exactly as above — no empty-brief ceremony. The brief is transient: once ce-plan writes the plan, the plan's labeled KTDs are canonical.

   GATE: STOP. If ce-plan reported the task is non-software and cannot be processed in pipeline mode, stop the pipeline and inform the user that LFG requires software tasks. If ce-plan returned a blocked report containing `settled-decision-invalidated`, stop the pipeline and inform the user with the reason — do not retry. Otherwise, verify that the `ce-plan` workflow produced a plan file in `docs/plans/`. If no plan file was created, invoke `ce-plan` again with those same arguments. The retry reuses the composed brief verbatim — never recompose it. Do NOT proceed to step 2 until a written plan exists. **Record the plan file path** — it will be passed to ce-work in step 2 and ce-code-review in step 4.

   Read the plan metadata before continuing. If the plan has `artifact_contract: ce-unified-plan/v1`, proceed only when it has `artifact_readiness: implementation-ready` and `execution: code`. Stop the pipeline for `artifact_readiness: requirements-only`, any unrecognized readiness value, `execution: knowledge-work`, approach-plan outputs, answer-seeking/universal outputs, or invalid progress-like readiness values. LFG never launches `/goal` directly; when goal-mode or dynamic workflows are appropriate, `ce-work` owns that implementation engine choice and must return control to LFG afterward.

2. Invoke the `ce-work` skill with `mode:return-to-caller <plan-path-from-step-1>` when no scalar transient carrier exists, including when a retained ordered current-task assignment is still active in context. When the scalar carrier exists, use the exact string-host form `mode:return-to-caller implementation_engine:<compact-json> <plan-path-from-step-1>`.

   If the scalar transient carrier exists, serialize its exact `implementation_engine.{mode,target,model,source}` data as compact JSON immediately after the `implementation_engine:` prefix (for example `implementation_engine:{"mode":"prefer","target":"codex","model":null,"source":"lfg-current-turn"}`). This is structured caller data in a portable string envelope, not part of the plan path or implementation prompt. Pass no empty carrier when it does not exist. `ce-work` then resolves a retained ordered current-task assignment when present, otherwise applicable session/project intent and standing per-checkout configuration. LFG is an automatic, headless caller: it never prompts to weaken a requirement-strength route.

   The optional `implementation_run:<safe-id>` carrier is recovery-only. Never include it on the initial step-2 call. On the one evidence-reconciliation recovery below, place it after the same engine carrier when one existed and before the unchanged plan path: `mode:return-to-caller implementation_run:<safe-id> <plan-path-from-step-1>` or `mode:return-to-caller implementation_engine:<compact-json> implementation_run:<safe-id> <plan-path-from-step-1>`. A safe id matches `^[A-Za-z0-9._-]{1,128}$` and contains at least one non-period character. Reject a malformed or duplicate run/engine carrier instead of launching work.

   GATE: STOP. Read the structured return before continuing. A `status: blocked` or `status: failed` return stops the pipeline. In particular, an unavailable `require` route must not prompt, fall back, or start native work. A completed `prefer` fallback may continue to step 3 exactly once after prominently disclosing its requested-versus-actual route/model and `fallback_reason` to the user; fallback is not a reason to invoke implementation again.

   For `status: complete`, verify that implementation work was performed - files were created or modified beyond the plan. Require the same plan path, changed files, U-IDs attempted/completed when present, verification results, behavior-change signal, and `standalone_shipping_skipped: true`. Also require the route-aware receipt fields `implementation_engine_binding`, `requested_route`, `actual_route`, `requested_model`, `actual_model`, `fallback_reason`, `run_id`, `unit_receipts`, `plan_checkpoint`, `blockers`, and `recovery_path`. These fields are required even when native execution makes some values `null`; together they carry binding provenance, requested-versus-actual identity, fallback, the durable run, per-unit process/integration/verification/commit state, checkpoint disclosure, blockers, and recovery. A resumed return must carry the same `run_id`; never treat resume as permission to start a new unit or a second LFG tail.

   When `behavior_change: true`, also require `verification_evidence` that names the relevant units/tasks, existing tests inspected, tests added/changed or used unchanged, red failure or characterization evidence when applicable, verification run, and any deliberate test exception. Do NOT decide the test strategy inside LFG; the evidence is ce-work's contract. Also read `settled_decision_conflicts` from the return: blocker-routed entries arrive as `status: blocked` and stop the pipeline; **record any proceeded-and-flagged entries** — they must reach step 6's durable residual record and step 8's PR-description context, since later review may not rediscover them.

   If `behavior_change: true` but `verification_evidence` is missing or too vague to tell how behavior was protected, invoke `ce-work` one more time in recovery mode. Reuse the same `implementation_engine:<compact-json>` carrier when one existed and keep the same plan path. With a safe non-null `run_id`, add `implementation_run:<safe-id>` with that exact value from the first return. When `actual_route` is `native` and `run_id` is `null`, repeat the original ce-work invocation once without an `implementation_run:` carrier; this preserves the pre-existing native idempotency/evidence-reconciliation path. A non-native return without a safe run id remains blocked instead of attempting discovery or a second implementation. Do not prompt the user and do not alter the plan path or engine carrier; this is evidence reconciliation, not a fresh dispatch. The recovery relies on ce-work's reconciliation path to inspect the already-implemented work, fill the missing evidence, and return without reimplementing. If the second return still lacks coherent verification evidence, stop as blocked and report the missing fields instead of continuing to simplify/review/ship.

3. Invoke the `ce-simplify-code` skill on the branch diff.

   This runs before review so the code-review in step 4 covers the simplified code. **Skip** this step when the change is docs-only (only markdown/docs paths changed) or trivial (roughly under 10 changed lines). Otherwise let `ce-simplify-code` resolve the branch-diff scope itself; it preserves behavior and runs the test suite. Pass the plan path from step 1 as structure-pin context, not as the simplification scope (the branch diff remains the scope), with a one-line constraint: `session-settled:`-labeled KTDs are structure pins the simplification must preserve (deliberate duplication stays duplicated).

   Do not commit in this step. `ce-simplify-code` leaves its changes in the working tree; step 4's review scopes the working tree (uncommitted changes included), and step 8's `ce-commit-push-pr` commits whatever remains. Committing here would sweep any still-uncommitted `ce-work` edits into a misleading `refactor` commit and could stall on a tree that never goes clean.

4. Invoke the `ce-code-review` skill with `mode:agent plan:<plan-path-from-step-1>`.

   Pass the plan file path from step 1 so ce-code-review can verify requirements completeness. Read the **Actionable Findings** summary the skill emits. Also read any findings stamped `settled_conflict` (each names the conflicting KTD). A stamped finding whose evidence is invalidating — the settled decision cannot work: infeasible, wrong-thing, or destructive — stops the pipeline as blocked, with the finding reported, before the shipping precondition. Stamped preference-grade findings proceed (they are report-only) but must flow into step 6's residual record.

   `mode:agent` is report-only **by design** — it surfaces findings but never edits the tree; LFG applies the eligible ones in step 5. When narrating progress to the user, frame this as "review found X → applied X in step 5," not as "code review did not auto-fix." A report-only review followed by an LFG-applied fix is the intended contract, not a gap.

**Shipping precondition (steps 5–9).** Run `git remote` once before the shipping steps. If it lists **no remote** (e.g. a sandbox/throwaway checkout that has `git init` but no `origin`), shipping is **local-only**: make every commit the steps below call for, but **skip every push, PR create/edit, and CI-watch action** — the pushes in steps 5 and 6, the push and PR creation in step 8, and step 9 in full. A missing remote is a terminal local-only state, not an error: never retry a push or hunt for a remote — make the local commits and proceed to step 10. Run steps 5–9 normally when a remote exists.

5. **Apply and persist review fixes** (REQUIRED after step 4, before residual handoff)

   Load `references/review-followup.md` and execute its apply step (mechanical apply + commit/push when changes exist). Do not proceed to the residual handoff, run browser tests, or output DONE while eligible review fixes remain only in the working tree uncommitted.

6. **Autonomous residual handoff** (only when step 4 reported one or more actionable `downstream-resolver` findings not applied in step 5; skip when it reported `Actionable findings: none.`)

   Do not prompt the user. This step embraces the autopilot contract: residuals must become durable before DONE, but the agent never stops to ask. Also run this step when step 4 emitted any `settled_conflict`-stamped findings, or when step 2's return carried proceeded-and-flagged `settled_decision_conflicts` entries — both sit outside the apply path, but they are the divergent class and must be made durable here.

   1. Load `references/tracker-defer.md` in **non-interactive mode**. Pass the residual actionable findings from step 4/5 (or the run artifact when the summary was truncated).
   2. Collect the structured return: `{ filed: [...], failed: [...], no_sink: [...] }`.
   3. Compose a `## Residual Review Findings` markdown section from the structured return (this goes into the committed record file in step 4, **not** the PR body):
      - For each item in `filed`: a bullet with severity, file:line, title, and a link to the tracker ticket URL.
      - For each item in `failed`: a bullet with severity, file:line, title, and the failure reason (e.g., `Defer failed: gh returned 401 — tracker unavailable`).
      - For each item in `no_sink`: a bullet with severity, file:line, and title inlined verbatim so the committed record file is the durable record.
      - For each `settled_conflict`-stamped finding from step 4: a bullet with severity, file:line, title, and the conflicting KTD the stamp names — included even though the finding is report-only.
      - For each proceeded-and-flagged `settled_decision_conflicts` entry from step 2: a bullet with the KTD, the evidence, and how it was routed.
   4. **Durable record — never the PR body.** Do NOT write a `## Residual Review Findings` section into the PR description; it duplicates GitHub's own tracking and goes stale as items resolve. Review residuals have no GitHub thread of their own, so they are made durable by the tracker tickets filed in step 2 plus a committed record file — not a PR-body section and not a PR comment that duplicates the tickets. Create/replace `docs/residual-review-findings/<branch-or-head-sha>.md` with the composed section (ticket links included) and the source run context. Stage only that file, commit `docs(review): record residual review findings`, and push **when a remote is configured** (per the shipping precondition): if an upstream exists, `git push`; else if a remote exists, resolve a writable one (prefer `origin`, otherwise the first configured remote) and `git push --set-upstream <remote> HEAD`; if there is no remote at all, the local commit is the durable sink.

   Do not output DONE until the residuals are durable (tracker tickets filed and/or the record file committed). Never block DONE on tracker filing failures once the record file exists. A push that fails when a remote exists is a stop-and-report; never retry a push, or block DONE, when no remote exists.

7. Invoke the `ce-test-browser` skill with `mode:pipeline`.

8. Invoke the `ce-commit-push-pr` skill with `mode:pipeline branding:on`. Thread the recorded plan path from step 1 into the invocation, along with any proceeded-and-flagged `settled_decision_conflicts` entries from step 2, so the PR body's settled-decisions provenance line and its proceed-under-flag clause can fire.

   This commits any remaining changes, pushes the branch, and opens a pull request — non-interactively, per the mode token. If it prints a `New concepts:` trailer after the PR URL, record the concept name(s) for step 10. If step 6 already opened a PR (check with `gh pr view --json number,url,state 2>/dev/null`), skip PR creation but still commit and push any uncommitted changes. **Per the shipping precondition, when no remote is configured, do NOT invoke `ce-commit-push-pr` — its commit step pushes unconditionally (`git push -u origin HEAD`), so a literal invocation would still hit the impossible push. Instead commit any remaining changes locally yourself (`git add -A && git commit`) and skip the push and PR creation entirely.**

9. **Drive CI to green via `ce-babysit-pr`** (only when an open PR exists for the current branch)

   Detect the PR; if none exists or `gh` is unavailable, skip this step entirely and proceed to step 10.

   ```bash
   gh pr view --json number,url,state
   ```

   Invoke **`ce-babysit-pr mode:pipeline <pr-url>`**. It runs the bounded pipeline loop: watches CI, repairs real (convergent) failures via `ce-debug mode:pipeline` — never weakening, skipping, or mocking an assertion — resolves any review comments that arrived via `ce-resolve-pr-feedback mode:pipeline`, and stops when CI is decided or its budget (default 3 fix rounds) is hit. This replaces LFG's former hand-rolled CI loop; do not reimplement CI-watching here.

   Collect its structured result (`{ status, fixes_applied, residuals }`). It surfaces unfixable CI as a **run-report comment on the PR** and returns residuals — do **NOT** write a `## CI Failures Unresolved` PR-body section. A `needs-human` residual (a fix that would need a product/design decision) is deferred, not applied — that is the autopilot contract, unchanged. Do not block DONE once babysit has surfaced residuals.

10. Output `<promise>DONE</promise>` when complete

    If step 8 recorded a `New concepts:` trailer, first echo one line per concept: `New concept introduced: <name> — run /ce-explain <name> to go deeper.`

    If an open PR exists, add one line pointing the user to the interactive watch-to-merge (pipeline mode stopped at "CI decided," not "merged"): `PR is moving — run /ce-babysit-pr <pr-url> to watch it through review to merge.`

    Before the DONE promise, inspect the canonical plan from step 1 for the semantic role `work-relationships`. Load `references/next-work-handoff.md` when that role exists, or when an older unmarked Product Contract appears to name the area this plan owns plus future separately planned areas and their relationships; the reference owns the cautious legacy semantic fallback, candidate selection, and opt-in offer contract. Do not match an exact visible heading, treat ordinary non-goals as future work, or invoke `ce-handoff` before the user explicitly accepts the offer. If neither semantic signal exists, do not load the reference and make no next-work offer.

    Then output the DONE promise.

Start with step 1 now. Remember: plan FIRST, then work. Never skip the plan.
