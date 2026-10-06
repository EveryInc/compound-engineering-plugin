#!/usr/bin/env bash
# cross-model-doc-review.sh
#
# Runs ONE ce-doc-review judgment persona through ONE or more DIFFERENT model
# PROVIDERS than the host (the "peer(s)") in separate, read-only, least-privilege
# processes, and writes each peer's findings as JSON into the run dir. Each peer
# gets the same canonical persona brief the in-process reviewer uses
# (references/personas/<persona-file>.md) so it is genuinely "that persona, on a
# different model." One invocation per persona is required because each lens
# carries its own persona brief and produces its own <lens>-<provider>.json
# return that folds in and fingerprints against its in-process twin.
#
# Independence is by PROVIDER, not CLI brand. A provider is reached by a ROUTE:
# its dedicated CLI, or (for fixed grok-cursor / composer routes) cursor-agent.
# Every route runs through acpx (the Agent Client Protocol client). All
# activated lenses run on ONE model per provider at high reasoning, except codex
# and native grok on extra-high; Cursor's grok preset is high and composer's
# fast tier is its ceiling (accepted exceptions).
#
# Usage:
#   cross-model-doc-review.sh <host-serving-family> <candidates> <reviewer-name> \
#                             <document-path> <document-type> <origin> <run-dir>
#
#   <host-serving-family>
#                   the peer-key of the host's OWN serving family, attested by
#                   the calling skill (it knows its harness). A peer-key, never
#                   a provider name: openai->codex, anthropic->claude,
#                   xai->grok, cursor/composer->composer.
#                   Excluded from selection when attested. `unknown` is allowed,
#                   but any returned review remains non-independent and cannot
#                   promote agreement.
#   <candidates>    comma-separated ordered provider keys to consider, e.g.
#                   "codex,claude,grok,composer". The skill front-loads any
#                   resolved preference (conversation > CE config cascade >
#                   project-instructions-in-context); the script excludes the
#                   host, applies the CROSS_MODEL_PEERS allowlist, and walks this
#                   order picking the first available provider(s) up to
#                   CROSS_MODEL_MAX_PEERS.
#   <reviewer-name> one of the three trio lenses: security-lens | adversarial |
#                   product-lens. The SHORT name the in-process persona emits; it
#                   forces the fold-in reviewer field to <reviewer-name>-<provider>
#                   so cross-persona agreement in synthesis matches the in-process
#                   twin. The persona-brief filename is DERIVED from it (not a
#                   caller argument) so a caller cannot point the brief read at an
#                   arbitrary path.
#   <document-path> the document under review (embedded into the peer prompt)
#   <document-type> requirements | plan | unified-requirements | unified-plan
#   <origin>        the Origin context slot (a path, product_contract_source:<v>,
#                   or the literal token none)
#   <run-dir>       an existing dir; output -> <run-dir>/<reviewer-name>-<provider>.json
#
# Test/introspection mode (no model call, no side effects):
#   cross-model-doc-review.sh --emit-adapter <route>
#     prints the exact argv the given route would run (route in:
#     codex | claude | grok-cli | grok-cursor | cursor | composer | opencode).
#     Both this mode and the live run build their argv from adapter_argv(), so
#     the route-safety test asserts on the same command string the peer runs.
#
# Self-locates its sibling reference files via BASH_SOURCE (NOT the CWD, which is
# the user's project on every host). The agent passes the values above.
#
# NON-BLOCKING BY DESIGN: every failure logs to stderr and exits 0 without an
# output file. The cross-model pass is additive and must never fail the review;
# the caller detects success purely by the presence of the output file(s).
#
# DATA-EGRESS NOTE: this embeds the full document content into an external model
# CLI prompt, so document content is transmitted to each peer provider. The log
# lines below record every send so the egress is auditable even in headless mode.

set -uo pipefail

# Survive SIGHUP when the orchestrator backgrounds this script and the parent
# shell exits (common on Cursor/Codex Bash tools). Without this, a detached
# peer process group can keep running while this script dies
# before normalize — leaving fold-in files with a bare `reviewer` field.
trap '' HUP

# Filled while a peer process group is live; TERM/INT handler (installed after
# reap() is defined) reaps it so an orchestrator kill cannot leave orphans.
ACTIVE_PEER_PID=""
PY_BIN=""

log()  { printf '[cross-model-doc] %s\n' "$*" >&2; }
skip() { log "$*"; exit 0; }   # non-blocking: announce reason, exit clean, no output

TRANSIENT_RETRY_DELAY_SECS="${CROSS_MODEL_TRANSIENT_RETRY_DELAY_SECS:-5}"
case "$TRANSIENT_RETRY_DELAY_SECS" in ''|*[!0-9]*) skip "transient retry delay must be an integer from 0 to 60; skipping" ;; esac
[ "$TRANSIENT_RETRY_DELAY_SECS" -le 60 ] || skip "transient retry delay must be an integer from 0 to 60; skipping"

