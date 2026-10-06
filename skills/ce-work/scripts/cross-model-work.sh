#!/usr/bin/env bash
# Run one pre-sanctioned, write-capable implementation route in a controller-
# supplied detached workspace. The adapter never creates worktrees, changes
# recipients, integrates output, or retries through another route.
#
# Every route reaches its agent through acpx (the Agent Client Protocol
# client), which prints the JSON-RPC stream; one parser reads every route.
#
# Usage:
#   cross-model-work.sh <authorization-json> <workspace> <unit-packet> <expected-packet-sha256> <result-dir>
#
# Routes: codex | claude | grok-cli | cursor | composer | grok-cursor | opencode
# Output: <result-dir>/implementation-result.json and redacted adapter.log
# Exit: 0 host-resolvable terminal result, 1 failed/schema-invalid, 2 unavailable
#
# Introspection (no model call):
#   cross-model-work.sh --emit-adapter <route>

set -uo pipefail
umask 077

# Prefer the runner-exported interpreter (sys.executable via CE_PEER_PYTHON),
# else probe execution — Windows Store's python3 stub satisfies `command -v`
# then exits nonzero (see resolve-python convention / #1247).
PY="${CE_PEER_PYTHON:-}"
if [ -z "$PY" ]; then
  PY="$(for c in python3 python py; do command -v "$c" >/dev/null 2>&1 && "$c" -c '' >/dev/null 2>&1 && { echo "$c"; break; }; done)"
fi
[ -n "$PY" ] || { echo "no working Python 3 interpreter on PATH" >&2; exit 1; }

# Cursor's ACP server offers one preset per model and rejects effort variants,
# so grok-cursor runs at high/fast and composer at its fast tier.
M_GROK_CURSOR="grok-4.7[context=256k,reasoning_effort=high,fast=true]"
M_COMPOSER="composer-2.5[fast=true]"

log() { printf '[cross-model-work] %s\n' "$*" >&2; }

route_target() {
  case "$1" in
    codex|claude|cursor|composer) printf '%s' "$1" ;;
    grok-cli|grok-cursor) printf 'grok' ;;
    opencode) printf 'opencode' ;;
    *) return 1 ;;
  esac
}

route_harness() {
  case "$1" in
    codex) printf 'codex' ;;
    claude) printf 'claude' ;;
    grok-cli) printf 'grok' ;;
    cursor|composer|grok-cursor) printf 'cursor-agent' ;;
    opencode) printf 'opencode' ;;
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
    codex|claude|grok-cli|cursor) printf 'auto' ;;
    grok-cursor) printf '%s' "$M_GROK_CURSOR" ;;
    composer) printf '%s' "$M_COMPOSER" ;;
    opencode) printf 'auto' ;;
  esac
}

route_available() {
  case "$1" in
    codex) command -v codex >/dev/null 2>&1 ;;
    claude) command -v claude >/dev/null 2>&1 ;;
    grok-cli) command -v grok >/dev/null 2>&1 ;;
    cursor|composer|grok-cursor) command -v cursor-agent >/dev/null 2>&1 ;;
    opencode) command -v opencode >/dev/null 2>&1 ;;
    *) return 1 ;;
  esac
}

# --- acpx transport (keep byte-identical across migrated peer workers) -----
# Every route reaches its agent through acpx, which speaks the Agent Client
# Protocol and prints the JSON-RPC stream, so one parser covers every CLI.
# The calling worker supplies route_available, route_model, and log.
ACPX_VERSION="0.19.4"
ACPX_UNAVAILABLE=""   # pre-egress reason; ACPX_SCOPE says whether every route shares it
ACPX_SCOPE=""

acpx_agent() {   # <route> -> acpx built-in agent name
  case "$1" in
    codex) printf 'codex' ;;
    claude) printf 'claude' ;;
    grok-cli) printf 'grok-build' ;;
    grok-cursor|cursor|composer) printf 'cursor' ;;
    opencode) printf 'opencode' ;;
    *) return 1 ;;
  esac
}

acpx_unavailable() {   # <shared|route> <reason>
  ACPX_SCOPE="$1"; ACPX_UNAVAILABLE="$2"
  return 1
}

# acpx lets ~/.acpx/config.json and <cwd>/.acpxrc.json replace a built-in
# agent's launch command; a route that would run something else is skipped.
# opencode launches the installed CLI by path, which no config entry overrides.
acpx_config_guard() {   # <route> <cwd>
  local agent file
  [ "$1" = opencode ] && return 0
  agent="$(acpx_agent "$1")" || return 1
  for file in "${HOME:-}/.acpx/config.json" "$2/.acpxrc.json"; do
    [ -e "$file" ] || continue
    if ! jq -e --arg a "$agent" '(.agents // {}) | keys | map(ascii_downcase) | index($a) == null' "$file" >/dev/null 2>&1; then
      acpx_unavailable route "$file overrides or cannot be checked for the '$agent' agent launch"
      return 1
    fi
  done
}

