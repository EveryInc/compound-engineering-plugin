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
# its dedicated CLI, or (for grok fallback / composer) cursor-agent. All
# activated lenses run on ONE model per provider at HIGH reasoning (composer's
# -fast tier is its ceiling, an accepted exception).
#
# Usage:
#   cross-model-doc-review.sh <host-provider> <candidates> <reviewer-name> \
#                             <document-path> <document-type> <origin> <run-dir>
#
#   <host-provider> the peer-key of the host's OWN serving provider, attested by
#                   the calling skill (it knows its harness): openai->codex,
#                   anthropic->claude, xai->grok, cursor/composer->composer.
#                   Excluded from selection so the pass never self-reviews. Empty
#                   or "unknown" -> the pass SKIPS (zero peers) rather than risk a
#                   same-provider peer.
#   <candidates>    comma-separated ordered provider keys to consider, e.g.
#                   "codex,claude,grok,composer". The skill front-loads any
#                   resolved preference (conversation > config.local.yaml >
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

log()  { printf '[cross-model-doc] %s\n' "$*" >&2; }
skip() { log "$*"; exit 0; }   # non-blocking: announce reason, exit clean, no output

# --- model + reasoning per provider ----------------------------------------
# ONE model at HIGH reasoning per provider (supersedes the old per-lens
# sol/terra split). Concrete IDs are the CURRENT instance of the tier principle
# and the single maintenance point when model families change.
M_CODEX="gpt-5.6-sol"          # codex CLI            (-c model_reasoning_effort="high")
M_CLAUDE="opus"                # claude CLI, Opus 4.8 (--effort high)
M_GROK="grok-4.5"              # grok CLI             (--effort high)
M_GROK_CURSOR="grok-4.5-high"  # cursor-agent grok fallback (reasoning baked into id)
M_COMPOSER="composer-2.5-fast" # cursor-agent composer (no high tier; -fast is the ceiling)

# --- adapter argv (single source of truth for route flags) -----------------
# Emits the CLI + flags one token per line. Read-only, no-prompt, least-privilege
# (tool-less on claude/grok; read-only residual on codex/cursor-agent), and
# high-reasoning per R17. PEER_WORKDIR / RAW_OUT / PROMPT_FILE / SCHEMA_REF are
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
        -o "$RAW_OUT" -m "$M_CODEX" -c 'model_reasoning_effort="high"' -c 'hide_agent_reasoning=false'
      ;;
    claude)
      # --tools "" disables ALL built-in tools (allowlist deny-all, no denylist gap
      # like Glob/Grep); --bare skips project auto-discovery (CLAUDE.md, hooks, MCP,
      # plugins, auto-memory); the run cd's into the empty per-peer workspace (claude
      # has no cwd flag) so even an unlisted tool has no repo -- or sibling peer's
      # fold-in artifact -- in reach. R17 tool-less isolation.
      printf '%s\0' claude -p --model "$M_CLAUDE" --effort high --permission-mode dontAsk \
        --bare --tools "" \
        --max-turns 15 --no-session-persistence --json-schema "$SCHEMA_REF" --output-format json
      ;;
    grok-cli)
      printf '%s\0' grok --prompt-file "$PROMPT_FILE" --model "$M_GROK" --effort high \
        --cwd "$PEER_WORKDIR" --permission-mode dontAsk \
        --deny Read --deny Edit --deny Write --deny Bash --deny Task --deny 'mcp__*' \
        --disable-web-search --no-subagents --max-turns 15 \
        --json-schema "$SCHEMA_REF" --output-format json
      ;;
    grok-cursor)
      printf '%s\0' cursor-agent -p --model "$M_GROK_CURSOR" --mode ask --trust \
        --sandbox enabled --workspace "$PEER_WORKDIR" --output-format json
      ;;
    composer)
      printf '%s\0' cursor-agent -p --model "$M_COMPOSER" --mode ask --trust \
        --sandbox enabled --workspace "$PEER_WORKDIR" --output-format json
      ;;
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
  # adapter_argv emits NUL-delimited argv (can't be captured in a shell var), so
  # validate the route first, then render for humans with NUL -> space.
  adapter_argv "$route" >/dev/null 2>&1 || { echo "unknown route '$route' (want codex|claude|grok-cli|grok-cursor|composer)" >&2; exit 2; }
  adapter_argv "$route" | tr '\0' ' '; echo
  exit 0
fi

HOST_PROVIDER="${1:-}"
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
# the caller is told to pass a fresh path like /tmp/compound-engineering/ce-doc-review/<run-id>/.
# Requiring it to pre-exist would silently no-op the whole pass (no fold-in files).
mkdir -p "$RUN_DIR" 2>/dev/null
[ -d "$RUN_DIR" ] || skip "run-dir '$RUN_DIR' could not be created; skipping"
command -v jq >/dev/null 2>&1 || skip "jq not installed; skipping"

