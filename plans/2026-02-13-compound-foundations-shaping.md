---
shaping: true
status: active
date: 2026-02-13
topic: compound-foundations
---

# Compound Foundations -- Shaping

## What We're Building

Integrate compound foundations into the compound-engineering plugin so that users can strengthen their repo's foundation for agent-first development through existing commands. `/setup` gains a foundations audit that checks for and generates missing artifacts in `docs/`. `/compound` gains a promotion path so findings compound from docs into conventions into enforcement rules. The `compound-foundations` skill is added to the plugin as reference knowledge.

## Why This Approach (Shape C)

Three shapes were considered:

- **A (extend both commands):** Passed most checks but didn't add skill knowledge to the plugin. Dead-end.
- **B (new `/foundations` command):** Clean separation but split the audit away from setup, adding a new command users rarely discover. Friction.
- **C (enhance compound loop + foundations in setup):** Natural integration. Setup audits, compound promotes. Skill provides depth. Passes all requirements.

Shape C was selected because it reuses existing surfaces (no new commands to learn) and distributes foundations knowledge through the plugin's existing skill/reference system.

## Requirements (R)

| ID | Requirement | Status |
|----|-------------|--------|
| R0 | `/setup` audits repo foundations and generates missing artifacts | Core goal |
| R1 | `/compound` has promotion path: finding -> convention -> enforcement | Core goal |
| R2 | Works across languages/frameworks (not Ruby-specific) | Must-have |
| R3 | Convention over configuration -- files always in `docs/`, no config paths | Must-have |
| R4 | Progressive adoption -- users opt into foundations features, not forced | Must-have |
| R5 | Foundations knowledge lives in plugin skill with references/workflows/assets | Must-have |
| R6 | CLAUDE.md quality check is part of the audit | Leaning yes |
| R7 | Quality score tracking per module is offered during setup | Leaning yes |
| R8 | Tech debt file is created with promotion rules baked in | Leaning yes |

## Convention: docs/ Is the Standard Location

All generated artifacts live in `docs/`. No configurable paths. The plugin knows where to find things because the convention IS the configuration.

```
CLAUDE.md                        # The map (audited, not generated)
compound-engineering.local.md    # Plugin settings (review agents only)

docs/
├── ARCHITECTURE.md              # Codemap (matklad-style)
├── CONVENTIONS.md               # Coding standards + enforcement
├── TECH_DEBT.md                 # Debt tracker with promotion rules
├── QUALITY_SCORE.md             # Per-module quality baseline
├── SECURITY.md                  # Security patterns (optional)
├── RELIABILITY.md               # Reliability / ops (optional)
├── FRONTEND.md                  # Frontend patterns (optional)
├── DESIGN.md                    # Design system (optional)
├── PRODUCT_SENSE.md             # Product context (optional)
│
├── solutions/                   # ← existing (compound)
├── plans/                       # ← existing (plan, with status frontmatter)
├── design-docs/                 # Decision records / ADRs
├── product-specs/               # Product specifications (optional)
├── references/                  # External docs, llms.txt files (optional)
└── generated/                   # Auto-generated docs (optional)
```

**Naming convention:** `SCREAMING_CASE.md` for single docs, `lowercase/` for collections.

### Audit Tiers

Not every repo needs all of these. The audit checks progressively:

| Tier | Artifacts | When |
|------|-----------|------|
| **Core** | CLAUDE.md, CONVENTIONS.md, TECH_DEBT.md | Every repo |
| **Recommended** | ARCHITECTURE.md, QUALITY_SCORE.md, design-docs/, plans/ | Most repos |
| **Stack-specific** | FRONTEND.md, DESIGN.md, SECURITY.md, RELIABILITY.md | Detected from project type |
| **Product** | PRODUCT_SENSE.md, product-specs/ | Product repos |
| **Reference** | references/, generated/ | Library-heavy, auto-gen content |

## Selected Shape: C

### Parts

| Part | Mechanism |
|------|-----------|
| **C1** | `/setup` gains "Foundations" section: tiered audit of `docs/`, offer to generate missing artifacts. |
| **C3** | `/compound` gains promotion paths: "Promote to convention" (append to `docs/CONVENTIONS.md`), "Track as tech debt" (add to `docs/TECH_DEBT.md`). Looks in `docs/` directly. |
| **C4** | `/compound` Step 7 enhanced: when 3+ similar findings exist in `docs/solutions/`, auto-suggest "promote to convention." The feedback loop trigger. |
| **C5** | `compound-foundations` skill added to plugin with references/, workflows/, and assets/. Covers all 10 principles. |
| **C6** | Remove empty `docs/patterns/` scaffolding. All pattern knowledge lives in the skill. |

*C2 (settings integration) was removed. Convention over configuration -- files are always in `docs/`.*

### Part Details

#### C5: Compound Foundations Skill (Build First)

Router-style skill following the `create-agent-skills` pattern. Three directories: knowledge to read, procedures to follow, templates to copy.

