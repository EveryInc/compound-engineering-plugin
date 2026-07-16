#!/usr/bin/env bash
# Run one pre-sanctioned, write-capable implementation route in a controller-
# supplied detached workspace. The adapter never creates worktrees, changes
# recipients, integrates output, or retries through another route.
#
# Usage:
#   cross-model-work.sh <authorization-json> <workspace> <unit-packet> <expected-packet-sha256> <result-dir>
#
# Routes: codex | claude | grok-cli | cursor | composer | grok-cursor
# Output: <result-dir>/implementation-result.json and redacted adapter.log
# Exit: 0 completed/scope expansion, 1 failed/blocked/schema-invalid, 2 unavailable
#
# Introspection (no model call):
#   cross-model-work.sh --emit-adapter <route>

set -uo pipefail
umask 077

M_CLAUDE="fable"
M_GROK="grok-4.5"
M_GROK_CURSOR="cursor-grok-4.5-high"
M_COMPOSER="composer-2.5-fast"

log() { printf '[cross-model-work] %s\n' "$*" >&2; }

route_target() {
  case "$1" in
    codex|claude|cursor|composer) printf '%s' "$1" ;;
    grok-cli|grok-cursor) printf 'grok' ;;
    *) return 1 ;;
  esac
}

route_harness() {
  case "$1" in
    codex) printf 'codex' ;;
    claude) printf 'claude' ;;
    grok-cli) printf 'grok' ;;
    cursor|composer|grok-cursor) printf 'cursor-agent' ;;
    *) return 1 ;;
  esac
}

route_model() {
  local route="$1" target override="${CE_WORK_MODEL_OVERRIDE:-}"
  if [ -n "${MODEL_REQUESTED:-}" ]; then
    printf '%s' "$MODEL_REQUESTED"
    return
  fi
  target="$(route_target "$route")" || return 1
  if [ -n "$override" ] && [ "${CE_WORK_MODEL_OVERRIDE_TARGET:-}" = "$target" ]; then
    printf '%s' "$override"
    return
  fi
  case "$route" in
    codex|cursor) printf 'auto' ;;
    claude) printf '%s' "$M_CLAUDE" ;;
    grok-cli) printf '%s' "$M_GROK" ;;
    grok-cursor) printf '%s' "$M_GROK_CURSOR" ;;
    composer) printf '%s' "$M_COMPOSER" ;;
  esac
}

validate_model_override() {
  local route="$1" override="${CE_WORK_MODEL_OVERRIDE:-}" target
  [ -n "$override" ] || { [ -z "${CE_WORK_MODEL_OVERRIDE_TARGET:-}" ]; return; }
  target="$(route_target "$route")" || return 1
  [ "${CE_WORK_MODEL_OVERRIDE_TARGET:-}" = "$target" ] || return 1
  case "$route:$override" in
    codex:gpt-*|codex:o[0-9]*|claude:fable|claude:opus|claude:sonnet|claude:haiku|claude:claude-*|grok-cli:grok-*|grok-cursor:cursor-grok-*|composer:composer-*) ;;
    *) return 1 ;;
  esac
}

adapter_argv() {
  case "$1" in
    codex)
      printf '%s\0' codex exec --ignore-user-config --ignore-rules --ephemeral \
        -s workspace-write -C "$WORKSPACE" --json -o "$RAW_RESULT"
      [ "$(route_model codex)" = auto ] || printf '%s\0' -m "$(route_model codex)"
      printf '%s\0' -
      ;;
    claude)
      printf '%s\0' claude -p --safe-mode --no-session-persistence \
        --permission-mode bypassPermissions --tools Read,Write,Edit,Bash \
        --allowed-tools 'Bash(*)' --model "$(route_model claude)" \
        --effort high --output-format stream-json --verbose
      ;;
    grok-cli)
      printf '%s\0' grok --prompt-file "$PROMPT_FILE" --cwd "$WORKSPACE" \
        --model "$(route_model grok-cli)" --effort high --permission-mode acceptEdits \
        --tools Read,Write,Edit --disable-web-search --no-memory --no-subagents \
        --no-plan --max-turns 50 --output-format streaming-json --verbatim
      ;;
    cursor)
      printf '%s\0' cursor-agent -p --output-format stream-json --stream-partial-output \
        --force --sandbox enabled --trust --workspace "$WORKSPACE"
      ;;
    composer)
      printf '%s\0' cursor-agent -p --output-format stream-json --stream-partial-output \
        --force --sandbox enabled --trust --workspace "$WORKSPACE" --model "$(route_model composer)"
      ;;
    grok-cursor)
      printf '%s\0' cursor-agent -p --output-format stream-json --stream-partial-output \
        --force --sandbox enabled --trust --workspace "$WORKSPACE" --model "$(route_model grok-cursor)"
      ;;
    *) return 1 ;;
  esac
}

