# Phases 3-5: Synthesis, Presentation, and Next Action

## Phase 3: Synthesize Findings

Process findings from all agents through this pipeline. Order matters — each step depends on the previous. The pipeline implements the finding-lifecycle state machine: **Raised → (Confidence Gate | FYI-eligible | Dropped) → Deduplicated → Classified → SafeAuto | GatedAuto | Manual | FYI**. Re-evaluate state at each step boundary; do not carry forward assumptions from earlier steps as prose-level shortcuts.

### 3.1 Validate

Check each agent's returned JSON against the findings schema:

- Drop findings missing any required field defined in the schema
- Drop findings with invalid enum values (including the pre-rename `auto` / `present` values from older personas — treat those as malformed until all persona output has been regenerated)
- Note the agent name for any malformed output in the Coverage section

### 3.2 Confidence Gate (Per-Severity)

Gate findings using per-severity thresholds rather than a single flat floor:

| Severity | Gate |
|----------|------|
| P0       | 0.50 |
| P1       | 0.60 |
| P2       | 0.65 |
| P3       | 0.75 |

Findings at or above their severity's gate survive for classification. Findings below the gate are evaluated for FYI-eligibility:

- **FYI-eligible** when `autofix_class` is `manual` and confidence is between 0.40 (FYI floor) and the severity gate. These surface in an FYI subsection at the presentation layer (see 3.7) but do not enter the walk-through or any bulk action — they exist as observational value without forcing a decision.
- **Dropped** when confidence is below 0.40, or when the finding is `safe_auto` / `gated_auto` but below the severity gate (auto-apply findings need confidence above the decision gate to avoid silent mistakes).

Record the drop count and the FYI count in Coverage.

### 3.3 Deduplicate

Fingerprint each finding using `normalize(section) + normalize(title)`. Normalization: lowercase, strip punctuation, collapse whitespace.

When fingerprints match across personas:

- If the findings recommend opposing actions (e.g., one says cut, the other says keep), do not merge — preserve both for contradiction resolution in 3.5
- Otherwise merge: keep the highest severity, keep the highest confidence, union all evidence arrays, note all agreeing reviewers (e.g., "coherence, feasibility")
- **Coverage attribution:** Attribute the merged finding to the persona with the highest confidence. Decrement the losing persona's Findings count and the corresponding route bucket so totals stay exact.

### 3.4 Cross-Persona Agreement Boost

When 2+ independent personas flagged the same merged finding (from 3.3), boost the merged finding's confidence by +0.10 (capped at 1.0). Independent corroboration is strong signal — multiple reviewers converging on the same issue is more reliable than any single reviewer's confidence. Note the boost in the Reviewer column of the output (e.g., "coherence, feasibility +0.10").

This replaces the earlier residual-concern promotion step. Findings below the confidence gate are not promoted back into the review surface; they appear in Coverage as residual concerns only. If a below-gate finding is genuinely important, the reviewer should raise their confidence or provide stronger evidence rather than relying on a promotion rule.

### 3.5 Resolve Contradictions

When personas disagree on the same section:

- Create a combined finding presenting both perspectives
- Set `autofix_class: manual` (contradictions are by definition judgment calls)
- Set `finding_type: error` (contradictions are about conflicting things the document says, not things it omits)
- Frame as a tradeoff, not a verdict

Specific conflict patterns:

- Coherence says "keep for consistency" + scope-guardian says "cut for simplicity" → combined finding, let user decide
- Feasibility says "this is impossible" + product-lens says "this is essential" → P1 finding framed as a tradeoff
- Multiple personas flag the same issue (no disagreement) → handled in 3.3 merge, not here

### 3.6 Promote Auto-Eligible Findings

Scan `manual` findings for promotion to `safe_auto` or `gated_auto`. Promote when the finding meets one of the consolidated auto-promotion patterns:

- **Codebase-pattern-resolved.** `why_it_matters` cites a specific existing codebase pattern (concrete file/function/usage reference, not just "best practice" or "convention"), and `suggested_fix` follows that pattern. Promote to `gated_auto` — the user still confirms, but the codebase evidence resolves ambiguity.
- **Factually incorrect behavior.** The document describes behavior that is factually wrong, and the correct behavior is derivable from context or the codebase. Promote to `gated_auto`.
- **Missing standard security/reliability controls.** The omission is clearly a gap (not a legitimate design choice for the system described), and the fix follows established practice (HTTPS enforcement, checksum verification, input sanitization, fallback-with-deprecation-warning on renames). Promote to `gated_auto`.
- **Framework-native-API substitutions.** A hand-rolled implementation duplicates first-class framework behavior, and the framework API is cited. Promote to `gated_auto`.
- **Mechanically-implied completeness additions.** The missing content follows mechanically from the document's own explicit, concrete decisions (not high-level goals). Promote to `safe_auto` when there is genuinely one correct addition; `gated_auto` when the addition is substantive.

Do not promote if the finding involves scope or priority changes where the author may have weighed tradeoffs invisible to the reviewer.

**Strawman-downgrade safeguard.** If a `safe_auto` finding names dismissed alternatives in `why_it_matters` (per the subagent template's strawman rule), verify the alternatives are genuinely strawmen. If any alternative is a plausible design choice that the persona dismissed too aggressively, downgrade to `gated_auto` so the user sees the tradeoff before the fix applies.

### 3.7 Route by Autofix Class

**Severity and autofix_class are independent.** A P1 finding can be `safe_auto` if the correct fix is obvious. The test is not "how important?" but "is there one clear correct fix, or does this require judgment?"

| Autofix Class | Route |
|---------------|-------|
| `safe_auto`   | Apply silently in Phase 4. Requires `suggested_fix`. Demote to `gated_auto` if missing. |
| `gated_auto`  | Enter the per-finding walk-through with Apply marked (recommended). Requires `suggested_fix`. Demote to `manual` if missing. |
| `manual`      | Enter the per-finding walk-through with user-judgment framing. `suggested_fix` is optional. |
| FYI-subsection | `manual` findings below the severity gate but at or above the FYI floor (0.40) — surface in a distinct FYI subsection of the presentation, do not enter the walk-through or any bulk action. |

**Auto-eligible patterns for safe_auto:** summary/detail mismatch (body authoritative over overview), wrong counts, missing list entries derivable from elsewhere in the document, stale internal cross-references, terminology drift, prose/diagram contradictions where prose is more detailed, missing steps mechanically implied by other content, unstated thresholds implied by surrounding context.

**Auto-eligible patterns for gated_auto:** codebase-pattern-resolved fixes, factually incorrect behavior, missing standard security/reliability controls, framework-native-API substitutions, substantive completeness additions mechanically implied by explicit decisions.

### 3.8 Sort

Sort findings for presentation: P0 → P1 → P2 → P3, then by finding type (errors before omissions), then by confidence (descending), then by document order (section position).

## Phase 4: Apply and Present

### Apply safe_auto fixes

Apply all `safe_auto` findings to the document in a single pass:

- Edit the document inline using the platform's edit tool
- Track what was changed for the "Applied safe_auto fixes" section
- Do not ask for approval — these have one clear correct fix

List every applied fix in the output summary so the user can see what changed. Use enough detail to convey the substance of each fix (section, what was changed, reviewer attribution). This is especially important for fixes that add content or touch document meaning — the user should not have to diff the document to understand what the review did.

### Route Remaining Findings

After safe_auto fixes apply, remaining findings split into buckets:

- `gated_auto` and `manual` findings at or above the severity gate → enter the routing question (see Unit 5 / `references/walkthrough.md`)
- FYI-subsection findings → surface in the presentation only, no routing
- Zero actionable findings remaining → skip the routing question; flow directly to Phase 5 terminal question

**Headless mode:** Do not use interactive question tools. Output all findings as a structured text envelope the caller can parse:

```
Document review complete (headless mode).

Applied N safe_auto fixes:
- <section>: <what was changed> (<reviewer>)
- <section>: <what was changed> (<reviewer>)

Gated-auto findings (concrete fix, requires user confirmation):

[P0] Section: <section> — <title> (<reviewer>, confidence <N>)
  Why: <why_it_matters>
  Suggested fix: <suggested_fix>

Manual findings (requires judgment):

[P1] Section: <section> — <title> (<reviewer>, confidence <N>)
  Why: <why_it_matters>
  Suggested fix: <suggested_fix or "none">

FYI observations (low-confidence, no decision required):

[P3] Section: <section> — <title> (<reviewer>, confidence <N>)
  Why: <why_it_matters>

Residual concerns:
- <concern> (<source>)

Deferred questions:
- <question> (<source>)

Review complete
```

Omit any section with zero items. The envelope preserves backward compatibility — callers that only read "Applied N safe_auto fixes" and "Manual findings" continue to work; the `Gated-auto findings` and `FYI observations` sections surface alongside, not instead of, the existing buckets. End with "Review complete" as the terminal signal so callers can detect completion.

**Interactive mode:**

Present findings using the review output template (read `references/review-output-template.md`). Within each severity level, separate findings by type:

- Errors (design tensions, contradictions, incorrect statements) first — these need resolution
- Omissions (missing steps, absent details, forgotten entries) second — these need additions

Brief summary at the top: "Applied N safe_auto fixes. K findings to consider (X errors, Y omissions). Z FYI observations."

Include the Coverage table, applied fixes, FYI observations (as a distinct subsection), residual concerns, and deferred questions.

### R30 Fix-Landed Matching Predicate

When the orchestrator is running round 2+ on the same document (see Unit 7 multi-round memory), synthesis verifies that prior-round Applied findings actually landed. For each prior-round Applied finding:

- **Matching predicate:** `normalize(section) + normalize(title)` (same fingerprint as 3.3 dedup) augmented with an evidence-substring overlap check. If any current-round persona raises a finding whose fingerprint matches a prior-round Applied finding AND shares >50% of its evidence substring with the prior-round evidence, treat it as a fix-landed regression.
- **Section renames count as different locations.** If the section name has changed between rounds (edit introduced a heading rename), treat the new section as a different location and the current-round finding as new.
- **On match:** flag the finding as "fix did not land" in the report rather than surfacing it as a new finding. Include the prior-round finding's title and the current-round persona's evidence so the user can see why the verification flagged it.

### Protected Artifacts

During synthesis, discard any finding that recommends deleting or removing files in:

- `docs/brainstorms/`
- `docs/plans/`
- `docs/solutions/`

These are pipeline artifacts and must not be flagged for removal.

## Phase 5: Next Action

**Headless mode:** Return "Review complete" immediately. Do not ask questions. The caller receives the text envelope from Phase 4 and handles any remaining findings.

**Interactive mode:** See Unit 5 (`references/walkthrough.md`) for the routing question and per-finding walk-through, and Unit 7's terminal question behavior (three options: apply-and-proceed / apply-and-re-review / exit). Unit 4 (this file) routes findings into tiers and hands them to Unit 5 for interaction.

Return "Review complete" as the terminal signal for callers.

## What NOT to Do

- Do not rewrite the entire document
- Do not add new sections or requirements the user didn't discuss
- Do not over-engineer or add complexity
- Do not create separate review files or add metadata sections
- Do not modify caller skills (ce-brainstorm, ce-plan, or external plugin skills that invoke ce-doc-review)

## Iteration Guidance

On subsequent passes, re-dispatch personas with the multi-round decision primer (see Unit 7) and re-synthesize. Fixed findings self-suppress because their evidence is gone from the current doc; rejected findings are handled by the R29 pattern-match suppression rule; applied-fix verification uses the R30 matching predicate above. If findings are repetitive across passes after these mechanisms run, recommend completion.
