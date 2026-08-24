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
# its dedicated CLI, or (for fixed grok-cursor / composer routes) cursor-agent. All
# activated lenses run on ONE model per provider at high reasoning, except codex
# on extra-high; composer's -fast tier is its ceiling (accepted exceptions).
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
#     codex | claude | grok-cli | grok-cursor | composer). Both this mode and the
#     live run build their argv from adapter_argv(), so the U7 route-safety test
#     asserts on the same command string the peer actually runs.
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
# codex process group can still write raw `-o` JSON while this script dies
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
# ONE model per provider at high reasoning, except codex on extra-high (supersedes
# the old per-lens sol/terra split). Concrete IDs are the CURRENT instance of the
# tier principle and the single maintenance point when model families change.
# A checkout may override the model (CROSS_MODEL_MODEL_OVERRIDE_TARGET +
# CROSS_MODEL_MODEL_OVERRIDE, same target/family only) and the reasoning effort
# (CROSS_MODEL_EFFORT_OVERRIDE, validated per route); both fail closed.
# codex: luna/xhigh is the benchmarked pick on API dollars (~0.30x sol-medium, tied
# detection, slower tail) -- docs/solutions/skill-design/benchmark-review-peer-model-and-reasoning-tier.md
M_CODEX="gpt-5.6-luna"         # codex CLI            (-c model_reasoning_effort="xhigh")
M_CLAUDE="claude-opus-5"       # claude CLI, Opus 5   (--effort high)
M_GROK="grok-4.6"              # grok CLI             (--effort high)
M_GROK_CURSOR="cursor-grok-4.6-high"  # fixed cursor-agent Grok route (current id)
M_COMPOSER="composer-2.5-fast" # cursor-agent composer (no high tier; -fast is the ceiling)

route_effort() {   # <route> -> requested effort: the override where the route takes one, else editorial
  if [ -n "${CROSS_MODEL_EFFORT_OVERRIDE:-}" ]; then
    case "$1" in codex|claude|grok-cli) printf '%s' "$CROSS_MODEL_EFFORT_OVERRIDE"; return 0 ;; esac
  fi
  case "$1" in
    codex) printf 'xhigh' ;;
    claude|grok-cli) printf 'high' ;;
    grok-cursor) printf 'model-implied-high' ;;
    composer) printf 'fast' ;;
    cursor) printf 'unverified' ;;
  esac
}

# --- model-identity receipt (R7/R8) -----------------------------------------
# "Which model ran" is a claim that needs a serving-side receipt. Only the
# claude CLI reports one today: its JSON envelope carries a modelUsage object
# keyed by the full dated id that actually served the run. Match requested vs
# actual by expected family prefix, delimited on "-": the served id must equal
# the prefix or continue it with "-" (alias or undated id -> dated id counts
# as a match; a longer sibling such as claude-opus-50-* does not; never
# substring). Every other route records the literal
# "unverified" — never a fallback to the requested value. Keep this block byte-identical across
# ce-code-review and ce-doc-review (kernel parity).
expected_model_prefix() {   # <requested-alias-or-id> -> expected served-id family prefix
  case "$1" in
    fable)    printf 'claude-fable' ;;
    opus)     printf 'claude-opus' ;;
    sonnet)   printf 'claude-sonnet' ;;
    haiku)    printf 'claude-haiku' ;;
    claude-*) printf '%s' "$1" ;;
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
  local requested actual prefix matched envelope
  requested="$(route_model claude)"
  prefix="$(expected_model_prefix "$requested")"
  # stream-json is NDJSON: modelUsage lives on the terminal type=result event
  # (same pattern as elevation-dispatch). Buffered --output-format json is one
  # object — whole-file jq still works when no result event exists.
  envelope="$(grep -a '"type":"result"' "$PEERLOG" 2>/dev/null | tail -1 || true)"
  # jq `keys` is sorted, so keys[0] is the alphabetically-first model, not
  # necessarily the one that served the run (a multi-key envelope can also carry
  # an auxiliary model's usage). Prefer a key matching the requested family's
  # expected prefix; fall back to the first key only when none matches, and warn
  # only then. A missing/unparseable envelope stays "unverified" (never the
  # requested value).
  matched=""
  if [ -n "$prefix" ]; then
    # first modelUsage key equal to, or delimited under, the expected prefix
    # (jq-native, no external `head`: the route sandbox may not carry coreutils
    # on PATH).
    if [ -n "$envelope" ]; then
      matched="$(printf '%s' "$envelope" | jq -r --arg p "$prefix" 'first((.modelUsage // {} | keys[] | select(. == $p or startswith($p + "-")))) // empty' 2>/dev/null)"
    else
      matched="$(jq -r --arg p "$prefix" 'first((.modelUsage // {} | keys[] | select(. == $p or startswith($p + "-")))) // empty' "$PEERLOG" 2>/dev/null)"
    fi
  fi
  if [ -n "$matched" ]; then
    MODEL_ACTUAL="$matched"
    return 0
  fi
  if [ -n "$envelope" ]; then
    actual="$(printf '%s' "$envelope" | jq -r '.modelUsage // empty | keys[0] // empty' 2>/dev/null)"
  else
    actual="$(jq -r '.modelUsage // empty | keys[0] // empty' "$PEERLOG" 2>/dev/null)"
  fi
  if [ -z "$actual" ]; then
    log "model receipt absent/unparseable on claude route; recording unverified"
    return 0
  fi
  MODEL_ACTUAL="$actual"
  log "WARNING: model mismatch - requested $requested, backend served $actual; reconcile must surface this"
}

