#!/usr/bin/env bash
# elevation-dispatch.sh — off-host model-elevation worker for ce-plan / ce-brainstorm.
#
# Runs one reasoning-heavy step on a user-chosen model via the Claude CLI, as a
# detached job supervised by peer-job-runner.py. Streams NDJSON so the idle
# window observes genuine progress, not just liveness — a buffered format would
# make a healthy long run byte-identical to a wedged one. See
# docs/solutions/skill-design/cli-output-buffering-for-progress-detection.md.
#
# Read-only posture (R7): writes, shell, web, skills, and MCP are denied by flag;
# the model may Read/Glob/Grep the repo to verify its brief.
#
# Usage:
#   elevation-dispatch.sh <model> <prompt-file> <result-path>
#   elevation-dispatch.sh --emit-adapter <model>   # print argv, no model call (test hook)
#
# NOTE ON THE FUNCTION NAMED run_codex_cmd: it is NOT codex-specific here. It is
# the $PEERLOG byte-growth idle loop that implements R11's primary supervision
# signal (run_timeout_cmd, hard-cap-only, would leave a stalled run undetected).
# It keeps that name because the shared heartbeat-parity regex in
# tests/peer-job-runner-parity.test.ts uses `run_codex_cmd()` as the terminator
# that forces BOTH heartbeat functions into the byte-compared kernel; renaming it
# would weaken that cross-skill guard.

set -uo pipefail
trap '' HUP

ACTIVE_PEER_PID=""
RUN_SUCCEEDED=false

log() { printf '[elevation] %s\n' "$*" >&2; }

EFFORT="high"   # settled: elevation runs at high effort

# Read-only tool posture (R7): deny mutators, shell, web, skills, mcp.
# Read/Glob/Grep are not in the deny list, so the model can inspect the repo.
DISALLOWED=(Edit Write NotebookEdit Bash Task WebFetch WebSearch Skill 'mcp__*')

build_cmd() {   # <model> -> sets CMD array (claude CLI, streaming, read-only)
  CMD=(claude -p --model "$1" --effort "$EFFORT"
       --output-format stream-json --verbose
       --permission-mode dontAsk --disallowedTools "${DISALLOWED[@]}"
       --max-turns "${ELEVATION_MAX_TURNS:-30}")
}

# Test hook: print the argv the worker would exec, without calling a model.
if [ "${1:-}" = "--emit-adapter" ]; then
  [ -n "${2:-}" ] || { log "--emit-adapter requires <model>"; exit 2; }
  build_cmd "$2"
  printf '%s\0' "${CMD[@]}"
  exit 0
fi

MODEL="${1:?model required}"
PROMPT_FILE="${2:?prompt-file required}"
RESULT_PATH="${3:?result-path required}"
[ -f "$PROMPT_FILE" ] || { log "prompt file not found: $PROMPT_FILE"; exit 2; }

PEERLOG="$(mktemp -t elevation-peer-XXXXXX)"

# Idle window is the primary stall signal; the hard cap is a raised backstop (R11).
IDLE_SECS="${CE_ELEVATION_IDLE_SECS:-180}"
HARD_SECS="${CE_ELEVATION_HARD_SECS:-3600}"
POLL_SECS="${CE_ELEVATION_POLL_SECS:-5}"   # $PEERLOG growth poll interval

reap() {
  local pid="$1" grp
  if kill -TERM -- -"$pid" 2>/dev/null; then grp=1; else kill -TERM "$pid" 2>/dev/null; grp=0; fi
  for _ in 1 2 3 4 5; do
    if [ "$grp" = 1 ]; then kill -0 -- -"$pid" 2>/dev/null || return 0
    else kill -0 "$pid" 2>/dev/null || return 0; fi
    sleep 1
  done
  if [ "$grp" = 1 ]; then kill -KILL -- -"$pid" 2>/dev/null; else kill -KILL "$pid" 2>/dev/null; fi
}

on_term() {
  if [ -n "${_HEARTBEAT_PID:-}" ]; then
    kill "$_HEARTBEAT_PID" 2>/dev/null || true
    wait "$_HEARTBEAT_PID" 2>/dev/null || true
    _HEARTBEAT_PID=""
  fi
  if [ -n "${ACTIVE_PEER_PID:-}" ]; then
    log "received TERM/INT; reaping peer process group $ACTIVE_PEER_PID"
    reap "$ACTIVE_PEER_PID" 2>/dev/null || true
    ACTIVE_PEER_PID=""
  fi
  exit 0
}
trap 'on_term' TERM INT

write_result() {   # <json-string> -> atomic publish to RESULT_PATH
  local tmp="${RESULT_PATH}.tmp.$$"
  printf '%s' "$1" > "$tmp" && mv -f "$tmp" "$RESULT_PATH"
}

# Bounded stderr/stdout tail for a failed run. tail -c avoids the macOS bash
# negative-slice bug that erased sub-300-char evidence in the review worker.
bounded_failure_evidence() { tail -c 800 "$PEERLOG" 2>/dev/null || true; }

