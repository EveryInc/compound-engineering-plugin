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
# Exit: 0 host-resolvable terminal result, 1 failed/schema-invalid, 2 unavailable
#
# Introspection (no model call):
#   cross-model-work.sh --emit-adapter <route>

set -uo pipefail
umask 077

M_GROK_CURSOR="cursor-grok-4.5-high"
M_COMPOSER="composer-2.5-fast"
HOST_PYTHON="/usr/bin/python3"
ROUTE_SEARCH_PATH="${PATH:-}"
PATH="/usr/bin:/bin"
export PATH

log() { printf '[cross-model-work] %s\n' "$*" >&2; }
[ -x "$HOST_PYTHON" ] || { log "fixed host Python interpreter is unavailable"; exit 2; }

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
    codex|claude|grok-cli|cursor) printf 'auto' ;;
    grok-cursor) printf '%s' "$M_GROK_CURSOR" ;;
    composer) printf '%s' "$M_COMPOSER" ;;
  esac
}

route_effort() {
  local route="$1"
  if [ -n "${EFFORT_REQUESTED:-}" ]; then
    printf '%s' "$EFFORT_REQUESTED"
    return
  fi
  if [ -n "${CE_ROUTING_CANDIDATE_EFFORT:-}" ]; then
    printf '%s' "$CE_ROUTING_CANDIDATE_EFFORT"
    return
  fi
  case "$route" in
    codex|cursor|composer|grok-cursor) printf 'auto' ;;
    claude|grok-cli) printf 'high' ;;
  esac
}

validate_route_effort() {
  case "$1:$(route_effort "$1")" in
    codex:auto|codex:minimal|codex:low|codex:medium|codex:high|codex:xhigh) ;;
    claude:low|claude:medium|claude:high) ;;
    grok-cli:low|grok-cli:medium|grok-cli:high) ;;
    cursor:auto|composer:auto|grok-cursor:auto) ;;
    *) return 1 ;;
  esac
}

validate_model_override() {
  local route="$1" override="${CE_WORK_MODEL_OVERRIDE:-}" override_target="${CE_WORK_MODEL_OVERRIDE_TARGET:-}" target override_lower
  [ -n "$override" ] || { [ -z "$override_target" ]; return; }
  case "$override_target" in
    codex|claude|grok|cursor|composer) ;;
    *) return 1 ;;
  esac
  target="$(route_target "$route")" || return 1
  [ "$override_target" = "$target" ] || return 0
  if [ "$route" = cursor ]; then
    case "$override" in
      [A-Za-z0-9]*)
        case "$override" in *[!A-Za-z0-9._:/-]*) return 1 ;; esac
        override_lower="$(printf '%s' "$override" | tr '[:upper:]' '[:lower:]')"
        case "$override_lower" in composer|composer-*|grok|grok-*|cursor-grok-*) return 1 ;; esac
        return 0
        ;;
      *) return 1 ;;
    esac
  fi
  case "$route:$override" in
    codex:gpt-*|codex:o[0-9]*|claude:fable|claude:opus|claude:sonnet|claude:haiku|claude:claude-*|grok-cli:grok-*|grok-cursor:cursor-grok-*|composer:composer-*) ;;
    *) return 1 ;;
  esac
}

