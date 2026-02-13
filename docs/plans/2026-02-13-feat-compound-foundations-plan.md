---
title: "feat: Add Compound Foundations Skill and Integrate into Setup + Compound"
type: feat
status: active
date: 2026-02-13
shaping: docs/plans/2026-02-13-compound-foundations-shaping.md
---

# Add Compound Foundations Skill and Integrate into Setup + Compound

## Overview

Add a `compound-foundations` skill to the compound-engineering plugin that teaches agent-first repo foundations, then integrate it into `/setup` (foundations audit + artifact generation) and `/compound` (promotion to convention + tech debt tracking). This closes the feedback loop: documented solutions compound into conventions, which compound into enforcement.

## Problem Statement / Motivation

Currently, the compound-engineering plugin captures problems (`/compound` -> `docs/solutions/`) and generates plans (`/workflows:plan` -> `docs/plans/`), but there is no path for findings to graduate into conventions or enforcement. Solutions accumulate in `docs/solutions/` and never compound. The plugin also lacks guidance on repo structure for agent-first development -- no audit of CLAUDE.md quality, no convention templates, no tech debt tracking with promotion rules.

## Proposed Solution

**Shape C from the shaping doc:** Enhance existing commands, don't add new ones. Add `compound-foundations` skill as the knowledge + workflow + template layer. `/setup` invokes it for auditing. `/compound` invokes it for promotion.

## Technical Approach

### Architecture

Changes touch 3 existing files and add 1 new skill directory (22+ new files):

| Component | File | Change |
|-----------|------|--------|
| New skill | `skills/compound-foundations/` | New router-style skill (SKILL.md + 10 refs + 4 workflows + 8 assets) |
| Setup | `skills/setup/SKILL.md` | Add Step 6: Foundations Audit |
| Compound docs | `skills/compound-docs/SKILL.md` | Add Options 8-9 to decision gate, enhance Step 7 |
| Compound cmd | `commands/workflows/compound.md` | Sync "What's next?" menu with compound-docs |
| Cleanup | `docs/patterns/` | Remove empty scaffolding |
| Versioning | `plugin.json`, `CHANGELOG.md`, `README.md`, `docs/` pages | Version bump 2.33.1 -> 2.34.0 |

### Key Design Decisions

**Q1 - Similarity detection for 3+ threshold:** Same category directory in `docs/solutions/` + 2 or more overlapping tags in YAML frontmatter. Simple, deterministic, no LLM needed.

**Q2 - Option 2 (Required Reading) vs Option 8 (Convention):** Both kept. Clearly differentiated:
- Option 2 = "Required Reading" -- patterns agents must read before generating code (lives in `docs/solutions/patterns/critical-patterns.md`)
- Option 8 = "Convention" -- coding standards the team follows (lives in `docs/CONVENTIONS.md`)

**Q3 - Step 7 vs C4:** C4 enhances Step 7, doesn't replace it. Step 7 still writes to `common-solutions.md`. C4 adds a promotion suggestion when the 3+ threshold is met.

**Q4 - TECH_DEBT.md format:** Markdown table with columns: Issue | Occurrences | Severity | Status | Source. Machine-parseable. Template defines exact format.

**Q5 - Missing file fallback:** When Option 8/9 is selected but target file doesn't exist, create it in-place from the asset template rather than redirecting to `/setup`. Keep user in flow.

**Q6 - Generate semantics:** Templates are starters with `[PLACEHOLDER]` markers. Agent reads template + project context and generates a populated version. Some sections are generic (keep as-is), some are project-specific (fill in).

**Q7 - CLAUDE.md:** Offer to generate from template only when no CLAUDE.md exists at all. For existing CLAUDE.md, audit quality only.

**Q8 - Scorecard format:** Markdown table: `| Artifact | Status | Action |` with summary line `"5/8 foundations present."`

**Q9 - Options 8-9 visibility:** Always show in decision menu. Add `(suggested)` tag when Step 7 detected a pattern.

### Implementation Phases

