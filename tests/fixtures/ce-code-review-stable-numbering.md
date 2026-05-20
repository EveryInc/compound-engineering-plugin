## Code Review Results

**Scope:** merge-base with main -> working tree
**Intent:** Demonstrate stable finding numbering
**Mode:** interactive

**Reviewers:** correctness, testing, maintainability

### Applied (safe, verified)

| # | File | Fix | Reviewer |
|---|------|-----|----------|
| 4 | `export_service.rb:60 (+test)` | Tightened export file perms 0644 -> 0600 (security-posture — verify in diff) | security |

Validation: tests 18 -> 19; suite 96 pass, lint clean.

### Triage Groups

| Group | Findings | Context | Preferred Resolution | Why |
|-------|----------|---------|----------------------|-----|
| Export result-set scaling | #1, #2 | Both stem from loading the full order set in one pass | Design the pagination contract first (#2), then stream behind it (#1) | One cursor/page decision resolves the memory bound and the API shape together |

### P1 -- High

| # | File | Issue | Reviewer | Confidence |
|---|------|-------|----------|------------|
| 1 | `export_service.rb:87` | Loads all orders into memory | performance | 100 |
| 2 | `export_service.rb:91` | Missing pagination contract | api-contract | 75 |

- **#1** — `Order.where(...).to_a` materializes the full result set; stream with `find_each` or paginate.

### P2 -- Moderate

| # | File | Issue | Reviewer | Confidence |
|---|------|-------|----------|------------|
| 3 | `export_service.rb:45` | Missing error handling | correctness | 75 |

### Actionable Findings

| # | File | Issue | Route | Next Step |
|---|------|-------|-------|-----------|
| 2 | `export_service.rb:91` | Missing pagination contract | `manual -> downstream-resolver` | Defer via tracker with API contract context |
| 3 | `export_service.rb:45` | Missing error handling | `gated_auto -> downstream-resolver` | Defer via tracker pending behavior approval |
