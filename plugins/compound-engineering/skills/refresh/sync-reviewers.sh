#!/usr/bin/env bash
#
# sync-reviewers.sh — Fetch .md files from configured external repos
#
# Usage: ./sync-reviewers.sh <default-registry-yaml> <output-dir> [<config-name>]
#
# config-name defaults to "reviewer" — set to "orchestrator" for orchestrator sync.
# Checks for a user-level config at ~/.config/compound-engineering/<config-name>-sources.yaml.
# If it doesn't exist, creates it from the default registry. Then reads sources from
# the user config, fetches .md files, and writes them to the output directory.
# First-listed source wins on filename conflicts (processed in reverse order).

set -u

DEFAULT_REGISTRY="${1:?Usage: sync-reviewers.sh <default-registry-yaml> <output-dir> [<config-name>]}"
OUTPUT_DIR="${2:?Usage: sync-reviewers.sh <default-registry-yaml> <output-dir> [<config-name>]}"
CONFIG_NAME="${3:-reviewer}"

USER_CONFIG_DIR="$HOME/.config/compound-engineering"
USER_CONFIG="$USER_CONFIG_DIR/${CONFIG_NAME}-sources.yaml"

# --- First-run: seed user config from default ---
if [ ! -f "$USER_CONFIG" ]; then
  mkdir -p "$USER_CONFIG_DIR"
  CONFIG_LABEL="$(echo "$CONFIG_NAME" | sed 's/.*/\u&/')"
  cat > "$USER_CONFIG" << YAML
# ${CONFIG_LABEL} Sources
#
# Configure which repos to pull ${CONFIG_NAME} definitions from.
# Run /ce:refresh to sync after editing this file.
#
# Sources listed first have higher priority. If two sources have
# a file with the same name, the first source's version is kept.
#
# To add a source, copy this template and uncomment it:
#
#  - name: my-${CONFIG_NAME}s
#    repo: owner/repo-name
#    branch: main
#    path: ${CONFIG_NAME}s
#    except:
#      - name-to-skip
#      - another-to-skip

YAML
  # Append the sources from the default registry
  python3 -c "
with open('$DEFAULT_REGISTRY') as f:
    lines = f.readlines()
printing = False
for line in lines:
    if line.strip() == 'sources:':
        printing = True
    if printing:
        if line.strip().startswith('#') and '===' in line:
            break
        print(line, end='')
" >> "$USER_CONFIG"
  echo "Created $USER_CONFIG"
  echo "Edit this file to add your own ${CONFIG_NAME} repos, then run /ce:refresh again."
  echo ""
fi

REGISTRY="$USER_CONFIG"

mkdir -p "$OUTPUT_DIR"

# --- YAML → JSON parsing (no pyyaml needed) ---
parse_sources() {
  python3 -c "
import json, sys

with open('$REGISTRY') as f:
    text = f.read()

sources = []
current = None
in_except = False

for line in text.split('\n'):
    stripped = line.strip()
    if stripped.startswith('- name:'):
        if current:
            sources.append(current)
        current = {'name': stripped.split(':', 1)[1].strip()}
        in_except = False
    elif current and stripped.startswith('repo:'):
        current['repo'] = stripped.split(':', 1)[1].strip()
    elif current and stripped.startswith('branch:'):
        current['branch'] = stripped.split(':', 1)[1].strip()
    elif current and stripped.startswith('path:'):
        current['path'] = stripped.split(':', 1)[1].strip()
    elif current and stripped == 'except:':
        current['except'] = []
        in_except = True
    elif current and in_except and stripped.startswith('- '):
        current['except'].append(stripped[2:].strip())
    elif current and in_except and not stripped.startswith('-'):
        in_except = False

if current:
    sources.append(current)

print(json.dumps(sources))
"
}

# Extract a field from a JSON object
jfield() {
  echo "$1" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('$2','') or '${3:-}')"
}

# Extract except list (one per line)
jexcept() {
  echo "$1" | python3 -c "
import json, sys
d = json.load(sys.stdin)
for name in (d.get('except') or []):
    print(name)
"
}

# --- Fetching ---
fetch_files() {
  local repo="$1" branch="$2" path="$3" dest="$4"

  if command -v gh &>/dev/null; then
    fetch_with_gh "$repo" "$branch" "$path" "$dest"
  elif command -v git &>/dev/null; then
    fetch_with_git "$repo" "$branch" "$path" "$dest"
  else
    echo "ERROR: Need gh or git to fetch reviewer files" >&2
    exit 1
  fi
}

