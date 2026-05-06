#!/usr/bin/env bash
# Print the version segment of the skill's own location when it matches the
# marketplace cache layout `~/.claude/plugins/cache/<marketplace>/compound-engineering/<version>/skills/ce-update`,
# or the literal sentinel `__CE_UPDATE_NOT_MARKETPLACE__` otherwise.
#
# Derives skill_dir from BASH_SOURCE rather than $CLAUDE_SKILL_DIR because
# CLAUDE_SKILL_DIR is documented as a SKILL.md content substitution and is
# not a guaranteed environment variable for Bash tool subprocesses. The
# script is invoked as `bash "${CLAUDE_SKILL_DIR}/scripts/<name>.sh"`, so
# BASH_SOURCE[0] is the absolute script path either way and self-locating
# is reliable.

set -u

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
skill_dir="$(dirname "$script_dir")"

# Match `.../plugins/cache/*/compound-engineering/<version>/skills/ce-update[/]?`
# Capture group 1 is the version segment.
version=$(printf '%s\n' "$skill_dir" | sed -nE 's|.*/plugins/cache/[^/]+/compound-engineering/([^/]+)/skills/ce-update/?$|\1|p')

if [ -n "$version" ]; then
  echo "$version"
else
  echo '__CE_UPDATE_NOT_MARKETPLACE__'
fi