# Attest-or-skip (R16): an un-attestable host provider means the pass skips
# rather than risk selecting a same-provider peer.
case "$HOST_PROVIDER" in
  codex|claude|grok|composer) ;;
  *) skip "host provider '${HOST_PROVIDER:-<empty>}' un-attestable (want codex|claude|grok|composer); skipping cross-model pass (zero peers)" ;;
esac

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
out_missing_or_invalid() { [ ! -s "$RAW_OUT" ] || ! jq -e . "$RAW_OUT" >/dev/null 2>&1; }

# The cursor-agent route egresses content through Cursor even when the *model* is
# grok (grok-via-cursor-agent). CROSS_MODEL_PEERS is an egress boundary (R19), not
# just a model-provider filter, so the grok->cursor-agent transport is off-limits
# under an allowlist that does not sanction Cursor. Cursor egress is sanctioned when
# no allowlist is set, or when 'composer' (the Cursor-native provider) is allowlisted
# -- either way the user has accepted that content may reach Cursor.
cursor_egress_ok() { [ -z "$ALLOW" ] || in_csv composer "$ALLOW"; }

# Soft size gate: peer prompt embeds the full document. Over-budget docs skip
# cleanly (R11) rather than collapsing silently inside the provider context window.
MAX_DOC_CHARS="${CROSS_MODEL_MAX_DOC_CHARS:-200000}"
case "$MAX_DOC_CHARS" in ''|*[!0-9]*) MAX_DOC_CHARS=200000 ;; esac
DOC_CHARS="$(wc -c <"$DOC_PATH" | tr -d '[:space:]')"
if [ "$DOC_CHARS" -gt "$MAX_DOC_CHARS" ]; then
  skip "document is ${DOC_CHARS} bytes (limit ${MAX_DOC_CHARS}); skipping cross-model pass rather than truncating"
fi

provider_available() {
  case "$1" in
    codex)    command -v codex >/dev/null 2>&1 ;;
    claude)   command -v claude >/dev/null 2>&1 ;;
    grok)     command -v grok >/dev/null 2>&1 || { cursor_egress_ok && command -v cursor-agent >/dev/null 2>&1; } ;;
    composer) command -v cursor-agent >/dev/null 2>&1 ;;
    *) return 1 ;;
  esac
}

# Collect the FULL ordered list of reachable candidates (installed, allowlisted,
# non-host, deduped) -- NOT truncated to MAX_PEERS here. `command -v` proves a
# route is installed but not that it is authenticated / un-throttled, which only
# the actual run reveals; so the run loop below bounds by *successful* peers and
# falls through to the next candidate when an earlier one fails at auth/rate-limit,
# instead of the pass silently no-op'ing on an installed-but-unusable first choice.
# `for p in $CANDIDATES` splits the CSV once at loop start under IFS=',', so IFS
# stays comma for the whole loop; nothing in the body does IFS-sensitive splitting.
SELECTED=""   # space-separated ordered reachable candidates (bash 3.2-safe)
OLDIFS="$IFS"; IFS=','
for p in $CANDIDATES; do
  p="$(printf '%s' "$p" | tr -d '[:space:]')"
  [ -n "$p" ] || continue
  case "$p" in codex|claude|grok|composer) ;; *) log "ignoring unknown provider '$p' in candidates"; continue ;; esac
  [ "$p" = "$HOST_PROVIDER" ] && continue
  case " $SELECTED " in *" $p "*) continue ;; esac   # dedup
  if [ -n "$ALLOW" ] && ! in_csv "$p" "$ALLOW"; then log "provider '$p' not in CROSS_MODEL_PEERS allowlist; skipping"; continue; fi
  if ! provider_available "$p"; then log "provider '$p' has no installed route; skipping"; continue; fi
  SELECTED="$SELECTED $p"
done
IFS="$OLDIFS"
SELECTED="$(printf '%s' "$SELECTED" | sed 's/^ *//')"

[ "$MAX_PEERS" -ge 1 ] || skip "CROSS_MODEL_MAX_PEERS=0; cross-model pass disabled"
[ -n "$SELECTED" ] || skip "no different-provider peer reachable (host=$HOST_PROVIDER, candidates='$CANDIDATES'); skipping"
log "reachable cross-model candidates for lens $REVIEWER_NAME: $SELECTED (host $HOST_PROVIDER excluded; up to $MAX_PEERS successful peer(s))"

