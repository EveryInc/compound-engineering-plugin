# Fix: workspace safety, test-first, and what a failed fix means

Read this before editing any file in Phase 3. The branch check and the pre-fix scope record belong to the body, which runs them before sending you here: do not repeat either, and do not ask a second time about a file whose unstaged edits the body already confirmed.

*One change at a time. If you are changing multiple things, stop.*

**Test-first:**

1. Choose the regression test's home. Follow the active project instructions and any applicable subdirectory-scoped instructions, and always inspect existing tests before adding coverage. Use an existing failing test when it already captures the bug, update an existing test when it owns the contract but has the wrong expectation, strengthen an over-mocked test that should have caught the bug, or add a new minimal isolated test only when no existing test is the right home. It must fail on the current bug and pass once the corrected behavior lands; name it so the failure message explains the bug. When no available seam can exercise the bug as it actually triggered — the failure needs a chain of callers or a state the reachable seams cannot set up — do not write a shallow test there for the false confidence: record the missing seam as a finding in the debug summary, and let defense-in-depth or the post-mortem carry it. The body's precondition decides whether an existing test may be updated at all: a confirmed defect, never a test whose expectation the change deliberately reverses.
2. Verify that test fails for the right reason — the root cause, not unrelated setup. When step 1 recorded a missing seam and wrote no test, Phase 1's reproduction check is the red-green instrument for this step and step 4 instead.
3. Implement the **minimal** fix: the root cause and nothing else. No drive-by refactors, formatting, or unrelated cleanup — those are separate commits.
4. Verify the test passes, then re-run Phase 1's reproduction check against the original scenario (not only the minimized or test-shaped one) when that check can run here; when it cannot — the pipeline cannot-reproduce path — say so in the summary or structured return and let the caller's CI run on the pushed fix stand as that verification. Then run the broader suite for regressions.
5. Self-review the diff — read every changed line for style violations, missed edge cases, regressions in adjacent behavior, and missing coverage. Temporary debug instrumentation must all be gone before handoff; if you tagged your debug lines with one shared marker while investigating, verifying that is a single grep. The broader polish/review/PR tail belongs to Phase 4, after the debug summary.

**On a failed fix:** return to Phase 2 and *explicitly invalidate the current hypothesis* before forming a new one — state what evidence ruled it out, then form a new hypothesis with its own grounding observation and prediction. Do not retry variants of the same theory ("maybe it was the other branch", "let me also catch this case"); that is the rationalization spiral, not iteration. **3 failed attempts = smart escalation** (same table as Phase 2): if fixes keep failing, the root cause identification was likely wrong.

**Conditional defense-in-depth** (trigger: grep found the root-cause pattern in 3+ other files, OR the bug would have been catastrophic in production): read `references/defense-in-depth.md` and choose which of its four layers apply. Skip for a one-off error with no realistic recurrence path.

**Conditional post-mortem** (trigger: the bug was in production, OR the pattern appears in 3+ locations): analyze how it was introduced and what let it survive. Any systemic gap found informs Phase 4's learning-capture decision.

---
