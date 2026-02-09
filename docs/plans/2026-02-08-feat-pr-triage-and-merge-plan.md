---
title: PR Triage, Review & Merge
type: feat
date: 2026-02-08
---

# PR Triage, Review & Merge

## Overview

Review all 17 open PRs one-by-one. Merge the ones that look good, leave constructive comments on the ones we won't take (keeping them open for contributors to address). Close duplicates/spam.

## Approach

Show the diff for each PR, get a go/no-go, then either merge or comment. PRs are ordered by priority group.

## Group 1: Bug Fixes (high confidence merges)

### PR #159 - fix(git-worktree): detect worktrees where .git is a file
- **Author:** dalley | **Files:** 1 | **+2/-2**
- **What:** Changes `-d` to `-e` check in `worktree-manager.sh` so `list` and `cleanup` detect worktrees (`.git` is a file in worktrees, not a dir)
- **Fixes:** Issue #158
- **Action:** Review diff → merge

### PR #144 - Remove confirmation prompt when creating git worktrees
- **Author:** XSAM | **Files:** 1 | **+0/-8**
- **What:** Removes interactive `read -r` confirmation that breaks Claude's ability to create worktrees
- **Related:** Same file as #159 (merge #159 first)
- **Action:** Review diff → merge

### PR #150 - fix(compound): prevent subagents from writing intermediary files
- **Author:** tmchow | **Files:** 1 | **+64/-27**
- **What:** Restructures `/workflows:compound` into 2-phase orchestration to prevent subagents from writing temp files
- **Action:** Review diff → merge

### PR #148 - Fix: resolve_pr_parallel uses non-existent scripts
- **Author:** ajrobertsonio | **Files:** 1 | **+20/-7**
- **What:** Replaces references to non-existent `bin/get-pr-comments` with standard `gh` CLI commands
- **Fixes:** Issues #147, #54
- **Action:** Review diff → merge

## Group 2: Documentation (clean, low-risk)

### PR #133 - Fix terminology: third person → passive voice
- **Author:** FauxReal9999 | **Files:** 13 | docs-only
- **What:** Corrects "third person" to "passive voice" across docs (accurate fix)
- **Action:** Review diff → merge

### PR #108 - Note new repository URL
- **Author:** akx | **Files:** 5 | docs-only
- **What:** Updates URLs from `kieranklaassen/compound-engineering-plugin` to `EveryInc/compound-engineering-plugin`
- **Action:** Review diff → merge

### PR #113 - docs: add brainstorm command to workflow documentation
- **Author:** tmchow | docs-only
- **What:** Adds brainstorming skill and learnings-researcher agent to README, fixes component counts
- **Action:** Review diff → merge

### PR #80 - docs: Add LSP prioritization guidance
- **Author:** kevinold | **Files:** 1 | docs-only
- **What:** Adds docs showing users how to customize agent behavior via project CLAUDE.md to prioritize LSP
- **Action:** Review diff → merge

## Group 3: Enhancements (likely merge)

### PR #119 - fix: backup existing config files before overwriting
- **Author:** jzw | **Files:** 5 | **+90/-3** | has tests
- **What:** Adds `backupFile()` utility to create timestamped backups before overwriting Codex/OpenCode configs
- **Fixes:** Issue #125
- **Action:** Review diff → merge

### PR #112 - feat(skills): add document-review skill
- **Author:** tmchow | enhancement
- **What:** Adds document-review skill for brainstorm/plan refinement, renames `/plan_review` → `/technical_review`
- **Note:** Breaking rename - needs review
- **Action:** Review diff → decide

## Group 4: Needs Discussion (comment and leave open)

### PR #157 - Rewrite workflows:review with context-managed map-reduce
- **Author:** Drewx-Design | large rewrite
- **What:** Complete rewrite of review command with file-based map-reduce architecture
- **Comment:** Acknowledge quality, note it's a big change that needs dedicated review session

### PR #131 - feat: add vmark-mcp plugin
- **Author:** xiaolai | new plugin
- **What:** Adds entirely new VMark markdown editor plugin to marketplace
- **Comment:** Ask for more context on fit with marketplace scope

### PR #124 - feat(commands): add /compound-engineering-setup
- **Author:** internal | config
- **What:** Interactive setup command for configuring review agents per project
- **Comment:** Note overlap with #103, needs unified config strategy

### PR #123 - feat: Add sync command for Claude Code personal config
- **Author:** terry-li-hm | config
- **What:** Sync personal Claude config across machines/editors
- **Comment:** Note overlap with #124 and #103, needs unified config strategy

### PR #103 - Add /compound:configure with persistent user preferences
- **Author:** aviflombaum | **+36,866** lines
- **What:** Massive architectural change adding persistent config with build system
- **Comment:** Too large, suggest breaking into smaller PRs

## Group 5: Close

### PR #122 - [EXPERIMENTAL] add /slfg and /swarm-status
- **Label:** duplicate
- **What:** Already merged in v2.30.0 (commit e4ff6a8)
- **Action:** Comment explaining it's been superseded, close

### PR #68 - Improve all 13 skills to 90%+ grades
- **Label:** wontfix
- **What:** Massive stale PR (Jan 6), based on 13 skills when we now have 16+
- **Action:** Comment thanking contributor, suggest fresh PR against current main, close

## Post-Merge Cleanup

After merging:
- [ ] Close issues fixed by merged PRs (#158, #147, #54, #125)
- [ ] Close spam issues (#98, #56)
- [ ] Run `/release-docs` to update documentation site with new component counts
- [ ] Bump version in plugin.json if needed

## References

- PR list: https://github.com/EveryInc/compound-engineering-plugin/pulls
- Issues: https://github.com/EveryInc/compound-engineering-plugin/issues
