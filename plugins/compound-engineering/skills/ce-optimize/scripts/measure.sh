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
#   exit code: Same as the measurement command (124 for timeout)

set -euo pipefail

# Parse arguments
COMMAND="${1:?Error: command argument required}"
TIMEOUT="${2:?Error: timeout_seconds argument required}"
WORKDIR="${3:-.}"

# Shift past the first 3 arguments to get env vars
shift 3 2>/dev/null || shift $# 2>/dev/null || true

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

# Run the measurement command with timeout
# timeout returns 124 if the command times out
# We pass stdout and stderr through directly
timeout "$TIMEOUT" bash -c "$COMMAND"
