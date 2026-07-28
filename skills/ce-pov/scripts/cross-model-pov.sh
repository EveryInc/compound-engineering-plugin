#!/usr/bin/env bash
# cross-model-pov.sh
#
# Runs one pre-sanctioned different-model route in a read-only, least-privilege
# process and writes its POV as JSON into the run dir.
# Every peer receives the canonical POV persona, schema, and a caller-prepared
# subject payload. The peer also receives the caller-declared repository read
# scope; private prompt/result scratch stays outside that repository.
#
# Independence is by PROVIDER, not CLI brand. A provider is reached by a ROUTE:
# its dedicated CLI, or (for the fixed grok-cursor / composer routes) cursor-agent. All
# peer runs on ONE model at HIGH reasoning (composer's
# -fast tier is its ceiling, an accepted exception).
#
# Usage:
#   cross-model-pov.sh <host-provider> <fixed-route> <subject-payload> <run-dir>
#
#   <host-provider> the peer-key of the host's OWN serving provider, attested by
#                   the calling skill (it knows its harness): openai->codex,
#                   anthropic->claude, xai->grok, cursor/composer->composer.
#                   Used only to verify independence. `unknown` is allowed for an
#                   explicitly named peer, but its receipt remains unverified;
#                   automatic discovery must exclude it before calling this worker.
#   <fixed-route>   one host-resolved and pre-sanctioned route: codex, claude,
#                   grok-cli, grok-cursor, cursor, or composer. A route failure
#                   returns no artifact; only the host may disclose and retry a
#                   different recipient.
#   <subject-payload> framed question plus any conversation-only subject material.
#                     Point to repository files instead of copying their contents;
#                     the peer grounds itself from the shared working tree.
#   <run-dir>         existing private dir outside the repository; output ->
#                     <run-dir>/pov-<target>.json, where <target> is the resolved
#                     <fixed-route> target (grok-cli/grok-cursor both collapse to
#                     grok) -- NOT the <host-provider> key.
#
# Test/introspection mode (no model call, no side effects):
#   cross-model-pov.sh --emit-adapter <route>
#     prints the exact argv the given route would run (route in:
#     codex | claude | grok-cli | grok-cursor | cursor | composer). Both this mode and the
#     live run build their argv from adapter_argv(), so the U7 route-safety test
#     asserts on the same command string the peer actually runs.
#
# Self-locates its sibling reference files via BASH_SOURCE (NOT the CWD, which is
# the user's project on every host). The agent passes the values above.
#
# NON-BLOCKING BY DESIGN: every failure logs to stderr and exits 0 without an
# output file. The cross-model pass is additive and must never fail the POV;
# the caller detects success purely by the presence of the output file(s).
#
# DATA-EGRESS NOTE: this embeds the prepared subject payload into an external
# model CLI prompt. The caller must disclose its content scope and actual provider
# before launch; route receipts let it reconcile the fixed target afterward.

set -uo pipefail

# Survive SIGHUP when the orchestrator backgrounds this script and the parent
# shell exits (common on Cursor/Codex Bash tools). Without this, a detached
# codex process group can still write raw `-o` JSON while this script dies
# before normalize — leaving fold-in files without route/model receipts.
trap '' HUP

# Filled while a peer process group is live; TERM/INT handler (installed after
# reap() is defined) reaps it so an orchestrator kill cannot leave orphans.
ACTIVE_PEER_PID=""
PEER_WORKDIR=""
PROMPT_FILE=""
PEERLOG=""
PEERERR=""
RAW_OUT=""
RUN_SUCCEEDED=false

cleanup_private_scratch() {
  [ -n "${PEER_WORKDIR:-}" ] && rm -rf "$PEER_WORKDIR"
  PEER_WORKDIR=""
}

log()  { printf '[cross-model-pov] %s\n' "$*" >&2; }
skip() { log "$*"; exit 0; }   # non-blocking: announce reason, exit clean, no output

# --- model + reasoning per provider ----------------------------------------
# ONE model at HIGH reasoning per provider. Concrete IDs are the CURRENT instance of the tier principle
# and the single maintenance point when model families change.
M_CODEX="gpt-5.6-sol"          # codex CLI            (-c model_reasoning_effort="high")
M_CLAUDE="opus"                # claude CLI, Opus 4.8 (--effort high)
M_GROK="grok-4.5"              # grok CLI             (--effort high)
M_GROK_CURSOR="cursor-grok-4.5-high" # cursor-agent grok route (reasoning baked into id)
M_COMPOSER="composer-2.5-fast" # cursor-agent composer (no high tier; -fast is the ceiling)

