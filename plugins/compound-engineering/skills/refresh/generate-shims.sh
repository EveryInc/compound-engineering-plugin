#!/usr/bin/env bash
#
# generate-shims.sh — Auto-generate agent shim files from agent-shim: true frontmatter
#
# Usage: ./generate-shims.sh <plugin-dir>
#
# Scans orchestrators/ and agents/review/ for files with agent-shim: true
# in their YAML frontmatter. Generates _shim-<name>.md files in agents/review/
# so they're addressable by name in natural language.

set -u

PLUGIN_DIR="${1:?Usage: generate-shims.sh <plugin-dir>}"
REVIEW_DIR="$PLUGIN_DIR/agents/review"
ORCH_DIR="$PLUGIN_DIR/orchestrators"

# Clean up old shims
rm -f "$REVIEW_DIR"/_shim-*.md

orch_shims=""
reviewer_shims=""

# Helper: extract frontmatter fields from an .md file
# Writes name and description to temp files
extract_frontmatter() {
  local file="$1" name_file="$2" desc_file="$3"
  python3 -c "
import sys

in_front = False
name = ''
desc_lines = []
in_desc = False

for line in open(sys.argv[1]):
    stripped = line.strip()
    if stripped == '---':
        if in_front: break
        in_front = True
        continue
    if not in_front:
        continue
    if in_desc:
        if stripped and not any(stripped.startswith(k) for k in [
            'phases:', 'type:', 'model:', 'orchestrator-model:',
            'agent-model:', 'agent-shim:', 'review-preferences:',
            'synthesis:', 'category:', 'select_when:', 'color:',
            'tools:', '- name:'
        ]):
            desc_lines.append(stripped)
            continue
        else:
            in_desc = False
    if stripped.startswith('name:'):
        name = stripped.split(':', 1)[1].strip().strip('\"').strip(\"'\")
    elif stripped.startswith('description:'):
        val = stripped.split(':', 1)[1].strip()
        if val == '|':
            in_desc = True
        else:
            desc_lines.append(val.strip('\"').strip(\"'\"))

desc = ' '.join(desc_lines)
with open(sys.argv[2], 'w') as f: f.write(name)
with open(sys.argv[3], 'w') as f: f.write(desc[:200])
" "$file" "$name_file" "$desc_file"
}

# Helper: check if file has agent-shim: true
has_agent_shim() {
  python3 -c "
import sys
in_front = False
for line in open(sys.argv[1]):
    stripped = line.strip()
    if stripped == '---':
        if in_front: break
        in_front = True
        continue
    if in_front and stripped == 'agent-shim: true':
        print('yes')
        break
" "$1" 2>/dev/null
}

tmp_name=$(mktemp)
tmp_desc=$(mktemp)
trap "rm -f '$tmp_name' '$tmp_desc'" EXIT

# --- Generate orchestrator shims ---
if [ -d "$ORCH_DIR" ]; then
  for filepath in "$ORCH_DIR"/*.md; do
    [ -f "$filepath" ] || continue
    [ "$(has_agent_shim "$filepath")" = "yes" ] || continue

    extract_frontmatter "$filepath" "$tmp_name" "$tmp_desc"
    NAME=$(cat "$tmp_name")
    DESC=$(cat "$tmp_desc")
    [ -n "$NAME" ] || continue

    cat > "$REVIEW_DIR/_shim-${NAME}.md" << SHIM
---
name: $NAME
description: "$DESC Use when the user mentions $NAME by name."
model: inherit
---

Run \`/ce:run $NAME \$ARGUMENTS\`
SHIM

    orch_shims="${orch_shims:+$orch_shims, }$NAME"
  done
fi

# --- Generate reviewer shims ---
for filepath in "$REVIEW_DIR"/*.md; do
  [ -f "$filepath" ] || continue
  filename=$(basename "$filepath")

  # Skip shims and templates
  case "$filename" in _shim-*|_template-*) continue ;; esac

  [ "$(has_agent_shim "$filepath")" = "yes" ] || continue

  extract_frontmatter "$filepath" "$tmp_name" "$tmp_desc"
  NAME=$(cat "$tmp_name")
  DESC=$(cat "$tmp_desc")
  [ -n "$NAME" ] || continue

  # Short name: first part before hyphen (avi from avi-rails-architect)
  SHORT_NAME=$(echo "$NAME" | cut -d'-' -f1)

  # Don't overwrite an orchestrator shim with the same name
  [ -f "$REVIEW_DIR/_shim-${SHORT_NAME}.md" ] && continue

  cat > "$REVIEW_DIR/_shim-${SHORT_NAME}.md" << SHIM
---
name: $SHORT_NAME
description: "$DESC Use when the user mentions $SHORT_NAME by name or asks for their opinion."
model: inherit
tools: Read, Grep, Glob, Bash
---

You are $SHORT_NAME. Load your full persona from \`$filepath\` and adopt it. Then address the user's request in character.

\$ARGUMENTS
SHIM

  reviewer_shims="${reviewer_shims:+$reviewer_shims, }$SHORT_NAME"
done

# --- Summary ---
echo ""
echo "Generated agent shims:"
[ -n "$orch_shims" ] && echo "  Orchestrators: $orch_shims"
[ -n "$reviewer_shims" ] && echo "  Reviewers: $reviewer_shims"
[ -z "$orch_shims" ] && [ -z "$reviewer_shims" ] && echo "  (none — no definitions have agent-shim: true)"
exit 0
