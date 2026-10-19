# `ce-simplify-code`

> Simplify code and prune tests and comments that carry no value, behavior preserved: fixes applied automatically inside a workflow, reported first when you ask for it.

A finished change usually carries debt you could not see while writing it: a helper that already exists in the repo, copy-paste with a small variation, string compares where an enum exists, names that only make sense if you followed the chat, two API calls that could run together, a test that only checks what its own mock returns, a comment that repeats the line below it. One "review and improve" prompt finds the obvious items and misses the ones that need a search across the tree.

`ce-simplify-code` runs focused reviews of the same scope instead:

- **Reuse** searches for existing utilities, stdlib/runtime primitives, and platform guarantees the new code reimplements
- **Quality** flags hacky structure, dead code, context-only names, and leftover pre-release compatibility
- **Efficiency** looks for extra work, missed concurrency, hot-path bloat, and no-op updates
- **Test value** (when the scope has tests) flags tests that would pass even if the code were broken, tests coupled to internals, duplicate coverage, and production seams only tests use
- **Comments** (when the scope has comments) deletes by default. A comment survives only as a license header, a note on behavior forced from outside, a public API doc, a link explaining a constraint code cannot express, a comment a tool reads, or one the project's written standards require. A comment that explains a surprise in your own code becomes a refactor that makes it unnecessary

Before reporting or applying, one fresh challenger tries to disprove the candidate findings using the original diff and requirements. The caller adjudicates once; no findings is valid. If independent capacity is unavailable, the caller checks inline and reports that limit. Deletions need a concrete benefit and preserved contracts; existing clear code or equivalent remaining test coverage can supply the alternative. A separate requirements document is unnecessary.

Collected review agents are released before the next batch or handoff when the harness provides caller-owned cleanup. When it does not, the review reports retained-capacity limitations without claiming that completion freed a slot.

When another skill runs it, it applies what is worth keeping and notes false positives as skipped without stopping to argue. When you run it yourself, it lists the findings first and applies the ones you pick, unless you tell it to just fix them. Either way it then runs project-wide typecheck and lint plus tests sized to the change, and the summary reports what was already sound, what changed, counts by category, and which checks ran.

This is not `ce-polish` (live UX on a working page), not `ce-code-review` (deeper review you still act on yourself), and not a rewrite of the feature. Use it after implementation has settled and before review, commit, or handoff, or any time you want an area's tests or comments audited.

---

## Two modes

