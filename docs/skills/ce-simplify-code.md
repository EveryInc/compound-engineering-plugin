# `ce-simplify-code`

> Refine recently changed code — three parallel reviewer agents find reuse, quality, and efficiency issues; apply the fixes; verify behavior is preserved by typecheck, lint, and scoped tests.

`ce-simplify-code` is the **refinement** skill. It does the homework that's easy to skip after writing code: searches for existing utilities your new code accidentally duplicates, flags hacky patterns and dead code, surfaces missed efficiency wins. Three parallel reviewer agents work the same diff from different angles — Reuse, Quality, Efficiency — and the orchestrator applies their findings, then verifies behavior is preserved.

It's a **utility skill** — point it at whatever you want refined. With no argument it resolves the branch diff; given a file path or a description ("the function I just wrote") it scopes to exactly that. That makes it the natural cleanup pass for AI-generated code, which is its highest-yield use. Agents reliably write more code than a problem needs: industry analysis of hundreds of millions of changed lines shows duplicated and copy-pasted code climbing sharply since coding assistants went mainstream, while refactoring — moving and reusing existing code — has fallen by more than half. The reason is structural, not a model defect: an agent optimizes each fragment locally to *look* well-engineered without the whole-system context to notice that the helper already exists, that the abstraction is single-use, or that the comment restates the code. The result works but carries duplication, single-use wrappers, defensive over-engineering, and tutorial-style comments. `ce-simplify-code` exists to strip that back to what the change actually requires.

The premise is that simplification preserves exact functionality. The skill enforces this by running typecheck, lint, and scoped tests after fixes. **It refuses to relax assertions, weaken type signatures, or skip tests to make checks pass** — that defeats the guarantee.

The compound-engineering ideation chain is `/ce-ideate → /ce-brainstorm → /ce-plan → /ce-work`. `ce-simplify-code` runs automatically as a quality gate inside `/ce-work` Phase 3 (for diffs ≥30 changed lines) and as step 3 of the autonomous `/lfg` loop (before review, skipped for docs-only or trivial changes), and is directly invocable for refining a feature branch before you open a PR.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Spawns three parallel reviewer agents on the recently-changed code, applies their findings, and verifies behavior is preserved |
| When to use it | Before opening a PR; after writing a feature; after AI generated code that works but feels heavy |
| What it produces | Updated code (in place) + a summary of what was changed, what was good as-is, which checks ran, and a quantified impact by dimension (fixes applied per reuse/quality/efficiency, skipped count, verification result) |
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

- **Reuse** — searches for existing utilities and helpers; flags new functions that duplicate existing ones; flags inline logic that could use an existing utility; flags diff code that reimplements a language standard-library or runtime primitive (gated on behavior-equivalence, excluding UX-changing swaps)
- **Quality** — redundant state, parameter sprawl, copy-paste with variation, leaky abstractions, stringly-typed code, unnecessary wrappers (in component-tree UI frameworks), deeply nested conditionals, unnecessary comments, dead code / unused imports / unused exports
- **Efficiency** — unnecessary work (redundant computations, repeat reads), missed concurrency, hot-path bloat, recurring no-op updates, TOCTOU pre-checks, memory issues, overly broad operations

### 2. Smart scope detection — user-named > git diff > recent edits

The skill resolves the simplification scope in priority order: explicit user-named scope (a file, "the function I just wrote") is authoritative; otherwise the git diff between the current branch and its base; otherwise recent edits; otherwise it asks rather than guessing. **User-named scope is never widened.**

### 3. Behavior preservation verification

After applying fixes, the skill runs typecheck and lint over the project and runs tests scoped to the changed paths (broadening when the change has wide reach — e.g., a heavily-imported utility was rewritten). Failures are surfaced clearly with the failing check name and relevant output. **The skill refuses to relax assertions, weaken type signatures, or skip tests to make checks pass** — either fix the underlying break or revert the specific simplification that caused it. It also **never simplifies away a safety check** — input validation at trust boundaries, data-loss-preventing error handling, security checks, and accessibility affordances are preserved even when a finding frames them as removable boilerplate.

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