adapter_argv() {
  case "$1" in
    codex)
      local codex_effort
      codex_effort="$(route_effort codex)"
      # ce-dispatch-site:ce-work.implementation-cli-codex
      printf '%s\0' codex exec --ignore-user-config --ignore-rules --ephemeral \
        -s workspace-write -C "$WORKSPACE" --json -o "$RAW_RESULT"
      [ "$(route_model codex)" = auto ] || printf '%s\0' -m "$(route_model codex)"
      [ "$codex_effort" = auto ] || printf '%s\0' -c "model_reasoning_effort=\"$codex_effort\""
      printf '%s\0' -
      ;;
    claude)
      local claude_model
      claude_model="$(route_model claude)"
      # ce-dispatch-site:ce-work.implementation-cli-claude
      printf '%s\0' claude -p --safe-mode --no-session-persistence \
        --permission-mode bypassPermissions --tools Read,Write,Edit,Bash \
        --allowed-tools 'Bash(*)' \
        --effort "$(route_effort claude)" --output-format stream-json --verbose
      [ "$claude_model" = auto ] || printf '%s\0' --model "$claude_model"
      ;;
    grok-cli)
      local grok_model
      grok_model="$(route_model grok-cli)"
      # ce-dispatch-site:ce-work.implementation-cli-grok
      printf '%s\0' grok --prompt-file "$PROMPT_FILE" --cwd "$WORKSPACE" \
        --effort "$(route_effort grok-cli)" --permission-mode acceptEdits \
        --tools Read,Write,Edit --disable-web-search --no-memory --no-subagents \
        --no-plan --max-turns 50 --output-format streaming-json --verbatim
      [ "$grok_model" = auto ] || printf '%s\0' --model "$grok_model"
      ;;
    cursor)
      local cursor_model
      cursor_model="$(route_model cursor)"
      # ce-dispatch-site:ce-work.implementation-cli-cursor
      printf '%s\0' cursor-agent -p --output-format stream-json --stream-partial-output \
        --force --sandbox enabled --trust --workspace "$WORKSPACE"
      [ "$cursor_model" = auto ] || printf '%s\0' --model "$cursor_model"
      ;;
    composer)
      # ce-dispatch-site:ce-work.implementation-cli-composer
      printf '%s\0' cursor-agent -p --output-format stream-json --stream-partial-output \
        --force --sandbox enabled --trust --workspace "$WORKSPACE" --model "$(route_model composer)"
      ;;
    grok-cursor)
      # ce-dispatch-site:ce-work.implementation-cli-grok-cursor
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
  validate_route_effort "$ROUTE" || {
    printf "effort '%s' not compatible with route '%s'\n" "$(route_effort "$ROUTE")" "$ROUTE" >&2
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
LOG_RETAINED=0
trap 'rm -rf "$SCRATCH"' EXIT

# The controller's create-exclusive authorization artifact is the production
# dispatch capability. Read it once through a no-follow descriptor, validate
# its exact route/model/packet contract, and derive every dispatch identity
# field from those bytes before constructing a prompt or invoking a model CLI.
"$HOST_PYTHON" - "$AUTHORIZATION" "$EXPECTED_PACKET_DIGEST" "$AUTH_VALUES" "${BASH_SOURCE[0]}" <<'PY'
import json, os, re, stat, sys

source, expected_packet_digest, output, running_adapter = sys.argv[1:]
required = {
    "schema_version", "run_id", "unit_id", "attempt_id", "route", "target", "harness",
    "intermediaries", "model_requested", "effort_requested", "restriction_posture",
    "restrictions", "activity_posture", "packet_digest", "routing_lock", "environment", "confinement",
    "launcher", "adapter",
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

def open_no_follow(path, flags=os.O_RDONLY):
    absolute=os.path.abspath(path)
    if path != absolute or not os.path.isabs(path): fail("authorized executable path is not normalized")
    parts=[part for part in absolute.split(os.sep) if part]
    fd=os.open(os.sep, os.O_RDONLY | getattr(os,"O_DIRECTORY",0) | getattr(os,"O_NOFOLLOW",0))
    try:
        for index,part in enumerate(parts):
            final=index == len(parts)-1
            child_flags=flags if final else os.O_RDONLY | getattr(os,"O_DIRECTORY",0)
            child=os.open(part, child_flags | getattr(os,"O_NOFOLLOW",0), dir_fd=fd)
            os.close(fd); fd=child
        return fd
    except BaseException:
        os.close(fd); raise

def executable_identity(path):
    fd=open_no_follow(path)
    try:
        info=os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or not os.access(path, os.X_OK): fail("authorized executable is unsafe")
        digest=__import__("hashlib").sha256()
        while True:
            part=os.read(fd,65536)
            if not part: break
            digest.update(part)
        identity={"path":path,"kind":"file","device":str(info.st_dev),"inode":str(info.st_ino),
          "owner":info.st_uid,"mode":stat.S_IMODE(info.st_mode),"sha256":digest.hexdigest()}
    finally: os.close(fd)
    ancestors=[]; current=os.path.dirname(path)
    while True:
        afd=open_no_follow(current)
        try:
            info=os.fstat(afd)
            ancestors.append({"path":current,"kind":"directory","device":str(info.st_dev),"inode":str(info.st_ino),
              "owner":info.st_uid,"mode":stat.S_IMODE(info.st_mode)})
        finally: os.close(afd)
        if current == os.sep: break
        current=os.path.dirname(current)
    identity["ancestors"]=ancestors
    return identity

def model_allowed(route, model):
    if not isinstance(model, str) or not model or "\n" in model or "\r" in model:
        return False
    if route == "codex":
        return model == "auto" or bool(re.fullmatch(r"(?:gpt-[A-Za-z0-9._-]+|o[0-9][A-Za-z0-9._-]*)", model))
    if route == "claude":
        return model in {"auto", "fable", "opus", "sonnet", "haiku"} or bool(re.fullmatch(r"claude-[A-Za-z0-9._-]+", model))
    if route == "grok-cli":
        return model == "auto" or bool(re.fullmatch(r"grok-[A-Za-z0-9._-]+", model))
    if route == "cursor":
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:/-]*", model):
            return False
        lowered = model.lower()
        return not (lowered in {"composer", "grok"} or lowered.startswith(("composer-", "grok-", "cursor-grok-")))
    if route == "composer":
        return bool(re.fullmatch(r"composer-[A-Za-z0-9._-]+", model))
    if route == "grok-cursor":
        return bool(re.fullmatch(r"cursor-grok-[A-Za-z0-9._-]+", model))
    return False

def effort_allowed(route, effort):
    if route == "codex":
        return effort in {"auto", "minimal", "low", "medium", "high", "xhigh"}
    if route in {"claude", "grok-cli"}:
        return effort in {"low", "medium", "high"}
    return effort == "auto"

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
    if not effort_allowed(route, value["effort_requested"]):
        fail("authorization effort is incompatible with the fixed route")
    launcher=value["launcher"]; adapter=value["adapter"]
    if executable_identity(launcher.get("path") if isinstance(launcher,dict) else "") != launcher:
        fail("fixed Bash identity changed after authorization")
    if executable_identity(adapter.get("path") if isinstance(adapter,dict) else "") != adapter:
        fail("CE Work adapter identity changed after authorization")
    running_bash=os.path.realpath(os.readlink(f"/proc/{os.getppid()}/exe"))
    if running_bash != launcher["path"]:
        fail("adapter was not launched by the authorized Bash interpreter")
    if os.path.realpath(running_adapter) != adapter["path"]:
        fail("adapter path differs from controller authorization")
    environment = value["environment"]
    environment_paths = {
        "home", "xdg_config_home", "xdg_data_home", "xdg_cache_home", "tmpdir", "route_config_home",
    }
    environment_required = {
        "schema_version", "posture", "authentication", "material", "redactions_path",
        "redactions_sha256", *environment_paths,
    }
    if not isinstance(environment, dict) or set(environment) != environment_required:
        fail("authorization environment schema is invalid")
    if environment["schema_version"] != 1 or environment["posture"] != "credential-minimized":
        fail("authorization environment posture is invalid")
    if environment["authentication"] not in {"staged", "unavailable"}:
        fail("authorization authentication posture is invalid")
    unit_root = os.path.dirname(os.path.abspath(source))
    for key in environment_paths:
        path = environment[key]
        if not isinstance(path, str) or not os.path.isabs(path) or os.path.commonpath([unit_root, path]) != unit_root or path == unit_root:
            fail(f"authorization environment {key} escaped the controller unit root")
        directory_fd = os.open(path, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | getattr(os, "O_NOFOLLOW", 0))
        try:
            directory = os.fstat(directory_fd)
            geteuid = getattr(os, "geteuid", None)
            if not stat.S_ISDIR(directory.st_mode) or (geteuid is not None and directory.st_uid != geteuid()) or stat.S_IMODE(directory.st_mode) != 0o700:
                fail(f"authorization environment {key} is not a private controller directory")
        finally:
            os.close(directory_fd)
    material = environment["material"]
    if not isinstance(material, list) or len(material) > 4:
        fail("authorization environment material is invalid")
    expected_material = {}
    for item in material:
        if not isinstance(item, dict) or set(item) != {"path", "sha256"}:
            fail("authorization environment material entry is invalid")
        relative = item["path"]
        if (
            not isinstance(relative, str) or not relative or os.path.isabs(relative)
            or "\\" in relative or any(part in {"", ".", ".."} for part in relative.split("/"))
            or os.path.basename(relative).startswith(".env")
            or not isinstance(item["sha256"], str) or not re.fullmatch(r"[0-9a-f]{64}", item["sha256"])
            or relative in expected_material
        ):
            fail("authorization environment material entry is unsafe")
        expected_material[relative] = item["sha256"]
    observed_material = {}
    config_root = environment["route_config_home"]
    for current, directories, files in os.walk(config_root, followlinks=False):
        for name in directories:
            child = os.path.join(current, name)
            child_info = os.lstat(child)
            if stat.S_ISLNK(child_info.st_mode) or not stat.S_ISDIR(child_info.st_mode) or stat.S_IMODE(child_info.st_mode) != 0o700:
                fail("authorization backend config contains an unsafe directory")
        for name in files:
            child = os.path.join(current, name)
            flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
            child_fd = os.open(child, flags)
            try:
                child_info = os.fstat(child_fd)
                geteuid = getattr(os, "geteuid", None)
                if not stat.S_ISREG(child_info.st_mode) or (geteuid is not None and child_info.st_uid != geteuid()) or stat.S_IMODE(child_info.st_mode) != 0o600:
                    fail("authorization backend config contains an unsafe file")
                digest = __import__("hashlib").sha256()
                while True:
                    part = os.read(child_fd, 65536)
                    if not part:
                        break
                    digest.update(part)
            finally:
                os.close(child_fd)
            relative = os.path.relpath(child, config_root).replace(os.sep, "/")
            observed_material[relative] = digest.hexdigest()
    if observed_material != expected_material:
        fail("authorization backend config differs from staged material")
    if (environment["authentication"] == "staged") != bool(material):
        fail("authorization authentication posture differs from staged material")
    redactions_path = environment["redactions_path"]
    if (
        not isinstance(redactions_path, str) or not os.path.isabs(redactions_path)
        or os.path.commonpath([unit_root, redactions_path]) != unit_root
        or not isinstance(environment["redactions_sha256"], str)
        or not re.fullmatch(r"[0-9a-f]{64}", environment["redactions_sha256"])
    ):
        fail("authorization credential redactions are invalid")
    redactions_fd = os.open(redactions_path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        redactions_info = os.fstat(redactions_fd)
        geteuid = getattr(os, "geteuid", None)
        if not stat.S_ISREG(redactions_info.st_mode) or (geteuid is not None and redactions_info.st_uid != geteuid()) or stat.S_IMODE(redactions_info.st_mode) != 0o600:
            fail("authorization credential redactions are not private")
        redactions_digest = __import__("hashlib").sha256()
        while True:
            part = os.read(redactions_fd, 65536)
            if not part:
                break
            redactions_digest.update(part)
    finally:
        os.close(redactions_fd)
    if redactions_digest.hexdigest() != environment["redactions_sha256"]:
        fail("authorization credential redactions differ from staged auth material")
    confinement = value["confinement"]
    confinement_required = {
        "protocol", "adapter_path", "adapter_sha256", "interpreter_path", "interpreter_sha256",
        "abi", "read_only_paths", "read_write_paths", "launcher", "worker_adapter",
    }
    if not isinstance(confinement, dict) or set(confinement) != confinement_required:
        fail("authorization confinement schema is invalid")
    if confinement["protocol"] != "ce-work-landlock/v1" or not isinstance(confinement["abi"], int) or confinement["abi"] < 3:
        fail("authorization confinement capability is invalid")
    if (
        not isinstance(confinement["adapter_path"], str) or not os.path.isabs(confinement["adapter_path"])
        or not isinstance(confinement["adapter_sha256"], str)
        or not re.fullmatch(r"[0-9a-f]{64}", confinement["adapter_sha256"])
        or not isinstance(confinement["interpreter_path"], str) or not os.path.isabs(confinement["interpreter_path"])
        or not isinstance(confinement["interpreter_sha256"], str)
        or not re.fullmatch(r"[0-9a-f]{64}", confinement["interpreter_sha256"])
        or not isinstance(confinement["read_only_paths"], list) or not confinement["read_only_paths"]
        or any(not isinstance(path, str) or not os.path.isabs(path) for path in confinement["read_only_paths"])
        or not isinstance(confinement["read_write_paths"], list) or len(confinement["read_write_paths"]) != 2
        or any(not isinstance(path, str) or not os.path.isabs(path) for path in confinement["read_write_paths"])
    ):
        fail("authorization confinement roots are invalid")
    if confinement["launcher"] != launcher or confinement["worker_adapter"] != adapter:
        fail("authorization launcher/adapter differs from confinement capability")
    routing_lock = value["routing_lock"]
    if routing_lock is not None:
        lock_required = {
            "protocol", "snapshot_id", "source_revisions", "binding_digest", "unit_id", "attempt_id",
            "candidate_ordinal", "candidate", "recipient", "adapter_family", "mutation_posture",
            "environment_posture", "confinement", "identity_gate", "material_scope", "restrictions", "egress",
            "preflight", "state", "locked_at", "lock_digest",
        }
        if not isinstance(routing_lock, dict) or set(routing_lock) != lock_required:
            fail("routing attempt lock schema is invalid")
        if routing_lock["protocol"] != "ce-work-attempt-lock/v1":
            fail("routing attempt lock protocol is invalid")
        if routing_lock["unit_id"] != value["unit_id"] or routing_lock["attempt_id"] != value["attempt_id"]:
            fail("routing attempt lock identity differs from authorization")
        if routing_lock["state"] != "locked" or routing_lock["mutation_posture"] != "isolated-write":
            fail("routing attempt mutation state is invalid")
        if routing_lock["environment_posture"] != "credential-minimized":
            fail("routing attempt environment posture is invalid")
        recipient = routing_lock["recipient"]
        if not isinstance(recipient, dict) or (
            recipient.get("route"), recipient.get("target"), recipient.get("harness"), recipient.get("intermediaries")
        ) != (route, target, harness, intermediaries):
            fail("routing attempt recipient differs from authorization")
        candidate = routing_lock["candidate"]
        if not isinstance(candidate, dict) or candidate.get("ordinal") != routing_lock["candidate_ordinal"]:
            fail("routing attempt candidate is invalid")
        expected_model = candidate.get("model")
        if route == "composer" and isinstance(expected_model, str) and expected_model.lower() == "composer":
            expected_model = "composer-2.5-fast"
        if expected_model is not None and expected_model != value["model_requested"]:
            fail("routing attempt model differs from authorization")
        if candidate.get("effort") is not None and candidate.get("effort") != value["effort_requested"]:
            fail("routing attempt effort differs from authorization")
        if value["unit_id"] not in routing_lock["material_scope"]:
            fail("routing attempt material scope omits the unit")
        lock_material = dict(routing_lock)
        observed_lock_digest = lock_material.pop("lock_digest")
        calculated_lock_digest = __import__("hashlib").sha256(
            json.dumps(lock_material, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()
        if observed_lock_digest != calculated_lock_digest:
            fail("routing attempt lock digest is invalid")
    packet_digest = value["packet_digest"]
    if not isinstance(packet_digest, str) or not re.fullmatch(r"[0-9a-f]{64}", packet_digest):
        fail("authorization packet_digest is not lowercase SHA-256")
    if packet_digest != expected_packet_digest:
        fail("authorization packet digest does not match dispatch")
    authorization_digest = __import__("hashlib").sha256(b"".join(chunks)).hexdigest()
    fields = (
        authorization_digest, value["run_id"], value["unit_id"], value["attempt_id"],
        route, target, harness, value["model_requested"], value["effort_requested"], value["activity_posture"], posture,
        environment["authentication"], environment["home"], environment["xdg_config_home"],
        environment["xdg_data_home"], environment["xdg_cache_home"], environment["tmpdir"],
        environment["route_config_home"], environment["redactions_path"],
        confinement["adapter_path"], confinement["adapter_sha256"], str(confinement["abi"]),
        confinement["interpreter_path"], confinement["interpreter_sha256"],
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
[ "${#AUTH_FIELDS[@]}" -eq 24 ] || { log "controller authorization projection is incomplete"; exit 2; }
OBSERVED_AUTH_DIGEST="${AUTH_FIELDS[0]}"
RUN_ID="${AUTH_FIELDS[1]}"
UNIT_ID="${AUTH_FIELDS[2]}"
ATTEMPT_ID="${AUTH_FIELDS[3]}"
ROUTE="${AUTH_FIELDS[4]}"
AUTH_TARGET="${AUTH_FIELDS[5]}"
AUTH_HARNESS="${AUTH_FIELDS[6]}"
MODEL_REQUESTED="${AUTH_FIELDS[7]}"
EFFORT_REQUESTED="${AUTH_FIELDS[8]}"
ACTIVITY_POSTURE="${AUTH_FIELDS[9]}"
RESTRICTION_POSTURE="${AUTH_FIELDS[10]}"
AUTHENTICATION_POSTURE="${AUTH_FIELDS[11]}"
ISOLATED_HOME="${AUTH_FIELDS[12]}"
ISOLATED_XDG_CONFIG_HOME="${AUTH_FIELDS[13]}"
ISOLATED_XDG_DATA_HOME="${AUTH_FIELDS[14]}"
ISOLATED_XDG_CACHE_HOME="${AUTH_FIELDS[15]}"
ISOLATED_TMPDIR="${AUTH_FIELDS[16]}"
ROUTE_CONFIG_HOME="${AUTH_FIELDS[17]}"
AUTO_REDACTIONS="${AUTH_FIELDS[18]}"
CONFINEMENT_ADAPTER="${AUTH_FIELDS[19]}"
CONFINEMENT_ADAPTER_DIGEST="${AUTH_FIELDS[20]}"
CONFINEMENT_ABI="${AUTH_FIELDS[21]}"
CONFINEMENT_INTERPRETER="${AUTH_FIELDS[22]}"
CONFINEMENT_INTERPRETER_DIGEST="${AUTH_FIELDS[23]}"
BOOTSTRAP_SCRATCH="$SCRATCH"
SCRATCH="$(mktemp -d "$ISOLATED_TMPDIR/adapter-XXXXXX")" || exit 2
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
AMBIENT_REDACTIONS="${CE_WORK_REDACT_FILE:-}"
CE_WORK_REDACT_FILE="$SCRATCH/credential-redactions"
"$HOST_PYTHON" - "$AUTO_REDACTIONS" "$AMBIENT_REDACTIONS" "$SCRATCH" <<'PY'
import os, stat, sys

automatic, ambient, target_root = sys.argv[1:]
no_follow = getattr(os, "O_NOFOLLOW", 0)
directory = getattr(os, "O_DIRECTORY", 0)

def open_absolute(path, flags):
    absolute=os.path.abspath(path)
    if path != absolute or not os.path.isabs(path): raise OSError("redaction path is not absolute")
    fd=os.open(os.sep, os.O_RDONLY | directory | no_follow)
    try:
        parts=[part for part in absolute.split(os.sep) if part]
        for index,part in enumerate(parts):
            child_flags=flags if index == len(parts)-1 else os.O_RDONLY | directory
            child=os.open(part, child_flags | no_follow, dir_fd=fd)
            os.close(fd); fd=child
        return fd
    except BaseException:
        os.close(fd); raise

chunks=[]
for path, required in ((automatic, True), (ambient, False)):
    if not path: continue
    try: fd=open_absolute(path, os.O_RDONLY)
    except FileNotFoundError:
        if required: raise
        continue
    try:
        info=os.fstat(fd)
        if not stat.S_ISREG(info.st_mode): raise OSError("redaction source is not regular")
        while True:
            part=os.read(fd,65536)
            if not part: break
            chunks.append(part)
    finally: os.close(fd)
root_fd=open_absolute(target_root, os.O_RDONLY | directory)
try:
    target=os.open("credential-redactions", os.O_WRONLY | os.O_CREAT | os.O_EXCL | no_follow, 0o600, dir_fd=root_fd)
    try:
        for chunk in chunks:
            view=memoryview(chunk)
            while view: view=view[os.write(target,view):]
        os.fchmod(target,0o600)
    finally: os.close(target)
finally: os.close(root_fd)
PY
[ "$?" -eq 0 ] || { log "credential redaction staging refused"; exit 2; }
rm -rf "$BOOTSTRAP_SCRATCH"
trap 'rm -rf "$SCRATCH"' EXIT
RUNNER_JOB_ID="${CE_PEER_JOB_ID:-}"
[[ "$RUNNER_JOB_ID" =~ ^[A-Za-z0-9._-]{1,128}$ && "$RUNNER_JOB_ID" =~ [A-Za-z0-9_-] ]] || {
  log "runner job identity is missing or unsafe"
  exit 2
}
case "$ROUTE" in
  codex) BINARY=codex ;;
  claude) BINARY=claude ;;
  grok-cli) BINARY=grok ;;
  cursor|composer|grok-cursor) BINARY=cursor-agent ;;
esac
ROUTE_EXECUTABLE="$(ROUTE_SEARCH_PATH="$ROUTE_SEARCH_PATH" "$HOST_PYTHON" - "$BINARY" <<'PY'
import os, shutil, sys

resolved = shutil.which(sys.argv[1], path=os.environ.get("ROUTE_SEARCH_PATH", ""))
if resolved:
    print(os.path.abspath(resolved))
PY
)"
if [ -z "$ROUTE_EXECUTABLE" ]; then
  log "fixed route executable '$BINARY' is unavailable"
  exit 2
