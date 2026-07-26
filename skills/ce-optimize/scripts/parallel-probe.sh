#!/bin/bash

# Parallelism Probe
# Detects common parallelism blockers in the target project.
# Output is advisory -- the skill presents results to the user for approval.
#
# Usage: parallel-probe.sh <project_directory> [measurement_command] [measurement_workdir] [shared_file ...]
#
# Arguments:
#   project_directory   - Root directory of the project to probe
#   measurement_command - The measurement command from the spec (optional, for port detection)
#   measurement_workdir - Measurement working directory relative to project root (default: .)
#   shared_file         - Explicitly declared shared files that parallel runs depend on
#
# Output:
#   JSON to stdout with:
#     mode: "parallel" | "serial" | "user-decision"
#     blockers: [ { type, description, suggestion } ]

set -euo pipefail

PROJECT_INPUT="${1:?Error: project_directory argument required}"
shift
MEASUREMENT_CMD="${1:-}"
if [[ $# -gt 0 ]]; then shift; fi
MEASUREMENT_WORKDIR="${1:-.}"
if [[ $# -gt 0 ]]; then shift; fi
SHARED_FILES=()
if [[ $# -gt 0 ]]; then
  SHARED_FILES=("$@")
fi

if [[ ! -d "$PROJECT_INPUT" ]]; then
  echo '{"mode":"serial","blockers":[{"type":"error","description":"Cannot access project directory","suggestion":"Check path"}]}'
  exit 0
fi

PROJECT_DIR=$(cd "$PROJECT_INPUT" && pwd -P) || {
  echo '{"mode":"serial","blockers":[{"type":"error","description":"Cannot canonicalize project directory","suggestion":"Check path"}]}'
  exit 0
}
cd "$PROJECT_DIR"

if ! command -v python3 >/dev/null 2>&1; then
  echo '{"mode":"serial","blockers":[{"type":"missing_dependency","description":"python3 is required for structured probe output","suggestion":"Install python3 or skip the probe and review parallel-readiness manually"}],"blocker_count":1}'
  exit 0
fi

BLOCKERS="[]"
SCAN_PATHS=()
UNSAFE_PATH=0

add_blocker() {
  local type="$1"
  local desc="$2"
  local suggestion="$3"
  BLOCKERS=$(python3 - "$BLOCKERS" "$type" "$desc" "$suggestion" <<'PY'
import json
import sys

blockers = json.loads(sys.argv[1])
blockers.append({
    "type": sys.argv[2],
    "description": sys.argv[3],
    "suggestion": sys.argv[4],
})
print(json.dumps(blockers, separators=(",", ":")))
PY
  )
}

add_scan_path() {
  local candidate="$1"
  local component
  local cursor="$PROJECT_DIR"
  local canonical
  local nested
  local components=()

  if [[ -z "$candidate" ]]; then
    add_blocker "unsafe_path" "Declared probe path is empty" "Use a canonical repository-relative path"
    UNSAFE_PATH=1
    return
  fi

  if [[ "$candidate" == "." ]]; then
    SCAN_PATHS+=("$PROJECT_DIR")
    return
  fi

  if [[ "$candidate" == /* || "$candidate" == *$'\n'* || "$candidate" == *$'\r'* ]]; then
    add_blocker "unsafe_path" "Probe path must be repository-relative: $candidate" "Remove absolute paths and control characters"
    UNSAFE_PATH=1
    return
  fi

  IFS='/' read -r -a components <<< "$candidate"
  for component in "${components[@]}"; do
    if [[ -z "$component" || "$component" == "." || "$component" == ".." ]]; then
      add_blocker "unsafe_path" "Probe path escapes or is not canonical: $candidate" "Use a normalized path beneath the project root"
      UNSAFE_PATH=1
      return
    fi
    if [[ "$component" == .env* ]]; then
      add_blocker "unsafe_path" ".env* material is not a probe or shared input: $candidate" "Remove .env* from declared inputs"
      UNSAFE_PATH=1
      return
    fi
    cursor="$cursor/$component"
    if [[ -L "$cursor" ]]; then
      add_blocker "unsafe_path" "Probe path contains a symlink: $candidate" "Use the canonical non-symlink path within the project"
      UNSAFE_PATH=1
      return
    fi
  done

  if [[ ! -e "$cursor" ]]; then
    add_blocker "unsafe_path" "Declared probe path does not exist: $candidate" "Fix or remove the declared path"
    UNSAFE_PATH=1
    return
  fi

  if [[ -d "$cursor" ]]; then
    canonical=$(cd "$cursor" && pwd -P)
    nested=$(find "$cursor" -maxdepth 4 -type l -print -quit 2>/dev/null || true)
    if [[ -n "$nested" ]]; then
      add_blocker "unsafe_path" "Probe directory contains a symlink: $candidate" "Remove symlinked inputs or run serially after review"
      UNSAFE_PATH=1
      return
    fi
    nested=$(find "$cursor" -maxdepth 4 -name '.env*' -print -quit 2>/dev/null || true)
    if [[ -n "$nested" ]]; then
      add_blocker "unsafe_path" "Probe directory contains .env* material: $candidate" "Remove .env* from routed measurement/shared scope"
      UNSAFE_PATH=1
      return
    fi
    nested=$(find "$cursor" -maxdepth 4 ! -type f ! -type d -print -quit 2>/dev/null || true)
    if [[ -n "$nested" ]]; then
      add_blocker "unsafe_path" "Probe directory contains non-regular material: $candidate" "Use only regular files and directories"
      UNSAFE_PATH=1
      return
    fi
  elif [[ -f "$cursor" ]]; then
    canonical=$(cd "$(dirname "$cursor")" && pwd -P)/$(basename "$cursor")
  else
    add_blocker "unsafe_path" "Probe path is not a regular file or directory: $candidate" "Use a regular in-repository input"
    UNSAFE_PATH=1
    return
  fi

  case "$canonical" in
    "$PROJECT_DIR"|"$PROJECT_DIR"/*) SCAN_PATHS+=("$canonical") ;;
    *)
      add_blocker "unsafe_path" "Probe path resolves outside the project: $candidate" "Use a canonical in-project path"
      UNSAFE_PATH=1
      ;;
  esac
}

path_is_declared() {
  local target="$1"
  local declared
  for declared in "${SCAN_PATHS[@]}"; do
    if [[ "$target" == "$declared" || "$target" == "$declared"/* ]]; then
      return 0
    fi
  done
  return 1
}

add_scan_path "$MEASUREMENT_WORKDIR"

if [[ ${#SHARED_FILES[@]} -gt 0 ]]; then
  for shared_file in "${SHARED_FILES[@]}"; do
    add_scan_path "$shared_file"
  done
fi

# Check 1: Hardcoded ports in measurement command
if [[ -n "$MEASUREMENT_CMD" ]]; then
  # Look for common port patterns in the command itself
  if echo "$MEASUREMENT_CMD" | grep -qE '(--port(?:\s+|=)[0-9]+|:\s*[0-9]{4,5}|PORT=[0-9]+|localhost:[0-9]+)'; then
    add_blocker "port" "Measurement command contains hardcoded port reference" "Parameterize port via environment variable (e.g., PORT=\$EVAL_PORT)"
  fi
fi

if [[ ${#SCAN_PATHS[@]} -gt 0 ]]; then
  # Check 2: SQLite databases in the measurement workdir or declared shared files
  SQLITE_FILE=$(find "${SCAN_PATHS[@]}" -maxdepth 4 -type f \( -name '*.db' -o -name '*.sqlite' -o -name '*.sqlite3' \) ! -path '*/.git/*' ! -path '*/node_modules/*' ! -path '*/.claude/*' ! -path '*/.context/*' ! -path '*/.worktrees/*' -print -quit 2>/dev/null || true)
  if [[ -n "$SQLITE_FILE" ]] && path_is_declared "$SQLITE_FILE"; then
    add_blocker "shared_file" "Found a SQLite database in declared probe scope" "Copy each required database through parallel.shared_files or run serially"
  fi

  # Check 3: Lock/PID files in the measurement workdir or declared shared files
  LOCK_FILE=$(find "${SCAN_PATHS[@]}" -maxdepth 4 -type f \( -name '*.lock' -o -name '*.pid' \) ! -path '*/.git/*' ! -path '*/node_modules/*' ! -path '*/.claude/*' ! -path '*/.context/*' ! -path '*/.worktrees/*' ! -name 'package-lock.json' ! -name 'yarn.lock' ! -name 'bun.lock' ! -name 'bun.lockb' ! -name 'Gemfile.lock' ! -name 'poetry.lock' ! -name 'Cargo.lock' -print -quit 2>/dev/null || true)
  if [[ -n "$LOCK_FILE" ]] && path_is_declared "$LOCK_FILE"; then
    add_blocker "lock_file" "Found a lock/PID file in declared probe scope" "Ensure the measurement command cleans it up, or run serially"
  fi
fi

# Check 4: Exclusive resource hints in the measurement command
if [[ -n "$MEASUREMENT_CMD" ]] && echo "$MEASUREMENT_CMD" | grep -qiE '(cuda|gpu|tensorflow|torch|nvidia-smi|CUDA_VISIBLE_DEVICES)'; then
  add_blocker "exclusive_resource" "Measurement command appears to use GPU or another exclusive accelerator" "GPU is typically an exclusive resource -- consider serial mode or device parameterization"
fi

# Determine mode
BLOCKER_COUNT=$(python3 - "$BLOCKERS" <<'PY'
import json
import sys
print(len(json.loads(sys.argv[1])))
PY
)

if [[ "$UNSAFE_PATH" == "1" ]]; then
  MODE="serial"
elif [[ "$BLOCKER_COUNT" == "0" ]]; then
  MODE="parallel"
elif python3 - "$BLOCKERS" <<'PY'
import json
import sys
raise SystemExit(0 if any(item["type"] == "exclusive_resource" for item in json.loads(sys.argv[1])) else 1)
PY
then
  MODE="serial"
else
  MODE="user-decision"
fi

# Output JSON result
python3 - "$MODE" "$BLOCKERS" <<'PY'
import json
import sys

blockers = json.loads(sys.argv[2])
print(json.dumps({
    "mode": sys.argv[1],
    "blockers": blockers,
    "blocker_count": len(blockers),
}, indent=2))
PY