#### Phase 1: Compound Foundations Skill (C5)

Build the skill first -- setup and compound depend on its workflows and assets.

**1.1 Create SKILL.md (Router Pattern)**

File: `skills/compound-foundations/SKILL.md`

Structure following `agent-native-architecture` pattern:
- `<essential_principles>` -- The 10 compound foundations principles (condensed)
- `<intake>` -- "What aspect of repo foundations do you need help with?"
  1. Audit my repo's foundations
  2. Learn about a specific principle
  3. Generate a missing artifact
  4. Promote a finding to convention
  5. Track tech debt
- `<routing>` -- Maps intake to workflows or references
- `<reference_index>` -- Lists all 10 reference files
- `<workflows_index>` -- Lists all 4 workflows
- `<success_criteria>` -- Checklist

Source material: `~/.claude/skills/harness-engineering/SKILL.md` (personal skill, 10 principles). Rebrand all "harness" language to "compound foundations."

**1.2 Create Reference Files (10 files)**

Directory: `skills/compound-foundations/references/`

| File | Source | Content |
|------|--------|---------|
| `agent-legibility-checklist.md` | New (referenced but never existed in personal skill) | Actionable checklist: boring tech, reimpl small utils, error messages that teach, greppable code |
| `feedback-loop-patterns.md` | Principle 8 | The promotion ladder: review comment -> doc -> convention -> lint rule. Examples per language. |
| `progressive-disclosure.md` | Principle 4 | CLAUDE.md as map (~100 lines). Doc hierarchy. 2-hop navigation. |
| `mechanical-enforcement.md` | Principle 5 | Per-language: Rakefile, package.json scripts, Makefile, pyproject.toml. Structural tests. Custom linters. |
| `entropy-management.md` | Principle 9 | Gardening patterns. Quality tracking. Background cleanup. Drift detection. |
| `repo-as-system-of-record.md` | Principle 2 | Push knowledge into repo. Design decisions, product specs, references, architecture. |
| `plans-as-artifacts.md` | Principle 3 | Frontmatter with status. Decision logs. Progress tracking. Codex ExecPlan influence. |
| `architecture-docs.md` | matklad influence | Codemap not atlas. Name files/modules/types. Invariants (esp. absence). Cross-cutting concerns. |
| `corrections-over-waiting.md` | Principle 7 | High throughput > perfect gates. Short-lived PRs. Follow-up fixes. Reserve gates for irreversible. |
| `visibility-and-tooling.md` | Principle 10 | Dashboard, status bar, structured logs, per-worktree isolation. |

Each file: 100-200 lines. Follows pattern from `agent-native-architecture/references/` -- overview, core principle, patterns, anti-patterns, examples.

**1.3 Create Workflow Files (4 files)**

Directory: `skills/compound-foundations/workflows/`

Each workflow has `<required_reading>`, `<process>`, `<success_criteria>` (per `create-agent-skills/workflows/` convention).

| File | Used by | Steps |
|------|---------|-------|
| `audit-foundations.md` | `/setup` Step 6 | Read refs: progressive-disclosure, repo-as-system-of-record. Run tiered checks (core -> recommended -> stack-specific). Present scorecard. Offer generation per missing artifact. |
| `promote-to-convention.md` | `/compound` Option 8 | Read refs: feedback-loop-patterns. Check if `docs/CONVENTIONS.md` exists (create from template if not). Check for duplicate convention. Append entry: rule + rationale + source link. |
| `track-tech-debt.md` | `/compound` Option 9 | Read refs: entropy-management. Check if `docs/TECH_DEBT.md` exists (create from template if not). Parse table for existing entry. Add new or bump occurrence count. If count >= 3, suggest promotion. |
| `generate-artifacts.md` | `/setup` Step 6 | Read refs: progressive-disclosure, mechanical-enforcement. For each missing artifact: read corresponding asset template, read project context (language, structure), generate populated version, write to `docs/`. |

**1.4 Create Asset Templates (8 files)**

