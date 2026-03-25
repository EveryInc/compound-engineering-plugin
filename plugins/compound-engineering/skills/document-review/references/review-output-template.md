# Document Review Output Template

Use this **exact format** when presenting synthesized review findings. Findings are grouped by severity, not by reviewer.

**IMPORTANT:** Use pipe-delimited markdown tables (`| col | col |`). Do NOT use ASCII box-drawing characters.

## Example

```markdown
## Document Review Results

**Document:** docs/plans/2026-03-15-feat-user-auth-plan.md
**Type:** plan
**Reviewers:** coherence, feasibility, security-lens, scope-guardian
- security-lens -- plan adds public API endpoint with auth flow
- scope-guardian -- plan has 15 requirements across 3 priority levels

### Mechanical Fixes Applied

- Standardized "pipeline"/"workflow" terminology to "pipeline" throughout (coherence, mechanical-fix)
- Fixed cross-reference: Section 4 referenced "Section 3.2" which is actually "Section 3.1" (coherence, mechanical-fix)

### P0 -- Must Fix

| # | Section | Issue | Reviewer | Confidence | Class |
|---|---------|-------|----------|------------|-------|
| 1 | Requirements Trace | Goal states "offline support" but technical approach assumes persistent connectivity | coherence | 0.92 | `must-ask` |

### P1 -- Should Fix

| # | Section | Issue | Reviewer | Confidence | Class |
|---|---------|-------|----------|------------|-------|
| 2 | Implementation Unit 3 | Plan proposes custom auth when codebase already uses Devise | feasibility | 0.85 | `bounded-decision` |
| 3 | Scope Boundaries | 8 of 12 units build admin infrastructure; only 2 touch stated goal | scope-guardian | 0.80 | `must-ask` |

### P2 -- Consider Fixing

| # | Section | Issue | Reviewer | Confidence | Class |
|---|---------|-------|----------|------------|-------|
| 4 | API Design | Public webhook endpoint has no rate limiting mentioned | security-lens | 0.75 | `bounded-decision` |

### P3 -- Minor

| # | Section | Issue | Reviewer | Confidence | Class |
|---|---------|-------|----------|------------|-------|
| 5 | Overview | "Service" used to mean both microservice and business class | coherence | 0.65 | `mechanical-fix` |

### Residual Concerns

| # | Concern | Source |
|---|---------|--------|
| 1 | Migration rollback strategy not addressed for Phase 2 data changes | feasibility |

### Deferred Questions

| # | Question | Source |
|---|---------|--------|
| 1 | Should the API use versioned endpoints from launch? | feasibility, security-lens |

### Coverage

| Persona | Status | Findings | Residual |
|---------|--------|----------|----------|
| coherence | completed | 2 | 0 |
| feasibility | completed | 1 | 1 |
| security-lens | completed | 1 | 0 |
| scope-guardian | completed | 1 | 0 |
| product-lens | not activated | -- | -- |
| design-lens | not activated | -- | -- |
```

## Section Rules

- **Mechanical Fixes Applied**: List fixes that were applied automatically (`mechanical-fix` class). Omit section if none.
- **P0-P3 sections**: Only include sections that have findings. Omit empty severity levels.
- **Residual Concerns**: Findings below confidence threshold that were promoted by cross-persona corroboration, plus unpromoted residual risks. Omit if none.
- **Deferred Questions**: Questions for later workflow stages. Omit if none.
- **Coverage**: Always include. Shows which personas ran and their output counts.
