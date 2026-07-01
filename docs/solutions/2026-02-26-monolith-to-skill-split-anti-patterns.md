---
title: 'Monolith-to-Skill Split: Enforcement, Drift, and Shadowing Anti-Patterns'
date: 2026-02-26
tags: [claude-code, markdown-commands, skill-md-framework, bash, node-js]
category: architecture
module: commands/deepen-plan.md
source: deepen-plan
convergence_count: 4
plan: .deepen-sorted-wandering-parnas/original_plan.md
---

# Monolith-to-Skill Split: Enforcement, Drift, and Shadowing Anti-Patterns

## Problem

When splitting a large command file into a thin wrapper + SKILL.md + reference doc, three failure modes recur: size budgets creep back without enforcement, validation logic duplicated across files drifts out of sync, and stale copies of the original monolith silently shadow the new skill.

## Key Findings

### Size budgets require deterministic enforcement, not prose (3 agents converged)

Stating "max 1,200 lines" in a plan is a policy wish. Without a gate that fails the pipeline, the file will grow past the budget through iterative additions -- exactly how the original monolith grew from 400 to 1,452 lines. Embed a line-count check as a validation step that runs every time the pipeline executes.

### Legacy monolith shadowing during migration (4 agents converged)

Claude Code resolves skills by precedence: enterprise > personal > project, with plugins namespaced. A stale 1,452-line file at `~/.claude/commands/` or `~/.claude/skills/` silently shadows the new plugin skill. Detection must be automated, check all three resolution paths, and use line count (>100) as the heuristic -- not file existence alone.

### Dual validation paths will drift (3 agents converged)

When validation logic appears both inline in SKILL.md and in a reference doc, the two copies inevitably diverge. The fix: pick one canonical location per validation type. Parent-critical checks (judge output schema) stay inline. Pipeline-internal checks (preservation, artifact structure) live in the reference doc only.

## Reusable Pattern

For any command split: (1) add a deterministic size gate that fails loudly, (2) automate legacy detection across all skill resolution paths before first run, (3) assign each validation check exactly one canonical home -- never duplicate across files.

## Code Example

```bash
# Size budget enforcement (add to pipeline validation step)
ARCH_LINES=$(wc -l < "$DEEPEN_DIR/ARCHITECTURE.md")
if [ "$ARCH_LINES" -gt 1200 ]; then
  echo "FAIL: ARCHITECTURE.md is $ARCH_LINES lines (max 1200)"
  exit 1
fi

# Legacy shadowing detection (cross-platform)
for dir in "$HOME/.claude/commands" "$HOME/.claude/skills/deepen-plan"; do
  TARGET="$dir/deepen-plan.md"
  [ -d "$dir/deepen-plan" ] && TARGET="$dir/deepen-plan/SKILL.md"
  if [ -f "$TARGET" ]; then
    LINES=$(grep -c '' "$TARGET" 2>/dev/null || echo 0)
    [ "$LINES" -gt 100 ] && echo "WARN: Legacy at $TARGET ($LINES lines)"
  fi
done
```

## References

- agent-native-architecture/references/agent-execution-patterns.md (deterministic checks over heuristic detection)
- agent-native-architecture/SKILL.md (anti-pattern: two ways to accomplish same outcome)
- https://code.claude.com/docs/en/skills (skill resolution precedence)
