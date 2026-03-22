# t851029/skills-repo

Fork of [EveryInc/compound-engineering-plugin](https://github.com/EveryInc/compound-engineering-plugin) with a unified `/go` workflow skill added.

## What this is

This is the [compound-engineering](https://github.com/EveryInc/compound-engineering-plugin) plugin marketplace, extended with a unified `/go` development workflow skill. The plugin name stays `compound-engineering` because this IS the compound-engineering plugin — just with the extra workflow baked in.

A friend runs two commands and gets all compound-engineering skills plus the custom workflow:

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

`setup.sh` symlinks the `go` SKILL.md file directly into `~/.config/opencode/commands/`.

## Plugin Collision Warning

If you already have `compound-engineering` installed from upstream, uninstall it first:

```bash
/plugin uninstall compound-engineering
/plugin marketplace remove EveryInc/every-marketplace    # optional
/plugin marketplace add t851029/skills-repo
/plugin install compound-engineering@t851029-skills
```

Installing both will cause a name collision since both use the `compound-engineering` plugin name.

## Unified /go Workflow

A single `/go` skill replaces the three separate `go-lite`, `go-ham`, and `go-lite-noweb` skills. Pass a mode as the first argument:

| Mode | Speed | Web Research | Browser Testing | Best For |
|------|-------|-------------|-----------------|----------|
| `lite-noweb` | Fastest | No | No | Straightforward features, hotfixes |
| `lite` | Fast | No | Conditional | Most features, UI work |
| `ham` | Thorough | Yes (deepen-plan) | Conditional | Complex features, unknown territory |
| `bug` | Fast | No | No | Single-issue bug fixes |
| `bug-parallel` | Fast | No | No | Multiple bugs fixed in parallel |

All modes share the same core loop: plan → work → review → fix → push.

Append `-auto` to any mode for autonomous brainstorm before planning.

Usage in Claude Code:

```
/compound-engineering:go lite #123 add dark mode toggle
/compound-engineering:go ham #456 redesign auth flow
/compound-engineering:go lite-noweb fix null pointer in user service
/compound-engineering:go bug #789 fix session expiry
/compound-engineering:go ham-auto #101 explore caching strategy
```

## Model Routing

| Phase | Model | Tool |
|-------|-------|------|
| Planning (ce:plan) | Opus | Skill tool |
| Deepen plan (ham mode only) | Opus | Skill tool |
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

Option 1 — Project-level override. Create `.claude/commands/go.md` in your repo:

```markdown
---
description: /go with our task tracking
---

# /go

1. Load the `compound-engineering:go` skill.
2. Before Phase 1, run our task tracking setup.
3. Pass $ARGUMENTS.
```

Option 2 — CLAUDE.md hook. Add a pre-workflow instruction to your project's `CLAUDE.md` that fires before any workflow skill.

Option 3 — Fork this repo and add Step 0.1 back with your own values.

The BYO section in the `/go` SKILL.md includes a commented template showing the original pattern with the GitHub Projects v2 example.

## Upstream Sync

To pull in updates from the upstream compound-engineering plugin:

```bash
cd ~/.config/opencode/skills/skills-repo   # or wherever you cloned it

# One-time: add upstream remote (if not already set)
git remote add upstream https://github.com/EveryInc/compound-engineering-plugin.git

# Pull updates
git fetch upstream
git merge upstream/main
```

If upstream changes conflict with the `go` skill or marketplace.json name, resolve manually. The `go` skill directory is a new file not present in upstream, so conflicts are unlikely.

## Customization

The unified `/go` workflow supports project-level overrides via `.claude/commands/`. Create a file at `.claude/commands/go.md` in your project repo to override or extend the shared skill for that project.

Example: adding a smoke test phase back for a specific project:

```markdown
---
description: /go with smoke tests
---

# /go

1. Load the `compound-engineering:go` skill using the Skill tool.
2. After Phase 7 (Commit & Push), run: `python -m pytest tests/ -v`
3. Pass $ARGUMENTS.
```

## Compound Engineering Skills Used

These workflows depend on skills from the compound-engineering plugin:

| Dependency | Used by | Purpose |
|------------|---------|---------|
| `ce:plan` | All modes | Creates plan file in docs/plans/ |
| `ce:review` | All modes | Reviews implementation, creates todo files |
| `ce:compound` | All modes (conditional) | Documents solutions in docs/solutions/ |
| `deepen-plan` | ham mode only | Web research to enhance the plan |
| `git-worktree` | All modes | Creates isolated worktrees via worktree-manager.sh |
| `agent-browser` | lite, ham modes (conditional) | Browser testing for dashboard changes |

Optional (not in compound-engineering, skip if absent):

| Optional skill | Phase | Fallback behavior |
|---------------|-------|------------------|
| `ralph-loop` | Step 0 | Skipped, workflow continues |
| `simplifycode` | Phase 5/6 | Skipped, code review done in Phase 3 |

## License

MIT — inherited from upstream [EveryInc/compound-engineering-plugin](https://github.com/EveryInc/compound-engineering-plugin). See [LICENSE](LICENSE).