# Requested family vs served id (R6/R16). matched | mismatch | unverified.
classify_receipt() {   # <requested> <served>
  local req="$1" served="$2" prefix
  { [ -z "$served" ] || [ "$served" = "unverified" ]; } && { printf 'unverified'; return; }
  case "$req" in
    fable)    prefix='claude-fable-' ;;
    opus)     prefix='claude-opus-' ;;
    sonnet)   prefix='claude-sonnet-' ;;
    haiku)    prefix='claude-haiku-' ;;
    claude-*) prefix="$req" ;;
    *)        printf 'unverified'; return ;;
  esac
  case "$served" in
    "$prefix"*) printf 'matched' ;;
    *)          printf 'mismatch' ;;
  esac
}

# --- liveness heartbeat -----------------------------------------------------
# Emits one stderr line every CROSS_MODEL_HEARTBEAT_SECS so the OUTER
# peer-job-runner idle window (out.log byte-growth) sees the supervising script
# as alive during a long model call. It writes to stderr, NOT $PEERLOG, so it
# never masks this worker's OWN $PEERLOG idle detection (run_codex_cmd below) —
# a stalled model still stops growing $PEERLOG and is reaped. This block is
# byte-identical across all peer workers (kernel parity, tests/peer-job-runner-parity.test.ts).
_HEARTBEAT_PID=""
start_heartbeat() {
  local every="${CROSS_MODEL_HEARTBEAT_SECS:-60}" parent_pid="$$"
  # Floor to 1s: a non-numeric or 0 value would make `sleep` return instantly and
  # spin the loop, flooding out.log into the runner's byte cap.
  case "$every" in ''|*[!0-9]*) every=60 ;; esac; [ "$every" -lt 1 ] && every=1
  ( local t0 n; t0="$(date +%s)"
    while kill -0 "$parent_pid" 2>/dev/null; do
      sleep "$every"
      kill -0 "$parent_pid" 2>/dev/null || break
      n="$(date +%s)"; log "peer alive ($(( n - t0 ))s elapsed)"
    done ) &
  _HEARTBEAT_PID=$!
}
stop_heartbeat() {
  if [ -n "$_HEARTBEAT_PID" ]; then
    kill "$_HEARTBEAT_PID" 2>/dev/null || true
    wait "$_HEARTBEAT_PID" 2>/dev/null || true
  fi
  _HEARTBEAT_PID=""
}

run_codex_cmd() {
  RUN_SUCCEEDED=false
  local prev; case "$-" in *m*) prev=1;; *) prev=0;; esac
  set -m
  command "${CMD[@]}" < "$PROMPT_FILE" > "$PEERLOG" 2>&1 &
  local pid=$!
  ACTIVE_PEER_PID="$pid"
  [ "$prev" = 0 ] && set +m
  start_heartbeat
  local start last=-1 lastchg now size
  start="$(date +%s)"; lastchg="$start"
  while kill -0 "$pid" 2>/dev/null; do
    sleep "$POLL_SECS"; now="$(date +%s)"; size="$(wc -c <"$PEERLOG" 2>/dev/null || echo 0)"
    [ "$size" != "$last" ] && { last="$size"; lastchg="$now"; }
    if [ $(( now - lastchg )) -ge "$IDLE_SECS" ]; then
      log "elevated call idle ${IDLE_SECS}s; reaping"; reap "$pid"; break
    fi
    if [ $(( now - start )) -ge "$HARD_SECS" ]; then
      log "elevated call exceeded hard cap ${HARD_SECS}s; reaping"; reap "$pid"; break
    fi
  done
  if wait "$pid" 2>/dev/null; then RUN_SUCCEEDED=true
  else log "elevated call exited non-zero or was reaped"; fi
  reap "$pid" 2>/dev/null || true
  stop_heartbeat
  ACTIVE_PEER_PID=""
}

# --- main -------------------------------------------------------------------
build_cmd "$MODEL"
run_codex_cmd

# stream-json terminal event is the last line: {"type":"result", .result, .modelUsage}
EVENT="$(tail -1 "$PEERLOG" 2>/dev/null || true)"
SERVED="$(printf '%s' "$EVENT" | jq -r '.modelUsage // {} | keys[0] // "unverified"' 2>/dev/null || printf 'unverified')"
OUTPUT="$(printf '%s' "$EVENT" | jq -r '.result // empty' 2>/dev/null || true)"

if [ "$RUN_SUCCEEDED" = true ] && [ -n "$OUTPUT" ]; then
  RECEIPT="$(classify_receipt "$MODEL" "$SERVED")"
  write_result "$(jq -n --arg m "$MODEL" --arg s "$SERVED" --arg r "$RECEIPT" --arg o "$OUTPUT" \
    '{status:"ok", requested_model:$m, served_model:$s, receipt:$r, output:$o}')"
  log "elevated step complete: requested=$MODEL served=$SERVED receipt=$RECEIPT"
else
  write_result "$(jq -n --arg m "$MODEL" --arg e "$(bounded_failure_evidence)" \
    '{status:"failed", requested_model:$m, evidence:$e}')"
  log "elevated step failed; wrote failure envelope"
fi
rm -f "$PEERLOG"
