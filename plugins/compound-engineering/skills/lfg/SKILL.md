---
name: lfg
description: Right-sized engineering autopilot from idea to PR -- assesses task complexity, resumes from the current workflow gate when possible, and runs the appropriate amount of ceremony from direct edits for trivial fixes to the full brainstorm-plan-implement-review-test pipeline for complex features.
argument-hint: "[feature description]"
disable-model-invocation: true
---

Assess the task, choose the right execution path, and get it done. Not every task needs a 10-step pipeline -- a typo fix should not generate a plan file, and a complex feature should not skip requirements exploration. `/lfg` should also be able to resume from the current workflow gate when requirements, a plan, implementation work, or a PR already exist.

## Autopilot Run Contract

For resumable `lfg` runs across direct, lightweight, and full-pipeline routes, `lfg` owns the deterministic autopilot contract.

- Downstream marker format:
  - `[ce-autopilot manifest=.context/compound-engineering/autopilot/<run-id>/session.json] :: <normal input>`
- Run directory:
  - `.context/compound-engineering/autopilot/<run-id>/`
- Required files:
  - `session.json`
  - `decisions.md`
- Phase-1 manifest schema:
  - `schema_version`
  - `run_id`
  - `route` = `direct | lightweight | full`
  - `status` = `active | completed | aborted`
  - `implementation_mode` = `standard | swarm`
  - `feature_description`
  - `current_gate` (optional, advisory only; recompute from gate state on resume)
  - `gates.requirements | gates.plan | gates.implementation | gates.review | gates.verification | gates.wrap_up`
  - `artifacts.requirements_doc | artifacts.plan_doc`
- Each gate entry contains:
  - `state` = `complete | skipped | pending | blocked | unknown`
  - `evidence`
  - `ref` only for `review`, `verification`, and `wrap_up` so `lfg` can invalidate stale late-stage completions after code changes

`lfg` is the only top-level skill that creates or backfills these manifests. Downstream skills must use the explicit marker plus manifest path rather than guessing from caller prose.
The manifest is the primary resume source, but never blindly trust it. On resume, validate it against durable artifacts and current repo state, then repair it conservatively if it is stale or inconsistent.

Direct and lightweight routes still create a lightweight manifest immediately. In those routes, `artifacts.requirements_doc` and `artifacts.plan_doc` may remain unset by design, and `gates.requirements` / `gates.plan` should be marked `skipped` with routing evidence instead of being treated as missing work.

Implementation-mode selection rule:
- explicit user request for swarm or agent teams wins
- otherwise read `implementation_mode` from `compound-engineering.local.md` frontmatter
- if the setting is missing, assume `standard`

## Phase 0: Assess and Route

If `$ARGUMENTS` is empty, do not assess complexity yet. Route to **Full pipeline** so it can first check whether there is resumable work on the current branch/worktree. Do not start with `ce:brainstorm` before resume detection runs. If full-pipeline resume detection finds nothing resumable, stop and tell the user briefly that there is nothing to resume and they should rerun `/lfg <feature description>` to start new work.

Read the feature description and choose the cheapest execution path that will handle it well.

**Bias toward under-routing.** Running too little ceremony and having the user ask for more is far cheaper than running a full pipeline for a one-line fix. When the boundary between direct and lightweight is unclear, prefer direct. When the boundary between lightweight and full pipeline is unclear, prefer full pipeline -- it has internal short-circuits that right-size themselves.

Announce the routing decision in one line before proceeding:
- "**Direct** -- [what and why]"
- "**Lightweight** -- [what and why]"
- "**Full pipeline** -- [why this needs structured planning and review]"

Then execute immediately. Do not wait for confirmation about the routing decision itself.

---

### Direct

The fix is obvious and self-contained. No planning or multi-agent review needed.

Before changing files, preserve the same branch/worktree safety as `ce:work` Phase 1: choose the right branch first, and never commit directly to the default branch without explicit user permission.