Directory: `skills/compound-foundations/assets/`

| File | Target | Content |
|------|--------|---------|
| `CONVENTIONS.md` | `docs/CONVENTIONS.md` | Section headers: Code Style, Naming, Error Handling, Testing, Infrastructure Patterns. 2-3 example entries per section marked as `[EXAMPLE - replace with your conventions]`. |
| `TECH_DEBT.md` | `docs/TECH_DEBT.md` | Header explaining promotion rules (3+ occurrences -> promote). Table: `\| Issue \| Occurrences \| Severity \| Status \| Source \|`. One example entry. |
| `QUALITY_SCORE.md` | `docs/QUALITY_SCORE.md` | Header. Table: `\| Module \| Tests \| Last Reviewed \| Grade \| Known Issues \|`. Instructions for grades (A-D). |
| `ARCHITECTURE.md` | `docs/ARCHITECTURE.md` | matklad-style: Bird's eye overview, Codemap (module -> purpose), Data flow, Invariants, Cross-cutting concerns. All sections have `[PLACEHOLDER]` markers. |
| `CLAUDE_MD.md` | `CLAUDE.md` | Map-style ~100 lines. Sections: What Is This, Directory Structure, Key Concepts, Pointers (to docs/CONVENTIONS, docs/ARCHITECTURE, etc.), Commands, Tone. |
| `SECURITY.md` | `docs/SECURITY.md` | Auth patterns, input validation boundaries, secrets management, dependency auditing. |
| `FRONTEND.md` | `docs/FRONTEND.md` | Component conventions, state management, API integration patterns, accessibility. |
| `DESIGN.md` | `docs/DESIGN.md` | Design tokens, component library, layout patterns, responsive strategy. |

Note: RELIABILITY.md and PRODUCT_SENSE.md are out of scope for this iteration. Remove from the directory structure documentation. Can be added later.

#### Phase 2: Setup Enhancement (C1)

**2.1 Add Step 6 to `skills/setup/SKILL.md`**

After existing Step 5 (Confirm), append:

```markdown
## Step 6: Foundations Check (optional)

Use AskUserQuestion:

question: "Would you like to audit your repo's foundations? Checks CLAUDE.md quality, conventions, tech debt tracking, and more."
header: "Foundations"
options:
  - label: "Yes (Recommended)"
    description: "Run tiered audit: CLAUDE.md quality, conventions, tech debt, architecture docs."
  - label: "Skip"
    description: "Finish setup without auditing foundations."

If "Skip": end setup.
If "Yes": invoke `compound-foundations` skill workflow `workflows/audit-foundations.md`.
```

The workflow handles everything: tiered checks, scorecard presentation, artifact generation offers. Setup just invokes it.

#### Phase 3: Compound Enhancement (C3 + C4)

**3.1 Add Options 8-9 to `skills/compound-docs/SKILL.md`**

In the `<decision_gate>` block (around line 279), after existing Option 7, add:

```markdown
8. Promote to convention - Graduate this finding to docs/CONVENTIONS.md
9. Track as tech debt - Add to docs/TECH_DEBT.md with occurrence tracking
```

For Option 8: invoke `workflows/promote-to-convention.md` from `compound-foundations` skill.
For Option 9: invoke `workflows/track-tech-debt.md` from `compound-foundations` skill.

Both workflows handle the "file doesn't exist" case by creating from template in-place.

Add differentiation text between Option 2 and Option 8:
- Option 2: "Required Reading -- patterns agents must know before generating code"
- Option 8: "Convention -- coding standards your team follows"

**3.2 Enhance Step 7 with auto-promotion trigger (C4)**

In `skills/compound-docs/SKILL.md` Step 7 (cross-reference and pattern detection, around line 201), after the existing 3+ similar issues check that writes to `common-solutions.md`, add:

```markdown
**Promotion suggestion:** If 3+ similar findings exist (same category directory + 2+ overlapping tags), add to the decision menu:
"This pattern has appeared [N] times. Consider promoting to a convention (Option 8)."
Tag Option 8 with "(suggested)" in the decision menu.
```