# --- adapter argv (single source of truth for route flags) -----------------
# Emits the CLI + flags one token per line. Read-only, no-prompt, least-privilege
# (tool-less on claude/grok; read-only residual on codex/cursor-agent), and
# codex xhigh + others high reasoning per R17. PEER_WORKDIR / RAW_OUT / PROMPT_FILE / SCHEMA_REF are
# resolved by the caller (placeholders in --emit-adapter mode); PEER_WORKDIR is the
# per-peer empty cwd/workspace, kept separate from the shared fold-in dir RUN_DIR.
# Peer routes write to RAW_OUT only; the final fold-in file (OUT) is published after normalize so an orphaned
# peer process cannot leave an un-normalized return. NEVER emit: codex without
# `-s read-only`; grok `--always-approve` / `--permission-mode bypassPermissions`;
# cursor-agent `-f` / `--force` / `--yolo`.
adapter_argv() {
  case "$1" in
    codex)
      printf '%s\0' codex exec - -C "$PEER_WORKDIR" --skip-git-repo-check -s read-only \
        -o "$RAW_OUT" -m "$(route_model codex)" -c "model_reasoning_effort=\"$(route_effort codex)\"" -c 'hide_agent_reasoning=false'
      ;;
    claude)
      # --tools "" disables ALL built-in tools (allowlist deny-all, no denylist gap
      # like Glob/Grep); --safe-mode suppresses hooks, MCP, plugins, and other
      # custom behavior without bypassing Claude Code's normal OAuth/keychain auth.
      # The run cd's into the empty per-peer workspace (claude has no cwd flag), so
      # the peer has no repo -- or sibling peer's fold-in artifact -- in reach.
      # R17 tool-less isolation.
      # stream-json + --verbose for PEERLOG idle (#1270); schema still composes.
      printf '%s\0' claude -p --model "$(route_model claude)" --effort "$(route_effort claude)" --permission-mode dontAsk \
        --safe-mode --disable-slash-commands --tools "" \
        --max-turns 15 --no-session-persistence --json-schema "$SCHEMA_REF" \
        --output-format stream-json --verbose
      ;;
    grok-cli)
      # Schema forces buffered json — hard-only, no PEERLOG idle (#1270).
      # --verbatim: without it grok offloads a large prompt to a session file and
      # sends only a preview — unrecoverable here, because Read is denied below.
      printf '%s\0' grok --prompt-file "$PROMPT_FILE" --verbatim --model "$(route_model grok-cli)" --effort "$(route_effort grok-cli)" \
        --cwd "$PEER_WORKDIR" --permission-mode dontAsk \
        --deny Read --deny Edit --deny Write --deny Bash --deny Task --deny 'mcp__*' \
        --disable-web-search --no-subagents --max-turns 15 \
        --json-schema "$SCHEMA_REF" --output-format json
      ;;
    grok-cursor)
      printf '%s\0' cursor-agent -p --model "$(route_model grok-cursor)" --mode ask --trust \
        --sandbox enabled --workspace "$PEER_WORKDIR" --output-format stream-json
      ;;
    cursor)
      printf '%s\0' cursor-agent -p --mode ask --trust \
        --sandbox enabled --workspace "$PEER_WORKDIR" --output-format stream-json
      ;;
    composer)
      printf '%s\0' cursor-agent -p --model "$(route_model composer)" --mode ask --trust \
        --sandbox enabled --workspace "$PEER_WORKDIR" --output-format stream-json
      ;;
    *) return 1 ;;
  esac
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
    codex:gpt-*|codex:o[0-9]*|codex:*[./]gpt-*|codex:*[./]o[0-9]*|claude:fable|claude:opus|claude:sonnet|claude:haiku|claude:claude-*|grok-cli:grok-*|grok-cursor:cursor-grok-*|composer:composer-*) ;;
    *) return 1 ;;
  esac
}

