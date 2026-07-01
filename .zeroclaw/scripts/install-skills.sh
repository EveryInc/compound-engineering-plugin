#!/usr/bin/env bash
# Copy Compound Engineering skills/ into ZeroClaw's workspace skills directory.
# ZeroClaw rejects symlinked skill directories at audit time — copies only.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SKILLS_SRC="$REPO_ROOT/skills"

usage() {
  cat <<'EOF'
Usage: install-skills.sh [--global | --dir PATH] [--include-manual] [--use-zeroclaw-cli]

  --global            Install into ~/.zeroclaw/workspace/skills/ (default)
  --dir PATH          Install into an explicit skills directory (per-agent workspace)
  --include-manual    Also install manual-only skills (disable-model-invocation: true)
  --use-zeroclaw-cli  Require the zeroclaw binary (runs audit + copy via native CLI)

Set ZEROCLAW_SKILLS_DIR to override the global destination.

CE skills ship bundled shell/Python scripts. Enable allow_scripts in
~/.zeroclaw/config.toml before installing:

  [skills]
  allow_scripts = true
EOF
  exit 1
}

SCOPE="--global"
DEST=""
INCLUDE_MANUAL=false
USE_ZEROCLAW_CLI=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --global)
      SCOPE="--global"
      shift
      ;;
    --dir)
      [[ $# -ge 2 ]] || usage
      SCOPE="--dir"
      DEST="$2"
      shift 2
      ;;
    --include-manual)
      INCLUDE_MANUAL=true
      shift
      ;;
    --use-zeroclaw-cli)
      USE_ZEROCLAW_CLI=true
      shift
      ;;
    *)
      usage
      ;;
  esac
done

case "$SCOPE" in
  --global)
    DEST="${ZEROCLAW_SKILLS_DIR:-$HOME/.zeroclaw/workspace/skills}"
    ;;
  --dir)
    [[ -n "$DEST" ]] || usage
    ;;
  *)
    usage
    ;;
esac

if [[ ! -d "$SKILLS_SRC" ]]; then
  echo "error: skills directory not found at $SKILLS_SRC" >&2
  exit 1
fi

if [[ "$USE_ZEROCLAW_CLI" == "true" ]] && ! command -v zeroclaw >/dev/null 2>&1; then
  echo "error: zeroclaw not found in PATH (--use-zeroclaw-cli)" >&2
  exit 1
fi

mkdir -p "$DEST"
installed=0
skipped=0
manual_omitted=0
manual_included=0
manual_removed=0

copy_skill() {
  local src="$1"
  local dest="$2"
  rm -rf "$dest"
  cp -R "$src" "$dest"
}

install_one() {
  local skill_dir="$1"
  local name="$2"
  local target="$DEST/$name"

  if command -v zeroclaw >/dev/null 2>&1; then
    zeroclaw skills remove "$name" >/dev/null 2>&1 || true
    if zeroclaw skills install "$skill_dir"; then
      echo "installed $name via zeroclaw -> $target"
      return 0
    fi
    if [[ "$USE_ZEROCLAW_CLI" == "true" ]]; then
      echo "error: zeroclaw install failed for $name (check [skills] allow_scripts)" >&2
      exit 1
    fi
    echo "warn $name: zeroclaw install failed — falling back to copy (check [skills] allow_scripts)" >&2
  elif [[ "$USE_ZEROCLAW_CLI" == "true" ]]; then
    echo "error: zeroclaw not found in PATH" >&2
    exit 1
  fi

  copy_skill "$skill_dir" "$target"
  echo "installed $name (copy) -> $target"
}

for skill_dir in "$SKILLS_SRC"/*/; do
  [[ -f "${skill_dir}SKILL.md" ]] || continue
  name="$(basename "$skill_dir")"
  is_manual=false

  if grep -qE '^disable-model-invocation:[[:space:]]*true[[:space:]]*$' "${skill_dir}SKILL.md"; then
    is_manual=true
    if [[ "$INCLUDE_MANUAL" != "true" ]]; then
      target="$DEST/$name"
      if [[ -e "$target" ]]; then
        rm -rf "$target"
        echo "removed $name: manual-only skill" >&2
        manual_removed=$((manual_removed + 1))
      fi
      echo "skip $name: manual-only (disable-model-invocation)" >&2
      manual_omitted=$((manual_omitted + 1))
      continue
    fi
    echo "warn $name: manual-only skill installed — ZeroClaw ignores disable-model-invocation" >&2
    manual_included=$((manual_included + 1))
  fi

  target="$DEST/$name"
  if [[ -e "$target" && ! -d "$target" ]]; then
    echo "skip $name: $target exists and is not a directory" >&2
    skipped=$((skipped + 1))
    continue
  fi

  install_one "$skill_dir" "$name"
  installed=$((installed + 1))
done

if [[ "$INCLUDE_MANUAL" == "true" ]]; then
  echo "done: $installed installed, $skipped skipped, $manual_included manual-only included (destination: $DEST)"
else
  echo "done: $installed installed, $skipped skipped, $manual_omitted manual-only omitted, $manual_removed manual-only removed (destination: $DEST)"
fi
