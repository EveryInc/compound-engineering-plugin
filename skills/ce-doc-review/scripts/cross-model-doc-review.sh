#!/usr/bin/env bash
# cross-model-doc-review.sh
#
# Runs ONE ce-doc-review judgment persona through ONE or more DIFFERENT model
# PROVIDERS than the host (the "peer(s)") in separate, read-only, tool-less
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
# Emits the CLI + flags one token per line. Read-only, no-prompt, tool-less, and
# high-reasoning per R17. RUN_DIR / OUT / PROMPT_FILE / SCHEMA_REF are resolved by
# the caller (placeholders in --emit-adapter mode). NEVER emit: codex without
# `-s read-only`; grok `--always-approve` / `--permission-mode bypassPermissions`;
# cursor-agent `-f` / `--force` / `--yolo`.
adapter_argv() {
  case "$1" in
    codex)
      printf '%s\n' codex exec - -C "$RUN_DIR" --skip-git-repo-check -s read-only \
        -o "$OUT" -m "$M_CODEX" -c 'model_reasoning_effort="high"' -c 'hide_agent_reasoning=false'
      ;;
    claude)
      # --tools "" disables ALL built-in tools (allowlist deny-all, no denylist gap
      # like Glob/Grep); --bare skips project auto-discovery (CLAUDE.md, hooks, MCP,
      # plugins, auto-memory); the run cd's into the empty scratch dir (claude has no
      # cwd flag) so even an unlisted tool has no repo in reach. R17 tool-less isolation.
      printf '%s\n' claude -p --model "$M_CLAUDE" --effort high --permission-mode dontAsk \
        --bare --tools "" \
        --max-turns 15 --no-session-persistence --json-schema "$SCHEMA_REF" --output-format json
      ;;
    grok-cli)
      printf '%s\n' grok --prompt-file "$PROMPT_FILE" --model "$M_GROK" --effort high \
        --cwd "$RUN_DIR" --permission-mode dontAsk \
        --deny Read --deny Edit --deny Write --deny Bash --deny Task --deny 'mcp__*' \
        --disable-web-search --no-subagents --max-turns 15 \
        --json-schema "$SCHEMA_REF" --output-format json
      ;;
    grok-cursor)
      printf '%s\n' cursor-agent -p --model "$M_GROK_CURSOR" --mode ask --trust \
        --sandbox enabled --workspace "$RUN_DIR" --output-format json
      ;;
    composer)
      printf '%s\n' cursor-agent -p --model "$M_COMPOSER" --mode ask --trust \
        --sandbox enabled --workspace "$RUN_DIR" --output-format json
      ;;
    *) return 1 ;;
  esac
}

# --- --emit-adapter <route>: print the argv, no model call, no side effects --
if [ "${1:-}" = "--emit-adapter" ]; then
  RUN_DIR="<run-dir>"; OUT="<run-dir>/<lens>-<provider>.json"
  PROMPT_FILE="<prompt-file>"; SCHEMA_REF="<schema>"
  route="${2:-}"
  argv="$(adapter_argv "$route" 2>/dev/null)" || { echo "unknown route '$route' (want codex|claude|grok-cli|grok-cursor|composer)" >&2; exit 2; }
  printf '%s ' $argv; echo
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
[ -n "$RUN_DIR" ] && [ -d "$RUN_DIR" ] || skip "run-dir '${RUN_DIR:-<empty>}' is not a directory; skipping"
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
  *) skip "reviewer-name '$REVIEWER_NAME' is not a cross-model trio lens (want security-lens|adversarial|product-lens); skipping" ;;
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

# --- resolve which provider(s) to run (exclude host, allowlist, availability) --
ALLOW="${CROSS_MODEL_PEERS:-}"                 # optional egress allowlist (R19)
MAX_PEERS="${CROSS_MODEL_MAX_PEERS:-1}"        # default 1; clamped 0..2 (hard cap)
case "$MAX_PEERS" in ''|*[!0-9]*) MAX_PEERS=1 ;; esac
[ "$MAX_PEERS" -gt 2 ] && MAX_PEERS=2

in_csv() { case ",$2," in *",$1,"*) return 0 ;; *) return 1 ;; esac; }
out_missing_or_invalid() { [ ! -s "$OUT" ] || ! jq -e . "$OUT" >/dev/null 2>&1; }

provider_available() {
  case "$1" in
    codex)    command -v codex >/dev/null 2>&1 ;;
    claude)   command -v claude >/dev/null 2>&1 ;;
    grok)     command -v grok >/dev/null 2>&1 || command -v cursor-agent >/dev/null 2>&1 ;;
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
{
  cat "$PERSONA"
  printf '\n\n---\n\n'
  printf 'This is an authorized document review of the maintainer\047s own repository.\n'
  printf 'Return ONE JSON object and nothing else (no prose, no code fence) matching this schema:\n\n'
  printf '%s' "$SCHEMA_CONTENT"
  printf '\n\nSet the top-level "reviewer" field to "%s" (it will be namespaced to the peer provider on fold-in).\n' "$REVIEWER_NAME"
  printf '\n<review-context>\n'
  printf 'Document type: %s\n' "$DOC_TYPE"
  printf 'Document path: %s\n' "$DOC_PATH"
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

# Build the CMD array for a route (bash 3.2-safe: no mapfile).
build_cmd() {
  CMD=()
  local line
  while IFS= read -r line; do CMD+=("$line"); done < <(adapter_argv "$1")
}

run_codex_cmd() {   # CMD already built for the codex route; streams to PEERLOG, writes -o OUT
  local prev; case "$-" in *m*) prev=1;; *) prev=0;; esac
  set -m
  "${CMD[@]}" < "$PROMPT_FILE" > "$PEERLOG" 2>&1 &
  local pid=$!
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
}