# --- model-identity receipt (R7/R8) -----------------------------------------
# "Which model ran" is a claim that needs a serving-side receipt. Only the
# claude CLI reports one today: its JSON envelope carries a modelUsage object
# keyed by the full dated id that actually served the run. Match requested vs
# actual by expected full-family prefix (alias -> dated id counts as a match;
# never substring). Every other route records the literal "unverified" — never
# a fallback to the requested value. Keep this block byte-identical across
# ce-code-review and ce-doc-review (kernel parity).
expected_model_prefix() {   # <requested-alias> -> expected served-id prefix
  case "$1" in
    opus)   printf 'claude-opus-' ;;
    sonnet) printf 'claude-sonnet-' ;;
    haiku)  printf 'claude-haiku-' ;;
  esac
}

route_model() {   # <route> -> the M_* constant that route requests
  local target
  target="$(route_target "$1")"
  if [ -n "${CROSS_MODEL_MODEL_OVERRIDE:-}" ] &&
     [ "${CROSS_MODEL_MODEL_OVERRIDE_TARGET:-}" = "$target" ] &&
     [ "$target" != "cursor" ]; then
    printf '%s' "$CROSS_MODEL_MODEL_OVERRIDE"
    return 0
  fi
  case "$1" in
    codex)       printf '%s' "$M_CODEX" ;;
    claude)      printf '%s' "$M_CLAUDE" ;;
    grok-cli)    printf '%s' "$M_GROK" ;;
    grok-cursor) printf '%s' "$M_GROK_CURSOR" ;;
    cursor)      printf 'auto' ;;
    composer)    printf '%s' "$M_COMPOSER" ;;
  esac
}

route_target() {
  case "$1" in
    codex|claude|cursor|composer) printf '%s' "$1" ;;
    grok-cli|grok-cursor) printf 'grok' ;;
  esac
}

route_harness() {
  case "$1" in
    codex) printf 'codex' ;;
    claude) printf 'claude' ;;
    grok-cli) printf 'grok' ;;
    grok-cursor|cursor|composer) printf 'cursor-agent' ;;
  esac
}

target_serving_family() {
  case "$1" in
    codex|claude|grok|composer) printf '%s' "$1" ;;
    cursor) printf 'unknown' ;;
  esac
}

MODEL_ACTUAL="unverified"
extract_model_receipt() {   # <route>; reads the envelope in $PEERLOG, sets MODEL_ACTUAL
  MODEL_ACTUAL="unverified"
  [ "$1" = "claude" ] || return 0
  local requested actual prefix matched
  requested="$(route_model claude)"
  prefix="$(expected_model_prefix "$requested")"
  # jq `keys` is sorted, so keys[0] is the alphabetically-first model, not
  # necessarily the one that served the run (a multi-key envelope can also carry
  # an auxiliary model's usage). Prefer a key matching the requested family's
  # expected prefix; fall back to the first key only when none matches, and warn
  # only then. A missing/unparseable envelope stays "unverified" (never the
  # requested value).
  matched=""
  if [ -n "$prefix" ]; then
    # first modelUsage key matching the expected family prefix (jq-native, no
    # external `head`: the route sandbox may not carry coreutils on PATH).
    matched="$(jq -r --arg p "$prefix" 'first((.modelUsage // {} | keys[] | select(startswith($p)))) // empty' "$PEERLOG" 2>/dev/null)"
  fi
  if [ -n "$matched" ]; then
    MODEL_ACTUAL="$matched"
    return 0
  fi
  actual="$(jq -r '.modelUsage // empty | keys[0] // empty' "$PEERLOG" 2>/dev/null)"
  if [ -z "$actual" ]; then
    log "model receipt absent/unparseable on claude route; recording unverified"
    return 0
  fi
  MODEL_ACTUAL="$actual"
  log "WARNING: model mismatch - requested $requested, backend served $actual; reconcile must surface this"
}

# --- adapter argv (single source of truth for route flags) -----------------
# Emits the CLI + flags one token per line. Read-only, no-prompt, least-privilege
# (web-only on claude/grok; read-only residual on codex/cursor-agent), and
# high-reasoning. PEER_WORKDIR / RAW_OUT / PROMPT_FILE / SCHEMA_REF are
# resolved by the caller (placeholders in --emit-adapter mode); PEER_WORKDIR is the
# per-peer empty cwd/workspace, kept separate from the shared fold-in dir RUN_DIR.
# Peer routes write to RAW_OUT only; the final fold-in file (OUT) is published after normalize so an orphaned
# peer process cannot leave an un-normalized return. NEVER emit: codex without
# `-s read-only`; grok `--always-approve` / `--permission-mode bypassPermissions`;
# cursor-agent `-f` / `--force` / `--yolo`.
adapter_argv() {
  case "$1" in
    codex)
      printf '%s\0' codex --search exec - -C "$READ_ROOT" --skip-git-repo-check -s read-only \
        -o "$RAW_OUT" -m "$(route_model codex)" -c 'model_reasoning_effort="high"' -c 'hide_agent_reasoning=false'
      ;;
    claude)
      # Keep project auto-discovery disabled while allowing only repository reads
      # and bounded public web checks. Mutating tools, Bash, MCP, and subagents are
      # absent from the allowlist.
      printf '%s\0' claude -p --model "$(route_model claude)" --effort high --permission-mode dontAsk \
        --safe-mode --disable-slash-commands --tools Read,Glob,Grep,WebSearch,WebFetch \
        --max-turns 15 --no-session-persistence --json-schema "$SCHEMA_REF" --output-format json
      ;;
    grok-cli)
      printf '%s\0' grok --prompt-file "$PROMPT_FILE" --model "$(route_model grok-cli)" --effort high \
        --cwd "$READ_ROOT" --permission-mode dontAsk \
        --deny Edit --deny Write --deny Bash --deny Task --deny 'mcp__*' \
        --no-subagents --max-turns 15 \
        --json-schema "$SCHEMA_REF" --output-format json
      ;;
    grok-cursor)
      printf '%s\0' cursor-agent -p --model "$(route_model grok-cursor)" --mode ask --trust \
        --sandbox enabled --workspace "$READ_ROOT" --output-format json
      ;;
    cursor)
      printf '%s\0' cursor-agent -p --mode ask --trust \
        --sandbox enabled --workspace "$READ_ROOT" --output-format json
      ;;
    composer)
      printf '%s\0' cursor-agent -p --model "$(route_model composer)" --mode ask --trust \
        --sandbox enabled --workspace "$READ_ROOT" --output-format json
      ;;
    *) return 1 ;;
  esac
}

