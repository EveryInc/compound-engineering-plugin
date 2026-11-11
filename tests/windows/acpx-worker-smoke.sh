#!/usr/bin/env bash
# Runs the ce-pov acpx worker through peer-job-runner.py with a stub `npx`, the
# way a host starts a peer, and checks a published result, an idle reap that
# leaves no stub process behind, and (on native Windows) opencode reported
# unavailable. Written for Git Bash on the windows-native CI job; it also runs
# on macOS and Linux.
#   bash tests/windows/acpx-worker-smoke.sh
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORKER="$REPO/skills/ce-pov/scripts/cross-model-pov.sh"
RUNNER="$REPO/skills/ce-pov/scripts/peer-job-runner.py"
PY="$(for c in python python3 py; do command -v "$c" >/dev/null 2>&1 && "$c" -c '' >/dev/null 2>&1 && { echo "$c"; break; }; done)"
[ -n "$PY" ] || { echo "no working Python on PATH" >&2; exit 1; }
# Resolve real executables: version-manager shims break once HOME is swapped below.
PY="$("$PY" -c 'import sys; print(sys.executable)')"
NODE="$(node -p 'process.execPath')"

ROOT="$(mktemp -d)"
trap 'rm -rf "$ROOT"' EXIT
BIN="$ROOT/bin"; HOME_DIR="$ROOT/home"; SCRATCH="$ROOT/scratch"; READ_ROOT="$ROOT/repo"
mkdir -p "$BIN" "$HOME_DIR" "$SCRATCH" "$READ_ROOT"
export CE_PEER_JOBS_ROOT="$ROOT/jobs"
cp "$REPO/tests/fixtures/acp-stub-npx.sh" "$BIN/npx"
for exe in "$NODE" "$PY"; do ln -s "$exe" "$BIN/$(basename "$exe")" 2>/dev/null || cp "$exe" "$BIN/"; done
[ -e "$BIN/python3" ] || ln -s "$PY" "$BIN/python3" 2>/dev/null || true
printf '#!/bin/sh\nexit 0\n' > "$BIN/codex"
printf '#!/bin/sh\nexit 0\n' > "$BIN/opencode"
chmod +x "$BIN/npx" "$BIN/codex" "$BIN/opencode"
printf 'Subject: choose A or B\n' > "$ROOT/payload.md"

fail() { echo "FAIL: $*" >&2; exit 1; }

# Writes a canned acpx stream whose reply is a final POV; $2 > 0 makes the stub
# go silent for that many seconds without finishing the turn.
stream() {   # <base> <sleep-secs>
  local pov='{\"voice\":\"peer\",\"position\":\"Choose A\",\"reasoning\":\"Lower cost\",\"evidence\":[\"README\"],\"external_check\":\"unavailable\",\"mode\":\"independent\",\"movement\":\"initial\",\"final\":true}'
  {
    printf '{"jsonrpc":"2.0","id":2,"method":"session/prompt","params":{"sessionId":"s","prompt":[{"type":"text","text":"brief"}]}}\n'
    printf '{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"s","update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"%s"}}}}\n' "$pov"
    [ "$2" -gt 0 ] || printf '{"jsonrpc":"2.0","id":2,"result":{"stopReason":"end_turn","_meta":{"modelId":"gpt-6.1-sol"}}}\n'
  } > "$1.stdout"
  echo 0 > "$1.exit"
  [ "$2" -gt 0 ] && echo "$2" > "$1.sleep"
  return 0
}

# Starts one worker job through the runner and waits for it to settle.
run_job() {   # <label> <route> <stream-base> [extra env...]
  local label="$1" route="$2" base="$3" run_dir="$ROOT/run-$1" job
  shift 3
  mkdir -p "$run_dir"
  job="$(env PATH="$BIN:$PATH" HOME="$HOME_DIR" ACP_STUB_NPX_STREAM="$base" ACP_STUB_NPX_PID_FILE="$ROOT/$label.pids" \
    CROSS_MODEL_CODEX_APP_DIRS="$ROOT/nobundle" "$@" \
    "$PY" "$RUNNER" start --skill ce-pov --run-id "smoke-$label" --label "$label" --result-path "$run_dir/pov-$label.json" -- \
    env CROSS_MODEL_REPO_ROOT="$READ_ROOT" CROSS_MODEL_READ_ROOT="$READ_ROOT" CROSS_MODEL_SCRATCH_PARENT="$SCRATCH" \
    bash "$WORKER" claude "$route" "$ROOT/payload.md" "$run_dir")"
  "$PY" "$RUNNER" wait --max-secs 60 --json "$job" > "$ROOT/$label.wait.json"
  "$PY" "$RUNNER" result "$job" > "$ROOT/$label.result" 2>&1 || true
  echo "$job"
}

stream "$ROOT/ok" 0
run_job codex codex "$ROOT/ok" >/dev/null
[ -s "$ROOT/run-codex/pov-codex.json" ] || { cat "$ROOT/codex.result" >&2; fail "codex route published no POV"; }
grep -q '"model_actual": *"gpt-6.1-sol"' "$ROOT/run-codex/pov-codex.json" || fail "codex POV lacks the served-model receipt"
echo "ok: codex route published a POV with its receipt"

stream "$ROOT/silent" 120
started=$(date +%s)
run_job silent codex "$ROOT/silent" CROSS_MODEL_IDLE_SECS=3 >/dev/null
elapsed=$(( $(date +%s) - started ))
[ "$elapsed" -lt 45 ] || fail "silent peer was not reaped by the idle guard (${elapsed}s)"
[ ! -e "$ROOT/run-silent/pov-silent.json" ] || fail "silent peer published a POV"
if [ -s "$ROOT/silent.pids" ]; then
  while read -r pid; do
    if kill -0 "$pid" 2>/dev/null; then fail "stub process $pid survived the reap"; fi
  done < "$ROOT/silent.pids"
fi
echo "ok: silent peer reaped after ${elapsed}s with no surviving stub process"

case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*)
    run_job opencode opencode "$ROOT/ok" >/dev/null
    [ ! -e "$ROOT/run-opencode/pov-opencode.json" ] || fail "opencode ran on native Windows"
    log="$(find "$CE_PEER_JOBS_ROOT" -path '*smoke-opencode*' -name out.log | head -n 1)"
    grep -q "transport unavailable (pre-egress, route): opencode" "$log" ||
      { cat "$log" >&2; fail "opencode was not reported unavailable"; }
    echo "ok: opencode reported unavailable on native Windows"
    ;;
esac
echo "acpx worker smoke passed"