acpx_preflight() {   # <route> <cwd>; nothing is sent to a provider here
  local v major minor
  ACPX_UNAVAILABLE=""; ACPX_SCOPE=""
  command -v node >/dev/null 2>&1 || { acpx_unavailable shared "node not found; acpx needs Node 22.13 or newer"; return 1; }
  v="$(node -p 'process.versions.node' 2>/dev/null)"
  major="${v%%.*}"; minor="${v#*.}"; minor="${minor%%.*}"
  case "$major$minor" in ''|*[!0-9]*) acpx_unavailable shared "cannot read the Node version; acpx needs Node 22.13 or newer"; return 1 ;; esac
  if [ "$major" -lt 22 ] || { [ "$major" -eq 22 ] && [ "$minor" -lt 13 ]; }; then
    acpx_unavailable shared "Node $v is too old; acpx needs Node 22.13 or newer"
    return 1
  fi
  command -v npx >/dev/null 2>&1 || { acpx_unavailable shared "npx not found; acpx runs through npx"; return 1; }
  route_available "$1" || { acpx_unavailable route "the agent CLI for route '$1' is not installed"; return 1; }
  acpx_config_guard "$1" "$2"
}

# Claude's ACP adapter always loads project settings, so the launch goes
# through a wrapper that adds --safe-mode.
acpx_claude_wrapper() {   # <private-dir> -> wrapper path
  local real wrapper="$1/claude-safe-mode"
  real="$(command -v claude)" || return 1
  printf '#!/bin/sh\nexec %s --safe-mode "$@"\n' "$(printf '%q' "$real")" > "$wrapper" && chmod 700 "$wrapper" || return 1
  printf '%s' "$wrapper"
}

# Prints the NUL-delimited argv prefix through `npx acpx@<pin>` and its global
# flags; the worker appends permission flags, `--model`, the agent, and exec options.
# The codex and claude adapters are pointed at the installed CLIs so the pin
# governs the transport, not which models the agent can serve.
acpx_base_argv() {   # <route> <cwd> <mcp-config> <timeout-secs> <claude-wrapper>
  printf '%s\0' env npm_config_prefer_offline=true npm_config_fetch_retries=0
  case "$1" in
    codex) printf '%s\0' "CODEX_PATH=$(command -v codex)" ;;
    claude) printf '%s\0' "CLAUDE_CODE_EXECUTABLE=$5" ;;
  esac
  printf '%s\0' npx -y "acpx@$ACPX_VERSION" --cwd "$2" --format json --mcp-config "$3" --timeout "$4"
}

acpx_agent_argv() {   # <route>
  if [ "$1" = opencode ]; then printf '%s\0' --agent "$(command -v opencode) acp" exec
  else printf '%s\0' "$(acpx_agent "$1")" exec; fi
}

# The run's outcome is the result of its own session/prompt request, matched by
# id because --model adds a session/set_model request before the prompt.
acpx_outcome() {   # <stream-log> -> end_turn | <other stopReason> | error | incomplete | not-sent
  local id outcome
  id="$(jq -R 'fromjson? | select(.method == "session/prompt") | .id' "$1" 2>/dev/null | tail -1)"
  [ -n "$id" ] || { printf 'not-sent'; return 0; }
  outcome="$(jq -rR --argjson id "$id" 'fromjson? | select(.method == null and .id == $id) | if .error then "error" else (.result.stopReason // "error") end' "$1" 2>/dev/null | tail -1)"
  printf '%s' "${outcome:-incomplete}"
}

acpx_text() {   # <stream-log> <outfile>: the agent's reply text
  jq -jR 'fromjson? | select(.method == "session/update" and .params.update.sessionUpdate == "agent_message_chunk") | .params.update.content.text // empty' "$1" > "$2" 2>/dev/null
}

