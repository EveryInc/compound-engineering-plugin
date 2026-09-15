---
title: "Review cost is in entering the spine, not in the findings: size a review by consequence, never by a total-line floor"
date: 2026-09-15
category: skill-design
module: compound-engineering / ce-code-review
problem_type: design_pattern
component: tooling
severity: high
applies_when:
  - "Adding or tuning a sizing gate, floor, or fast path to a multi-agent skill"
  - "A cheap path exists but real runs almost never take it"
  - "Deciding which lever to pull when a skill run costs far more than its diff warrants"
tags:
  - ce-code-review
  - review-depth
  - cost
  - sizing-gate
  - cross-model-review
---

# Review cost is in entering the spine, not in the findings: size a review by consequence, never by a total-line floor

## Context

PR #1706 gave `ce-code-review` a lite path for small low-consequence diffs, with a total-changed-line floor: over 39 lines the scope helper set `hard_block_full` and the consequence question never ran. On 2026-09-15 a real run on a branch of 8 files, 230 insertions, and about 56 executable lines in one script (a landing-path guard deciding push-to-main versus open-a-PR) paid for the full spine. The helper counted 147 changed lines (prose and tests included) as `large`.

Token usage from that run's transcripts, with cache reads billed at a fraction of fresh input:

| Component | turns | cache write | cache read | output |
|---|---|---|---|---|
| Orchestrator, review window | 68 | 942k | 12.5M | 87k |
| Six local subagents combined | | 1.33M | 6.2M | 57k |
| Merge and report leaves alone, for two findings | 34 | 512k | 2.4M | 29k |
| Codex adversarial peer | | 1.3M input | | 32k |

The two real P2 findings came from the correctness reviewer and were independently corroborated by the Codex peer. Project-standards returned nothing, agent-native was confirmatory, testing listed coverage gaps. A cross-model panel (Codex, Grok) reviewing the proposed fix concurred on the diagnosis and the levers below.

## Guidance

1. **Cost scales with the spine, not the diff.** The full path pays for reading roughly ten references, one context bundle per reviewer, two finish leaves, and a context that is re-read on every one of dozens of turns (peer waits, notifications, recovery). A 56-line change and a 600-line change pay nearly the same. So the gate that decides whether to enter the spine is the largest lever; per-reference size and turn count are second.

2. **A size floor may only force full, never award lite, and must count what carries risk.** The helper now counts executable non-test lines against `FULL_EXEC_LINE_MIN = 200` (matching the maintainability trigger) in `skills/ce-code-review/scripts/review-scope.py`. A 400 total-line backstop for sources the extension list cannot name was tried in review of PR #1719 and dropped: it was a count standing in for the consequence judgment. The helper reports those sources in `unclassified_lines` by extension, and the gate treats executable code it could not name as executable code for the consequence question. Below the floor, line counts, prose, and tests are facts the gate reads, never a decision. A low total-line floor makes the consequence judgment dead code because nearly every real change clears it.

3. **Consequence decides between three paths.** In `skills/ce-code-review/references/modes-and-output.md`: loud and local failure takes lite; silent failure takes focused (the lite review plus exactly one independent adversarial read, merged in context, no finish leaves, no validator); a silent failure on an auth, money, or public-contract boundary, or any floor, takes full. The focused path reuses the cross-model peer's own run conditions and fold-in rules and reports a local adversarial fallback as same-family corroboration, never as cross-model.

4. **Keep finish leaves on the full path.** They exist because a six-lens round exhausts the dispatch context before validation, not because two findings need a fresh merge. Lite and focused prove the receipt can be written in the dispatch context on small rounds.

5. **Test the gate on both sides.** One fixture the old floor got wrong (a 60-line loud change → lite), one the new path must catch (a silent deploy guard → focused), and one that must still go full below the floor (an auth check). Cells: `depth-gate-loud-lite`, `depth-gate-focused`, `depth-gate-auth-full` in `tests/skill-eval-cell/catalog.ts`, run on Claude and Codex.

## Applicability

Applies to any skill with a cheap path and an expensive spine. Before tuning a threshold, attribute the cost by stage from a real run; if the fixed spine overhead dominates, the fix is the entry gate and the spine's own load, not the number. Follow-ups this learning does not cover: the full path's reference load and per-turn context growth, per-stage cost instrumentation in the run directory (issue #1703 item 4), and treating CI workflows as an adversarial-lens floor rather than a full-spine floor.
