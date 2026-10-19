# Reviewer Dispatch

Read this before dispatching the Step 2 reviewers. It covers what happens when the harness is full, how review agents are released, and the permission mode.

**Bounded dispatch.** Queue the reviewers and launch only as many as the harness accepts at once. A concurrency or active-agent-limit error means the harness is full, not that the reviewer failed: leave the reviewer queued and retry after a slot frees. When a dispatch cannot recover through active work, supported release, or a corrected invocation, run that pass inline using the same prompt asset and disclose the substitution.

**Agent lifecycle.** Collect terminal outcomes, including failures, before cleanup. Close or release review-owned agents when the harness provides caller-owned cleanup, before refilling slots, advancing stages, or returning. Do not message completed agents with no remaining work. Do not infer released capacity from completion or interruption, or invent cleanup operations.

**Permission mode.** Omit the `mode` parameter on the dispatch call so the user's configured permission settings apply.

## Finding challenge

An empty candidate set returns without a challenger. Reuse prior dispositions for unchanged source, requirements and evidence, including reporting then later applying; challenge only new or materially changed candidates.

Before reporting or applying the remaining candidates, give one fresh read-only challenger the original diff,
requirements, accepted decisions, and source access, then the findings. Ask it to
disprove each claim using existing mitigations, intended behavior, and valuable
tests or abstractions. Require a quoted path and concrete benefit for retained
findings; separate confidence from impact. No surviving findings is valid.

The caller adjudicates once from inspected evidence and may retract findings;
challenger disagreement alone is no veto. If independent capacity is unavailable,
perform the check inline and disclose the coverage limit. No quota or another
debate round without materially new evidence. An unresolved behavior change is
skipped under Step 3's preservation rule, never applied as cleanup.

Requirements come from the caller's request and source contracts; no separate
requirements document is required. A deletion must show present cost or unneeded
scope and what preserves the contract. Existing clear code can replace a redundant
comment, and remaining tests can preserve identical coverage. Apply the existing
comment/test rubrics and proof-test protection; do not require a replacement
implementation merely to remove duplication.