if [ "${1:-}" = "--emit-adapter" ]; then
  WORKSPACE="<workspace>"
  PROMPT_FILE="<prompt-file>"
  RAW_RESULT="<raw-result>"
  ROUTE="${2:-}"
  validate_model_override "$ROUTE" || {
    printf "model override '%s' not compatible with route '%s'\n" "${CE_WORK_MODEL_OVERRIDE:-}" "$ROUTE" >&2
    exit 2
  }
  adapter_argv "$ROUTE" >/dev/null 2>&1 || { printf "unknown route '%s'\n" "$ROUTE" >&2; exit 2; }
  adapter_argv "$ROUTE" | tr '\0' ' '
  printf '\n'
  exit 0
fi

AUTHORIZATION="${1:-}"
WORKSPACE="${2:-}"
PACKET="${3:-}"
EXPECTED_PACKET_DIGEST="${4:-}"
RESULT_DIR="${5:-}"
[[ "$EXPECTED_PACKET_DIGEST" =~ ^[0-9a-f]{64}$ ]] || { log "expected packet digest must be lowercase SHA-256"; exit 2; }
[ -n "$AUTHORIZATION" ] || { log "controller authorization JSON path is required"; exit 2; }
[ -d "$WORKSPACE" ] || { log "workspace '$WORKSPACE' is not a directory"; exit 2; }
[ -f "$PACKET" ] && [ ! -L "$PACKET" ] || { log "unit packet '$PACKET' is not a regular non-link file"; exit 2; }
[ -d "$RESULT_DIR" ] && [ ! -L "$RESULT_DIR" ] || { log "result dir '$RESULT_DIR' is not a directory"; exit 2; }

DISPATCH_AUTHORIZATION="$AUTHORIZATION"
DISPATCH_WORKSPACE="$WORKSPACE"
DISPATCH_PACKET="$PACKET"
DISPATCH_RESULT_DIR="$RESULT_DIR"

MAX_PACKET_BYTES="${CE_WORK_MAX_PACKET_BYTES:-200000}"
case "$MAX_PACKET_BYTES" in ''|*[!0-9]*) MAX_PACKET_BYTES=200000 ;; esac

SKILL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)" || exit 2
PERSONA="$SKILL_ROOT/references/agents/implementation-worker.md"
SCHEMA="$SKILL_ROOT/references/implementation-result-schema.json"
[ -f "$PERSONA" ] && [ -f "$SCHEMA" ] || { log "worker persona or result schema missing"; exit 2; }

SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/ce-work-adapter-XXXXXX")" || exit 2
chmod 700 "$SCRATCH"
PROMPT_FILE="$SCRATCH/prompt.md"
RAW_STDOUT="$SCRATCH/stdout.log"
RAW_STDERR="$SCRATCH/stderr.log"
RAW_RESULT="$SCRATCH/result.raw"
RAW_LIMIT_MARKER="$SCRATCH/raw-output-limit"
PACKET_SNAPSHOT="$SCRATCH/unit-packet"
AUTH_VALUES="$SCRATCH/authorization-values"
RESULT_FILE="$RESULT_DIR/implementation-result.json"
LOG_FILE="$RESULT_DIR/adapter.log"
trap 'rm -rf "$SCRATCH"' EXIT

# The controller's create-exclusive authorization artifact is the production
# dispatch capability. Read it once through a no-follow descriptor, validate
# its exact route/model/packet contract, and derive every dispatch identity
# field from those bytes before constructing a prompt or invoking a model CLI.
python3 - "$AUTHORIZATION" "$EXPECTED_PACKET_DIGEST" "$AUTH_VALUES" <<'PY'
import json, os, re, stat, sys