# Model ids the adapter reports in the prompt result's _meta. acpx documents
# _meta as adapter-defined, so these are the adapter's assertion, not proof.
acpx_served_models() {   # <stream-log> -> "<model> <tokens>" lines
  jq -rR 'fromjson? | select(.result.stopReason?) | .result._meta // {} |
    ((.quota.model_usage // [])[] | "\(.model) \(.token_count.totalTokens // 0)"),
    (.modelId // empty | "\(.) 0")' "$1" 2>/dev/null
}

# Bounded failure evidence from the stream. The stream echoes the outbound
# prompt, so only error messages and the stop reason are read from it.
acpx_failure_evidence() {   # <stream-log>
  local evidence
  evidence="$(jq -rR 'fromjson? | (.error.message? // empty), (.result.stopReason? // empty | select(. != "end_turn") | "stopReason=" + .)' "$1" 2>/dev/null | tr '\n' ' ')"
  evidence="${evidence% }"
  [ "${#evidence}" -gt 300 ] && evidence="${evidence:0:147} ... ${evidence: -147}"
  printf '%s' "$evidence"
}
# --- end acpx transport -----------------------------------------------------

# Cursor routes take Cursor's ACP model ids, which may carry a bracketed preset
# (grok-4.7[context=256k,reasoning_effort=high,fast=true]); the family rule
# applies to the id before the bracket.
CURSOR_MODEL_RE='^([A-Za-z0-9][A-Za-z0-9._:/-]*)(\[[A-Za-z0-9._=,:-]*\])?$'

validate_model_override() {
  local route="$1" override="${CE_WORK_MODEL_OVERRIDE:-}" override_target="${CE_WORK_MODEL_OVERRIDE_TARGET:-}" target base base_lower
  [ -n "$override" ] || { [ -z "$override_target" ]; return; }
  case "$override_target" in
    codex|claude|grok|cursor|composer|opencode) ;;
    *) return 1 ;;
  esac
  target="$(route_target "$route")" || return 1
  [ "$override_target" = "$target" ] || return 0
  base="$override"
  case "$route" in
    cursor|composer|grok-cursor)
      [[ "$override" =~ $CURSOR_MODEL_RE ]] || return 1
      base="${BASH_REMATCH[1]}"
      ;;
  esac
  if [ "$route" = cursor ]; then
    base_lower="$(printf '%s' "$base" | tr '[:upper:]' '[:lower:]')"
    case "$base_lower" in composer|composer-*|grok|grok-*|cursor-grok-*) return 1 ;; esac
    return 0
  fi
  case "$route:$base" in
    codex:gpt-*|codex:o[0-9]*|claude:fable|claude:opus|claude:sonnet|claude:haiku|claude:claude-*|grok-cli:grok-*|grok-cursor:grok-*|grok-cursor:cursor-grok-*|composer:composer-*|opencode:*/*) ;;
    *) return 1 ;;
  esac
}

# Accept an effort only where the route's ACP adapter exposes an effort option
# and lists the value (claude effort, codex and grok reasoning_effort; checked
# 2026-10-06 through acpx 0.19.4). Codex levels vary per model, so a listed
# level can still be refused before the prompt is sent. Cursor fixes effort in
# the model preset and OpenCode has no effort option over ACP, so any effort
# there makes the route unavailable instead of being dropped.
validate_effort_override() {
  local route="$1" effort="${EFFORT_REQUESTED:-}"
  [ -n "$effort" ] || return 0
  case "$route:$effort" in
    claude:low|claude:medium|claude:high|claude:xhigh|claude:max) ;;
    codex:low|codex:medium|codex:high|codex:xhigh|codex:max|codex:ultra) ;;
    grok-cli:low|grok-cli:medium|grok-cli:high|grok-cli:xhigh) ;;
    *) return 1 ;;
  esac
}

# The worker runs in the prepared workspace with every permission request
# approved. Each adapter runs in its write-capable mode (codex agent, claude
# default, cursor agent, opencode build); none of them confines writes to the
# workspace, which references/cross-model-execution.md records per route.
# Codex and Claude run at high effort and native Grok at xhigh unless the
# authorization requests another level.
adapter_argv() {
  local route="$1" model
  acpx_agent "$route" >/dev/null || return 1
  model="$(route_model "$route")"
  acpx_base_argv "$route" "$WORKSPACE" "$MCP_CONFIG" "$ACPX_TIMEOUT" "$CLAUDE_WRAPPER"
  printf '%s\0' --approve-all
  [ "$model" = auto ] || printf '%s\0' --model "$model"
  acpx_agent_argv "$route"
  case "$route" in
    codex) printf '%s\0' --config-option mode=agent --config-option "reasoning_effort=${EFFORT_REQUESTED:-high}" ;;
    # Claude otherwise starts in the user's default permission mode.
    claude) printf '%s\0' --config-option mode=default --config-option "effort=${EFFORT_REQUESTED:-high}" ;;
    grok-cli) printf '%s\0' --config-option "reasoning_effort=${EFFORT_REQUESTED:-xhigh}" ;;
    cursor|composer|grok-cursor) printf '%s\0' --config-option mode=agent ;;
    opencode) printf '%s\0' --config-option mode=build ;;
  esac
  printf '%s\0' --file "$PROMPT_FILE"
}

ACPX_TIMEOUT="${CE_PEER_HARD_SECS:-7200}"
case "$ACPX_TIMEOUT" in ''|0|*[!0-9]*) ACPX_TIMEOUT=7200 ;; esac

if [ "${1:-}" = "--emit-adapter" ]; then
  WORKSPACE="<workspace>"
  PROMPT_FILE="<prompt-file>"
  MCP_CONFIG="<mcp-config>"
  CLAUDE_WRAPPER="<claude-safe-mode-wrapper>"
  ROUTE="${2:-}"
  EFFORT_REQUESTED="${CROSS_MODEL_EFFORT_OVERRIDE:-}"
  validate_model_override "$ROUTE" || {
    printf "model override '%s' not compatible with route '%s'\n" "${CE_WORK_MODEL_OVERRIDE:-}" "$ROUTE" >&2
    exit 2
  }
  validate_effort_override "$ROUTE" || {
    printf "effort override '%s' not compatible with route '%s'\n" "$EFFORT_REQUESTED" "$ROUTE" >&2
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
# acpx prints the ACP stream on stdout; npm and adapter diagnostics go to stderr.
RAW_STDOUT="$SCRATCH/stdout.log"
RAW_STDERR="$SCRATCH/stderr.log"
STREAM="$SCRATCH/stream.redacted"
REPLY_TEXT="$SCRATCH/reply.txt"
SERVED_MODELS="$SCRATCH/served-models"
MCP_CONFIG="$SCRATCH/mcp.json"
CLAUDE_WRAPPER=""
RAW_LIMIT_MARKER="$SCRATCH/raw-output-limit"
PACKET_SNAPSHOT="$SCRATCH/unit-packet"
AUTH_VALUES="$SCRATCH/authorization-values"
RESULT_FILE="$RESULT_DIR/implementation-result.json"
LOG_FILE="$RESULT_DIR/adapter.log"
LOG_RETAINED=0
trap 'rm -rf "$SCRATCH"' EXIT

# The controller's create-exclusive authorization artifact is the production
# dispatch capability. Read it once through a no-follow descriptor, validate
# its exact route/model/packet contract, and derive every dispatch identity
# field from those bytes before constructing a prompt or invoking a model CLI.
"$PY" - "$AUTHORIZATION" "$EXPECTED_PACKET_DIGEST" "$AUTH_VALUES" <<'PY'
import json, os, re, stat, sys

source, expected_packet_digest, output = sys.argv[1:]
required = {
    "schema_version", "run_id", "unit_id", "attempt_id", "route", "target", "harness",
    "intermediaries", "model_requested", "restriction_posture",
    "restrictions", "activity_posture", "packet_digest",
}
contracts = {
    "codex": ("codex", "codex", [], "cooperative"),
    "claude": ("claude", "claude", [], "cooperative"),
    "grok-cli": ("grok", "grok", [], "cooperative"),
    "cursor": ("cursor", "cursor-agent", [], "cooperative"),
    "composer": ("composer", "cursor-agent", ["cursor"], "cooperative"),
    "grok-cursor": ("grok", "cursor-agent", ["cursor"], "cooperative"),
    "opencode": ("opencode", "opencode", [], "cooperative"),
}

def fail(message):
    raise ValueError(message)

def model_allowed(route, model):
    if not isinstance(model, str) or not model or "\n" in model or "\r" in model:
        return False
    if route in ("cursor", "composer", "grok-cursor"):
        match = re.fullmatch(r"([A-Za-z0-9][A-Za-z0-9._:/-]*)(?:\[[A-Za-z0-9._=,:-]*\])?", model)
        if not match:
            return False
        base = match.group(1)
        if route == "composer":
            return bool(re.fullmatch(r"composer-[A-Za-z0-9._-]+", base))
        if route == "grok-cursor":
            return bool(re.fullmatch(r"(?:cursor-)?grok-[A-Za-z0-9._-]+", base))
        lowered = base.lower()
        return not (lowered in {"composer", "grok"} or lowered.startswith(("composer-", "grok-", "cursor-grok-")))
    if route == "codex":
        return model == "auto" or bool(re.fullmatch(r"(?:gpt-[A-Za-z0-9._-]+|o[0-9][A-Za-z0-9._-]*)", model))
    if route == "claude":
        return model in {"auto", "fable", "opus", "sonnet", "haiku"} or bool(re.fullmatch(r"claude-[A-Za-z0-9._-]+", model))
    if route == "grok-cli":
        return model == "auto" or bool(re.fullmatch(r"grok-[A-Za-z0-9._-]+", model))
    if route == "opencode":
        return model == "auto" or bool(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*/[A-Za-z0-9._-]+", model))
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
    if not isinstance(value, dict) or set(value) - {"effort_requested"} != required:
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
    effort = value.get("effort_requested", "")
    if "effort_requested" in value and (not isinstance(effort, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,31}", effort)):
        fail("authorization effort_requested is not a short plain token")
    packet_digest = value["packet_digest"]
    if not isinstance(packet_digest, str) or not re.fullmatch(r"[0-9a-f]{64}", packet_digest):
        fail("authorization packet_digest is not lowercase SHA-256")
    if packet_digest != expected_packet_digest:
        fail("authorization packet digest does not match dispatch")
    authorization_digest = __import__("hashlib").sha256(b"".join(chunks)).hexdigest()
    fields = (
        authorization_digest, value["run_id"], value["unit_id"], value["attempt_id"],
        route, target, harness, value["model_requested"], value["activity_posture"], posture, effort,
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
[ "${#AUTH_FIELDS[@]}" -eq 11 ] || { log "controller authorization projection is incomplete"; exit 2; }
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
EFFORT_REQUESTED="${AUTH_FIELDS[10]}"
RUNNER_JOB_ID="${CE_PEER_JOB_ID:-}"
[[ "$RUNNER_JOB_ID" =~ ^[A-Za-z0-9._-]{1,128}$ && "$RUNNER_JOB_ID" =~ [A-Za-z0-9_-] ]] || {
  log "runner job identity is missing or unsafe"
  exit 2
}

# A valid JSON file is not itself dispatch authority. Prove the exact no-follow
# snapshot and every raw controller-returned path back to the controller before
# prompt construction. Only its AUTHORIZED status permits external egress.
CONTROLLER="$SKILL_ROOT/scripts/unit-workspace.py"
AUTH_RESPONSE="$("$PY" "$CONTROLLER" authorize-dispatch \
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
RESULT_DIR_IDENTITY="$("$PY" - "$RESULT_DIR" <<'PY'
import os, stat, sys

path = sys.argv[1]
flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | getattr(os, "O_NOFOLLOW", 0)
fd = os.open(path, flags)
try:
    info = os.fstat(fd)
    if not stat.S_ISDIR(info.st_mode):
        raise OSError("result dir is not a directory")
    print(f"{info.st_dev}:{info.st_ino}")
finally:
    os.close(fd)
PY
)" || { log "result dir identity could not be captured"; exit 2; }

write_adapter_log() {
  "$PY" -c '
import os, stat, sys

path, expected = sys.argv[1:]
dir_flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | getattr(os, "O_NOFOLLOW", 0)
try:
    dir_fd = os.open(path, dir_flags)
    try:
        directory = os.fstat(dir_fd)
        if not stat.S_ISDIR(directory.st_mode):
            raise OSError("result dir is not a directory")
        if f"{directory.st_dev}:{directory.st_ino}" != expected:
            raise OSError("result dir identity changed during route")
        file_flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
        log_fd = os.open("adapter.log", file_flags, 0o600, dir_fd=dir_fd)
        try:
            target = os.fstat(log_fd)
            if not stat.S_ISREG(target.st_mode):
                raise OSError("adapter log is not a regular file")
            os.fchmod(log_fd, 0o600)
            while True:
                chunk = sys.stdin.buffer.read(65536)
                if not chunk:
                    break
                view = memoryview(chunk)
                while view:
                    view = view[os.write(log_fd, view):]
        finally:
            os.close(log_fd)
    finally:
        os.close(dir_fd)
except OSError as error:
    print(f"adapter log retention refused: {error}", file=sys.stderr)
    raise SystemExit(2)
' "$RESULT_DIR" "$RESULT_DIR_IDENTITY"
}

write_result_receipt() {
  "$PY" -c '
import os, secrets, stat, sys

path, expected = sys.argv[1:]
dir_flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | getattr(os, "O_NOFOLLOW", 0)
dir_fd = None
receipt_fd = None
tmp_name = None
try:
    data = sys.stdin.buffer.read()
    dir_fd = os.open(path, dir_flags)
    directory = os.fstat(dir_fd)
    if not stat.S_ISDIR(directory.st_mode):
        raise OSError("result dir is not a directory")
    if f"{directory.st_dev}:{directory.st_ino}" != expected:
        raise OSError("result dir identity changed during route")
    file_flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
    for _ in range(128):
        candidate = f".result-{os.getpid()}-{secrets.token_hex(8)}"
        try:
            receipt_fd = os.open(candidate, file_flags, 0o600, dir_fd=dir_fd)
            tmp_name = candidate
            break
        except FileExistsError:
            continue
    if receipt_fd is None:
        raise OSError("could not reserve a result receipt temporary file")
    target = os.fstat(receipt_fd)
    if not stat.S_ISREG(target.st_mode):
        raise OSError("result receipt temporary file is not regular")
    os.fchmod(receipt_fd, 0o600)
    view = memoryview(data)
    while view:
        view = view[os.write(receipt_fd, view):]
    os.close(receipt_fd)
    receipt_fd = None
    os.replace(
        tmp_name,
        "implementation-result.json",
        src_dir_fd=dir_fd,
        dst_dir_fd=dir_fd,
    )
    tmp_name = None
except OSError as error:
    print(f"result receipt publication refused: {error}", file=sys.stderr)
    raise SystemExit(2)
finally:
    if receipt_fd is not None:
        os.close(receipt_fd)
    if tmp_name is not None and dir_fd is not None:
        try:
            os.unlink(tmp_name, dir_fd=dir_fd)
        except OSError:
            pass
    if dir_fd is not None:
        os.close(dir_fd)
' "$RESULT_DIR" "$RESULT_DIR_IDENTITY"
}

# Read the packet once through a no-follow descriptor, hash those exact bytes,
# and build the prompt from the private snapshot. The controller-provided
# digest is therefore bound to the content that actually crosses the route.
OBSERVED_PACKET_DIGEST="$("$PY" - "$PACKET" "$PACKET_SNAPSHOT" "$MAX_PACKET_BYTES" <<'PY'
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
  CE_WORK_REDACT_FILE="${CE_WORK_REDACT_FILE:-}" "$PY" -c '
import json, os, sys

# The ACP stream is JSON, so a value is also matched in its escaped forms.
def forms(value):
    yield value
    try:
        text = value.decode("utf-8")
    except UnicodeDecodeError:
        return
    yield json.dumps(text, ensure_ascii=False)[1:-1].encode("utf-8")
    yield json.dumps(text)[1:-1].encode("ascii")

p = os.environ.get("CE_WORK_REDACT_FILE", "")
if p:
    try:
        values = sorted(
            {form for v in open(p, "rb").read().splitlines() if v for form in forms(v)},
            key=lambda value: (-len(value), value),
        )
    except OSError:
        values = []
else:
    values = []

def emit(data):
    while data:
        written = os.write(sys.stdout.fileno(), data)
        data = data[written:]

pending = b""
max_value_bytes = max((len(value) for value in values), default=1)
try:
    if not values:
        while True:
            chunk = os.read(sys.stdin.fileno(), 65536)
            if not chunk:
                break
            emit(chunk)
        sys.exit(0)

    while True:
        chunk = os.read(sys.stdin.fileno(), 65536)
        if not chunk:
            break
        pending += chunk
        offset = 0
        output = bytearray()
        while len(pending) - offset >= max_value_bytes:
            match = next((value for value in values if pending.startswith(value, offset)), None)
            if match is not None:
                output.extend(b"[REDACTED]")
                offset += len(match)
            else:
                output.append(pending[offset])
                offset += 1
        emit(bytes(output))
        pending = pending[offset:]
    offset = 0
    output = bytearray()
    while offset < len(pending):
        match = next((value for value in values if pending.startswith(value, offset)), None)
        if match is not None:
            output.extend(b"[REDACTED]")
            offset += len(match)
        else:
            output.append(pending[offset])
            offset += 1
    emit(bytes(output))
except BrokenPipeError:
    os._exit(0)
'
}