fi

# A valid JSON file is not itself dispatch authority. Prove the exact no-follow
# snapshot and every raw controller-returned path back to the controller before
# prompt construction. Only its AUTHORIZED status permits external egress.
CONTROLLER="$SKILL_ROOT/scripts/unit-workspace.py"
AUTH_RESPONSE="$("$HOST_PYTHON" "$CONTROLLER" authorize-dispatch \
  --authorization "$DISPATCH_AUTHORIZATION" \
  --authorization-digest "$OBSERVED_AUTH_DIGEST" \
  --workspace "$DISPATCH_WORKSPACE" \
  --packet "$DISPATCH_PACKET" \
  --packet-digest "$EXPECTED_PACKET_DIGEST" \
  --result-dir "$DISPATCH_RESULT_DIR" \
  --route-executable "$ROUTE_EXECUTABLE" \
  --run-id "$RUN_ID" --unit-id "$UNIT_ID" --attempt-id "$ATTEMPT_ID" --job-id "$RUNNER_JOB_ID" 2>&1)"
CONTROLLER_EXIT=$?
AUTH_STATUS="${AUTH_RESPONSE%%$'\n'*}"
if [ "$CONTROLLER_EXIT" -ne 0 ] || [ "$AUTH_STATUS" != "AUTHORIZED" ]; then
  [ -n "$AUTH_RESPONSE" ] && printf '%s\n' "$AUTH_RESPONSE" >&2
  log "controller dispatch authorization failed"
  exit 2
