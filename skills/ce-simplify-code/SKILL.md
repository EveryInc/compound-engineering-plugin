---
name: ce-simplify-code
description: "Simplify code for clarity, reuse, quality, and efficiency while preserving behavior, and prune tests and comments that carry no value. Use after implementation and before review, or to audit tests or comments in any part of a repo; use ce-debug for bugs."
argument-hint: "[blank for current branch changes, or describe what to simplify or audit] [mode:pipeline] [proof-test:<path>]"
---

Simplify code for clarity, reuse, quality, and efficiency, and prune tests and comments that carry no value, while preserving exact behavior. Prioritize readable, explicit code over compact code — fewer lines is not the goal.

## Mode

Strip a `mode:pipeline` token and every `proof-test:<path>` token from the input before reading the rest as the scope. The proof-test path is context for Step 3, never scope; a caller may pass several.

- **Pipeline** when `mode:pipeline` is present, or when no one asked for this run in their own current message: a step of another skill, or a run the agent starts itself, such as at a completion boundary. Work only on the current work, apply fixes without asking or waiting, and return the Step 5 summary to the caller. That summary is for the caller's record; never paste it into a commit, PR body, or other artifact.
- **Standalone** when the user's own current message asked for this run. Their request sets the scope and focus. Report findings before editing anything, unless the request says to just fix them. Read `references/standalone-report.md` now, and again before applying any reported finding.

## Step 1: Identify scope

Resolve the scope in this order:

1. **User-named scope** is authoritative; do not widen it. In standalone mode it may be the whole repo, an area, or a path.
2. **Otherwise, in git**, use the current branch versus its base. Without a usable base, use staged and unstaged changes (`git diff HEAD`).
3. **Outside git or without a diff**, use files the user named or that were edited earlier in the conversation.

In pipeline mode the scope is what the caller passed, else the branch diff. Within it, prune only tests and comments the current work added or changed.

If none of the above produces a non-empty scope, pipeline mode reports "nothing to simplify" and returns. Standalone mode asks the user what to simplify, as `references/standalone-report.md` describes.

**Preflight.** If the scope has no substantive human-authored code — only documentation, generated or vendored files, dependencies or lockfiles, or mechanical churn — report that there is nothing to simplify and stop without reviewers. For mixed scopes, retain only the code and its tests. This check is about the kind of change, never its size: explicit small scopes still run, and any size or cost threshold is the caller's to set.

When the platform's task-tracking capability is available, show the review, apply, and verification outcomes without creating one task per reviewer. Otherwise continue without simulating a task list in chat.

## Step 2: Launch review agents in parallel

Dispatch generic subagents via the platform's subagent primitive (`Agent`/`Task` in Claude Code, `spawn_agent` in Codex) where available; otherwise run the reviews inline or serially. For each reviewer, read its prompt asset from this skill's directory and pass the **full file content** as the subagent's prompt, together with the resolved scope (the full diff or file set), the mode, any proof test, the user's constraints, and the project standards governing the scope (or their file paths):

- `references/personas/code-reuse-reviewer.md`
- `references/personas/code-quality-reviewer.md`
- `references/personas/efficiency-reviewer.md`
- `references/personas/test-value-reviewer.md`, when the scope holds tests
- `references/personas/comment-reviewer.md`, when the scope holds comments

A standalone request about only tests or only comments runs only that reviewer.

Do not paraphrase these rubrics from memory. Read each file and pass it verbatim, or the reviewer loses the rules that keep the pass behavior-preserving.

Read `references/reviewer-dispatch.md` before dispatching; it covers a full harness, releasing review agents, and the permission mode.

**Model selection.** Use the platform's balanced mid-tier model for these reviewers when the current harness exposes a known override. In Claude Code this is the Sonnet class. In Codex, apply this tier only when the active dispatch primitive exposes an explicit model or custom-agent selector; task wording alone does not select a different model. Otherwise omit the override and inherit the parent model -- a working pass on the parent model beats a broken dispatch.

If the user's or project's active instructions or the live prompt name a model for this subagent, use that model instead of the default tier above. They can name it by the subagent's tier, by its prompt-asset name, or for the subagents being dispatched. Without such an instruction, a model configured for this subagent's role takes precedence over the default tier.

## Step 3: Fix issues

Proceed only after every review outcome is complete, whether returned by subagents or produced inline. In standalone mode, unless the request says to just fix them, report and stop here. Otherwise apply worthwhile findings directly; record false positives and low-value findings as skipped without asking the user.

Inspect beyond the resolved scope when needed to evaluate a finding, but edit only that scope and the import/export lines it needs. For a user-named file or directory scope, those import/export lines must also be inside it; skip any fix that would edit outside the mutation boundary.

Each fix must preserve outputs, errors, side effects, and ordering. If that cannot be established, skip it.

**Never simplify away a safety check.** Preserve trust-boundary validation, data-loss protection, security checks, and accessibility affordances. Skip any finding that would thin or remove one.

**Protect the proof tests.** In pipeline mode, each test the current work relied on to show its change works stays exactly as it is: every `proof-test:` path, else the tests the session's evidence names. Skip any finding from any reviewer that would delete, weaken, rename, move, merge, or rewrite one, or remove or rename the test-only code it calls. Behavior-preserving changes to the production code it exercises still apply. When you cannot tell which tests those are, delete or rewrite none of the tests the current work added or changed.

**Honor caller-passed structure pins.** A plan path passed with the structure-pin constraint is context, not scope. Preserve its `session-settled:` Key Technical Decisions, including deliberate duplication or separation.

## Step 4: Verify behavior is preserved

Run project-wide typecheck and lint. Run tests matched to blast radius: scoped tests for local changes, broader tests for shared or wide-reach changes, and the full suite when the runner cannot scope tests.

Report failures with the check name and relevant output. Fix simplification-caused failures or revert the responsible change. Never weaken or remove a test to make a check pass. A test is removed only as a test-value finding, and any remaining tests that finding named must still pass afterwards.

If no test suite, lint, or typecheck is configured, state that explicitly in the summary; do not silently skip verification.

## Step 5: Summarize

Summarize what was already sound and what improved. Report applied counts by reuse, quality, efficiency, tests, and comments; skipped count; check outcomes; and any comment kept because its constraint could not be encoded. If nothing changed, say so. Do not use net lines removed as the success metric. In pipeline mode this summary ends the skill, not the turn: the caller's next step follows it.