source, expected_packet_digest, output = sys.argv[1:]
required = {
    "schema_version", "run_id", "unit_id", "attempt_id", "route", "target", "harness",
    "intermediaries", "model_requested", "restriction_posture",
    "restrictions", "activity_posture", "packet_digest",
}
contracts = {
    "codex": ("codex", "codex", [], "adapter-enforced"),
    "claude": ("claude", "claude", [], "cooperative"),
    "grok-cli": ("grok", "grok", [], "cooperative"),
    "cursor": ("cursor", "cursor-agent", [], "adapter-enforced"),
    "composer": ("composer", "cursor-agent", ["cursor"], "adapter-enforced"),
    "grok-cursor": ("grok", "cursor-agent", ["cursor"], "adapter-enforced"),
}

def fail(message):
    raise ValueError(message)

def model_allowed(route, model):
    if not isinstance(model, str) or not model or "\n" in model or "\r" in model:
        return False
    if route == "codex":
        return model == "auto" or bool(re.fullmatch(r"(?:gpt-[A-Za-z0-9._-]+|o[0-9][A-Za-z0-9._-]*)", model))
    if route == "claude":
        return model in {"fable", "opus", "sonnet", "haiku"} or bool(re.fullmatch(r"claude-[A-Za-z0-9._-]+", model))
    if route == "grok-cli":
        return bool(re.fullmatch(r"grok-[A-Za-z0-9._-]+", model))
    if route == "cursor":
        return model == "auto"
    if route == "composer":
        return bool(re.fullmatch(r"composer-[A-Za-z0-9._-]+", model))
    if route == "grok-cursor":
        return bool(re.fullmatch(r"cursor-grok-[A-Za-z0-9._-]+", model))
    return False