fi
DISPATCH_VALUES="$SCRATCH/dispatch-values"
AUTH_RESPONSE="$AUTH_RESPONSE" "$HOST_PYTHON" - "$DISPATCH_VALUES" "$CONFINEMENT_ADAPTER" "$CONFINEMENT_ADAPTER_DIGEST" "$CONFINEMENT_ABI" <<'PY'
import json, os, re, sys

output, expected_adapter, expected_adapter_digest, expected_abi = sys.argv[1:]
lines = os.environ.get("AUTH_RESPONSE", "").splitlines()
if len(lines) != 2 or lines[0] != "AUTHORIZED":
    raise SystemExit(2)
value = json.loads(lines[1])
required = {
    "route_executable", "launcher", "adapter", "confinement_path", "confinement_digest",
    "confinement_adapter", "supervisor_evidence",
}
if not required.issubset(value):
    raise SystemExit(2)
if (
    value["confinement_adapter"] != expected_adapter
    or not os.path.isabs(value["route_executable"])
    or not os.path.isabs(value["confinement_path"])
    or not re.fullmatch(r"[0-9a-f]{64}", value["confinement_digest"])
    or not re.fullmatch(r"[0-9a-f]{64}", expected_adapter_digest)
    or not expected_abi.isdigit()
    or not isinstance(value["supervisor_evidence"], dict)
    or set(value["supervisor_evidence"]) != {"probe", "route"}
    or any(not isinstance(path, str) or not os.path.isabs(path) for path in value["supervisor_evidence"].values())
):
    raise SystemExit(2)