# The host may replace a stale concrete model only within the fixed route's
# target family. Values are passed as one argv token; they never enter eval.
apply_model_override() {
  local route="$1" override="${CROSS_MODEL_MODEL_OVERRIDE:-}" override_target="${CROSS_MODEL_MODEL_OVERRIDE_TARGET:-}" target
  [ -n "$override" ] || { [ -z "$override_target" ]; return; }
  target="$(route_target "$route")" || return 1
  [ "$override_target" = "$target" ] || return 1
  [ "$target" != "cursor" ] || return 1
  case "$route:$override" in
    codex:gpt-*|codex:o[0-9]* ) ;;
    claude:opus|claude:sonnet|claude:haiku|claude:claude-* ) ;;
    grok-cli:grok-* ) ;;
    grok-cursor:cursor-grok-* ) ;;
    composer:composer-* ) ;;
    *) return 1 ;;
  esac
}

# --- --emit-adapter <route>: print the argv, no model call, no side effects --
if [ "${1:-}" = "--emit-adapter" ]; then
  PEER_WORKDIR="<peer-workdir>"
  READ_ROOT="<read-root>"
  RAW_OUT="<peer-workdir>/pov-<provider>.raw.json"
  PROMPT_FILE="<prompt-file>"; SCHEMA_REF="<schema>"
  route="${2:-}"
  apply_model_override "$route" 2>/dev/null || { echo "model override '${CROSS_MODEL_MODEL_OVERRIDE:-}' not compatible with route '$route'" >&2; exit 2; }
  # adapter_argv emits NUL-delimited argv (can't be captured in a shell var), so
  # validate the route first, then render for humans with NUL -> space.
  adapter_argv "$route" >/dev/null 2>&1 || { echo "unknown route '$route' (want codex|claude|grok-cli|grok-cursor|cursor|composer)" >&2; exit 2; }
  adapter_argv "$route" | tr '\0' ' '; echo
  exit 0
fi

HOST_PROVIDER="${1:-unknown}"
HOST_HARNESS="${CROSS_MODEL_HOST_HARNESS:-unknown}"
FIXED_ROUTE="${2:-}"
PAYLOAD_PATH="${3:-}"
RUN_DIR="${4:-}"

# --- validate inputs -------------------------------------------------------
[ -n "$PAYLOAD_PATH" ] && [ -f "$PAYLOAD_PATH" ] || skip "subject payload '${PAYLOAD_PATH:-<empty>}' not readable on disk; skipping"
READ_ROOT="${CROSS_MODEL_READ_ROOT:-$(pwd -P)}"
[ -d "$READ_ROOT" ] || skip "declared repository/read root '$READ_ROOT' is not a directory"
READ_ROOT="$(cd "$READ_ROOT" && pwd -P)" || skip "cannot resolve repository/read root '$READ_ROOT'"
if [ -n "${CROSS_MODEL_REPO_ROOT:-}" ]; then
  REPO_ROOT="$CROSS_MODEL_REPO_ROOT"
elif command -v git >/dev/null 2>&1 && _git_root="$(git -C "$READ_ROOT" rev-parse --show-toplevel 2>/dev/null)"; then
  REPO_ROOT="$_git_root"
else
  REPO_ROOT="$(pwd -P)"
fi
[ -d "$REPO_ROOT" ] || skip "declared repository root '$REPO_ROOT' is not a directory"
REPO_ROOT="$(cd "$REPO_ROOT" && pwd -P)" || skip "cannot resolve repository root '$REPO_ROOT'"
case "$READ_ROOT/" in "$REPO_ROOT/"*) ;; *) skip "read root '$READ_ROOT' is outside repository root '$REPO_ROOT'" ;; esac