try:
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    fd = os.open(os.path.abspath(source), flags)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode):
            fail("authorization is not a regular file")
        geteuid = getattr(os, "geteuid", None)
        if geteuid is not None and before.st_uid != geteuid():
            fail("authorization is not owned by the current user")
        if stat.S_IMODE(before.st_mode) != 0o600:
            fail("authorization mode is not 0600")
        if before.st_size > 64 * 1024:
            fail("authorization exceeds 65536 bytes")
        chunks, total = [], 0
        while True:
            part = os.read(fd, min(65536, 65537 - total))
            if not part:
                break
            chunks.append(part)
            total += len(part)
            if total > 65536:
                fail("authorization grew past 65536 bytes")
        after = os.fstat(fd)
        if (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (
            after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns
        ):
            fail("authorization changed while being read")
    finally:
        os.close(fd)
    try:
        value = json.loads(b"".join(chunks))
    except (ValueError, UnicodeDecodeError) as exc:
        fail(f"authorization is malformed JSON: {exc}")
    if not isinstance(value, dict) or set(value) != required:
        fail("authorization keys do not match the exact controller schema")
    if type(value["schema_version"]) is not int or value["schema_version"] != 1:
        fail("authorization schema_version must be 1")
    for key in ("run_id", "unit_id", "attempt_id"):
        if not isinstance(value[key], str) or not re.fullmatch(r"[A-Za-z0-9._-]{1,128}", value[key]) or not value[key].strip("."):
            fail(f"authorization {key} is unsafe")
    route = value["route"]
    if route not in contracts:
        fail("authorization route is unsupported")
    target, harness, intermediaries, posture = contracts[route]
    if (value["target"], value["harness"], value["intermediaries"], value["restriction_posture"]) != (target, harness, intermediaries, posture):
        fail("authorization route identity or restriction posture is inconsistent")
    if value["activity_posture"] not in {"incremental", "hard-only"}:
        fail("authorization activity_posture is invalid")
    restrictions = value["restrictions"]
    if not isinstance(restrictions, list) or not all(isinstance(item, str) for item in restrictions):
        fail("authorization restrictions must be a string list")
    if not model_allowed(route, value["model_requested"]):
        fail("authorization model is incompatible with the fixed route")
    packet_digest = value["packet_digest"]
    if not isinstance(packet_digest, str) or not re.fullmatch(r"[0-9a-f]{64}", packet_digest):
        fail("authorization packet_digest is not lowercase SHA-256")
    if packet_digest != expected_packet_digest:
        fail("authorization packet digest does not match dispatch")
    authorization_digest = __import__("hashlib").sha256(b"".join(chunks)).hexdigest()
    fields = (
        authorization_digest, value["run_id"], value["unit_id"], value["attempt_id"],
        route, target, harness, value["model_requested"], value["activity_posture"], posture,
    )
    out = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        os.write(out, b"\0".join(item.encode() for item in fields) + b"\0")
    finally:
        os.close(out)
except (OSError, ValueError) as exc:
    print(f"controller authorization rejected: {exc}", file=sys.stderr)
    raise SystemExit(2)
PY
AUTH_EXIT=$?
[ "$AUTH_EXIT" -eq 0 ] || { log "controller authorization rejected"; exit 2; }

AUTH_FIELDS=()
while IFS= read -r -d '' field; do AUTH_FIELDS+=("$field"); done < "$AUTH_VALUES"
[ "${#AUTH_FIELDS[@]}" -eq 10 ] || { log "controller authorization projection is incomplete"; exit 2; }
OBSERVED_AUTH_DIGEST="${AUTH_FIELDS[0]}"
RUN_ID="${AUTH_FIELDS[1]}"
UNIT_ID="${AUTH_FIELDS[2]}"
ATTEMPT_ID="${AUTH_FIELDS[3]}"
ROUTE="${AUTH_FIELDS[4]}"
AUTH_TARGET="${AUTH_FIELDS[5]}"
AUTH_HARNESS="${AUTH_FIELDS[6]}"
MODEL_REQUESTED="${AUTH_FIELDS[7]}"
ACTIVITY_POSTURE="${AUTH_FIELDS[8]}"
RESTRICTION_POSTURE="${AUTH_FIELDS[9]}"
RUNNER_JOB_ID="${CE_PEER_JOB_ID:-}"
[[ "$RUNNER_JOB_ID" =~ ^[A-Za-z0-9._-]{1,128}$ && "$RUNNER_JOB_ID" =~ [A-Za-z0-9_-] ]] || {
  log "runner job identity is missing or unsafe"
  exit 2
}

# A valid JSON file is not itself dispatch authority. Prove the exact no-follow
# snapshot and every raw controller-returned path back to the controller before
# prompt construction. Only its AUTHORIZED status permits external egress.
CONTROLLER="$SKILL_ROOT/scripts/unit-workspace.py"
AUTH_RESPONSE="$(python3 "$CONTROLLER" authorize-dispatch \
  --authorization "$DISPATCH_AUTHORIZATION" \
  --authorization-digest "$OBSERVED_AUTH_DIGEST" \
  --workspace "$DISPATCH_WORKSPACE" \
  --packet "$DISPATCH_PACKET" \
  --packet-digest "$EXPECTED_PACKET_DIGEST" \
  --result-dir "$DISPATCH_RESULT_DIR" \
  --run-id "$RUN_ID" --unit-id "$UNIT_ID" --attempt-id "$ATTEMPT_ID" --job-id "$RUNNER_JOB_ID" 2>&1)"
CONTROLLER_EXIT=$?
AUTH_STATUS="${AUTH_RESPONSE%%$'\n'*}"
if [ "$CONTROLLER_EXIT" -ne 0 ] || [ "$AUTH_STATUS" != "AUTHORIZED" ]; then
  [ -n "$AUTH_RESPONSE" ] && printf '%s\n' "$AUTH_RESPONSE" >&2
  log "controller dispatch authorization failed"
  exit 2
fi

# Canonicalize operational paths only after the handshake. The controller
# compares the raw paths it returned, including platform compatibility symlinks.
WORKSPACE="$(cd "$WORKSPACE" && pwd -P)" || exit 2
PACKET="$(cd "$(dirname "$PACKET")" && pwd -P)/$(basename "$PACKET")" || exit 2
RESULT_DIR="$(cd "$RESULT_DIR" && pwd -P)" || exit 2
case "$RESULT_DIR/" in "$WORKSPACE/"*) log "result dir must be outside the worker workspace"; exit 2 ;; esac
case "$PACKET" in "$WORKSPACE"/*) log "unit packet must be outside the worker workspace"; exit 2 ;; esac
git -C "$WORKSPACE" rev-parse --is-inside-work-tree >/dev/null 2>&1 || { log "workspace is not a Git worktree"; exit 2; }
chmod 700 "$RESULT_DIR" 2>/dev/null || { log "result dir could not be made private"; exit 2; }

# Read the packet once through a no-follow descriptor, hash those exact bytes,
# and build the prompt from the private snapshot. The controller-provided
# digest is therefore bound to the content that actually crosses the route.
OBSERVED_PACKET_DIGEST="$(python3 - "$PACKET" "$PACKET_SNAPSHOT" "$MAX_PACKET_BYTES" <<'PY'
import hashlib, os, stat, sys

source, snapshot, raw_cap = sys.argv[1:]
cap = int(raw_cap)
flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
fd = os.open(source, flags)
try:
    info = os.fstat(fd)
    if not stat.S_ISREG(info.st_mode):
        raise OSError("unit packet is not a regular file")
    chunks, total = [], 0
    while True:
        chunk = os.read(fd, min(65536, cap + 1 - total))
        if not chunk:
            break
        chunks.append(chunk)
        total += len(chunk)
        if total > cap:
            raise OSError(f"unit packet exceeds {cap} bytes")
finally:
    os.close(fd)
data = b"".join(chunks)
out = os.open(snapshot, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
try:
    view = memoryview(data)
    while view:
        written = os.write(out, view)
        view = view[written:]
finally:
    os.close(out)
print(hashlib.sha256(data).hexdigest())
PY
)" || { log "unit packet could not be snapshotted safely"; exit 2; }
[ "$OBSERVED_PACKET_DIGEST" = "$EXPECTED_PACKET_DIGEST" ] || {
  log "unit packet digest mismatch (expected $EXPECTED_PACKET_DIGEST, observed $OBSERVED_PACKET_DIGEST)"
  exit 2
}

redact_stream() {
  CE_WORK_REDACT_FILE="${CE_WORK_REDACT_FILE:-}" python3 -c '
import os, sys
data = sys.stdin.read()
p = os.environ.get("CE_WORK_REDACT_FILE", "")
if p:
    try:
        values = [v for v in open(p, encoding="utf-8").read().splitlines() if v]
    except OSError:
        values = []
    for value in values:
        data = data.replace(value, "[REDACTED]")
sys.stdout.write(data)
'
}

{
  cat "$PERSONA"
  printf '\n\nThe required final-result JSON schema is:\n\n'
  cat "$SCHEMA"
  printf '\n\n--- BOUNDED IMPLEMENTATION UNIT PACKET ---\n\n'
  redact_stream < "$PACKET_SNAPSHOT"
} > "$PROMPT_FILE"
chmod 600 "$PROMPT_FILE"

TARGET="$AUTH_TARGET"
HARNESS="$AUTH_HARNESS"

publish_unavailable() {
  local reason="$1"
  if [ ! -e "$LOG_FILE" ]; then
    printf '%s\n' "$reason" | redact_stream > "$LOG_FILE"
    chmod 600 "$LOG_FILE"
  fi
  python3 - "$RESULT_FILE" "$ROUTE" "$TARGET" "$HARNESS" "$MODEL_REQUESTED" "$EXPECTED_PACKET_DIGEST" "$LOG_FILE" "$reason" "$ACTIVITY_POSTURE" "$RESTRICTION_POSTURE" <<'PY'
import json, os, sys, tempfile
out, route, target, harness, requested, packet_digest, log, reason, activity, restriction = sys.argv[1:]
value = {
  "schema_version": 1, "terminal_status": "unavailable", "summary": "External route unavailable",
  "changed_files": [], "evidence": [], "scope_expansion": None,
  "requested_route": route, "actual_route": None, "target": target, "harness": harness,
  "intermediaries": ["cursor"] if route in ("composer", "grok-cursor") else [],
  "model_requested": requested, "model_actual": "unverified", "model_receipt_status": "unverified",
  "packet_digest": packet_digest,
  "activity_posture": activity, "restriction_posture": restriction,
  "failure_reason": reason, "raw_log": log,
}
fd, tmp = tempfile.mkstemp(dir=os.path.dirname(out), prefix=".result-")
with os.fdopen(fd, "w") as f: json.dump(value, f, indent=2); f.write("\n")
os.chmod(tmp, 0o600); os.replace(tmp, out)
PY
  chmod 600 "$RESULT_FILE"
}

if [ "${CE_WORK_REQUIRE_ENFORCED_CONFINEMENT:-}" = "1" ]; then
  case "$ROUTE" in
    claude|grok-cli)
      publish_unavailable "route offers cooperative workspace restriction, not required enforceable confinement"
      exit 2
      ;;
  esac
fi

case "$ROUTE" in
  codex) BINARY=codex ;;
  claude) BINARY=claude ;;
  grok-cli) BINARY=grok ;;
  cursor|composer|grok-cursor) BINARY=cursor-agent ;;
esac
if ! command -v "$BINARY" >/dev/null 2>&1; then
  publish_unavailable "fixed route executable '$BINARY' is unavailable"
  exit 2
fi

ARGS=()
while IFS= read -r -d '' token; do ARGS+=("$token"); done < <(adapter_argv "$ROUTE")

MIN_ENV=(env -i "PATH=$PATH" "PYTHONDONTWRITEBYTECODE=1")
[ -n "${HOME:-}" ] && MIN_ENV+=("HOME=$HOME")
[ -n "${TMPDIR:-}" ] && MIN_ENV+=("TMPDIR=$TMPDIR")
[ -n "${LANG:-}" ] && MIN_ENV+=("LANG=$LANG")
[ -n "${LC_ALL:-}" ] && MIN_ENV+=("LC_ALL=$LC_ALL")
[ -n "${XDG_CONFIG_HOME:-}" ] && MIN_ENV+=("XDG_CONFIG_HOME=$XDG_CONFIG_HOME")
# Preserve route-specific config-directory pointers so existing CLI-native login
# remains reachable. Credential-bearing API-key variables are intentionally not
# forwarded; the worker gets paths to the CLI's own auth store, not secrets.
case "$ROUTE" in
  codex) [ -n "${CODEX_HOME:-}" ] && MIN_ENV+=("CODEX_HOME=$CODEX_HOME") ;;
  claude) [ -n "${CLAUDE_CONFIG_DIR:-}" ] && MIN_ENV+=("CLAUDE_CONFIG_DIR=$CLAUDE_CONFIG_DIR") ;;
  grok-cli) [ -n "${GROK_CONFIG_HOME:-}" ] && MIN_ENV+=("GROK_CONFIG_HOME=$GROK_CONFIG_HOME") ;;
  cursor|composer|grok-cursor)
    [ -n "${CURSOR_CONFIG_DIR:-}" ] && MIN_ENV+=("CURSOR_CONFIG_DIR=$CURSOR_CONFIG_DIR")
    ;;
esac
ACTIVITY_POLL_SECS="${CE_WORK_ACTIVITY_POLL_SECS:-15}"
case "$ACTIVITY_POLL_SECS" in ''|*[!0-9]*) ACTIVITY_POLL_SECS=15 ;; esac
[ "$ACTIVITY_POLL_SECS" -lt 1 ] && ACTIVITY_POLL_SECS=1
MAX_RAW_BYTES="${CE_WORK_MAX_RAW_BYTES:-10485760}"
case "$MAX_RAW_BYTES" in ''|*[!0-9]*) MAX_RAW_BYTES=10485760 ;; esac
[ "$MAX_RAW_BYTES" -lt 1 ] && MAX_RAW_BYTES=10485760

raw_byte_count() {
  local total=0 bytes file
  for file in "$RAW_STDOUT" "$RAW_STDERR" "$RAW_RESULT"; do
    [ -f "$file" ] || continue
    bytes="$(wc -c < "$file" | tr -d '[:space:]')"
    case "$bytes" in ''|*[!0-9]*) bytes=0 ;; esac
    total=$((total + bytes))
  done
  printf '%s' "$total"
}

ACTIVE_ROUTE_PID=""
ACTIVITY_PID=""
terminate_route() {
  [ -n "$ACTIVITY_PID" ] && kill "$ACTIVITY_PID" 2>/dev/null || true
  [ -n "$ACTIVE_ROUTE_PID" ] && kill -TERM "$ACTIVE_ROUTE_PID" 2>/dev/null || true
  [ -n "$ACTIVE_ROUTE_PID" ] && wait "$ACTIVE_ROUTE_PID" 2>/dev/null || true
  rm -rf "$SCRATCH"
  exit 143
}
trap 'terminate_route' TERM INT

set +e
(cd "$WORKSPACE" && exec "${MIN_ENV[@]}" "${ARGS[@]}" < "$PROMPT_FILE" > "$RAW_STDOUT" 2> "$RAW_STDERR") &
ACTIVE_ROUTE_PID=$!
(
  previous=0
  while kill -0 "$ACTIVE_ROUTE_PID" 2>/dev/null; do
    current="$(raw_byte_count)"
    if [ "$current" -gt "$MAX_RAW_BYTES" ]; then
      : > "$RAW_LIMIT_MARKER"
      log "activity route=$ROUTE raw-output-limit bytes=$current cap=$MAX_RAW_BYTES"
      kill -TERM "$ACTIVE_ROUTE_PID" 2>/dev/null || true
      break
    fi
    if [ "$current" != "$previous" ]; then
      log "activity route=$ROUTE output-updated"
      previous="$current"
    fi
    sleep "$ACTIVITY_POLL_SECS"
  done
) &
ACTIVITY_PID=$!
wait "$ACTIVE_ROUTE_PID"
ROUTE_EXIT=$?
kill "$ACTIVITY_PID" 2>/dev/null || true
wait "$ACTIVITY_PID" 2>/dev/null || true
ACTIVE_ROUTE_PID=""
ACTIVITY_PID=""
RAW_BYTES="$(raw_byte_count)"
[ "$RAW_BYTES" -gt "$MAX_RAW_BYTES" ] && : > "$RAW_LIMIT_MARKER"
{
  cat "$RAW_STDOUT"
  cat "$RAW_STDERR"
  [ -f "$RAW_RESULT" ] && cat "$RAW_RESULT"
} | head -c "$MAX_RAW_BYTES" | redact_stream > "$LOG_FILE"
chmod 600 "$LOG_FILE"

if [ -f "$RAW_LIMIT_MARKER" ]; then
  publish_unavailable "fixed route raw output exceeded ${MAX_RAW_BYTES} bytes"
  exit 1
fi

if [ "$ROUTE_EXIT" -ne 0 ]; then
  publish_unavailable "fixed route exited with exit $ROUTE_EXIT"
  python3 - "$RESULT_FILE" <<'PY'
import json, sys
p=sys.argv[1]
v=json.load(open(p)); v["terminal_status"]="failed"; v["summary"]="External route failed after launch"; v["actual_route"]=v["requested_route"]
open(p,"w").write(json.dumps(v, indent=2)+"\n")
PY
  chmod 600 "$RESULT_FILE"
  exit 1
fi

SOURCE="$RAW_STDOUT"
[ "$ROUTE" = codex ] && SOURCE="$RAW_RESULT"
set +e
CE_WORK_REDACT_FILE="${CE_WORK_REDACT_FILE:-}" python3 - \
  "$SOURCE" "$RAW_STDOUT" "$RESULT_FILE" "$ROUTE" "$TARGET" "$HARNESS" \
  "$MODEL_REQUESTED" "$EXPECTED_PACKET_DIGEST" "$LOG_FILE" "$ACTIVITY_POSTURE" "$RESTRICTION_POSTURE" <<'PY'
import json, os, re, sys, tempfile
source, stream, out, route, target, harness, requested, packet_digest, log, activity, restriction = sys.argv[1:]

def redactions():
    p=os.environ.get("CE_WORK_REDACT_FILE", "")
    if not p: return []
    try: return [v for v in open(p, encoding="utf-8").read().splitlines() if v]
    except OSError: return []

def redact(value):
    text=value
    for secret in redactions(): text=text.replace(secret, "[REDACTED]")
    return text

def parse_text(text):
    found=[]
    decoder=json.JSONDecoder()
    def inspect(value):
        if isinstance(value,dict):
            if all(k in value for k in ("terminal_status","summary","changed_files","evidence","scope_expansion")):
                found.append(value)
            for child in value.values(): inspect(child)
        elif isinstance(value,list):
            for child in value: inspect(child)
        elif isinstance(value,str):
            inner=re.sub(r"^```(?:json)?\s*|\s*```$", "", value.strip(), flags=re.S)
            for i,ch in enumerate(inner):
                if ch not in "[{": continue
                try:
                    child,_=decoder.raw_decode(inner,i); inspect(child)
                except Exception: pass
    inspect(text)
    for line in text.splitlines():
        try: inspect(json.loads(line))
        except Exception: pass
    return found[-1] if found else None

try: raw=open(source, encoding="utf-8", errors="replace").read()
except OSError: raw=""
worker=parse_text(raw)
valid=isinstance(worker,dict)
worker_fields=("terminal_status", "summary", "changed_files", "evidence", "scope_expansion")
if valid:
    valid=(set(worker) == set(worker_fields)
      and worker.get("terminal_status") in ("completed","blocked","scope_expansion")
      and isinstance(worker.get("summary"),str) and bool(worker["summary"])
      and isinstance(worker.get("changed_files"),list) and all(isinstance(x,str) and x for x in worker["changed_files"])
      and isinstance(worker.get("evidence"),list) and all(isinstance(x,str) and x for x in worker["evidence"])
      and ((worker["terminal_status"]=="scope_expansion" and isinstance(worker.get("scope_expansion"),dict))
        or (worker["terminal_status"]!="scope_expansion" and worker.get("scope_expansion") is None)))

served="unverified"
if source == stream:
    stream_text=raw
else:
    try: stream_text=open(stream, encoding="utf-8", errors="replace").read()
    except OSError: stream_text=""
for line in stream_text.splitlines():
    try: event=json.loads(line)
    except Exception: continue
    if isinstance(event,dict) and event.get("model") and (event.get("subtype")=="init" or event.get("type") in ("init","system")):
        served=str(event["model"]); break

if served == "unverified": receipt="unverified"
elif requested == "auto": receipt="verified"
else:
    req=requested.lower(); actual=served.lower()
    family=("claude-fable-" if req=="fable" else "claude-opus-" if req=="opus" else
      "claude-sonnet-" if req=="sonnet" else "claude-haiku-" if req=="haiku" else req)
    normalized=lambda value: re.sub(r"[^a-z0-9]", "", value.lower())
    receipt="verified" if actual.startswith(family) or actual==req or normalized(actual)==normalized(req) else "mismatch"

intermediaries=["cursor"] if route in ("composer","grok-cursor") else []
base={
  "schema_version":1,
  "requested_route":route, "actual_route":route, "target":target, "harness":harness,
  "intermediaries":intermediaries, "model_requested":requested, "model_actual":served,
  "model_receipt_status":receipt, "activity_posture":activity,
  "packet_digest":packet_digest,
  "restriction_posture":restriction,
  "failure_reason":None, "raw_log":log,
}
if valid:
    projected={key:worker[key] for key in worker_fields}
    base.update(projected)
else:
    base.update({"terminal_status":"failed", "summary":"Adapter terminal output failed result schema",
      "changed_files":[], "evidence":[], "scope_expansion":None,
      "failure_reason":"terminal output failed implementation result schema"})
base=json.loads(redact(json.dumps(base)))
fd,tmp=tempfile.mkstemp(dir=os.path.dirname(out),prefix=".result-")
with os.fdopen(fd,"w") as f: json.dump(base,f,indent=2); f.write("\n")
os.chmod(tmp,0o600); os.replace(tmp,out)
sys.exit(0 if valid else 4)
PY
NORMALIZE_EXIT=$?
chmod 600 "$RESULT_FILE"
if [ "$NORMALIZE_EXIT" -ne 0 ]; then exit 1; fi

TERMINAL_STATUS="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["terminal_status"])' "$RESULT_FILE")"
case "$TERMINAL_STATUS" in
  completed|scope_expansion) exit 0 ;;
  *) exit 1 ;;
esac