cap_stream() {
  "$PY" -c '
import os, sys

remaining = int(sys.argv[1])
while True:
    chunk = os.read(sys.stdin.fileno(), 65536)
    if not chunk:
        break
    if remaining:
        retained = chunk[:remaining]
        while retained:
            written = os.write(sys.stdout.fileno(), retained)
            retained = retained[written:]
        remaining -= min(len(chunk), remaining)
' "$MAX_RAW_BYTES"
}

{
  cat "$PERSONA"
  if [ "$ROUTE" = codex ]; then
    printf '\n\nSocket binds, OS permission checks, peer credentials, and similar capability probes are host-owned. Preserve the host command and observed result; do not treat a sandbox EPERM as proof the host lacks the capability.\n'
  fi
  printf '\n\nThe required final-result JSON schema is:\n\n'
  cat "$SCHEMA"
  printf '\n\n--- BOUNDED IMPLEMENTATION UNIT PACKET ---\n\n'
  redact_stream < "$PACKET_SNAPSHOT"
} > "$PROMPT_FILE"
chmod 600 "$PROMPT_FILE"

TARGET="$AUTH_TARGET"
HARNESS="$AUTH_HARNESS"

publish_unavailable() {
  local reason terminal_status="${2:-unavailable}" actual_route="${3:-}"
  # Failure evidence can quote the stream, so it is redacted like the log.
  reason="$(printf '%s' "$1" | redact_stream)"
  if [ "$LOG_RETAINED" -ne 1 ]; then
    printf '%s\n' "$reason" | write_adapter_log || {
      log "result dir or adapter log identity changed during route"
      exit 2
    }
    LOG_RETAINED=1
  fi
  "$PY" - "$ROUTE" "$TARGET" "$HARNESS" "$MODEL_REQUESTED" "$EXPECTED_PACKET_DIGEST" "$LOG_FILE" "$reason" "$ACTIVITY_POSTURE" "$RESTRICTION_POSTURE" "$terminal_status" "$actual_route" "$EFFORT_REQUESTED" <<'PY' | write_result_receipt
import json, sys
route, target, harness, requested, packet_digest, log, reason, activity, restriction, terminal_status, actual_route, effort = sys.argv[1:]
value = {
  "schema_version": 1, "terminal_status": terminal_status,
  "summary": "External route failed after launch" if terminal_status == "failed" else "External route unavailable",
  "changed_files": [], "evidence": [], "scope_expansion": None,
  "requested_route": route, "actual_route": actual_route or None, "target": target, "harness": harness,
  "intermediaries": ["cursor"] if route in ("composer", "grok-cursor") else [],
  "model_requested": requested, "model_actual": "unverified", "model_receipt_status": "unverified",
  "effort_requested": effort or None,
  "packet_digest": packet_digest,
  "activity_posture": activity, "restriction_posture": restriction,
  "failure_reason": reason, "raw_log": log,
}
json.dump(value, sys.stdout, indent=2)
sys.stdout.write("\n")
PY
}

