# PM Analysis: Smart-Ralph Command Scaffolding Improvements

**Author:** agent-foreman:pm
**Date:** 2026-02-09
**Plugin:** compound-engineering v2.x (24 commands, 29 agents, 18 skills, 0 hooks)

---

## Product Analysis

### Current State Assessment

The compound-engineering plugin has grown organically to 24 commands across two directories (`commands/` and `commands/workflows/`). While the command set is functionally rich -- spanning planning, execution, review, testing, documentation, and meta-tooling -- the scaffolding quality is inconsistent:

- **Frontmatter completeness varies widely.** 14/24 commands have `disable-model-invocation: true`, but 10 do not, including manual-only candidates like `feature-video`, `resolve_todo_parallel`, `test-browser`, and all 5 workflow commands. Only 1 command (`deploy-docs.md`) is missing `argument-hint`. Only 2/24 use `allowed-tools` to scope permissions.
- **No input validation.** Commands accept `$ARGUMENTS` but never validate them before executing multi-step workflows. A missing PR number in `/test-browser` silently cascades through git and gh CLI calls.
- **No CI for commands themselves.** The CI pipeline (`ci.yml`) runs `bun test` but does not validate command markdown files -- no YAML frontmatter lint, no field completeness checks, no broken-reference detection.
- **Fire-and-forget workflows.** The 5 core workflow commands (plan, work, review, compound, brainstorm) lack AskUserQuestion gates for scope/agent selection (plan.md partially uses it for idea refinement, but not for research depth or plan detail level decisions).
- **No persistent state.** The Plan-Work-Review-Compound lifecycle is inherently stateful but runs in a single session with no checkpoint/resume capability. Session crashes or context window exhaustion (the known v2.25.0 316% context consumption issue) means starting over.
- **Zero hooks.** No PreToolUse or PostToolUse safety guardrails exist. Commands like `lfg` and `slfg` chain destructive operations (git add ., git push, PR creation) without confirmation gates.
- **Stale `/reproduce-bug`.** References removed Playwright MCP tools (`mcp__plugin_compound-engineering_pw__*`) throughout Phase 2. The rest of the codebase has already migrated to `agent-browser` CLI.
- **Inconsistent model invocation flags.** 10 commands are invocable by the model when they should not be, wasting context budget when Claude auto-loads their instructions.

### User Pain Points (Ranked)

1. **Context budget waste** -- Model-invocable commands that should not be inflate context, directly contributing to the 316% bloat issue.
2. **Silent failures** -- No argument validation means users get cryptic errors deep in workflows instead of clear early messages.
3. **Non-resumable workflows** -- Losing a 30-minute planning session to a crash with no way to resume.
4. **Stale tooling** -- `/reproduce-bug` fails entirely because it calls removed MCP tools.
5. **No safety net** -- Destructive git operations run without confirmation.

---

## Research Findings

### Claude Code Plugin Best Practices (2025-2026)

