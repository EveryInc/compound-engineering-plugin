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
#   cross-model-pov.sh <host-serving-family> <fixed-route> <subject-payload> <run-dir>
#
#   <host-serving-family>
#                   the peer-key of the host's OWN serving family, attested by
#                   the calling skill (it knows its harness). A peer-key, never
#                   a provider name: openai->codex, anthropic->claude,
#                   xai->grok, cursor/composer->composer.
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
#                     grok) -- NOT the <host-serving-family> key.
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
# peer process group can keep running while this script dies
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
# ONE model per provider at its editorial tier (native Grok is xhigh; Codex and Claude stay high). Concrete IDs are the CURRENT instance of the tier principle
# and the single maintenance point when model families change.
M_CODEX="gpt-6.1-sol"          # codex     (reasoning_effort=high)
M_CLAUDE="claude-opus-5-5"     # claude    (effort=high)
M_GROK="grok-4.7"              # grok CLI  (reasoning_effort=xhigh)
# Cursor's ACP server offers one preset per model and rejects effort variants,
# so grok-cursor runs at high/fast and composer at its fast tier.
M_GROK_CURSOR="grok-4.7[context=256k,reasoning_effort=high,fast=true]"
M_COMPOSER="composer-2.5[fast=true]"

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
    opencode)    printf 'auto' ;;
  esac
}

route_target() {
  case "$1" in
    codex|claude|cursor|composer) printf '%s' "$1" ;;
    grok-cli|grok-cursor) printf 'grok' ;;
    opencode) printf 'opencode' ;;
  esac
}

route_harness() {
  case "$1" in
    codex) printf 'codex' ;;
    claude) printf 'claude' ;;
    grok-cli) printf 'grok' ;;
    grok-cursor|cursor|composer) printf 'cursor-agent' ;;
    opencode) printf 'opencode' ;;
  esac
}

target_serving_family() {
  case "$1" in
    codex|claude|grok|composer) printf '%s' "$1" ;;
    cursor) printf 'unknown' ;;
    opencode) printf 'unknown' ;;
  esac
}

route_available() {
  case "$1" in
    codex) command -v codex >/dev/null 2>&1 ;;
    claude) command -v claude >/dev/null 2>&1 ;;
    grok-cli) command -v grok >/dev/null 2>&1 ;;
    grok-cursor|cursor|composer) command -v cursor-agent >/dev/null 2>&1 ;;
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

# --- model-identity receipt ---------------------------------------------------
# "Which model ran" comes from the adapter's _meta report, recorded as the
# served id; it is never filled from the requested value. Prefer the served id
# in the requested family (Claude also reports an auxiliary Haiku); otherwise
# record the model that used the most tokens and warn about the mismatch.
MODEL_ACTUAL="unverified"
extract_model_receipt() {   # <route>; reads $PEERLOG, sets MODEL_ACTUAL
  local requested family served m tokens most=-1 heaviest=""
  MODEL_ACTUAL="unverified"
  requested="$(route_model "$1")"
  family="${requested%%\[*}"
  case "$family" in
    fable|opus|sonnet|haiku) family="claude-$family" ;;
  esac
  served="$(acpx_served_models "$PEERLOG")"
  [ -n "$served" ] || return 0
  while read -r m tokens; do
    [ -n "$m" ] || continue
    case "$m" in
      "$family"|"$family"-*|"$family"\[*) MODEL_ACTUAL="$m"; return 0 ;;
    esac
    if [ "${tokens:-0}" -gt "$most" ]; then most="${tokens:-0}"; heaviest="$m"; fi
  done <<EOF
$served
EOF
  MODEL_ACTUAL="$heaviest"
  log "WARNING: model mismatch - requested $requested, adapter reported $MODEL_ACTUAL; reconcile must surface this"
}

