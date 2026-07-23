# Apply Code Review Findings (after `ce-code-review`)

Load this reference when `ce-code-review` has finished and **ce-work** (or another caller) should apply fixes before the Residual Work Gate.

`ce-code-review` is invoked here with `mode:agent`, so it is **review-only** in this context — it reports findings and writes artifacts and does not mutate the checkout, commit, push, or file tickets. **The caller owns apply/fix policy.** Standalone review is also report-only unless local apply was explicitly authorized.

## Consume the completed review (do not re-run it)

This reference loads **after** review has run. In the ce-work shipping flow, step 3a already invoked `ce-code-review`; this apply step **consumes that output** — do not start a second review, which would waste reviewer dispatches and risk overwriting the artifact the Residual Work Gate reconciles.

Reuse the review output already in hand:

- Parsed JSON (`status`, `actionable_findings`, `findings`, `artifact_path`, `run_id`) **or** the markdown Actionable Findings summary captured by the caller
- Run artifact dir: `<artifact-path>/` (`review.json`, per-reviewer JSON for `why_it_matters`)

If `status` is `failed`, stop shipping and surface `reason`. If `degraded`, note partial reviewer coverage before applying anything.

### Fallback — invoke review only for cold callers

Only when the caller reached this file **without** already running review (no review output in hand): invoke `ce-code-review` once, then proceed to apply. Do not invoke when the caller already ran review (e.g., ce-work shipping step 3a).

Invoke the skill explicitly — do not treat a casual "review my changes" prompt as a substitute unless the harness routed it to `ce-code-review`.

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
- Stable finding `#` — reuse in commits, residual sinks, and subagent prompts

## What to apply

Default to applying every actionable finding. Applying is a reversible edit to a tracked tree; diffs are reviewed before commit (below) and tests run after — so leaving a clear, reversible fix unapplied "to be safe" is the failure mode, not the safe choice. Bias to act:

- **Apply** any finding with a concrete `suggested_fix` that is a clear improvement — the common case. `confidence` and `autofix_class` tell you what to prioritize and what to flag, not whether you may apply: `autofix_class` is signal, **never permission**.
- **Push back** — keep the finding, don't apply — when the reviewer is wrong; note why.
- **Flag, don't block, green-but-unverifiable edits** — when an applied fix touches auth/authz, a public or cross-service contract/schema, or concurrency, a passing test does not prove safety; apply it when there is a clear `suggested_fix` and confidence, and call it out prominently in the diff review.

There is no precondition safety checklist and no deny-list — a code-review fix is a reversible edit, so downside is controlled after the fact (diff review + tests + the commit checkpoint), not by gating the apply.

**Evidence still matches the code** — the fix subagent confirms at `file:line` before editing. The orchestrator does **not** open files just to decide eligibility or dispatch.

## What to defer (to the Residual Work Gate)

- `autofix_class: advisory` — report-only.
- Findings with no concrete `suggested_fix` to act on.
- Findings whose right fix depends on a design or product decision — architecture direction, contract shape, or a behavior change needing sign-off. These need a human call before code changes.

Surface what was deferred and why; never silently drop.

## Execution — orchestrator batches, subagents apply

The orchestrator **does not investigate findings** (no pre-read of cited files to judge complexity or inline vs subagent). That would spend the context window you are trying to protect.

**Orchestrator owns:** parse review output → **eligibility filter on JSON fields only** → build batches → dispatch fix subagents → review diffs → tests → commit → Residual Work Gate.

**Fix subagents own:** read `file:line`, confirm evidence still matches, apply or skip with reason, return summary.

### Batching — group by file

After eligibility filtering, **group by `file`**: all eligible findings on the same file belong to one worker, so the file is loaded once and its `#` list is worked in severity order. Batches with disjoint file sets may run in parallel (same worktree / shared-directory rules as Phase 1 Step 4 in `ce-work` SKILL.md).

Delegate only when the volume warrants it. Apply a small set of findings directly rather than spawning a subagent per one-line fix; dispatch when the batch is large enough that a fresh context window per file actually helps.

**Subagent prompt (per batch):** the assigned findings only (`#`, severity, file, line, title, `suggested_fix`, `requires_verification`; add `why_it_matters` from `{reviewer}.json` in the run artifact when useful), plus:
- Work through assigned `#` in severity order; at each `file:line`, skip with a one-line reason if evidence no longer matches
- Apply the mechanical bar from § What to apply / What not to apply — skip anything that needs design judgment
- Do not re-run `ce-code-review`
- Shared-directory fallback: do not stage or commit — return which `#` were applied or skipped and which files changed

**After each batch:** review the diffs (scope = assigned `#` only), run tests (`requires_verification: true` on any applied finding → at least targeted tests; multi-file → broader suite), and commit (`fix(review): apply findings #…`) unless worktree-isolated subagents merge per Phase 1. Repeat until all batches complete, then report which `#` were applied versus skipped and why.

## Handoff to Residual Work Gate

Any actionable finding not applied in this pass is **residual work** — proceed to the Residual Work Gate with an updated count. Do not re-invoke `ce-code-review` solely to re-apply the same findings unless the diff changed materially after fixes.
