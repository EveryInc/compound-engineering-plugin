#!/usr/bin/env bash
# Print the marketplace-name segment of the skill's own location when it
# matches the marketplace cache layout
# `~/.claude/plugins/cache/<marketplace>/compound-engineering/<version>/skills/ce-update`,
# or the literal sentinel `__CE_UPDATE_NOT_MARKETPLACE__` otherwise.
#
# Derives skill_dir from BASH_SOURCE rather than $CLAUDE_SKILL_DIR — see
# currently-loaded-version.sh for the rationale.

set -u

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
skill_dir="$(dirname "$script_dir")"

# Capture group 1 is the marketplace segment.
marketplace=$(printf '%s\n' "$skill_dir" | sed -nE 's|.*/plugins/cache/([^/]+)/compound-engineering/[^/]+/skills/ce-update/?$|\1|p')

if [ -n "$marketplace" ]; then
  echo "$marketplace"
else
  echo '__CE_UPDATE_NOT_MARKETPLACE__'
fi