This supplements the existing Step 7 behavior, doesn't replace it.

**3.3 Sync `commands/workflows/compound.md` menu**

The compound.md file (lines 173-181) has a simpler 5-option "What's next?" menu that's out of sync with compound-docs' 7-option menu. Update it to match the new 9-option menu from compound-docs, or remove the duplicate menu and defer entirely to the skill's decision gate.

Recommendation: Remove the compound.md menu duplication. The skill's `<decision_gate>` is authoritative. compound.md should say "Proceed to the decision gate in the compound-docs skill" rather than maintaining its own list.

#### Phase 4: Cleanup + Versioning (C6)

**4.1 Remove empty `docs/patterns/`**

Delete:
- `docs/patterns/hooks/`
- `docs/patterns/structures/`
- `docs/patterns/transitions/`
- `docs/patterns/voice/`
- `docs/patterns/`

Confirm that `docs/solutions/patterns/` (used by compound-docs Step 7) is NOT affected -- it's a different path.

**4.2 Version bump**

- `.claude-plugin/plugin.json`: `2.33.1` -> `2.34.0` (new skill = minor). Update description: "20 skills" (was 19).
- `CHANGELOG.md`: Add `## [2.34.0] - 2026-02-13` entry.
- `README.md`: Update skill count table, add compound-foundations to skill list.
- `docs/` pages: Update sidebar counts, add entries where needed.

## Alternative Approaches Considered

See shaping doc (`docs/plans/2026-02-13-compound-foundations-shaping.md`) for full evaluation of 3 shapes. Shape C (enhance existing commands) was selected over Shape A (extend both, no skill) and Shape B (new `/foundations` command).

Within Shape C, we considered a `foundations:` config block in `compound-engineering.local.md` with configurable paths. Removed in favor of convention over configuration -- files always in `docs/`.

## Acceptance Criteria

### Functional Requirements

- [x] `skills/compound-foundations/SKILL.md` exists as router-style skill
- [x] 10 reference files cover all 10 principles
- [x] 4 workflow files (audit, promote, track-debt, generate)
- [x] 8 asset templates for artifact generation
- [x] `/setup` offers Step 6 foundations audit after existing config
- [x] Audit checks core tier (CLAUDE.md, CONVENTIONS.md, TECH_DEBT.md)
- [x] Audit checks recommended tier (ARCHITECTURE.md, QUALITY_SCORE.md, design-docs/, plans/)
- [x] Audit checks stack-specific tier based on project detection
- [x] Scorecard presented as markdown table with status + action columns
- [x] Missing artifacts can be generated from templates
- [x] `/compound` decision menu has Options 8 (convention) and 9 (tech debt)
- [x] Option 8 appends to `docs/CONVENTIONS.md` (creates from template if missing)
- [x] Option 9 adds/updates entry in `docs/TECH_DEBT.md` with occurrence count
- [x] Occurrence count >= 3 triggers promotion suggestion
- [x] Step 7 auto-suggests promotion when 3+ similar findings detected
- [x] Option 2 (Required Reading) and Option 8 (Convention) clearly differentiated
- [x] Empty `docs/patterns/` removed
- [x] `docs/solutions/patterns/` NOT affected

### Non-Functional Requirements

- [x] Templates are language-agnostic (work for Ruby, Python, TypeScript, Go, etc.)
- [x] All reference files are 100-200 lines
- [x] SKILL.md follows router pattern (XML tags, intake, routing table)
- [x] Workflows follow convention (required_reading, process, success_criteria)
- [x] No new commands -- only enhances existing `/setup` and `/compound`

### Quality Gates

- [x] Version bumped to 2.34.0
- [x] CHANGELOG.md entry added
- [x] README.md skill count updated (19 -> 20)
- [x] README.md skill table includes compound-foundations
- [x] plugin.json description updated
- [x] docs/ pages updated with new counts

## Dependencies & Prerequisites

