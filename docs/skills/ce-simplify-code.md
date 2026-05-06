# `ce-simplify-code`

> Refine recently changed code — three parallel reviewer agents find reuse, quality, and efficiency issues; apply the fixes; verify behavior is preserved by typecheck, lint, and scoped tests.

`ce-simplify-code` is the **refinement** skill. It does the homework that's easy to skip after writing code: searches for existing utilities your new code accidentally duplicates, flags hacky patterns and dead code, surfaces missed efficiency wins. Three parallel reviewer agents work the same diff from different angles — Reuse, Quality, Efficiency — and the orchestrator applies their findings, then verifies behavior is preserved.

The premise is that simplification preserves exact functionality. The skill enforces this by running typecheck, lint, and scoped tests after fixes. **It refuses to relax assertions, weaken type signatures, or skip tests to make checks pass** — that defeats the guarantee.

The compound-engineering ideation chain is `/ce-ideate → /ce-brainstorm → /ce-plan → /ce-work`. `ce-simplify-code` runs as a quality gate inside `/ce-work` Phase 3 (for diffs ≥30 changed lines), and is directly invocable for refining a feature branch before you open a PR.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Spawns three parallel reviewer agents on the recently-changed code, applies their findings, and verifies behavior is preserved |
| When to use it | Before opening a PR; after writing a feature; after AI generated code that works but feels heavy |
| What it produces | Updated code (in place) + a summary of what was changed, what was good as-is, and which checks ran |
| What's next | Open the PR via `/ce-commit-push-pr` |

---

## The Problem

After writing a feature, the code usually has refinement debt that's easy to miss in the moment:

- **Re-implemented utilities** — you wrote a string-trim helper that already exists in `lib/utils/`
- **Hacky patterns** — copy-paste with slight variation, redundant state, parameter sprawl, leaky abstractions
- **Dead code** — unused imports, exports nothing references, code paths no longer reachable
- **Stringly-typed values** where an enum or branded type already exists
- **Missed efficiency** — sequential operations that could be parallel, redundant computations, N+1 patterns
- **Comments that explain WHAT** the code does (which the identifiers already do) instead of non-obvious WHY

A single reviewer can find some of these but rarely all. Asking the agent to "review and improve" tends to surface the most obvious issues and miss the ones that require cross-cutting search.

## The Solution

`ce-simplify-code` runs three parallel reviewers, each focused on one dimension:

- **Reuse Reviewer** searches for existing utilities the new code duplicates
- **Quality Reviewer** flags hacky patterns, dead code, stringly-typed code, unnecessary comments, nested conditionals
- **Efficiency Reviewer** finds missed concurrency, hot-path bloat, recurring no-op updates, broad operations

The orchestrator aggregates their findings, applies fixes, and runs typecheck + lint + scoped tests to verify behavior is preserved.

---

## What Makes It Novel

### 1. Three parallel reviewer agents — different angles, same diff

A single "review and improve" prompt collapses into the agent's most-trained directions. Three reviewers each focused on one dimension cover meaningfully more ground:

- **Reuse** — searches for existing utilities and helpers; flags new functions that duplicate existing ones; flags inline logic that could use an existing utility
- **Quality** — redundant state, parameter sprawl, copy-paste with variation, leaky abstractions, stringly-typed code, unnecessary wrappers (in component-tree UI frameworks), deeply nested conditionals, unnecessary comments, dead code / unused imports / unused exports
- **Efficiency** — unnecessary work (redundant computations, repeat reads), missed concurrency, hot-path bloat, recurring no-op updates, TOCTOU pre-checks, memory issues, overly broad operations

### 2. Smart scope detection — user-named > git diff > recent edits

The skill resolves the simplification scope in priority order: explicit user-named scope (a file, "the function I just wrote") is authoritative; otherwise the git diff between the current branch and its base; otherwise recent edits; otherwise it asks rather than guessing. **User-named scope is never widened.**

### 3. Behavior preservation verification

After applying fixes, the skill runs typecheck and lint over the project and runs tests scoped to the changed paths (broadening when the change has wide reach — e.g., a heavily-imported utility was rewritten). Failures are surfaced clearly with the failing check name and relevant output. **The skill refuses to relax assertions, weaken type signatures, or skip tests to make checks pass** — either fix the underlying break or revert the specific simplification that caused it.

### 4. Mid-tier model selection — cost-aware

The reviewer agents are dispatched on the platform's mid-tier model. Code review of a known diff doesn't need top-tier reasoning. On platforms where the model override is unavailable, the skill omits the override rather than failing the dispatch.

