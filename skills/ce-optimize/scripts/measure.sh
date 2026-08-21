#!/bin/bash

# Measurement Runner
# Runs a measurement command, captures JSON output, and handles timeouts.
# The orchestrating agent (not this script) evaluates gates and handles
# stability repeats.
#
# Usage: measure.sh <command> <timeout_seconds> [working_directory] [KEY=VALUE ...]
#
# Arguments:
#   command          - Shell command to run (e.g., "python evaluate.py")
#   timeout_seconds  - Maximum seconds before killing the command
#   working_directory - Directory to run the command in (default: .)
#   KEY=VALUE        - Optional environment variables to set before running
#
# Output:
#   stdout: Raw JSON output from the measurement command
#   stderr: Passed through from the measurement command
#   exit code: Same as the measurement command (124 for timeout, 125 when
#              CE_OPTIMIZE_CENSOR_AFTER fires before timeout_seconds)

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

# Set any KEY=VALUE environment variables
for arg in "$@"; do
  if [[ "$arg" == *=* ]]; then
    export "$arg"
  fi
done

# Change to working directory
cd "$WORKDIR" || {
  echo "Error: cannot cd to $WORKDIR" >&2
  exit 1
}

run_timed_command() {
  local timeout_bin="$1"
  if [[ -n "${CENSOR_STATUS_FILE:-}" ]]; then
    "$timeout_bin" "$TIMEOUT" bash -c 'bash -c "$1"; printf "%s\n" "$?" > "$2"; exit 0' _ "$COMMAND" "$CENSOR_STATUS_FILE"
    return
  fi
  "$timeout_bin" "$TIMEOUT" bash -c "$COMMAND"
}

run_with_timeout() {
  if command -v timeout >/dev/null 2>&1; then
    run_timed_command timeout
    return
  fi

  if command -v gtimeout >/dev/null 2>&1; then
    run_timed_command gtimeout
    return
  fi

  PY=""
  for c in python3 python py; do
    if command -v "$c" >/dev/null 2>&1 && "$c" -c '' >/dev/null 2>&1; then
      PY="$c"
      break
    fi
  done
  if [ -n "$PY" ]; then
    "$PY" - "$TIMEOUT" "$COMMAND" "${CENSOR_STATUS_FILE:-}" <<'PY'
import os
import signal
import subprocess
import sys

timeout_seconds = float(sys.argv[1])
command = sys.argv[2]
status_file = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] else ""
proc = subprocess.Popen(["bash", "-c", command], start_new_session=True)

try:
    rc = proc.wait(timeout=timeout_seconds)
    if status_file:
        with open(status_file, "w", encoding="utf-8") as fh:
            fh.write(f"{rc}\n")
        sys.exit(0)
    sys.exit(rc)
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

  echo "Error: no timeout implementation available (tried timeout, gtimeout, and a working Python 3 interpreter)" >&2
  exit 1
}

# Optional futility bound: CE_OPTIMIZE_CENSOR_AFTER=<seconds> kills a live
# run that has already exceeded a predeclared noncompetitive bound. Distinct
# from timeout_seconds (the spec's hard cap). Exit 125 means censored; 124
# still means the configured timeout fired.
CENSOR_AFTER="${CE_OPTIMIZE_CENSOR_AFTER:-}"
CENSORING=0
CENSOR_STATUS_FILE=""
if [[ -n "$CENSOR_AFTER" ]] && awk -v a="$CENSOR_AFTER" -v t="$TIMEOUT" 'BEGIN { exit !(a ~ /^[0-9]+(\.[0-9]+)?$/ && t+0 == t && a+0 > 0 && a+0 < t+0) }'; then
  TIMEOUT="$CENSOR_AFTER"
  CENSORING=1
  CENSOR_STATUS_FILE=$(mktemp "${TMPDIR:-/tmp}/ce-optimize-censor-XXXXXX")
fi

# Run the measurement command with timeout
# timeout returns 124 if the command times out
# We pass stdout and stderr through directly
set +e
run_with_timeout
status=$?
set -e
if [[ $CENSORING -eq 1 ]]; then
  if [[ -s "$CENSOR_STATUS_FILE" ]]; then
    status=$(cat "$CENSOR_STATUS_FILE")
  elif [[ $status -eq 124 ]]; then
    echo "Error: measurement censored after ${CENSOR_AFTER}s (noncompetitive bound)" >&2
    rm -f "$CENSOR_STATUS_FILE"
    exit 125
  fi
  rm -f "$CENSOR_STATUS_FILE"
fi
exit "$status"
