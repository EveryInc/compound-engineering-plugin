#!/bin/bash
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

# Caller PATH is untrusted discovery data only. Establish the helper boundary
# before the first external command; provider/interpreter lookup receives the
# captured value explicitly and provider execution never inherits it.
DISCOVERY_PATH="${PATH:-}"
TRUSTED_HELPER_PATH="/usr/bin:/bin"
HELPER_DISCOVERY_PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin"
PATH="$TRUSTED_HELPER_PATH"
export PATH

ACTIVE_PEER_PID=""
RUN_SUCCEEDED=false

log() { printf '[elevation] %s\n' "$*" >&2; }

EFFORT="${CE_ROUTING_CANDIDATE_EFFORT:-high}"
PROVIDER_IDENTITY=""
PROVIDER_CMD_PREFIX=()
JQ_IDENTITY=""
JQ_CMD_PREFIX=()
SYSTEM_PYTHON="/usr/bin/python3"
SYSTEM_ENV="/usr/bin/env"

# Resolve an executable and every shebang interpreter once, then bind each
# canonical file plus ownership/mode/ancestry metadata. Python is a guaranteed
# native-skill dependency; invoke fixed system binaries in an empty environment
# so neither PATH nor Python startup variables can replace the validator.
provider_identity() { # <qualify|verify> <name> <discovery-path> [expected-identity]
  [ -x "$SYSTEM_ENV" ] && [ -x "$SYSTEM_PYTHON" ] || return 1
  "$SYSTEM_ENV" -i "PATH=$TRUSTED_HELPER_PATH" "PYTHONDONTWRITEBYTECODE=1" \
    "$SYSTEM_PYTHON" -I -S - "$@" <<'PY'
import hashlib
import json
import os
import shlex
import stat
import sys

mode, name, discovery = sys.argv[1:4]
expected = sys.argv[4] if len(sys.argv) > 4 else ""
uid = os.geteuid()
MAX_DISCOVERY = 65536
MAX_CHAIN_DEPTH = 6
MAX_SHEBANG = 1024
MAX_SHEBANG_ARGS = 8
MAX_ARG = 256

def fail(message):
    print(message, file=sys.stderr)
    raise SystemExit(1)

def project_owner(path):
    current = path if os.path.isdir(path) else os.path.dirname(path)
    while True:
        if os.path.lexists(os.path.join(current, ".git")):
            return current
        parent = os.path.dirname(current)
        if parent == current:
            return None
        current = parent

def components(path):
    path = os.path.abspath(path)
    parts = path.split(os.sep)
    current = os.sep
    yield current
    for part in parts[1:]:
        if not part:
            continue
        current = os.path.join(current, part)
        yield current

def inspect(path, executable=False):
    records = []
    for current in components(path):
        try:
            info = os.lstat(current)
        except OSError as exc:
            fail(f"provider path is unreadable: {current}: {exc}")
        kind = "symlink" if stat.S_ISLNK(info.st_mode) else "directory" if stat.S_ISDIR(info.st_mode) else "file"
        if info.st_uid not in (0, uid):
            fail(f"provider path has unsafe owner: {current}")
        permissions = stat.S_IMODE(info.st_mode)
        if kind != "symlink" and permissions & 0o022:
            if not (kind == "directory" and info.st_uid == 0 and permissions & stat.S_ISVTX):
                fail(f"provider path is group/other writable: {current}")
        record = [current, kind, info.st_dev, info.st_ino, info.st_uid, permissions]
        if kind == "symlink":
            record.append(os.readlink(current))
        records.append(record)
    leaf = os.stat(path, follow_symlinks=False)
    if executable:
        if not stat.S_ISREG(leaf.st_mode) or not stat.S_IMODE(leaf.st_mode) & 0o111:
            fail("provider target is not a regular executable")
    return records

if not discovery or len(discovery) > MAX_DISCOVERY or "\0" in discovery:
    fail("executable discovery PATH is missing or oversized")

def discover(command):
    if not command or os.sep in command:
        fail("interpreter command must be a simple name")
    for directory in discovery.split(os.pathsep):
        candidate = os.path.abspath(os.path.join(directory or ".", command))
        if os.path.lexists(candidate) and os.access(candidate, os.X_OK):
            return candidate
    fail(f"executable not found in discovery PATH: {command}")

nodes = []
stack = set()
bound = lambda value: (value.st_dev, value.st_ino, value.st_uid, stat.S_IMODE(value.st_mode), value.st_size, value.st_mtime_ns)

def bind_file(lookup):
    lookup = os.path.abspath(lookup)
    if not os.path.lexists(lookup):
        fail(f"executable path is missing: {lookup}")
    target = os.path.realpath(lookup)
    if project_owner(lookup) is not None or project_owner(target) is not None:
        fail("executable is project/worktree-owned")
    launcher_records = inspect(lookup)
    target_records = inspect(target, executable=True)
    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
    try:
        fd = os.open(target, flags)
    except OSError as exc:
        fail(f"executable target cannot be opened safely: {exc}")
    prefix = bytearray()
    try:
        before = os.fstat(fd)
        digest = hashlib.sha256()
        while True:
            chunk = os.read(fd, 1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
            if len(prefix) <= MAX_SHEBANG:
                prefix.extend(chunk[: MAX_SHEBANG + 1 - len(prefix)])
        after = os.fstat(fd)
    finally:
        os.close(fd)
    if bound(before) != bound(after) or not stat.S_ISREG(after.st_mode):
        fail("executable target changed while it was qualified")
    nodes.append({
        "lookup": lookup,
        "target": target,
        "launcher": launcher_records,
        "target_ancestry": target_records,
        "file": [*bound(after), digest.hexdigest()],
    })
    return target, bytes(prefix)

def shebang_tokens(prefix):
    if not prefix.startswith(b"#!"):
        return None
    newline = prefix.find(b"\n")
    if newline < 0 or newline > MAX_SHEBANG:
        fail("unsupported or oversized executable shebang")
    raw = prefix[2:newline].rstrip(b"\r")
    try:
        line = raw.decode("utf-8", "strict")
        tokens = shlex.split(line, posix=True)
    except (UnicodeDecodeError, ValueError) as exc:
        fail(f"malformed executable shebang: {exc}")
    if not tokens or len(tokens) > MAX_SHEBANG_ARGS + 2:
        fail("malformed or over-argument executable shebang")
    if any(not token or len(token) > MAX_ARG or "\0" in token for token in tokens):
        fail("unsafe executable shebang argument")
    return tokens

def resolve(lookup, depth=0):
    if depth > MAX_CHAIN_DEPTH:
        fail("executable interpreter chain is too deep")
    target, prefix = bind_file(lookup)
    if target in stack:
        fail("executable interpreter chain contains a cycle")
    tokens = shebang_tokens(prefix)
    if tokens is None:
        return [target]
    interpreter, args = tokens[0], tokens[1:]
    if not os.path.isabs(interpreter):
        fail("shebang interpreter must be absolute")
    stack.add(target)
    try:
        if interpreter in ("/usr/bin/env", "/bin/env"):
            # Bind env itself even though final argv bypasses it. Only common,
            # deterministic command-selection forms are supported.
            resolve(interpreter, depth + 1)
            split = False
            if args and args[0] in ("-S", "--split-string"):
                split = True
                args = args[1:]
            elif args and args[0].startswith("--split-string="):
                split = True
                args = [args[0].split("=", 1)[1], *args[1:]]
            elif args and args[0] == "--":
                args = args[1:]
            if not args or (len(args) > 1 and not split):
                fail("unsupported /usr/bin/env shebang form")
            command, command_args = args[0], args[1:]
            if len(command_args) > MAX_SHEBANG_ARGS:
                fail("over-argument /usr/bin/env shebang")
            command_lookup = command if os.path.isabs(command) else discover(command)
            if os.sep in command and not os.path.isabs(command):
                fail("relative interpreter path is unsupported")
            return [*resolve(command_lookup, depth + 1), *command_args, target]
        if len(args) > 1:
            fail("absolute shebang supports at most one interpreter argument")
        return [*resolve(interpreter, depth + 1), *args, target]
    finally:
        stack.remove(target)

lookup = discover(name)
argv = resolve(lookup)
payload = {"name": name, "discovery": discovery, "nodes": nodes, "argv": argv}
identity = hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
if mode == "verify":
    if identity != expected:
        fail("provider executable identity changed")
    raise SystemExit(0)
if mode != "qualify":
    fail("invalid provider identity operation")
sys.stdout.buffer.write(lookup.encode() + b"\0" + identity.encode() + b"\0")
for token in argv:
    sys.stdout.buffer.write(token.encode() + b"\0")
PY
}

qualify_provider() { # <name>
  local field fields=()
  while IFS= read -r -d '' field; do fields+=("$field"); done < <(provider_identity qualify "$1" "$DISCOVERY_PATH")
  [ "${#fields[@]}" -ge 3 ] || return 1
  PROVIDER_IDENTITY="${fields[1]}"
  PROVIDER_CMD_PREFIX=("${fields[@]:2}")
}

revalidate_provider() {
  provider_identity verify claude "$DISCOVERY_PATH" "$PROVIDER_IDENTITY"
}

qualify_json_helper() {
  local field fields=()
  while IFS= read -r -d '' field; do fields+=("$field"); done < <(provider_identity qualify jq "$HELPER_DISCOVERY_PATH")
  [ "${#fields[@]}" -ge 3 ] || return 1
  JQ_IDENTITY="${fields[1]}"
  JQ_CMD_PREFIX=("${fields[@]:2}")
}

json_tool() {
  provider_identity verify jq "$HELPER_DISCOVERY_PATH" "$JQ_IDENTITY" || return 1
  "${JQ_CMD_PREFIX[@]}" "$@"
}

safe_model_token() {
  local value="$1"
  [ -n "$value" ] && [ "${#value}" -le 128 ] || return 1
  case "$value" in [A-Za-z0-9]*) ;; *) return 1 ;; esac
  case "$value" in *[!A-Za-z0-9._:/-]*) return 1 ;; esac
}

