---
title: "Agentless plugin surface reduction"
date: 2026-06-19
topic: agentless-plugin-surface-reduction
---

# Agentless Plugin Surface Reduction

## Summary

Move Compound Engineering away from standalone plugin agents and toward skill-local subagent prompt assets. Public skills should represent user-facing jobs, not convenience wrappers around specialist agents. Surviving skills that need subagents will dispatch generic subagents using prompt definitions stored inside that skill's own directory, such as `references/agents/*.md` or `references/personas/*.md`.

The goal is maximum deletion: remove redundant public skills, delete `plugins/compound-engineering/agents/`, and make the Codex plugin fully self-contained through native skills rather than a hybrid native-skill plus Bun-installed custom-agent setup.

## Problem Frame

Compound Engineering currently defines specialist behavior in two forms:

- standalone agent files under `plugins/compound-engineering/agents/`
- skill-local prompt/persona files under skill `references/` directories

The standalone-agent model creates portability and install friction. Codex native plugins load the CE skills, but standalone agent registration has required a second Bun install path that converts Claude Markdown agents to Codex TOML agents. That split is brittle, profile-sensitive, and prevents the Codex plugin from behaving as a normal self-contained plugin.

Other plugin ecosystems, including Superpowers, use a cleaner pattern: the skill owns the workflow and carries prompt templates for subagents in its own directory. That gives the skill custom subagent behavior without requiring a platform-level custom-agent registry.

## Decisions

- **Delete standalone CE agents.** Remove `plugins/compound-engineering/agents/` after moving still-needed behavior into surviving skills as local prompt assets.
- **Delete redundant public skills.** Public skills must map to real user jobs. Skills that only make an agent easy to call should be removed.
- **Prefer skill-local duplication over shared agent infrastructure.** Duplicating prompt text across a few skills is acceptable when it removes cross-platform agent registration and makes each skill self-contained.
- **Do not preserve compatibility wrappers.** This migration intentionally uses maximum deletion. Removed skills and agents go into legacy cleanup registries; no deprecated skill stubs or one-release grace wrappers.
- **Keep generic converter support where it serves non-CE plugins.** The CLI may still convert agents for other plugin payloads, but CE-specific Codex installation should no longer require generated custom agents.

## Skill Decisions

### Delete

| Skill | Disposition |
| --- | --- |
| `ce-agent-native-audit` | Delete; fold useful checklist material into `ce-agent-native-architecture` or `ce-code-review` only if needed. |
| `ce-clean-gone-branches` | Delete. |
| `ce-dhh-rails-style` | Delete. |
| `ce-frontend-design` | Delete; salvage durable frontend rules into `ce-work`, `ce-work-beta`, and `ce-polish` where relevant. |
| `ce-gemini-imagegen` | Delete. |
| `ce-release-notes` | Delete. |
| `ce-report-bug` | Delete. |
| `ce-sessions` | Delete as a public product surface; fold discovery/extraction scripts and historian synthesis into `ce-compound` only for compounding/documentation workflows. |
| `ce-slack-research` | Delete; fold Slack research prompts into `ce-brainstorm`, `ce-ideate`, and `ce-plan`. |
| `ce-update` | Delete. |

### Keep

| Skill | Notes |
| --- | --- |
| `ce-agent-native-architecture` | Keep as a domain guide for agent-native systems. |
| `ce-brainstorm` | Keep; localize Slack research prompt. |
| `ce-code-review` | Keep; localize code-review personas. |
| `ce-commit` | Keep. |
| `ce-commit-push-pr` | Keep. |
| `ce-compound` | Keep; absorb session-history workflow. |
| `ce-compound-refresh` | Keep. |
| `ce-debug` | Keep. |
| `ce-demo-reel` | Keep. |
| `ce-doc-review` | Keep; localize document-review personas. |
| `ce-dogfood-beta` | Keep. |
| `ce-ideate` | Keep; localize research prompts. |
| `ce-optimize` | Keep; localize research prompts. |
| `ce-plan` | Keep; localize research and deepening prompts. |
| `ce-polish` | Keep; absorb frontend-design rules where useful. |
| `ce-product-pulse` | Keep. |
| `ce-promote` | Keep. |
| `ce-proof` | Keep. |
| `ce-resolve-pr-feedback` | Keep; localize PR comment resolver prompt. |
| `ce-riffrec-feedback-analysis` | Keep. |
| `ce-setup` | Keep. |
| `ce-simplify-code` | Keep. |
| `ce-strategy` | Keep. |
| `ce-test-browser` | Keep. |
| `ce-test-xcode` | Keep. |
| `ce-work` | Keep; localize Figma/design-sync prompt if still needed. |
| `ce-work-beta` | Keep. |
| `ce-worktree` | Keep. |
| `lfg` | Keep. |