if [ "${CE_WORK_REQUIRE_ENFORCED_CONFINEMENT:-}" = "1" ] && [ "$RESTRICTION_POSTURE" != adapter-enforced ]; then
  publish_unavailable "route offers cooperative workspace restriction, not required enforceable confinement" || exit 2
  exit 2
fi

validate_effort_override "$ROUTE" || {
  publish_unavailable "effort override '$EFFORT_REQUESTED' not compatible with route '$ROUTE'" || exit 2
  exit 2
}

# The Codex desktop app (Codex.app, or ChatGPT.app since the July 2026 merger)
# ships `codex` at Contents/Resources without linking it onto PATH (#1272).
# Append, never prepend, so a PATH-installed CLI stays authoritative.
# CROSS_MODEL_CODEX_APP_DIRS (colon-separated) overrides the probed dirs.
if ! command -v codex >/dev/null 2>&1; then
  OLDIFS="$IFS"; IFS=':'
  for d in ${CROSS_MODEL_CODEX_APP_DIRS-"${HOME:-}/Applications/ChatGPT.app/Contents/Resources:/Applications/ChatGPT.app/Contents/Resources:${HOME:-}/Applications/Codex.app/Contents/Resources:/Applications/Codex.app/Contents/Resources"}; do
    if [ -n "$d" ] && [ -x "$d/codex" ]; then PATH="${PATH:+$PATH:}$d"; export PATH; break; fi
  done
  IFS="$OLDIFS"
