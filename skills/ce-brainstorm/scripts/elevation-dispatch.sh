#!/usr/bin/env bash
# elevation-dispatch.sh — off-host model-elevation worker for ce-plan / ce-brainstorm.
#
# Runs one reasoning-heavy step on a user-chosen model via the Claude CLI, as a
# detached job supervised by peer-job-runner.py. Streams NDJSON so the idle
# window observes genuine progress, not just liveness — a buffered format would
# make a healthy long run byte-identical to a wedged one. See
# docs/solutions/skill-design/cli-output-buffering-for-progress-detection.md.
#
# Read-only posture (R7): the CLI is allowlisted to Read/Glob/Grep plus
# WebSearch/WebFetch, so writes, shell, skills, and MCP are unavailable; the
# model reads the repo and web to verify its brief and returns prose.
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

# Read-only tool posture (R7): the available built-in set, not a denylist. The
# elevated step reads the repo (Read/Glob/Grep) and may check current facts on
# the web (WebSearch/WebFetch) while authoring; it never needs Write/Bash/Task or
# any mutating tool. Its output is returned prose, not a file write.
ALLOWED=(Read Glob Grep WebSearch WebFetch)

build_cmd() {   # <model> <handoff-dir> -> sets CMD array (claude CLI, streaming, read-only)
  # --safe-mode suppresses the user environment's hooks, plugins, and MCP
  # servers; --disable-slash-commands blocks skills. --tools RESTRICTS the
  # available built-in set to this list — Write/Edit/Bash are not present at all.
  # This is the real read-only boundary: --allowedTools ALONE only pre-approves
  # (verified — it leaves every other tool available), so --allowedTools here
  # just lets --permission-mode dontAsk run these five without a prompt instead
  # of denying them.
  local csv; csv="$(IFS=,; printf '%s' "${ALLOWED[*]}")"
  # Grant read access to ONLY the single per-run handoff dir ($2, where the
  # orchestrator co-located the prompt and evidence), which sits outside the
  # launch dir. Claude's file access defaults to the launch dir and is extended
  # via --add-dir. Adding the whole OS temp root ($TMPDIR / /tmp) instead would
  # expose every other same-user scratch file and credential to the elevated
  # model; the scoped dir does not. Read-only (only Read/Glob/Grep available).
  local add_dirs=()
  [ -n "${2:-}" ] && add_dirs=(--add-dir "$2")
  # --no-session-persistence: this is a one-shot background model call, so the
  # prompt and scratch-file references must not be saved as a resumable session
  # on disk (matches the other scripted Claude peer routes in this repo).
  CMD=(claude -p --model "$1" --effort "$EFFORT"
       --output-format stream-json --verbose
       --safe-mode --no-session-persistence --disable-slash-commands --strict-mcp-config
       --permission-mode dontAsk
       "${add_dirs[@]}"
       --tools "$csv" --allowedTools "${ALLOWED[@]}"
       --max-turns "${ELEVATION_MAX_TURNS:-30}")
}

# Test hook: print the argv the worker would exec, without calling a model.
# Accepts an optional handoff dir ($3) so the emitted argv shows the scoped
# --add-dir; without it the flag is omitted (no dir to grant).
if [ "${1:-}" = "--emit-adapter" ]; then
  [ -n "${2:-}" ] || { log "--emit-adapter requires <model>"; exit 2; }
  build_cmd "$2" "${3:-}"
  printf '%s\0' "${CMD[@]}"
  exit 0
fi

MODEL="${1:?model required}"
PROMPT_FILE="${2:?prompt-file required}"
RESULT_PATH="${3:?result-path required}"
[ -f "$PROMPT_FILE" ] || { log "prompt file not found: $PROMPT_FILE"; exit 2; }

# The orchestrator co-locates the prompt and every evidence file in one private
# per-run dir; grant the elevated model read access to just that dir (resolved
# to an absolute path), never the whole OS temp root. Pure-bash dirname (no
# external `dirname`): strip the last /component, defaulting to cwd if none.
HANDOFF_DIR="${PROMPT_FILE%/*}"
[ "$HANDOFF_DIR" = "$PROMPT_FILE" ] && HANDOFF_DIR="."
HANDOFF_DIR="$(cd "$HANDOFF_DIR" 2>/dev/null && pwd || printf '%s' "$HANDOFF_DIR")"

# jq builds every result envelope; it is only an optional capability (ce-setup),
# so preflight it here rather than spending the CLI call and failing to parse.
# Exit 0 with a failure envelope, NOT nonzero: the runner classifies a nonzero
# exit as `failed`, and its `result` command then refuses to emit the artifact,
# so the recovery flow could never read this envelope. Exit 0 makes the job
# `done`, the envelope's status:failed is read, and it degrades to inline.
if ! command -v jq >/dev/null 2>&1; then
  log "jq not found on PATH; cannot parse the elevated result — degrading to inline"
  printf '{"status":"failed","requested_model":"%s","evidence":"jq unavailable on PATH"}' "$MODEL" > "$RESULT_PATH" 2>/dev/null || true
  exit 0