# Accept an effort override only where the route exposes an effort flag and the
# value is one that CLI documents (claude: low|medium|high|xhigh|max; codex
# model_reasoning_effort: minimal|low|medium|high|xhigh; grok: low|medium|high).
# cursor-agent routes imply effort in the model id, so any override there is
# invalid for the route rather than silently dropped. Empty means "no override".
validate_effort_override() {
  local route="$1" effort="${CROSS_MODEL_EFFORT_OVERRIDE:-}"
  [ -n "$effort" ] || return 0
  case "$route:$effort" in
    claude:low|claude:medium|claude:high|claude:xhigh|claude:max) ;;
    codex:minimal|codex:low|codex:medium|codex:high|codex:xhigh) ;;
    grok-cli:low|grok-cli:medium|grok-cli:high) ;;
    *) return 1 ;;
  esac
}

# --- --emit-adapter <route>: print the argv, no model call, no side effects --
if [ "${1:-}" = "--emit-adapter" ]; then
  RUN_DIR="<run-dir>"; PEER_WORKDIR="<peer-workdir>"
  RAW_OUT="<peer-workdir>/<lens>-<provider>.raw.json"
  OUT="<run-dir>/<lens>-<provider>.json"
  PROMPT_FILE="<prompt-file>"; SCHEMA_REF="<schema>"
  route="${2:-}"
  validate_model_override "$route" 2>/dev/null || { echo "model override '${CROSS_MODEL_MODEL_OVERRIDE:-}' not compatible with route '$route'" >&2; exit 2; }
  validate_effort_override "$route" 2>/dev/null || { echo "effort override '${CROSS_MODEL_EFFORT_OVERRIDE:-}' not compatible with route '$route'" >&2; exit 2; }
  # adapter_argv emits NUL-delimited argv (can't be captured in a shell var), so
  # validate the route first, then render for humans with NUL -> space.
  adapter_argv "$route" >/dev/null 2>&1 || { echo "unknown route '$route' (want codex|claude|grok-cli|grok-cursor|cursor|composer)" >&2; exit 2; }
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
  codex|claude|grok|cursor|unknown) ;;
  *) skip "host harness '$HOST_HARNESS' invalid (want codex|claude|grok|cursor|unknown); skipping cross-model pass" ;;
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
SCHEMA_REF="$SCHEMA_CONTENT"   # adapter_argv references SCHEMA_REF for --json-schema routes

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
  case "$p" in codex|claude|grok|cursor|composer) ;; *) log "ignoring unknown target '$p' in candidates"; continue ;; esac
  [ "$HOST_PROVIDER" != "unknown" ] && [ "$(target_serving_family "$p")" = "$HOST_PROVIDER" ] && continue
  case " $SELECTED " in *" $p "*) continue ;; esac   # dedup
  if [ -n "$ALLOW" ] && ! in_csv "$p" "$ALLOW"; then log "provider '$p' not in CROSS_MODEL_PEERS allowlist; skipping"; continue; fi
  if ! provider_available "$p"; then log "provider '$p' has no installed route; skipping"; continue; fi
  SELECTED="$SELECTED $p"
done
IFS="$OLDIFS"
SELECTED="$(printf '%s' "$SELECTED" | sed 's/^ *//')"