run_timeout_cmd() {   # $1 = stdin file ("" -> /dev/null). CMD already built.
  # Run from the empty scratch RUN_DIR (absolute stdin/PEERLOG paths are unaffected)
  # so a tool-capable peer -- notably claude, which has no cwd flag -- has no repo
  # files in reach. grok/cursor also carry their own --cwd/--workspace flag.
  local stdin_file="${1:-}"; [ -n "$stdin_file" ] || stdin_file=/dev/null
  if [ -n "$TO_BIN" ]; then
    ( cd "$RUN_DIR" && exec "$TO_BIN" -k 10 "$HARD_SECS" "${CMD[@]}" ) < "$stdin_file" > "$PEERLOG" 2>/dev/null \
      || log "peer exited non-zero or timed out"
  else
    ( cd "$RUN_DIR" && exec perl -e 'alarm shift; exec @ARGV' "$HARD_SECS" "${CMD[@]}" ) < "$stdin_file" > "$PEERLOG" 2>/dev/null \
      || log "peer exited non-zero or timed out"
  fi
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

# Run one route for a provider; leaves a schema-shaped (pre-normalization) $OUT on success.
attempt_route() {   # <provider> <route>
  local provider="$1" route="$2" note
  : > "$PEERLOG"; rm -f "$OUT"
  build_cmd "$route"
  case "$route" in
    codex)       note="$M_CODEX (effort high)" ;;
    claude)      note="$M_CLAUDE (effort high)" ;;
    grok-cli)    note="$M_GROK (effort high)" ;;
    grok-cursor) note="$M_GROK_CURSOR" ;;
    composer)    note="$M_COMPOSER" ;;
  esac
  log "peer run: provider=$provider route=$route model=$note lens=$REVIEWER_NAME read-only tool-less (idle ${IDLE_SECS}s / hard ${HARD_SECS}s)"
  case "$route" in
    codex)
      run_codex_cmd
      if out_missing_or_invalid; then
        recover_findings_json "$PEERLOG" "$OUT" && log "recovered codex JSON from stdout (-o file unavailable)"
      fi
      ;;
    grok-cli)                 run_timeout_cmd ""            ; parse_structured "$PEERLOG" "$OUT" ;;
    claude|grok-cursor|composer) run_timeout_cmd "$PROMPT_FILE"; parse_structured "$PEERLOG" "$OUT" ;;
  esac
}

# Run a provider (with the grok CLI -> cursor-agent classified-failure fallback).
run_provider() {   # <provider>
  local provider="$1" primary fallback=""
  OUT="$RUN_DIR/$REVIEWER_NAME-$provider.json"
  case "$provider" in
    codex)    primary="codex" ;;
    claude)   primary="claude" ;;
    composer) primary="composer" ;;
    grok)
      if command -v grok >/dev/null 2>&1; then
        primary="grok-cli"
        command -v cursor-agent >/dev/null 2>&1 && fallback="grok-cursor"
      else
        primary="grok-cursor"   # grok CLI absent; cursor-agent is the only route
      fi
      ;;
  esac
  attempt_route "$provider" "$primary"
  if out_missing_or_invalid && [ -n "$fallback" ]; then
    log "grok primary route (grok CLI) produced no usable output (not-installed/unauth/rate-limited/failed); classified-failure fallback -> $fallback"
    attempt_route "$provider" "$fallback"
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
  if [ -s "$OUT" ]; then
    _norm="$(mktemp "${TMPDIR:-/tmp}/xmodel-doc-norm-XXXXXX")"
    if jq --arg r "$REVIEWER_NAME-$provider" \
         'if (.findings|type)=="array"
          then { reviewer: $r,
                 findings: [ .findings[] | if (.autofix_class? == "safe_auto") then .autofix_class = "gated_auto" else . end ],
                 residual_risks: (.residual_risks // []),
                 deferred_questions: (.deferred_questions // []) }
          else empty end' \
         "$OUT" > "$_norm" 2>/dev/null; then mv "$_norm" "$OUT"; else rm -f "$_norm"; fi
  fi
  if [ -s "$OUT" ] && jq -e '(.reviewer|type=="string") and (.findings|type=="array") and (.residual_risks|type=="array") and (.deferred_questions|type=="array")' "$OUT" >/dev/null 2>&1; then
    n="$(jq '.findings | length' "$OUT" 2>/dev/null || echo '?')"
    log "wrote $n finding(s) to $OUT (reviewer $REVIEWER_NAME-$provider)"
  else
    log "provider $provider produced no usable schema-shaped output; skipping fold-in"
    rm -f "$OUT"
  fi
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
