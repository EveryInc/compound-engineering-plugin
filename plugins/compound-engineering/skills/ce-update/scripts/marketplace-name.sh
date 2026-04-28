#!/usr/bin/env bash
# Print the marketplace-name segment of CLAUDE_SKILL_DIR when it matches the
# marketplace cache layout `~/.claude/plugins/cache/<marketplace>/compound-engineering/<version>/skills/ce-update`,
# or the literal sentinel `__CE_UPDATE_NOT_MARKETPLACE__` otherwise.

set -u

skill_dir="${CLAUDE_SKILL_DIR:-}"

if [ -z "$skill_dir" ]; then
  echo '__CE_UPDATE_NOT_MARKETPLACE__'
  exit 0
fi

# Capture group 1 is the marketplace segment.
marketplace=$(printf '%s\n' "$skill_dir" | sed -nE 's|.*/plugins/cache/([^/]+)/compound-engineering/[^/]+/skills/ce-update/?$|\1|p')

if [ -n "$marketplace" ]; then
  echo "$marketplace"
else
  echo '__CE_UPDATE_NOT_MARKETPLACE__'
fi
