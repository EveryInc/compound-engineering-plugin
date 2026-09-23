---
title: Learning Retirement Condition - Plan
type: feat
date: 2026-09-23
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Learning Retirement Condition - Plan

## Goal Capsule

- **Objective:** A learning can declare the outside change that would retire it. `ce-compound` sets the field on new captures whose guidance depends on an outside condition, the bun workaround learning declares it now, and `ce-compound-refresh` checks a declared condition when it audits the learning.
- **Authority:** the user's request, then the project's active instructions (`AGENTS.md`: conditions not procedures, the skill-authoring standard, byte-mirrored support files), then this plan.
- **Execution profile:** one native session. Prose edits to skill references, one learning, two guides, and one test file.
- **Stop conditions:** stop and report if the change needs bytes in either `SKILL.md` body (both sit within 40 bytes of the 8,000-byte budget in `tests/codex-skill-prompt-budget.test.ts`). Stop if the field cannot stay optional without breaking an existing learning.
- **Tail ownership:** the calling pipeline owns commit, push, PR, and CI.

---

## Product Contract

### Summary

Add an optional `retire_when` field to the learning frontmatter schema. `ce-compound` sets it only when the guidance depends on an outside condition. `ce-compound-refresh` checks a declared condition and treats a met one as contradicting evidence, not age. The bun workaround learning gets its condition in the same change.

### Problem Frame

arXiv 2609.12039 ("Reality Is the Final Verifier") argues that a lesson is a scoped rule that must retire when counterevidence arrives, and that knowledge bases rot when nothing says when a rule stops applying. CE learnings record scope (`applies_when`) and cause (`root_cause`), but nothing a later refresh can find that says when the guidance ends. `docs/solutions/developer-experience/bun-parallel-worker-loses-subprocess-exit.md` explains the TimeoutError re-run in `scripts/run-tests.ts` by citing open upstream bugs oven-sh/bun#34069 and #41024. Its retirement condition exists only as the last Prevention bullet, which no refresh check reads.

### Requirements

**Capture**

