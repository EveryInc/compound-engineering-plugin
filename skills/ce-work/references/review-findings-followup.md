# Apply Code Review Findings (after `ce-code-review`)

Load this reference when `ce-code-review` has finished and **ce-work** (or another caller) should apply fixes before the Residual Work Gate.

`ce-code-review` is invoked here with `mode:agent`, so it is **review-only** in this context — it reports findings and writes artifacts and does not mutate the checkout, commit, push, or file tickets. **The caller decides which fixes to apply and how.** Standalone review is also report-only unless local apply was explicitly authorized.

## Consume the completed review (do not re-run it)

This reference loads **after** review has run. In the ce-work shipping flow, step 3a already invoked `ce-code-review`; this apply step **consumes that output**. Do not start a second review, which would waste reviewer dispatches and risk overwriting the artifact the Residual Work Gate reconciles.

Reuse the review output already in hand:

- Parsed JSON (`status`, `actionable_findings`, `findings`, `artifact_path`, `run_id`) **or** the markdown Actionable Findings summary captured by the caller
- Run artifact dir: `<artifact-path>/` (`review.json`, per-reviewer JSON for `why_it_matters`)

If `status` is `failed`, stop shipping and report `reason`. If `degraded`, note partial reviewer coverage before applying anything.

### Fallback — invoke `ce-code-review` only for cold callers

Only when the caller reached this file **without** already running review (no review output in hand): invoke `ce-code-review` once, then proceed to apply. Do not invoke when the caller already ran review (e.g., ce-work shipping step 3a).

Invoke the skill explicitly. Do not treat a casual "review my changes" prompt as a substitute unless the harness routed it to `ce-code-review`.

```
ce-code-review mode:agent plan:<plan-path> base:<merge-base-or-ref>
```

- `mode:agent` — JSON output (`review.json` + primary JSON response) for programmatic parsing; same review pipeline as default.
- `plan:` — when Phase 1 used a plan file (requirements completeness).
- `base:` — when the diff base is already resolved on the current checkout; omit when reviewing a PR number/URL or standalone current branch.
- Do **not** pass deprecated `mode:autofix`.

For human-facing shipping, invoke `ce-code-review` without `mode:agent` if markdown tables are preferred. It still reports only unless the invocation explicitly authorizes local apply. Capture the Actionable Findings and artifact dir before caller-owned apply.

## Inputs for apply

- `actionable_findings` from JSON, or the Actionable Findings section from markdown
- Full finding detail when needed: `review.json` / artifact `findings`, or `{reviewer}.json` for `why_it_matters` and `evidence`
- Stable finding `#`: reuse it in commits, in the record of unapplied findings (PR section or tracker ticket), and in subagent prompts

## Check findings before applying fixes

The calling agent decides which findings are valid and which fixes it has permission to apply. Verify each finding against the evidence and the requested outcome. Reject incorrect claims, problems with no supporting evidence, and preferences whose benefit does not justify the change. Record why they were rejected; do not carry them forward as unfinished work.

Apply justified fixes within the agreed scope when they can be reversed. Use project evidence and conventions to choose technical fixes; a design choice does not automatically need a user decision. Neither `confidence`, `autofix_class`, nor a concrete `suggested_fix` proves benefit or grants permission. If a significant problem has no suggested fix, investigate it before deciding to defer it.

Defer a fix when essential evidence is unavailable, the user must choose a product preference, the work would expand the agreed scope, or the calling agent lacks permission. Passing tests do not prove an unverified safety property or authorize changing an agreed requirement. At the Residual Work Gate, explain what decision is needed and what depends on it.

Read the relevant source or assign a subagent to investigate a specific question. Use `ce-pov` only when an important, specific choice needs an independent assessment beyond ordinary inspection. Reviewer disagreement alone is not enough. Give it the subject, known constraints, and locations of supporting evidence. Use its answer or explanation of missing context to inform your decision. Neither gives permission to edit or automatically start a panel of models.

## Execution — orchestrator reviews and groups findings, subagents apply

The lead agent decides which findings to act on, groups the work, reviews the diffs, runs tests, and checks what remains at the Residual Work Gate. It may investigate a small question directly; delegate broader research rather than loading every cited file. Subagents confirm that the evidence still matches the code before applying fixes within the agreed scope. They return any unresolved decisions with supporting evidence.


### Default: batched fix subagents

After review, **dispatch subagents for all remaining applicable findings** unless the optional inline shortcut below applies. Do not classify findings by complexity in the parent thread.

**Batching (primary rule: group by file):**

1. Sort applicable findings by severity (P0 first).
2. **Group by `file`.** All eligible findings on the same file → **one subagent** (it loads the file once and works through its `#` list in severity order).
3. **Parallel waves:** batches with **disjoint file sets** may run in parallel (same worktree / shared-directory rules as `ce-work`'s execution strategy in `references/execution-strategy.md`).
4. **Same file, many findings:** keep one subagent per file. If the prompt would exceed a comfortable size (~8 findings), split into **serial** subagent passes on that file (first batch highest severity, then next batch after merge or after the prior agent returns).
5. **Cross-file coupling:** do not merge unrelated files into one subagent just to reduce agent count; file grouping is the default. Only co-batch multiple files when findings explicitly reference the same small related change (rare); when in doubt, separate by file.

**Subagent prompt (per batch):** the assigned findings only (`#`, severity, file, line, title, `suggested_fix`, `requires_verification`; add `why_it_matters` from `{reviewer}.json` in the run artifact when useful), plus:
- Work through assigned `#` in severity order; at each `file:line`, skip with a one-line reason if evidence no longer matches
- Follow the review and permission rules above; choose technical fixes from project evidence and return decisions that still need the user
- Do not re-run `ce-code-review`
- Shared-directory fallback: do not stage or commit; return which `#` were applied or skipped and which files changed

**After each wave:** orchestrator reviews diffs (scope = assigned `#` only), runs tests (`requires_verification: true` on any applied finding → at least targeted tests; multi-file → broader suite), commits (`fix(review): apply findings #…`) unless worktree-isolated subagents merge per Phase 1. Repeat until all batches complete.

### Optional inline shortcut (skip subagent spawn)

Use **only** when **all** of the following hold:

- Exactly **one** applicable finding after review, **and**
- The orchestrator **already** has that file's relevant region in context from Phase 2 work this session (no new Read/Grep expedition)

Otherwise dispatch a subagent, even for a single finding. When unsure, dispatch.

### Summary (required)

Report the batches dispatched, `#` applied vs skipped, artifact path, verification results, and justified work still unresolved. Save the reasons for rejected claims with the review evidence. A skipped low-value suggestion is not a deferred concern to repeat in the handoff.

## Handoff to Residual Work Gate

Any justified finding still unresolved after this pass is **residual work**. Proceed to the Residual Work Gate with an updated count. Do not re-invoke `ce-code-review` solely to re-apply the same findings unless the diff changed materially after fixes.