**When another skill runs it** (`ce-work`, `lfg`, `ce-debug`'s fix handoff) or the agent runs it at a completion boundary, it works only on the current work, applies fixes without asking, and returns a summary. It prunes only tests and comments the current work added or changed; older ones in the same files stay, and a standalone audit is the way to reach them. It never touches the tests that prove the work. Callers mark these runs with `mode:pipeline` and name that test with `proof-test:<path>`.

**When you run it yourself**, your request sets the scope, from your recent changes to the whole repo. It reports numbered findings grouped as delete, refactor, or encode as a test, and changes nothing until you say which to apply. Say "just fix them" or "without asking" to skip the report.

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

# Audit an area's tests or comments, report first
/ce-simplify-code audit the tests in src/converters
/ce-simplify-code find useless comments across the repo

# Prune without a report
/ce-simplify-code remove the useless comments in src/ without asking
```

| Argument | Effect |
|----------|--------|
| _(empty)_ | Branch vs base, then staged + unstaged, then recent conversation edits. Asks if still empty. Reports before editing |
| `<file path>` | That file only (seams inside it) |
| `<description>` | User-named scope, e.g. `the function I just wrote` or `the whole repo`. Never widened. A request about only tests or only comments runs only that review |
| `mode:pipeline` | Set by calling skills: current work only, fixes applied without a report |
| `proof-test:<path>` | Set by calling skills, once per test proving the fix: those tests stay untouched. Context, not scope |

Outside git, or with no diff, it uses files named or edited in the conversation. If that is still empty, it asks rather than guessing.

A docs-only, generated, vendored, lockfile, or purely mechanical scope stops with "nothing to simplify." Mixed diffs keep the code files. That is a kind gate, not a size gate: a small function you named still runs. Size floors and cost thresholds belong to callers and standing instructions, not to this skill.

Callers may also pass a plan path as structure-pin context. Its `session-settled:` decisions that name structure (keep this duplication, keep this wrapper) are pins the skill preserves; the plan is not the simplification scope.

---

## Cleaning up tests and comments

Two things in your prompt matter: what it covers, and whether it asks for a report or for changes. A request about only tests or only comments runs only that review. "Find", "audit", "review", or no instruction at all gets a report first. "Without asking", "just fix them", or "no need to check with me" applies the changes directly.

| Prompt | What happens |
|--------|--------------|
| `/ce-simplify-code find useless comments across the repo` | Comment review only, whole repo. Reports which comments to delete, which surprising code to rename or restructure so its comment can go, and which unenforced rules to encode as a test. Changes nothing |
| `/ce-simplify-code remove the useless comments in src/ without asking` | Deletes restating, narrating, and stale comments under `src/`. Renames or extracts code where a comment was explaining a confusing name. Keeps license headers, notes on behavior forced from outside, public API docs, tool directives, and comments your project's standards require |
| `/ce-simplify-code audit the tests in src/converters` | Test review only. Reports tests that would pass even if the code were broken, near-duplicates to merge, and production exports only tests use. Each deletion names the remaining test that covers the same ground, or shows the test asserts nothing that could fail |
| `/ce-simplify-code prune the useless tests in this repo, no need to check with me` | Deletes or merges those tests, and removes the test-only exports they kept alive. A test that already fails is reported as a possible bug, never deleted |
| `/ce-simplify-code clean up the tests and comments in src/billing` | Both reviews over `src/billing`, report first. Reply with what to apply |
| `/ce-simplify-code` | Your recent changes, every review, report first |

A report-first run ends with numbered findings grouped as delete, refactor, and encode as a test, for example:

```text
Delete
1. src/dates.ts:22 -- "add one day to the date" restates addDays (and is wrong: it adds n days).
2. tests/dates.test.ts:5 -- T01 asserts the value its own mock returns; T04 covers formatDate for real.

Refactor
3. src/dates.ts:29 -- the comment explains what `flag` means. Rename it to `skipWeekends`, then delete the comment.

Encode as a test
4. src/dates.ts:5 -- "MAX_RANGE_DAYS must stay below 366" is enforced nowhere. Add
   expect(MAX_RANGE_DAYS).toBeLessThan(366), then delete the comment.

Possible defect: tests/dates.test.ts T05 fails before any change (addBusinessDays skips Friday, not Saturday).
```

Reply with what to apply: `apply all`, `apply 1, 3`, or a description such as "apply the comment deletions only". Before each edit the skill re-checks that finding against the current code, skips any whose code changed since the report, and runs the usual checks afterward.

---

## How it stays behavior-preserving

Edits stay inside the resolved scope and the import/export seams it requires. A user-named file or directory cannot pull fixes that would edit outside it. The skill inspects beyond the scope when it needs to evaluate a finding, but it only edits inside.

After the edits: typecheck and lint over the project, and tests matched to blast radius, broadened when a shared utility moved. If a check fails, the skill names it, then fixes the break or reverts that simplification. It never weakens or removes a test to get to green: a test is removed only as a test-value finding, which must name the remaining test that covers the same ground (that test must still pass) or show that the removed test asserted nothing that could fail. Every candidate is run first: a test that already fails, or cannot be run, is reported as a possible bug, never deleted. If the project has no test suite, lint, or typecheck, the summary says so instead of silently skipping verification.

Safety checks stay. The skill will not remove trust-boundary validation, data-loss protection, security checks, or accessibility affordances just because a finding called them boilerplate. A compatibility path for an earlier form of the same unshipped change may go only after the skill verifies it has no deployed, persisted, public, external, dependent-branch, or in-repo caller outside the scope, and every required caller update still fits inside the edit boundary.

---

## Worked example

You have been writing a notification-mute feature. Before the PR you run `/ce-simplify-code`. It takes the branch diff vs `origin/main` and runs the focused reviews.

Reuse finds that `formatDuration` near-duplicates `lib/utils/formatTime.ts`, path handling should use `path.join`, and a custom env check should use `isProduction()`. Quality finds string compares against `"active"` / `"paused"` where `SubscriptionStatus` already exists, a nested ternary that early-returns cleanly, and an unused export. The comment review deletes a comment restating the function name and turns a comment explaining a confusing flag into a rename. The test review finds a test whose mock returns the value it asserts and deletes it, since another test covers the same behavior through the real code. Efficiency finds two API calls in one handler that can run together and a polling loop that writes the same state every tick.

Because you started the run yourself, it reports these as numbered findings and changes nothing. You reply "apply all"; it re-checks each finding against the current code, applies them, skips one Quality finding as a false positive, and typecheck, lint, and scoped tests pass. The summary lists what was good, what changed, and which checks ran.

---

## When to reach for it

Use it when:

- A feature (or an agent-written chunk) works and you want it thinner before review
- A refactor added helpers and you want to know they are not duplicates
- You want an audit of an area's tests or comments, with a list to approve before anything changes
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