# first_n <max> <space-separated list> -> the first <max> tokens.
first_n() {
  local max="$1"; shift; local n=0 out=""
  for t in "$@"; do [ "$n" -ge "$max" ] && break; out="$out $t"; n=$((n + 1)); done
  printf '%s' "${out# }"
}

# Diagnostic: resolve selection only, no model call, no side effects (used by the
# selection tests, which stub the route CLIs on PATH). Prints the happy-path peer
# set (the first MAX_PEERS reachable candidates); the live run additionally falls
# through to later candidates when an earlier one fails at auth/rate-limit.
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
trap 'rm -f "$PROMPT_FILE" "$PEERLOG"' EXIT
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
  local line
  # NUL-delimited so a token containing newlines (the pretty-printed --json-schema
  # value) stays ONE argv element instead of splitting across lines.
  while IFS= read -r -d '' tok; do CMD+=("$tok"); done < <(adapter_argv "$1")
}

run_codex_cmd() {   # CMD already built for the codex route; streams to PEERLOG, writes -o RAW_OUT
  local prev; case "$-" in *m*) prev=1;; *) prev=0;; esac
  set -m
  "${CMD[@]}" < "$PROMPT_FILE" > "$PEERLOG" 2>&1 &
  local pid=$!
  ACTIVE_PEER_PID="$pid"
  [ "$prev" = 0 ] && set +m
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
  wait "$pid" 2>/dev/null || true
  ACTIVE_PEER_PID=""
}

run_timeout_cmd() {   # $1 = stdin file ("" -> /dev/null). CMD already built.
  # Run from the empty per-peer workspace (absolute stdin/PEERLOG paths are
  # unaffected) so a tool-capable peer -- notably claude, which has no cwd flag --
  # has no repo files, and no sibling lens's fold-in artifact, in reach. grok/cursor
  # also carry their own --cwd/--workspace flag pointed at the same PEER_WORKDIR.
  local stdin_file="${1:-}"; [ -n "$stdin_file" ] || stdin_file=/dev/null
  local prev; case "$-" in *m*) prev=1;; *) prev=0;; esac
  set -m
  if [ -n "$TO_BIN" ]; then
    ( cd "$PEER_WORKDIR" && exec "$TO_BIN" -k 10 "$HARD_SECS" "${CMD[@]}" ) < "$stdin_file" > "$PEERLOG" 2>/dev/null &
  else
    ( cd "$PEER_WORKDIR" && exec perl -e 'alarm shift; exec @ARGV' "$HARD_SECS" "${CMD[@]}" ) < "$stdin_file" > "$PEERLOG" 2>/dev/null &
  fi
  local pid=$!
  ACTIVE_PEER_PID="$pid"
  [ "$prev" = 0 ] && set +m
  wait "$pid" 2>/dev/null || log "peer exited non-zero or timed out"
  ACTIVE_PEER_PID=""
}

# Brace-match the largest {...} object containing "findings" out of raw stdout.
recover_findings_json() {   # <logfile> <outfile>
  command -v python3 >/dev/null 2>&1 || return 1
  python3 - "$1" "$2" <<'PY' 2>/dev/null
import sys, json
txt = open(sys.argv[1], encoding="utf-8", errors="replace").read()
best, depth, start = None, 0, None
for i, ch in enumerate(txt):
    if ch == '{':
        if depth == 0: start = i
        depth += 1
    elif ch == '}' and depth > 0:
        depth -= 1
        if depth == 0 and start is not None:
            try:
                obj = json.loads(txt[start:i+1])
                if isinstance(obj, dict) and "findings" in obj: best = obj
            except Exception: pass
if best is not None: open(sys.argv[2], "w").write(json.dumps(best))
PY
  [ -s "$2" ]
}

# Parse a schema-shaped object out of a headless CLI JSON envelope (claude/grok/cursor).
parse_structured() {   # <logfile> <outfile>
  jq -e '.structured_output' "$1" > "$2" 2>/dev/null && return 0
  jq -r '.result // empty' "$1" 2>/dev/null | jq -e '.' > "$2" 2>/dev/null && return 0
  recover_findings_json "$1" "$2"
}