Before changing files, create or backfill a lightweight manifest for this run:
- `route = direct`
- `current_gate = implementation`
- `gates.requirements.state = skipped`
- `gates.plan.state = skipped`
- `gates.review`, `gates.verification`, and `gates.wrap_up` start as `pending`
- `artifacts.requirements_doc` and `artifacts.plan_doc` may remain unset by design

If the task stops looking direct while you work, upgrade the manifest to `route = full`, mark any missing early gates `pending`, and run them before continuing.

Make the change, verify it works (typecheck, lint, or test if applicable), then preserve the same applicable wrap-up contract as `ce:work` Phase 4 before outputting `<promise>DONE</promise>`:
- commit it, push it, and create or update the PR
- add a `## Post-Deploy Monitoring & Validation` section to the PR description
- if the change affects browser UI, capture and upload screenshots and include the image URLs in the PR description

Update the manifest after implementation, self-review, verification, and wrap-up so rerunning `/lfg` resumes at the first unmet late-stage gate instead of routing from scratch.

---

### Lightweight

The task is clear and bounded -- requirements and expected behavior are already in the description. Loading brainstorm, plan, and multi-agent review would add ceremony without improving the outcome.

Before changing files, preserve the same branch/worktree safety as `ce:work` Phase 1: choose the right branch first, and never commit directly to the default branch without explicit user permission.

Before changing files, create or backfill a lightweight manifest for this run:
- `route = lightweight`
- `current_gate = implementation`
- `gates.requirements.state = skipped`
- `gates.plan.state = skipped`
- `gates.review`, `gates.verification`, and `gates.wrap_up` start as `pending`
- `artifacts.requirements_doc` and `artifacts.plan_doc` may remain unset by design

If the task stops looking lightweight while you work, upgrade the manifest to `route = full`, mark any missing early gates `pending`, and run them before continuing.

Do the work directly. Verify it works (typecheck, lint, or test if applicable), give it a quick self-review for obvious issues, then preserve the same applicable wrap-up contract as `ce:work` Phase 4 before outputting `<promise>DONE</promise>`:
- commit it, push it, and create or update the PR
- add a `## Post-Deploy Monitoring & Validation` section to the PR description
- if the change affects browser UI, capture and upload screenshots and include the image URLs in the PR description

Update the manifest after implementation, self-review, verification, and wrap-up so rerunning `/lfg` resumes at the first unmet late-stage gate instead of routing from scratch.

---

### Full Pipeline

The task has enough scope, ambiguity, or risk that structured planning prevents wasted work. This is the default when the task is not clearly trivial or simple.

Skills run in autopilot mode: skip workflow prompts (handoff menus, "what next?" options) but still ask content questions when requirements or scope are unclear.

Before invoking downstream skills:

1. Check for an active autopilot manifest for the current branch/worktree.
2. If one exists, resume from it, but validate it against current durable artifacts and repo state before trusting it.
3. If one does not exist, reconstruct one conservatively using this algorithm:
   - explicit user direction in the current `/lfg` invocation
   - durable workflow artifacts and repo state
   - PR and CI state for the current branch/HEAD
4. Gather an evidence bundle before inferring any gate state:
   - current branch/worktree, dirty state, and whether the branch is ahead of the default branch
   - current `/lfg` feature description, if one was provided
   - relevant `docs/brainstorms/*-requirements.md` and `docs/plans/*.md` files, preferring artifacts touched on the current branch or referenced by each other
   - plan checkbox progress and whether non-doc implementation files changed beyond the plan artifact itself
   - open PR, CI state, and pending/ready todo files in `.context/compound-engineering/todos/`
5. Select canonical artifacts conservatively:
   - if a plan references an `origin:` requirements document, bind them together
   - if multiple plans or requirements docs are plausible, prefer the artifact most clearly tied to the current branch/topic
   - if multiple candidates remain materially ambiguous after that pass, ask one targeted question instead of guessing
