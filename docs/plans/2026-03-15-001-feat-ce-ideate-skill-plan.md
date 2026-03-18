---
title: "feat: Add ce:ideate open-ended ideation skill"
type: feat
status: completed
date: 2026-03-15
origin: docs/brainstorms/2026-03-15-ce-ideate-skill-requirements.md
deepened: 2026-03-16
---

# feat: Add ce:ideate open-ended ideation skill

## Overview

Add a new `ce:ideate` skill to the compound-engineering plugin that performs open-ended, divergent-then-convergent idea generation for any project. The skill deeply scans the codebase, generates ~30 ideas, self-critiques and filters them, and presents the top 5-7 as a ranked list with structured analysis. It uses agent intelligence to improve the candidate pool without replacing the core prompt mechanism, writes a durable artifact to `docs/ideation/` after the survivors have been reviewed, and hands off selected ideas to `ce:brainstorm`.

## Problem Frame

The ce:* workflow pipeline has a gap at the very beginning. `ce:brainstorm` requires the user to bring an idea — it refines but doesn't generate. Users who want the AI to proactively suggest improvements must resort to ad-hoc prompting, which lacks codebase grounding, structured output, durable artifacts, and pipeline integration. (see origin: docs/brainstorms/2026-03-15-ce-ideate-skill-requirements.md)

## Requirements Trace

- R1. Standalone skill in `plugins/compound-engineering/skills/ce-ideate/`
- R2. Optional freeform argument as focus hint (concept, path, constraint, or empty)
- R3. Deep codebase scan via research agents before generating ideas
- R4. Preserve the proven prompt mechanism: many ideas first, then brutal filtering, then detailed survivors
- R5. Self-critique with explicit rejection reasoning
- R6. Present top 5-7 with structured analysis (description, rationale, downsides, confidence 0-100%, complexity)
- R7. Rejection summary (one-line per rejected idea)
- R8. Durable artifact in `docs/ideation/YYYY-MM-DD-<topic>-ideation.md`
- R9. Volume overridable via argument
- R10. Handoff: brainstorm an idea, refine, share to Proof, or end session
- R11. Always route to ce:brainstorm for follow-up on selected ideas
- R12. Offer commit on session end
- R13. Resume from existing ideation docs (30-day recency window)
- R14. Present survivors before writing the durable artifact
- R15. Write artifact before handoff/share/end
- R16. Update doc in place on refine when preserving refined state
- R17. Use agent intelligence as support for the core mechanism, not a replacement
- R18. Use research agents for grounding; ideation/critique sub-agents are prompt-defined roles
- R19. Pass grounding summary, focus hint, and volume target to ideation sub-agents
- R20. Focus hints influence both generation and filtering
- R21. Use standardized structured outputs from ideation sub-agents
- R22. Orchestrator owns final scoring, ranking, and survivor decisions
- R23. Use broad prompt-framing methods to encourage creative spread without over-constraining ideation
- R24. Use the smallest useful set of sub-agents rather than a hardcoded fixed count
- R25. Mark ideas as "explored" when brainstormed

## Scope Boundaries

- No external research (competitive analysis, similar projects) in v1 (see origin)
- No configurable depth modes — fixed volume with argument-based override (see origin)
- No modifications to ce:brainstorm — discovery via skill description only (see origin)
- No deprecated `workflows:ideate` alias — the `workflows:*` prefix is deprecated
- No `references/` split — estimated skill length ~300 lines, well under the 500-line threshold

## Context & Research

### Relevant Code and Patterns

- `plugins/compound-engineering/skills/ce-brainstorm/SKILL.md` — Closest sibling. Mirror: resume behavior (Phase 0.1), artifact frontmatter (date + topic), handoff options via platform question tool, document-review integration, Proof sharing
- `plugins/compound-engineering/skills/ce-plan/SKILL.md` — Agent dispatch pattern: `Task compound-engineering:research:repo-research-analyst(context)` running in parallel. Phase 0.2 upstream document detection
- `plugins/compound-engineering/skills/ce-work/SKILL.md` — Session completion: incremental commit pattern, staging specific files, conventional commit format
- `plugins/compound-engineering/skills/ce-compound/SKILL.md` — Parallel research assembly: subagents return text only, orchestrator writes the single file
- `plugins/compound-engineering/skills/document-review/SKILL.md` — Utility invocation: "Load the `document-review` skill and apply it to..." Returns "Review complete" signal
- `plugins/compound-engineering/skills/deepen-plan/SKILL.md` — Broad parallel agent dispatch pattern
- PR #277 (`fix: codex workflow conversion for compound-engineering`) — establishes the Codex model for canonical `ce:*` workflows: prompt wrappers for canonical entrypoints, transformed intra-workflow handoffs, and omission of deprecated `workflows:*` aliases

