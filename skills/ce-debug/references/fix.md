# Fix: workspace safety, test-first, and what a failed fix means

Read this before editing any file in Phase 3. The branch check and the pre-fix scope record belong to the body, which runs them before sending you here: do not repeat either, and do not ask a second time about a file whose unstaged edits the body already confirmed.

*One change at a time. If you are changing multiple things, stop.*

**Test-first:**

1. Choose the regression test's home per the body's **Choosing the regression test** rule, whose precondition — a confirmed defect, never a test the change deliberately reverses — decides whether an existing test may be updated at all.
2. Verify that test fails for the right reason — the root cause, not unrelated setup.
3. Implement the **minimal** fix: the root cause and nothing else. No drive-by refactors, formatting, or unrelated cleanup — those are separate commits.
4. Verify the test passes, then run the broader suite for regressions.
5. Self-review the diff — read every changed line for style violations, missed edge cases, regressions in adjacent behavior, and missing coverage. The broader polish/review/PR tail belongs to Phase 4, after the debug summary.

**On a failed fix:** return to Phase 2 and *explicitly invalidate the current hypothesis* before forming a new one — state what evidence ruled it out, then form a new hypothesis with its own grounding observation and prediction. Do not retry variants of the same theory ("maybe it was the other branch", "let me also catch this case"); that is the rationalization spiral, not iteration. **3 failed attempts = smart escalation** (same table as Phase 2): if fixes keep failing, the root cause identification was likely wrong.

**Conditional defense-in-depth** (trigger: grep found the root-cause pattern in 3+ other files, OR the bug would have been catastrophic in production): read `references/defense-in-depth.md` and choose which of its four layers apply. Skip for a one-off error with no realistic recurrence path.

**Conditional post-mortem** (trigger: the bug was in production, OR the pattern appears in 3+ locations): analyze how it was introduced and what let it survive. Any systemic gap found informs Phase 4's learning-capture decision.

---