`ce-simplify-code` is invoked automatically by two workflows, always **before** the review step so reviewers see the simplified diff:

- **`/ce-work` Phase 3** — runs when a diff is ≥30 changed lines, ahead of the harness-native or `/ce-code-review` review tier.
- **`/lfg` step 3** — the autonomous build loop runs it on the branch diff after the build step and before code review. It's skipped only for docs-only changes (markdown/docs paths) or trivial ones (roughly under 10 changed lines), and it leaves its edits uncommitted so the loop's later commit step sweeps them up with the rest of the work.

It's also commonly invoked manually before `/ce-commit-push-pr`, when you want a refinement pass on a branch you've been building over multiple sessions.

The flow when manually invoked typically looks like:

```text
write code → /ce-simplify-code → /ce-commit-push-pr
```

---

## Use Standalone

The skill works just as well outside the chain:

- **Pre-PR refinement** — `/ce-simplify-code` on a feature branch before opening a PR
- **Post-AI cleanup** — point it at code an agent just generated to strip the duplication, single-use wrappers, and over-engineering agents tend to leave behind; this is its highest-yield use
- **Targeted refinement** — `/ce-simplify-code "the changes I made to NotificationDispatcher"` honors a user-named scope
- **Single-file pass** — `/ce-simplify-code app/services/notification_dispatcher.rb`

When invoked outside a git repository or when no diff is available, the skill falls back to the most recently modified files in the conversation. If neither produces a non-empty scope, it asks rather than guesses.

---

## Make It Automatic

`ce-simplify-code` has the most value once a chunk of work has settled — which is exactly the checkpoint that's easiest to blow past on the way to a commit. Add a standing instruction to your agent's instruction file so the agent offers (or runs) the refinement pass on its own at that boundary, before it moves on to review or commit.

The timing is the part people get wrong. This is a pass over a *settled* diff, not a habit to fire after every edit. Run it mid-build — after each individual fix while you're still shaping the code — and it fights you, rewriting lines you were about to change anyway. Anchor it to a completion boundary: a feature is done, a PR is about to open, a logical unit is wrapped up. That is what the wording below encodes.

Put it in the repo's `AGENTS.md`/`CLAUDE.md`, or in your global instruction file (`~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`) to apply it in every repo.

The two variants below differ in interruption, not in risk. `ce-simplify-code` preserves behavior by construction — it won't weaken tests or type signatures, it never strips a safety check (validation, error handling, auth, escaping, accessibility), and it runs typecheck, lint, and scoped tests before it finishes. Its edits land on your branch, which you review before committing like any other change. So auto-run isn't the reckless choice and offer-first isn't the "safe" one — pick whichever fits how you like to work:

**Offer first** — the agent pauses to ask, so you get a beat to decline or to watch the pass happen:

> When you finish a coherent unit of work — a feature is complete, or you're wrapping up to open a PR — and before you review, commit, or hand it off, offer once to invoke the `ce-simplify-code` skill on the changed code. Do this at that completion checkpoint only, not after every individual edit or intermediate fix while you're still building. Offer only when the accumulated diff has at least 10 substantive code lines and the skill hasn't already run since the last code edit. Do not offer for documentation- or Markdown-only changes; formatting-, lint-, or dependency/lockfile-only changes; generated or vendored files; other purely mechanical changes; or code you've said to keep as written.

**Run automatically** — no prompt; the pass just runs at the boundary, which is the point when being interrupted is the thing you're trying to avoid:

> When you finish a coherent unit of work — a feature is complete, or you're wrapping up to open a PR — and before you review, commit, or hand it off, automatically invoke the `ce-simplify-code` skill on the changed code. Do this at that completion checkpoint only, not after every individual edit or intermediate fix while you're still building. Run it only when the accumulated diff has at least 10 substantive code lines and the skill hasn't already run since the last code edit. Never run it for documentation- or Markdown-only changes; formatting-, lint-, or dependency/lockfile-only changes; generated or vendored files; other purely mechanical changes; or code you've said to keep as written.