## Agent Decisions

### Preserve as Skill-Local Prompt Assets

| Agent | Destination |
| --- | --- |
| `ce-adversarial-document-reviewer` | `ce-doc-review/references/personas/` |
| `ce-coherence-reviewer` | `ce-doc-review/references/personas/` |
| `ce-design-lens-reviewer` | `ce-doc-review/references/personas/` |
| `ce-feasibility-reviewer` | `ce-doc-review/references/personas/` |
| `ce-product-lens-reviewer` | `ce-doc-review/references/personas/` |
| `ce-scope-guardian-reviewer` | `ce-doc-review/references/personas/` |
| `ce-security-lens-reviewer` | `ce-doc-review/references/personas/` |
| `ce-adversarial-reviewer` | `ce-code-review/references/personas/` |
| `ce-agent-native-reviewer` | `ce-code-review/references/personas/` |
| `ce-api-contract-reviewer` | `ce-code-review/references/personas/` |
| `ce-correctness-reviewer` | `ce-code-review/references/personas/` |
| `ce-julik-frontend-races-reviewer` | `ce-code-review/references/personas/` |
| `ce-maintainability-reviewer` | `ce-code-review/references/personas/` |
| `ce-performance-reviewer` | `ce-code-review/references/personas/` |
| `ce-previous-comments-reviewer` | `ce-code-review/references/personas/` |
| `ce-project-standards-reviewer` | `ce-code-review/references/personas/` |
| `ce-reliability-reviewer` | `ce-code-review/references/personas/` |
| `ce-security-reviewer` | `ce-code-review/references/personas/` |
| `ce-swift-ios-reviewer` | `ce-code-review/references/personas/` |
| `ce-testing-reviewer` | `ce-code-review/references/personas/` |
| `ce-pr-comment-resolver` | `ce-resolve-pr-feedback/references/agents/` |
| `ce-figma-design-sync` | `ce-work/references/agents/` and `ce-work-beta/references/agents/` |
| `ce-session-historian` | `ce-compound/references/agents/`; move supporting scripts from `ce-sessions`. |
| `ce-slack-researcher` | Workflow-tuned local copies in `ce-brainstorm`, `ce-ideate`, and `ce-plan`. |
| `ce-learnings-researcher` | Local copies in `ce-code-review`, `ce-ideate`, `ce-optimize`, and `ce-plan`; slim per workflow if practical. |
| `ce-repo-research-analyst` | Local copies in `ce-plan` and `ce-optimize`. |
| `ce-web-researcher` | Local copies in `ce-plan` and `ce-ideate`. |
| `ce-best-practices-researcher` | Local copies in `ce-plan` and `ce-compound`, or merge with framework-docs prompt where it improves clarity. |
| `ce-framework-docs-researcher` | Local copies in `ce-plan` and `ce-compound`, or merge with best-practices prompt where it improves clarity. |
| `ce-data-migration-reviewer` | Local copies in `ce-code-review` and `ce-plan`. |
| `ce-deployment-verification-agent` | Local copies in `ce-code-review` and `ce-plan`. |
| `ce-data-integrity-guardian` | Local copies in `ce-plan` and `ce-compound`, or merge into nearby data prompts if redundant. |
| `ce-security-sentinel` | Local copies in `ce-plan` and `ce-compound`, or merge into nearby security prompts if redundant. |
| `ce-performance-oracle` | Local copies in `ce-plan` and `ce-compound`, or merge into nearby performance prompts if redundant. |
| `ce-pattern-recognition-specialist` | Local copies in `ce-plan` and `ce-compound`, or fold into repo research/maintainability prompts if redundant. |
| `ce-spec-flow-analyzer` | `ce-plan/references/agents/` |
| `ce-architecture-strategist` | `ce-plan/references/agents/` |
| `ce-git-history-analyzer` | `ce-plan/references/agents/` |
| `ce-issue-intelligence-analyst` | `ce-ideate/references/agents/` |

### Delete

| Agent | Reason |
| --- | --- |
| `ce-ankane-readme-writer` | No runtime consumer. |
| `ce-design-implementation-reviewer` | No runtime consumer. |
| `ce-design-iterator` | Only consumed by deleted `ce-frontend-design`; salvage useful frontend rules elsewhere if needed. |
| `ce-code-simplicity-reviewer` | Delete as a standalone agent; preserve code simplification as an important capability owned by `ce-simplify-code`. |

## Requirements