[ -n "$RUN_DIR" ] || skip "run-dir not given; skipping"
if [ -d "$RUN_DIR" ]; then
  RUN_DIR_RESOLVED="$(cd "$RUN_DIR" && pwd -P)" || skip "cannot resolve run-dir '$RUN_DIR'"
else
  RUN_PARENT="$(dirname "$RUN_DIR")"
  RUN_BASENAME="$(basename "$RUN_DIR")"
  [ -d "$RUN_PARENT" ] || skip "run-dir parent '$RUN_PARENT' is not a directory"
  RUN_PARENT="$(cd "$RUN_PARENT" && pwd -P)" || skip "cannot resolve run-dir parent '$RUN_PARENT'"
  RUN_DIR_RESOLVED="$RUN_PARENT/$RUN_BASENAME"
fi
case "$RUN_DIR_RESOLVED/" in "$REPO_ROOT/"*) skip "run-dir must be outside the repository" ;; esac
[ -d "$RUN_DIR_RESOLVED" ] || skip "run-dir '$RUN_DIR' must already exist"
RUN_DIR="$RUN_DIR_RESOLVED"
chmod 700 "$RUN_DIR" 2>/dev/null || skip "run-dir '$RUN_DIR' could not be made private"
command -v jq >/dev/null 2>&1 || skip "jq not installed; skipping"
INCLUDE_PATHS="${CROSS_MODEL_INCLUDE_PATHS:-}"
EXCLUDE_PATHS="${CROSS_MODEL_EXCLUDE_PATHS:-}"

case "$HOST_PROVIDER" in
  codex|claude|grok|composer|unknown) ;;
  *) skip "host serving family '$HOST_PROVIDER' invalid (want codex|claude|grok|composer|unknown)" ;;
esac
case "$HOST_HARNESS" in
  codex|claude|grok|cursor|unknown) ;;
  *) skip "host harness '$HOST_HARNESS' invalid (want codex|claude|grok|cursor|unknown)" ;;
esac

case "$FIXED_ROUTE" in
  codex|claude|grok-cli|grok-cursor|cursor|composer) ;;
  *) skip "unknown fixed route '${FIXED_ROUTE:-<empty>}'; host must resolve one route before egress" ;;
esac
TARGET="$(route_target "$FIXED_ROUTE")" || skip "unknown fixed route '${FIXED_ROUTE:-<empty>}'; host must resolve one route before egress"
apply_model_override "$FIXED_ROUTE" || skip "model override '${CROSS_MODEL_MODEL_OVERRIDE:-}' not compatible with route '$FIXED_ROUTE'"

# --- self-locate skill root + canonical sibling files ----------------------
SKILL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)" || skip "cannot resolve skill root; skipping"
PERSONA="$SKILL_ROOT/references/agents/pov-peer.md"
SCHEMA="$SKILL_ROOT/references/pov-schema.json"
[ -f "$PERSONA" ] || skip "persona brief not found at $PERSONA; skipping"
[ -f "$SCHEMA" ]  || skip "POV schema not found at $SCHEMA; skipping"
SCHEMA_CONTENT="$(cat "$SCHEMA")" || skip "cannot read POV schema; skipping"
SCHEMA_REF="$SCHEMA_CONTENT"   # adapter_argv references SCHEMA_REF for --json-schema routes

# --- validate the host-resolved fixed route and egress allowlist -------------
ALLOW="${CROSS_MODEL_PEERS:-}"                 # optional egress allowlist (R19)

in_csv() { case ",$2," in *",$1,"*) return 0 ;; *) return 1 ;; esac; }
# Require a usable POV, not merely valid JSON. Error envelopes and incomplete
# objects fail the fixed route and return control to the host without publishing
# a cross-check artifact.
out_missing_or_invalid() {
  [ ! -s "$RAW_OUT" ] || ! jq -e \
    '(.voice|type)=="string" and (.voice|length)>0 and (.position|type)=="string" and (.position|length)>0 and (.reasoning|type)=="string" and (.reasoning|length)>0 and (.evidence|type)=="array" and (.external_check=="ran" or .external_check=="unavailable") and (.mode=="independent" or .mode=="skeptic") and (.movement=="initial" or .movement=="moved" or .movement=="held")' \
    "$RAW_OUT" >/dev/null 2>&1
}

# Backward-compatible matrix: legacy `composer` continues to sanction Cursor as
# the Grok intermediary, while the distinct Cursor-default target requires the
# new `cursor` key. Composer itself remains sanctioned by `composer`.
route_allowlisted() {
  [ -z "$ALLOW" ] && return 0
  case "$1" in
    codex|claude|grok-cli) in_csv "$(route_target "$1")" "$ALLOW" ;;
    cursor) in_csv cursor "$ALLOW" ;;
    composer) in_csv composer "$ALLOW" ;;
    grok-cursor)
      in_csv grok "$ALLOW" && { in_csv cursor "$ALLOW" || in_csv composer "$ALLOW"; }
      ;;
    *) return 1 ;;
  esac
}