### Institutional Learnings

- `docs/solutions/plugin-versioning-requirements.md` — Do not bump versions or cut changelog entries in feature PRs. Do update README counts and plugin.json descriptions.
- `docs/solutions/codex-skill-prompt-entrypoints.md` (from PR #277) — for compound-engineering workflows in Codex, prompts are the canonical user-facing entrypoints and copied skills are the reusable implementation units underneath them

## Key Technical Decisions

- **Agent dispatch for codebase scan**: Use `repo-research-analyst` + `learnings-researcher` in parallel (matches ce:plan Phase 1.1). Skip `git-history-analyzer` by default — marginal ideation value for the cost. The focus hint (R2) is passed as context to both agents.
- **Core mechanism first, agents second**: The core design is still the user's proven prompt pattern: generate many ideas, reject aggressively, then explain only the survivors. Agent intelligence improves the candidate pool and critique quality, but does not replace this mechanism.
- **Prompt-defined ideation and critique sub-agents**: Use prompt-shaped sub-agents with distinct framing methods for ideation and optional skeptical critique, rather than forcing reuse of existing named review agents whose purpose is different.
- **Orchestrator-owned synthesis and scoring**: The orchestrator merges and dedupes sub-agent outputs, applies one consistent rubric, and decides final scoring/ranking. Sub-agents may emit lightweight local signals, but not authoritative final rankings.
- **Artifact frontmatter**: `date`, `topic`, `focus` (optional). Minimal, paralleling the brainstorm `date` + `topic` pattern.
- **Volume override via natural language**: The skill instructions tell Claude to interpret number patterns in the argument ("top 3", "100 ideas") as volume overrides. No formal parsing.
- **Artifact timing**: Present survivors first, allow brief questions or lightweight clarification, then write/update the durable artifact before any handoff, Proof share, or session end.
- **No `disable-model-invocation`**: The skill should be auto-loadable when users say things like "what should I improve?", "give me ideas for this project", "ideate on improvements". Following the same pattern as ce:brainstorm.
- **Commit pattern**: Stage only `docs/ideation/<filename>`, use conventional format `docs: add ideation for <topic>`, offer but don't force.
- **Relationship to PR #277**: `ce:ideate` must follow the same Codex workflow model as the other canonical `ce:*` workflows. Why: without #277's prompt-wrapper and handoff-rewrite model, a copied workflow skill can still point at Claude-style slash handoffs that do not exist coherently in Codex. `ce:ideate` should be introduced as another canonical `ce:*` workflow on that same surface, not as a one-off pass-through skill.

## Open Questions

### Resolved During Planning

- **Which agents for codebase scan?** → `repo-research-analyst` + `learnings-researcher`. Rationale: same proven pattern as ce:plan, covers both current code and institutional knowledge.
- **Additional analysis fields per idea?** → Keep as specified in R6. "What this unlocks" bleeds into brainstorm scope. YAGNI.
- **Volume override detection?** → Natural language interpretation. The skill instructions describe how to detect overrides. No formal parsing needed.
- **Artifact frontmatter fields?** → `date`, `topic`, `focus` (optional). Follows brainstorm pattern.
- **Need references/ split?** → No. Estimated ~300 lines, under the 500-line threshold.
- **Need deprecated alias?** → No. `workflows:*` is deprecated; new skills go straight to `ce:*`.
- **How should docs regeneration be represented in the plan?** → The checked-in tree does not currently contain the previously assumed generated files (`docs/index.html`, `docs/pages/skills.html`). Treat `/release-docs` as a repo-maintenance validation step that may update tracked generated artifacts, not as a guaranteed edit to predetermined file paths.
- **How should skill counts be validated across artifacts?** → Do not force one unified count across every surface. The plugin manifests should reflect parser-discovered skill directories, while `plugins/compound-engineering/README.md` should preserve its human-facing taxonomy of workflow commands vs. standalone skills.
- **What is the dependency on PR #277?** → Treat #277 as an upstream prerequisite for Codex correctness. If it merges first, `ce:ideate` should slot into its canonical `ce:*` workflow model. If it does not merge first, equivalent Codex workflow behavior must be included before `ce:ideate` is considered complete.
- **How should agent intelligence be applied?** → Research agents are used for grounding, prompt-defined sub-agents are used to widen the candidate pool and critique it, and the orchestrator remains the final judge.
- **Who should score the ideas?** → The orchestrator, not the ideation sub-agents and not a separate scoring sub-agent by default.
- **When should the artifact be written?** → After the survivors are presented and reviewed enough to preserve, but always before handoff, sharing, or session end.

### Deferred to Implementation

- **Exact wording of the divergent ideation prompt section**: The plan specifies the structure and mechanisms, but the precise phrasing will be refined during implementation. This is an inherently iterative design element.
- **Exact wording of the self-critique instructions**: Same — structure is defined, exact prose is implementation-time.

## Implementation Units

- [x] **Unit 1: Create the ce:ideate SKILL.md**

**Goal:** Write the complete skill definition with all phases, the ideation prompt structure, optional sub-agent support, artifact template, and handoff options.

**Requirements:** R1-R25 (all requirements — this is the core deliverable)

**Dependencies:** None

**Files:**
- Create: `plugins/compound-engineering/skills/ce-ideate/SKILL.md`
- Test (conditional): `tests/claude-parser.test.ts`, `tests/cli.test.ts`

**Approach:**

- Keep this unit primarily content-only unless implementation discovers a real parser or packaging gap. `loadClaudePlugin()` already discovers any `skills/*/SKILL.md`, and most target converters/writers already pass `plugin.skills` through as `skillDirs`.
- Do not rely on pure pass-through for Codex. Because PR #277 gives compound-engineering `ce:*` workflows a canonical prompt-wrapper model in Codex, `ce:ideate` must be validated against that model and may require Codex-target updates if #277 is not already present.
- Treat artifact lifecycle rules as part of the skill contract, not polish: resume detection, present-before-write, refine-in-place, and brainstorm handoff state all live inside this SKILL.md and must be internally consistent.
- Keep the prompt sections grounded in Phase 1 findings so ideation quality does not collapse into generic product advice.
- Keep the user's original prompt mechanism as the backbone of the workflow. Extra agent structure should strengthen that mechanism rather than replacing it.
- When sub-agents are used, keep them prompt-defined and lightweight: shared grounding/focus/volume input, structured output, orchestrator-owned merge/dedupe/scoring.

The skill follows the ce:brainstorm phase structure but with fundamentally different phases:

```
Phase 0: Resume and Route
  0.1 Check docs/ideation/ for recent ideation docs (R13)
  0.2 Parse argument — extract focus hint and any volume override (R2, R9)
  0.3 If no argument, proceed with fully open ideation (no blocking ask)

Phase 1: Codebase Scan
  1.1 Dispatch research agents in parallel (R3):
      - Task compound-engineering:research:repo-research-analyst(focus context)
      - Task compound-engineering:research:learnings-researcher(focus context)
  1.2 Consolidate scan results into a codebase understanding summary

Phase 2: Divergent Generation (R4, R17-R21, R23-R24)
  Core ideation instructions tell Claude to:
  - Generate ~30 ideas (or override amount) as a numbered list
  - Each idea is a one-liner at this stage
  - Push past obvious suggestions — the first 10-15 will be safe/obvious,
    the interesting ones come after
  - Ground every idea in specific codebase findings from Phase 1
  - Ideas should span multiple dimensions where justified
  - If a focus area was provided, weight toward it but don't exclude
    other strong ideas
  - Preserve the user's original many-ideas-first mechanism
  Optional sub-agent support:
  - If the platform supports it, dispatch a small useful set of ideation
    sub-agents with the same grounding summary, focus hint, and volume target
  - Give each one a distinct prompt framing method (e.g. friction, unmet
    need, inversion, assumption-breaking, leverage, extreme case)
  - Require structured idea output so the orchestrator can merge and dedupe
  - Do not use sub-agents to replace the core ideation mechanism

Phase 3: Self-Critique and Filter (R5, R7, R20-R22)
  Critique instructions tell Claude to:
  - Go through each idea and evaluate it critically
  - For each rejection, write a one-line reason
  - Rejection criteria: not actionable, too vague, too expensive relative
    to value, already exists, duplicates another idea, not grounded in
    actual codebase state
  - Target: keep 5-7 survivors (or override amount)
  - If more than 7 pass scrutiny, do a second pass with higher bar
  - If fewer than 5 pass, note this honestly rather than lowering the bar
  Optional critique sub-agent support:
  - Skeptical sub-agents may attack the merged list from distinct angles
  - The orchestrator synthesizes critiques and owns final scoring/ranking

Phase 4: Present Results (R6, R7, R14)
  - Display ranked survivors with structured analysis per idea:
    title, description (2-3 sentences), rationale, downsides,
    confidence (0-100%), estimated complexity (low/medium/high)
  - Display rejection summary: collapsed section, one-line per rejected idea
  - Allow brief questions or lightweight clarification before archival write

Phase 5: Write Artifact (R8, R15, R16)
  - mkdir -p docs/ideation/
  - Write the ideation doc after survivors are reviewed enough to preserve
  - Artifact includes: metadata, codebase context summary, ranked
    survivors with full analysis, rejection summary
  - Always write/update before brainstorm handoff, Proof share, or session end

Phase 6: Handoff (R10, R11, R12, R15-R16, R25)
  6.1 Present options via platform question tool:
      - Brainstorm an idea (pick by number → feeds to ce:brainstorm) (R11)
      - Refine (R15)
      - Share to Proof
      - End session (R12)
  6.2 Handle selection:
      - Brainstorm: update doc to mark idea as "explored" (R16),
        then invoke ce:brainstorm with the idea description
      - Refine: ask what kind of refinement, then route:
        "add more ideas" / "explore new angles" → return to Phase 2
        "re-evaluate" / "raise the bar" → return to Phase 3
        "dig deeper on idea #N" → expand that idea's analysis in place
        Update doc after each refinement when preserving the refined state (R16)
      - Share to Proof: upload ideation doc using the standard
        curl POST pattern (same as ce:brainstorm), return to options
      - End: offer to commit the ideation doc (R12), display closing summary
```

Frontmatter:
```yaml
---
name: ce:ideate
description: 'Generate and critically evaluate improvement ideas for any project through deep codebase analysis and divergent-then-convergent thinking. Use when the user says "what should I improve", "give me ideas", "ideate", "surprise me with improvements", "what would you change about this project", or when they want AI-generated project improvement suggestions rather than refining their own idea.'
argument-hint: "[optional: focus area, path, or constraint]"
---
```

Artifact template:
```markdown
---
date: YYYY-MM-DD
topic: <kebab-case-topic>
focus: <focus area if provided, omit if open>
---

# Ideation: <Topic or "Open Exploration">

## Codebase Context
[Brief summary of what the scan revealed — project structure, patterns, pain points, opportunities]

## Ranked Ideas

### 1. <Idea Title>
**Description:** [2-3 sentences]
**Rationale:** [Why this would be a good improvement]
**Downsides:** [Risks or costs]
**Confidence:** [0-100%]
**Complexity:** [Low / Medium / High]

### 2. <Idea Title>
...

## Rejection Summary
| # | Idea | Reason for Rejection |
|---|------|---------------------|
| 1 | ... | ... |

## Session Log
- [Date]: Initial ideation — [N] generated, [M] survived
```

**Patterns to follow:**
- ce:brainstorm SKILL.md — phase structure, frontmatter style, argument handling, resume pattern, handoff options, Proof sharing, interaction rules
- ce:plan SKILL.md — agent dispatch syntax (`Task compound-engineering:research:*`)
- ce:work SKILL.md — session completion commit pattern
- Plugin CLAUDE.md — skill compliance checklist (imperative voice, cross-platform question tool, no second person)

**Test scenarios:**
- Invoke with no arguments → fully open ideation, generates ideas, presents survivors, then writes artifact when preserving results
- Invoke with focus area (`/ce:ideate DX improvements`) → weighted ideation toward focus
- Invoke with path (`/ce:ideate plugins/compound-engineering/skills/`) → scoped scan
- Invoke with volume override (`/ce:ideate give me your top 3`) → adjusted volume
- Resume: invoke when recent ideation doc exists → offers to continue or start fresh
- Resume + refine loop: revisit an existing ideation doc, add more ideas, then re-run critique without creating a duplicate artifact
- If sub-agents are used: each receives grounding + focus + volume context and returns structured outputs for orchestrator merge
- If critique sub-agents are used: orchestrator remains final scorer and ranker
- Brainstorm handoff: pick an idea → doc updated with "explored" marker, ce:brainstorm invoked
- Refine: ask to dig deeper → doc updated in place with refined analysis
- End session: offer commit → stages only the ideation doc, conventional message
- Initial review checkpoint: survivors can be questioned before archival write
- Codex install path after PR #277: `ce:ideate` is exposed as the canonical `ce:ideate` workflow entrypoint, not only as a copied raw skill
- Codex intra-workflow handoffs: any copied `SKILL.md` references to `/ce:*` routes resolve to the canonical Codex prompt surface, and no deprecated `workflows:ideate` alias is emitted

**Verification:**
- SKILL.md is under 500 lines
- Frontmatter has `name`, `description`, `argument-hint`
- Description includes trigger phrases for auto-discovery
- All 25 requirements are addressed in the phase structure
- Writing style is imperative/infinitive, no second person
- Cross-platform question tool pattern with fallback
- No `disable-model-invocation` (auto-loadable)
- The repository still loads plugin skills normally because `ce:ideate` is discovered as a `skillDirs` entry
- Codex output follows the compound-engineering workflow model from PR #277 for this new canonical `ce:*` workflow

---

- [x] **Unit 2: Update plugin metadata and documentation**

**Goal:** Update all locations where component counts and skill listings appear.

**Requirements:** R1 (skill exists in the plugin)

**Dependencies:** Unit 1

**Files:**
- Modify: `plugins/compound-engineering/.claude-plugin/plugin.json` — update description with new skill count
- Modify: `.claude-plugin/marketplace.json` — update plugin description with new skill count
- Modify: `plugins/compound-engineering/README.md` — add ce:ideate to skills table/list, update count

**Approach:**
- Count actual skill directories after adding ce:ideate for manifest-facing descriptions (`plugin.json`, `.claude-plugin/marketplace.json`)
- Preserve the README's separate human-facing breakdown of `Commands` vs `Skills` instead of forcing it to equal the manifest-level skill-directory count
- Add ce:ideate to the README skills section with a brief description in the existing table format
- Do NOT bump version numbers (per plugin versioning requirements)
- Do NOT add a CHANGELOG.md release entry

**Patterns to follow:**
- CLAUDE.md checklist: "Updating the Compounding Engineering Plugin"
- Existing skill entries in README.md for description format
- `src/parsers/claude.ts` loading model: manifests and targets derive skill inventory from discovered `skills/*/SKILL.md` directories

**Test scenarios:**
- Manifest descriptions reflect the post-change skill-directory count
- README component table and skill listing stay internally consistent with the README's own taxonomy
- JSON files remain valid
- README skill listing includes ce:ideate

**Verification:**
- `grep -o "Includes [0-9]* specialized agents" plugins/compound-engineering/.claude-plugin/plugin.json` matches actual agent count
- Manifest-facing skill count matches the number of skill directories under `plugins/compound-engineering/skills/`
- README counts and tables are internally consistent, even if they intentionally differ from manifest-facing skill-directory totals
- `jq . < .claude-plugin/marketplace.json` succeeds
- `jq . < plugins/compound-engineering/.claude-plugin/plugin.json` succeeds

---

- [x] **Unit 3: Refresh generated docs artifacts if the local docs workflow produces tracked changes**

**Goal:** Keep generated documentation outputs in sync without inventing source-of-truth files that are not present in the current tree.

**Requirements:** R1 (skill visible in docs)

**Dependencies:** Unit 2

**Files:**
- Modify (conditional): tracked files under `docs/` updated by the local docs release workflow, if any are produced in this checkout

**Approach:**
- Run the repo-maintenance docs regeneration workflow after the durable source files are updated
- Review only the tracked artifacts it actually changes instead of assuming specific generated paths
- If the local docs workflow produces no tracked changes in this checkout, stop without hand-editing guessed HTML files

**Patterns to follow:**
- CLAUDE.md: "After ANY change to agents, commands, skills, or MCP servers, run `/release-docs`"

**Test scenarios:**
- Generated docs, if present, pick up ce:ideate and updated counts from the durable sources
- Docs regeneration does not introduce unrelated count drift across generated artifacts

**Verification:**
- Any tracked generated docs diffs are mechanically consistent with the updated plugin metadata and README
- No manual HTML edits are invented for files absent from the working tree

## System-Wide Impact

- **Interaction graph:** `ce:ideate` sits before `ce:brainstorm` and calls into `repo-research-analyst`, `learnings-researcher`, the platform question tool, optional Proof sharing, and optional local commit flow. The plan has to preserve that this is an orchestration skill spanning multiple existing workflow seams rather than a standalone document generator.
- **Error propagation:** Resume mismatches, write-before-present failures, or refine-in-place write failures can leave the ideation artifact out of sync with what the user saw. The skill should prefer conservative routing and explicit state updates over optimistic wording.
- **State lifecycle risks:** `docs/ideation/` becomes a new durable state surface. Topic slugging, 30-day resume matching, refinement updates, and the "explored" marker for brainstorm handoff need stable rules so repeated runs do not create duplicate or contradictory ideation records.
- **API surface parity:** Most targets can continue to rely on copied `skillDirs`, but Codex is now a special-case workflow surface for compound-engineering because of PR #277. `ce:ideate` needs parity with the canonical `ce:*` workflow model there: explicit prompt entrypoint, rewritten intra-workflow handoffs, and no deprecated alias duplication.
- **Integration coverage:** Unit-level reading of the SKILL.md is not enough. Verification has to cover end-to-end workflow behavior: initial ideation, artifact persistence, resume/refine loops, and handoff to `ce:brainstorm` without dropping ideation state.

## Risks & Dependencies

- **Divergent ideation quality is hard to verify at planning time**: The self-prompting instructions for Phase 2 and Phase 3 are the novel design element. Their effectiveness depends on exact wording and how well Phase 1 findings are fed back into ideation. Mitigation: verify on the real repo with open and focused prompts, then tighten the prompt structure only where groundedness or rejection quality is weak.
- **Artifact state drift across resume/refine/handoff**: The feature depends on updating the same ideation doc repeatedly. A weak state model could duplicate docs, lose "explored" markers, or present stale survivors after refinement. Mitigation: keep one canonical ideation file per session/topic and make every refine/handoff path explicitly update that file before returning control.
- **Count taxonomy drift across docs and manifests**: This repo already uses different count semantics across surfaces. A naive "make every number match" implementation could either break manifest descriptions or distort the README taxonomy. Mitigation: validate each artifact against its own intended counting model and document that distinction in the plan.
- **Dependency on PR #277 for Codex workflow correctness**: `ce:ideate` is another canonical `ce:*` workflow, so its Codex install surface should not regress to the old copied-skill-only behavior. Mitigation: land #277 first or explicitly include the same Codex workflow behavior before considering this feature complete.
- **Local docs workflow dependency**: `/release-docs` is a repo-maintenance workflow, not part of the distributed plugin. Its generated outputs may differ by environment or may not produce tracked files in the current checkout. Mitigation: treat docs regeneration as conditional maintenance verification after durable source edits, not as the primary source of truth.
- **Skill length**: Estimated ~300 lines. If the ideation and self-critique instructions need more detail, the skill could approach the 500-line limit. Mitigation: monitor during implementation and split to `references/` only if the final content genuinely needs it.

## Documentation / Operational Notes

- README.md gets updated in Unit 2
- Generated docs artifacts are refreshed only if the local docs workflow produces tracked changes in this checkout
- The local `release-docs` workflow exists as a Claude slash command in this repo, but it was not directly runnable from the shell environment used for this implementation pass
- No CHANGELOG entry for this PR (per versioning requirements)
- No version bumps (automated release process handles this)

## Sources & References

- **Origin document:** [docs/brainstorms/2026-03-15-ce-ideate-skill-requirements.md](docs/brainstorms/2026-03-15-ce-ideate-skill-requirements.md)
- Related code: `plugins/compound-engineering/skills/ce-brainstorm/SKILL.md`, `plugins/compound-engineering/skills/ce-plan/SKILL.md`, `plugins/compound-engineering/skills/ce-work/SKILL.md`
- Related institutional learning: `docs/solutions/plugin-versioning-requirements.md`
- Related PR: #277 (`fix: codex workflow conversion for compound-engineering`) — upstream Codex workflow model this plan now depends on
- Related institutional learning: `docs/solutions/codex-skill-prompt-entrypoints.md`
