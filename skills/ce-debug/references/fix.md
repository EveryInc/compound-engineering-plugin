# Fix: workspace safety, test-first, and what a failed fix means

Read this before editing any file in Phase 3. The body keeps the two rules that decide whether a fix may start at all — the branch check and the pre-fix scope Phase 4 depends on — and this file carries the rest.

### Phase 3: Fix

*Reminder: one change at a time. If you are changing multiple things, stop.*

If the user chose "Diagnosis only," skip to Phase 4's summary. If they chose "Rethink the design," control has transferred to `ce-brainstorm` and this skill ends.

**Workspace and branch check — before editing files:**

- Check `git status`. If the user has unstaged work in files that need modification, confirm before editing — do not overwrite in-progress changes.
- If the current branch is the default branch, create a feature branch without asking — derive a name from the bug, run `git checkout -b <name>`, and say which branch you moved to. Detect the default branch by comparing against `main`, `master`, or `git rev-parse --abbrev-ref origin/HEAD` **with its `origin/` prefix stripped** — the raw output is `origin/<name>`, so an unstripped comparison never matches. On any other branch, proceed.
- **Record the pre-fix scope:** current `HEAD`, whether `git status --short` is clean, and any pre-existing changed files. Then keep a list of **fix-owned files** (the tests and implementation changed for this bug) as you work. Phase 4 uses both to keep simplify/review off unrelated branch work.

**Test-first:**

1. Choose the regression test's home per the rule in Phase 1.1 — existing failing test, updated existing test, strengthened over-mocked test, or a new focused one.
2. Verify that test fails for the right reason — the root cause, not unrelated setup.
3. Implement the **minimal** fix: the root cause and nothing else. No drive-by refactors, formatting, or unrelated cleanup — those are separate commits.
4. Verify the test passes, then run the broader suite for regressions.
5. Self-review the diff — read every changed line for style violations, missed edge cases, regressions in adjacent behavior, and missing coverage. The broader polish/review/PR tail belongs to Phase 4, after the debug summary.

**On a failed fix:** return to Phase 2 and *explicitly invalidate the current hypothesis* before forming a new one — state what evidence ruled it out, then form a new hypothesis with its own grounding observation and prediction. Do not retry variants of the same theory ("maybe it was the other branch", "let me also catch this case"); that is the rationalization spiral, not iteration. **3 failed attempts = smart escalation** (same table as Phase 2): if fixes keep failing, the root cause identification was likely wrong.

**Conditional defense-in-depth** (trigger: grep found the root-cause pattern in 3+ other files, OR the bug would have been catastrophic in production): read `references/defense-in-depth.md` and choose which of its four layers apply. Skip for a one-off error with no realistic recurrence path.

**Conditional post-mortem** (trigger: the bug was in production, OR the pattern appears in 3+ locations): analyze how it was introduced and what let it survive. Any systemic gap found informs Phase 4's learning-capture decision.

---