safe_effort_token() {
  local value="$1"
  [ -n "$value" ] && [ "${#value}" -le 64 ] || return 1
  case "$value" in [A-Za-z0-9]*) ;; *) return 1 ;; esac
  case "$value" in *[!A-Za-z0-9._-]*) return 1 ;; esac
}

validate_candidate_selectors() { # <model>
  local model="$1" harness="${CE_ROUTING_CANDIDATE_HARNESS:-}" route="${CE_ROUTING_CANDIDATE_ROUTE:-}"
  safe_model_token "$model" || return 1
  safe_effort_token "$EFFORT" || return 1
  case "$EFFORT" in low|medium|high) ;; *) return 1 ;; esac
  if [ -n "$harness$route${CE_ROUTING_CANDIDATE_MODEL:-}${CE_ROUTING_CANDIDATE_EFFORT:-}" ]; then
    [ "$harness" = "claude" ] || return 1
    case "$route" in ""|claude) ;; *) return 1 ;; esac
    [ -n "${CE_ROUTING_CANDIDATE_MODEL:-}" ] || return 1
    [ "$CE_ROUTING_CANDIDATE_MODEL" = "$model" ] || return 1
  fi
}

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
  if [ "${#PROVIDER_CMD_PREFIX[@]}" -gt 0 ]; then
    # ce-dispatch-site:reasoning-elevation.cli
    CMD=("${PROVIDER_CMD_PREFIX[@]}" -p --model "$1" --effort "$EFFORT")
  else
    CMD=("<qualified-claude>" -p --model "$1" --effort "$EFFORT")
  fi
  CMD+=(
       --output-format stream-json --verbose
       --safe-mode --no-session-persistence --disable-slash-commands --strict-mcp-config
       --permission-mode dontAsk
       "${add_dirs[@]}"
       --tools "$csv" --allowedTools "${ALLOWED[@]}"
       --max-turns "${ELEVATION_MAX_TURNS:-30}")
}