# Soft size gate: peer prompt embeds the full subject payload. Over-budget payloads skip
# cleanly (R11) rather than collapsing silently inside the provider context window.
MAX_PAYLOAD_CHARS="${CROSS_MODEL_MAX_PAYLOAD_CHARS:-200000}"
case "$MAX_PAYLOAD_CHARS" in ''|*[!0-9]*) MAX_PAYLOAD_CHARS=200000 ;; esac
PAYLOAD_CHARS="$(wc -c <"$PAYLOAD_PATH" | tr -d '[:space:]')"
if [ "$PAYLOAD_CHARS" -gt "$MAX_PAYLOAD_CHARS" ]; then
  skip "subject payload is ${PAYLOAD_CHARS} bytes (limit ${MAX_PAYLOAD_CHARS}); skipping cross-model pass rather than truncating"
fi

route_available() {
  case "$1" in
    codex) command -v codex >/dev/null 2>&1 ;;
    claude) command -v claude >/dev/null 2>&1 ;;
    grok-cli) command -v grok >/dev/null 2>&1 ;;
    grok-cursor|cursor|composer) command -v cursor-agent >/dev/null 2>&1 ;;
    *) return 1 ;;
  esac
}
route_allowlisted "$FIXED_ROUTE" || skip "fixed route '$FIXED_ROUTE' is not fully sanctioned by CROSS_MODEL_PEERS; skipping before egress"
route_available "$FIXED_ROUTE" || skip "fixed route '$FIXED_ROUTE' is unavailable; host must disclose and choose any retry"
log "fixed cross-model POV route: target=$TARGET route=$FIXED_ROUTE (host $HOST_PROVIDER excluded)"

# --- compose the peer prompt from the canonical persona (single source) ----
# The payload is prepared by ce-pov and embeds the framed question plus any
# conversation-only subject material needed for this round. Repository evidence
# stays in the shared working tree for the peer to inspect directly.
SCRATCH_PARENT="${CROSS_MODEL_SCRATCH_PARENT:-/tmp}"
[ -d "$SCRATCH_PARENT" ] || mkdir -p "$SCRATCH_PARENT" 2>/dev/null || skip "private scratch parent '$SCRATCH_PARENT' unavailable"
SCRATCH_PARENT="$(cd "$SCRATCH_PARENT" && pwd -P)" || skip "cannot resolve private scratch parent"
case "$SCRATCH_PARENT/" in "$REPO_ROOT/"*) skip "private scratch parent must be outside the repository" ;; esac
if ! PEER_WORKDIR="$(mktemp -d "$SCRATCH_PARENT/xmodel-pov-peer-XXXXXX")"; then
  skip "provider $TARGET workspace isolation unavailable; skipping provider"
fi
chmod 700 "$PEER_WORKDIR" 2>/dev/null || { cleanup_private_scratch; skip "cannot make peer scratch private"; }
PROMPT_FILE="$PEER_WORKDIR/prompt.md"
PEERLOG="$PEER_WORKDIR/stdout.log"
# Peer stderr goes to its own file, NOT merged into PEERLOG: PEERLOG must stay
# clean stdout for the POV brace-match and the receipt jq-parse. An
# auth/quota/rate-limit message often lands on stderr, so capture it separately
# and surface it in the skip evidence (grok's 402 is on stdout, others on stderr).
PEERERR="$PEER_WORKDIR/stderr.log"
RAW_OUT="$PEER_WORKDIR/pov-$TARGET.raw.json"
: > "$PROMPT_FILE"; : > "$PEERLOG"; : > "$PEERERR"
chmod 600 "$PROMPT_FILE" "$PEERLOG" "$PEERERR" 2>/dev/null || { cleanup_private_scratch; skip "cannot make peer scratch files private"; }
trap 'cleanup_private_scratch' EXIT
{
  cat "$PERSONA"
  printf '\n\n---\n\n'
  printf 'This is an authorized, read-only point-of-view cross-check on the maintainer\047s own project.\n'
  printf 'Return ONE JSON object and nothing else (no prose, no code fence) matching this schema:\n\n'
  printf '%s' "$SCHEMA_CONTENT"
  printf '\n\nSet the top-level "voice" field to "peer" (it will be namespaced to the provider on fold-in).\n'
  printf '\n<repository-read-scope enforcement="cooperative-unless-adapter-supported">\n'
  printf 'root: %s\nincludes: %s\nexcludes: %s\n' "$READ_ROOT" "${INCLUDE_PATHS:-<all>}" "${EXCLUDE_PATHS:-<none>}"
  printf '</repository-read-scope>\n'
  printf '\n<subject-payload>\n'
  cat "$PAYLOAD_PATH"
  printf '\n</subject-payload>\n'
} > "$PROMPT_FILE"

