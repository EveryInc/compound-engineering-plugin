#!/bin/bash
# setup.sh — Symlink go-* workflow skills into OpenCode commands directory
#
# Usage: ./setup.sh
#
# Symlinks each SKILL.md from plugins/compound-engineering/skills/go-*/
# into ~/.config/opencode/commands/ so they appear as /go-lite, /go-ham,
# and /go-lite-noweb in the OpenCode UI.
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

echo "Setting up go-* workflow skills for OpenCode..."
echo "Linking from: $PLUGIN_DIR"
echo "Linking into: $OPENCODE_DIR"
echo ""

linked=0
for skill_dir in "$PLUGIN_DIR"/go-*; do
    skill_name=$(basename "$skill_dir")
    skill_file="$skill_dir/SKILL.md"
    target="$OPENCODE_DIR/$skill_name.md"

    [ -f "$skill_file" ] || continue

    # Remove existing file or symlink if present
    rm -f "$target"

    ln -s "$skill_file" "$target"
    echo "  Linked: $skill_name.md -> $skill_file"
    linked=$((linked + 1))
done

echo ""
echo "Done. Linked $linked skill(s)."
echo ""
echo "Available commands in OpenCode:"
echo "  /go-lite        — Balanced workflow (plan, work, review, fix)"
echo "  /go-ham         — Full workflow with research and browser testing"
echo "  /go-lite-noweb  — Fast workflow, no web research or browser testing"
echo ""
echo "This repo includes compound-engineering. The go-* workflows use"
echo "ce:plan, ce:review, ce:compound, and deepen-plan skills from"
echo "the same plugin."
