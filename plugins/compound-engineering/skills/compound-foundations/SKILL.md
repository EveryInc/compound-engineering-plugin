---
name: compound-foundations
description: Build agent-first repository foundations. Use this skill to audit foundation quality, generate missing artifacts, promote repeated findings into conventions, and track technical debt with promotion rules.
disable-model-invocation: true
---

# Compound Foundations

Compound foundations turns repo hygiene into a compounding loop:

`finding -> solution doc -> convention -> enforcement -> less drift`

Use this skill when you need to improve the repo itself, not just ship one feature.

<essential_principles>
## Essential Principles

1. **Maps, not manuals**: Keep `CLAUDE.md` short and navigable.
2. **Repo as record**: Put operational knowledge in versioned docs.
3. **Plans as artifacts**: Track execution status in files, not memory.
4. **Progressive disclosure**: Start broad, then go deeper by reference.
5. **Mechanical enforcement**: Move recurring guidance into checks.
6. **Agent legibility**: Optimize for searchability and clear boundaries.
7. **Corrections over waiting**: Prefer short loops and fast corrections.
8. **Promotion loop**: Promote repeated findings into conventions.
9. **Entropy management**: Garden docs and debt continuously.
10. **Visibility and tooling**: Instrument quality so drift is observable.
</essential_principles>

<intake>
## What aspect of repo foundations do you need help with?

1. Audit my repo's foundations
2. Learn about a specific principle
3. Generate a missing artifact
4. Promote a finding to convention
5. Track tech debt

Wait for the user's response before continuing.
</intake>

<routing>
## Routing

| User Response | Action |
|---|---|
| `1`, `audit`, `foundations` | Run `workflows/audit-foundations.md` |
| `2`, `learn`, `principle` | Show `reference_index` and open requested reference |
| `3`, `generate`, `artifact` | Run `workflows/generate-artifacts.md` |
| `4`, `promote`, `convention` | Run `workflows/promote-to-convention.md` |
| `5`, `tech debt`, `debt` | Run `workflows/track-tech-debt.md` |

If intent is ambiguous, ask one clarifying question and continue.
</routing>

<reference_index>
## Reference Files

- `references/agent-legibility-checklist.md`
- `references/feedback-loop-patterns.md`
- `references/progressive-disclosure.md`
- `references/mechanical-enforcement.md`
- `references/entropy-management.md`
- `references/repo-as-system-of-record.md`
- `references/plans-as-artifacts.md`
- `references/architecture-docs.md`
- `references/corrections-over-waiting.md`
- `references/visibility-and-tooling.md`
</reference_index>

<workflows_index>
## Workflow Files

- `workflows/audit-foundations.md`
- `workflows/promote-to-convention.md`
- `workflows/track-tech-debt.md`
- `workflows/generate-artifacts.md`
</workflows_index>

<assets_index>
## Asset Templates

- `assets/CONVENTIONS.md`
- `assets/TECH_DEBT.md`
- `assets/QUALITY_SCORE.md`
- `assets/ARCHITECTURE.md`
- `assets/CLAUDE_MD.md`
- `assets/SECURITY.md`
- `assets/FRONTEND.md`
- `assets/DESIGN.md`
</assets_index>

<success_criteria>
## Success Criteria

- [ ] Core foundations are audited (`CLAUDE.md`, `docs/CONVENTIONS.md`, `docs/TECH_DEBT.md`)
- [ ] Missing artifacts are created from templates when requested
- [ ] Promotion suggestions appear when patterns recur (3+)
- [ ] Conventions include rationale and source links
- [ ] Tech debt entries track occurrence counts and status
- [ ] Outputs are language-agnostic and repo-specific
- [ ] User exits with clear next action and updated docs
</success_criteria>