# --- run machinery: idle-timeout for streaming codex, hard cap for the rest --
IDLE_SECS="${CROSS_MODEL_IDLE_SECS:-180}"
HARD_SECS="${CROSS_MODEL_HARD_SECS:-600}"
TO_BIN="$(command -v gtimeout || command -v timeout || true)"

# Reap a backgrounded job's whole process group: TERM, then KILL after a grace.
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

# TERM/INT: reap the live peer group, then exit cleanly (HUP remains ignored).
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

# Build the CMD array for a route (bash 3.2-safe: no mapfile).
build_cmd() {
  CMD=()
  # NUL-delimited so a token containing newlines (the pretty-printed --json-schema
  # value) stays ONE argv element instead of splitting across lines.
  while IFS= read -r -d '' tok; do CMD+=("$tok"); done < <(adapter_argv "$1")
}

# --- liveness heartbeat -----------------------------------------------------
# The peer CLI streams into $PEERLOG (private), so nothing reaches this script's
# own stdout/stderr during a long model call. An outer supervisor that watches
# THIS process's output for liveness (the peer-job runner's out.log byte-growth
# idle window) would mistake a healthy multi-minute run for a wedge. A background
# writer emits one stderr line every CROSS_MODEL_HEARTBEAT_SECS (default 60s) so
# that liveness is visible; it is torn down as soon as the foreground wait returns,
# so it adds no latency to a fast run. Keep this block byte-identical across
# the peer worker scripts (lifecycle parity).
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

run_codex_cmd() {   # CMD already built for the codex route; streams to PEERLOG, writes -o RAW_OUT
  RUN_SUCCEEDED=false
  local prev; case "$-" in *m*) prev=1;; *) prev=0;; esac
  set -m
  "${CMD[@]}" < "$PROMPT_FILE" > "$PEERLOG" 2>&1 &
  local pid=$!
  ACTIVE_PEER_PID="$pid"
  [ "$prev" = 0 ] && set +m
  start_heartbeat
  local start last=-1 lastchg now size
  start="$(date +%s)"; lastchg="$start"
  while kill -0 "$pid" 2>/dev/null; do
    sleep 5; now="$(date +%s)"; size="$(wc -c <"$PEERLOG" 2>/dev/null || echo 0)"
    [ "$size" != "$last" ] && { last="$size"; lastchg="$now"; }
    if [ $(( now - lastchg )) -ge "$IDLE_SECS" ]; then
      log "codex output idle ${IDLE_SECS}s; reaping peer process group"; reap "$pid"; break
    fi
    if [ $(( now - start )) -ge "$HARD_SECS" ]; then
      log "codex exceeded hard cap ${HARD_SECS}s; reaping peer process group"; reap "$pid"; break
    fi
  done
  if wait "$pid" 2>/dev/null; then RUN_SUCCEEDED=true
  else log "peer exited non-zero or timed out"; fi
  # Sweep any survivor the provider left in its OWN process group. `set -m` puts
  # the provider in a separate pgid, and on a clean worker exit the runner's
  # final sweep only kills the worker's pgid while a group-orphan reparents off
  # the worker's process tree -- so it must be reaped here, where the pgid is
  # known. reap() returns immediately when the group is already empty.
  reap "$pid" 2>/dev/null || true
  stop_heartbeat
  ACTIVE_PEER_PID=""
}

run_timeout_cmd() {   # $1 = stdin file ("" -> /dev/null). CMD already built.
  RUN_SUCCEEDED=false
  # Run from the declared read root. Private prompt/output paths are absolute and
  # remain outside the repository; route adapters separately carry the same root.
  local stdin_file="${1:-}"; [ -n "$stdin_file" ] || stdin_file=/dev/null
  local prev; case "$-" in *m*) prev=1;; *) prev=0;; esac
  set -m
  if [ -n "$TO_BIN" ]; then
    ( cd "$READ_ROOT" && exec "$TO_BIN" -k 10 "$HARD_SECS" "${CMD[@]}" ) < "$stdin_file" > "$PEERLOG" 2>"$PEERERR" &
  else
    ( cd "$READ_ROOT" && exec perl -e 'alarm shift; exec @ARGV' "$HARD_SECS" "${CMD[@]}" ) < "$stdin_file" > "$PEERLOG" 2>"$PEERERR" &
  fi
  local pid=$!
  ACTIVE_PEER_PID="$pid"
  [ "$prev" = 0 ] && set +m
  start_heartbeat
  if wait "$pid" 2>/dev/null; then RUN_SUCCEEDED=true
  else log "peer exited non-zero or timed out"; fi
  reap "$pid" 2>/dev/null || true   # sweep survivors in the provider's own group (see run_codex_cmd)
  stop_heartbeat
  ACTIVE_PEER_PID=""
}