- R1. No surviving CE skill may dispatch a standalone `ce-*` agent by name.
- R2. Every surviving subagent dispatch must identify a skill-local prompt asset or inline local prompt block as the source of specialist behavior.
- R3. No `plugins/compound-engineering/agents/` directory remains after migration.
- R4. Deleted skills and agents are added to both legacy cleanup registries:
  - `src/utils/legacy-cleanup.ts`
  - `src/data/plugin-legacy-artifacts.ts`
- R5. Plugin README and docs catalogs no longer advertise standalone agents.
- R6. Codex docs no longer require `bunx @every-env/compound-plugin install compound-engineering --to codex` for CE custom agents once CE no longer ships standalone agents.
- R7. CE-specific converter tests are updated so current CE output is skills-only for Codex. Generic non-CE agent conversion coverage may remain.
- R8. `bun run release:validate` passes after manifest, README, and marketplace metadata are updated.
- R9. Behavioral validation for modified skills uses the repo's skill-validation path rather than stale in-session plugin agent dispatch.
- R10. Install documentation is overhauled everywhere it appears, including plugin READMEs, marketplace/catalog README content, and tracked Markdown docs, so users no longer see obsolete custom-agent install guidance.
- R11. `bun test` passes after converter, writer, cleanup, and plugin inventory changes.
- R12. The implementation run is tracked under a single `/goal` objective tied to this requirements doc so long-running work can resume without losing the source of truth.
- R13. High-risk surviving skills produce skill-eval receipts after migration, comparing revised behavior against a pre-migration snapshot where possible.
- R14. Static validation proves there are no surviving CE standalone-agent dependencies: no `plugins/compound-engineering/agents/` directory, no surviving skill dispatches a standalone `ce-*` agent by name, and deleted artifacts are present in both cleanup registries.

## Validation Strategy

Use `/goal` for continuity, not as the proof mechanism. The goal should reference this requirements doc and remain active until implementation, docs, cleanup registries, automated tests, release validation, and eval receipts are complete.

Skill-level evals should use `skill-eval` with `old_skill` baselines for revised skills. Snapshot each target skill before edits when possible, then run the same prompts against the migrated skill and the snapshot. Store artifacts under `/tmp/skill-eval/<skill-name>/<run-id>/` with prompts, transcripts, outputs, grading, benchmark summaries, and review notes.

Minimum eval coverage:

| Skill | Eval purpose |
| --- | --- |
| `ce-code-review` | Prove localized reviewer personas still produce schema-valid, confidence-gated findings on a small diff. |
| `ce-doc-review` | Prove localized document-review personas still classify requirements/plan documents, synthesize findings, and apply safe-auto fixes correctly. |
| `ce-plan` | Prove localized research/deepening prompts still produce a structured plan from a requirements doc without standalone agent dispatch. |
| `ce-compound` | Prove folded session-history support works only inside the compounding workflow and no standalone `ce-sessions` path is required. |
| `ce-brainstorm` | Prove localized Slack research prompt can be invoked as workflow context without the deleted `ce-slack-research` skill. |
| `ce-ideate` | Prove localized research prompts still ground ideas and preserve the expected artifact shape. |
| `ce-optimize` | Prove localized repo/learnings research prompts still support optimization setup without standalone agents. |
| `ce-resolve-pr-feedback` | Prove the localized PR comment resolver prompt still evaluates review feedback and emits actionable resolution guidance. |
| `ce-work` / `ce-work-beta` | Prove any localized Figma/design-sync prompt remains accessible where the work skills need it; explicitly state the stable/beta sync decision. |
| `ce-simplify-code` | Prove code simplification remains available even though `ce-code-simplicity-reviewer` is deleted as a standalone agent. |

Automated validation should include:

- `bun test`
- `bun run release:validate`
- targeted static scans for removed skill names, removed agent names, stale install instructions, and forbidden standalone `ce-*` agent dispatches
- native Codex plugin smoke validation when the local Codex plugin install path is available; otherwise record the unavailable command/tooling as a validation gap

## Open Implementation Notes

- Prefer moving agent bodies mechanically first, then slimming/merging prompts only where the consuming skill's context clearly warrants it.
- For shared prompts, duplication must happen inside each consuming skill directory. Do not create cross-skill shared files.
- The implementation plan should sequence this migration by workflow cluster to keep reviewable diffs:
  1. Delete no-consumer agents and wrapper skills.
  2. Localize `ce-code-review` and `ce-doc-review` personas.
  3. Localize planning/research prompts.
  4. Fold sessions into `ce-compound`.
  5. Localize remaining one-off prompts.
  6. Remove CE standalone agent install assumptions from Codex docs, READMEs, Markdown guides, and tests.
  7. Run static checks, automated tests, release validation, and skill-eval receipts for the high-risk surviving skills.
