---
id: spec.OVERVIEW
version: 1
origin: spec-workflow
date: 2026-02-09
status: active
tags: [smart-ralph, compound-engineering]
---
# Smart-Ralph Command Scaffolding Improvements -- Overview

## Executive Summary

The compound-engineering plugin (v2.31.0) has grown to 24 commands, 29 agents, 18 skills, and 0 hooks. While functionally rich, the scaffolding quality is inconsistent: 10 commands lack `disable-model-invocation: true` (contributing to 316% context budget bloat), zero commands validate input arguments, no CI validates command files, no hooks provide safety guardrails, the `reproduce-bug` command references removed Playwright MCP tools, workflow commands lack interactive scope selection, and no persistent state exists for resumable workflows.

This initiative applies 8 improvement areas across 4 priority phases, shipping as a single release. The changes are additive-only -- no command instructions are rewritten. The total scope is 17 files touched (13 modified command files, 1 new test file, 3 new hook files), with an estimated 5-8 hours of implementation and 3-4.5 hours of QA.

## Module Summaries

**Module 1: frontmatter-audit (P0)** -- Add `disable-model-invocation: true` to 10 commands missing it and `argument-hint` to the 1 command missing it (`deploy-docs.md`). This is the highest-impact, lowest-effort change: 11 single-line YAML edits that directly reduce context budget consumption. All 5 workflow commands plus 4 utility commands get the flag. The `disable-model-invocation` flag prevents the model from auto-loading command instructions into context while still allowing explicit `/slash-command` invocation from `lfg`/`slfg` chains.

**Module 2: reproduce-bug-fix (P1)** -- Rewrite Phase 2 of `reproduce-bug.md` to replace all 6 stale `mcp__plugin_compound-engineering_pw__*` references with `agent-browser` CLI equivalents. The command is currently completely broken. The fix follows the established pattern from `test-browser.md` and `feature-video.md`, adding a critical header, prerequisites section, and CLI reference. The `browser_console_messages` call has no direct equivalent and gets a snapshot-based workaround.

**Module 3: input-validation (P1)** -- Add instructional validation sections to `work.md` (plan file path), `review.md` (PR number/branch/URL), and `reproduce-bug.md` (issue number). Validation happens as markdown instructions that Claude follows before proceeding, using bash pre-checks. All error messages follow the three-part What/Why/Fix format. Validation is permissive -- it infers argument type from format and only fails when no reasonable interpretation exists.

**Module 4: hooks (P1)** -- Create the plugin's first hooks directory with `hooks.json` configuration and two PreToolUse bash scripts: `validate-bash.sh` (catches `git push --force`, `git reset --hard`, dangerous `rm -rf` patterns) and `protect-env-files.sh` (catches edits to `.env`, `.pem`, `.key`, credentials, and secret files). All hooks use "ask" mode except catastrophic `rm -rf /` / `rm -rf ~` which hard-deny. Safe targets (node_modules, .cache, tmp) silently pass.

**Module 5: ci-validation (P2)** -- Create `tests/command-validation.test.ts` and `tests/hook-scripts.test.ts` that run as part of existing `bun test` CI. Command validation checks YAML frontmatter parsing, required fields (name, description), expected fields (argument-hint, disable-model-invocation with escape hatch), and removed tool reference patterns in command bodies. Hook tests pipe mock JSON into bash scripts via `Bun.spawn()` and assert on exit codes and JSON output (24 test cases total).

**Module 6: interactive-patterns (P2)** -- Add AskUserQuestion interactive flows to three commands: `work.md` gets a plan picker (5 plans, state-first sort), `review.md` gets a target selector (auto-detects current branch/PR), and `compound.md` gets a category confirmation after auto-classification. All flows bypass when `$ARGUMENTS` is non-empty (autonomous mode from `lfg`/`slfg` chains). No review depth selector -- comprehensive review is the default. Plan command gets L1/L2/L3 layer detection refinement.