fi

PEERLOG="$(mktemp -t elevation-peer-XXXXXX)"

# Idle window is the primary stall signal; the hard cap is a raised backstop (R11).
# Keep this inner cap >= the runner's CE_PEER_HARD_SECS so it never reaps a
# healthy run before the outer supervisor's own raised backstop.
IDLE_SECS="${CE_ELEVATION_IDLE_SECS:-180}"
HARD_SECS="${CE_ELEVATION_HARD_SECS:-5400}"
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

# Expected served-id prefix for a requested model alias, or empty if unknown.
model_prefix() {   # <requested> -> prefix | ""
  case "$1" in
    fable)    printf 'claude-fable-' ;;
    opus)     printf 'claude-opus-' ;;
    sonnet)   printf 'claude-sonnet-' ;;
    haiku)    printf 'claude-haiku-' ;;
    claude-*) printf '%s' "$1" ;;
  esac
}

# Requested family vs served id (R6/R16). matched | mismatch | unverified.
classify_receipt() {   # <requested> <served>
  local served="$2" prefix
  { [ -z "$served" ] || [ "$served" = "unverified" ]; } && { printf 'unverified'; return; }
  prefix="$(model_prefix "$1")"
  [ -z "$prefix" ] && { printf 'unverified'; return; }
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
build_cmd "$MODEL" "$HANDOFF_DIR"
run_codex_cmd

# The stream-json terminal event is the LAST line whose type is "result". Match
# on it rather than `tail -1`, so a diagnostic written to stderr after the result
# (an update notice, wrapper output) does not become the "result" we parse.
EVENT="$(grep -a '"type":"result"' "$PEERLOG" 2>/dev/null | tail -1 || true)"
PREFIX="$(model_prefix "$MODEL")"
# jq `keys` is sorted, so keys[0] is not necessarily the served model when
# modelUsage carries an auxiliary model too; prefer the requested family's key.
SERVED="$(printf '%s' "$EVENT" | jq -r --arg p "$PREFIX" \
  '(.modelUsage // {} | keys) as $k
   | (if $p != "" then first($k[] | select(startswith($p))) else empty end) // $k[0] // "unverified"' \
  2>/dev/null || printf 'unverified')"
# Ship "ok" only on a clean success — a terminal event carries .result even when
# truncated/errored (subtype error_*, is_error true). HAS_OUTPUT is a tiny jq
# flag, so the plan text is never loaded into a shell variable or an argv.
SUBTYPE="$(printf '%s' "$EVENT" | jq -r '.subtype // empty' 2>/dev/null || true)"
IS_ERROR="$(printf '%s' "$EVENT" | jq -r '.is_error // false' 2>/dev/null || printf 'true')"
HAS_OUTPUT="$(printf '%s' "$EVENT" | jq -r 'if (.result // "") == "" then "no" else "yes" end' 2>/dev/null || printf 'no')"

if [ "$RUN_SUCCEEDED" = true ] && [ "$HAS_OUTPUT" = "yes" ] \
   && [ "$SUBTYPE" = "success" ] && [ "$IS_ERROR" != "true" ]; then
  RECEIPT="$(classify_receipt "$MODEL" "$SERVED")"
  # Build the envelope by piping the event THROUGH jq, which reads .result
  # internally — never pass the plan text as an argv --arg, which would exceed
  # ARG_MAX for a large Deep plan.
  tmp="${RESULT_PATH}.tmp.$$"
  if printf '%s' "$EVENT" | jq --arg m "$MODEL" --arg s "$SERVED" --arg r "$RECEIPT" \
       '{status:"ok", requested_model:$m, served_model:$s, receipt:$r, output:.result}' \
       > "$tmp" 2>/dev/null; then
    mv -f "$tmp" "$RESULT_PATH"
    log "elevated step complete: requested=$MODEL served=$SERVED receipt=$RECEIPT"
  else
    rm -f "$tmp"
    write_result "$(jq -n --arg m "$MODEL" '{status:"failed", requested_model:$m, evidence:"result envelope build failed"}')"
    log "elevated step: result envelope build failed"
  fi
else
  write_result "$(jq -n --arg m "$MODEL" --arg e "$(bounded_failure_evidence)" \
    '{status:"failed", requested_model:$m, evidence:$e}')"
  log "elevated step failed; wrote failure envelope"
fi
rm -f "$PEERLOG"