[ "$MAX_PEERS" -ge 1 ] || skip "CROSS_MODEL_MAX_PEERS=0; cross-model pass disabled"
[ -n "$SELECTED" ] || skip "no different-provider peer reachable (host=$HOST_PROVIDER, candidates='$CANDIDATES'); the pass needs a peer agent CLI on PATH (codex, claude, grok, or cursor-agent), not an API key alone; skipping"
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
PROMPT_FILE="$(mktemp "${TMPDIR:-/tmp}/xmodel-doc-prompt-XXXXXX")"
PEERLOG="$(mktemp "${TMPDIR:-/tmp}/xmodel-doc-log-XXXXXX")"
# Peer stderr goes to its own file, NOT merged into PEERLOG: PEERLOG must stay
# clean stdout for the findings raw_decode scan and the receipt jq-parse. An
# auth/quota/rate-limit message often lands on stderr, so capture it separately
# and surface it in the skip evidence (grok's 402 is on stdout, others on stderr).
PEERERR="$(mktemp "${TMPDIR:-/tmp}/xmodel-doc-err-XXXXXX")"
PEER_WORKDIR=""
RAW_OUT=""
RUN_SUCCEEDED=false
PROVIDER_OUTCOME="ok"
cleanup_temp() {
  rm -f "$PROMPT_FILE" "$PEERLOG" "$PEERERR"
  [ -n "$RAW_OUT" ] && rm -f "$RAW_OUT"
  [ -n "$PEER_WORKDIR" ] && [ "$PEER_WORKDIR" != "${RUN_DIR:-}" ] && rm -rf "$PEER_WORKDIR"
}
trap 'cleanup_temp' EXIT
# Basename only in the peer prompt: content is already embedded (KTD3). An absolute
# path would give cursor-agent residual-Read a repo coordinate to walk from.
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

# --- run machinery: idle-timeout for streaming peers, hard-only for grok-cli --
# Idle cap must exceed the peer's worst-case silent turn: Codex --json is
# event-line (not token) output, so a slow xhigh reasoning turn (Luna p95 ~242s,
# max ~419s) can go quiet past a low cap and be reaped before turn.completed.
#
# On idle-guarded routes the idle cap -- not the hard cap -- is the liveness
# guard. Claude/cursor-agent stream (`stream-json`) so run_timeout_cmd polls
# PEERLOG (#1270). grok-cli keeps --json-schema (buffered) and stays on
# UNGUARDED_HARD_SECS hard-only. An explicit CROSS_MODEL_HARD_SECS still
# overrides both defaults.
#
# HARD_SECS is the ONE knob for the whole peer budget: the runner supervisor
# window and the orchestrator's shared deadline both derive from it (see
# references/cross-model-review.md), so raising it here raises all three. A
# smaller effective worker cap on an unguarded route keeps that nesting valid --
# the inner window may be tighter, never wider. Keep this block in sync with
# ce-code-review's script (parity-tested in CI).
IDLE_SECS="${CROSS_MODEL_IDLE_SECS:-480}"
HARD_SECS="${CROSS_MODEL_HARD_SECS:-1200}"
UNGUARDED_HARD_SECS="${CROSS_MODEL_HARD_SECS:-600}"
TO_BIN="$(command -v gtimeout || command -v timeout || true)"

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
  # wait()s the leader so RUN_SUCCEEDED reflects the real exit status — a second
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

run_codex_cmd() {   # CMD already built for the codex route; streams to PEERLOG, writes -o RAW_OUT
  RUN_SUCCEEDED=false
  local hard_cap="${1:-$HARD_SECS}"
  local prev; case "$-" in *m*) prev=1;; *) prev=0;; esac
  set -m
  "${CMD[@]}" < "$PROMPT_FILE" > "$PEERLOG" 2>&1 &
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
      log "codex output idle ${IDLE_SECS}s; reaping peer process group"; reap "$pid"; break
    fi
    if [ $(( now - start )) -ge "$hard_cap" ]; then
      log "codex exceeded hard cap ${hard_cap}s; reaping peer process group"; reap "$pid"; break
    fi
    # 1s slices so a finished peer is noticed promptly (was sleep-5-first, which
    # added up to 5s after every short stub / healthy exit).
    sleep 1
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