```
skills/compound-foundations/
├── SKILL.md                          # Router: 10 principles + intake + routing table
├── references/                       # Knowledge to READ (one per principle)
│   ├── agent-legibility-checklist.md # Actionable checklist for agent-readable repos
│   ├── feedback-loop-patterns.md     # Review -> docs -> lint promotion ladder
│   ├── progressive-disclosure.md     # CLAUDE.md as map, doc hierarchy
│   ├── mechanical-enforcement.md     # Per-language enforcement patterns
│   ├── entropy-management.md         # Gardening patterns, quality tracking
│   ├── repo-as-system-of-record.md   # What goes in the repo and where
│   ├── plans-as-artifacts.md         # Frontmatter, status, decision logs
│   ├── architecture-docs.md          # matklad-style ARCHITECTURE.md guidance
│   ├── corrections-over-waiting.md   # Throughput > perfect gates
│   └── visibility-and-tooling.md     # Dashboards, status bars, structured logs
├── workflows/                        # Procedures to FOLLOW
│   ├── audit-foundations.md          # Step-by-step foundations audit (used by /setup)
│   ├── promote-to-convention.md      # Promotion workflow (used by /compound)
│   ├── track-tech-debt.md            # Tech debt tracking workflow
│   └── generate-artifacts.md         # Generate missing docs
└── assets/                           # Templates to COPY into user repos
    ├── CONVENTIONS.md                # Language-agnostic starter
    ├── TECH_DEBT.md                  # Debt tracker with promotion rules
    ├── QUALITY_SCORE.md              # Per-module quality baseline
    ├── ARCHITECTURE.md               # matklad-style codemap starter
    ├── CLAUDE_MD.md                  # Map-style CLAUDE.md starter (~100 lines)
    ├── SECURITY.md                   # Security patterns starter (optional)
    ├── FRONTEND.md                   # Frontend patterns starter (optional)
    └── DESIGN.md                     # Design system starter (optional)
```

The skill is invoked by `/setup` during foundations audit and available standalone.

#### C1: `/setup` Foundations Audit

After the existing review agent configuration (Steps 1-5), add:

**Step 6: Foundations Check (optional)**

AskUserQuestion: "Would you like to audit your repo's foundations? Checks CLAUDE.md quality, conventions, tech debt tracking, and more."
- "Yes (Recommended)" -- run `workflows/audit-foundations.md`
- "Skip" -- finish setup

The audit workflow runs through tiers:

**Core tier (always):**
1. CLAUDE.md -- exists? Under 200 lines? Has pointers to `docs/`?
2. docs/CONVENTIONS.md -- exists? Or language-specific equivalent (.rubocop.yml, .eslintrc, pyproject.toml)?
3. docs/TECH_DEBT.md -- exists? Has promotion rules?

**Recommended tier (suggest):**
4. docs/ARCHITECTURE.md -- exists? Is it a codemap or a novel?
5. docs/QUALITY_SCORE.md -- exists? Covers modules?
6. docs/design-docs/ -- exists? Has decision records?
7. docs/plans/ -- exists? Plans have status frontmatter?

**Stack-specific tier (detect project type):**
8. docs/FRONTEND.md -- if project has frontend (package.json, app/javascript/, etc.)
9. docs/SECURITY.md -- if project handles auth, payments, or user data
10. docs/DESIGN.md -- if project has design system (components, tokens, etc.)

Present findings as a scorecard. Offer to generate missing artifacts using templates from `assets/`.

#### C3: `/compound` Promotion Paths

After the existing decision menu (Options 1-7), add:

**Option 8: Promote to convention**
- Check if `docs/CONVENTIONS.md` exists
- If yes: append finding as a new convention entry
- If no: suggest running `/setup` first
- Format: concise rule + rationale + link back to `docs/solutions/` source
- Invokes `workflows/promote-to-convention.md`

**Option 9: Track as tech debt**
- Check if `docs/TECH_DEBT.md` exists
- If yes: add/update entry with occurrence count
- If entry already exists: bump occurrence count
- If occurrences >= 3: suggest "promote to convention" (the loop!)
- Invokes `workflows/track-tech-debt.md`

#### C4: Auto-Promotion Trigger

In `/compound` Step 7 (cross-reference and pattern detection), after checking for similar issues:

If 3+ similar findings exist in `docs/solutions/` for the same pattern:
- Auto-suggest: "This pattern has appeared 3+ times. Consider promoting to a convention."
- Surface Option 8 in the decision menu

This is the mechanical feedback loop trigger. It doesn't auto-promote (user decides) but it surfaces the signal.

#### C6: Clean Up Empty docs/patterns/

The currently empty `docs/patterns/` directory (with empty subdirs hooks/, structures/, transitions/, voice/) is removed. All pattern knowledge lives in the skill's `references/` directory.

## Key Decisions

- **Enhance existing commands, don't add new ones:** Maximum adoption, minimum friction.
- **Convention over configuration:** Files always in `docs/`. No configurable paths. No `foundations:` config block needed.
- **Consistent naming:** `SCREAMING_CASE.md` for single docs, `lowercase/` for collections in `docs/`.
- **Language-agnostic templates:** Artifact generation detects language and generates appropriate content.
- **User decides promotion:** Auto-detection surfaces signals (3+ similar findings), but promotion is always user-initiated.
- **Skill as knowledge layer:** The compound-foundations skill provides depth. Commands provide action.
- **Tiered audit:** Core checks always run. Recommended suggested. Stack-specific detected. Nothing forced.
- **Workflows decouple commands from logic:** `/setup` and `/compound` call skill workflows rather than embedding logic inline.

## Influences

- **matklad ARCHITECTURE.md:** Keep docs short. Answer "where's the thing that does X?" Codemap, not atlas.
- **OpenAI Codex ExecPlans:** Plans are self-contained. Agents are novices. Anchor on observable behavior.
- **OpenAI Harness Engineering:** 10 principles for agent-first repos. Maps not manuals. Feedback loops. Mechanical enforcement.
- **Plugin patterns:** `agent-native-architecture` (14 refs), `create-agent-skills` (13 refs + 10 workflows + 2 templates).

## Open Questions

- Should the CLAUDE.md audit suggest specific improvements or just flag issues?
- Should quality score generation auto-detect test coverage, or just create a manual template?
- How opinionated should generated CONVENTIONS.md be vs. a blank template?

## Next Steps

-> `/workflows:plan` for implementation details (C5 skill first, then C1 setup, then C3-C4 compound, then C6 cleanup).
