# Debugging Anti-Patterns

Read this before forming hypotheses. These patterns describe the most common ways debugging goes wrong. They feel productive in the moment — that is what makes them dangerous.

---

## Prediction Quality

The prediction requirement exists to prevent symptom-fixing. A prediction tests whether your understanding of the bug is correct, not just whether a fix makes the error go away.

**Bad prediction (restates the hypothesis):**

> Hypothesis: The null pointer is because `user` is not initialized.
> Prediction: `user` will be null when I log it.

This just re-describes the symptom. It cannot be wrong if the hypothesis is right — so it cannot catch a wrong hypothesis.

**Good prediction (tests something non-obvious):**

> Hypothesis: The null pointer is because the auth middleware skips initialization on cached requests.
> Prediction: Non-cached requests to the same endpoint will NOT produce the null pointer, and the `X-Cache` header will be present on failing requests.

This tests a different code path and a different observable. If the prediction is wrong, the hypothesis is wrong even if "initializing user earlier" happens to fix the immediate error.

**Rule of thumb:** A good prediction names something you have not looked at yet.

---

## Shotgun Debugging

Changing multiple things at once to "see if it helps."

**How it feels:** Productive. You're making changes, running tests, making progress.

**What actually happens:** If the bug goes away, you do not know which change fixed it. If it persists, you do not know which changes are relevant.

**The fix:** One hypothesis, one change, one test. If the first change does not fix it, revert it before trying the next.

---

## Confirmation Bias

Interpreting ambiguous evidence as supporting your current hypothesis.

**How it looks:**

- A log line that could support your theory — you treat it as proof
- A test passes after your change — you declare the bug fixed without checking if the test was actually exercising the failure path
- The error message changes slightly — you interpret it as "getting closer" instead of recognizing a different failure mode

**The defense:** Before declaring a hypothesis confirmed, ask: "What evidence would DISPROVE this hypothesis?" If you cannot name something that would change your mind, you are not testing.

---

## "It Works Now, Move On"

The bug stops appearing after a change. The temptation is to declare victory.

**When this is a trap:** If you cannot explain WHY the change fixed the bug — the full causal chain from your change through the system to the symptom — you may have fixed a symptom while the root cause remains.

**The test:** Can you explain the fix to someone else without using the words "somehow" or "I think"? If not, the root cause is not confirmed.

---

## Thoughts That Signal You Are About to Shortcut

These feel like reasonable next steps. They are warning signs that investigation is being skipped.

- **Proposing a fix before explaining the cause.** Explain the cause first.
- **Reaching for another attempt without new information.** Diagnose why previous hypotheses failed.
- **Certainty without evidence.** Read the code even when you are confident.
- **Minimizing the scope.** "It is probably just..." — if you are still debugging, it is not "just" anything.
- **Treating environmental differences as irrelevant.** The difference between environments IS the investigation.

---

## Smart Escalation Patterns

When 2-3 hypotheses have been tested and none confirmed:

**Different subsystems keep appearing.** Hypothesis 1 pointed to auth, hypothesis 2 to the database, hypothesis 3 to caching. This scatter pattern means the bug is not in any one subsystem — it is in the interaction between them. This is a design problem, not a localized bug.

**Evidence contradicts itself.** The logs say X happened, but the code makes X impossible. When evidence contradicts, the mental model is wrong. Step back and re-read the code from the entry point without any assumptions.

**Works locally, fails elsewhere.** The most common causes: environment variables, dependency versions, file system differences (case sensitivity, path separators), timing differences, and data differences (test fixtures vs production data). Systematically compare the two environments.

**Fix works but prediction was wrong.** The bug appears fixed, but the causal chain was incorrect. The real cause is still present and will resurface. Keep investigating.
