#!/bin/bash

# Parallelism Probe
# Detects common parallelism blockers in the target project.
# Output is advisory -- the skill presents results to the user for approval.
#
# Usage: parallel-probe.sh <project_directory> [measurement_command]
#
# Arguments:
#   project_directory   - Root directory of the project to probe
#   measurement_command - The measurement command from the spec (optional, for port detection)
#
# Output:
#   JSON to stdout with:
#     mode: "parallel" | "serial" | "user-decision"
#     blockers: [ { type, description, suggestion } ]

set -euo pipefail

PROJECT_DIR="${1:?Error: project_directory argument required}"
MEASUREMENT_CMD="${2:-}"

cd "$PROJECT_DIR" || {
  echo '{"mode":"serial","blockers":[{"type":"error","description":"Cannot access project directory","suggestion":"Check path"}]}'
  exit 0
}

BLOCKERS="[]"

add_blocker() {
  local type="$1"
  local desc="$2"
  local suggestion="$3"
  BLOCKERS=$(echo "$BLOCKERS" | python3 -c "
import json, sys
b = json.load(sys.stdin)
b.append({'type': '$type', 'description': '''$desc''', 'suggestion': '''$suggestion'''})
print(json.dumps(b))
" 2>/dev/null || echo "$BLOCKERS")
}

# Check 1: Hardcoded ports in measurement command
if [[ -n "$MEASUREMENT_CMD" ]]; then
  # Look for common port patterns in the command itself
  if echo "$MEASUREMENT_CMD" | grep -qE '(--port\s+[0-9]+|:\s*[0-9]{4,5}|PORT=[0-9]+|localhost:[0-9]+)'; then
    add_blocker "port" "Measurement command contains hardcoded port reference" "Parameterize port via environment variable (e.g., PORT=\$EVAL_PORT)"
  fi
fi

# Check 2: Hardcoded ports in config files
PORT_FILES=$(grep -rl --include='*.yaml' --include='*.yml' --include='*.json' --include='*.toml' --include='*.cfg' --include='*.ini' --include='*.env' -E '(port:\s*[0-9]{4,5}|PORT\s*=\s*[0-9]{4,5}|"port":\s*[0-9]{4,5})' . 2>/dev/null | head -10 || true)
if [[ -n "$PORT_FILES" ]]; then
  FILE_COUNT=$(echo "$PORT_FILES" | wc -l | tr -d ' ')
  add_blocker "port" "Found hardcoded port numbers in $FILE_COUNT config file(s)" "Parameterize ports via environment variables"
fi

# Check 3: SQLite databases
SQLITE_FILES=$(find . -maxdepth 4 -type f \( -name '*.db' -o -name '*.sqlite' -o -name '*.sqlite3' \) ! -path './.git/*' ! -path './node_modules/*' 2>/dev/null | head -10 || true)
if [[ -n "$SQLITE_FILES" ]]; then
  FILE_COUNT=$(echo "$SQLITE_FILES" | wc -l | tr -d ' ')
  add_blocker "shared_file" "Found $FILE_COUNT SQLite database file(s)" "Copy database files into each experiment worktree"
fi

# Check 4: Lock/PID files
LOCK_FILES=$(find . -maxdepth 4 -type f \( -name '*.lock' -o -name '*.pid' \) ! -path './.git/*' ! -path './node_modules/*' ! -name 'package-lock.json' ! -name 'yarn.lock' ! -name 'bun.lockb' ! -name 'Gemfile.lock' ! -name 'poetry.lock' ! -name 'Cargo.lock' 2>/dev/null | head -10 || true)
if [[ -n "$LOCK_FILES" ]]; then
  FILE_COUNT=$(echo "$LOCK_FILES" | wc -l | tr -d ' ')
  add_blocker "lock_file" "Found $FILE_COUNT lock/PID file(s) that may cause contention" "Ensure measurement command cleans up lock files, or run in serial mode"
fi

# Check 5: GPU references
GPU_FILES=$(grep -rl --include='*.py' --include='*.rs' --include='*.cpp' --include='*.cu' -E '(torch\.device|cuda|gpu|tensorflow|tf\.config)' . 2>/dev/null | head -5 || true)
if [[ -n "$GPU_FILES" ]]; then
  add_blocker "exclusive_resource" "Found GPU/CUDA references in source files" "GPU is typically an exclusive resource -- consider serial mode or GPU device parameterization"
fi

# Determine mode
BLOCKER_COUNT=$(echo "$BLOCKERS" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")

if [[ "$BLOCKER_COUNT" == "0" ]]; then
  MODE="parallel"
elif echo "$BLOCKERS" | python3 -c "import json,sys; b=json.load(sys.stdin); exit(0 if any(x['type']=='exclusive_resource' for x in b) else 1)" 2>/dev/null; then
  MODE="serial"
else
  MODE="user-decision"
fi

# Output JSON result
python3 -c "
import json
print(json.dumps({
    'mode': '$MODE',
    'blockers': $BLOCKERS,
    'blocker_count': $BLOCKER_COUNT
}, indent=2))
"
