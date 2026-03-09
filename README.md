# t851029/skills-repo

Fork of [EveryInc/every-marketplace](https://github.com/EveryInc/compound-engineering-plugin) with three custom workflow skills added: `go-lite`, `go-ham`, and `go-lite-noweb`.

## What this is

This is the [compound-engineering](https://github.com/EveryInc/compound-engineering-plugin) plugin marketplace, extended with three opinionated development workflow skills. The plugin name stays `compound-engineering` because this IS the compound-engineering plugin — just with extra workflows baked in.

A friend runs two commands and gets all compound-engineering skills plus the custom workflows:

```bash
/plugin marketplace add t851029/skills-repo
/plugin install compound-engineering@t851029-skills
```

## Installation

### Claude Code

```bash
/plugin marketplace add t851029/skills-repo
/plugin install compound-engineering@t851029-skills
```

### OpenCode

```bash
git clone https://github.com/t851029/skills-repo ~/.config/opencode/skills/skills-repo
cd ~/.config/opencode/skills/skills-repo
./setup.sh
```

`setup.sh` symlinks the go-* SKILL.md files directly into `~/.config/opencode/commands/`.

## Plugin Collision Warning

If you already have `compound-engineering` installed from upstream, uninstall it first:

```bash
/plugin uninstall compound-engineering
/plugin marketplace remove EveryInc/every-marketplace    # optional
/plugin marketplace add t851029/skills-repo
/plugin install compound-engineering@t851029-skills
```

Installing both will cause a name collision since both use the `compound-engineering` plugin name.

## Three Workflows

| Workflow | Speed | Web Research | Browser Testing | Best For |
|----------|-------|-------------|-----------------|----------|
| `go-lite-noweb` | Fastest | No | No | Straightforward features, hotfixes |
| `go-lite` | Fast | No | Conditional | Most features, UI work |
| `go-ham` | Thorough | Yes (deepen-plan) | Conditional | Complex features, unknown territory |

All three share the same core loop: plan → work → review → fix → push.

Usage in Claude Code:

```
/compound-engineering:go-lite #123 add dark mode toggle
/compound-engineering:go-ham #456 redesign auth flow
/compound-engineering:go-lite-noweb fix null pointer in user service
```

## Model Routing

| Phase | Model | Tool |
|-------|-------|------|
| Planning (ce:plan) | Opus | Skill tool |
| Deepen plan (go-ham only) | Opus | Skill tool |
| Implementation | Sonnet | Task tool (work-executor agent) |
| Review (ce:review) | Opus | Skill tool |
| Fix TODOs | Sonnet | Task tool |
| Simplify code | Sonnet | Skill tool (if installed) |
| Compound docs | Sonnet | Skill tool (conditional) |
| Browser testing | Sonnet | Task tool (conditional) |

Opus handles strategic reasoning. Sonnet handles execution. This keeps costs down without sacrificing plan quality.

## Task Tracking (BYO)

The original workflows included GitHub Projects v2 integration (Step 0.1) that automatically moved issues to "Implementation" status when a workflow started. This was stripped for portability because it was hardcoded to a specific project, repo, and script (`field_updater.sh`).

**What was removed:**

```bash
PROJECT_ID=$(gh project view 10 --owner myorg --format json --jq '.id')
ITEM_ID=$(gh issue view $ISSUE_NUMBER --repo myorg/myrepo --json projectItems --jq '.projectItems[0].id')
field_updater.sh set-status "$PROJECT_ID" "$ITEM_ID" "Implementation"
```

**How to add your own:**

Option 1 — Project-level override. Create `.claude/commands/go-lite.md` in your repo:

```markdown
---
description: go-lite with our task tracking
---

# /go-lite

1. Load the `compound-engineering:go-lite` skill.
2. Before Phase 1, run our task tracking setup.
3. Pass $ARGUMENTS.
```

Option 2 — CLAUDE.md hook. Add a pre-workflow instruction to your project's `CLAUDE.md` that fires before any workflow skill.

Option 3 — Fork this repo and add Step 0.1 back with your own values.

The BYO section in each SKILL.md includes a commented template showing the original pattern.

## Upstream Sync

To pull in updates from the upstream compound-engineering plugin:

```bash
cd ~/.config/opencode/skills/skills-repo   # or wherever you cloned it
git fetch upstream
git merge upstream/main
```

If upstream changes conflict with the go-* skills or marketplace.json name, resolve manually. The go-* skill directories are new files not present in upstream, so conflicts are unlikely.

## Customization

All three workflows support project-level overrides via `.claude/commands/`. Create a file at `.claude/commands/go-lite.md` (or `go-ham.md`, `go-lite-noweb.md`) in your project repo to override or extend the shared skill for that project.

Example: adding a smoke test phase back for a specific project:

```markdown
---
description: go-lite with smoke tests
---

# /go-lite

1. Load the `compound-engineering:go-lite` skill using the Skill tool.
2. After Phase 7 (Commit & Push), run: `python -m pytest tests/ -v`
3. Pass $ARGUMENTS.
```

## Compound Engineering Skills Used

These workflows depend on skills from the compound-engineering plugin:

| Dependency | Used by | Purpose |
|------------|---------|---------|
| `ce:plan` | All three | Creates plan file in docs/plans/ |
| `ce:review` | All three | Reviews implementation, creates todo files |
| `ce:compound` | All three (conditional) | Documents solutions in docs/solutions/ |
| `deepen-plan` | go-ham only | Web research to enhance the plan |
| `git-worktree` | All three | Creates isolated worktrees via worktree-manager.sh |
| `agent-browser` | go-lite, go-ham (conditional) | Browser testing for dashboard changes |

Optional (not in compound-engineering, skip if absent):

| Optional skill | Phase | Fallback behavior |
|---------------|-------|------------------|
| `ralph-loop` | Step 0 | Skipped, workflow continues |
| `simplifycode` | Phase 5/6 | Skipped, code review done in Phase 3 |

## License

MIT — inherited from upstream [EveryInc/every-marketplace](https://github.com/EveryInc/compound-engineering-plugin). See [LICENSE](LICENSE).