# Recover a POV object from raw stdout or from a string nested in a CLI envelope.
recover_pov_json() {   # <logfile> <outfile>
  # Probe execution, not just PATH presence — Windows Store's python3 stub
  # satisfies `command -v` then exits nonzero (see resolve-python convention).
  local py
  py="$(for c in python3 python py; do command -v "$c" >/dev/null 2>&1 && "$c" -c '' >/dev/null 2>&1 && { echo "$c"; break; }; done)"
  [ -n "$py" ] || return 1
  "$py" - "$1" "$2" <<'PY' 2>/dev/null
import sys, json
txt = open(sys.argv[1], encoding="utf-8", errors="replace").read()
best = None
decoder = json.JSONDecoder()

def inspect(value):
    global best
    if isinstance(value, dict):
        if "position" in value:
            best = value
        for child in value.values():
            inspect(child)
    elif isinstance(value, list):
        for child in value:
            inspect(child)
    elif isinstance(value, str):
        for i, ch in enumerate(value):
            if ch not in "{[":
                continue
            try:
                child, _ = decoder.raw_decode(value, i)
                inspect(child)
            except Exception:
                pass

inspect(txt)
if best is not None: open(sys.argv[2], "w").write(json.dumps(best))
PY
  [ -s "$2" ]
}

# Parse a schema-shaped object out of a headless CLI JSON envelope (claude/grok/cursor).
parse_structured() {   # <logfile> <outfile>
  jq -e '.structured_output' "$1" > "$2" 2>/dev/null && return 0
  jq -r '.result // empty' "$1" 2>/dev/null | jq -e '.' > "$2" 2>/dev/null && return 0
  recover_pov_json "$1" "$2"
}

bounded_failure_evidence() {   # <logfile>; prefer structured diagnostics, then bounded head+tail
  local path="$1" human ancillary evidence
  human="$(jq -r '
    [
      (.result? | select(type == "string" and length > 0)),
      (.message? | select(type == "string" and length > 0)),
      (.error?.message? | select(type == "string" and length > 0))
    ] | unique | join(" | ")
  ' "$path" 2>/dev/null)"
  ancillary="$(jq -r '
    [
      (if .api_error_status? != null then "api_error_status=\(.api_error_status)" else empty end),
      (.terminal_reason? | select(type == "string" and length > 0) | "terminal_reason=" + .)
    ] | unique | join(" | ")
  ' "$path" 2>/dev/null)"
  # Ancillary fields describe the exit but are not the diagnostic itself. If
  # no recognized human-readable field exists, retain bounded raw output so a
  # CLI's newer or provider-specific error field is still visible.
  [ -n "$human" ] && evidence="$human" || evidence="$(cat "$path")"
  [ -n "$ancillary" ] && evidence="${evidence:+$evidence | }$ancillary"
  evidence="${evidence//$'\n'/ }"
  if [ "${#evidence}" -gt 300 ]; then
    evidence="${evidence:0:147} ... ${evidence: -147}"
  fi
  printf '%s' "$evidence"
}

# Run one route for a provider; leaves a schema-shaped (pre-normalization) $RAW_OUT on success.
attempt_route() {   # <provider> <route>
  local provider="$1" route="$2" note
  : > "$PEERLOG"; : > "$PEERERR"; rm -f "$RAW_OUT" "$OUT"
  build_cmd "$route"
  case "$route" in
    codex)       note="$(route_model codex) (effort high)" ;;
    claude)      note="$(route_model claude) (effort high)" ;;
    grok-cli)    note="$(route_model grok-cli) (effort high)" ;;
    grok-cursor) note="$(route_model grok-cursor)" ;;
    cursor)      note="auto (serving model unverified)" ;;
    composer)    note="$(route_model composer)" ;;
  esac
  log "peer run: provider=$provider route=$route model=$note POV read-only least-privilege (idle ${IDLE_SECS}s / hard ${HARD_SECS}s)"
  case "$route" in
    codex)
      run_codex_cmd
      if [ "$RUN_SUCCEEDED" = true ] && out_missing_or_invalid; then
        recover_pov_json "$PEERLOG" "$RAW_OUT" && log "recovered codex JSON from stdout (-o file unavailable)"
      fi
      ;;
    grok-cli)    run_timeout_cmd ""            ; [ "$RUN_SUCCEEDED" = true ] && parse_structured "$PEERLOG" "$RAW_OUT" ;;   # grok reads --prompt-file
    claude)      run_timeout_cmd "$PROMPT_FILE"; [ "$RUN_SUCCEEDED" = true ] && parse_structured "$PEERLOG" "$RAW_OUT" ;;   # claude -p reads stdin
    grok-cursor|cursor|composer)
      # cursor-agent reads the prompt from stdin (verified). Use stdin, NOT a
      # positional argv token: the composed prompt (persona + schema + template +
      # full subject payload, up to CROSS_MODEL_MAX_PAYLOAD_CHARS) can exceed ARG_MAX and fail
      # the exec with E2BIG on low-limit hosts, whereas stdin has no size limit.
      run_timeout_cmd "$PROMPT_FILE"; [ "$RUN_SUCCEEDED" = true ] && parse_structured "$PEERLOG" "$RAW_OUT" ;;
  esac
  if [ "$RUN_SUCCEEDED" != true ]; then
    rm -f "$RAW_OUT"
    return 0
  fi
  # Extract the served-model receipt from the envelope while $PEERLOG still
  # holds it — normalization below only sees the schema-extracted RAW_OUT.
  extract_model_receipt "$route"
}