6. Infer the route before inferring gate state:
   - choose `full` if a relevant requirements doc or plan doc exists, or the user explicitly asks for structured planning/review
   - choose `lightweight` if implementation work or a PR exists without durable planning artifacts and the task is clearly bounded
   - choose `direct` only for a tiny, self-contained change with no durable planning artifacts and no reason to expect multi-step late-stage orchestration
   - if you are unsure between `lightweight` and `full`, prefer `full`
7. Backfill gate state conservatively:
   - `requirements` is `complete` when a requirements doc exists or a plan clearly proves requirements were already resolved; for `direct`/`lightweight`, mark it `skipped` with evidence
   - `plan` is `complete` only when a plan doc exists; for `direct`/`lightweight`, mark it `skipped` with evidence
   - `implementation` stays `pending` when work appears in progress or evidence is mixed; mark it `complete` only with strong evidence such as completed plan checkboxes or other durable implementation-complete signals
   - `review`, `verification`, and `wrap_up` should be marked `complete` only from explicit evidence. Never infer those gates complete from an open PR alone
8. Invalidate stale late-stage gates before resuming:
   - if `gates.review.ref` exists and does not match the current HEAD, reset `review`, `verification`, and `wrap_up` to `pending`
   - if `gates.verification.ref` exists and does not match the current HEAD, reset `verification` and `wrap_up` to `pending`
   - if `gates.wrap_up.ref` exists and does not match the current HEAD, reset `wrap_up` to `pending`
9. If no coherent candidate route/artifact set exists, stop and tell the user there is nothing reliable to resume. Ask for a feature description or explicit plan path instead of guessing.
10. Evaluate ordered workflow gates:
   - `requirements`
   - `plan`
   - `implementation`
   - `review`
   - `verification`
   - `wrap_up`
11. Mark a gate complete only when current evidence supports it. If you cannot prove a gate is complete, leave it `pending`, `skipped`, or `blocked` as appropriate.
12. Create or backfill `.context/compound-engineering/autopilot/<run-id>/session.json` and `.context/compound-engineering/autopilot/<run-id>/decisions.md`.
13. Advance one gate at a time. After each downstream skill returns, update the manifest evidence, recompute the first unmet gate, and continue until all required gates are complete or a real blocker stops the run.

Late-stage rule:

- An open PR does not mean the run is done.
- Evaluate `review`, `verification`, and `wrap_up` separately.
- Inspect GitHub CI for the current HEAD.
- If current evidence for local tests, browser validation, or PR artifacts is missing or stale, rerun or re-request the narrowest applicable step.
- Treat `test-browser` and `feature-video` as best-effort by default. If they are inapplicable or the environment is unavailable, mark the gate `skipped`, note the reason briefly, and continue.
- Only treat `verification` as blocking when the user or task explicitly requires interactive/browser validation before the run can be considered done.
- Keep the run `active` while CI is pending or a required late-stage gate is still `pending` or `blocked`.
- Transition to `completed` only when all required gates are `complete` or `skipped` and no required external blocker remains.

1. If the recomputed first unmet gate is `requirements`, run:
   - `/ce:brainstorm [ce-autopilot manifest=.context/compound-engineering/autopilot/<run-id>/session.json] :: $ARGUMENTS`

   Brainstorm runs in autopilot mode: it assesses whether requirements exploration is needed and either skips (if requirements are already clear) or runs brainstorm with content questions as needed and writes a requirements document. It will not present handoff options or invoke `/ce:plan` -- control returns here.

2. **Optional:** If the `ralph-loop` skill is available and you are continuing from an early-stage unmet gate, run `/ralph-loop:ralph-loop "finish all slash commands" --completion-promise "DONE"` to iterate autonomously through the remaining steps. Brainstorm ran first because it may need user interaction; everything from here on is autonomous and benefits from ralph's fresh-context iteration. If not available or it fails, continue.