run_timeout_cmd() {
  # $1 = stdin file ("" -> /dev/null). $2 = hard cap secs. $3 = "idle" | "no-idle".
  RUN_SUCCEEDED=false
  # Run from the empty per-peer workspace (absolute stdin/PEERLOG paths are
  # unaffected) so a tool-capable peer -- notably claude, which has no cwd flag --
  # has no repo files, and no sibling lens's fold-in artifact, in reach. grok/cursor
  # also carry their own --cwd/--workspace flag pointed at the same PEER_WORKDIR.
  local stdin_file="${1:-}"; [ -n "$stdin_file" ] || stdin_file=/dev/null
  local hard_cap="${2:-$HARD_SECS}"
  local idle_mode="${3:-idle}"
  local prev; case "$-" in *m*) prev=1;; *) prev=0;; esac
  set -m
  if [ "$idle_mode" = "idle" ]; then
    ( cd "$PEER_WORKDIR" && exec "${CMD[@]}" ) < "$stdin_file" > "$PEERLOG" 2>"$PEERERR" &
  elif [ -n "$TO_BIN" ]; then
    ( cd "$PEER_WORKDIR" && exec "$TO_BIN" -k 10 "$hard_cap" "${CMD[@]}" ) < "$stdin_file" > "$PEERLOG" 2>"$PEERERR" &
  else
    ( cd "$PEER_WORKDIR" && exec perl -e 'alarm shift; exec @ARGV' "$hard_cap" "${CMD[@]}" ) < "$stdin_file" > "$PEERLOG" 2>"$PEERERR" &
  fi
  local pid=$!
  ACTIVE_PEER_PID="$pid"
  [ "$prev" = 0 ] && set +m
  start_heartbeat
  if [ "$idle_mode" = "idle" ]; then
    local start last=-1 lastchg now size
    start="$(date +%s)"; lastchg="$start"
    while peer_alive "$pid"; do
      now="$(date +%s)"; size="$(wc -c <"$PEERLOG" 2>/dev/null || echo 0)"
      [ "$size" != "$last" ] && { last="$size"; lastchg="$now"; }
      if [ $(( now - lastchg )) -ge "$IDLE_SECS" ]; then
        log "peer output idle ${IDLE_SECS}s; reaping peer process group"; reap "$pid"; break
      fi
      if [ $(( now - start )) -ge "$hard_cap" ]; then
        log "peer exceeded hard cap ${hard_cap}s; reaping peer process group"; reap "$pid"; break
      fi
      sleep 1
    done
  fi
  if wait "$pid" 2>/dev/null; then RUN_SUCCEEDED=true
  else log "peer exited non-zero or timed out"; fi
  reap "$pid" 2>/dev/null || true   # sweep survivors in the provider's own group (see run_codex_cmd)
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

classify_provider_outcome() {
  local py="${PY_BIN:-}"
  [ -n "$py" ] || { printf '%s\n' failed; return; }
  "$py" - "$PEERLOG" "$PEERERR" "${ACTUAL_ROUTE:-}" <<'PY' 2>/dev/null
import json, re, sys

decoder = json.JSONDecoder()

def scan(text):
    objects, plain = [], []
    cursor = search = 0
    while True:
        start = text.find("{", search)
        if start < 0:
            break
        try:
            value, end = decoder.raw_decode(text, start)
        except Exception:
            search = start + 1
            continue
        if isinstance(value, dict):
            plain.extend((text[cursor:start], "\n"))
            objects.append(value)
            cursor = end
        search = max(end, start + 1)
    plain.append(text[cursor:])
    return objects, "".join(plain)

texts = []
object_streams = []
route = sys.argv[3]
for path in sys.argv[1:3]:
    try:
        text = open(path, encoding="utf-8", errors="replace").read()
    except OSError:
        text = ""
    found, plain = scan(text)
    texts.append(plain)
    object_streams.append(found)

def status(value):
    error = value.get("error")
    nested = error if isinstance(error, dict) else {}
    for candidate in (
        value.get("api_error_status"), value.get("http_status"), value.get("status"),
        nested.get("api_error_status"), nested.get("http_status"), nested.get("status"),
    ):
        if candidate is not None:
            return candidate
    return None

same_line = re.compile(r"(?:^|\W)(?:API Error|HTTP(?: Error)?)[^\r\n]*?529(?:\D|$)[^\r\n]*?(?:overload|capacity)", re.I)
split_head = re.compile(r"(?:^|\W)(?:API Error|HTTP(?: Error)?)[^\r\n]*?529(?:\D|$)", re.I)
split_tail = re.compile(r"^\s*[^\w]*(?:overload|capacity)", re.I)

def overload_text(text):
    lines = text.splitlines()
    return any(same_line.search(line) for line in lines) or any(split_head.search(line) and split_tail.search(lines[index + 1]) for index, line in enumerate(lines[:-1]))

def provider_error_text(value):
    error = value.get("error")
    if isinstance(error, dict):
        message = error.get("message", "")
    elif isinstance(error, str):
        message = error
    elif value.get("type") == "error" or value.get("is_error") is True:
        message = value.get("message", "")
    else:
        message = ""
    return message if isinstance(message, str) else ""

def route_terminal_success(value):
    if route == "codex":
        return {"turn.completed": True, "turn.failed": False}.get(value.get("type"))
    return None

def terminal_record(value):
    error = value.get("error")
    return route_terminal_success(value) is not None or value.get("type") in {"result", "error"} or error not in (None, False, "") or status(value) is not None or any(key in value for key in ("is_error", "terminal_reason", "stopReason", "api_error_status"))

def terminal_success(value):
    route_success = route_terminal_success(value)
    if route_success is not None:
        return route_success
    subtype = str(value.get("subtype", ""))
    terminal_reason = str(value.get("terminal_reason", ""))
    stop_reason = str(value.get("stopReason", ""))
    if value.get("is_error") is True or value.get("error") not in (None, False, ""):
        return False
    terminal_status = status(value)
    if terminal_status is not None:
        try:
            status_ok = 200 <= int(terminal_status) < 300
        except (TypeError, ValueError):
            status_ok = str(terminal_status).lower() in {"ok", "success", "completed"}
        if not status_ok:
            return False
    if "stopReason" in value and stop_reason not in {"end_turn", "completed", "success"}:
        return False
    if "terminal_reason" in value and terminal_reason not in {"end_turn", "completed", "success"}:
        return False
    if "api_error_status" in value:
        if value.get("api_error_status") is not None or value.get("is_error") is not False:
            return False
    if value.get("type") == "result":
        if subtype:
            return subtype == "success"
        return route in {"grok-cursor", "cursor", "composer"}
    if "stopReason" in value or "terminal_reason" in value or terminal_status is not None or "api_error_status" in value:
        return True
    return value.get("is_error") is False

terminal_streams = [[value for value in stream if terminal_record(value)] for stream in object_streams]
authoritative = next((stream[-1] for stream in terminal_streams if stream), None)
if authoritative is not None:
    if terminal_success(authoritative):
        print("ok")
    elif str(status(authoritative)) == "529" or overload_text(provider_error_text(authoritative)):
        print("overloaded")
    else:
        print("failed")
    raise SystemExit

if any(overload_text(plain) for plain in texts):
    print("overloaded")
else:
    print("ok")
PY
}

