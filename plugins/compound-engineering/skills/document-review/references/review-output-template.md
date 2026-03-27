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

Applied 3 auto-fixes. Batched 2 fixes for approval. 4 findings to consider (2 errors, 2 omissions).

### Auto-fixes Applied

- Standardized "pipeline"/"workflow" terminology to "pipeline" throughout (coherence)
- Fixed cross-reference: Section 4 referenced "Section 3.2" which is actually "Section 3.1" (coherence)
- Updated unit count from "6 units" to "7 units" to match listed units (coherence)

### Batch Confirm

These fixes have one clear correct answer but touch document meaning. Apply all?

| # | Section | Fix | Reviewer |
|---|---------|-----|----------|
| 1 | Unit 4 | Add "update API rate-limit config" step -- implied by Unit 3's rate-limit introduction | feasibility |
| 2 | Verification | Add auth token refresh to test scenarios -- required by Unit 2's token expiry handling | security-lens |

### P0 -- Must Fix

#### Errors

| # | Section | Issue | Reviewer | Confidence |
|---|---------|-------|----------|------------|
| 1 | Requirements Trace | Goal states "offline support" but technical approach assumes persistent connectivity | coherence | 0.92 |

### P1 -- Should Fix

#### Errors

| # | Section | Issue | Reviewer | Confidence |
|---|---------|-------|----------|------------|
| 2 | Scope Boundaries | 8 of 12 units build admin infrastructure; only 2 touch stated goal | scope-guardian | 0.80 |

#### Omissions

| # | Section | Issue | Reviewer | Confidence |
|---|---------|-------|----------|------------|
| 3 | Implementation Unit 3 | Plan proposes custom auth but does not mention existing Devise setup or migration path | feasibility | 0.85 |

### P2 -- Consider Fixing

#### Omissions

| # | Section | Issue | Reviewer | Confidence |
|---|---------|-------|----------|------------|
| 4 | API Design | Public webhook endpoint has no rate limiting mentioned | security-lens | 0.75 |

### Residual Concerns

| # | Concern | Source |
|---|---------|--------|
| 1 | Migration rollback strategy not addressed for Phase 2 data changes | feasibility |

### Deferred Questions

| # | Question | Source |
|---|---------|--------|
| 1 | Should the API use versioned endpoints from launch? | feasibility, security-lens |

### Coverage

| Persona | Status | Findings | Auto | Batch | Present | Residual |
|---------|--------|----------|------|-------|---------|----------|
| coherence | completed | 3 | 2 | 0 | 1 | 0 |
| feasibility | completed | 2 | 0 | 1 | 1 | 1 |
| security-lens | completed | 2 | 0 | 1 | 1 | 0 |
| scope-guardian | completed | 1 | 0 | 0 | 1 | 0 |
| product-lens | not activated | -- | -- | -- | -- | -- |
| design-lens | not activated | -- | -- | -- | -- | -- |
```

## Section Rules

- **Summary line**: Always present after the reviewer list. Format: "Applied N auto-fixes. Batched M fixes for approval. K findings to consider (X errors, Y omissions)." Omit any zero clause.
- **Auto-fixes Applied**: List fixes that were applied automatically (auto class). Omit section if none.
- **Batch Confirm**: Group `batch_confirm` findings for a single yes/no/select approval. Omit section if none.
- **P0-P3 sections**: Only include sections that have findings. Omit empty severity levels. Within each severity, separate into **Errors** and **Omissions** sub-headers. Omit a sub-header if that severity has none of that type.
- **Residual Concerns**: Findings below confidence threshold that were promoted by cross-persona corroboration, plus unpromoted residual risks. Omit if none.
- **Deferred Questions**: Questions for later workflow stages. Omit if none.
- **Coverage**: Always include. Shows which personas ran and their output counts broken down by route (Auto, Batch, Present).
