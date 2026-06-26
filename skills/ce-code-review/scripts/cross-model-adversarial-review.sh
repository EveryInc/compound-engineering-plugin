#!/usr/bin/env bash
# cross-model-adversarial-review.sh
#
# Runs the adversarial review through a DIFFERENT model family (the "peer") in a
# separate, read-only process, and writes its findings as JSON into the run dir.
# The peer gets the same canonical adversarial brief the in-process reviewer uses
# (references/personas/adversarial-reviewer.md) so it is genuinely "the adversarial
# persona, on a different model."
#
# Usage:  cross-model-adversarial-review.sh <peer: codex|claude> <base-ref> <run-dir>
#   <peer>     codex  -> use Codex (when the host is Claude or Cursor)
#              claude -> use Claude (when the host is Codex)
#   <base-ref> the diff base (e.g. a merge-base SHA or branch); the peer reviews
#              only `git diff <base-ref>` in the current repository
#   <run-dir>  an existing dir; output is written to <run-dir>/adversarial-<peer>.json
#
# Self-locates its sibling reference files via BASH_SOURCE (NOT the CWD, which is
# the user's project on every host), and derives the repo root from git. The agent
# only has to pass the three values above.
#
# NON-BLOCKING BY DESIGN: every failure logs to stderr and exits 0 without an output
# file. The cross-model pass is additive and must never fail the review; the caller
# detects success purely by the presence of <run-dir>/adversarial-<peer>.json.

set -uo pipefail

PEER="${1:-}"
BASE="${2:-}"
RUN_DIR="${3:-}"

log()  { printf '[cross-model] %s\n' "$*" >&2; }
skip() { log "$*"; exit 0; }   # non-blocking: announce reason, exit clean, no output

# --- validate inputs -------------------------------------------------------
case "$PEER" in codex|claude) ;; *) skip "invalid peer '${PEER:-<empty>}' (want codex|claude); skipping cross-model pass" ;; esac
[ -n "$BASE" ]                  || skip "no base ref given; skipping"
[ -n "$RUN_DIR" ] && [ -d "$RUN_DIR" ] || skip "run-dir '${RUN_DIR:-<empty>}' is not a directory; skipping"
command -v "$PEER" >/dev/null 2>&1 || skip "$PEER CLI not installed; skipping"
command -v jq      >/dev/null 2>&1 || skip "jq not installed; skipping"

# --- self-locate skill root + canonical sibling files ----------------------
SKILL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)" || skip "cannot resolve skill root; skipping"
PERSONA="$SKILL_ROOT/references/personas/adversarial-reviewer.md"
SCHEMA="$SKILL_ROOT/references/findings-schema.json"
[ -f "$PERSONA" ] || skip "persona brief not found at $PERSONA; skipping"
[ -f "$SCHEMA" ]  || skip "findings schema not found at $SCHEMA; skipping"

# --- derive repo root (read-only) ------------------------------------------
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || skip "not inside a git repository; skipping"

OUT="$RUN_DIR/adversarial-$PEER.json"
PROMPT_FILE="$(mktemp "${TMPDIR:-/tmp}/xmodel-prompt-XXXXXX")"
PEERLOG="$(mktemp "${TMPDIR:-/tmp}/xmodel-log-XXXXXX")"
trap 'rm -f "$PROMPT_FILE" "$PEERLOG"' EXIT

# --- compose the peer prompt from the canonical persona (single source) ----
{
  cat "$PERSONA"
  printf '\n\n---\n\n'
  printf 'This is an authorized review of the maintainer\047s own repository.\n'
  printf 'Run: git diff %q  — review ONLY the changes in that diff, in this repository (read-only).\n' "$BASE"
  printf 'Think like an attacker and a chaos engineer: find the ways this change fails in production.\n'
  printf 'Return ONE JSON object and nothing else (no prose, no code fence) matching this schema:\n\n'
  cat "$SCHEMA"
  printf '\n\nSet the top-level "reviewer" field to "adversarial-%s".\n' "$PEER"
} > "$PROMPT_FILE"

# --- timeouts --------------------------------------------------------------
IDLE_SECS="${CROSS_MODEL_IDLE_SECS:-180}"   # kill if streamed output stalls this long (codex only)
HARD_SECS="${CROSS_MODEL_HARD_SECS:-540}"   # absolute ceiling for either peer

# Background a peer function, stream its combined output to $PEERLOG, and kill it
# on a hard ceiling -- plus, when idle detection is enabled (streaming peers), kill
# it if $PEERLOG stops growing for IDLE_SECS. Claude's `--output-format json` emits
# once at the end (no incremental growth), so idle detection is disabled there.
supervise() {
  local idle_enabled="$1" fn="$2"
  "$fn" >"$PEERLOG" 2>&1 &
  local pid=$! start now size last=-1 lastchg
  start=$(date +%s); lastchg=$start
  while kill -0 "$pid" 2>/dev/null; do
    sleep 5; now=$(date +%s)
    size=$(wc -c <"$PEERLOG" 2>/dev/null || echo 0)
    if [ "$size" != "$last" ]; then last="$size"; lastchg="$now"; fi
    if [ "$idle_enabled" = 1 ] && [ $(( now - lastchg )) -ge "$IDLE_SECS" ]; then
      log "$PEER idle ${IDLE_SECS}s with no new output; killing"; kill "$pid" 2>/dev/null; break
    fi
    if [ $(( now - start )) -ge "$HARD_SECS" ]; then
      log "$PEER hit hard cap ${HARD_SECS}s; killing"; kill "$pid" 2>/dev/null; break
    fi
  done
  wait "$pid" 2>/dev/null || true
}

run_codex() {
  # Codex writes the schema-shaped final message to $OUT itself (-o), which works
  # under -s read-only. It streams reasoning to stdout, so idle detection applies.
  codex exec - -C "$REPO_ROOT" -s read-only -o "$OUT" \
    -c 'model_reasoning_effort="high"' < "$PROMPT_FILE"
}

run_claude() {
  # Claude can't write a file under dontAsk + disallowed Write, so it emits the JSON
  # envelope on stdout (captured into $PEERLOG) and we extract it afterward.
  claude -p --model opus --permission-mode dontAsk \
    --disallowedTools "Edit Write NotebookEdit" --max-turns 15 --no-session-persistence \
    --json-schema "$(cat "$SCHEMA")" --output-format json \
    "$(cat "$PROMPT_FILE")" < /dev/null
}

log "running $PEER adversarial review against base $BASE (read-only)"
case "$PEER" in
  codex)
    supervise 1 run_codex
    ;;
  claude)
    supervise 0 run_claude
    # Prefer the parsed structured object; fall back to the .result string.
    jq -e '.structured_output' "$PEERLOG" > "$OUT" 2>/dev/null \
      || jq -r '.result // empty' "$PEERLOG" | jq -e '.' > "$OUT" 2>/dev/null \
      || { log "could not parse Claude output"; rm -f "$OUT"; }
    ;;
esac

# --- validate the output ---------------------------------------------------
if [ -s "$OUT" ] && jq -e '.findings' "$OUT" >/dev/null 2>&1; then
  n="$(jq '.findings | length' "$OUT" 2>/dev/null || echo '?')"
  log "wrote $n finding(s) to $OUT (reviewer adversarial-$PEER)"
else
  log "$PEER produced no usable schema-shaped output; skipping fold-in"
  rm -f "$OUT"
fi
exit 0
