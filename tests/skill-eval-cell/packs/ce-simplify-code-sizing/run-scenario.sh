#!/usr/bin/env bash
# run-scenario.sh <scenario> <arm: post|pre> <trial> [hosts]
set -uo pipefail
S="$1"; ARM="$2"; T="$3"; HOSTS="${4:-claude,codex}"
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="${CE_REPO:-$(git -C "$HERE" rev-parse --show-toplevel)}"
EVAL="${EVAL_DIR:-/tmp/ce-simplify-sizing}"
PRE_REF=45f221138
OUT="$EVAL/runs/$S-$ARM-$T"; FIX="$EVAL/fixtures/$S-$ARM-$T"
[ -e "$OUT" ] && { echo "$OUT exists; pass a new trial number" >&2; exit 2; }
mkdir -p "$EVAL/runs" "$EVAL/fixtures"
SKILL=ce-simplify-code; WITH=()
CALLER=$'\n\nInvoked by the lfg skill as its step 3, after ce-work finished implementing. No one is available to answer questions.'
case "$S" in
  cut12) V=l12; TASK="mode:pipeline size-cutoff:30$CALLER" ;;
  cut12noise) V=l12noise; TASK="mode:pipeline size-cutoff:30$CALLER" ;;
  cut45) V=l45; TASK="mode:pipeline size-cutoff:30$CALLER" ;;
  nocut12) V=l12; TASK="mode:pipeline$CALLER" ;;
  s_bare12) V=l12; TASK='/ce-simplify-code' ;;
  lfg5) V=l5; SKILL=lfg; WITH=(--with-skill ce-simplify-code) ;;
  lfg_ae6) V=ae6; SKILL=lfg; WITH=(--with-skill ce-simplify-code) ;;
  *) echo "unknown scenario: $S" >&2; exit 2 ;;
esac
"$HERE/build-fixture.sh" "$FIX" "$V" >/dev/null || exit 2
if [ "$SKILL" = lfg ]; then
  FILES="src/orders.ts"; EXTRA=""
  if [ "$S" = lfg_ae6 ]; then
    FILES="src/orders.ts, tests/totals.test.ts, tests/discount.test.ts"
    EXTRA="simplified_through: $(cat "$FIX/.git/SIMPLIFIED_THROUGH")"$'\n'
  fi
  TASK="You are resuming this lfg run at step 3. Step 1's work source was a one-pass statement, so there is no plan. Step 2 invoked ce-work with mode:return-to-caller, and it returned:

status: complete
plan_path: null
changed_files: [$FILES]
verification_results: bun test passed
behavior_change: true
${EXTRA}standalone_shipping_skipped: true

Run step 3 only, then stop and report what step 3 did. No one is available to answer questions."
fi
REF=(); [ "$ARM" = pre ] && REF=(--ref "$PRE_REF")
cd "$REPO" && env -u CLAUDECODE bun run test:skill-eval-cell -- --skill "$SKILL" ${WITH[@]+"${WITH[@]}"} --fixture "$FIX" --hosts "$HOSTS" --timeout-secs 1500 ${REF[@]+"${REF[@]}"} --task "$TASK" --out "$OUT" > "$OUT.log" 2>&1
STATUS=$?; echo "done $S $ARM $T (exit $STATUS)"; exit $STATUS
