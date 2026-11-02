# Later-round synthesis rules — round 2+

Read this file at Phase 3 (synthesis) only when the current session carries decisions from an earlier review round of the same document: a decision primer rendered from `references/decision-primer.md`, or decision state retained by a resume (`references/document-intake.md`). A first review round does not need this file.

## R29 Rejected-Finding Suppression (Round 2+)

When the orchestrator is running round 2+ on the same document in the same session, the decision primer (see `references/decision-primer.md`) carries forward every prior-round Skipped, Deferred, Acknowledged, and user-settled Withdrawn finding. Synthesis suppresses re-raised rejected findings rather than showing them to the user again. Acknowledged is treated as a rejected-class decision here: the user saw the finding, chose not to act on it (no Apply, no Defer append), and wants it on record, which is equivalent to Skip for suppression purposes. Only user-settled withdrawals (retired by a Skip/Defer premise or a user-asserted fact) reach this primer. An Apply-triggered withdrawal is provisional and never carried here, so a staged fix that failed or landed ineffectively is re-checked by fresh synthesis rather than suppressed by R29.

For each current-round finding, compare against the primer's rejected list:

- **Matching test:** same as R30. A finding matches when its `normalize(section) + normalize(title)` fingerprint matches and its evidence substrings overlap the prior finding's by more than 50%. Suppress a matching finding only when the evidence and assumptions supporting the prior rejection remain current.
- **Changed evidence:** reassess the finding when material changes to the document, relevant source, constraints, or newly available facts undermine the prior rejection. An unchanged document quote does not establish unchanged evidence. Retain the prior decision as history; a newly supported problem goes through ordinary admission and authority checks without treating reassessment as permission to reverse a user commitment.
- **On suppression:** name the suppressed findings in the Coverage line as previously rejected, so the user can see what was suppressed. The user can explicitly escalate by invoking the review again on a different context if they believe the suppression was wrong.

This rule runs at synthesis time, not at the persona level. Personas have a soft instruction via the subagent template's `{decision_primer}` variable to avoid re-raising rejected findings, but the orchestrator makes the final call: synthesis checks whether the prior rejection still applies before suppressing a re-raised finding.

## R30 Fix-Landed Matching Predicate

When the orchestrator is running round 2+ on the same document, synthesis verifies that prior-round Applied findings actually landed. For each current-round finding whose `normalize(section) + normalize(title)` fingerprint matches a prior-round Applied finding, branch by evidence overlap. This fingerprint is round-to-round memory's own key; 3.3 merges by reasoning and has no fingerprint to share. It works here because both rounds' findings are stored records with stable section and title fields:

- **Strong match — evidence overlap >50% with the prior-round evidence: fix-landed regression.** The current-round finding is quoting the same problematic text the prior-round fix was supposed to remove. Flag it as "fix did not land" in the report rather than showing it as a new finding. Include the prior-round finding's title and the current-round persona's evidence so the user can see why the verification flagged it.

- **Weak match — evidence overlap ≤50%: not a fix-landed regression.** Low evidence overlap means the prior problematic text is no longer being quoted, so do not flag "fix did not land." Do not suppress solely on fingerprint match. If the current-round item is explicitly a non-actionable verification observation (for example, its title or `why_it_matters` says the prior finding landed correctly and asks for no change), suppress it without reporting it. Otherwise, treat the finding as new and let it flow through dedup and routing normally.

  **Materially-different exception.** If the current-round finding's `why_it_matters` describes a substantively different concern than the prior-round finding — even though the section/title fingerprint matches — treat it as a new finding rather than a fix-verified suppression. The section may have been edited for an unrelated reason and the new edit introduced a different issue. The persona's substance, not just the fingerprint, is the signal.

- **Section renames count as different locations.** If the section name has changed between rounds (an edit renamed the heading), treat the new section as a different location and the current-round finding as new. Neither branch above applies.

- **No fingerprint match:** not a verification candidate; the finding flows through normally to 3.3 (Merge Duplicate Findings) and onward routing.

This rule prevents two failure modes: (1) regressions where a fix didn't actually land, and (2) persona over-emission where a round-{N+1} reviewer correctly observes a prior-round resolution and emits a non-actionable "already addressed" finding. The persona-side guidance in `subagent-template.md` ("Do not emit findings to note prior-round resolutions") is the primary defense; this rule catches what the personas miss.