fi

# Nothing is sent to a provider before this point.
if ! command -v jq >/dev/null 2>&1; then
  publish_unavailable "transport unavailable (pre-egress, shared): jq not found; the ACP stream is read with jq" || exit 2
  exit 2
fi
acpx_preflight "$ROUTE" "$WORKSPACE" || {
  publish_unavailable "transport unavailable (pre-egress, $ACPX_SCOPE): $ACPX_UNAVAILABLE" || exit 2
  exit 2
}
if [ "$ROUTE" = claude ]; then
  CLAUDE_WRAPPER="$(acpx_claude_wrapper "$SCRATCH")" || {
    publish_unavailable "transport unavailable (pre-egress, route): cannot prepare the Claude --safe-mode launcher" || exit 2
    exit 2
  }
fi
printf '{"mcpServers":[]}\n' > "$MCP_CONFIG"

ARGS=()
while IFS= read -r -d '' token; do ARGS+=("$token"); done < <(adapter_argv "$ROUTE")

MIN_ENV=(env -i "PATH=$PATH" "PYTHONDONTWRITEBYTECODE=1")
[ -n "${HOME:-}" ] && MIN_ENV+=("HOME=$HOME")
[ -n "${USER:-}" ] && MIN_ENV+=("USER=$USER")
[ -n "${TMPDIR:-}" ] && MIN_ENV+=("TMPDIR=$TMPDIR")
[ -n "${LANG:-}" ] && MIN_ENV+=("LANG=$LANG")
[ -n "${LC_ALL:-}" ] && MIN_ENV+=("LC_ALL=$LC_ALL")
[ -n "${XDG_CONFIG_HOME:-}" ] && MIN_ENV+=("XDG_CONFIG_HOME=$XDG_CONFIG_HOME")
# npx reaches the user's npm cache, registry, and user config by these
# locations. npm auth token values are never forwarded; npm reads its own
# config file for them.
for name in npm_config_cache NPM_CONFIG_CACHE npm_config_registry NPM_CONFIG_REGISTRY npm_config_userconfig NPM_CONFIG_USERCONFIG; do
  [ -n "${!name:-}" ] && MIN_ENV+=("$name=${!name}")
