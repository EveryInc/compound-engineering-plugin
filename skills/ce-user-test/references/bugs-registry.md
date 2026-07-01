# Bug Registry

The bug registry (`tests/user-flows/bugs.md`) tracks bugs across runs with persistent status lifecycle. One registry per project, not per scenario.

## File Format

```markdown
# Bug Registry

| ID | Area | Status | Issue | Summary | Found | Fixed | Regressed |
|----|------|--------|-------|---------|-------|-------|-----------|
| B001 | checkout/shipping-form | open | #47 | Accepts invalid zip codes | 2026-02-28 | — | — |
| B002 | browse/product-grid | fixed | #48 | Cards not clickable | 2026-02-28 | 2026-03-01 | — |
| B003 | browse/product-grid | regressed | #52 | Regression of B002: Cards not clickable | 2026-03-05 | — | 2026-03-05 |
```

## Status Lifecycle

```
open → fixed → regressed
              ↘ (stays fixed if no regression)
```

- **open**: Bug discovered and issue filed. Area marked Known-bug.
- **fixed**: Known-bug area's `fix_check` passes (score >= area's `pass_threshold`, default 4) AND linked GitHub issue is closed. Both conditions required — a passing score with an open issue means the fix hasn't been formally accepted.
- **regressed**: A previously-fixed area fails again (score < `pass_threshold`). A new GitHub issue is filed with "Regression of #N" referencing the original. The original bug entry is updated to `regressed` with the regression date.

## Sequential IDs

Bug IDs are sequential: B001, B002, B003... Read existing `bugs.md` to find the highest ID, then increment. If the file doesn't exist, start at B001.

## Multi-Area Bugs

A bug that manifests in multiple areas gets ONE registry entry with the primary area (the area where it was first discovered or most impactful). The `Summary` field notes affected areas:

```
| B004 | api/auth | open | #55 | Token refresh fails silently. Also affects: settings/profile, dashboard/data | 2026-03-01 | — | — |
```

Each affected area's Known-bug detail references the same bug ID.

## Commit Mode Updates

After each completed run, commit mode processes the bug registry:

1. **Check for fixes:** For each `open` bug, check if the area was tested and passed fix_check (score >= `pass_threshold`). Also check `gh issue view <issue-number> --json state -q '.state'` — both must be true (score passes AND issue closed) to mark `fixed`.
2. **File new bugs:** For each area with UX <= 2 or Quality <= 1, check if a bug already exists for that area. If not, create a new entry with next sequential ID and file a GitHub issue.
3. **Detect regressions:** For each `fixed` bug, check if the area was tested and failed (score < `pass_threshold`). If so, file a new issue with "Regression of #N", update the bug entry to `regressed` with the date.

## File Creation

`tests/user-flows/bugs.md` is created on first bug filing if it doesn't exist. The file header and table format are generated automatically.

## Rotation

Archive entries older than 6 months to `tests/user-flows/bugs-archive.md`. Archived entries are no longer checked during runs but preserved for historical reference.
