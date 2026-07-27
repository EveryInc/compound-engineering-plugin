#!/bin/bash

# Baseline Measurement Runner
# Routes Phase 1 through the Optimize controller's frozen confinement and
# supervision. It never executes a caller-supplied shell command directly.
#
# Usage: measure.sh <run-id>
#
# Arguments:
#   run-id - Existing controller run whose frozen measurement is the baseline
#
# Output:
#   Controller baseline receipt with validated scalar metrics

set -euo pipefail

RUN_ID="${1:?Error: run-id argument required}"
if [[ $# -ne 1 ]]; then
  echo "Error: baseline measurement accepts only a controller run id" >&2
  exit 2
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
exec python3 -I -S "$SCRIPT_DIR/optimize-controller.py" baseline --run-id "$RUN_ID"