done
# Preserve route-specific config-directory pointers so existing CLI-native login
# remains reachable. Credential-bearing API-key variables are intentionally not
# forwarded; the worker gets paths to the CLI's own auth store, not secrets.
case "$ROUTE" in
  codex) [ -n "${CODEX_HOME:-}" ] && MIN_ENV+=("CODEX_HOME=$CODEX_HOME") ;;
  claude) [ -n "${CLAUDE_CONFIG_DIR:-}" ] && MIN_ENV+=("CLAUDE_CONFIG_DIR=$CLAUDE_CONFIG_DIR") ;;
  grok-cli) [ -n "${GROK_CONFIG_HOME:-}" ] && MIN_ENV+=("GROK_CONFIG_HOME=$GROK_CONFIG_HOME") ;;
  opencode)
    [ -n "${OPENCODE_CONFIG_DIR:-}" ] && MIN_ENV+=("OPENCODE_CONFIG_DIR=$OPENCODE_CONFIG_DIR")
    [ -n "${OPENCODE_CONFIG:-}" ] && MIN_ENV+=("OPENCODE_CONFIG=$OPENCODE_CONFIG")
    ;;
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
  for file in "$RAW_STDOUT" "$RAW_STDERR"; do
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
(cd "$WORKSPACE" && exec "${MIN_ENV[@]}" "${ARGS[@]}" < /dev/null > "$RAW_STDOUT" 2> "$RAW_STDERR") &
ACTIVE_ROUTE_PID=$!
(
  # A foreground sleep would outlive this subshell's TERM and hold the script's
  # output open, so callers (bun 1.4 spawnSync) would wait out the poll interval.
  # Kill every background job, so a TERM between `sleep &` and `$!` still reaps it.
  trap 'kill $(jobs -p) 2>/dev/null; exit 0' TERM
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
    sleep "$ACTIVITY_POLL_SECS" &
    wait $!
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
# Everything below reads the redacted stream: acpx echoes the outbound prompt
# and the contents of files the agent reads.
redact_stream < "$RAW_STDOUT" > "$STREAM"
{
  cat "$STREAM"
  redact_stream < "$RAW_STDERR"
} | cap_stream | write_adapter_log || {
  log "result dir or adapter log identity changed during route"
  exit 2
}
LOG_RETAINED=1

if [ -f "$RAW_LIMIT_MARKER" ]; then
  publish_unavailable "fixed route raw output exceeded ${MAX_RAW_BYTES} bytes" || exit 2
  exit 1
fi

# The run's outcome is its own prompt's result, not acpx's exit code.
OUTCOME="$(acpx_outcome "$STREAM")"
case "$OUTCOME" in
  end_turn) ;;
  not-sent)
    # Nothing reached the provider: npm could not fetch acpx (every route fails
    # alike), or the adapter refused before the prompt (this route only).
    REASON="$(grep -m1 '^npm error' "$RAW_STDERR" 2>/dev/null)"
    if [ -n "$REASON" ]; then
      REASON="transport unavailable (pre-egress, shared): ${REASON:0:200}"
    else
      REASON="$(acpx_failure_evidence "$STREAM")"
      REASON="transport unavailable (pre-egress, route): ${REASON:-acpx exited $ROUTE_EXIT before sending the prompt}"
    fi
    publish_unavailable "$REASON" || exit 2
    exit 2
    ;;
  *)
    REASON="$(acpx_failure_evidence "$STREAM")"
    publish_unavailable "fixed route ended with $OUTCOME (acpx exit $ROUTE_EXIT)${REASON:+: $REASON}" failed "$ROUTE" || exit 2
    exit 1
    ;;
