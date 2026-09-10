# Decision primer — round 2+

Read this file at Phase 2 (dispatch) only when the current interactive session has already completed at least one review round. Round 1 uses the inline `<prior-decisions>` block in `references/dispatch.md` and does not need this file.

The primer tells each persona what the user already decided, so round N+1 neither reports rejected findings again nor assumes an applied fix landed correctly.

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

**Every entry carries an `Evidence:` line.** Synthesis rules R29 (rejected-finding suppression) and R30 (fix-landed verification) both compare evidence substrings as part of deciding whether a new finding matches a prior one. Without the snippet the orchestrator cannot compute the `>50%` overlap test and falls back to fingerprint-only matching, which either shows rejected findings again or suppresses too aggressively. Use the finding's **first** evidence quote, truncated to ~120 characters on a word boundary, with internal quotes escaped. Remaining evidence entries live in the run artifact and are not needed for the overlap check.

## Which actions count as rejected

Skip, Defer, and Acknowledge are all **rejected-class** — each signals the user decided the finding wasn't worth actioning this round. (Acknowledge is the variant for findings with no `suggested_fix`: the user saw the finding and recorded acknowledgement instead of an explicit defer or skip. For suppression it means the same as Skip.)

**Withdraw is conditional.** A Withdraw records that an earlier decision resolved or contradicted the finding (see "Withdrawing findings the user's earlier answers resolved" in `walkthrough.md`):

- Counts as rejected-class **only** when a user decision retired it — a settled premise (Skip/Defer) or a user-asserted fact.
- An **Apply-triggered Withdraw never does.** Whether it is resolved depends on the staged edit both landing and actually resolving the finding. Round N+1 synthesis checks that, not R29. Suppressing it would hide a fix that failed or landed ineffectively.

Applied findings stay on the applied list so round-N+1 personas can verify the fixes landed (see R30 in `synthesis-and-presentation.md`).

## Scope

Decisions do not persist across sessions. A later review of the same document starts at round 1 with no primer carried over, even if prior sessions deferred findings into the document's Open Questions section.