build_min_env() {
  MIN_ENV=(/usr/bin/env -i "PATH=$TRUSTED_HELPER_PATH" "PYTHONDONTWRITEBYTECODE=1")
  [ -n "${HOME:-}" ] && MIN_ENV+=("HOME=$HOME")
  [ -n "${USER:-}" ] && MIN_ENV+=("USER=$USER")
  [ -n "${TMPDIR:-}" ] && MIN_ENV+=("TMPDIR=$TMPDIR")
  [ -n "${LANG:-}" ] && MIN_ENV+=("LANG=$LANG")
  [ -n "${LC_ALL:-}" ] && MIN_ENV+=("LC_ALL=$LC_ALL")
  [ -n "${XDG_CONFIG_HOME:-}" ] && MIN_ENV+=("XDG_CONFIG_HOME=$XDG_CONFIG_HOME")
  # Preserve the CLI's native auth-store pointer, never ambient API/OAuth keys.
  [ -n "${CLAUDE_CONFIG_DIR:-}" ] && MIN_ENV+=("CLAUDE_CONFIG_DIR=$CLAUDE_CONFIG_DIR")
}

# Test hook: print the argv the worker would exec, without calling a model.
# Accepts an optional handoff dir ($3) so the emitted argv shows the scoped
# --add-dir; without it the flag is omitted (no dir to grant).
if [ "${1:-}" = "--emit-adapter" ]; then
  [ -n "${2:-}" ] || { log "--emit-adapter requires <model>"; exit 2; }
  validate_candidate_selectors "$2" || { log "candidate selectors are unsafe or incompatible with the Claude elevation adapter"; exit 2; }
  build_cmd "$2" "${3:-}"
  printf '%s\0' "${CMD[@]}"
  exit 0
fi

MODEL="${1:?model required}"
PROMPT_FILE="${2:?prompt-file required}"
RESULT_PATH="${3:?result-path required}"
validate_candidate_selectors "$MODEL" || { log "candidate selectors are unsafe or incompatible with the Claude elevation adapter"; exit 2; }
[ -f "$PROMPT_FILE" ] || { log "prompt file not found: $PROMPT_FILE"; exit 2; }
if ! qualify_provider claude; then
  log "provider executable unavailable: first PATH match for claude failed secure qualification; not trying another executable"
  printf '{"status":"failed","requested_model":"%s","model_identity_status":"unverified","effort_requested":"%s","effort_actual":"unverified","evidence":"provider executable unavailable"}' "$MODEL" "$EFFORT" > "$RESULT_PATH" 2>/dev/null || true
  exit 0