# Run the one fixed route. Any failure returns control to the host without
# trying a different target, provider, or intermediary.
run_fixed_route() {
  local provider="$TARGET"
  OUT="$RUN_DIR/pov-$provider.json"
  ACTUAL_ROUTE="$FIXED_ROUTE"
  attempt_route "$provider" "$FIXED_ROUTE"

  # --- normalize + validate against the peer POV contract ------------------
  # Force voice = peer-<provider>, preserve the POV fields, and add route/model
  # receipts from the route that actually ran. The peer never self-attributes an
  # unverifiable serving model.
  # Publish ONLY the normalized OUT into RUN_DIR. RAW_OUT lives in the per-peer
  # workspace and is never a fold-in artifact — if this script dies before normalize
  # (orphaned launch), synthesis finds no .json in RUN_DIR.
  rm -f "$OUT"
  if [ -s "$RAW_OUT" ]; then
    _norm="$PEER_WORKDIR/normalized.json"
    case "$ACTUAL_ROUTE:$MODEL_ACTUAL" in
      cursor:*) serving_family="unknown" ;;
      composer:unverified|grok-cursor:unverified) serving_family="unknown" ;;
      *) serving_family="$(target_serving_family "$provider")" ;;
    esac
    independence=false
    [ "$HOST_PROVIDER" != "unknown" ] && [ "$serving_family" != "unknown" ] && [ "$HOST_PROVIDER" != "$serving_family" ] && independence=true
    if jq --arg v "peer-$provider" --arg route "$ACTUAL_ROUTE" \
         --arg target "$provider" --arg harness "$(route_harness "$ACTUAL_ROUTE")" \
         --arg family "$serving_family" \
         --arg mreq "$(route_model "$ACTUAL_ROUTE")" --arg mact "$MODEL_ACTUAL" \
         --argjson independent "$independence" \
         'if ((.voice|type)=="string" and (.voice|length)>0 and (.position|type)=="string" and (.position|length)>0 and (.reasoning|type)=="string" and (.reasoning|length)>0 and (.evidence|type)=="array" and (.external_check=="ran" or .external_check=="unavailable") and (.mode=="independent" or .mode=="skeptic") and (.movement=="initial" or .movement=="moved" or .movement=="held"))
          then { voice: $v,
                 cross_model_route: $route,
                 cross_model_target: $target,
                 cross_model_harness: $harness,
                 serving_family: $family,
                 model_requested: $mreq,
                 model_actual: $mact,
                 independence_verified: $independent,
                 position: .position,
                 reasoning: .reasoning,
                 evidence: .evidence,
                 external_check: .external_check,
                 mode: .mode,
                 movement: .movement }
          else empty end' \
         "$RAW_OUT" > "$_norm" 2>/dev/null; then
      mv "$_norm" "$OUT"
      chmod 600 "$OUT" 2>/dev/null || { rm -f "$OUT"; log "could not make result artifact private"; }
    else
      rm -f "$_norm"
    fi
    rm -f "$RAW_OUT"
  fi
  if [ -s "$OUT" ] && jq -e \
    '(.voice|type)=="string" and (.position|type)=="string" and (.position|length)>0 and (.reasoning|type)=="string" and (.reasoning|length)>0 and (.evidence|type)=="array" and (.external_check=="ran" or .external_check=="unavailable") and (.mode=="independent" or .mode=="skeptic") and (.movement=="initial" or .movement=="moved" or .movement=="held") and (.independence_verified|type)=="boolean"' \
    "$OUT" >/dev/null 2>&1; then
    log "wrote peer POV to $OUT (voice peer-$provider)"
  else
    log "provider $provider produced no usable schema-shaped output; skipping fold-in"
    # Surface bounded, actionable peer evidence so the orchestrator can
    # reason about WHY it was skipped (quota/usage-limit exhaustion vs an ordinary
    # empty review) and, in a repeated-pass session, deprioritize an exhausted
    # route. Prefer structured CLI error fields before the bounded raw fallback;
    # a useful `.result` can appear near the start of a long JSON envelope. Surface
    # BOTH streams -- the error can be on stdout (grok's 402) or stderr
    # (claude/cursor auth/quota).
    if [ -s "$PEERLOG" ]; then
      _pt="$(bounded_failure_evidence "$PEERLOG")"
      log "  peer skip evidence: $_pt"
    fi
    if [ -s "$PEERERR" ]; then
      _pe="$(bounded_failure_evidence "$PEERERR")"
      log "  peer skip evidence (stderr): $_pe"
    fi
    rm -f "$OUT" "$RAW_OUT"
  fi
  cleanup_private_scratch
}

run_fixed_route
exit 0
