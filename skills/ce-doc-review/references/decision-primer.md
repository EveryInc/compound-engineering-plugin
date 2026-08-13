# Decision primer — round 2+

Loaded at Phase 2 dispatch only when the current interactive session has already completed at least one review round. Round 1 uses the inline `<prior-decisions>` block in SKILL.md and does not need this file.

The primer tells each persona what the user already decided, so round N+1 neither re-surfaces rejected findings nor assumes an applied fix landed correctly.

## Rendering

Accumulate every prior round's decisions and render them as:

```
<prior-decisions>
Round 1 — applied (N entries):
- {section}: "{title}" ({reviewer}, {confidence})
  Evidence: "{evidence_snippet}"

Round 1 — rejected (M entries):
- {section}: "{title}" — Skipped because {reason}
  Evidence: "{evidence_snippet}"
- {section}: "{title}" — Deferred to Open Questions because {reason or "no reason provided"}
  Evidence: "{evidence_snippet}"
- {section}: "{title}" — Acknowledged without applying because {reason or "no suggested_fix — user acknowledged"}
  Evidence: "{evidence_snippet}"
- {section}: "{title}" — Withdrawn because {triggering decision}
  Evidence: "{evidence_snippet}"

Round 2 — applied (N entries):
...
</prior-decisions>
```

**Every entry carries an `Evidence:` line.** Synthesis R29 (rejected-finding suppression) and R30 (fix-landed verification) both use an evidence-substring overlap check as part of their matching predicate; without the snippet the orchestrator cannot compute the `>50%` overlap test and falls back to fingerprint-only matching, which either re-surfaces rejected findings or suppresses too aggressively. Use the finding's **first** evidence quote, truncated to ~120 characters on a word boundary, with internal quotes escaped. Remaining evidence entries live in the run artifact and are not needed for the overlap check.

## Which actions count as rejected

Skip, Defer, and Acknowledge are all **rejected-class** — each signals the user decided the finding wasn't worth actioning this round. (Acknowledge is the no-fix-guard variant: the user saw a finding with no `suggested_fix` and recorded acknowledgement instead of an explicit defer or skip; for suppression that is semantically equivalent to Skip.)

**Withdraw is conditional.** It is the revalidation variant — an earlier decision resolved or contradicted the finding (see "Withdrawing findings the user's earlier answers resolved" in `walkthrough.md`):

- Counts as rejected-class **only** when a user decision retired it — a settled premise (Skip/Defer) or a user-asserted fact.
- An **Apply-triggered Withdraw never does.** Its resolution depends on the staged edit both landing and semantically resolving the finding, which round N+1 re-synthesis checks — not R29. Suppressing it would hide a fix that failed or landed ineffectively.

Applied findings stay on the applied list so round-N+1 personas can verify the fixes landed (see R30 in `synthesis-and-presentation.md`).

## Scope

Cross-session persistence is out of scope. A later review of the same document starts at round 1 with no carried primer, even if prior sessions deferred findings into the document's Open Questions section.