The exclusions are the load-bearing part. The three reviewers hunt for reuse, quality, and efficiency issues in *code*, so a documentation- or Markdown-only diff yields nothing and just burns three subagent dispatches — the single most common way an eager standing instruction wastes cycles. The same holds for mechanical churn (formatting, lint autofixes, dependency bumps, lockfiles, generated or vendored output): deterministic diffs have no simplification surface. Keep these as hard exclusions rather than trusting the agent to infer "is this one worth it," which literal agents get wrong in both directions.

Every other phrase is deliberate too:

- **"when you finish a coherent unit of work … not after every edit"** — this is the phrasing that stops the pass from firing too often. It refines a *settled* diff; run it after each intermediate fix and it re-edits code you're still building, which is worse than not running it at all. Anchor it to a completion boundary, not to the act of changing code.
- **"invoke the `ce-simplify-code` skill"**, not "run `/ce-simplify-code`" — instruction files are read by whatever agent you're using (Codex, Gemini, Cursor, Claude Code), and the slash-command form isn't reliably agent-callable across all of them. Reference the capability, not the keystroke.
- **"before review, commit, or handoff"**, not "at the end of the session" — an agent can't reliably tell when a session has *ended*, but it does know when it's about to review, commit, or hand a change back to you, which is exactly when the diff should already be refined.
- **"offer once"** — without it, an offer-first instruction re-asks after every verification step.
- **"human-authored code"**, not a filename allowlist — tests, migrations, and code-bearing config can all carry real simplification yield, so the boundary is *substantive code you wrote*, not a fixed set of extensions. A mixed code-and-docs diff still qualifies; the reviewers scope to the code.
- **"at least 10 substantive code lines"** — the yield on a couple of changed lines is below the review overhead. 10 matches the floor `/lfg` already uses; raise it to 30 (the `ce-work` floor) for a quieter policy that only fires on larger changes.
- **"hasn't already run since the last code edit"** — `/ce-work` and `/lfg` already run this pass inside their own flows, so this keeps a global instruction from duplicating a pass those workflows just did, while still letting it fire on branches you built by hand.

The skill also self-guards: invoked directly on a scope with no code in it, it stops with a short "nothing to simplify" note instead of dispatching reviewers. So the exclusions above are belt-and-suspenders — but the standing instruction still carries the full gate (including the size floor), because not invoking the skill at all is cheaper than invoking it only to have it bail.

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
By default it runs against whatever code scope it resolves, but the yield on tiny diffs (a couple of lines) is low. The automated callers gate on size for that reason: `ce-work` runs it only for diffs ≥30 changed lines, and `/lfg` skips it for docs-only or trivial (roughly under 10 changed lines) changes. The skill itself does not gate on size — an explicit scope on a small function is authoritative and still runs; the size floor is a cost policy that lives in the callers and in any [standing instruction](#make-it-automatic) you add.

**What if I point it at a docs-only or mechanical diff?**
The skill detects when the resolved scope has no substantive code — documentation/Markdown-only, or only generated, vendored, lockfile, or purely mechanical churn — and stops with a short "nothing to simplify" note instead of dispatching the three reviewers, which would find nothing there. On a mixed diff it narrows to the code files and continues. This self-guard keys on the *kind* of change, not its size.

---

## See Also

- [`ce-work`](./ce-work.md) — calls this skill in Phase 3 for diffs of significant size
- `lfg` — the autonomous build loop runs this skill as step 3, before its review step
- [`ce-commit-push-pr`](./ce-commit-push-pr.md) — usual next step after a refinement pass
- [`ce-code-review`](./ce-code-review.md) — the deeper code review skill; `ce-simplify-code` is a complement, not a substitute
