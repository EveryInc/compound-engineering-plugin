#!/usr/bin/env bash
# Copy Compound Engineering skills/ into ZeroClaw agent workspace skills directories.
# ZeroClaw rejects symlinked skill directories at audit time — copies only.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SKILLS_SRC="$REPO_ROOT/skills"
SHARED_BUNDLE="compound_engineering"

expand_path() {
  local path="$1"
  case "$path" in
    "~")
      printf '%s\n' "$HOME"
      ;;
    "~/"*)
      printf '%s\n' "$HOME/${path:2}"
      ;;
    *)
      printf '%s\n' "$path"
      ;;
  esac
}

resolve_config_dir_for_data() {
  local data_dir
  data_dir="$(expand_path "$1")"

  if [[ -f "$data_dir/config.toml" ]]; then
    printf '%s\n' "$data_dir"
    return
  fi

  local legacy_dir="${data_dir%/}/../.zeroclaw"
  legacy_dir="$(cd "$(dirname "$data_dir")" && pwd)/.zeroclaw"

  if [[ -f "$legacy_dir/config.toml" ]]; then
    printf '%s\n' "$legacy_dir"
    return
  fi

  local base
  base="$(basename "$data_dir")"
  if [[ "$base" == "data" || "$base" == "workspace" ]]; then
    printf '%s\n' "$legacy_dir"
    return
  fi

  printf '%s\n' "$data_dir"
}

resolve_install_root() {
  if [[ -n "${ZEROCLAW_INSTALL_ROOT:-}" ]]; then
    expand_path "$ZEROCLAW_INSTALL_ROOT"
    return
  fi
  if [[ -n "${ZEROCLAW_CONFIG_DIR:-}" ]]; then
    expand_path "$ZEROCLAW_CONFIG_DIR"
    return
  fi
  if [[ -n "${ZEROCLAW_DATA_DIR:-}" ]]; then
    resolve_config_dir_for_data "$ZEROCLAW_DATA_DIR"
    return
  fi
  if [[ -n "${ZEROCLAW_WORKSPACE:-}" ]]; then
    resolve_config_dir_for_data "$ZEROCLAW_WORKSPACE"
    return
  fi
  printf '%s\n' "$HOME/.zeroclaw"
}

INSTALL_ROOT="$(resolve_install_root)"

usage() {
  cat <<'EOF'
Usage: install-skills.sh [--global | --agent ALIAS | --shared | --dir PATH] [--include-manual]

  --global            Install into the default agent workspace (same as --agent default)
  --agent ALIAS       Install into the agent's workspace skills directory
  --agent all         Install into every configured agent workspace
  --shared            Install bundle at <install>/shared/skills/compound_engineering/
  --dir PATH          Install into an explicit skills directory
  --include-manual    Also install manual-only skills (disable-model-invocation: true)

Set ZEROCLAW_INSTALL_ROOT to override the install root explicitly.
When unset, install root follows ZeroClaw runtime precedence:
  ZEROCLAW_CONFIG_DIR > ZEROCLAW_DATA_DIR > ZEROCLAW_WORKSPACE > ~/.zeroclaw

Per-agent destinations honor [agents.<alias>.workspace.path] when set in config.toml.

ZeroClaw v0.8+ loads agent skills from per-agent workspace paths, not the legacy
~/.zeroclaw/workspace/skills tree. This script does not call zeroclaw skills install
(that CLI writes to config.data_dir/skills, which agents do not read).

For --shared, add to <install>/config.toml:

  [skill_bundles.compound_engineering]

  [agents.default]
  skill_bundles = ["compound_engineering"]

CE skills ship bundled shell/Python scripts. Enable allow_scripts before use:

  [skills]
  allow_scripts = true
EOF
  exit 1
}

SCOPE="--global"
AGENT_ALIAS="default"
DEST=""
INCLUDE_MANUAL=false
DESTS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --global)
      SCOPE="--global"
      shift
      ;;
    --agent)
      [[ $# -ge 2 ]] || usage
      SCOPE="--agent"
      AGENT_ALIAS="$2"
      shift 2
      ;;
    --shared)
      SCOPE="--shared"
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
      echo "warn: --use-zeroclaw-cli is deprecated and ignored (zeroclaw skills install targets data_dir, not agent workspaces)" >&2
      shift
      ;;
    *)
      usage
      ;;
  esac
done

