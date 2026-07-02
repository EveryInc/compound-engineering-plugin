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
- **fixed**: Known-bug area's `fix_check` passes (score >= area's `pass_threshold`; default from `../scripts/caps-registry.json`) AND linked GitHub issue is closed. Both conditions required — a passing score with an open issue means the fix hasn't been formally accepted.
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

Before building the commit payload, the agent checks issue state and fix/regression evidence. The engine applies only the mechanical table changes from `bug_lifecycle_updates` and `issue_candidates`.

- **Fixes:** For each `open` bug, the agent checks whether the area was tested and passed fix_check (score >= area threshold) and whether the linked issue is closed through the project's issue tracker. If both are true, write a `bug_lifecycle_updates` entry with `status: "fixed"`, `fix_check_passed: true`, and `issue_closed: true`.
- **New bugs:** For each area with UX <= 2 or Quality <= 1, the agent checks whether a matching bug already exists. If not, include an `issue_candidates` entry; the engine creates the next sequential bug row and the agent files the issue after apply.
- **Regressions:** For each `fixed` bug, the agent checks whether the area was tested and failed. If so, write a `bug_lifecycle_updates` entry with `status: "regressed"` and include the regression title/body evidence; the engine updates the original bug row and creates a pending regression candidate.

The engine owns row IDs, dates, status cells, and issue-number writeback. It does not call `gh` or decide whether a fix is accepted.

## File Creation

`tests/user-flows/bugs.md` is created on first bug filing if it doesn't exist. The file header and table format are generated automatically.

## Rotation

Archive age is governed by `bug_archive_age_months` in `../scripts/caps-registry.json`. Archived entries move to `tests/user-flows/bugs-archive.md`; they are no longer checked during runs but remain historical reference.
