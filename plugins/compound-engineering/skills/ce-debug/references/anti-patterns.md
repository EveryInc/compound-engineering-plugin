# Debugging Anti-Patterns

Read this before forming hypotheses. These are the most common ways debugging goes wrong. They feel productive in the moment, which is what makes them dangerous.

---

## Prediction Quality

The prediction requirement prevents symptom-fixing. A prediction tests whether your understanding of the bug is correct, not just whether a fix makes the error go away.

**Bad prediction (restates the hypothesis):**
> Hypothesis: The null pointer is because `user` is not initialized.
> Prediction: `user` will be null when I log it.

This just re-describes the symptom. It cannot be wrong if the hypothesis is right, so it cannot catch a wrong hypothesis.

**Good prediction (tests something non-obvious):**
> Hypothesis: The null pointer is because the auth middleware skips initialization on cached requests.
> Prediction: Non-cached requests to the same endpoint will NOT produce the null pointer, and the `X-Cache` header will be present on failing requests.

This tests a different code path and a different observable. If the prediction is wrong (cached and non-cached requests both fail), the hypothesis is wrong even if "initializing user earlier" happens to fix the immediate error.

**Rule of thumb:** A good prediction names something you have not looked at yet. If confirming it requires only looking at the line of code you already identified, the prediction adds no information.

---

## Shotgun Debugging

Changing multiple things at once to "see if it helps." It feels productive (changes, tests, progress), but if the bug goes away you don't know which change fixed it, and if it persists you don't know which changes are relevant: you introduced variables instead of eliminating them.

The fix: one hypothesis, one change, one test. If the first change does not fix it, revert it before trying the next. Changes should add to understanding, not accumulate in the codebase.

---

## Confirmation Bias

Interpreting ambiguous evidence as supporting your current hypothesis. How it looks:
- A log line that *could* support your theory, treated as proof
- A test passes after your change, so you declare the bug fixed without checking whether the test exercised the failure path
- The error message changes slightly, and you read it as "getting closer" instead of a different failure mode

The defense: before declaring a hypothesis confirmed, ask "What evidence would DISPROVE this?" If you cannot name something that would change your mind, you are justifying, not testing.

---

## "It Works Now, Move On"

The bug stops appearing after a change, and the temptation is to declare victory and move on. This is a trap if you cannot explain WHY the change fixed the bug (the full causal chain from your change through the system to the symptom): you may have fixed a symptom while the root cause remains, masked the bug without resolving it, or gotten lucky with timing (especially for intermittent bugs).

The test: can you explain the fix to someone else without "somehow" or "I think"? If not, the root cause is not confirmed.

---

## Thoughts That Signal You Are About to Shortcut

These feel like reasonable next steps. They are warning signs that investigation is being skipped.

**Proposing a fix before explaining the cause.** If "I think we should change..." comes before "the root cause is...", pause. The fix might be right, but without a confirmed causal chain there is no way to know. Explain the cause first.

**Reaching for another attempt without new information.** After 2-3 failed hypotheses, a 4th without learning something new from the failures is guessing with increasing frustration. Stop and diagnose why previous hypotheses failed (see smart escalation).

**Certainty without evidence.** "I know what this is" before reading the relevant code. Experienced developers' pattern-matching instincts are right often enough to be dangerous when wrong. Read the code even when confident.

**Minimizing the scope.** In "It is probably just...", the word "just" signals an assumption that the problem is small. Small problems do not resist 2-3 fix attempts. If you are still debugging, it is not "just" anything.

**Treating environmental differences as irrelevant.** When something works in one environment and fails in another, the difference between them IS the investigation. Compare them systematically rather than dismiss it.

---

## Smart Escalation Patterns

When 2-3 hypotheses have been tested and none confirmed, the problem is not "I need hypothesis #4." It is usually one of these:

**Different subsystems keep appearing.** Hypothesis 1 pointed to auth, 2 to the database, 3 to caching. This scatter means the bug is not in any one subsystem; it is in the interaction between them, or in an architectural assumption that cuts across all of them. A design problem, not a localized bug.

**Evidence contradicts itself.** The logs say X happened, but the code makes X impossible. The test fails with error A, but the code path that produces A is unreachable from the test. When evidence contradicts, the mental model is wrong. Step back and re-read the code from the entry point without assumptions about what it does.

**Works locally, fails elsewhere.** Most common causes: environment variables, dependency versions, file system differences (case sensitivity, path separators), timing differences (faster/slower machines), and data differences (test fixtures vs production data). Compare the two environments systematically rather than debugging the code.

**Fix works but prediction was wrong.** The most dangerous pattern. The bug appears fixed, but the causal chain was incorrect. The real cause is still present and will resurface. Keep investigating; you found a coincidental fix, not the root cause.