---

## Quick Example

You've spent an hour writing a notification-mute feature. Before opening the PR, you invoke `/ce-simplify-code`.

The skill detects you're on a feature branch with a base of `origin/main`, takes the diff as the scope, and dispatches three reviewers in parallel.

Reuse comes back with three findings: your new `formatDuration` function is a near-duplicate of `lib/utils/formatTime.ts`; your inline path-handling logic should use `path.join` instead; a custom env check should use the existing `isProduction()` helper.

Quality flags two stringly-typed comparisons against `"active"` and `"paused"` where the codebase already has a `SubscriptionStatus` union; one nested ternary chain that flattens cleanly with early returns; an export that nothing references; one comment explaining what a well-named function does.

Efficiency identifies that two API calls in a single handler could run in parallel and that a polling loop dispatches a state update on every tick without a change-detection guard.

The orchestrator applies all the fixes (skipping one Quality finding it judges a false positive). It runs typecheck (pass), lint (pass), and scoped tests for the changed paths (pass). The summary names what was good, what was changed, which checks ran.

---

## When to Reach For It

Reach for `ce-simplify-code` when:

- You've finished a feature and want to refine before opening a PR
- AI generated code that works but feels heavy
- A refactor produced new utilities and you want to confirm they don't duplicate existing ones
- A diff has been touching shared code and you want a behavior-preservation guarantee with checks

Skip `ce-simplify-code` when:

- The diff is mechanical (formatting, dependency bumps, lint fixes, generated artifacts) — simplification has no useful yield on those
- The diff is tiny (a couple of lines) — review overhead exceeds yield
- You explicitly want the code as written (e.g., teaching or illustrative purposes)

---

## Use as Part of the Workflow

`ce-simplify-code` is called automatically by `/ce-work` Phase 3 when a diff is ≥30 changed lines — it runs before the harness-native or `/ce-code-review` review tier so reviewers see the simplified diff. It's also commonly invoked manually before `/ce-commit-push-pr`, when you want a refinement pass on a branch you've been building over multiple sessions.

The flow when manually invoked typically looks like:

```text
write code → /ce-simplify-code → /ce-commit-push-pr
```

---

## Use Standalone

The skill works just as well outside the chain:

- **Pre-PR refinement** — `/ce-simplify-code` on a feature branch before opening a PR
- **Post-AI cleanup** — when an LLM generated code that ships but feels over-engineered
- **Targeted refinement** — `/ce-simplify-code "the changes I made to NotificationDispatcher"` honors a user-named scope
- **Single-file pass** — `/ce-simplify-code app/services/notification_dispatcher.rb`

When invoked outside a git repository or when no diff is available, the skill falls back to the most recently modified files in the conversation. If neither produces a non-empty scope, it asks rather than guesses.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Default: branch diff vs base; falls back to staged + unstaged; falls back to recent edits |
| `<file path>` | Limits scope to that file |
| `<description>` | e.g., "the function I just wrote", "the changes from this morning" — user-named scope is authoritative |

---

## FAQ

**Why three reviewers instead of one?**
A single reviewer collapses into the agent's most-trained directions. Three reviewers each focused on one dimension (reuse / quality / efficiency) cover meaningfully more ground in parallel — especially the cross-cutting search for existing utilities the new code duplicates, which a generalist reviewer often misses.

**What if a finding is wrong or not worth addressing?**
The orchestrator aggregates findings and applies them directly. If a finding is a false positive, it's noted and skipped — the skill doesn't argue or surface it back to you. The summary mentions what was acted on.

**What if applying fixes breaks tests?**
The skill won't relax assertions, weaken type signatures, or skip tests to paper over the break. Either it fixes the underlying issue introduced by the simplification, or it reverts the specific change that caused the regression. The premise is preservation of exact functionality.

**Why isn't simplification just part of the original write?**
It can be, but in practice the moment to find an existing utility is when you're searching for it, not when you're writing the feature. A separate refinement pass with parallel cross-cutting search catches things the original write didn't.

**Does it run for tiny diffs?**
By default it runs against whatever scope it resolves, but the yield on tiny diffs (a couple of lines) is low. Inside `ce-work`, the skill is gated by the ≥30-line threshold for that reason.

---

## See Also

- [`ce-work`](./ce-work.md) — calls this skill in Phase 3 for diffs of significant size
- [`ce-commit-push-pr`](./ce-commit-push-pr.md) — usual next step after a refinement pass
- [`ce-code-review`](./ce-code-review.md) — the deeper code review skill; `ce-simplify-code` is a complement, not a substitute
