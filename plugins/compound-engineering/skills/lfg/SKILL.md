---
name: lfg
description: Right-sized engineering pipeline from idea to PR -- assesses task complexity and runs the appropriate amount of ceremony, from direct edits for trivial fixes to full brainstorm-plan-implement-review-test for complex features.
argument-hint: "[feature description]"
disable-model-invocation: true
---

Assess the task, choose the right execution path, and get it done. Not every task needs a 10-step pipeline -- a typo fix should not generate a plan file, and a complex feature should not skip requirements exploration.

## Phase 0: Assess and Route

Read the feature description and choose the cheapest execution path that will handle it well.

**Bias toward under-routing.** Running too little ceremony and having the user ask for more is far cheaper than running a full pipeline for a one-line fix. When the boundary between direct and lightweight is unclear, prefer direct. When the boundary between lightweight and full pipeline is unclear, prefer full pipeline -- it has internal short-circuits that right-size themselves.

Announce the routing decision in one line before proceeding:
- "**Direct** -- [what and why]"
- "**Lightweight** -- [what and why]"
- "**Full pipeline** -- [why this needs structured planning and review]"

Then execute immediately. Do not wait for confirmation.

---

### Direct

The fix is obvious and self-contained. No planning needed, no review needed, no skills loaded.

Make the change, verify it works (typecheck, lint, or test if applicable), and output `<promise>DONE</promise>`.

---

### Lightweight

The task is clear and bounded -- requirements and expected behavior are already in the description. Loading brainstorm, plan, and multi-agent review would add ceremony without improving the outcome.

Do the work directly. Verify it works (typecheck, lint, or test if applicable) and give it a quick self-review for obvious issues. Output `<promise>DONE</promise>`.

---

### Full Pipeline

The task has enough scope, ambiguity, or risk that structured planning prevents wasted work. This is the default when the task is not clearly trivial or simple.

Skills run in pipeline mode: skip workflow prompts (handoff menus, "what next?" options) but still ask content questions when requirements or scope are unclear.

1. `/ce:brainstorm $ARGUMENTS`

   Brainstorm runs in pipeline mode: it assesses whether requirements exploration is needed and either skips (if requirements are already clear) or runs brainstorm with content questions as needed and writes a requirements document. It will not present handoff options or invoke `/ce:plan` -- control returns here.

2. **Optional:** If the `ralph-loop` skill is available, run `/ralph-loop:ralph-loop "finish all slash commands" --completion-promise "DONE"` to iterate autonomously through the remaining steps. Brainstorm ran first because it may need user interaction; everything from here on is autonomous and benefits from ralph's fresh-context iteration. If not available or it fails, continue to step 3.

3. `/ce:plan $ARGUMENTS`

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