classify_route_output() {
  PROVIDER_OUTCOME="$(classify_provider_outcome)"
  case "$PROVIDER_OUTCOME" in
    ok) ;;
    overloaded) RUN_SUCCEEDED=false; rm -f "$RAW_OUT" ;;
    *) log "peer terminal envelope reports failure; discarding structured output"; RUN_SUCCEEDED=false; rm -f "$RAW_OUT" ;;
  esac
}

# Parse a schema-shaped object out of a headless CLI JSON envelope (claude/grok/cursor).
parse_structured() {   # <logfile> <outfile>
  # Buffered single-object envelopes (grok-cli json, test stubs).
  jq -e '.structured_output' "$1" > "$2" 2>/dev/null && return 0
  jq -r '.result // empty' "$1" 2>/dev/null | jq -e '.' > "$2" 2>/dev/null && return 0
  # grok-cli names its parsed structured output in camelCase, so the snake_case
  # probe above never matches it and a complete review looks like no output.
  # Prefer a populated object first: an empty findings array is schema-valid, so
  # accepting it here would skip .text when the real review only lives there
  # (empty schema stub + populated .text).
  jq -e '.structuredOutput | select((.findings|type)=="array" and (.findings|length)>0)' "$1" > "$2" 2>/dev/null && return 0
  # Envelopes that carry the model's answer verbatim in a string (grok-cli `.text`).
  # Slurp it: grok emits an empty stub beside the real object, and an unslurped jq
  # streams BOTH into $2 as unparseable concatenated JSON. Shape-filter the stream
  # too — taking a bare `last` can hand back a trailing non-findings object, which
  # short-circuits recovery and drops a review that was sitting right there. Order
  # is not guaranteed, so prefer a populated review over an empty one.
  jq -r '.text // empty' "$1" 2>/dev/null | jq -se '[.[] | select((.findings|type)=="array")] | ([.[] | select(.findings|length>0)] | last) // last | select(. != null)' > "$2" 2>/dev/null && return 0
  # Empty-but-shaped structuredOutput is a legitimate "peer found nothing" only
  # after .text had nothing better.
  jq -e '.structuredOutput | select((.findings|type)=="array")' "$1" > "$2" 2>/dev/null && return 0
  # stream-json NDJSON: last type=result event (elevation-dispatch pattern).
  local event
  event="$(grep -a '"type":"result"' "$1" 2>/dev/null | tail -1 || true)"
  if [ -n "$event" ]; then
    printf '%s' "$event" | jq -e '.structured_output' > "$2" 2>/dev/null && return 0
    printf '%s' "$event" | jq -r '.result // empty' 2>/dev/null | jq -e '.' > "$2" 2>/dev/null && return 0
  fi
  recover_findings_json "$1" "$2"
}