read_agent_workspace_path() {
  local alias="$1"
  local config="$INSTALL_ROOT/config.toml"

  [[ -f "$config" ]] || return 0

  awk -v alias="$alias" '
    function trim(s) {
      sub(/^[ \t]+/, "", s)
      sub(/[ \t]+$/, "", s)
      return s
    }
    function unquote(s) {
      s = trim(s)
      if (s ~ /^".*"$/) {
        sub(/^"/, "", s)
        sub(/"$/, "", s)
      } else if (s ~ /^'\''.*'\''$/) {
        sub(/^'\''/, "", s)
        sub(/'\''$/, "", s)
      }
      return s
    }
    /^\[agents\./ {
      in_agent = ($0 == "[agents." alias "]" || $0 == "[agents.\"" alias "\"]")
      in_workspace = ($0 == "[agents." alias ".workspace]" || $0 == "[agents.\"" alias "\".workspace]")
      next
    }
    in_workspace && /^[ \t]*path[ \t]*=/ {
      sub(/^[ \t]*path[ \t]*=[ \t]*/, "")
      print unquote($0)
      exit
    }
    in_agent && /^[ \t]*workspace[ \t]*=[ \t]*\{/ {
      line = $0
      sub(/^[ \t]*workspace[ \t]*=[ \t]*\{[ \t]*/, "", line)
      sub(/\}[ \t]*$/, "", line)
      split(line, parts, /,[ \t]*/)
      for (i in parts) {
        if (parts[i] ~ /^path[ \t]*=/) {
          sub(/^path[ \t]*=[ \t]*/, "", parts[i])
          print unquote(parts[i])
          exit
        }
      }
    }
  ' "$config"
}

agent_configured() {
  local alias="$1"
  local config="$INSTALL_ROOT/config.toml"

  if [[ -f "$config" ]] && grep -qE "^\[agents\.(${alias}|\"${alias}\")\]" "$config"; then
    return 0
  fi

  if [[ -d "$INSTALL_ROOT/agents/$alias" && ! -f "$config" ]]; then
    return 0
  fi

  return 1
}

require_agent() {
  local alias="$1"
  if agent_configured "$alias"; then
    return 0
  fi

  echo "error: agent '$alias' not configured under $INSTALL_ROOT — run zeroclaw quickstart or pass --agent with a valid alias" >&2
  exit 1
}

agent_skills_dir() {
  local alias="$1"
  local custom_path

  custom_path="$(read_agent_workspace_path "$alias")"
  if [[ -n "$custom_path" ]]; then
    printf '%s\n' "$(expand_path "$custom_path")/skills"
    return
  fi

  printf '%s\n' "$INSTALL_ROOT/agents/$alias/workspace/skills"
}

list_configured_agent_aliases() {
  local config="$INSTALL_ROOT/config.toml"
  [[ -f "$config" ]] || return 1

  awk '
    /^\[agents\.([a-zA-Z0-9_-]+|\"[^\"]+\")\]$/ {
      line = $0
      sub(/^\[agents\./, "", line)
      sub(/\]$/, "", line)
      gsub(/^"|"$/, "", line)
      print line
    }
  ' "$config"
}

resolve_destinations() {
  case "$SCOPE" in
    --global | --agent)
      if [[ "$AGENT_ALIAS" == "all" ]]; then
        local aliases=()
        local alias_name

        while IFS= read -r alias_name; do
          [[ -n "$alias_name" ]] || continue
          aliases+=("$alias_name")
        done < <(list_configured_agent_aliases || true)

        if [[ ${#aliases[@]} -eq 0 ]]; then
          if [[ ! -d "$INSTALL_ROOT/agents" ]]; then
            echo "error: no agents directory at $INSTALL_ROOT/agents" >&2
            exit 1
          fi
          local agent_dir
          for agent_dir in "$INSTALL_ROOT/agents"/*/; do
            [[ -d "$agent_dir" ]] || continue
            alias_name="$(basename "$agent_dir")"
            if agent_configured "$alias_name"; then
              aliases+=("$alias_name")
            fi
          done
        fi

        if [[ ${#aliases[@]} -eq 0 ]]; then
          echo "error: no configured agents found under $INSTALL_ROOT" >&2
          exit 1
        fi

        for alias_name in "${aliases[@]}"; do
          DESTS+=("$(agent_skills_dir "$alias_name")")
        done
      else
        require_agent "$AGENT_ALIAS"
        DESTS+=("$(agent_skills_dir "$AGENT_ALIAS")")
      fi
      ;;
    --shared)
      DESTS+=("$INSTALL_ROOT/shared/skills/$SHARED_BUNDLE")
      ;;
    --dir)
      [[ -n "$DEST" ]] || usage
      DESTS+=("$DEST")
      ;;
    *)
      usage
      ;;
  esac
}

if [[ ! -d "$SKILLS_SRC" ]]; then
  echo "error: skills directory not found at $SKILLS_SRC" >&2
  exit 1
fi

resolve_destinations

copy_skill() {
  local src="$1"
  local dest="$2"
  rm -rf "$dest"
  cp -R "$src" "$dest"
}

install_to_dest() {
  local dest="$1"
  local installed=0
  local skipped=0
  local manual_omitted=0
  local manual_included=0
  local manual_removed=0

  mkdir -p "$dest"

  for skill_dir in "$SKILLS_SRC"/*/; do
    [[ -f "${skill_dir}SKILL.md" ]] || continue
    local name
    name="$(basename "$skill_dir")"
    local is_manual=false

    if grep -qE '^disable-model-invocation:[[:space:]]*true[[:space:]]*$' "${skill_dir}SKILL.md"; then
      is_manual=true
      if [[ "$INCLUDE_MANUAL" != "true" ]]; then
        local target="$dest/$name"
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

    local target="$dest/$name"
    if [[ -e "$target" && ! -d "$target" ]]; then
      echo "skip $name: $target exists and is not a directory" >&2
      skipped=$((skipped + 1))
      continue
    fi

    copy_skill "$skill_dir" "$target"
    echo "installed $name -> $target"
    installed=$((installed + 1))
  done

  if [[ "$INCLUDE_MANUAL" == "true" ]]; then
    echo "done: $installed installed, $skipped skipped, $manual_included manual-only included (destination: $dest)"
  else
    echo "done: $installed installed, $skipped skipped, $manual_omitted manual-only omitted, $manual_removed manual-only removed (destination: $dest)"
  fi
}

for dest in "${DESTS[@]}"; do
  install_to_dest "$dest"
done

if [[ ${#DESTS[@]} -gt 1 ]]; then
  echo "completed installs for ${#DESTS[@]} destinations under $INSTALL_ROOT"
fi