# --- model + reasoning per provider ----------------------------------------
# ONE model per provider at high reasoning, except codex and native grok on
# extra-high. Concrete IDs are the CURRENT instance of the tier principle and
# the single maintenance point when model families change.
# A checkout may override the model (CROSS_MODEL_MODEL_OVERRIDE_TARGET +
# CROSS_MODEL_MODEL_OVERRIDE, same target/family only) and the reasoning effort
# (CROSS_MODEL_EFFORT_OVERRIDE, validated per route); both fail closed.
# codex: luna/xhigh is the benchmarked pick on API dollars (~0.30x sol-medium, tied
# detection, slower tail) -- docs/solutions/skill-design/benchmark-review-peer-model-and-reasoning-tier.md
M_CODEX="gpt-6-luna"           # codex     (reasoning_effort=xhigh)
M_CLAUDE="claude-opus-5-5"     # claude    (effort=high)
M_GROK="grok-4.7"              # grok CLI  (reasoning_effort=xhigh)
# Cursor's ACP server offers one preset per model and rejects effort variants,
# so grok-cursor runs at high/fast and composer at its fast tier.
M_GROK_CURSOR="grok-4.7[context=256k,reasoning_effort=high,fast=true]"
M_COMPOSER="composer-2.5[fast=true]"

route_effort() {   # <route> -> requested effort: the override where the route takes one, else editorial
  if [ -n "${CROSS_MODEL_EFFORT_OVERRIDE:-}" ]; then
    case "$1" in
      codex|claude|grok-cli) printf '%s' "$CROSS_MODEL_EFFORT_OVERRIDE"; return 0 ;;
    esac
  fi
  case "$1" in
    codex|grok-cli) printf 'xhigh' ;;
    claude) printf 'high' ;;
    grok-cursor) printf 'model-implied-high' ;;
    composer) printf 'fast' ;;
    cursor|opencode) printf 'unverified' ;;
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
# through a wrapper that adds --safe-mode, matching the native route.
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
# Zero-tool intent on every route: the peer runs from an empty per-peer
# workspace, acpx denies every permission request, and each adapter runs in its
# read-only mode where it has one (codex mode=read-only, claude mode=default,
# cursor mode=ask, opencode mode=plan with edits and web denied). Tools that
# need no permission stay usable; references/cross-model-review.md records
# which routes can still read files or reach the web. PEER_WORKDIR /
# PROMPT_FILE / MCP_CONFIG / CLAUDE_WRAPPER are resolved by the caller
# (placeholders in --emit-adapter mode).
adapter_argv() {
  local route="$1" model
  acpx_agent "$route" >/dev/null || return 1
  model="$(route_model "$route")"
  case "$route" in
    # Denying bash or read outright makes OpenCode's free tier reject the
    # session over ACP, so those stay behind plan mode and --deny-all.
    opencode) printf '%s\0' env OPENCODE_DISABLE_PROJECT_CONFIG=1 \
      'OPENCODE_CONFIG_CONTENT={"permission":{"edit":"deny","webfetch":"deny","websearch":"deny","task":"deny"}}' ;;
  esac
  acpx_base_argv "$route" "$PEER_WORKDIR" "$MCP_CONFIG" "$HARD_SECS" "$CLAUDE_WRAPPER"
  printf '%s\0' --deny-all
  case "$route" in
    claude) printf '%s\0' --max-turns 15 ;;
  esac
  [ "$model" = auto ] || printf '%s\0' --model "$model"
  acpx_agent_argv "$route"
  case "$route" in
    codex)    printf '%s\0' --config-option mode=read-only --config-option "reasoning_effort=$(route_effort codex)" ;;
    # Claude otherwise starts in the user's default permission mode, which can
    # skip permission requests entirely and leave --deny-all nothing to deny.
    claude)   printf '%s\0' --config-option mode=default --config-option "effort=$(route_effort claude)" ;;
    grok-cli) printf '%s\0' --config-option "reasoning_effort=$(route_effort grok-cli)" ;;
    grok-cursor|cursor|composer) printf '%s\0' --config-option mode=ask ;;
    opencode) printf '%s\0' --config-option mode=plan ;;
  esac
  printf '%s\0' --file "$PROMPT_FILE"
}