- R1. The learning schema offers an optional `retire_when` field on both tracks. It names the outside change that would retire the learning and a check for it that runs without changing the repo.
- R2. A learning sets `retire_when` only when its guidance holds just while an outside condition holds (an open upstream bug, a tool or platform version, a dependency's behavior). Other learnings omit it.

**Refresh**

- R3. When a learning declares `retire_when`, the refresh checks whether the condition is now met and records the evidence in the report, not in the learning. It never infers a condition for a learning that declares none.
- R4. A met condition is contradicting evidence, classified through the existing outcomes. When repo code still carries the workaround the learning explains, the doc stays (Keep, or Update where the evidence contradicts a claim it makes), and removing the workaround is the recommended action in that doc's report entry, never applied.
- R5. A condition the refresh cannot check falls under the existing "Unverifiable is not false" rule.

**Repo example**

- R6. The bun workaround learning declares its retirement condition.

**Contract hygiene**

- R7. Existing learnings without the field stay valid. Schema, prose schema, template, and validation rules change together, byte-identical across `ce-compound` and `ce-compound-refresh`.
- R8. The user guides for both skills describe the field and the refresh check.

### Scope Boundaries

- No new refresh outcome or report counter, and no status-like field such as a retired state or a last-checked date. "Retire" already names a `CONCEPTS.md` action in the refresh report.
- No edits to either `SKILL.md` body.
- No edits to the learnings-researcher prompt copies in `ce-plan`, `ce-ideate`, `ce-optimize`, and `ce-code-review`. They read frontmatter fields as-is.

#### Deferred to Follow-Up Work

- Off-enum values already in the corpus: `resolution_type: workaround` in the bun learning and `install_strategy` in `docs/solutions/integrations/native-plugin-install-strategy.md`. A corpus-wide enum check would catch both.
- Backfilling `retire_when` on other learnings that cite an upstream bug.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **A frontmatter field, not a body section.** A refresh can grep a field across the store. The schema already reaches every writer: the Full-mode Context Analyzer, Full assembly, Lightweight, and refresh's Replace successors (which may not invent fields outside the schema).
- KTD2. **Optional on both tracks.** (session-settled: user-directed — chosen over a required field: existing learnings stay valid) The field goes under `optional_fields`, because the bun learning is bug-track and workaround learnings such as `docs/solutions/skill-design/harness-agent-gate-workaround.md` are knowledge-track.
- KTD3. **Name `retire_when`, one quoted string.** It parallels `applies_when`. Its value states the retiring change, not the holding condition, and a check a refresh can run without changing the repo. A verification that needs a repo change (such as removing the workaround and watching CI) belongs in the learning's body as the step before removal. A top-level string gets the existing parser-safety check for unquoted ` #` and `: `, which array items skip. A compound condition such as the bun one fits in one string.
- KTD4. **The capture rule lives in the schema and the template.** The schema description states when to set the field. Each track template carries one optional `retire_when` line whose placeholder says to omit it when no outside change applies. `references/assembly.md` and `references/lightweight.md` already validate against the schema, so they need no copy of the rule.
- KTD5. **The orchestrator checks the condition; classify routes the result.** `references/investigate.md` adds the check and assigns it to the orchestrator, because investigation subagents see only the three verbatim clauses and would hit permission prompts on tracker queries. `references/classify.md` adds one judgment rule for a met condition. The refresh never changes product code, and a met condition is a reason to verify the removal, not proof it is safe (`docs/solutions/skill-design/harness-agent-gate-workaround.md`). So when the workaround is still in repo code, the doc stays, and removing the workaround is the recommended action in the doc's report entry (non-interactive: under **Recommended**), the same routing the named-guidance rule uses. The auto-delete gate is unchanged.
- KTD6. **Pin the smallest falsifiable units.** In `tests/compound-support-files.test.ts`, assert that the parsed schema has `retire_when` under `optional_fields` and not under `required_fields`, that the template has one `retire_when:` line per track, and that the refresh `investigate.md` and `classify.md` name `retire_when`. The existing byte-equality test covers the refresh copies.

### Assumptions

- A declared condition's check may need the network (tracker state). When it is unreachable, R5 applies and the network stays outside correctness.
- No Consolidate or Split flow edit. Only the bun learning carries the field after this change, so how a merge carries it can wait for a real case.
- The bun learning's `resolution_type: workaround` stays as-is in this change (see Deferred).

### Sources

- `skills/ce-compound-refresh/references/classify.md`: the "Unverifiable is not false" rule and the descriptive-drift rule the new rule sits beside.
- `skills/ce-compound-refresh/references/report.md`: Recommended already covers everything that never runs unattended.
- `docs/solutions/skill-design/bound-contradiction-checks-to-named-guidance.md`: bound a refresh check to what the learning names, and pin the paragraph that owns the rule.
- `docs/solutions/conventions/verify-externally-attributed-constraints-at-the-source.md`: check upstream claims at the primary source.
- oven-sh/bun#34069 and oven-sh/bun#41024: both open on 2026-09-23.

---

## Implementation Units

### U1. Schema, prose schema, and template carry `retire_when`

- **Goal:** Offer the optional field and state when to set it.
- **Requirements:** R1, R2, R7. KTD1-KTD4.
- **Dependencies:** none.
- **Files:** `skills/ce-compound/references/schema.yaml`, `skills/ce-compound/references/yaml-schema.md`, `skills/ce-compound/assets/resolution-template.md`, their byte-identical copies under `skills/ce-compound-refresh/`, `tests/compound-support-files.test.ts`.
- **Approach:**
  1. Add `retire_when` to `optional_fields` in `schema.yaml` with a description that states R2's condition. Add a `validation_rules` entry saying the field is optional on both tracks and is one string.
  2. Mirror both in `yaml-schema.md`: an "Optional Fields (both tracks)" bullet and a numbered validation rule.
  3. Add one optional `retire_when:` line to each track's frontmatter block in the template.
  4. Copy the three files byte-for-byte into `ce-compound-refresh`.
- **Patterns to follow:** the `framework_version` threading (schema block, validation rule, prose section) and the YAML-safety pins in `tests/compound-support-files.test.ts`.
- **Test scenarios:**
  - Parsed `schema.yaml` has `optional_fields.retire_when` with a description, and `required_fields` has no `retire_when`.
  - The template contains exactly two lines that start with `retire_when:`, one per track.
  - The existing drift test passes, which proves the refresh copies match.
- **Verification:** the focused tests pass. Schema, prose schema, and template name the field with the same meaning.

### U2. Refresh checks and classifies by `retire_when`

- **Goal:** The refresh checks a declared condition and routes a met one.
- **Requirements:** R3, R4, R5. KTD5.
- **Dependencies:** U1.
- **Files:** `skills/ce-compound-refresh/references/investigate.md`, `skills/ce-compound-refresh/references/classify.md`, `tests/compound-support-files.test.ts`.
- **Approach:**
  1. In `investigate.md`, add the declared-condition check as its own short paragraph after the dimensions. The orchestrator runs it through whatever interface the condition's source exposes, records the evidence and date or that it could not check, and never infers a condition.
  2. In `classify.md`, add one judgment rule next to the descriptive-drift rule. It covers R4 and cites "Unverifiable is not false" for R5.
- **Patterns to follow:** the named-guidance check (#1265), which bounded a refresh check to what the learning names.
- **Test scenarios:**
  - `investigate.md` names `retire_when`.
  - `classify.md` names `retire_when`.
  - Deleting either rule fails its assertion.
- **Verification:** both references state the rule once. Neither `SKILL.md` changes.

### U3. The bun learning declares its retirement condition

- **Goal:** The repo's concrete example carries the field.
- **Requirements:** R6.
- **Dependencies:** U1.
- **Files:** `docs/solutions/developer-experience/bun-parallel-worker-loses-subprocess-exit.md`.
- **Approach:**
  1. Add a quoted `retire_when` naming both upstream issues closed as fixed in a released bun that CI's `bun-version: latest` installs, checked on the issue tracker and bun's releases.
  2. Rewrite the last Prevention bullet to point at the field and to name the verification before removal: repeated green CI runs with the TimeoutError re-run removed from `scripts/run-tests.ts`.
  3. Add `last_updated: 2026-09-23`.
- **Test expectation:** none -- a learning doc. Run the bundled `validate-frontmatter.py` and `validate-doc-claims.py` against it.
- **Verification:** both validators exit 0.

### U4. Guides

- **Goal:** User guides describe the field and the check.
- **Requirements:** R8.
- **Dependencies:** U1, U2.
- **Files:** `docs/guides/ce-compound.md`, `docs/guides/ce-compound-refresh.md`.
- **Approach:** One or two sentences in each: the frontmatter paragraph of the ce-compound guide, and the outcomes section of the refresh guide. Add no blockquotes, because `tests/ce-setup-instruction-file-offers.test.ts` parses the ce-compound guide's blockquotes.
- **Test expectation:** none -- user docs.
- **Verification:** the guides match the skill references.

---

## Verification Contract

| Gate | Command or check | Applies to |
|---|---|---|
| Focused tests | `bun test tests/compound-support-files.test.ts tests/pipeline-review-contract.test.ts tests/codex-skill-prompt-budget.test.ts tests/frontmatter-validator.test.ts` | U1, U2 |
| Full suite | `bun run test` | all |
| Release metadata | `bun run release:validate` | all |
| Learning validators | `python3 skills/ce-compound/scripts/validate-frontmatter.py <doc>` and `python3 skills/ce-compound/scripts/validate-doc-claims.py <doc>` | U3 |
| Behavioral eval | `bun run test:skill-eval-cell` on Claude and Codex with a fixture learning whose condition is checkable offline and met, so the R4 path fires; or the exact skip reason when no host CLI is on PATH | U2 |

## Definition of Done

- R1-R8 hold, and each unit's verification passes.
- Neither `SKILL.md` body changed, and the budget test passes.
- The refresh copies of the three support files are byte-identical to the `ce-compound` copies.
- No dead-end edits remain in the diff.