# Run one route for a provider; leaves a schema-shaped (pre-normalization) $RAW_OUT on success.
attempt_route() {   # <provider> <route>
  local provider="$1" route="$2" note
  local attempt_hard="${ATTEMPT_HARD_SECS:-}"
  [ -n "$attempt_hard" ] || attempt_hard="$(route_hard_budget "$route")"
  PROVIDER_OUTCOME="ok"
  : > "$PEERLOG"; : > "$PEERERR"; rm -f "$RAW_OUT" "$OUT"
  build_cmd "$route"
  case "$route" in
    codex|claude|grok-cli) note="$(route_model "$route") (effort $(route_effort "$route"))" ;;
    grok-cursor|composer)  note="$(route_model "$route")" ;;
    cursor)                note="auto (serving model unverified)" ;;
  esac
  log "peer run: provider=$provider route=$route model=$note lens=$REVIEWER_NAME read-only least-privilege (idle ${IDLE_SECS}s / attempt hard ${attempt_hard}s); full document content egresses to this provider via this route"
  case "$route" in
    codex)
      run_codex_cmd "$attempt_hard"
      classify_route_output
      if [ "$RUN_SUCCEEDED" = true ] && out_missing_or_invalid; then
        recover_findings_json "$PEERLOG" "$RAW_OUT" && log "recovered codex JSON from stdout (-o file unavailable)"
      fi
      ;;
    grok-cli)    run_timeout_cmd "" "$attempt_hard" no-idle
                 classify_route_output
                 [ "$RUN_SUCCEEDED" = true ] && parse_structured "$PEERLOG" "$RAW_OUT" ;;   # grok reads --prompt-file
    claude)      run_timeout_cmd "$PROMPT_FILE" "$attempt_hard" idle
                 classify_route_output
                 [ "$RUN_SUCCEEDED" = true ] && parse_structured "$PEERLOG" "$RAW_OUT" ;;   # claude -p reads stdin
    grok-cursor|cursor|composer)
      # cursor-agent reads the prompt from stdin (verified). Use stdin, NOT a
      # positional argv token: the composed prompt (persona + schema + template +
      # full document, up to CROSS_MODEL_MAX_DOC_CHARS) can exceed ARG_MAX and fail
      # the exec with E2BIG on low-limit hosts, whereas stdin has no size limit.
      run_timeout_cmd "$PROMPT_FILE" "$attempt_hard" idle
      classify_route_output
      [ "$RUN_SUCCEEDED" = true ] && parse_structured "$PEERLOG" "$RAW_OUT" ;;
  esac
  if [ "$RUN_SUCCEEDED" != true ]; then
    rm -f "$RAW_OUT"
    return 0
  fi
  # Extract the served-model receipt from the envelope while $PEERLOG still
  # holds it — normalization below only sees the schema-extracted RAW_OUT.
  extract_model_receipt "$route"
}

# An exact 529 is a transient provider-capacity response, unlike account/session
# quota 429s. Match structured envelopes first and retain a narrow plain-text
# fallback for CLIs that print "529 Overloaded" without JSON.
provider_overloaded() {
  [ "$PROVIDER_OUTCOME" = "overloaded" ]
}

route_hard_budget() {
  if [ "$1" = "grok-cli" ]; then printf '%s\n' "$UNGUARDED_HARD_SECS"; else printf '%s\n' "$HARD_SECS"; fi
}

