---
name: ce-simplify-code
description: "Simplify settled, recently changed code for clarity, reuse, quality, and efficiency while preserving behavior. Use after implementation and before review; use ce-debug for bugs."
argument-hint: "[blank to simplify current branch changes, or describe what to simplify]"
---

Simplify recently changed code for clarity, reuse, quality, and efficiency while preserving exact behavior. Prioritize readable, explicit code over compact code — fewer lines is not the goal.

## Step 1: Identify scope

Resolve the simplification scope in this order:

1. **User-named scope** is authoritative; do not widen it.
2. **Otherwise, in git**, use the current branch versus its base. Without a usable base, use staged and unstaged changes (`git diff HEAD`).
3. **Outside git or without a diff**, use files the user named or that were edited earlier in the conversation.

If none of the above produces a non-empty scope, stop and ask the user what to simplify rather than guessing. Use the platform's blocking question tool: `AskUserQuestion` in Claude Code (call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded), `request_user_input` in Codex, `ask_question` in Antigravity CLI (`agy`), `ask_user` in Pi (requires the `pi-ask-user` extension). Fall back to numbered options in chat only when no blocking tool exists in the harness or the call errors (e.g., Codex edit modes) — not because a schema load is required. Never silently skip the question.

**Preflight.** If the scope has no substantive human-authored code — only documentation, generated or vendored files, dependencies or lockfiles, or mechanical churn — report that there is nothing to simplify and stop without reviewers. For mixed scopes, retain only the code. This is a kind gate, never a size gate: explicit small scopes still run, and callers own any size or cost threshold.

When the platform's task-tracking capability is available, show the review, apply, and verification outcomes without creating one task per reviewer. Otherwise continue without simulating a task list in chat.

## Step 2: Run 3 focused reviews

Before any review or dispatch, read each persona file verbatim:

- `references/personas/code-reuse-reviewer.md`
- `references/personas/code-quality-reviewer.md`
- `references/personas/efficiency-reviewer.md`

Run code-reuse, code-quality, and efficiency as three distinct review lenses; separate contexts are preferred, not required. When the current tool surface exposes subagent dispatch, attempt one generic subagent launch per review with the corresponding persona text verbatim plus the resolved scope (the full diff or file set). Run them concurrently up to the platform's limit, or dispatch the same three payloads sequentially when concurrency is unavailable. Without a subagent primitive, the parent agent performs the reviews inline, following each persona as a separate pass. An explicit authorization result takes precedence even without an agent handle: ask the user to grant it and retry once. If declined or unavailable, run that review inline and disclose it. Completed reviews need no wait; wait only on acknowledged asynchronous launches. No review, launch acknowledgement, or diagnostic means generic failure, not a permission problem. Any other failure besides concurrency backpressure runs only the affected review inline with disclosure. Describe a review as delegated or independent only when a subagent actually returned it; inline agreement is not independent corroboration.

**Bounded dispatch.** Queue the three reviewers and launch only as many as the harness accepts at once; treat a concurrency/active-agent-limit error as backpressure (leave the reviewer queued and retry after a slot frees), not as reviewer failure.

**Model selection.** Use the platform's balanced mid-tier model when a known override exists. In Claude Code this is the Sonnet class. In Codex, do this only when the dispatch primitive exposes an explicit model or custom-agent selector; task wording alone does not select a different model. Otherwise inherit the parent model.

**Permission mode.** Omit the `mode` parameter on the dispatch call so the user's configured permission settings apply.

## Step 3: Fix issues

Proceed only after all three review outcomes are complete, whether returned by subagents or produced inline. Apply worthwhile findings directly; record false positives and low-value findings as skipped without asking the user.

Inspect beyond the resolved scope when needed to evaluate a finding, but edit only that scope and its necessary import/export seams. For a user-named file or directory scope, those seams must also be inside it; skip any fix that would edit outside the mutation boundary.

Each fix must preserve outputs, errors, side effects, and ordering. If that cannot be established, skip it.

An interface or data shape that existed only in an earlier iteration of the current unshipped scope is not protected behavior once you verify it has no deployed, persisted, public, external, dependent-branch, or in-repo caller outside the resolved scope. Remove that compatibility path only when every required caller update fits the existing mutation boundary; otherwise preserve it.

**Never simplify away a safety check.** Preserve trust-boundary validation, data-loss protection, security checks, and accessibility affordances. Skip any finding that would thin or remove one.

**Honor caller-passed structure pins.** A plan path passed with the structure-pin constraint is context, not scope. Preserve its `session-settled:` Key Technical Decisions, including deliberate duplication or separation.

## Step 4: Verify behavior is preserved

Run project-wide typecheck and lint. Run tests matched to blast radius: scoped tests for local changes, broader tests for shared or wide-reach changes, and the full suite when the runner cannot scope tests.

Report failures with the check name and relevant output. Fix simplification-caused failures or revert the responsible change; never relax assertions, weaken types, or skip tests.

If no test suite, lint, or typecheck is configured, state that explicitly in the summary; do not silently skip verification.

## Step 5: Summarize

Summarize what was already sound and what improved. Report applied counts by reuse, quality, and efficiency; skipped count; and check outcomes. If nothing changed, say so. Do not use net lines removed as the success metric.
