#!/bin/bash
set -u
root=$1 task=$2 arm=$3 host=$4 trial=$5
pack=tests/skill-eval-cell/packs/lfg-stage-cost
case $task in
  zoom) fixture=tests/skill-eval-cell/fixtures/booking-zoom ;;
  *) fixture=tests/skill-eval-cell/fixtures/ideate-jot ;;
esac
out=$root/runs/$task-$arm-$host-$trial
mkdir -p "$root/runs"
if [ "$arm" = lfg ]; then
  env -u CLAUDECODE bun run test:skill-eval-cell -- --skill lfg --fixture "$fixture" --git-init --git-remote --shim-git-push \
    --with-skill ce-plan,ce-doc-review,ce-work,ce-simplify-code,ce-code-review,ce-commit-push-pr,ce-commit,ce-compound,ce-test-browser,ce-babysit-pr,ce-debug,ce-pov,ce-brainstorm \
    --hosts "$host" --reasoning-effort xhigh --out "$out" --timeout-secs 3600 --task-file "$pack/tasks/$task.md" >"$out.log" 2>&1
else
  env -u CLAUDECODE bun "$pack/vanilla.ts" --host "$host" --fixture "$fixture" --task-file "$pack/tasks/$task.md" --out "$out" --effort xhigh >"$out.log" 2>&1
fi
if [ "$task" = zoom ]; then node "$pack/check-booking.mjs" "$out/hosts/$host" >>"$out.log" 2>&1; fi
printf '{"task":"%s","arm":"%s","host":"%s","trial":%s,"out":"%s"}\n' "$task" "$arm" "$host" "$trial" "$out" >>"$root/runs.jsonl"