esac

acpx_text "$STREAM" "$REPLY_TEXT"
acpx_served_models "$STREAM" > "$SERVED_MODELS"
set +e
CE_WORK_REDACT_FILE="${CE_WORK_REDACT_FILE:-}" "$PY" - \
  "$REPLY_TEXT" "$SERVED_MODELS" "$ROUTE" "$TARGET" "$HARNESS" \
  "$MODEL_REQUESTED" "$EXPECTED_PACKET_DIGEST" "$LOG_FILE" "$ACTIVITY_POSTURE" "$RESTRICTION_POSTURE" "$EFFORT_REQUESTED" <<'PY' | write_result_receipt
import json, os, re, sys
reply, served_models, route, target, harness, requested, packet_digest, log, activity, restriction, effort = sys.argv[1:]

def redactions():
    p=os.environ.get("CE_WORK_REDACT_FILE", "")
    if not p: return []
    try: return sorted(set(v for v in open(p, encoding="utf-8").read().splitlines() if v), key=lambda value: (-len(value), value))
    except OSError: return []

redaction_values=redactions()

def redact(value):
    if isinstance(value,str):
        for secret in redaction_values: value=value.replace(secret, "[REDACTED]")
        return value
    if isinstance(value,list): return [redact(child) for child in value]
    if isinstance(value,dict): return {key:redact(child) for key,child in value.items()}
    return value

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

def normalize_served_model(value):
    # Strip terminal control sequences before validating the receipt token;
    # never publish a partially sanitized or otherwise unsafe identity.
    text=str(value)
    text=re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", text)
    text=re.sub(r"\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)", "", text)
    text="".join(ch for ch in text if ord(ch) >= 0x20 and ord(ch) != 0x7f).strip()
    return text if 0 < len(text) <= 128 else "unverified"

try: text=open(reply, encoding="utf-8", errors="replace").read()
except OSError: text=""
worker=parse_text(text)
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

# The adapter's _meta report is its own assertion of the served model, so a
# match is recorded as "asserted", never "verified". Requested and served ids
# are compared on the model id before any Cursor preset bracket; an alias
# names its Claude family. An auxiliary model (Claude's Haiku) may also be
# reported, so a served id in the requested family wins, else the heaviest.
served=[]
try:
    for line in open(served_models, encoding="utf-8", errors="replace").read().splitlines():
        model, _, tokens = line.rpartition(" ")
        model=normalize_served_model(model)
        if model != "unverified":
            served.append((model, int(tokens) if tokens.isdigit() else 0))
except OSError:
    pass
model_base=lambda value: value.split("[",1)[0].lower()
family=model_base(requested)
if family in ("fable","opus","sonnet","haiku"): family="claude-"+family
in_family=[m for m,_ in served if model_base(m)==family or model_base(m).startswith(family+"-")]
if not served: actual, receipt = "unverified", "unverified"
elif requested == "auto": actual, receipt = max(served, key=lambda item: item[1])[0], "asserted"
elif in_family: actual, receipt = in_family[0], "asserted"
else: actual, receipt = max(served, key=lambda item: item[1])[0], "mismatch"

intermediaries=["cursor"] if route in ("composer","grok-cursor") else []
base_receipt={
  "schema_version":1,
  "requested_route":route, "actual_route":route, "target":target, "harness":harness,
  "intermediaries":intermediaries, "model_requested":requested, "model_actual":actual,
  "model_receipt_status":receipt, "effort_requested":effort or None, "activity_posture":activity,
  "packet_digest":packet_digest,
  "restriction_posture":restriction,
  "failure_reason":None, "raw_log":log,
}
if valid:
    base_receipt.update({key:worker[key] for key in worker_fields})
else:
    base_receipt.update({"terminal_status":"failed", "summary":"Adapter terminal output failed result schema",
      "changed_files":[], "evidence":[], "scope_expansion":None,
      "failure_reason":"terminal output failed implementation result schema"})
base_receipt=redact(base_receipt)
json.dump(base_receipt,sys.stdout,indent=2)
sys.stdout.write("\n")
sys.exit(0 if valid else 4)
PY
NORMALIZE_STATUSES=("${PIPESTATUS[@]}")
NORMALIZE_EXIT="${NORMALIZE_STATUSES[0]}"
PUBLISH_EXIT="${NORMALIZE_STATUSES[1]}"
if [ "$PUBLISH_EXIT" -ne 0 ]; then exit 2; fi
if [ "$NORMALIZE_EXIT" -ne 0 ]; then exit 1; fi

TERMINAL_STATUS="$("$PY" -c 'import json,sys; print(json.load(open(sys.argv[1]))["terminal_status"])' "$RESULT_FILE")"
case "$TERMINAL_STATUS" in
  completed|blocked|scope_expansion) exit 0 ;;
  *) exit 1 ;;
esac
