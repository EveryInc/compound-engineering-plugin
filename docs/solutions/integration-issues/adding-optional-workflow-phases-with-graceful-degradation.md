---
title: "Adding optional workflow phases with graceful degradation"
date: 2026-02-13
category: integration-issues
tags:
  - workflow-orchestration
  - privacy-by-design
  - feature-integration
  - graceful-degradation
  - deduplication
  - plugin-development
severity: medium
component: workflows
solution_type: pattern
---

# Adding Optional Workflow Phases with Graceful Degradation

## Problem

When adding a new optional workflow phase (Research) that feeds into existing phases (Brainstorm, Plan), four integration problems surfaced during review:

1. **PII in sample data** — real names, company names, and confidential discussions were committed to a public-facing repo as sample research artifacts
2. **Reference file duplication** — a 414-line reference file was copied identically into 3 skill directories (~30% of the PR's line count)
3. **Noisy degradation** — the integration into brainstorm/plan workflows could mention missing research data to ALL users, not just those who opted into research
4. **Weak privacy language** — skills said "Consider adding transcripts to .gitignore" instead of "MUST NOT commit"

## Solution 1: "Do No Harm" Integration Pattern

When adding an optional agent to existing workflows, two layers of graceful degradation are needed:

**Layer 1 — The agent handles empty data:**
```markdown
## Step 8: Handle Empty Research Directory

If `docs/research/` does not exist or contains no files, return:
"No user research data found."
```

**Layer 2 — The calling workflow skips silently:**
```markdown
If `user-research-analyst` returns relevant findings (personas, insights,
opportunities), briefly summarize them before starting the collaborative
dialogue. If no research data exists, skip the summary silently and proceed
directly to the collaborative dialogue — do not mention the absence of
research or suggest running `/workflows:research`.
```

The agent that produces optional data handles the "no data" case with a message. The workflows that consume optional data handle it with **silence**. This prevents cascading "you should do research" messages.

**Implementation pattern:**
- Run the new agent in **parallel** with existing agents (no serial bottleneck)
- Use conditional language in the consuming workflow: "If findings were returned... If not, skip silently"
- Explicitly instruct "do not mention the absence" to prevent well-meaning suggestions

## Solution 2: PII-Safe Research Artifacts

Raw interview transcripts contain PII and must never reach version control.

**File structure:**
```
docs/research/
├── plans/           # Committed — research plans with hypotheses
├── transcripts/     # GITIGNORED — raw interview data with PII
├── interviews/      # Committed — anonymized snapshots (user-001, user-002)
└── personas/        # Committed — synthesized persona documents
```

**Key rules:**
- `.gitignore` must exclude `docs/research/transcripts/*` (with `!.gitkeep` exception) BEFORE any transcripts are created
- Skills must give explicit PII stripping instructions: replace names inline in quotes, anonymize company names, sanitize filenames
- Use "MUST NOT be committed to public repositories" — not "consider" or "should"
- Sample data for testing must use synthetic data, never real interview content

**What went wrong:** Sample data files were created with real names ("Krista," "Holly," "Beth"), real companies ("WellCare," "Centene," "Highmark"), and confidential personnel discussions. These were committed to the branch and only caught during code review.

## Solution 3: Reference File Deduplication

When multiple skills need the same reference material, maintain ONE canonical copy.

**Before (3 copies, 1,242 lines):**
```
skills/
├── research-plan/references/discovery-playbook.md       # 414 lines
├── transcript-insights/references/discovery-playbook.md  # 414 lines (duplicate)
└── persona-builder/references/discovery-playbook.md      # 414 lines (duplicate)
```

**After (1 copy, 414 lines):**
```
skills/
├── research-plan/references/discovery-playbook.md        # 414 lines (canonical)
├── transcript-insights/SKILL.md                          # references ../research-plan/references/
└── persona-builder/SKILL.md                              # references ../research-plan/references/
```

In each non-canonical SKILL.md:
```markdown
**Reference:** [discovery-playbook.md](../research-plan/references/discovery-playbook.md)
```

Relative paths work because Claude Code follows markdown links when loading skill context.

## Solution 4: Phase Recommendation Priority

When a workflow command recommends the next phase, prioritize actionable data over missing prerequisites.

**Wrong order:**
```
- No plans exist → recommend Plan
- Unprocessed transcripts exist → recommend Process
```

**Right order:**
```
- Unprocessed transcripts exist → recommend Process (ready-to-process data takes priority)
- Interviews exist but no personas → recommend Personas
- No plans and no transcripts → recommend Plan
```

Users who drop a transcript into the folder and run `/workflows:research` should be guided to process it — not steered back to create a plan first. Always offer an ad-hoc option (`research_plan: ad-hoc`) so no phase is a hard prerequisite for another.

## Prevention Strategies

### 1. PII in Sample Data

**Prevention:** Create `.gitignore` entries for data directories BEFORE creating the directories. Use only synthetic data in committed samples.

**Checklist item:** `[ ] All sample data uses fictional names/companies only (no real PII)`

**Detection:** `grep -riE '[A-Z][a-z]+ (said|mentioned|discussed)' docs/research/` in pre-commit or CI.

### 2. Reference File Duplication

**Prevention:** Before copying a reference file into a second skill, stop and use a relative path instead.

**Checklist item:** `[ ] No reference files duplicated across skills (use relative paths to canonical copy)`

**Detection:** `find plugins/compound-engineering/skills -name "*.md" -exec md5sum {} \; | sort | uniq -w32 -d`

### 3. "Do No Harm" Not Verified Until Review

**Prevention:** When modifying brainstorm/plan/work workflows, explicitly test with an empty `docs/research/` directory and confirm zero behavioral change.

**Checklist item:** `[ ] Workflow changes verified to produce no output difference when optional data is absent`

**Detection:** Run the modified workflow in a fresh repo without the feature's data. Confirm no new prompts, messages, or suggestions appear.

### 4. Weak Privacy Language

**Prevention:** Use RFC 2119 language: MUST/MUST NOT for security and privacy requirements. Never use "consider," "should," or "recommended" for PII handling.

**Checklist item:** `[ ] Privacy/security requirements use MUST/MUST NOT language (not "consider" or "should")`

**Detection:** `grep -rn 'consider.*gitignore\|should.*PII\|recommended.*privacy' skills/`

## Related Documentation

- `docs/solutions/plugin-versioning-requirements.md` — Plugin versioning and multi-file update patterns
- `plugins/compound-engineering/CLAUDE.md` — Plugin development conventions, skill compliance checklist
- `docs/brainstorms/2026-02-13-user-research-workflow-integration-brainstorm.md` — Integration design decisions
- `docs/brainstorms/2026-02-10-user-research-workflow-brainstorm.md` — Original workflow design

## Files Modified

| File | Change |
|------|--------|
| `commands/workflows/brainstorm.md` | Added `user-research-analyst` to Phase 1.1 with silent degradation |
| `commands/workflows/plan.md` | Added `user-research-analyst` to Step 1 and Step 1.6 with conditional inclusion |
| `commands/workflows/research.md` | Fixed phase recommendation to prioritize unprocessed transcripts |
| `agents/research/user-research-analyst.md` | Removed "to be wired in PR 2" TODO, updated Integration Points |
| `skills/transcript-insights/SKILL.md` | Strengthened PII guidance from "Consider" to "MUST NOT" |
| `skills/persona-builder/SKILL.md` | Simplified evidence strength/hypothesis status tables; deduplicated playbook reference |
| `.gitignore` | Added `docs/research/transcripts/*` with `!.gitkeep` exception |

## Key Takeaway

The pattern for adding optional workflow phases: **the producer handles absence with a message; the consumer handles absence with silence.** This ensures the feature enhances workflows for adopters without degrading them for everyone else.