# --- adapter argv (single source of truth for route flags) -----------------
# Read-only intent on every route: reads are approved, every other permission
# request is denied, and each adapter runs in its read-only mode where it has
# one (codex mode=read-only, claude mode=default, cursor mode=ask, opencode
# mode=plan with edits denied). Claude's --allowed-tools is an auto-approve
# list, not a restriction: its other tools still ask and are denied. The
# codex adapter does not enforce its read-only mode, so write denial is best
# effort. PEER_WORKDIR / PROMPT_FILE / MCP_CONFIG / CLAUDE_WRAPPER are resolved
# by the caller (placeholders in --emit-adapter mode).
adapter_argv() {
  local route="$1" model
  acpx_agent "$route" >/dev/null || return 1
  model="$(route_model "$route")"
  case "$route" in
    # OpenCode's plan mode keeps the peer read-only; denying bash outright makes
    # its free tier reject the session over ACP.
    opencode) printf '%s\0' env OPENCODE_DISABLE_PROJECT_CONFIG=1 \
      'OPENCODE_CONFIG_CONTENT={"permission":{"edit":"deny","webfetch":"deny","task":"deny"}}' ;;
  esac
  acpx_base_argv "$route" "$READ_ROOT" "$MCP_CONFIG" "$HARD_SECS" "$CLAUDE_WRAPPER"
  printf '%s\0' --approve-reads --non-interactive-permissions deny
  case "$route" in
    claude) printf '%s\0' --allowed-tools Read,Glob,Grep,WebSearch,WebFetch --max-turns 15 ;;
  esac
  [ "$model" = auto ] || printf '%s\0' --model "$model"
  acpx_agent_argv "$route"
  case "$route" in
    codex)    printf '%s\0' --config-option mode=read-only --config-option reasoning_effort=high ;;
    claude)   printf '%s\0' --config-option mode=default --config-option effort=high ;;
    grok-cli) printf '%s\0' --config-option reasoning_effort=xhigh ;;
    grok-cursor|cursor|composer) printf '%s\0' --config-option mode=ask ;;
    opencode) printf '%s\0' --config-option mode=plan ;;
  esac
  printf '%s\0' --file "$PROMPT_FILE"
}

