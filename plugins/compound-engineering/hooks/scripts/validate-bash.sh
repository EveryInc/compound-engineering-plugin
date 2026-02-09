#!/bin/bash
# PreToolUse hook: Validate bash commands for destructive operations
# Decision: "ask" for all destructive operations, "deny" for catastrophic targets
set -euo pipefail

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if [ -z "$COMMAND" ]; then
  exit 0  # No command to validate
fi

# Pattern 1: git push --force (any variant)
if echo "$COMMAND" | grep -qE 'git\s+push\s+.*--force|git\s+push\s+-f\b'; then
  # Extract branch name for context
  BRANCH=$(echo "$COMMAND" | grep -oE '[^ ]+$' || echo "unknown")
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "Force push will overwrite remote history. Branch: '"$BRANCH"'"
    }
  }'
  exit 0
fi

# Pattern 2: git reset --hard
if echo "$COMMAND" | grep -qE 'git\s+reset\s+--hard'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "Hard reset will discard all uncommitted changes"
    }
  }'
  exit 0
fi

# Pattern 3: rm -rf / rm -fr (general recursive force delete)
if echo "$COMMAND" | grep -qE 'rm\s+-r[f]?\s+' || echo "$COMMAND" | grep -qE 'rm\s+-fr\s+'; then
  TARGET=$(echo "$COMMAND" | sed -E 's/.*rm[[:space:]]+-[rf]+[[:space:]]+//' | awk '{print $1}')

  # Hard deny catastrophic targets
  case "$TARGET" in
    /|"~"|'$HOME'|'$CLAUDE_PROJECT_DIR'|.)
      jq -n '{
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: "Catastrophic delete blocked. Target: '"$TARGET"'"
        }
      }'
      exit 0
      ;;
  esac

  # Allow safe targets silently
  case "$TARGET" in
    */node_modules|*/node_modules/*|*/.cache|*/.cache/*|*/tmp|*/tmp/*|*/__pycache__|*/.next|*/.next/*|node_modules|.cache|tmp|__pycache__|.next)
      exit 0
      ;;
  esac

  # Ask for everything else
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "Recursive delete of '"$TARGET"'. Verify this is intended."
    }
  }'
  exit 0
fi

# All other commands: allow
exit 0
