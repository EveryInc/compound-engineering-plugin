# `ce-simplify-code`

> Refine recently changed code. Three reviews look for reuse, quality, and efficiency issues; the skill applies the worthwhile ones and checks that behavior did not change.

`ce-simplify-code` is on-demand **refinement** of a settled diff. It searches for utilities the new code duplicates, flags hacky patterns and dead code, and points out missed efficiency. Three focused reviews see the same scope from those angles. The skill applies the findings, then runs typecheck, lint, and scoped tests.

It preserves exact functionality. It will not relax assertions, weaken type signatures, or skip tests to make checks pass. It will not remove a safety check (trust-boundary validation, data-loss protection, security, accessibility) just because a finding called it boilerplate.

This is not `ce-polish` (live UX on a working page), not `ce-code-review` (deeper review you still have to act on), and not a rewrite of the original feature. Use it after implementation has settled and before review, commit, or handoff.

Point it at a branch, a file, or a description. Empty invoke resolves the branch diff.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Three focused reviews of recently changed code, then applies findings and verifies behavior is unchanged |
| When to use it | After a feature or an agent-written chunk works, before review or PR |
| What it produces | In-place edits plus a summary: what changed, what was already sound, checks run, counts by reuse / quality / efficiency, skipped count |
| What's next | Whatever the change still needs: deeper review, more tests, commit/PR, or handoff. This skill does not pick the next stage |

---

## Example invocations

Scope is the main knob. A name you give is authoritative and is never widened.

```text
# Empty: branch vs its base, then staged + unstaged, then files edited in this chat
/ce-simplify-code

# One file
/ce-simplify-code app/services/notification_dispatcher.rb

# A description when a path is the wrong grain
/ce-simplify-code the changes I made to NotificationDispatcher

# Clean up what an agent just generated, before it becomes review noise
/ce-simplify-code the authentication code from the last implementation step

# Small: one function you just wrote
/ce-simplify-code the function I just wrote
```

Outside git, or with no diff, it uses files named or edited in the conversation. If that is still empty, it asks.

---

## The Problem

A finished change often still has refinement debt that is easy to miss while writing:

- A new helper that already exists in the repo
- Copy-paste with a small variation, unused imports, dead paths
- String comparisons where an enum or union already exists
- Names that only make sense if you followed the chat
- Compatibility aliases for an earlier form of this unshipped change
- Sequential work that could be concurrent, or a loop that writes the same state every tick
- Comments that restate what the identifiers already say

One "review and improve" prompt usually finds the obvious items and misses the ones that need a search across the tree.

## The Solution

Three reviewers, then apply, then verify:

- **Reuse** searches for existing utilities, stdlib/runtime primitives, and platform guarantees the new code reimplements
- **Quality** flags hacky structure, dead code, context-only names, leftover pre-release compatibility, and comments that only restate the code
- **Efficiency** looks for extra work, missed concurrency, hot-path bloat, and no-op updates

The skill applies what is worth keeping, notes false positives as skipped, and runs project-wide typecheck and lint plus tests sized to the blast radius.

---

## What Makes It Novel

### Three reviews of the same scope

A single "review and improve" prompt tends to follow the model's usual cleanup habits. Separate reuse, quality, and efficiency reviews cover the cross-tree search a generalist often skips. Dispatch is parallel when the host can run subagents; otherwise the same prompts run inline.

### Scope you name is the mutation boundary

Priority: your named file or description, else the branch diff vs base (or `git diff HEAD` if there is no usable base), else recent conversation edits, else ask. Edits stay inside that scope and the import/export seams it requires. A user-named file or directory cannot pull fixes that would edit outside it.

A docs-only, generated, vendored, lockfile, or purely mechanical scope stops with "nothing to simplify." Mixed diffs keep the code files. That is a kind gate, not a size gate. A small function you named still runs.

### Behavior stays the same, including safety

After edits: typecheck and lint over the project; tests scoped to the change, broadened when a shared utility moved. Failures name the check. The skill fixes the break or reverts that simplification. No assertion relaxing, no weaker types, no skipped tests.

