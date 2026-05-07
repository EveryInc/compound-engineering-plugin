# Verification Discipline

Load this reference during the shipping phase. It enforces evidence-based completion claims, prevents premature success declarations, and provides the revert-verify-failure pattern for regression tests.

Adapted from [Superpowers](https://github.com/obra/superpowers) `verification-before-completion` skill.

## The Iron Law

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

If you haven't run the verification command **in this message**, you cannot claim it passes.

## The Gate Function

Before claiming any status or expressing satisfaction:

1. **IDENTIFY** — What command proves this claim?
2. **RUN** — Execute the full command (fresh, complete)
3. **READ** — Full output, check exit code, count failures
4. **VERIFY** — Does output confirm the claim?
   - If NO: State actual status with evidence
   - If YES: State claim WITH evidence
5. **ONLY THEN** — Make the claim

Skip any step = lying, not verifying.

## Claim-to-Evidence Mapping

| Claim | Requires | NOT Sufficient |
|-------|----------|----------------|
| "Tests pass" | Test command output: 0 failures | Previous run, "should pass" |
| "Linter clean" | Linter output: 0 errors | Partial check, extrapolation |
| "Build succeeds" | Build command: exit 0 | Linter passing, "logs look good" |
| "Bug fixed" | Test original symptom: passes | "Code changed, assumed fixed" |
| "Regression test works" | Red-green cycle verified | Test passes once |
| "Agent completed" | VCS diff shows changes | Agent reports "success" |
| "Requirements met" | Line-by-line checklist | "Tests passing" |

## Linguistic Red Flags — STOP

If you catch yourself using any of these phrases, STOP and run verification:

- "should work now"
- "probably fine"
- "seems to work"
- "looks correct"
- "I'm confident this..."
- Expressing satisfaction before verification ("Great!", "Perfect!", "Done!")
- About to commit/push/PR without verification
- Trusting agent success reports without independent verification
- **ANY wording implying success without having run verification**

## Rationalization Prevention

| Rationalization | Rebuttal |
|----------------|----------|
| "Should work now" | RUN the verification |
| "I'm confident" | Confidence is not evidence |
| "Just this once" | No exceptions |
| "Linter passed" | Linter is not a compiler |
| "Agent said success" | Verify independently |
| "I'm tired" | Exhaustion is not an excuse |
| "Partial check is enough" | Partial proves nothing |
| "Different words so rule doesn't apply" | Spirit over letter |

## Revert-and-Verify-Failure Pattern

For regression tests (bug fix TDD), prove the test is not a false positive:

```
1. Write regression test
2. Run → MUST PASS (fix is in place)
3. Revert the fix
4. Run → MUST FAIL (proves test catches the bug)
5. Restore the fix
6. Run → MUST PASS again
```

If the test passes even with the fix reverted, the test is a false positive — it doesn't actually catch the bug. Rewrite the test.

## When To Apply

**ALWAYS before:**
- Any variation of success or completion claims
- Any expression of satisfaction about work state
- Committing, PR creation, task completion
- Moving to next task
- Delegating to agents and trusting their reports

**The rule applies to:**
- Exact phrases
- Paraphrases and synonyms
- Implications of success
- ANY communication suggesting completion or correctness
