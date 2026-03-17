---
date: 2026-03-16
topic: issue-grounded-ideation
---

# Issue-Grounded Ideation Mode for ce:ideate

## Problem Frame

When a team wants to ideate on improvements, their issue tracker holds rich signal about real user pain, recurring failures, and severity patterns — but ce:ideate currently only looks at the codebase and past learnings. Teams have to manually synthesize issue patterns before ideating, or they ideate without that context and miss what their users are actually hitting.

The goal is not "fix individual bugs" but "generate strategic improvement ideas grounded in the patterns your issue tracker reveals." 25 duplicate bugs about the same failure mode is a signal about collaboration reliability, not 25 separate problems.

## Requirements

- R1. When the user's argument indicates they want issue-tracker data as input (e.g., "bugs", "github issues", "open issues", "what users are reporting", "issue patterns"), ce:ideate activates an issue intelligence step alongside the existing Phase 1 scans
- R2. A new **issue intelligence agent** fetches, clusters, deduplicates, and analyzes issues, returning structured theme analysis — not a list of individual issues
- R3. The agent fetches **open issues** plus **recently closed issues** (approximately 30 days), filtering out issues closed as duplicate, won't-fix, or not-planned. Recently fixed issues are included because they show which areas had enough pain to warrant action.
- R4. Issue clusters drive the ideation frames in Phase 2 using a **hybrid strategy**: derive frames from clusters, pad with default frames (e.g., "assumption-breaking", "leverage/compounding") when fewer than 4 clusters exist. This ensures ideas are grounded in real pain patterns while maintaining ideation diversity.
- R5. The existing Phase 1 scans (codebase context + learnings search) still run in parallel — issue analysis is additive context, not a replacement
- R6. The issue intelligence agent detects the repository from the current directory's git remote
- R7. Start with GitHub issues via `gh` CLI. Design the agent prompt and output structure so Linear or other trackers can be added later without restructuring the ideation flow.
- R8. The issue intelligence agent is independently useful outside of ce:ideate — it can be dispatched directly by a user or other workflows to summarize issue themes, understand the current landscape, or reason over recent activity. Its output should be self-contained, not coupled to ideation-specific context.
- R9. The agent's output must communicate at the **theme level**, not the individual-issue level. Each theme should convey: what the pattern is, why it matters (user impact, severity, frequency, trend direction), and what it signals about the system. The output should help a human or agent fully understand the importance and shape of each theme without needing to read individual issues.

## Success Criteria

- Running `/ce:ideate bugs` on a repo with noisy/duplicate issues (like proof's 25+ LIVE_DOC_UNAVAILABLE variants) produces clustered themes, not a rehash of individual issues
- Surviving ideas are strategic improvements ("invest in collaboration reliability infrastructure") not bug fixes ("fix LIVE_DOC_UNAVAILABLE")
- The issue intelligence agent's output is structured enough that ideation sub-agents can engage with themes meaningfully
- Ideation quality is at least as good as the default mode, with the added benefit of issue grounding

## Scope Boundaries

- GitHub issues only in v1 (Linear is a future extension)
- No issue triage or management — this is read-only analysis for ideation input
- No changes to Phase 3 (adversarial filtering) or Phase 4 (presentation) — only Phase 1 and Phase 2 frame derivation are affected
- The issue intelligence agent is a new agent file, not a modification to an existing research agent
- The agent is designed as a standalone capability that ce:ideate composes, not an ideation-internal module
- Assumes `gh` CLI is available and authenticated in the environment
- When a repo has too few issues to cluster meaningfully (e.g., < 5 open+recent), the agent should report that and ce:ideate should fall back to default ideation with a note to the user

## Key Decisions

- **Pattern-first, not issue-first**: The output is improvement ideas grounded in bug patterns, not a prioritized bug list. The ideation instructions already prevent "just fix bug #534" thinking.
- **Hybrid frame strategy**: Clusters derive ideation frames, padded with defaults when thin. Pure cluster-derived frames risk too few frames; pure default frames risk ignoring the issue signal.
- **Flexible argument detection**: Use intent-based parsing ("reasonable interpretation rather than formal parsing") consistent with the existing volume hint system. No rigid keyword matching.
- **Open + recently closed**: Including recently fixed issues provides richer pattern data — shows which areas warranted action, not just what's currently broken.
- **Additive to Phase 1**: Issue analysis runs as a third parallel agent alongside codebase scan and learnings search. All three feed the grounding summary.
- **Titles + labels + sample bodies**: Read titles and labels for all issues (cheap), then read full bodies for 2-3 representative issues per emerging cluster. This handles both well-labeled repos (labels drive clustering, bodies confirm) and poorly-labeled repos (bodies drive clustering). Avoids reading all bodies which is expensive at scale.

## Outstanding Questions

### Deferred to Planning

- [Affects R2][Technical] What structured output format should the issue intelligence agent return? Likely theme clusters with: theme name, issue count, severity distribution, representative issue titles, and a one-line synthesis.
- [Affects R3][Technical] How to detect GitHub close reasons (completed vs not-planned vs duplicate) via `gh` CLI? May need `gh issue list --state closed --json stateReason` or label-based filtering.
- [Affects R4][Technical] What's the threshold for "too few clusters"? Current thinking: pad with default frames when fewer than 4 clusters, but this may need tuning.
- [Affects R6][Technical] How to extract the GitHub repo from git remote? Standard `gh repo view --json nameWithOwner` or parse the remote URL.
- [Affects R7][Needs research] What would a Linear integration look like? Just swapping the fetch mechanism, or does Linear's project/cycle structure change the clustering approach?
- [Affects R2][Technical] Exact number of sample bodies per cluster to read (starting point: 2-3 per cluster).

## Next Steps

→ `/ce:plan` for structured implementation planning
