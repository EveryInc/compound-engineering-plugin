---
name: ce-simplify-code
description: "Simplify recently changed code for clarity, reuse, quality, and efficiency while preserving behavior. Use for tidy/refactor passes; use ce-debug for bugs."
argument-hint: "[blank to simplify current branch changes, or describe what to simplify]"
---

Simplify recently changed code for clarity, reuse, quality, and efficiency while preserving exact behavior. Prioritize readable, explicit code over compact code — fewer lines is not the goal.

## Step 1: Identify scope

Resolve the simplification scope in this order:

1. **If the user explicitly named a scope** (a file, a directory, "the function I just wrote", "the changes from this morning"), use that scope. Treat user-named scope as authoritative — do not widen it.
2. **Otherwise, in a git repository**, default to the diff between the current branch and its base branch (e.g., `git diff origin/main...` or against the configured upstream). If the branch has no upstream or base ref, fall back to staged + unstaged changes (`git diff HEAD`).
3. **Outside a git repository or when no diff is available**, review the most recently modified files mentioned by the user or edited earlier in this conversation.

If none of the above produces a non-empty scope, ask the user what to simplify rather than guessing — via the harness's blocking-question tool where it has one (`AskUserQuestion`, `request_user_input`, `ask_user`), otherwise numbered options in chat. Running unattended, report that no scope resolved and stop instead of guessing.

**Preflight.** If the resolved scope contains no substantive human-authored code — documentation- or Markdown-only, or only generated, vendored, dependency/lockfile, or purely mechanical (formatting, lint autofix, mass rename) churn — stop here with a one-line note that there is nothing to simplify. On a mixed diff, narrow the scope to the code files and continue. This preflight gates on the *kind* of change only, never on size or count: an explicit user-named scope is authoritative and still runs even when small.

After this preflight passes, use the platform's task-tracking capability when available to track the review, apply, and verification outcomes. If no task-tracking capability is available, continue normally without simulating a task list in chat.

## Step 2: Review across three dimensions

Read all three rubrics from this skill's directory and apply them yourself in one pass over the resolved scope (the full diff or file set):

- `references/personas/code-reuse-reviewer.md` — existing utilities, duplicated functionality, reimplemented stdlib/runtime primitives.
- `references/personas/code-quality-reviewer.md` — redundant state, parameter sprawl, copy-paste, leaky abstractions, stringly-typed code, dead code, over-nesting, and the over-simplification balance guard.
- `references/personas/efficiency-reviewer.md` — unnecessary work, missed concurrency, hot-path bloat, no-op updates, memory leaks.

Dispatch the three rubrics as parallel subagents only when the diff is large enough that one pass would lose fidelity. If you do, pass each subagent the **full file content** of its rubric plus the resolved scope, and treat a concurrency/active-agent-limit error as backpressure (requeue and retry after a slot frees), not as reviewer failure.

**Model selection.** Use the platform's balanced mid-tier model for these reviewers when the current harness exposes a known override. In Claude Code this is the Sonnet class. In Codex, apply this tier only when the active dispatch primitive exposes an explicit model or custom-agent selector; task wording alone does not select a different model. Otherwise omit the override and inherit the parent model -- a working pass on the parent model beats a broken dispatch.

## Step 3: Fix issues

Fix each issue directly. If a finding is a false positive or not worth addressing, note it and move on. Do not argue with the finding or raise questions to the user, just skip it.

Before applying each fix, confirm it preserves behavior: same output for every input, same error behavior, and same side effects and ordering. If a fix can't clear that test, skip it.

**Never simplify away a safety check.** Input validation at trust boundaries, error handling that prevents data loss, security checks (authorization, escaping, sanitization), and accessibility affordances stay — preserve them even when a finding frames them as redundant or inline-able, and skip any fix that would thin or remove one.

**Honor caller-passed structure pins.** When the caller passes a plan path with the structure-pin constraint, that plan path is context, never the simplification scope; that plan's `session-settled:`-labeled Key Technical Decisions are structural constraints the simplification must preserve — deliberately duplicated files stay duplicated, deliberately separate implementations stay separate — even when consolidation would otherwise be the obvious simplification.

## Step 4: Verify behavior is preserved

After applying fixes:

**Run typecheck and lint over the full project.**

**Run tests** scoped to the changed paths — widen the scope when a shared or heavily-imported path was touched, and run the full suite if the test runner has no scoping mechanism.

Do not relax assertions, weaken type signatures, or skip tests to make checks pass. Either fix the underlying break introduced by simplification, or revert the specific change that caused the regression.

If no test suite, lint, or typecheck is configured, state that explicitly in the summary; do not silently skip verification.

## Step 5: Summarize

Summarize what you fixed, what you skipped as false-positive or not worth addressing, and the checks you ran with their results. If there were no findings to act on, confirm the code didn't require any changes. Do not headline a net-lines-removed figure or frame fewer lines as the win — many clarity, safety, and efficiency fixes preserve or add lines.