3. If the recomputed first unmet gate is `plan`, run:
   - `/ce:plan [ce-autopilot manifest=.context/compound-engineering/autopilot/<run-id>/session.json] :: $ARGUMENTS`

   If brainstorm collected the feature description because `$ARGUMENTS` was empty, carry that clarified description forward into the `ce:plan` invocation instead of calling it with empty arguments. Treat that clarified description as the resolved planning input for all `ce:plan` attempts in this run. Do not ask the user for the same description twice.

   GATE: Verify that `ce:plan` produced a plan file in `docs/plans/`. If no plan file was created, run `ce:plan` again with the same resolved planning input used for the first `ce:plan` attempt. Do NOT fall back to the original empty `$ARGUMENTS`, and do NOT proceed until a written plan exists.

   After the plan exists, update `artifacts.plan_doc` in the autopilot manifest with that exact plan path. Use that same path for every later `deepen-plan` and `ce:work` invocation in this run.

4. After the plan exists, evaluate whether `deepen-plan` should run using the written plan at `artifacts.plan_doc`. Do not gate this check on the first unmet gate still being `plan`; `ce:plan` may already have advanced the manifest to `implementation`.

   Run only if the plan is `Standard` or `Deep`, touches a high-risk area (auth, security, payments, migrations, external APIs, significant rollout concerns), or still has obvious confidence gaps in decisions, sequencing, system-wide impact, risks, or verification.

   If those criteria are met, run `/compound-engineering:deepen-plan [ce-autopilot manifest=.context/compound-engineering/autopilot/<run-id>/session.json] :: <plan-path-from-artifacts.plan_doc>`.

   GATE: If deepen-plan ran, confirm the plan was deepened or judged sufficiently grounded. If skipped, briefly note why and proceed.

5. If the recomputed first unmet gate is `implementation`, run:
   - `/ce:work [ce-autopilot manifest=.context/compound-engineering/autopilot/<run-id>/session.json] :: <plan-path-from-artifacts.plan_doc>`

   `ce:work` must honor the active manifest's `implementation_mode` when deciding between standard execution and swarm mode. Do not require a second swarm-specific handoff token here.

   GATE: Verify that implementation work was performed and the manifest now records `gates.implementation` for the current run state. Do NOT proceed if no code changes were made or the implementation gate was left ambiguous.

6. If the recomputed first unmet gate is `review`, run `/ce:review [ce-autopilot manifest=.context/compound-engineering/autopilot/<run-id>/session.json] :: current` -- catch issues before they ship

7. If review created todos, run `/compound-engineering:todo-resolve` before advancing to later gates -- resolve findings, compound on learnings, and clean up completed todos.

   GATE: If todo resolution changed code or behavior, re-verify the final state before proceeding. Run the narrowest checks that cover what changed (for example targeted tests, lint/typecheck, or another browser check for UI-affecting changes). If todo resolution made no functional code changes, briefly note that and continue.

8. If the recomputed first unmet gate is `verification`, conditionally run `/compound-engineering:test-browser [ce-autopilot manifest=.context/compound-engineering/autopilot/<run-id>/session.json] :: current` -- best-effort browser validation for work that actually needs interactive testing. Read `compound-engineering.local.md` frontmatter; skip if `autopilot_features.test_browser` is `false`. If the setting is missing, assume enabled.

9. If verification created todos, run `/compound-engineering:todo-resolve` before advancing -- same resolve/compound/clean-up cycle as step 7.

10. If the recomputed first unmet gate is `wrap_up`, conditionally run `/compound-engineering:feature-video [ce-autopilot manifest=.context/compound-engineering/autopilot/<run-id>/session.json] :: current` -- best-effort walkthrough capture and PR polish. Read `compound-engineering.local.md` frontmatter; skip if `autopilot_features.feature_video` is `false`. If the setting is missing, assume enabled. Also skip if the project has no browser-based UI (e.g., CLI tools, plugins, libraries, APIs).

11. Output `<promise>DONE</promise>` only when all required gates are `complete` or `skipped`. If the run is only waiting on external CI, report that explicitly instead of claiming completion.

Start now.