- Shaping doc: `docs/plans/2026-02-13-compound-foundations-shaping.md` (approved)
- Source material: `~/.claude/skills/harness-engineering/SKILL.md` (personal skill, 10 principles)
- Existing patterns: `skills/agent-native-architecture/` (14 refs, router), `skills/create-agent-skills/` (13 refs, 10 workflows, 2 templates)

## Risk Analysis & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Options 8-9 add decision fatigue (9 options total) | Users overwhelmed | Always show, but mark "(suggested)" only when pattern detected. Clear differentiation text. |
| TECH_DEBT.md format fragile to manual edits | Occurrence bumping breaks | Define rigid table format in template. Parse defensively. |
| Concurrent edits in multi-agent setup | File corruption | Workflows should note atomic write patterns where relevant. |
| Templates too generic to be useful | Users delete and start over | Fill in project-specific sections during generation. Mark examples clearly. |
| Step 7 + C4 double-trigger confusion | User prompted twice | C4 supplements Step 7 with a suggestion, not a separate prompt. One decision menu, not two. |

## File Manifest

### New Files (22)

```
skills/compound-foundations/
├── SKILL.md
├── references/
│   ├── agent-legibility-checklist.md
│   ├── feedback-loop-patterns.md
│   ├── progressive-disclosure.md
│   ├── mechanical-enforcement.md
│   ├── entropy-management.md
│   ├── repo-as-system-of-record.md
│   ├── plans-as-artifacts.md
│   ├── architecture-docs.md
│   ├── corrections-over-waiting.md
│   └── visibility-and-tooling.md
├── workflows/
│   ├── audit-foundations.md
│   ├── promote-to-convention.md
│   ├── track-tech-debt.md
│   └── generate-artifacts.md
└── assets/
    ├── CONVENTIONS.md
    ├── TECH_DEBT.md
    ├── QUALITY_SCORE.md
    ├── ARCHITECTURE.md
    ├── CLAUDE_MD.md
    ├── SECURITY.md
    ├── FRONTEND.md
    └── DESIGN.md
```

### Modified Files (4)

```
skills/setup/SKILL.md              # Add Step 6
skills/compound-docs/SKILL.md      # Add Options 8-9, enhance Step 7
commands/workflows/compound.md     # Sync menu or remove duplicate
```

### Deleted (4 empty dirs)

```
docs/patterns/hooks/
docs/patterns/structures/
docs/patterns/transitions/
docs/patterns/voice/
```

### Versioning Files (3+)

```
.claude-plugin/plugin.json         # 2.33.1 -> 2.34.0
CHANGELOG.md                       # New entry
README.md                          # Skill count + table
docs/index.html                    # Stats
docs/pages/skills.html             # New skill entry
docs/pages/changelog.html          # New version
```

## References & Research

### Internal References
- Shaping doc: `docs/plans/2026-02-13-compound-foundations-shaping.md`
- Router pattern exemplar: `skills/agent-native-architecture/SKILL.md`
- Workflow pattern exemplar: `skills/create-agent-skills/workflows/create-new-skill.md`
- Asset pattern exemplar: `skills/compound-docs/assets/resolution-template.md`
- Decision gate location: `skills/compound-docs/SKILL.md:260-343`
- Setup skill: `skills/setup/SKILL.md` (169 lines, 5 steps)
- Compound command: `commands/workflows/compound.md` (duplicate menu at lines 173-181)

### External References
- matklad ARCHITECTURE.md: https://matklad.github.io/2021/02/06/ARCHITECTURE.md.html
- OpenAI Codex ExecPlans: https://developers.openai.com/cookbook/articles/codex_exec_plans
- OpenAI Harness Engineering: https://openai.com/index/harness-engineering/

### Source Material
- Personal harness-engineering skill: `~/.claude/skills/harness-engineering/SKILL.md`
- Erf repo foundations (test case): `~/erf/docs/CONVENTIONS.md`, `~/erf/docs/tech-debt.md`, `~/erf/docs/QUALITY_SCORE.md`