# Accept a host-discovered replacement only for its declared target and model
# family. An override for another target is ignored rather than leaking across
# routes; an unbound or cross-family override is invalid for its own route.
# A codex id may carry the serving provider's own namespace (openai.gpt-...,
# openai/gpt-...) when the CLI routes through a non-default model_provider; the
# family segment after the namespace is still checked.
validate_model_override() {
  local route="$1" override="${CROSS_MODEL_MODEL_OVERRIDE:-}" override_target="${CROSS_MODEL_MODEL_OVERRIDE_TARGET:-}" target
  [ -n "$override" ] || { [ -z "$override_target" ]; return; }
  [ -n "$override_target" ] || return 1
  target="$(route_target "$route")" || return 1
  [ "$override_target" = "$target" ] || return 0
  [ "$target" != "cursor" ] || return 1
  case "$route:$override" in
    codex:gpt-*|codex:o[0-9]*|codex:*[./]gpt-*|codex:*[./]o[0-9]*|claude:fable|claude:opus|claude:sonnet|claude:haiku|claude:claude-*|grok-cli:grok-*|grok-cursor:grok-*|composer:composer-*|opencode:*/*) ;;
    *) return 1 ;;
  esac
}

# Accept an effort override only where the route's ACP adapter exposes an
# effort option and the value is one it advertises (claude effort:
# low|medium|high|xhigh|max; codex reasoning_effort: low|medium|high|xhigh|max|ultra;
# grok reasoning_effort: low|medium|high|xhigh). Checked 2026-10-06 against the
# session options each adapter reports through acpx 0.19.4. Codex levels vary
# per model, so a listed level can still be refused before the prompt is sent.
# Cursor routes fix effort in the model preset and OpenCode exposes no effort
# option over ACP, so any override there is invalid for the route rather than
# silently dropped. Empty means "no override".
validate_effort_override() {
  local route="$1" effort="${CROSS_MODEL_EFFORT_OVERRIDE:-}"
  [ -n "$effort" ] || return 0
  case "$route:$effort" in
    claude:low|claude:medium|claude:high|claude:xhigh|claude:max) ;;
    codex:low|codex:medium|codex:high|codex:xhigh|codex:max|codex:ultra) ;;
    grok-cli:low|grok-cli:medium|grok-cli:high|grok-cli:xhigh) ;;
    *) return 1 ;;
  esac
}

# --- --emit-adapter <route>: print the argv, no model call, no side effects --
if [ "${1:-}" = "--emit-adapter" ]; then
  PEER_WORKDIR="<peer-workdir>"
  PROMPT_FILE="<prompt-file>"; MCP_CONFIG="<mcp-config>"; CLAUDE_WRAPPER="<claude-safe-mode-wrapper>"
  HARD_SECS="${CROSS_MODEL_HARD_SECS:-1200}"
  route="${2:-}"
  validate_model_override "$route" 2>/dev/null || { echo "model override '${CROSS_MODEL_MODEL_OVERRIDE:-}' not compatible with route '$route'" >&2; exit 2; }
  validate_effort_override "$route" 2>/dev/null || { echo "effort override '${CROSS_MODEL_EFFORT_OVERRIDE:-}' not compatible with route '$route'" >&2; exit 2; }
  # adapter_argv emits NUL-delimited argv (can't be captured in a shell var), so
  # validate the route first, then render for humans with NUL -> space.
  adapter_argv "$route" >/dev/null 2>&1 || { echo "unknown route '$route' (want codex|claude|grok-cli|grok-cursor|cursor|composer|opencode)" >&2; exit 2; }
  adapter_argv "$route" | tr '\0' ' '; echo
  exit 0
fi

HOST_PROVIDER="${1:-}"
HOST_HARNESS="${CROSS_MODEL_HOST_HARNESS:-unknown}"
CANDIDATES="${2:-}"
REVIEWER_NAME="${3:-}"
DOC_PATH="${4:-}"
DOC_TYPE="${5:-}"
ORIGIN="${6:-}"
RUN_DIR="${7:-}"

# --- validate inputs -------------------------------------------------------
[ -n "$REVIEWER_NAME" ] || skip "no reviewer-name given; skipping"
[ -n "$DOC_PATH" ] && [ -f "$DOC_PATH" ] || skip "document '${DOC_PATH:-<empty>}' not readable on disk; skipping"
: "${DOC_TYPE:=unified-plan}"
: "${ORIGIN:=none}"
[ -n "$RUN_DIR" ] || skip "run-dir not given; skipping"
# Create the scratch run-dir rather than skipping when it doesn't exist yet:
# ce-doc-review (unlike ce-code-review) has no pre-existing run-artifact dir, and
# the caller passes the fresh absolute run dir resolved by the skill.
# Requiring it to pre-exist would silently no-op the whole pass (no fold-in files).
mkdir -p "$RUN_DIR" 2>/dev/null
[ -d "$RUN_DIR" ] || skip "run-dir '$RUN_DIR' could not be created; skipping"
command -v jq >/dev/null 2>&1 || skip "jq not installed; skipping"

# Validate the host identity tuple. An unknown serving family is allowed, but
# normalization marks every result non-independent.
case "$HOST_PROVIDER" in
  codex|claude|grok|composer|unknown) ;;
  *) skip "host serving family '${HOST_PROVIDER:-<empty>}' invalid (want codex|claude|grok|composer|unknown); skipping cross-model pass" ;;
esac
case "$HOST_HARNESS" in
  codex|claude|grok|cursor|opencode|unknown) ;;
  *) skip "host harness '$HOST_HARNESS' invalid (want codex|claude|grok|cursor|opencode|unknown); skipping cross-model pass" ;;
esac
[ "$HOST_PROVIDER" != "unknown" ] || skip "host serving family unattested; automatic cross-model review skipped"

# --- derive persona-brief filename from the allowlisted reviewer-name -------
# Never a caller argument -> no path-traversal / arbitrary-file-read surface.
case "$REVIEWER_NAME" in
  security-lens) PERSONA_FILE="security-lens-reviewer" ;;
  adversarial)   PERSONA_FILE="adversarial-document-reviewer" ;;
  product-lens)  PERSONA_FILE="product-lens-reviewer" ;;
  whole-doc)     PERSONA_FILE="whole-doc-reviewer" ;;   # broad whole-document sweep (R20/U9); embeds the full doc, no in-process twin
  *) skip "reviewer-name '$REVIEWER_NAME' is not a cross-model reviewer (want security-lens|adversarial|product-lens|whole-doc); skipping" ;;
esac

# --- self-locate skill root + canonical sibling files ----------------------
SKILL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)" || skip "cannot resolve skill root; skipping"
PERSONA="$SKILL_ROOT/references/personas/$PERSONA_FILE.md"
SCHEMA="$SKILL_ROOT/references/findings-schema.json"
[ -f "$PERSONA" ] || skip "persona brief not found at $PERSONA; skipping"
[ -f "$SCHEMA" ]  || skip "findings schema not found at $SCHEMA; skipping"
SCHEMA_CONTENT="$(cat "$SCHEMA")" || skip "cannot read findings schema; skipping"

# The peer adapts on the same context slots (Document type / Origin) the in-process
# reviewer does, but the trio persona briefs only define adaptation for the bare
# `requirements`/`plan` values. The canonical context-slot rules -- which map
# `unified-*` onto their base branch, carry the unified slice-suppression rules, and
# define how to read non-path Origin values -- live only in the subagent template, so
# extract them from there (single source of truth) and fold them into the peer prompt.
# Best-effort: a missing block degrades unified/Origin scoping but must not fail the pass.
TEMPLATE="$SKILL_ROOT/references/subagent-template.md"
CONTEXT_SLOT_RULES="$(awk '/<context-slots-rules>/{f=1} f; /<\/context-slots-rules>/{if(f)exit}' "$TEMPLATE" 2>/dev/null)"
[ -n "$CONTEXT_SLOT_RULES" ] || log "context-slot rules not found in $TEMPLATE; peer prompt will omit unified/Origin adaptation rules"

# The trio persona briefs defer their confidence rubric + false-positive catalog to
# the template's <output-contract> block, which every in-process reviewer receives.
# The isolated peer can't resolve that reference on its own, so embed it too --
# otherwise the peer calibrates anchors / suppresses false positives differently from
# its in-process twin, weakening the cross-model agreement signal (R13 parity).
OUTPUT_CONTRACT_RULES="$(awk '/<output-contract>/{f=1} f; /<\/output-contract>/{if(f)exit}' "$TEMPLATE" 2>/dev/null)"
[ -n "$OUTPUT_CONTRACT_RULES" ] || log "output-contract not found in $TEMPLATE; peer prompt omits the shared confidence rubric / FP catalog (calibration may differ from the twin)"

# --- resolve which provider(s) to run (exclude host, allowlist, availability) --
ALLOW="${CROSS_MODEL_PEERS:-}"                 # optional egress allowlist (R19)
MAX_PEERS="${CROSS_MODEL_MAX_PEERS:-1}"        # default 1; clamped 0..2 (hard cap)
case "$MAX_PEERS" in ''|*[!0-9]*) MAX_PEERS=1 ;; esac
[ "$MAX_PEERS" -gt 2 ] && MAX_PEERS=2

in_csv() { case ",$2," in *",$1,"*) return 0 ;; *) return 1 ;; esac; }
# Require a reviewer-shaped return (top-level `findings` array), not merely valid
# JSON: a grok error/envelope object (e.g. a 402 usage-exhausted body) is valid
# JSON but has no findings and would be dropped at normalize. Matches the
# adversarial twin's check.
out_missing_or_invalid() { [ ! -s "$RAW_OUT" ] || ! jq -e '(.findings|type)=="array"' "$RAW_OUT" >/dev/null 2>&1; }

# The cursor-agent route egresses content through Cursor even when the *model* is
# grok (grok-via-cursor-agent). CROSS_MODEL_PEERS is an egress boundary (R19), not
# just a model-provider filter, so the grok->cursor-agent transport is off-limits
# under an allowlist that does not sanction Cursor. Cursor egress is sanctioned when
# no allowlist is set, or when 'composer' (the Cursor-native provider) is allowlisted
# -- either way the user has accepted that content may reach Cursor.
cursor_egress_ok() { [ -z "$ALLOW" ] || in_csv cursor "$ALLOW" || in_csv composer "$ALLOW"; }

# Soft size gate: peer prompt embeds the full document. Over-budget docs skip
# cleanly (R11) rather than collapsing silently inside the provider context window.
MAX_DOC_CHARS="${CROSS_MODEL_MAX_DOC_CHARS:-200000}"
case "$MAX_DOC_CHARS" in ''|*[!0-9]*) MAX_DOC_CHARS=200000 ;; esac
DOC_CHARS="$(wc -c <"$DOC_PATH" | tr -d '[:space:]')"
if [ "$DOC_CHARS" -gt "$MAX_DOC_CHARS" ]; then
  skip "document is ${DOC_CHARS} bytes (limit ${MAX_DOC_CHARS}); skipping cross-model pass rather than truncating"
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

provider_available() {
  case "$1" in
    codex)    command -v codex >/dev/null 2>&1 ;;
    claude)   command -v claude >/dev/null 2>&1 ;;
    grok)     command -v grok >/dev/null 2>&1 || { cursor_egress_ok && command -v cursor-agent >/dev/null 2>&1; } ;;
    cursor)   command -v cursor-agent >/dev/null 2>&1 ;;
    composer) command -v cursor-agent >/dev/null 2>&1 ;;
    opencode) command -v opencode >/dev/null 2>&1 ;;
    *) return 1 ;;
  esac
}

# Collect the ordered list of reachable candidates (installed, allowlisted,
# non-host, deduped). Discovery reports the first MAX_PEERS; live egress uses the
# host-sanctioned fixed route's eligible target. `command -v` proves only local
# route availability; a fixed route that later fails returns to the host instead
# of changing recipients here.
# `for p in $CANDIDATES` splits the CSV once at loop start under IFS=',', so IFS
# stays comma for the whole loop; nothing in the body does IFS-sensitive splitting.
SELECTED=""   # space-separated ordered reachable candidates (bash 3.2-safe)
OLDIFS="$IFS"; IFS=','
for p in $CANDIDATES; do
  p="$(printf '%s' "$p" | tr -d '[:space:]')"
  [ -n "$p" ] || continue
  case "$p" in codex|claude|grok|cursor|composer|opencode) ;; *) log "ignoring unknown target '$p' in candidates"; continue ;; esac
  [ "$HOST_PROVIDER" != "unknown" ] && [ "$(target_serving_family "$p")" = "$HOST_PROVIDER" ] && continue
  case " $SELECTED " in *" $p "*) continue ;; esac   # dedup
  if [ -n "$ALLOW" ] && ! in_csv "$p" "$ALLOW"; then log "provider '$p' not in CROSS_MODEL_PEERS allowlist; skipping"; continue; fi
  if ! provider_available "$p"; then log "provider '$p' has no installed route; skipping"; continue; fi
  SELECTED="$SELECTED $p"
done
IFS="$OLDIFS"
SELECTED="$(printf '%s' "$SELECTED" | sed 's/^ *//')"

[ "$MAX_PEERS" -ge 1 ] || skip "CROSS_MODEL_MAX_PEERS=0; cross-model pass disabled"
[ -n "$SELECTED" ] || skip "no different-provider peer reachable (host=$HOST_PROVIDER, candidates='$CANDIDATES'); the pass needs a peer agent CLI on PATH (codex, claude, grok, cursor-agent, or opencode), not an API key alone; skipping"
log "reachable cross-model candidates for lens $REVIEWER_NAME: $SELECTED (host $HOST_PROVIDER excluded; up to $MAX_PEERS successful peer(s))"

# first_n <max> <space-separated list> -> the first <max> tokens.
first_n() {
  local max="$1"; shift; local n=0 out=""
  for t in "$@"; do [ "$n" -ge "$max" ] && break; out="$out $t"; n=$((n + 1)); done
  printf '%s' "${out# }"
}

# Diagnostic: resolve selection only, no model call, no side effects (used by the
# selection tests, which stub the route CLIs on PATH). Prints the fixed peer set
# (the first MAX_PEERS reachable candidates).
if [ -n "${CROSS_MODEL_DRY_RUN:-}" ]; then
  printf 'RESOLVED_PEERS: %s\n' "$(first_n "$MAX_PEERS" $SELECTED)"
  exit 0
fi

# --- compose the peer prompt from the canonical persona (single source) ----
# The full findings schema is embedded so the peer knows every required field.
# The document content is embedded directly inside the <review-context> block,
# with the same context slots the in-process persona adapts on. The reviewer
# field is normalized to <reviewer-name>-<provider> after the run, so the prompt
# asks only for the short name.
# Private scratch holds the prompt, the ACP stream, and the launch files. It is
# kept apart from the peer's empty working directory (created per provider).
SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/xmodel-doc-scratch-XXXXXX")" || skip "private peer scratch unavailable; skipping"
PEER_WORKDIR=""
RAW_OUT=""
cleanup_temp() {
  rm -rf "$SCRATCH"
  [ -n "$PEER_WORKDIR" ] && rm -rf "$PEER_WORKDIR"
}
trap 'cleanup_temp' EXIT
chmod 700 "$SCRATCH" 2>/dev/null || skip "cannot make peer scratch private; skipping"
PROMPT_FILE="$SCRATCH/prompt.md"
# acpx prints the ACP stream on stdout; npm and adapter diagnostics go to stderr.
PEERLOG="$SCRATCH/stdout.log"
PEERERR="$SCRATCH/stderr.log"
TEXT_OUT="$SCRATCH/reply.txt"
MCP_CONFIG="$SCRATCH/mcp.json"
printf '{"mcpServers":[]}\n' > "$MCP_CONFIG"
CLAUDE_WRAPPER=""
RUN_SUCCEEDED=false
PROVIDER_OUTCOME="failed"
# Basename only in the peer prompt: content is already embedded (KTD3). An absolute
# path would give a read-capable route a repo coordinate to walk from.
DOC_BASENAME="$(basename "$DOC_PATH")"
{
  cat "$PERSONA"
  printf '\n\n---\n\n'
  # Shared output-contract (confidence rubric + FP catalog) the persona brief defers
  # to, so the peer calibrates like its in-process twin.
  [ -n "$OUTPUT_CONTRACT_RULES" ] && printf '%s\n\n' "$OUTPUT_CONTRACT_RULES"
  printf 'This is an authorized document review of the maintainer\047s own repository.\n'
  printf 'Return ONE JSON object and nothing else (no prose, no code fence) matching this schema:\n\n'
  printf '%s' "$SCHEMA_CONTENT"
  printf '\n\nSet the top-level "reviewer" field to "%s" (it will be namespaced to the peer provider on fold-in).\n' "$REVIEWER_NAME"
  printf '\n<review-context>\n'
  printf 'Document type: %s\n' "$DOC_TYPE"
  printf 'Document path: %s\n' "$DOC_BASENAME"
  printf 'Origin: %s\n\n' "$ORIGIN"
  printf '<prior-decisions>\nRound 1 — no prior decisions.\n</prior-decisions>\n\n'
  printf 'Document content:\n'
  cat "$DOC_PATH"
  printf '\n</review-context>\n'
  [ -n "$CONTEXT_SLOT_RULES" ] && printf '\n%s\n' "$CONTEXT_SLOT_RULES"
} > "$PROMPT_FILE"
chmod 600 "$PROMPT_FILE" "$MCP_CONFIG" 2>/dev/null || skip "cannot make peer scratch files private; skipping"

# --- run machinery -----------------------------------------------------------
# Every route streams the ACP session, so the idle cap is the liveness guard and
# HARD_SECS backstops a peer that stays productive past any useful budget. acpx
# gets the same budget as --timeout, but it applies that per phase, so this
# script's wall clock stays authoritative. The idle cap must exceed the peer's
# worst-case silent turn: a slow xhigh reasoning turn (Luna p95 ~242s, max
# ~419s) can go quiet past a low cap and be reaped before it answers.
#
# HARD_SECS is the ONE knob for the whole peer budget: the runner supervisor
# window and the orchestrator's shared deadline both derive from it (see
# references/cross-model-review.md), so raising it here raises all three.
IDLE_SECS="${CROSS_MODEL_IDLE_SECS:-480}"
HARD_SECS="${CROSS_MODEL_HARD_SECS:-1200}"

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
# cross-model-adversarial-review.sh and cross-model-doc-review.sh (kernel parity).
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

resolve_python() {
  for c in python3 python py; do
    command -v "$c" >/dev/null 2>&1 && "$c" -c '' >/dev/null 2>&1 && { printf '%s\n' "$c"; return; }
  done
}

# Decode each {...} object in raw stdout via raw_decode (string/escape-aware,
# unlike brace counting) and keep the last one shaped like findings. Envelope
# routes nest that object inside a JSON *string* field, so string values that
# could hold one are re-scanned rather than skipped.
recover_findings_json() {   # <logfile> <outfile>
  local py="${PY_BIN:-}"
  [ -n "$py" ] || return 1
  "$py" - "$1" "$2" <<'PY' 2>/dev/null
import sys, json
txt = open(sys.argv[1], encoding="utf-8", errors="replace").read()
# Any selectable object carries a `findings` key; if the raw text has none,
# there is nothing to recover. Skip the scan — raw_decode probing every `{` is
# O(n^2) on brace-dense non-findings stdout (error/crash dumps). Match the bare
# word, not `"findings"`: nested inside an envelope's JSON string the key
# arrives escaped as \"findings\", which the quoted form does not match.
if 'findings' not in txt: sys.exit(0)
dec = json.JSONDecoder()
# (obj, depth) — depth>0 means recovered from inside a JSON string (envelope .text)
found = []

def scan(text, depth):
    i = 0
    while True:
        j = text.find('{', i)
        if j < 0: break
        try:
            obj, end = dec.raw_decode(text, j)
        except Exception:
            i = j + 1
            continue
        if isinstance(obj, dict):
            # structuredOutput is grok-cli's spelling of the same field.
            for cand in (obj, obj.get("structured_output"), obj.get("structuredOutput")):
                if isinstance(cand, dict) and isinstance(cand.get("findings"), list):
                    found.append((cand, depth))
            # An envelope route (grok-cli's `.text`) returns the review as a JSON
            # *string*, whose `{` were never candidates here — raw_decode consumed
            # the envelope whole and moved past it. Re-scan its strings so a
            # wrapped review is recovered instead of reported as "no usable
            # output". Unconditional: an envelope can carry its own empty
            # `findings` beside the string holding the real one. The `findings`
            # substring test bounds the nested scan's cost.
            if depth < 3:
                for v in obj.values():
                    if isinstance(v, str) and 'findings' in v:
                        scan(v, depth + 1)
        i = end

scan(txt, 0)
# Nested (string-unwrapped) candidates are the grok .text stub case: order of
# empty vs populated is not guaranteed, so prefer a populated review. Top-level
# sequential objects (codex/noisy stdout) keep last-shaped-wins — a final
# findings:[] after an earlier draft must not revive the draft.
nested = [o for o, d in found if d > 0]
top = [o for o, d in found if d == 0]
if nested:
    nested_pick = next((o for o in reversed(nested) if o["findings"]), nested[-1])
    if nested_pick["findings"]:
        best = nested_pick
    elif top:
        best = top[-1]
    else:
        best = nested_pick
elif top:
    best = top[-1]
else:
    best = None
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

# A transient provider-capacity response (HTTP 529), unlike an account or
# session quota. Claude's ACP adapter reports one its CLI could not ride out as
# the prompt's own error with data.errorKind "overloaded"; the other adapters
# retry overloads internally and have no distinct form, so they never match.
provider_overloaded() {
  [ "$PROVIDER_OUTCOME" = "overloaded" ]
}

# Run one route for a provider; leaves a schema-shaped (pre-normalization) $RAW_OUT on success.
# Success is the prompt's own end_turn result: acpx exits 5 when a permission
# request was denied even though the turn completed, and exits 0 on a cancelled one.
attempt_route() {   # <provider> <route>
  local provider="$1" route="$2" outcome reason
  : > "$PEERLOG"; : > "$PEERERR"; rm -f "$RAW_OUT" "$OUT" "$TEXT_OUT"
  RUN_SUCCEEDED=false
  PROVIDER_OUTCOME="failed"
  build_cmd "$route"
  log "peer run: provider=$provider route=$route model=$(route_model "$route") (effort $(route_effort "$route")) transport=acpx@$ACPX_VERSION lens=$REVIEWER_NAME read-only least-privilege (idle ${IDLE_SECS}s / hard ${HARD_SECS}s); full document content egresses to this provider via this route"
  run_peer_cmd
  outcome="$(acpx_outcome "$PEERLOG")"
  case "$outcome" in
    end_turn)
      RUN_SUCCEEDED=true
      PROVIDER_OUTCOME="ok"
      acpx_text "$PEERLOG" "$TEXT_OUT" && recover_findings_json "$TEXT_OUT" "$RAW_OUT"
      extract_model_receipt "$route"
      ;;
    not-sent)
      # Nothing reached the provider: npm could not fetch acpx (every route
      # fails alike), or the adapter refused before the prompt (this route only).
      reason="$(grep -m1 '^npm error' "$PEERERR" 2>/dev/null)"
      if [ -n "$reason" ]; then
        PRE_EGRESS="transport unavailable (pre-egress, shared): ${reason:0:200}"
      else
        reason="$(acpx_failure_evidence "$PEERLOG")"
        PRE_EGRESS="transport unavailable (pre-egress, route): ${reason:-acpx exited $PEER_EXIT before sending the prompt}"
      fi
      ;;
    *)
      if [ "$outcome" = error ] && jq -eR 'fromjson? | select(.error.data.errorKind? == "overloaded")' "$PEERLOG" >/dev/null 2>&1; then
        PROVIDER_OUTCOME="overloaded"
      fi
      log "peer run ended with $outcome (acpx exit $PEER_EXIT)"
      ;;
  esac
}

