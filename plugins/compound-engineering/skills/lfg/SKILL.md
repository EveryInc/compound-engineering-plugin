---
name: lfg
description: Right-sized engineering pipeline from idea to PR -- assesses task complexity and runs the appropriate amount of ceremony, from direct edits for trivial fixes to full brainstorm-plan-implement-review-test for complex features.
argument-hint: "[feature description]"
disable-model-invocation: true
---

Assess the task, choose the right execution path, and get it done. Not every task needs a 10-step pipeline -- a typo fix should not generate a plan file, and a complex feature should not skip requirements exploration.

## Phase 0: Assess and Route

If `$ARGUMENTS` is empty, do not assess complexity yet. Route to **Full pipeline** immediately and start with `ce:brainstorm` so brainstorm can ask the user for the missing feature description. Do not ask the user yourself and do not guess a route from an empty prompt.

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

Make the change, verify it works (typecheck, lint, or test if applicable), then preserve the same applicable wrap-up contract as `ce:work` Phase 4 before outputting `<promise>DONE</promise>`:
- commit it, push it, and create or update the PR
- add a `## Post-Deploy Monitoring & Validation` section to the PR description
- if the change affects browser UI, capture and upload screenshots and include the image URLs in the PR description

---

### Lightweight

The task is clear and bounded -- requirements and expected behavior are already in the description. Loading brainstorm, plan, and multi-agent review would add ceremony without improving the outcome.

Before changing files, preserve the same branch/worktree safety as `ce:work` Phase 1: choose the right branch first, and never commit directly to the default branch without explicit user permission.

Do the work directly. Verify it works (typecheck, lint, or test if applicable), give it a quick self-review for obvious issues, then preserve the same applicable wrap-up contract as `ce:work` Phase 4 before outputting `<promise>DONE</promise>`:
- commit it, push it, and create or update the PR
- add a `## Post-Deploy Monitoring & Validation` section to the PR description
- if the change affects browser UI, capture and upload screenshots and include the image URLs in the PR description

---

### Full Pipeline

The task has enough scope, ambiguity, or risk that structured planning prevents wasted work. This is the default when the task is not clearly trivial or simple.

Skills run in pipeline mode: skip workflow prompts (handoff menus, "what next?" options) but still ask content questions when requirements or scope are unclear.

1. `/ce:brainstorm $ARGUMENTS`

   Brainstorm runs in pipeline mode: it assesses whether requirements exploration is needed and either skips (if requirements are already clear) or runs brainstorm with content questions as needed and writes a requirements document. It will not present handoff options or invoke `/ce:plan` -- control returns here.

2. **Optional:** If the `ralph-loop` skill is available, run `/ralph-loop:ralph-loop "finish all slash commands" --completion-promise "DONE"` to iterate autonomously through the remaining steps. Brainstorm ran first because it may need user interaction; everything from here on is autonomous and benefits from ralph's fresh-context iteration. If not available or it fails, continue to step 3.

3. `/ce:plan $ARGUMENTS`

   If brainstorm collected the feature description because `$ARGUMENTS` was empty, carry that clarified description forward into the `ce:plan` invocation instead of calling it with empty arguments. Do not ask the user for the same description twice.

   GATE: Verify that `ce:plan` produced a plan file in `docs/plans/`. If no plan file was created, run `/ce:plan $ARGUMENTS` again. Do NOT proceed until a written plan exists.

4. **Conditionally** run `/compound-engineering:deepen-plan`

   Run only if the plan is `Standard` or `Deep`, touches a high-risk area (auth, security, payments, migrations, external APIs, significant rollout concerns), or still has obvious confidence gaps in decisions, sequencing, system-wide impact, risks, or verification.

   GATE: If deepen-plan ran, confirm the plan was deepened or judged sufficiently grounded. If skipped, briefly note why and proceed.

5. `/ce:work`

   GATE: Verify that implementation work was performed -- files were created or modified beyond the plan. Do NOT proceed if no code changes were made.

6. `/ce:review` -- catch issues before they ship

7. **Conditionally** run `/compound-engineering:test-browser` -- verify the feature works in a real browser. Read `compound-engineering.local.md` frontmatter; skip if `autopilot_features.test_browser` is `false`. If the setting is missing, assume enabled.

8. `/compound-engineering:resolve-todo-parallel` -- resolve findings from review and testing, compound on learnings, clean up completed todos

9. **Conditionally** run `/compound-engineering:feature-video` -- record a walkthrough and add to the PR. Read `compound-engineering.local.md` frontmatter; skip if `autopilot_features.feature_video` is `false`. If the setting is missing, assume enabled. Also skip if the project has no browser-based UI (e.g., CLI tools, plugins, libraries, APIs).

10. Output `<promise>DONE</promise>` when all preceding steps are complete

Start now.