**Module 7: state-management (P3)** -- Implement `.local.md` state files for workflow resumability. `plan.md` gets a State Checkpoint section that writes `.{feature-slug}.local.md` after plan completion. `work.md` gets a State Discovery section that finds matching state files, shows a resume prompt with staleness detection (7-day warning, 30-day suggest-fresh), and supports branch divergence checks. Files are gitignored, automatically created with announcement, and deleted on `compound` completion.

**Module 8: integration-testing (always last)** -- Manual regression tests for `lfg` and `slfg` chains to verify that all changes (frontmatter flags, AskUserQuestion gates, hooks) don't break autonomous orchestration. Includes full chain execution (20-60 min each), hook behavior verification during chains, and context budget measurement (must not regress, target <150%). Manual now, automate later when Claude Code headless mode stabilizes.

## Key Decisions

### Scope Decisions
| Decision | Answer | Source |
|----------|--------|--------|
| All 5 workflow commands get `disable-model-invocation: true` | Yes | PM Q1 |
| All 4 phases ship together as one release | Yes | PM Q5 |

### UX Decisions
| Decision | Answer | Source |
|----------|--------|--------|
| Autonomous chain detection | Infer from `$ARGUMENTS` presence | UX Q1 |
| Hook scope for subagents | Fire for all operations | UX Q2 |
| State file naming | Plan filename slug, branch cross-ref inside file | UX Q3 |
| Error message verbosity | Always What/Why/Fix (3-part) | UX Q4 |
| Plan picker | 5 plans, state-first sort | UX Q5 |
| No review depth selector | Comprehensive is the default | UX Flow 2 |

### Technical Decisions
| Decision | Answer | Source |
|----------|--------|--------|
| CI severity for `disable-model-invocation` | Hard fail + `# ci-allow: model-invocation` escape hatch | TECH Q1 |
| rm pattern scope | Only `rm -rf` and `rm -fr` (not `rm -r`) | TECH Q2 |
| Secrets file protection scope | `.env*`, `*.pem`, `*.key`, `*credentials*`, `*secret*.json/yml` | TECH Q3 |
| CI body content scanning | Frontmatter + removed pattern body scan | TECH Q4 |
| State file creation mode | Automatic with announcement | TECH Q5 |

### Quality Decisions
| Decision | Answer | Source |
|----------|--------|--------|
| Hook script testing | Bun spawning bash (no BATS dependency) | QA Q1 |
| lfg/slfg regression testing | Manual now, automate later | QA Q2 |
| Context budget gate | Hard gate on no-regression, soft on <150% target | QA Q3 |

## Module Roadmap

The dependency graph determines implementation order. Modules within the same priority can be worked in parallel if they don't share files.

```
Priority 0 (Foundation):
  [frontmatter-audit] -----> no deps, do first

Priority 1 (Core Fixes):
  [reproduce-bug-fix] -----> no deps
  [input-validation]  -----> depends on reproduce-bug-fix (adds validation to reproduce-bug.md)
  [hooks]             -----> no deps (independent of validation)

Priority 2 (Infrastructure):
  [ci-validation]        --> depends on frontmatter-audit + hooks (tests validate both)
  [interactive-patterns] --> depends on input-validation (commands get validation first)

Priority 3 (Advanced):
  [state-management]     --> depends on interactive-patterns (work.md gets both)

Priority 999999 (Always Last):
  [integration-testing]  --> depends on ALL modules (regression gate)
```

**Dependency graph (visual):**

```
frontmatter-audit ─────────────────────────┐
                                           ├──> ci-validation
hooks ─────────────────────────────────────┘
                                                              ╲
reproduce-bug-fix ──> input-validation ──> interactive-patterns ──> state-management ──> integration-testing
```

**Parallelization opportunities:**
- `frontmatter-audit` + `reproduce-bug-fix` + `hooks` can run in parallel (no shared files at the module level, though work.md/review.md are shared at file level between frontmatter-audit and later modules)
- `ci-validation` + `interactive-patterns` can run in parallel once their dependencies are met
- `integration-testing` is always sequential and last