# Run one route for a provider; leaves a schema-shaped (pre-normalization) $RAW_OUT on success.
attempt_route() {   # <provider> <route>
  local provider="$1" route="$2" note
  : > "$PEERLOG"; rm -f "$RAW_OUT" "$OUT"
  build_cmd "$route"
  case "$route" in
    codex)       note="$M_CODEX (effort high)" ;;
    claude)      note="$M_CLAUDE (effort high)" ;;
    grok-cli)    note="$M_GROK (effort high)" ;;
    grok-cursor) note="$M_GROK_CURSOR" ;;
    composer)    note="$M_COMPOSER" ;;
  esac
  log "peer run: provider=$provider route=$route model=$note lens=$REVIEWER_NAME read-only least-privilege (idle ${IDLE_SECS}s / hard ${HARD_SECS}s)"
  case "$route" in
    codex)
      run_codex_cmd
      if out_missing_or_invalid; then
        recover_findings_json "$PEERLOG" "$RAW_OUT" && log "recovered codex JSON from stdout (-o file unavailable)"
      fi
      ;;
    grok-cli)    run_timeout_cmd ""            ; parse_structured "$PEERLOG" "$RAW_OUT" ;;   # grok reads --prompt-file
    claude)      run_timeout_cmd "$PROMPT_FILE"; parse_structured "$PEERLOG" "$RAW_OUT" ;;   # claude -p reads stdin
    grok-cursor|composer)
      # cursor-agent reads the prompt from stdin (verified). Use stdin, NOT a
      # positional argv token: the composed prompt (persona + schema + template +
      # full document, up to CROSS_MODEL_MAX_DOC_CHARS) can exceed ARG_MAX and fail
      # the exec with E2BIG on low-limit hosts, whereas stdin has no size limit.
      run_timeout_cmd "$PROMPT_FILE"; parse_structured "$PEERLOG" "$RAW_OUT" ;;
  esac
}

# Run a provider (with the grok CLI -> cursor-agent classified-failure fallback).
run_provider() {   # <provider>
  local provider="$1" primary fallback=""
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
  case "$provider" in
    codex)    primary="codex" ;;
    claude)   primary="claude" ;;
    composer) primary="composer" ;;
    grok)
      if command -v grok >/dev/null 2>&1; then
        primary="grok-cli"
        # Only fall back to cursor-agent when Cursor egress is sanctioned (R19).
        if cursor_egress_ok && command -v cursor-agent >/dev/null 2>&1; then fallback="grok-cursor"; fi
      else
        # grok CLI absent; cursor-agent is the only route -- reached here only when
        # provider_available already confirmed cursor_egress_ok, so egress is sanctioned.
        primary="grok-cursor"
      fi
      ;;
  esac
  # Track the route that actually produced the fold-in, so the artifact records
  # whether a grok return went out directly (grok-cli -> xAI) or through Cursor
  # (grok-cursor -> Cursor also received the full document). The <lens>-<provider>
  # filename alone can't encode that, so the egress disclosure would otherwise miss
  # the Cursor hop in the grok-CLI-failure fallback case.
  ACTUAL_ROUTE="$primary"
  attempt_route "$provider" "$primary"
  if out_missing_or_invalid && [ -n "$fallback" ]; then
    log "grok primary route (grok CLI) produced no usable output (not-installed/unauth/rate-limited/failed); classified-failure fallback -> $fallback"
    attempt_route "$provider" "$fallback"
    ACTUAL_ROUTE="$fallback"
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
  # Publish ONLY the normalized OUT into RUN_DIR. RAW_OUT lives in the per-peer
  # workspace and is never a fold-in artifact — if this script dies before normalize
  # (orphaned launch), synthesis finds no .json in RUN_DIR.
  rm -f "$OUT"
  if [ -s "$RAW_OUT" ]; then
    _norm="$(mktemp "${TMPDIR:-/tmp}/xmodel-doc-norm-XXXXXX")"
    if jq --arg r "$REVIEWER_NAME-$provider" --arg route "$ACTUAL_ROUTE" \
         'if (.findings|type)=="array"
          then { reviewer: $r,
                 cross_model_route: $route,
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
    rm -f "$OUT" "$RAW_OUT"
  fi
  # Tear down the per-peer workspace (never RUN_DIR, which holds the published OUT).
  [ -n "$PEER_WORKDIR" ] && [ "$PEER_WORKDIR" != "$RUN_DIR" ] && rm -rf "$PEER_WORKDIR"
}

# --- run candidates in order until MAX_PEERS produce usable output ----------
# run_provider writes <run-dir>/<lens>-<provider>.json on success and removes it
# on a classified failure (not-installed route left, unauth, rate-limit, timeout,
# unparseable). A failed candidate consumes no peer slot, so the pass falls through
# to the next reachable provider instead of silently producing nothing.
peers=0
for provider in $SELECTED; do
  [ "$peers" -ge "$MAX_PEERS" ] && break
  run_provider "$provider"
  if [ -s "$RUN_DIR/$REVIEWER_NAME-$provider.json" ]; then
    peers=$((peers + 1))
  else
    log "provider $provider unusable (unauth/rate-limited/failed); falling through to next reachable candidate"
  fi
done
exit 0
