#!/usr/bin/env bash
# Link Compound Engineering skills/ into Cline's skills discovery directory.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SKILLS_SRC="$REPO_ROOT/skills"

usage() {
  cat <<'EOF'
Usage: install-skills.sh [--global | --project]

  --global   Link skills into ~/.cline/skills/ (default)
  --project  Link skills into ./.cline/skills/ under the current directory

Set CLINE_SKILLS_DIR to override the global destination.
EOF
  exit 1
}

SCOPE="--global"
if [[ $# -gt 1 ]]; then
  usage
fi
if [[ $# -eq 1 ]]; then
  SCOPE="$1"
fi

case "$SCOPE" in
  --global)
    DEST="${CLINE_SKILLS_DIR:-$HOME/.cline/skills}"
    ;;
  --project)
    DEST="$(pwd)/.cline/skills"
    ;;
  *)
    usage
    ;;
esac

if [[ ! -d "$SKILLS_SRC" ]]; then
  echo "error: skills directory not found at $SKILLS_SRC" >&2
  exit 1
fi

mkdir -p "$DEST"
linked=0
skipped=0

for skill_dir in "$SKILLS_SRC"/*/; do
  [[ -f "${skill_dir}SKILL.md" ]] || continue
  name="$(basename "$skill_dir")"
  target="$DEST/$name"

  if [[ -e "$target" && ! -L "$target" ]]; then
    echo "skip $name: $target exists and is not a symlink" >&2
    skipped=$((skipped + 1))
    continue
  fi

  ln -sfn "$skill_dir" "$target"
  echo "linked $name -> $skill_dir"
  linked=$((linked + 1))
done

echo "done: $linked linked, $skipped skipped (destination: $DEST)"
