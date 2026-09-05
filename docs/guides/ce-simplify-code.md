# `ce-simplify-code`

> Refine recently changed code. Three reviews look for reuse, quality, and efficiency issues; the skill applies the worthwhile ones and checks that behavior did not change.

A finished change usually carries debt you could not see while writing it: a helper that already exists in the repo, copy-paste with a small variation, string compares where an enum exists, names that only make sense if you followed the chat, two API calls that could run together. One "review and improve" prompt finds the obvious items and misses the ones that need a search across the tree.

`ce-simplify-code` runs three focused reviews of the same scope instead:

- **Reuse** searches for existing utilities, stdlib/runtime primitives, and platform guarantees the new code reimplements
- **Quality** flags hacky structure, dead code, context-only names, leftover pre-release compatibility, and comments that only restate the code
- **Efficiency** looks for extra work, missed concurrency, hot-path bloat, and no-op updates

It applies what is worth keeping, notes false positives as skipped without stopping to argue, then runs project-wide typecheck and lint plus tests sized to the change. The summary reports what was already sound, what changed, counts by category, and which checks ran.

This is not `ce-polish` (live UX on a working page), not `ce-code-review` (deeper review you still act on yourself), and not a rewrite of the feature. Use it after implementation has settled and before review, commit, or handoff.

---

## Invoking it

Scope is the main knob. A scope you name is authoritative and never widened.

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

| Argument | Effect |
|----------|--------|
| _(empty)_ | Branch vs base, then staged + unstaged, then recent conversation edits. Asks if still empty |
| `<file path>` | That file only (seams inside it) |
| `<description>` | User-named scope, e.g. `the function I just wrote`. Never widened |

Outside git, or with no diff, it uses files named or edited in the conversation. If that is still empty, it asks rather than guessing.

A docs-only, generated, vendored, lockfile, or purely mechanical scope stops with "nothing to simplify." Mixed diffs keep the code files. That is a kind gate, not a size gate: a small function you named still runs. Size floors and cost thresholds belong to callers and standing instructions, not to this skill.

Callers may also pass a plan path as structure-pin context. Its `session-settled:` decisions that name structure (keep this duplication, keep this wrapper) are pins the skill preserves; the plan is not the simplification scope.

---

## How it stays behavior-preserving

Edits stay inside the resolved scope and the import/export seams it requires. A user-named file or directory cannot pull fixes that would edit outside it. The skill inspects beyond the scope when it needs to evaluate a finding, but it only edits inside.

After the edits: typecheck and lint over the project, and tests matched to blast radius, broadened when a shared utility moved. If a check fails, the skill names it, then fixes the break or reverts that simplification. It never relaxes assertions, weakens types, or skips tests to get to green. If the project has no test suite, lint, or typecheck, the summary says so instead of silently skipping verification.

Safety checks stay. The skill will not remove trust-boundary validation, data-loss protection, security checks, or accessibility affordances just because a finding called them boilerplate. A compatibility path for an earlier form of the same unshipped change may go only after the skill verifies it has no deployed, persisted, public, external, dependent-branch, or in-repo caller outside the scope, and every required caller update still fits inside the edit boundary.

---

## Worked example

You have been writing a notification-mute feature. Before the PR you run `/ce-simplify-code`. It takes the branch diff vs `origin/main` and runs the three reviews.

Reuse finds that `formatDuration` near-duplicates `lib/utils/formatTime.ts`, path handling should use `path.join`, and a custom env check should use `isProduction()`. Quality finds string compares against `"active"` / `"paused"` where `SubscriptionStatus` already exists, a nested ternary that early-returns cleanly, an unused export, and a comment restating the function name. Efficiency finds two API calls in one handler that can run together and a polling loop that writes the same state every tick.

The skill applies the fixes, skips one Quality finding as a false positive, and typecheck, lint, and scoped tests pass. The summary lists what was good, what changed, and which checks ran.

---

## When to reach for it

Use it when:

- A feature (or an agent-written chunk) works and you want it thinner before review
- A refactor added helpers and you want to know they are not duplicates
- The diff touched shared code and you want checks behind the cleanup

Skip it when:

- The diff is mechanical (formatting, dependency bumps, lint-only, generated files)
- The diff is a couple of lines and you did not name a specific function
- You want the code left as written (teaching, an example)
- You are still shaping the change. Running this after every edit fights you; wait until a unit has settled

---

## Position in a workflow

Run it after implementation has settled and before review, commit, or handoff. `ce-work`, `lfg`, and `ce-debug` may invoke it at their own completion boundaries; they own size floors and exclusions.

The skill does not pick the next stage. After it finishes, continue with whatever the change still needs: `ce-code-review`, more tests, `ce-commit-push-pr`, or a handoff.

If you want the same wrap-up in ordinary sessions, add a standing instruction to the project's agent instructions: run (or offer) this skill once when a coherent unit is done, not after every edit, and not on docs-only or mechanical diffs. The skill already bails on a scope with no code.

---

## See also

- [`ce-work`](./ce-work.md): may run this before its review gate
- [`lfg`](./lfg.md): may run this on the branch diff before review
- [`ce-code-review`](./ce-code-review.md): deeper review after the diff is thinner
- [`ce-polish`](./ce-polish.md): live UX on a working page, not a code-cleanup pass
- [`ce-commit-push-pr`](./ce-commit-push-pr.md): ship after review and validation