fi

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
if ! qualify_json_helper; then
  log "jq unavailable from the trusted helper path; cannot parse the elevated result — degrading to inline"
  printf '{"status":"failed","requested_model":"%s","model_identity_status":"unverified","effort_requested":"%s","effort_actual":"unverified","evidence":"jq unavailable from trusted helper path"}' "$MODEL" "$EFFORT" > "$RESULT_PATH" 2>/dev/null || true
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
  if ! revalidate_provider; then
    log "provider executable identity changed after qualification; route unavailable"
    return 0
  fi
  local prev; case "$-" in *m*) prev=1;; *) prev=0;; esac
  set -m
  command "${MIN_ENV[@]}" "${CMD[@]}" < "$PROMPT_FILE" > "$PEERLOG" 2>&1 &
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
build_min_env
run_codex_cmd

# The stream-json terminal event is the LAST line whose type is "result". Match
# on it rather than `tail -1`, so a diagnostic written to stderr after the result
# (an update notice, wrapper output) does not become the "result" we parse.
EVENT="$(grep -a '"type":"result"' "$PEERLOG" 2>/dev/null | tail -1 || true)"
PREFIX="$(model_prefix "$MODEL")"
# jq `keys` is sorted, so keys[0] is not necessarily the served model when
# modelUsage carries an auxiliary model too; prefer the requested family's key.
SERVED="$(printf '%s' "$EVENT" | json_tool -r --arg p "$PREFIX" \
  '(.modelUsage // {} | keys) as $k
   | (if $p != "" then first($k[] | select(startswith($p))) else empty end) // $k[0] // "unverified"' \
  2>/dev/null || printf 'unverified')"
# Ship "ok" only on a clean success — a terminal event carries .result even when
# truncated/errored (subtype error_*, is_error true). HAS_OUTPUT is a tiny jq
# flag, so the plan text is never loaded into a shell variable or an argv.
SUBTYPE="$(printf '%s' "$EVENT" | json_tool -r '.subtype // empty' 2>/dev/null || true)"
IS_ERROR="$(printf '%s' "$EVENT" | json_tool -r '.is_error // false' 2>/dev/null || printf 'true')"
HAS_OUTPUT="$(printf '%s' "$EVENT" | json_tool -r 'if (.result // "") == "" then "no" else "yes" end' 2>/dev/null || printf 'no')"

if [ "$RUN_SUCCEEDED" = true ] && [ "$HAS_OUTPUT" = "yes" ] \
   && [ "$SUBTYPE" = "success" ] && [ "$IS_ERROR" != "true" ]; then
  RECEIPT="$(classify_receipt "$MODEL" "$SERVED")"
  case "$RECEIPT" in matched) MODEL_IDENTITY_STATUS=matched ;; mismatch) MODEL_IDENTITY_STATUS=mismatched ;; *) MODEL_IDENTITY_STATUS=unverified ;; esac
  # Build the envelope by piping the event THROUGH jq, which reads .result
  # internally — never pass the plan text as an argv --arg, which would exceed
  # ARG_MAX for a large Deep plan.
  tmp="${RESULT_PATH}.tmp.$$"
  if printf '%s' "$EVENT" | json_tool --arg m "$MODEL" --arg s "$SERVED" --arg r "$RECEIPT" \
       --arg identity "$MODEL_IDENTITY_STATUS" --arg effort "$EFFORT" \
       '{status:"ok", requested_model:$m, served_model:$s, receipt:$r,
         model_identity_status:$identity, effort_requested:$effort,
         effort_actual:"unverified", output:.result}' \
       > "$tmp" 2>/dev/null; then
    mv -f "$tmp" "$RESULT_PATH"
    log "elevated step complete: requested=$MODEL served=$SERVED receipt=$RECEIPT"
  else
    rm -f "$tmp"
    write_result "$(json_tool -n --arg m "$MODEL" --arg e "$EFFORT" '{status:"failed", requested_model:$m, model_identity_status:"unverified", effort_requested:$e, effort_actual:"unverified", evidence:"result envelope build failed"}')"
    log "elevated step: result envelope build failed"
  fi
else
  write_result "$(json_tool -n --arg m "$MODEL" --arg effort "$EFFORT" --arg e "$(bounded_failure_evidence)" \
    '{status:"failed", requested_model:$m, model_identity_status:"unverified", effort_requested:$effort, effort_actual:"unverified", evidence:$e}')"
  log "elevated step failed; wrote failure envelope"
fi
rm -f "$PEERLOG"
