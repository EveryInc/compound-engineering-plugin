#!/usr/bin/env bash
# Install Compound Engineering plugins and slash commands for Cursor.
# - Symlinks plugins with .cursor-plugin/ into ~/.cursor/plugins/local/
# - Merges paths into ~/.cursor/plugins/installed.json
# - Regenerates ~/.cursor/commands/*.md (and repo-local command stubs)
#
# Usage (from repo root):
#   npm run install:cursor
#   bash scripts/install-cursor-plugin.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

CURSOR_PLUGINS_DIR="${HOME}/.cursor/plugins"
LOCAL_DIR="${CURSOR_PLUGINS_DIR}/local"
INSTALLED_JSON="${CURSOR_PLUGINS_DIR}/installed.json"

mkdir -p "$LOCAL_DIR"

echo "Repository: $REPO_ROOT"
echo "Cursor plugins: $CURSOR_PLUGINS_DIR"
echo ""

linked=0
while IFS= read -r manifest; do
  plugin_dir="$(dirname "$(dirname "$manifest")")"
  name="$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).name)" "$manifest")"
  abs_path="$(cd "$plugin_dir" && pwd)"
  ln -sfn "$abs_path" "$LOCAL_DIR/$name"
  echo "Linked $name -> $abs_path"
  linked=$((linked + 1))
done < <(find "$REPO_ROOT/plugins" -path '*/.cursor-plugin/plugin.json' -type f 2>/dev/null | sort)

if [ "$linked" -eq 0 ]; then
  echo "No plugins with .cursor-plugin/plugin.json found under $REPO_ROOT/plugins" >&2
  exit 1
fi

REPO_ROOT="$REPO_ROOT" INSTALLED_JSON="$INSTALLED_JSON" LOCAL_DIR="$LOCAL_DIR" node <<'NODE'
const fs = require("fs")
const path = require("path")

const repoRoot = process.env.REPO_ROOT
const installedPath = process.env.INSTALLED_JSON
const localDir = process.env.LOCAL_DIR

const local = {}
for (const name of fs.readdirSync(localDir)) {
  const target = path.join(localDir, name)
  let resolved
  try {
    resolved = fs.realpathSync(target)
  } catch {
    continue
  }
  if (resolved.startsWith(path.join(repoRoot, "plugins"))) {
    local[name] = resolved
  }
}

let data = { user: [], local: {} }
if (fs.existsSync(installedPath)) {
  try {
    data = { user: [], local: {}, ...JSON.parse(fs.readFileSync(installedPath, "utf8")) }
  } catch {
    console.warn("Warning: could not parse existing installed.json; rewriting local entries")
  }
}
data.local = { ...data.local, ...local }
data.user = Array.isArray(data.user) ? data.user : []

fs.mkdirSync(path.dirname(installedPath), { recursive: true })
fs.writeFileSync(installedPath, `${JSON.stringify(data, null, 2)}\n`)
console.log(`Updated ${installedPath}`)
NODE

echo ""
echo "Generating slash command stubs..."
node "$SCRIPT_DIR/generate-cursor-commands.mjs"

echo ""
echo "Done. Quit Cursor fully (Cmd+Q on macOS) and reopen so plugins and / commands reload."