fetch_with_gh() {
  local repo="$1" branch="$2" path="$3" dest="$4"
  local api_path=""
  [ "$path" != "." ] && [ -n "$path" ] && api_path="/${path%/}"

  local files
  files=$(gh api "repos/${repo}/contents${api_path}?ref=${branch}" \
    --jq '.[] | select(.name | endswith(".md")) | .name' 2>/dev/null) || {
    echo "  ERROR: Could not list files from ${repo}${api_path} @${branch}" >&2
    return 1
  }

  for filename in $files; do
    [ "$filename" = "README.md" ] && continue
    gh api "repos/${repo}/contents${api_path}/${filename}?ref=${branch}" \
      -H "Accept: application/vnd.github.raw+json" \
      > "${dest}/${filename}" 2>/dev/null && \
      echo "$filename" || \
      echo "  WARN: Failed to download ${filename}" >&2
  done
}

fetch_with_git() {
  local repo="$1" branch="$2" path="$3" dest="$4"
  local tmp
  tmp=$(mktemp -d)

  git clone --depth 1 --branch "$branch" \
    "https://github.com/${repo}.git" "$tmp" 2>/dev/null || {
    echo "  ERROR: Could not clone ${repo} @${branch}" >&2
    rm -rf "$tmp"
    return 1
  }

  local src_dir="$tmp"
  [ "$path" != "." ] && [ -n "$path" ] && src_dir="$tmp/$path"

  for filepath in "$src_dir"/*.md; do
    [ -f "$filepath" ] || continue
    local filename
    filename=$(basename "$filepath")
    [ "$filename" = "README.md" ] && continue
    cp "$filepath" "${dest}/${filename}"
    echo "$filename"
  done

  rm -rf "$tmp"
}

# --- Main ---
sources_json=$(parse_sources)
num_sources=$(echo "$sources_json" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))")

if [ "$num_sources" -eq 0 ]; then
  echo "No external ${CONFIG_NAME} sources configured."
  echo "Add sources to ${CONFIG_NAME}-sources.yaml and run again."
  exit 0
fi

echo "Found ${num_sources} source(s) in registry."
echo ""

added=0; updated=0; unchanged=0; skipped=0; conflicts=0

# Staging dir — files accumulate here, last write wins (reverse order = first source wins)
staging=$(mktemp -d)
# Track which source owns each file (simple text file: "filename:source")
source_log=$(mktemp)
# Per-source tracking for summary report
summary_dir=$(mktemp -d)
trap "rm -rf '$staging' '$source_log' '$summary_dir'" EXIT

# Process in reverse order so first-listed source overwrites
for (( i=num_sources-1; i>=0; i-- )); do
  source_json=$(echo "$sources_json" | python3 -c "import json,sys; print(json.dumps(json.load(sys.stdin)[$i]))")
  name=$(jfield "$source_json" "name" "source-$i")
  repo=$(jfield "$source_json" "repo")
  branch=$(jfield "$source_json" "branch" "main")
  path=$(jfield "$source_json" "path" ".")

  echo "Syncing from ${name} (${repo}@${branch}:${path})..."

  # Per-source tracking files
  mkdir -p "${summary_dir}/${name}"
  touch "${summary_dir}/${name}/included"
  touch "${summary_dir}/${name}/excluded"
  touch "${summary_dir}/${name}/overridden"

  # Build except list into a temp file
  except_file=$(mktemp)
  jexcept "$source_json" > "$except_file"

  # Fetch files
  src_tmp=$(mktemp -d)
  fetched_files=$(fetch_files "$repo" "$branch" "$path" "$src_tmp" 2>&1) || {
    echo "  Failed to fetch from ${name}. Continuing."
    rm -rf "$src_tmp" "$except_file"
    continue
  }

  for filename in $fetched_files; do
    # Check except list
    basename_no_ext="${filename%.md}"
    if grep -qx "$basename_no_ext" "$except_file" 2>/dev/null; then
      echo "  Skipped: ${filename} (excluded by config)"
      echo "$basename_no_ext" >> "${summary_dir}/${name}/excluded"
      skipped=$((skipped + 1))
      continue
    fi

    # Check for conflict
    prev_source=$(grep "^${filename}:" "$source_log" 2>/dev/null | cut -d: -f2- || true)
    if [ -n "$prev_source" ]; then
      echo "  Conflict: ${filename} — keeping version from '${name}' (overrides '${prev_source}')"
      echo "${basename_no_ext} (was ${prev_source})" >> "${summary_dir}/${name}/overridden"
      # Remove from previous source's included list
      grep -v "^${basename_no_ext}$" "${summary_dir}/${prev_source}/included" > "${summary_dir}/${prev_source}/included.tmp" 2>/dev/null || true
      mv "${summary_dir}/${prev_source}/included.tmp" "${summary_dir}/${prev_source}/included"
      conflicts=$((conflicts + 1))
    fi

    echo "$basename_no_ext" >> "${summary_dir}/${name}/included"

    cp "${src_tmp}/${filename}" "${staging}/${filename}"
    # Update source log (remove old entry, add new)
    grep -v "^${filename}:" "$source_log" > "${source_log}.tmp" 2>/dev/null || true
    mv "${source_log}.tmp" "$source_log"
    echo "${filename}:${name}" >> "$source_log"
  done

  rm -rf "$src_tmp" "$except_file"
done

echo ""

# Copy staged files to output
for filepath in "$staging"/*.md; do
  [ -f "$filepath" ] || continue
  filename=$(basename "$filepath")

  if [ -f "${OUTPUT_DIR}/${filename}" ]; then
    if diff -q "$filepath" "${OUTPUT_DIR}/${filename}" &>/dev/null; then
      echo "  Unchanged: ${filename}"
      unchanged=$((unchanged + 1))
    else
      cp "$filepath" "${OUTPUT_DIR}/${filename}"
      echo "  Updated: ${filename}"
      updated=$((updated + 1))
    fi
  else
    cp "$filepath" "${OUTPUT_DIR}/${filename}"
    echo "  Added: ${filename}"
    added=$((added + 1))
  fi
done

# Check for orphans
echo ""
for filepath in "$OUTPUT_DIR"/*.md; do
  [ -f "$filepath" ] || continue
  filename=$(basename "$filepath")
  [ "$filename" = "_template-reviewer.md" ] && continue
  if [ ! -f "${staging}/${filename}" ]; then
    echo "  Orphan: ${filename} (not in any configured source)"
  fi
done

total=$((added + updated + unchanged))

# Write summary to a file that Claude can Read and show verbatim
CONFIG_LABEL="$(echo "$CONFIG_NAME" | sed 's/.*/\u&/')"
SUMMARY_FILE="${USER_CONFIG_DIR}/last-${CONFIG_NAME}-refresh-summary.md"

{
echo "# ${CONFIG_LABEL} Refresh Summary"
echo ""

# Per-source report — compact comma-separated format
for (( i=0; i<num_sources; i++ )); do
  source_json=$(echo "$sources_json" | python3 -c "import json,sys; print(json.dumps(json.load(sys.stdin)[$i]))")
  name=$(jfield "$source_json" "name" "source-$i")
  repo=$(jfield "$source_json" "repo")
  branch=$(jfield "$source_json" "branch" "main")

  echo "**${name}** (${repo}@${branch})"

  # Included: comma-separated, alphabetical
  included=$(grep ":${name}$" "$source_log" 2>/dev/null | cut -d: -f1 | sed 's/\.md$//' | sort | paste -sd, - | sed 's/,/, /g' || true)
  if [ -n "$included" ]; then
    echo "Included: ${included}"
  else
    echo "Included: (none)"
  fi

  # Excluded: comma-separated, alphabetical
  if [ -s "${summary_dir}/${name}/excluded" ]; then
    excluded=$(sort -u "${summary_dir}/${name}/excluded" | paste -sd, - | sed 's/,/, /g')
    echo "Excluded: ${excluded}"
  fi

  # Overridden: comma-separated, alphabetical
  if [ -s "${summary_dir}/${name}/overridden" ]; then
    overridden=$(sort -u "${summary_dir}/${name}/overridden" | paste -sd, - | sed 's/,/, /g')
    echo "Overridden: ${overridden}"
  fi

  echo ""
done

echo "${total} ${CONFIG_NAME}s synced. ${added} added, ${updated} updated, ${unchanged} unchanged."
[ "$skipped" -gt 0 ] && echo "${skipped} excluded by config."
[ "$conflicts" -gt 0 ] && echo "${conflicts} conflicts resolved (first source wins)."
} > "$SUMMARY_FILE"

echo "Sync complete. Summary written to ${SUMMARY_FILE}"
exit 0