# Run one host-resolved provider through its fixed route.
run_provider() {   # <provider>
  local provider="$1" primary="" fixed="${CROSS_MODEL_FIXED_ROUTE:-}"
  local provider_budget provider_deadline remaining
  OUT="$RUN_DIR/$REVIEWER_NAME-$provider.json"
  # Per-peer empty workspace, kept SEPARATE from the shared fold-in dir (RUN_DIR).
  # The peer's cwd/workspace and its RAW_OUT live here, so a read-capable peer
  # (codex/cursor-agent) can neither list a shared cwd nor read another lens's
  # published <lens>-<provider>.json -- it has no path handle to RUN_DIR at all.
  # OUT is published to RUN_DIR only after the peer process exits (normalize below),
  # never written into RUN_DIR by the peer itself. Falls back to RUN_DIR only if
  # mktemp fails (preserves prior behavior over failing the pass).
  PEER_WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/xmodel-doc-peer-XXXXXX")" || PEER_WORKDIR="$RUN_DIR"
  RAW_OUT="$PEER_WORKDIR/$REVIEWER_NAME-$provider.raw.json"
  [ -n "$fixed" ] || { log "host must resolve one fixed route before egress; skipping"; rm -f "$OUT"; return 0; }
  [ "$(route_target "$fixed")" = "$provider" ] || { log "fixed route '$fixed' does not match target '$provider'; skipping"; rm -f "$OUT"; return 0; }
  if [ "$fixed" = "grok-cursor" ] && ! cursor_egress_ok; then
    log "fixed route 'grok-cursor' requires Cursor intermediary sanction; skipping"
    rm -f "$OUT"
    return 0
  fi
  primary="$fixed"
  PY_BIN="$(resolve_python)"
  [ -n "$PY_BIN" ] || { log "working Python 3 interpreter required for peer outcome classification; skipping"; rm -f "$OUT"; return 0; }
  validate_model_override "$primary" || { log "model override '${CROSS_MODEL_MODEL_OVERRIDE:-}' not compatible with route '$primary'; skipping"; rm -f "$OUT"; return 0; }
  validate_effort_override "$primary" || { log "effort override '${CROSS_MODEL_EFFORT_OVERRIDE:-}' not compatible with route '$primary'; skipping"; rm -f "$OUT"; return 0; }
  # Track the route that actually produced the fold-in, so the artifact records
  # whether a grok return went out directly (grok-cli -> xAI) or through Cursor
  # (grok-cursor -> Cursor also received the full document). The <lens>-<provider>
  # filename alone cannot encode that intermediary.
  ACTUAL_ROUTE="$primary"
  provider_budget="$(route_hard_budget "$primary")"
  case "$provider_budget" in
    ''|0*|*[!0-9]*) log "peer hard budget must be a positive integer; skipping"; rm -f "$OUT"; return 0 ;;
  esac
  provider_deadline=$(( $(date +%s) + provider_budget ))
  ATTEMPT_HARD_SECS="$provider_budget"
  attempt_route "$provider" "$primary"
  if [ ! -s "$RAW_OUT" ] && provider_overloaded; then
    remaining=$(( provider_deadline - $(date +%s) ))
    if [ "$remaining" -le "$TRANSIENT_RETRY_DELAY_SECS" ]; then
      log "provider overload 529; shared peer budget spent, not retrying"
    else
      log "provider overload 529; retrying same route once after ${TRANSIENT_RETRY_DELAY_SECS}s"
      sleep "$TRANSIENT_RETRY_DELAY_SECS"
      remaining=$(( provider_deadline - $(date +%s) ))
      if [ "$remaining" -gt 0 ]; then
        ATTEMPT_HARD_SECS="$remaining"
        attempt_route "$provider" "$primary"
      fi
    fi
  fi
  ATTEMPT_HARD_SECS=""

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
  # Publish ONLY the normalized OUT into RUN_DIR. RAW_OUT lives in the per-peer
  # workspace and is never a fold-in artifact — if this script dies before normalize
  # (orphaned launch), synthesis finds no .json in RUN_DIR.
  rm -f "$OUT"
  if [ -s "$RAW_OUT" ]; then
    _norm="$(mktemp "${TMPDIR:-/tmp}/xmodel-doc-norm-XXXXXX")"
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
    # the evidence visible in out.log. Surface BOTH streams -- the error can be on
    # stdout (grok's 402) or stderr (claude/cursor auth/quota). Bash builtins only
    # (the route sandbox has no tail/tr). Prefer structured error fields because
    # a raw tail can discard the actionable message in a large CLI envelope.
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
  # Tear down the per-peer workspace (never RUN_DIR, which holds the published OUT).
  [ -n "$PEER_WORKDIR" ] && [ "$PEER_WORKDIR" != "$RUN_DIR" ] && rm -rf "$PEER_WORKDIR"
}

# Prefer structured CLI diagnostics over a raw tail, which can hide the useful
# error near the beginning of a large JSON envelope.
bounded_failure_evidence() {   # <logfile>
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
