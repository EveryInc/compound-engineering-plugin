# The refresh report

**Print the full report as markdown — it is the deliverable, not an internal summary.** After processing the scope:

```text
Compound Refresh Summary
========================
Scanned: N learnings

Kept: X
Updated: Y
Consolidated: C
Replaced: Z
Deleted: W
Skipped: V
Marked stale: S

CONCEPTS.md: <scanned, no qualifying terms | created with N entries (M seeded) | updated — N added, N refined, N reconciled, N folded, N retired, N deleted, N scrubbed | repo-wide map created with N entries>
```

Then, for EVERY file processed: path, classification, evidence found (tag memory-sourced findings "(auto memory [claude])"), and the action taken or recommended; for Consolidate, which doc was canonical, what was merged, what was deleted. Group Keeps under a reviewed-without-edits section.

In non-interactive mode the report is the sole deliverable — self-contained, never abbreviated — and actions split into two sections. **Applied:** writes that succeeded, with the same per-file detail. **Recommended:** writes that failed (with enough context for a human to apply them), plus everything that never runs unattended — relocations that failed the four-condition gate (doc, target, failing condition), splits (doc, proposed fragment boundaries), category-shape observations, potential product regressions where code violates independently supported guidance, guidance files a learning names that contradict it, and the discoverability recommendation if any. If no writes succeed, the report is a maintenance plan. If `_archived/` exists, list its files and recommend disposition (restore, delete, or consolidate).