# Run one host-resolved provider through its fixed route.
run_provider() {   # <provider>
  local provider="$1" primary="" fixed="${CROSS_MODEL_FIXED_ROUTE:-}"
  local provider_deadline remaining
  OUT="$RUN_DIR/$REVIEWER_NAME-$provider.json"
  RAW_OUT="$SCRATCH/$REVIEWER_NAME-$provider.raw.json"
  [ -n "$fixed" ] || { log "host must resolve one fixed route before egress; skipping"; rm -f "$OUT"; return 0; }
  [ "$(route_target "$fixed")" = "$provider" ] || { log "fixed route '$fixed' does not match target '$provider'; skipping"; rm -f "$OUT"; return 0; }
  if [ "$fixed" = "grok-cursor" ] && ! cursor_egress_ok; then
    log "fixed route 'grok-cursor' requires Cursor intermediary sanction; skipping"
    rm -f "$OUT"
    return 0
  fi
  primary="$fixed"
  PY_BIN="$(resolve_python)"
  [ -n "$PY_BIN" ] || { log "working Python 3 interpreter required to recover peer findings; skipping"; rm -f "$OUT"; return 0; }
  validate_model_override "$primary" || { log "model override '${CROSS_MODEL_MODEL_OVERRIDE:-}' not compatible with route '$primary'; skipping"; rm -f "$OUT"; return 0; }
  validate_effort_override "$primary" || { log "effort override '${CROSS_MODEL_EFFORT_OVERRIDE:-}' not compatible with route '$primary'; skipping"; rm -f "$OUT"; return 0; }
  case "$HARD_SECS" in
    ''|0*|*[!0-9]*) log "peer hard budget must be a positive integer; skipping"; rm -f "$OUT"; return 0 ;;
  esac
  # Per-peer empty workspace, kept SEPARATE from the shared fold-in dir (RUN_DIR)
  # and from private scratch: it is the peer's working directory, so a peer has
  # no path handle to RUN_DIR or to another lens's published artifact from it.
  PEER_WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/xmodel-doc-peer-XXXXXX")" || { PEER_WORKDIR=""; log "provider $provider workspace isolation unavailable; skipping"; rm -f "$OUT"; return 0; }
  acpx_preflight "$primary" "$PEER_WORKDIR" || { log "transport unavailable (pre-egress, $ACPX_SCOPE): $ACPX_UNAVAILABLE"; rm -f "$OUT"; return 0; }
  if [ "$primary" = claude ]; then
    CLAUDE_WRAPPER="$(acpx_claude_wrapper "$SCRATCH")" || { log "transport unavailable (pre-egress, route): cannot prepare the Claude --safe-mode launcher"; rm -f "$OUT"; return 0; }
  fi
  # Track the route that actually produced the fold-in, so the artifact records
  # whether a grok return went out directly (grok-cli -> xAI) or through Cursor
  # (grok-cursor -> Cursor also received the full document). The <lens>-<provider>
  # filename alone cannot encode that intermediary.
  ACTUAL_ROUTE="$primary"
  provider_deadline=$(( $(date +%s) + HARD_SECS ))
  PRE_EGRESS=""
  attempt_route "$provider" "$primary"
  if [ -n "$PRE_EGRESS" ]; then
    log "$PRE_EGRESS"
    rm -f "$OUT"
    return 0
  fi
  if [ ! -s "$RAW_OUT" ] && provider_overloaded; then
    remaining=$(( provider_deadline - $(date +%s) ))
    if [ "$remaining" -le "$TRANSIENT_RETRY_DELAY_SECS" ]; then
      log "provider overload 529; shared peer budget spent, not retrying"
    else
      log "provider overload 529; retrying same route once after ${TRANSIENT_RETRY_DELAY_SECS}s"
      sleep "$TRANSIENT_RETRY_DELAY_SECS"
      remaining=$(( provider_deadline - $(date +%s) ))
      if [ "$remaining" -gt 0 ]; then
        HARD_SECS="$remaining"
        attempt_route "$provider" "$primary"
        [ -z "$PRE_EGRESS" ] || log "$PRE_EGRESS"
      fi
    fi
  fi

  # --- normalize + validate against the synthesis reviewer-return contract ---
  # Force reviewer = <reviewer-name>-<provider>; backfill soft arrays; drop the
  # file if findings is not an array. Peer findings fold in as a corroboration
  # signal only -- synthesis (references/synthesis-and-presentation.md) never
  # auto-applies them and caps the cross-model bonus at one anchor step.
  # Downgrade any peer finding's autofix_class from safe_auto to gated_auto: R18
  # forbids a peer from granting silent-apply authority, and enforcing it here (not
  # only in synthesis prose) means a peer cannot self-authorize a Phase 4 auto-apply
  # regardless of what it returns. gated_auto preserves the peer's proposed fix but
  # routes it through user confirmation.
  # Publish ONLY the normalized OUT into RUN_DIR. RAW_OUT lives in private scratch
  # and is never a fold-in artifact — if this script dies before normalize
  # (orphaned launch), synthesis finds no .json in RUN_DIR.
  rm -f "$OUT"
  if [ "$RUN_SUCCEEDED" = true ] && [ -s "$RAW_OUT" ]; then
    _norm="$SCRATCH/normalized.json"
    case "$ACTUAL_ROUTE:$MODEL_ACTUAL" in
      cursor:*) _target_family="unknown" ;;
      composer:unverified|grok-cursor:unverified) _target_family="unknown" ;;
      *) _target_family="$(target_serving_family "$provider")" ;;
    esac
    _independent=false
    [ "$HOST_PROVIDER" != "unknown" ] && [ "$_target_family" != "unknown" ] && [ "$HOST_PROVIDER" != "$_target_family" ] && _independent=true
    if jq --arg r "$REVIEWER_NAME-$provider" --arg route "$ACTUAL_ROUTE" \
         --arg target "$provider" --arg harness "$(route_harness "$ACTUAL_ROUTE")" \
         --arg family "$_target_family" --argjson independent "$_independent" \
         --arg mreq "$(route_model "$ACTUAL_ROUTE")" --arg mact "$MODEL_ACTUAL" \
         --arg ereq "$(route_effort "$ACTUAL_ROUTE")" \
         'if (.findings|type)=="array"
          then { reviewer: $r,
                 cross_model_route: $route,
                 cross_model_target: $target,
                 cross_model_harness: $harness,
                 serving_family: $family,
                 independence_verified: $independent,
                 model_requested: $mreq,
                 model_actual: $mact,
                 effort_requested: $ereq,
                 findings: [ .findings[] | if (.autofix_class? == "safe_auto") then .autofix_class = "gated_auto" else . end ],
                 residual_risks: (.residual_risks // []),
                 deferred_questions: (.deferred_questions // []) }
          else empty end' \
         "$RAW_OUT" > "$_norm" 2>/dev/null; then
      mv "$_norm" "$OUT"
    else
      rm -f "$_norm"
    fi
    rm -f "$RAW_OUT"
  fi
  if [ -s "$OUT" ] && jq -e '(.reviewer|type=="string") and (.findings|type=="array") and (.residual_risks|type=="array") and (.deferred_questions|type=="array")' "$OUT" >/dev/null 2>&1; then
    n="$(jq '.findings | length' "$OUT" 2>/dev/null || echo '?')"
    log "wrote $n finding(s) to $OUT (reviewer $REVIEWER_NAME-$provider)"
  else
    log "provider $provider produced no usable schema-shaped output; skipping fold-in"
    # Surface bounded peer output so the orchestrator can
    # reason about WHY it was skipped (quota/usage-limit exhaustion vs an ordinary
    # empty review) and, in a repeated-pass session, deprioritize an exhausted
    # route. Harness-agnostic: the agent classifies from the text; this only makes
    # the evidence visible in out.log. Provider errors arrive as ACP error
    # messages on stdout; npm and adapter diagnostics on stderr.
    _pt="$(acpx_failure_evidence "$PEERLOG")"
    [ -n "$_pt" ] && log "  peer skip evidence: $_pt"
    if [ -s "$PEERERR" ]; then
      _pe="$(bounded_failure_evidence "$PEERERR")"
      log "  peer skip evidence (stderr): $_pe"
    fi
    rm -f "$OUT" "$RAW_OUT"
  fi
  # Tear down the per-peer workspace (never RUN_DIR, which holds the published OUT).
  [ -n "$PEER_WORKDIR" ] && rm -rf "$PEER_WORKDIR"
  PEER_WORKDIR=""
}

# --- run the host-sanctioned fixed target -----------------------------------
# Discovery preserves caller order and MAX_PEERS, but live egress is already
# frozen to one route. Dispatch that route's target directly so a later eligible
# candidate is not discarded by the discovery-order cap. run_provider never
# changes recipients after dispatch.
FIXED_TARGET="$(route_target "${CROSS_MODEL_FIXED_ROUTE:-}")"
if [ -n "$FIXED_TARGET" ]; then
  case " $SELECTED " in
    *" $FIXED_TARGET "*) run_provider "$FIXED_TARGET" ;;
    *) log "fixed route '${CROSS_MODEL_FIXED_ROUTE:-}' target '$FIXED_TARGET' is not an eligible reachable candidate; skipping" ;;
  esac
else
  log "host must resolve one fixed route before egress; skipping"
fi
exit 0
