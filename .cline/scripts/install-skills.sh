#!/usr/bin/env bash
# Link Compound Engineering skills/ into Cline's skills discovery directory.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SKILLS_SRC="$REPO_ROOT/skills"

usage() {
  cat <<'EOF'
Usage: install-skills.sh [--global | --project] [--include-manual]

  --global          Link skills into ~/.cline/skills/ (default)
  --project         Link skills into ./.cline/skills/ under the current directory
  --include-manual  Also link manual-only skills (disable-model-invocation: true).
                    Cline has no manual-only gate — linked manual skills may auto-activate.

Set CLINE_SKILLS_DIR to override the global destination.
EOF
  exit 1
}

SCOPE="--global"
INCLUDE_MANUAL=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --global | --project)
      SCOPE="$1"
      shift
      ;;
    --include-manual)
      INCLUDE_MANUAL=true
      shift
      ;;
    *)
      usage
      ;;
  esac
done

if [[ "$SCOPE" == "--project" ]]; then
  DEST="$(pwd)/.cline/skills"
else
  DEST="${CLINE_SKILLS_DIR:-$HOME/.cline/skills}"
fi

if [[ ! -d "$SKILLS_SRC" ]]; then
  echo "error: skills directory not found at $SKILLS_SRC" >&2
  exit 1
fi

canonical_path() {
  python3 -c 'import os, sys; print(os.path.realpath(sys.argv[1]))' "$1"
}

SKILLS_ROOT_CANON="$(canonical_path "$SKILLS_SRC")"

is_ce_owned_skill_link() {
  local link_path="$1"
  [[ -L "$link_path" ]] || return 1

  local resolved
  resolved="$(canonical_path "$link_path")"
  [[ "$resolved" == "$SKILLS_ROOT_CANON/"* ]]
}

mkdir -p "$DEST"
linked=0
skipped=0
manual_omitted=0
manual_included=0
manual_removed=0

for skill_dir in "$SKILLS_SRC"/*/; do
  [[ -f "${skill_dir}SKILL.md" ]] || continue
  name="$(basename "$skill_dir")"
  target="$DEST/$name"
  is_manual=false

  if grep -qE '^disable-model-invocation:[[:space:]]*true[[:space:]]*$' "${skill_dir}SKILL.md"; then
    is_manual=true
    if [[ "$INCLUDE_MANUAL" != "true" ]]; then
      if is_ce_owned_skill_link "$target"; then
        rm "$target"
        echo "removed $name: stale CE manual-only symlink" >&2
        manual_removed=$((manual_removed + 1))
      fi
      echo "skip $name: manual-only (disable-model-invocation)" >&2
      manual_omitted=$((manual_omitted + 1))
      continue
    fi
    echo "warn $name: manual-only skill linked — Cline may auto-activate when descriptions match" >&2
    manual_included=$((manual_included + 1))
  fi

  if [[ -e "$target" && ! -L "$target" ]]; then
    echo "skip $name: $target exists and is not a symlink" >&2
    skipped=$((skipped + 1))
    continue
  fi

  if [[ -L "$target" ]] && ! is_ce_owned_skill_link "$target"; then
    echo "skip $name: $target is an existing user-managed symlink (not overwritten)" >&2
    skipped=$((skipped + 1))
    continue
  fi

  ln -sfn "$skill_dir" "$target"
  if [[ "$is_manual" == "true" ]]; then
    echo "linked $name (manual-only) -> $skill_dir"
  else
    echo "linked $name -> $skill_dir"
  fi
  linked=$((linked + 1))
done

if [[ "$INCLUDE_MANUAL" == "true" ]]; then
  echo "done: $linked linked, $skipped skipped, $manual_included manual-only included (destination: $DEST)"
else
  echo "done: $linked linked, $skipped skipped, $manual_omitted manual-only omitted, $manual_removed stale manual-only removed (destination: $DEST)"
fi