# The host may replace a stale concrete model only within the fixed route's
# target family. Values are passed as one argv token; they never enter eval.
# A codex id may carry the serving provider's own namespace (openai.gpt-...)
# when the CLI routes through a non-default model_provider.
apply_model_override() {
  local route="$1" override="${CROSS_MODEL_MODEL_OVERRIDE:-}" override_target="${CROSS_MODEL_MODEL_OVERRIDE_TARGET:-}" target
  [ -n "$override" ] || { [ -z "$override_target" ]; return; }
  target="$(route_target "$route")" || return 1
  [ "$override_target" = "$target" ] || return 1
  [ "$target" != "cursor" ] || return 1
  case "$route:$override" in
    codex:gpt-*|codex:o[0-9]*|codex:*[./]gpt-*|codex:*[./]o[0-9]* ) ;;
    claude:fable|claude:opus|claude:sonnet|claude:haiku|claude:claude-* ) ;;
    grok-cli:grok-* ) ;;
    grok-cursor:grok-* ) ;;
    composer:composer-* ) ;;
    opencode:*/* ) ;;
    *) return 1 ;;
  esac
}

# --- --emit-adapter <route>: print the argv, no model call, no side effects --
if [ "${1:-}" = "--emit-adapter" ]; then
  READ_ROOT="<read-root>"
  PROMPT_FILE="<prompt-file>"; MCP_CONFIG="<mcp-config>"; CLAUDE_WRAPPER="<claude-safe-mode-wrapper>"
  HARD_SECS="${CROSS_MODEL_HARD_SECS:-600}"
  route="${2:-}"
  apply_model_override "$route" 2>/dev/null || { echo "model override '${CROSS_MODEL_MODEL_OVERRIDE:-}' not compatible with route '$route'" >&2; exit 2; }
  # adapter_argv emits NUL-delimited argv (can't be captured in a shell var), so
  # validate the route first, then render for humans with NUL -> space.
  adapter_argv "$route" >/dev/null 2>&1 || { echo "unknown route '$route' (want codex|claude|grok-cli|grok-cursor|cursor|composer|opencode)" >&2; exit 2; }
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
  codex|claude|grok|cursor|opencode|unknown) ;;
  *) skip "host harness '$HOST_HARNESS' invalid (want codex|claude|grok|cursor|opencode|unknown)" ;;
esac

case "$FIXED_ROUTE" in
  codex|claude|grok-cli|grok-cursor|cursor|composer|opencode) ;;
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

# --- validate the host-resolved fixed route and egress allowlist -------------
ALLOW="${CROSS_MODEL_PEERS:-}"                 # optional egress allowlist (R19)

in_csv() { case ",$2," in *",$1,"*) return 0 ;; *) return 1 ;; esac; }
# Require a usable POV, not merely valid JSON. Error envelopes and incomplete
# objects fail the fixed route and return control to the host without publishing
# a cross-check artifact.
pov_shaped() {   # <file>: schema-shaped POV (finality is a separate gate)
  [ -s "$1" ] && jq -e \
    '(.voice|type)=="string" and (.voice|length)>0 and (.position|type)=="string" and (.position|length)>0 and (.reasoning|type)=="string" and (.reasoning|length)>0 and (.evidence|type)=="array" and all(.evidence[]; type=="string" and length>0) and (.external_check=="ran" or .external_check=="unavailable") and (.mode=="independent" or .mode=="skeptic") and (.movement=="initial" or .movement=="moved" or .movement=="held")' \
    "$1" >/dev/null 2>&1
}
out_missing_or_invalid() { ! pov_shaped "$RAW_OUT"; }

# A usable position is a settled answer to the framed question. The peer
# declares that itself through the schema's required `final` boolean: a
# schema-shaped artifact whose `final` is not true is non-final (a placeholder
# emitted before the peer finished inspecting -- observed on grok-cli in the
# #1402 panel, where the model returned its final schema object on turn one)
# and must not be published as a peer voice. Finality lives in the owned output
# contract, never in a phrase list over model prose.
out_final() { [ -s "$RAW_OUT" ] && jq -e '.final == true' "$RAW_OUT" >/dev/null 2>&1; }

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
    opencode) in_csv opencode "$ALLOW" ;;
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

route_allowlisted "$FIXED_ROUTE" || skip "fixed route '$FIXED_ROUTE' is not fully sanctioned by CROSS_MODEL_PEERS; skipping before egress"
acpx_preflight "$FIXED_ROUTE" "$READ_ROOT" || skip "transport unavailable (pre-egress, $ACPX_SCOPE): $ACPX_UNAVAILABLE"
log "fixed cross-model POV route: target=$TARGET route=$FIXED_ROUTE (host $HOST_PROVIDER excluded)"

# --- compose the peer prompt from the canonical persona (single source) ----
# The payload is prepared by ce-pov and embeds the framed question plus any
# conversation-only subject material needed for this round. Repository evidence
# stays in the shared working tree for the peer to inspect directly.
SCRATCH_PARENT="${CROSS_MODEL_SCRATCH_PARENT:-${TMPDIR:-/tmp}}"
[ -d "$SCRATCH_PARENT" ] || mkdir -p "$SCRATCH_PARENT" 2>/dev/null || skip "private scratch parent '$SCRATCH_PARENT' unavailable"
SCRATCH_PARENT="$(cd "$SCRATCH_PARENT" && pwd -P)" || skip "cannot resolve private scratch parent"
case "$SCRATCH_PARENT/" in "$REPO_ROOT/"*) skip "private scratch parent must be outside the repository" ;; esac
if ! PEER_WORKDIR="$(mktemp -d "$SCRATCH_PARENT/xmodel-pov-peer-XXXXXX")"; then
  skip "provider $TARGET workspace isolation unavailable; skipping provider"
fi
chmod 700 "$PEER_WORKDIR" 2>/dev/null || { cleanup_private_scratch; skip "cannot make peer scratch private"; }
PROMPT_FILE="$PEER_WORKDIR/prompt.md"
PEERLOG="$PEER_WORKDIR/stdout.log"
# acpx prints the ACP stream on stdout; npm and adapter diagnostics go to stderr.
PEERERR="$PEER_WORKDIR/stderr.log"
RAW_OUT="$PEER_WORKDIR/pov-$TARGET.raw.json"
TEXT_OUT="$PEER_WORKDIR/reply.txt"
MCP_CONFIG="$PEER_WORKDIR/mcp.json"
: > "$PROMPT_FILE"; : > "$PEERLOG"; : > "$PEERERR"
printf '{"mcpServers":[]}\n' > "$MCP_CONFIG"
chmod 600 "$PROMPT_FILE" "$PEERLOG" "$PEERERR" "$MCP_CONFIG" 2>/dev/null || { cleanup_private_scratch; skip "cannot make peer scratch files private"; }
CLAUDE_WRAPPER=""
if [ "$FIXED_ROUTE" = claude ]; then
  CLAUDE_WRAPPER="$(acpx_claude_wrapper "$PEER_WORKDIR")" || { cleanup_private_scratch; skip "transport unavailable (pre-egress, route): cannot prepare the Claude --safe-mode launcher"; }
fi
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

# --- run machinery -----------------------------------------------------------
# Every route streams the ACP session, so the idle cap is the liveness guard and
# HARD_SECS backstops a peer that stays productive past any useful budget. acpx
# gets the same budget as --timeout, but it applies that per phase, so this
# script's wall clock stays authoritative. This skill's default HARD_SECS stays
# at 600s because its codex route runs the lower sol/high tier -- ce-code-review
# and ce-doc-review run luna/xhigh and default higher. `CROSS_MODEL_HARD_SECS`
# is shared across all three, and the orchestrator's aggregate deadline derives
# from it (see references/cross-model-panel.md), so a raised knob raises both windows.
IDLE_SECS="${CROSS_MODEL_IDLE_SECS:-180}"
HARD_SECS="${CROSS_MODEL_HARD_SECS:-600}"
RETRY_MIN_SECS="${CROSS_MODEL_RETRY_MIN_SECS:-60}"   # least window worth spending on a non-final retry

# Reap a backgrounded job's whole process group: TERM, then KILL after a grace.
# True while $1 is a live (non-zombie) process. kill -0 succeeds on zombies
# until wait reaps them, so idle polls must not treat zombies as still running.
# macOS/BSD often report defunct state as "Z+" (not bare "Z").
# Match peer-job-runner._pid_running: empty state after ps means not alive
# (avoids zombie spin). Fall back to kill -0 only when ps itself is missing.
peer_alive() {
  local st
  kill -0 "$1" 2>/dev/null || return 1
  if ! command -v ps >/dev/null 2>&1; then
    return 0
  fi
  st="$(ps -o state= -p "$1" 2>/dev/null | tr -d ' \n')"
  [ -n "$st" ] || return 1
  [ "${st#Z}" = "$st" ]
}

reap() {
  # Signal the process group and grace-poll without wait(). The caller alone
  # wait()s the leader so PEER_EXIT is the real exit status — a second
  # wait here would fail after we already reaped and mark healthy exits as
  # timed-out (#1270 Bugbot). No background KILL timer: orphaned timers can
  # hit recycled PIDs under bun --parallel.
  local pid="$1" grp
  if kill -TERM -- -"$pid" 2>/dev/null; then grp=1; else kill -TERM "$pid" 2>/dev/null || true; grp=0; fi
  for _ in 1 2 3 4 5; do
    if ! peer_alive "$pid"; then
      # Leader exited/zombied — sweep any group survivors; caller wait()s.
      [ "$grp" = 1 ] && kill -KILL -- -"$pid" 2>/dev/null || true
      return 0
    fi
    sleep 1
  done
  if [ "$grp" = 1 ]; then kill -KILL -- -"$pid" 2>/dev/null; else kill -KILL "$pid" 2>/dev/null; fi
}

# TERM/INT: reap the live peer group, then exit cleanly (HUP remains ignored).
on_term() {
  if [ -n "${_HEARTBEAT_PID:-}" ]; then
    stop_heartbeat
  fi
  if [ -n "${ACTIVE_PEER_PID:-}" ]; then
    log "received TERM/INT; reaping peer process group $ACTIVE_PEER_PID"
    _term_peer="$ACTIVE_PEER_PID"
    reap "$_term_peer" 2>/dev/null || true
    # reap only signals the group; wait reaps the leader so it cannot orphan.
    wait "$_term_peer" 2>/dev/null || true
    ACTIVE_PEER_PID=""
  fi
  exit 0
}
trap 'on_term' TERM INT

# Build the CMD array for a route (bash 3.2-safe: no mapfile).
build_cmd() {
  CMD=()
  # NUL-delimited so a token containing spaces or newlines stays ONE argv element.
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
  _HEARTBEAT_READY=0
  trap '_HEARTBEAT_READY=1' USR1
  # Callers restore set +m after launching the peer, so without this the
  # heartbeat inherits the worker pgid and kill -- -PID cannot reach the sleep.
  local prev_m; case "$-" in *m*) prev_m=1;; *) prev_m=0;; esac
  set -m
  ( local t0 n sleeper=""
    trap 'kill "${sleeper:-}" 2>/dev/null || true; exit 0' TERM INT
    kill -USR1 "$parent_pid"
    t0="$(date +%s)"
    while kill -0 "$parent_pid" 2>/dev/null; do
      sleep "$every" & sleeper=$!
      wait "$sleeper" 2>/dev/null || exit 0
      sleeper=""
      kill -0 "$parent_pid" 2>/dev/null || break
      n="$(date +%s)"; log "peer alive ($(( n - t0 ))s elapsed)"
    done ) &
  _HEARTBEAT_PID=$!
  [ "$prev_m" = 0 ] && set +m
  while [ "$_HEARTBEAT_READY" != 1 ] && kill -0 "$_HEARTBEAT_PID" 2>/dev/null; do sleep 0.01 || true; done
  trap - USR1
}
stop_heartbeat() {
  if [ -n "$_HEARTBEAT_PID" ]; then
    # Leader-only TERM is deferred until the inner `wait $sleeper` returns, so
    # the default 60s interval would block this wait. Signal the process group.
    kill -- -"$_HEARTBEAT_PID" 2>/dev/null || kill "$_HEARTBEAT_PID" 2>/dev/null || true
    wait "$_HEARTBEAT_PID" 2>/dev/null || true
  fi
  _HEARTBEAT_PID=""
}

run_peer_cmd() {   # CMD already built; streams to PEERLOG, diagnostics to PEERERR
  local prev; case "$-" in *m*) prev=1;; *) prev=0;; esac
  set -m
  "${CMD[@]}" < /dev/null > "$PEERLOG" 2>"$PEERERR" &
  local pid=$!
  ACTIVE_PEER_PID="$pid"
  [ "$prev" = 0 ] && set +m
  start_heartbeat
  local start last=-1 lastchg now size
  start="$(date +%s)"; lastchg="$start"
  while peer_alive "$pid"; do
    now="$(date +%s)"; size="$(wc -c <"$PEERLOG" 2>/dev/null || echo 0)"
    [ "$size" != "$last" ] && { last="$size"; lastchg="$now"; }
    if [ $(( now - lastchg )) -ge "$IDLE_SECS" ]; then
      log "peer output idle ${IDLE_SECS}s; reaping peer process group"; reap "$pid"; break
    fi
    if [ $(( now - start )) -ge "$HARD_SECS" ]; then
      log "peer exceeded hard cap ${HARD_SECS}s; reaping peer process group"; reap "$pid"; break
    fi
    sleep 1
  done
  wait "$pid" 2>/dev/null
  PEER_EXIT=$?
  # Sweep any survivor the provider left in its OWN process group. `set -m` puts
  # the provider in a separate pgid, and on a clean worker exit the runner's
  # final sweep only kills the worker's pgid while a group-orphan reparents off
  # the worker's process tree -- so it must be reaped here, where the pgid is
  # known. reap() returns immediately when the group is already empty.
  reap "$pid" 2>/dev/null || true
  stop_heartbeat
  ACTIVE_PEER_PID=""
}

# Recover a POV object from the agent's reply text, which may wrap it in prose or a fence.
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
best_score = -1
decoder = json.JSONDecoder()
def shaped(d):
    # Mirror of pov_shaped() in the shell: the same field types and enums,
    # so ranking cannot promote a fully keyed but invalid draft.
    return (
        isinstance(d.get("voice"), str) and d["voice"] != ""
        and isinstance(d.get("position"), str) and d["position"] != ""
        and isinstance(d.get("reasoning"), str) and d["reasoning"] != ""
        and isinstance(d.get("evidence"), list)
        and all(isinstance(e, str) and e != "" for e in d["evidence"])
        and d.get("external_check") in ("ran", "unavailable")
        and d.get("mode") in ("independent", "skeptic")
        and d.get("movement") in ("initial", "moved", "held")
    )

def score(d):
    # Prefer a schema-shaped final POV over a shaped non-final one over any
    # dict that merely carries a position; ties go to the later candidate.
    if shaped(d) and d.get("final") is True:
        return 2
    if shaped(d):
        return 1
    return 0

def inspect(value):
    global best, best_score
    if isinstance(value, dict):
        if "position" in value:
            sc = score(value)
            if sc >= best_score:
                best, best_score = value, sc
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

bounded_failure_evidence() {   # <logfile>; bounded head+tail of a plain-text log
  local path="$1" evidence
  # bash 3.2 rewrites newlines in a large string superlinearly, so read only the
  # ends of a long log instead of the whole file.
  if [ "$(wc -c <"$path")" -le 600 ]; then evidence="$(cat "$path")"
  else IFS= read -r -d '' -n 300 evidence <"$path"; evidence="$evidence ... $(tail -c 300 "$path")"; fi
  evidence="${evidence//$'\n'/ }"
  if [ "${#evidence}" -gt 300 ]; then
    evidence="${evidence:0:147} ... ${evidence: -147}"
  fi
  printf '%s' "$evidence"
}

# Run one route for a provider; leaves a schema-shaped (pre-normalization) $RAW_OUT on success.
# Success is the prompt's own end_turn result: acpx exits 5 when a permission
# request was denied even though the turn completed, and exits 0 on a cancelled one.
attempt_route() {   # <provider> <route>
  local provider="$1" route="$2" outcome reason
  : > "$PEERLOG"; : > "$PEERERR"; rm -f "$RAW_OUT" "$OUT" "$TEXT_OUT"
  RUN_SUCCEEDED=false
  build_cmd "$route"
  log "peer run: provider=$provider route=$route model=$(route_model "$route") transport=acpx@$ACPX_VERSION POV read-only least-privilege (idle ${IDLE_SECS}s / hard ${HARD_SECS}s)"
  run_peer_cmd
  outcome="$(acpx_outcome "$PEERLOG")"
  case "$outcome" in
    end_turn)
      RUN_SUCCEEDED=true
      acpx_text "$PEERLOG" "$TEXT_OUT" && recover_pov_json "$TEXT_OUT" "$RAW_OUT"
      extract_model_receipt "$route"
      ;;
    not-sent)
      # Nothing reached the provider: npm could not fetch acpx (every route
      # fails alike), or the adapter refused before the prompt (this route only).
      if grep -q '^npm error' "$PEERERR" 2>/dev/null; then
        reason="$(grep -m1 '^npm error' "$PEERERR")"
        PRE_EGRESS="transport unavailable (pre-egress, shared): ${reason:0:200}"
      else
        reason="$(acpx_failure_evidence "$PEERLOG")"
        PRE_EGRESS="transport unavailable (pre-egress, route): ${reason:-acpx exited $PEER_EXIT before sending the prompt}"
      fi
      ;;
    *) log "peer run ended with $outcome (acpx exit $PEER_EXIT)" ;;
  esac
}

# Run the one fixed route. Any failure returns control to the host without
# trying a different target, provider, or intermediary.
run_fixed_route() {
  local provider="$TARGET"
  OUT="$RUN_DIR/pov-$provider.json"
  ACTUAL_ROUTE="$FIXED_ROUTE"
  ROUTE_STARTED_AT="$(date +%s)"
  PRE_EGRESS=""
  attempt_route "$provider" "$FIXED_ROUTE"
  [ -z "$PRE_EGRESS" ] || { cleanup_private_scratch; skip "$PRE_EGRESS"; }
  # One bounded retry on the same route, target, model, and scope; the only
  # change is a final-answer instruction. The retry gets only what is left of
  # this worker's HARD_SECS window so both attempts stay inside the panel's
  # aggregate deadline (cross-model-panel.md: CROSS_MODEL_HARD_SECS + 10s);
  # too little left means no retry. A second non-final position drops the
  # voice with skip evidence -- no route hopping.
  nonfinal_position=""
  if [ "$RUN_SUCCEEDED" = true ] && ! out_missing_or_invalid && ! out_final; then
    position="$(jq -r '.position' "$RAW_OUT" 2>/dev/null)"
    remaining=$(( HARD_SECS - ( $(date +%s) - ROUTE_STARTED_AT ) ))
    if [ "$remaining" -lt "$RETRY_MIN_SECS" ]; then
      log "peer returned a non-final position (\"${position:0:120}\") with ${remaining}s of the ${HARD_SECS}s window left; not retrying"
      nonfinal_position="$position"
      rm -f "$RAW_OUT"
    else
      log "peer returned a non-final position (\"${position:0:120}\"); retrying once on the same route with a final-answer requirement (${remaining}s left)"
      printf '\n\nYour previous response set final to false. This response is the final one: inspect the subject and shared working tree now, then return the settled position with its evidence and final set to true.\n' >> "$PROMPT_FILE"
      HARD_SECS="$remaining"
      attempt_route "$provider" "$FIXED_ROUTE"
      if [ "$RUN_SUCCEEDED" = true ] && ! out_missing_or_invalid && ! out_final; then
        nonfinal_position="$(jq -r '.position' "$RAW_OUT" 2>/dev/null)"
        rm -f "$RAW_OUT"
      fi
    fi
  fi

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
         'if ((.voice|type)=="string" and (.voice|length)>0 and (.position|type)=="string" and (.position|length)>0 and (.reasoning|type)=="string" and (.reasoning|length)>0 and (.evidence|type)=="array" and all(.evidence[]; type=="string" and length>0) and (.external_check=="ran" or .external_check=="unavailable") and (.mode=="independent" or .mode=="skeptic") and (.movement=="initial" or .movement=="moved" or .movement=="held") and .final==true)
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
                 movement: .movement,
                 final: true }
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
    '(.voice|type)=="string" and (.position|type)=="string" and (.position|length)>0 and (.reasoning|type)=="string" and (.reasoning|length)>0 and (.evidence|type)=="array" and all(.evidence[]; type=="string" and length>0) and (.external_check=="ran" or .external_check=="unavailable") and (.mode=="independent" or .mode=="skeptic") and (.movement=="initial" or .movement=="moved" or .movement=="held") and (.independence_verified|type)=="boolean"' \
    "$OUT" >/dev/null 2>&1; then
    log "wrote peer POV to $OUT (voice peer-$provider)"
  else
    log "provider $provider produced no usable schema-shaped output; skipping fold-in"
    [ -n "$nonfinal_position" ] && log "  peer skip evidence: non-final position: ${nonfinal_position:0:200}"
    # Surface bounded, actionable peer evidence so the orchestrator can
    # reason about WHY it was skipped (quota/usage-limit exhaustion vs an ordinary
    # empty review) and, in a repeated-pass session, deprioritize an exhausted
    # route. Provider errors arrive as ACP error messages on stdout; npm and
    # adapter diagnostics on stderr.
    _pt="$(acpx_failure_evidence "$PEERLOG")"
    [ -n "$_pt" ] && log "  peer skip evidence: $_pt"
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