Safety checks stay. A compatibility path for an earlier form of this unshipped change may go away only after it has no deployed, persisted, public, external, dependent-branch, or in-repo caller outside the scope, and every required caller update still fits the mutation boundary.

If a caller passes a plan path whose `session-settled:` decisions name structure (keep this duplication, keep this wrapper), those are pins, not scope.

---

## Quick Example

You have been writing a notification-mute feature. Before the PR you run `/ce-simplify-code`.

It takes the branch diff vs `origin/main` and runs the three reviews.

Reuse: `formatDuration` is a near-duplicate of `lib/utils/formatTime.ts`; path handling should use `path.join`; a custom env check should use `isProduction()`.

Quality: string compares against `"active"` / `"paused"` where `SubscriptionStatus` already exists; a nested ternary that early-returns cleanly; an unused export; a comment that only restates the function name.

Efficiency: two API calls in one handler can run together; a polling loop updates state every tick with no change guard.

The skill applies the fixes, skips one Quality finding as a false positive, then typecheck, lint, and scoped tests all pass. The summary lists what was good, what changed, and which checks ran.

---

## When to Reach For It

Use `ce-simplify-code` when:

- A feature (or an agent-written chunk) works and you want it thinner before review
- A refactor added helpers and you want to know they are not duplicates
- The diff touched shared code and you want checks behind the cleanup

Skip it when:

- The diff is mechanical (formatting, dependency bumps, lint-only, generated files)
- The diff is a couple of lines and you did not name a specific function
- You want the code left as written (teaching, an example)
- You are still shaping the change. Running this after every edit fights you; wait until a unit has settled

---

## Position in a Workflow

Run it after implementation has settled and before review, commit, or handoff.

`ce-work`, `lfg`, and `ce-debug` may invoke it at their own completion boundaries. They own size floors and exclusions. This skill does not.

After it finishes, continue with the action the change still needs. That may be `ce-code-review`, more tests, `ce-commit-push-pr`, or a handoff.

If you want the same wrap-up offer in ordinary sessions, add a standing instruction to the project's agent instructions: run (or offer) this skill once when a coherent unit is done, not after every edit, and not on docs-only or mechanical diffs. The skill already bails on a scope with no code.

---

## Use Standalone

- **Pre-PR on the branch:** `/ce-simplify-code`
- **One file:** `/ce-simplify-code app/services/notification_dispatcher.rb`
- **A named slice:** `/ce-simplify-code the changes I made to NotificationDispatcher`

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Branch vs base, then staged + unstaged, then recent conversation edits. Asks if still empty |
| `<file path>` | That file only (seams inside it) |
| `<description>` | User-named scope, e.g. `the function I just wrote`. Never widened |

Callers may also pass a plan path as structure-pin context. That is not the simplification scope.

---

## FAQ

**Why three reviewers instead of one?**
One reviewer follows the usual cleanup paths. Reuse in particular needs a search for existing helpers, which a generalist often skips.

**What if a finding is wrong?**
The skill applies findings directly. False positives are skipped and mentioned in the summary. It does not stop to argue.

**What if a fix breaks tests?**
It will not paper over the break. It fixes the regression or reverts that simplification.

**Why isn't this part of the original write?**
You find an existing utility when you search for it. A later pass with a dedicated search catches what the write did not.

**Does it refuse tiny diffs?**
No. Size gates belong to callers and standing instructions. An explicit small scope still runs.

**What if I point it at docs or a lockfile?**
It stops with a short "nothing to simplify" note. On a mixed diff it keeps the code files.

---

## See Also

- [`ce-work`](./ce-work.md): may run this before its review gate
- [`lfg`](./lfg.md): may run this on the branch diff before review
- [`ce-code-review`](./ce-code-review.md): deeper review after the diff is thinner
- [`ce-polish`](./ce-polish.md): live UX on a working page, not a code-cleanup pass
- [`ce-commit-push-pr`](./ce-commit-push-pr.md): ship after review and validation