fd = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
try:
    fields = (
        value["route_executable"], value["confinement_path"], value["confinement_digest"],
        value["supervisor_evidence"]["probe"], value["supervisor_evidence"]["route"],
    )
    os.write(fd, b"\0".join(field.encode() for field in fields) + b"\0")
finally:
    os.close(fd)
PY
[ "$?" -eq 0 ] || { log "controller confinement authorization was malformed"; exit 2; }
DISPATCH_FIELDS=()
while IFS= read -r -d '' field; do DISPATCH_FIELDS+=("$field"); done < "$DISPATCH_VALUES"
[ "${#DISPATCH_FIELDS[@]}" -eq 5 ] || { log "controller confinement projection is incomplete"; exit 2; }
BINARY_PATH="${DISPATCH_FIELDS[0]}"
CONFINEMENT_CONFIG="${DISPATCH_FIELDS[1]}"
CONFINEMENT_CONFIG_DIGEST="${DISPATCH_FIELDS[2]}"
PROBE_SUPERVISOR_EVIDENCE="${DISPATCH_FIELDS[3]}"
ROUTE_SUPERVISOR_EVIDENCE="${DISPATCH_FIELDS[4]}"

# Canonicalize operational paths only after the handshake. The controller
# compares the raw paths it returned, including platform compatibility symlinks.
WORKSPACE="$(cd "$WORKSPACE" && pwd -P)" || exit 2
PACKET="$(cd "$(dirname "$PACKET")" && pwd -P)/$(basename "$PACKET")" || exit 2
RESULT_DIR="$(cd "$RESULT_DIR" && pwd -P)" || exit 2
case "$RESULT_DIR/" in "$WORKSPACE/"*) log "result dir must be outside the worker workspace"; exit 2 ;; esac
case "$PACKET" in "$WORKSPACE"/*) log "unit packet must be outside the worker workspace"; exit 2 ;; esac
git -C "$WORKSPACE" rev-parse --is-inside-work-tree >/dev/null 2>&1 || { log "workspace is not a Git worktree"; exit 2; }
chmod 700 "$RESULT_DIR" 2>/dev/null || { log "result dir could not be made private"; exit 2; }
RESULT_DIR_IDENTITY="$("$HOST_PYTHON" - "$RESULT_DIR" <<'PY'
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
  "$HOST_PYTHON" -c '
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
  "$HOST_PYTHON" -c '
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
OBSERVED_PACKET_DIGEST="$("$HOST_PYTHON" - "$PACKET" "$PACKET_SNAPSHOT" "$MAX_PACKET_BYTES" <<'PY'
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
  CE_WORK_REDACT_FILE="${CE_WORK_REDACT_FILE:-}" "$HOST_PYTHON" -c '
import os, sys
p = os.environ.get("CE_WORK_REDACT_FILE", "")
if p:
    try:
        values = sorted(
            {v for v in open(p, "rb").read().splitlines() if v},
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
  "$HOST_PYTHON" -c '
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
  local terminal_status="${2:-unavailable}"
  local actual_route="${3:-}"
  if [ "$LOG_RETAINED" -ne 1 ]; then
    printf '%s\n' "$reason" | redact_stream | write_adapter_log || {
      log "result dir or adapter log identity changed during route"
      exit 2
    }
    LOG_RETAINED=1
  fi
  "$HOST_PYTHON" - "$ROUTE" "$TARGET" "$HARNESS" "$MODEL_REQUESTED" "$EFFORT_REQUESTED" "$EXPECTED_PACKET_DIGEST" "$LOG_FILE" "$reason" "$ACTIVITY_POSTURE" "$RESTRICTION_POSTURE" "$terminal_status" "$actual_route" <<'PY' | write_result_receipt
import json, sys
route, target, harness, requested, effort, packet_digest, log, reason, activity, restriction, terminal_status, actual_route = sys.argv[1:]
value = {
  "schema_version": 1, "terminal_status": terminal_status,
  "summary": "External route failed after launch" if terminal_status == "failed" else "External route unavailable",
  "changed_files": [], "evidence": [], "scope_expansion": None,
  "requested_route": route, "actual_route": actual_route or None, "target": target, "harness": harness,
  "intermediaries": ["cursor"] if route in ("composer", "grok-cursor") else [],
  "model_requested": requested, "model_actual": "unverified", "model_receipt_status": "unverified",
  "effort_requested": effort, "effort_actual": "unverified", "effort_receipt_status": "unverified",
  "packet_digest": packet_digest,
  "activity_posture": activity, "restriction_posture": restriction,
  "failure_reason": reason, "raw_log": log,
}
json.dump(value, sys.stdout, indent=2)
sys.stdout.write("\n")
PY
}

if [ "$AUTHENTICATION_POSTURE" != staged ]; then
  publish_unavailable "authenticated config was not staged inside the isolated route environment" || exit 2
  exit 2
fi

ARGS=()
while IFS= read -r -d '' token; do ARGS+=("$token"); done < <(adapter_argv "$ROUTE")
ARGS[0]="$BINARY_PATH"

SAFE_PATH="$(dirname "$BINARY_PATH"):/usr/local/bin:/usr/bin:/bin"
MIN_ENV=(env -i "PATH=$SAFE_PATH" "PYTHONDONTWRITEBYTECODE=1")
MIN_ENV+=("HOME=$ISOLATED_HOME")
[ -n "${USER:-}" ] && MIN_ENV+=("USER=$USER")
MIN_ENV+=("TMPDIR=$ISOLATED_TMPDIR")
[ -n "${LANG:-}" ] && MIN_ENV+=("LANG=$LANG")
[ -n "${LC_ALL:-}" ] && MIN_ENV+=("LC_ALL=$LC_ALL")
MIN_ENV+=("XDG_CONFIG_HOME=$ISOLATED_XDG_CONFIG_HOME")
MIN_ENV+=("XDG_DATA_HOME=$ISOLATED_XDG_DATA_HOME")
MIN_ENV+=("XDG_CACHE_HOME=$ISOLATED_XDG_CACHE_HOME")
case "$ROUTE" in
  codex) MIN_ENV+=("CODEX_HOME=$ROUTE_CONFIG_HOME") ;;
  claude) MIN_ENV+=("CLAUDE_CONFIG_DIR=$ROUTE_CONFIG_HOME") ;;
  grok-cli) MIN_ENV+=("GROK_CONFIG_HOME=$ROUTE_CONFIG_HOME") ;;
  cursor|composer|grok-cursor)
    MIN_ENV+=("CURSOR_CONFIG_DIR=$ROUTE_CONFIG_HOME")
    ;;
esac

refresh_credential_redactions() {
  "$HOST_PYTHON" - "$ROUTE_CONFIG_HOME" "$CE_WORK_REDACT_FILE" <<'PY'
import json, os, stat, sys

config_root, redactions_path = sys.argv[1:]
values = set()
no_follow = getattr(os, "O_NOFOLLOW", 0)
directory = getattr(os, "O_DIRECTORY", 0)
euid = getattr(os, "geteuid", lambda: None)()

def open_absolute(path, flags):
    absolute=os.path.abspath(path)
    if path != absolute or not os.path.isabs(path): raise OSError("path is not absolute")
    fd=os.open(os.sep, os.O_RDONLY | directory | no_follow)
    try:
        parts=[part for part in absolute.split(os.sep) if part]
        for index,part in enumerate(parts):
            child_flags=flags if index == len(parts)-1 else os.O_RDONLY | directory
            child=os.open(part, child_flags | no_follow, dir_fd=fd)
            os.close(fd); fd=child
        return fd
    except BaseException:
        os.close(fd); raise

def read_bounded_at(parent_fd, name, expected, cap):
    fd=os.open(name, os.O_RDONLY | no_follow, dir_fd=parent_fd)
    try:
        info=os.fstat(fd)
        if (info.st_dev,info.st_ino) != (expected.st_dev,expected.st_ino): raise OSError("file changed before read")
        if not stat.S_ISREG(info.st_mode) or (euid is not None and info.st_uid != euid) or stat.S_IMODE(info.st_mode) != 0o600 or info.st_size > cap:
            raise OSError("backend config file is no longer private and bounded")
        data=bytearray()
        while len(data) <= cap:
            part=os.read(fd,min(65536,cap+1-len(data)))
            if not part: break
            data.extend(part)
        if len(data) > cap: raise OSError("backend config file exceeded its size limit")
        return bytes(data)
    finally: os.close(fd)

try:
    redaction_parent=os.path.dirname(redactions_path)
    redaction_name=os.path.basename(redactions_path)
    redaction_parent_fd=open_absolute(redaction_parent, os.O_RDONLY | directory)
    redaction_before=os.stat(redaction_name, dir_fd=redaction_parent_fd, follow_symlinks=False)
    values.update(value for value in read_bounded_at(redaction_parent_fd, redaction_name, redaction_before, 4 * 1024 * 1024).splitlines() if value)
    root_fd=open_absolute(config_root, os.O_RDONLY | directory)
    def walk(parent_fd):
        observed_files=[0]
        def visit(directory_fd):
          for name in os.listdir(directory_fd):
            info=os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
            if stat.S_ISDIR(info.st_mode) and not stat.S_ISLNK(info.st_mode):
                if (euid is not None and info.st_uid != euid) or stat.S_IMODE(info.st_mode) != 0o700:
                    raise OSError("backend config directory changed")
                child=os.open(name, os.O_RDONLY | directory | no_follow, dir_fd=directory_fd)
                try:
                    opened=os.fstat(child)
                    if (opened.st_dev,opened.st_ino) != (info.st_dev,info.st_ino): raise OSError("backend config directory changed before traversal")
                    visit(child)
                finally: os.close(child)
                continue
            if not stat.S_ISREG(info.st_mode) or stat.S_ISLNK(info.st_mode):
                raise OSError("backend config contains an unsafe entry")
            observed_files[0] += 1
            if observed_files[0] > 4:
                raise OSError("backend config file count exceeded")
            data=read_bounded_at(directory_fd,name,info,1024*1024)
            document = json.loads(data.decode("utf-8", "strict"))
            pending = [document]
            while pending:
                value = pending.pop()
                if isinstance(value, dict):
                    pending.extend(value.values())
                elif isinstance(value, list):
                    pending.extend(value)
                elif isinstance(value, str) and value:
                    values.add(value.encode())
        visit(parent_fd)
    try: walk(root_fd)
    finally: os.close(root_fd)
    temporary = f".credential-redactions-{os.getpid()}"
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | no_follow, 0o600, dir_fd=redaction_parent_fd)
    try:
        data = b"\n".join(sorted(values, key=lambda value: (-len(value), value)))
        if data:
            data += b"\n"
        view = memoryview(data)
        while view:
            view = view[os.write(fd, view):]
    finally:
        os.close(fd)
    current=os.stat(redaction_name, dir_fd=redaction_parent_fd, follow_symlinks=False)
    if (current.st_dev,current.st_ino) != (redaction_before.st_dev,redaction_before.st_ino):
        os.unlink(temporary, dir_fd=redaction_parent_fd)
        raise OSError("credential redaction target changed before replacement")
    os.replace(temporary, redaction_name, src_dir_fd=redaction_parent_fd, dst_dir_fd=redaction_parent_fd)
except (OSError, UnicodeDecodeError, ValueError) as error:
    print(f"credential redaction refresh refused: {error}", file=sys.stderr)
    raise SystemExit(2)
finally:
    if 'redaction_parent_fd' in locals(): os.close(redaction_parent_fd)
PY
}

# Cursor reports a human display label in its init receipt, not necessarily the
# model key passed on argv. Capture the current catalog label before dispatch so
# receipt comparison can follow CLI vocabulary drift without weakening the pin.
# The catalog probe uses the same minimal environment as the worker because it
# reaches the same authenticated CLI surface before dispatch.
MODEL_DISPLAY_HINT=""
if [ "$MODEL_REQUESTED" != auto ]; then
  case "$ROUTE" in
    cursor|composer|grok-cursor)
      MODEL_DISPLAY_HINT="$({ "${MIN_ENV[@]}" "$CONFINEMENT_INTERPRETER" "$CONFINEMENT_ADAPTER" \
        --config "$CONFINEMENT_CONFIG" --digest "$CONFINEMENT_CONFIG_DIGEST" --supervisor-slot probe -- \
        "$BINARY_PATH" --list-models 2>/dev/null || true; } | awk -F ' - ' -v key="$MODEL_REQUESTED" '$1 == key { sub(/^[^ ]+ - /, ""); print; exit }')"
      ;;
  esac
fi
if ! refresh_credential_redactions; then
  publish_unavailable "staged authentication changed unsafely during the confined model probe" || exit 2
  exit 2
fi

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
(cd "$WORKSPACE" && exec "${MIN_ENV[@]}" "$CONFINEMENT_INTERPRETER" "$CONFINEMENT_ADAPTER" \
  --config "$CONFINEMENT_CONFIG" --digest "$CONFINEMENT_CONFIG_DIGEST" --supervisor-slot route -- \
  "${ARGS[@]}" < "$PROMPT_FILE" > "$RAW_STDOUT" 2> "$RAW_STDERR") &
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
if ! refresh_credential_redactions; then
  rm -f "$RAW_STDOUT" "$RAW_STDERR" "$RAW_RESULT" "$RAW_LIMIT_MARKER"
  publish_unavailable "staged authentication changed unsafely during the confined route" || exit 2
  exit 2
fi
{
  cat "$RAW_STDOUT"
  cat "$RAW_STDERR"
  if [ -f "$RAW_RESULT" ]; then cat "$RAW_RESULT"; fi
} | redact_stream | cap_stream | write_adapter_log || {
  log "result dir or adapter log identity changed during route"
  exit 2
}
LOG_RETAINED=1

if [ -f "$RAW_LIMIT_MARKER" ]; then
  publish_unavailable "fixed route raw output exceeded ${MAX_RAW_BYTES} bytes" || exit 2
  exit 1
fi

if [ "$ROUTE_EXIT" -ne 0 ]; then
  publish_unavailable "fixed route exited with exit $ROUTE_EXIT" failed "$ROUTE" || exit 2
  exit 1
fi

SOURCE="$RAW_STDOUT"
[ "$ROUTE" = codex ] && SOURCE="$RAW_RESULT"
set +e
CE_WORK_REDACT_FILE="${CE_WORK_REDACT_FILE:-}" "$HOST_PYTHON" - \
  "$SOURCE" "$RAW_STDOUT" "$ROUTE" "$TARGET" "$HARNESS" \
  "$MODEL_REQUESTED" "$EFFORT_REQUESTED" "$EXPECTED_PACKET_DIGEST" "$LOG_FILE" "$ACTIVITY_POSTURE" "$RESTRICTION_POSTURE" "$MODEL_DISPLAY_HINT" <<'PY' | write_result_receipt
import json, os, re, sys
source, stream, route, target, harness, requested, effort_requested, packet_digest, log, activity, restriction, display_hint = sys.argv[1:]

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
    # Some CLIs have emitted terminal styling inside the JSON model field.
    # Strip complete ANSI control sequences before validating the receipt token;
    # never publish a partially sanitized or otherwise unsafe identity.
    text=str(value)
    text=re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", text)
    text=re.sub(r"\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)", "", text)
    text="".join(ch for ch in text if ord(ch) >= 0x20 and ord(ch) != 0x7f).strip()
    return text if 0 < len(text) <= 128 else "unverified"

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
effort_actual="unverified"
if source == stream:
    stream_text=raw
else:
    try: stream_text=open(stream, encoding="utf-8", errors="replace").read()
    except OSError: stream_text=""
for line in stream_text.splitlines():
    try: event=json.loads(line)
    except Exception: continue
    if isinstance(event,dict) and event.get("model") and (event.get("subtype")=="init" or event.get("type") in ("init","system")):
        served=normalize_served_model(event["model"])
        if event.get("effort") is not None:
            effort_actual=normalize_served_model(event["effort"])
        break

if served == "unverified": receipt="unverified"
elif requested == "auto": receipt="verified"
else:
    req=requested.lower(); actual=served.lower()
    if route in ("cursor", "composer", "grok-cursor"):
        def model_terms(value):
            value=re.sub(r"\b\d+(?:k|m)\b", " ", value.lower())
            terms=set(re.findall(r"[a-z]+|\d+", value))
            return terms - {"claude", "cursor"}
        expected=model_terms(display_hint or requested)
        receipt="verified" if expected and expected.issubset(model_terms(served)) else "mismatch"
    else:
        family=("claude-fable-" if req=="fable" else "claude-opus-" if req=="opus" else
          "claude-sonnet-" if req=="sonnet" else "claude-haiku-" if req=="haiku" else req)
        normalized=lambda value: re.sub(r"[^a-z0-9]", "", value.lower())
        receipt="verified" if actual.startswith(family) or actual==req or normalized(actual)==normalized(req) else "mismatch"

if effort_requested == "auto": effort_receipt="verified" if effort_actual != "unverified" else "unverified"
elif effort_actual == "unverified": effort_receipt="unverified"
else: effort_receipt="verified" if effort_actual.lower() == effort_requested.lower() else "mismatch"

intermediaries=["cursor"] if route in ("composer","grok-cursor") else []
base={
  "schema_version":1,
  "requested_route":route, "actual_route":route, "target":target, "harness":harness,
  "intermediaries":intermediaries, "model_requested":requested, "model_actual":served,
  "model_receipt_status":receipt, "activity_posture":activity,
  "effort_requested":effort_requested, "effort_actual":effort_actual,
  "effort_receipt_status":effort_receipt,
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
base=redact(base)
json.dump(base,sys.stdout,indent=2)
sys.stdout.write("\n")
sys.exit(0 if valid else 4)
PY
NORMALIZE_STATUSES=("${PIPESTATUS[@]}")
NORMALIZE_EXIT="${NORMALIZE_STATUSES[0]}"
PUBLISH_EXIT="${NORMALIZE_STATUSES[1]}"
if [ "$PUBLISH_EXIT" -ne 0 ]; then exit 2; fi
if [ "$NORMALIZE_EXIT" -ne 0 ]; then exit 1; fi

TERMINAL_STATUS="$("$HOST_PYTHON" -c 'import json,sys; print(json.load(open(sys.argv[1]))["terminal_status"])' "$RESULT_FILE")"
case "$TERMINAL_STATUS" in
  completed|blocked|scope_expansion) exit 0 ;;
  *) exit 1 ;;
esac