**Frontmatter fields are the primary control surface.** The official Claude Code docs define `argument-hint`, `disable-model-invocation`, `allowed-tools`, `model`, and `user-invocable` as the five key frontmatter fields. Best practice is to treat every field as intentional: if a command is manual-only, it must have `disable-model-invocation: true` to prevent the model from auto-loading its full instruction text into context. ([Slash commands - Claude Code Docs](https://code.claude.com/docs/en/slash-commands); [DevelopersIO: disable-model-invocation](https://dev.classmethod.jp/en/articles/disable-model-invocation-claude-code/))

**AskUserQuestion enables spec-based development.** The recommended pattern is a multi-round interview (5-10 questions) before execution, with sensible defaults and multiple-choice options. This front-loads clarification and produces better-aligned results. The feature-interview skill pattern (ask questions, build spec, then execute) is now considered best practice. ([Claude Code Skills Examples: Using AskUserQuestion](https://www.neonwatty.com/posts/interview-skills-claude-code/); [egghead.io: AskUserQuestion](https://egghead.io/create-interactive-ai-tools-with-claude-codes-ask-user-question~b47wn))

**PreToolUse hooks are the primary safety mechanism.** Hooks can allow, deny, or ask for permission before tool execution. They can also modify tool inputs (since v2.0.10). Common patterns include blocking edits to sensitive files, preventing destructive commands, and enforcing team conventions. Hooks can be defined in skill/agent frontmatter or globally in `.claude/settings.json`. ([Building Guardrails for AI Coding Assistants](https://dev.to/mikelane/building-guardrails-for-ai-coding-assistants-a-pretooluse-hook-system-for-claude-code-ilj); [Hooks reference - Claude Code Docs](https://code.claude.com/docs/en/hooks); [paddo.dev: Claude Code Hooks](https://paddo.dev/blog/claude-code-hooks-guardrails/))

**Workflow state persistence is an industry trend.** Leading AI coding tools now support checkpoint-based state management for resumable workflows, worktree-based parallel development, and persistent memory across sessions. Developers explicitly want agents that "remember past decisions and recognize patterns from previous work." ([Addy Osmani: My LLM coding workflow going into 2026](https://addyosmani.com/blog/ai-coding-workflow/); [RedMonk: 10 Things Developers Want from Agentic IDEs](https://redmonk.com/kholterhoff/2025/12/22/10-things-developers-want-from-their-agentic-ides-in-2025/))

**CLI input validation is table-stakes UX.** Interactive CLI tools should constrain user choices to prevent mistakes, validate input as it arrives, and provide clear error messages with fix instructions. ([UX patterns for CLI tools](https://www.lucasfcosta.com/blog/ux-patterns-cli-tools); [Agent UX Guardrails](https://llms.zypsy.com/agent-ux-guardrails))

---

## Priority Matrix

| # | Improvement Area | User Impact | Effort | Risk | Priority |
|---|---|---|---|---|---|
| 8 | Audit `disable-model-invocation` flags | **Critical** -- directly fixes context budget bloat (316% issue) | **Low** -- 10 frontmatter edits | **Very Low** -- additive-only, no behavior change for users | **P0** |
| 1 | Add `argument-hint` to all commands + flag audit | **High** -- improves discoverability and autocomplete | **Low** -- 1 missing hint + overlaps with #8 | **Very Low** | **P0** (merge with #8) |
| 7 | Fix stale `/reproduce-bug` command | **High** -- command is completely broken | **Low** -- replace MCP tool refs with agent-browser CLI calls (pattern already exists in `test-browser.md` and `feature-video.md`) | **Low** -- localized change | **P1** |
| 2 | Add input validation patterns | **High** -- eliminates silent cascading failures | **Medium** -- needs bash pre-check templates for each command | **Low** -- validation only rejects bad input, never changes good input | **P1** |
| 6 | Add hooks directory with safety guardrails | **High** -- prevents destructive operations without confirmation | **Medium** -- needs hook scripts + settings.json config | **Medium** -- poorly designed hooks can block legitimate operations | **P1** |
| 3 | Add command validation CI | **Medium** -- catches drift/breakage at PR time | **Medium** -- YAML validation script + GH Action + field schema | **Low** -- CI is read-only | **P2** |
| 4 | Add `AskUserQuestion` interactive patterns | **Medium** -- improves alignment on scope before expensive operations | **Medium-High** -- needs careful UX design per command | **Medium** -- over-questioning slows power users | **P2** |
| 5 | Add `.local.md` workflow state management | **Medium-High** -- enables resumable workflows | **High** -- needs state schema design, write/read logic, cleanup lifecycle | **High** -- state corruption, stale state, merge conflicts | **P3** |

### Priority Rationale

**P0 (Do First):** Areas 1 and 8 are essentially the same work -- fixing frontmatter fields. Combined, they are 10-15 minutes of editing with immediate measurable impact on context budget. Zero risk.

**P1 (Do Next):** Area 7 is a broken command with a clear fix pattern (copy from `test-browser.md`). Area 2 catches errors early. Area 6 adds safety nets. All are medium effort with high confidence.

**P2 (Do After):** Areas 3 and 4 are infrastructure and UX improvements that prevent future regression and improve alignment, but are not blocking current users.

**P3 (Do Last):** Area 5 is the most ambitious. Workflow state management requires careful design and carries the highest risk of introducing bugs. It should wait until the foundation (P0-P2) is solid.

---

## Scope Decisions

### IN Scope

| Area | What's Included |
|---|---|
| **#1 + #8: Frontmatter audit** | Add `argument-hint` to `deploy-docs.md`. Add `disable-model-invocation: true` to the 10 missing commands: `deepen-plan`, `feature-video`, `resolve_todo_parallel`, `test-browser`, `workflows:brainstorm`, `workflows:compound`, `workflows:plan`, `workflows:review`, `workflows:work`. Audit each command individually -- some workflow commands (plan, brainstorm) may legitimately need to remain model-invocable if they serve as entry points for agent orchestration. |
| **#7: Fix reproduce-bug** | Replace all `mcp__plugin_compound-engineering_pw__*` references with `agent-browser` CLI equivalents. Follow the pattern established in `test-browser.md`. |
| **#2: Input validation** | Add bash pre-checks to commands that accept arguments: file existence for plan paths, numeric validation for PR numbers, branch existence for git operations. Template pattern that can be reused across commands. |
| **#6: Safety hooks** | PreToolUse hooks for: `rm -rf` prevention, `.env` file protection, `git push --force` blocking, `git reset --hard` blocking. Start with a global hooks config, not per-command. |
| **#3: Command validation CI** | GitHub Action that validates all 24 command files: YAML frontmatter parses correctly, required fields present (`name`, `description`, `argument-hint`), no broken tool/agent references. |
| **#4: AskUserQuestion patterns** | Add interactive scope selection to `workflows:work` (plan selection), `workflows:review` (review depth), and `workflows:compound` (solution categorization). Do NOT add to `lfg`/`slfg` (they are intentionally autonomous). |
| **#5: State management** | Design the `.local.md` schema and implement for `workflows:plan` only as a proof of concept. Write state on plan completion; read state on plan resume. |

### OUT of Scope

| Item | Reason |
|---|---|
| Adding `model` field to commands | No commands currently need model pinning. The `triage.md` command mentions "set /model to Haiku" in its body, but this is a user instruction, not a frontmatter field. Model pinning should be a separate decision. |
| Adding `allowed-tools` to all commands | Only 2 commands currently use it (`create-agent-skill.md`, `heal-skill.md`). Broad adoption needs a per-command security audit that is not in this scope. |
| Rewriting command content/instructions | This effort is about scaffolding (frontmatter, validation, hooks), not command behavior. |
| MCP server changes | No MCP server modifications are needed for these improvements. |
| New commands or agents | This is a quality improvement, not a feature addition. |
| Documentation site updates | Will be handled by `/release-docs` after implementation. |

---

## Risks & Mitigations

### Risk 1: Over-restricting model invocation breaks agent orchestration

**Risk Level:** Medium
**Description:** Some commands (like `workflows:plan`) may be invoked by agents in orchestration chains (e.g., `lfg.md` calls `/workflows:plan`). Adding `disable-model-invocation: true` could break these chains.
**Mitigation:** Verify each command's invocation context before adding the flag. Commands called via explicit `/slash-command` syntax in other commands will still work even with `disable-model-invocation: true` -- this flag only prevents the model from auto-loading the command into context, not from invoking it via slash syntax. Test `lfg` and `slfg` chains after changes.

### Risk 2: Input validation rejects valid edge cases

**Risk Level:** Low
**Description:** Overly strict validation (e.g., requiring numeric PR numbers) could reject valid inputs like "current" or branch names.
**Mitigation:** Validation should be permissive with type-specific checks: if argument looks numeric, validate as PR number; if it looks like a path, check file existence; if it looks like a branch, check git refs. Always provide a clear error message with the expected format.

### Risk 3: Safety hooks block legitimate developer workflows

**Risk Level:** Medium
**Description:** PreToolUse hooks that block `rm -rf` or `git push --force` could frustrate experienced developers who know what they are doing.
**Mitigation:** Hooks should use the "ask" decision (prompt for confirmation) rather than "deny" (hard block) for most operations. Only hard-block truly catastrophic operations like `rm -rf /` or `git push --force origin main`. Provide a documented override mechanism.

### Risk 4: State management introduces stale/corrupt state bugs

**Risk Level:** High
**Description:** `.local.md` files could become stale (plan changed but state not updated), corrupted (partial writes), or cause confusion (multiple state files for different features).
**Mitigation:** Start with a single command (plan) as proof of concept. Use timestamp-based staleness detection. Include a "discard state and start fresh" option. State files should be in `.gitignore` and clearly marked as ephemeral.

### Risk 5: CI validation creates false positives on valid command patterns

**Risk Level:** Low
**Description:** YAML validation might reject valid frontmatter patterns or custom fields.
**Mitigation:** Use a schema that only requires known fields (`name`, `description`) and warns (not fails) on missing optional fields like `argument-hint`. Allow unknown fields for forward compatibility.

---

## Success Metrics

### Quantitative

| Metric | Current | Target | How to Measure |
|---|---|---|---|
| Commands with `argument-hint` | 23/24 (96%) | 24/24 (100%) | `grep -c 'argument-hint' commands/**/*.md` |
| Commands with `disable-model-invocation` (where appropriate) | 14/24 (58%) | 22-24/24 (92-100%) | Frontmatter audit |
| Context budget consumed by auto-loaded commands | ~316% (v2.25.0 report) | <150% | Measure before/after with Claude Code diagnostics |
| Commands with input validation | 0/24 (0%) | 12/24 (50%) minimum -- all commands accepting arguments | Manual audit |
| Broken tool references | 1 command (`reproduce-bug`) | 0 | CI validation script |
| Safety hooks configured | 0 | 4+ (rm -rf, .env, force push, hard reset) | Hook count in settings |
| CI command validation coverage | 0% | 100% of command files | GitHub Action pass rate |

### Qualitative

| Metric | How to Assess |
|---|---|
| Reduced user frustration from silent failures | User reports of "command didn't work but no error" decrease |
| Faster onboarding for new plugin users | New users can discover commands via argument-hints and don't trigger broken commands |
| Confidence in destructive operations | Users report feeling safer knowing hooks catch mistakes |
| Workflow resumability | Users can resume interrupted plan/work sessions (P3 metric -- future) |

### Ship Milestones

| Phase | Deliverable | Definition of Done |
|---|---|---|
| **Phase 1 (P0)** | Frontmatter audit complete | All 24 commands have `argument-hint`. All manual-only commands have `disable-model-invocation: true`. Context budget measurably reduced. |
| **Phase 2 (P1)** | Fix reproduce-bug + input validation + hooks | `/reproduce-bug` works with agent-browser. 12+ commands validate input. 4+ safety hooks active. |
| **Phase 3 (P2)** | CI validation + AskUserQuestion patterns | CI catches frontmatter errors on PRs. 3+ workflow commands have interactive scope selection. |
| **Phase 4 (P3)** | State management POC | `workflows:plan` writes and reads `.local.md` state. Users can resume interrupted plans. |

---

## Questions & Answers

### Q1: Should workflow commands get `disable-model-invocation: true`?
**Answer**: Add flag to all 5 workflow commands (plan, work, review, brainstorm, compound)
**Impact**: Maximum context budget savings. lfg/slfg chains use explicit `/slash-command` invocation which still works with the flag. All 5 workflow commands move from model-invocable to manual-only.

### Q2: Hook decision mode for destructive git operations?
**Answer**: "ask" for all operations (user confirms each time)
**Impact**: All destructive git operations (force push, hard reset, rm -rf, .env edits) will prompt for user confirmation. No hard blocks. This is more permissive than the recommended option but gives users full control.

### Q3: Should `/workflows:work` get an interactive plan picker?
**Answer**: Lightweight prompt when empty — "No plan specified. Recent plans: [list]. Which one?" only when $ARGUMENTS is empty
**Impact**: Fast path (argument provided) remains unchanged. Only adds interaction when no argument given. Matches "start fast, execute faster" principle.

### Q4: State management file structure?
**Answer**: Hybrid per-feature — single `.feature-name.local.md` with per-command sections inside
**Impact**: One file per feature tracks the full plan→work→review→compound lifecycle. Each command writes to its own section. Easier to reason about than 4 separate files per feature.

### Q5: Ship strategy?
**Answer**: Ship all 4 phases together as one release
**Impact**: Single version bump, one review cycle. All improvements land together. More testing needed but cleaner release.
