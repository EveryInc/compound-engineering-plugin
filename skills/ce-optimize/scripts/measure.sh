#!/bin/bash

# Measurement Runner
# Preflight-smokes a measurement command before controller attempts exist.
# Authoritative baseline/experiment measurement, stability repeats, aggregation,
# confinement, and lifecycle evidence belong to optimize-controller.py.
#
# Usage: measure.sh <command> <timeout_seconds> [working_directory]
#
# Arguments:
#   command          - Shell command to run (e.g., "python evaluate.py")
#   timeout_seconds  - Maximum seconds before killing the command
#   working_directory - Directory to run the command in (default: .)
#
# Output:
#   stdout: Raw JSON output from the measurement command
#   stderr: Passed through from the measurement command
#   exit code: Same as the measurement command (124 for timeout)

set -euo pipefail

# Parse arguments
COMMAND="${1:?Error: command argument required}"
TIMEOUT="${2:?Error: timeout_seconds argument required}"
shift 2

WORKDIR="."
if [[ $# -gt 0 ]] && [[ "$1" != *=* ]]; then
  WORKDIR="$1"
  shift
fi

if [[ $# -gt 0 ]]; then
  echo "Error: preflight measurement accepts no environment overrides" >&2
  exit 2
fi

# Change to working directory
cd "$WORKDIR" || {
  echo "Error: cannot cd to $WORKDIR" >&2
  exit 1
}

run_with_timeout() {
  if command -v timeout >/dev/null 2>&1; then
    env -i PATH=/usr/local/bin:/usr/bin:/bin HOME= LANG=C.UTF-8 LC_ALL=C.UTF-8 \
      timeout "$TIMEOUT" bash -c "$COMMAND"
    return
  fi

  if command -v gtimeout >/dev/null 2>&1; then
    env -i PATH=/usr/local/bin:/usr/bin:/bin HOME= LANG=C.UTF-8 LC_ALL=C.UTF-8 \
      gtimeout "$TIMEOUT" bash -c "$COMMAND"
    return
  fi

  if command -v python3 >/dev/null 2>&1; then
    env -i PATH=/usr/local/bin:/usr/bin:/bin HOME= LANG=C.UTF-8 LC_ALL=C.UTF-8 \
      python3 - "$TIMEOUT" "$COMMAND" <<'PY'
import os
import signal
import subprocess
import sys

timeout_seconds = int(sys.argv[1])
command = sys.argv[2]
proc = subprocess.Popen(["bash", "-c", command], start_new_session=True)

try:
    sys.exit(proc.wait(timeout=timeout_seconds))
except subprocess.TimeoutExpired:
    os.killpg(proc.pid, signal.SIGTERM)
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        os.killpg(proc.pid, signal.SIGKILL)
        proc.wait()
    sys.exit(124)
PY
    return
  fi

  echo "Error: no timeout implementation available (tried timeout, gtimeout, python3)" >&2
  exit 1
}

# Run the measurement command with timeout
# timeout returns 124 if the command times out
# We pass stdout and stderr through directly
run_with_timeout
