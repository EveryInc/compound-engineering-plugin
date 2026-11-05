#!/bin/bash
set -eu
host=${1:-claude}
pack=tests/skill-eval-cell/packs/lfg-stage-cost
root=$(mktemp -d "${TMPDIR:-/tmp}/lfg-stage-cost-measure.XXXXXX")
bash "$pack/run-one.sh" "$root" small lfg "$host" 1 &
bash "$pack/run-one.sh" "$root" zoom lfg "$host" 1 &
wait
bun "$pack/collect.ts" --runs "$root/runs.jsonl" --out "$root/report.json" --json
