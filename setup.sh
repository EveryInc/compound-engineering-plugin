#!/bin/bash
# setup.sh — Symlink the /go workflow skill into OpenCode commands directory
#
# Usage: ./setup.sh
#
# Symlinks plugins/compound-engineering/skills/go/SKILL.md
# into ~/.config/opencode/commands/go.md so it appears as /go
# in the OpenCode UI.
#
# Note: This repo IS compound-engineering (extended). For Claude Code,
# use the plugin marketplace instead:
#   /plugin marketplace add t851029/skills-repo
#   /plugin install compound-engineering@t851029-skills

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$SCRIPT_DIR/plugins/compound-engineering/skills"
OPENCODE_DIR="$HOME/.config/opencode/commands"

mkdir -p "$OPENCODE_DIR"

echo "Setting up /go workflow skill for OpenCode..."
echo "Linking from: $PLUGIN_DIR"
echo "Linking into: $OPENCODE_DIR"
echo ""

skill_file="$PLUGIN_DIR/go/SKILL.md"
target="$OPENCODE_DIR/go.md"

if [ ! -f "$skill_file" ]; then
    echo "Error: skill file not found: $skill_file"
    exit 1
fi

# Remove existing file or symlink if present
rm -f "$target"

ln -s "$skill_file" "$target"
echo "  Linked: go.md -> $skill_file"

echo ""
echo "Done. Linked 1 skill."
echo ""
echo "Available command in OpenCode:"
echo "  /go <mode> [args]   — Unified development workflow"
echo ""
echo "Modes:"
echo "  lite         — Balanced workflow (plan, work, review, fix, push)"
echo "  ham          — Full workflow with research and browser testing"
echo "  lite-noweb   — Fast workflow, no web research or browser testing"
echo "  bug          — Single-issue bug fix"
echo "  bug-parallel — Multiple bugs fixed in parallel"
echo ""
echo "Append -auto to any mode for autonomous brainstorm before planning."
echo ""
echo "This repo includes compound-engineering. The /go workflow uses"
echo "ce:plan, ce:review, ce:compound, and deepen-plan skills from"
echo "the same plugin."
