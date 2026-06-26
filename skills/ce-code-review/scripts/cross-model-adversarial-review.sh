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
# The full findings schema is embedded so BOTH peers know every required field
# (why_it_matters, confidence, evidence, routing) -- Codex gets no --output-schema
# (its strict mode rejects the permissive draft-07 schema), so the prompt is its
# only schema signal. Verified to produce complete, schema-shaped findings.
{
  cat "$PERSONA"
  printf '\n\n---\n\n'
  printf 'This is an authorized review of the maintainer\047s own repository.\n'
  printf 'Think like an attacker and a chaos engineer: find the ways this change fails in production.\n'
  printf 'Return ONE JSON object and nothing else (no prose, no code fence) matching this schema:\n\n'
  cat "$SCHEMA"
  printf '\n\nSet the top-level "reviewer" field to "adversarial-%s".\n' "$PEER"
} > "$PROMPT_FILE"
# Per-peer diff delivery (composed below): codex fetches its own diff inside its
# read-only sandbox; claude is hard-denied shell (see below), so it gets the diff
# embedded and needs no git.
if [ "$PEER" = codex ]; then
  printf '\nRun: git diff %q — review ONLY the changes in that diff, in this repository (read-only).\n' "$BASE" >> "$PROMPT_FILE"
else
  { printf '\nReview ONLY the change below (the output of `git diff %q`). You may Read repository files for context but cannot run shell commands.\n' "$BASE"
    printf '\n=== BEGIN DIFF ===\n'; git -C "$REPO_ROOT" diff "$BASE"; printf '\n=== END DIFF ===\n'; } >> "$PROMPT_FILE"
fi

# --- run the peer: idle-timeout for streaming codex, hard cap for claude ----
# We don't kill codex on a fixed wall clock: codex exec streams its reasoning to
# stdout, so a productive long run is allowed to continue and is killed only when its
# output STALLS for IDLE_SECS (the cross-model "second opinion" idle-timeout pattern).
# claude's --output-format json is single-shot (no incremental output), so it gets a
# hard cap only.
#
# Orphan safety: the peer runs under gtimeout/timeout, which kills the whole process
# tree -- both on its own hard cap AND when we signal it externally on idle (verified:
# an external kill of (g)timeout is forwarded to its child). No backgrounded model call
# can outlive this script. perl(alarm) is the fallback when neither (g)timeout exists
# (hard cap, no idle detection).
IDLE_SECS="${CROSS_MODEL_IDLE_SECS:-120}"   # kill codex if its streamed output stalls this long
HARD_SECS="${CROSS_MODEL_HARD_SECS:-600}"   # absolute ceiling (backstop) for either peer
TO_BIN="$(command -v gtimeout || command -v timeout || true)"

# Codex under (g)timeout in the background; stream to PEERLOG; kill on idle stall.
run_codex_idle() {
  "$TO_BIN" -k 10 "$HARD_SECS" codex exec - -C "$REPO_ROOT" -s read-only -o "$OUT" \
    -c 'model_reasoning_effort="high"' < "$PROMPT_FILE" > "$PEERLOG" 2>&1 &
  local pid=$! last=-1 lastchg now size
  lastchg="$(date +%s)"
  while kill -0 "$pid" 2>/dev/null; do
    sleep 5; now="$(date +%s)"; size="$(wc -c <"$PEERLOG" 2>/dev/null || echo 0)"
    if [ "$size" != "$last" ]; then last="$size"; lastchg="$now"; fi
    if [ $(( now - lastchg )) -ge "$IDLE_SECS" ]; then
      log "codex output idle ${IDLE_SECS}s; killing (forwarded to the process tree)"
      kill "$pid" 2>/dev/null; break
    fi
  done
  wait "$pid" 2>/dev/null || true
}

log "running $PEER adversarial review against base $BASE (read-only; idle ${IDLE_SECS}s / hard ${HARD_SECS}s)"
case "$PEER" in
  codex)
    if [ -n "$TO_BIN" ]; then
      run_codex_idle
    else
      perl -e 'alarm shift; exec @ARGV' "$HARD_SECS" \
        codex exec - -C "$REPO_ROOT" -s read-only -o "$OUT" \
        -c 'model_reasoning_effort="high"' < "$PROMPT_FILE" >/dev/null 2>&1 \
        || log "codex exited non-zero or timed out"
    fi
    ;;
  claude)
    # Single-shot output -> hard cap only. Disallowed tools as SEPARATE variadic args
    # (unambiguous; a single quoted "Edit Write NotebookEdit" is risky since tool names
    # can contain spaces). claude can't write a file under dontAsk + disallowed Write,
    # so it emits the JSON envelope on stdout (captured to PEERLOG); we extract it.
    if [ -n "$TO_BIN" ]; then
      "$TO_BIN" -k 10 "$HARD_SECS" claude -p --model opus --permission-mode dontAsk \
        --disallowedTools Edit Write NotebookEdit MultiEdit Bash --max-turns 15 --no-session-persistence \
        --json-schema "$(cat "$SCHEMA")" --output-format json \
        "$(cat "$PROMPT_FILE")" < /dev/null > "$PEERLOG" 2>/dev/null \
        || log "claude exited non-zero or timed out"
    else
      perl -e 'alarm shift; exec @ARGV' "$HARD_SECS" claude -p --model opus --permission-mode dontAsk \
        --disallowedTools Edit Write NotebookEdit MultiEdit Bash --max-turns 15 --no-session-persistence \
        --json-schema "$(cat "$SCHEMA")" --output-format json \
        "$(cat "$PROMPT_FILE")" < /dev/null > "$PEERLOG" 2>/dev/null \
        || log "claude exited non-zero or timed out"
    fi
    jq -e '.structured_output' "$PEERLOG" > "$OUT" 2>/dev/null \
      || jq -r '.result // empty' "$PEERLOG" | jq -e '.' > "$OUT" 2>/dev/null \
      || { log "could not parse Claude output"; rm -f "$OUT"; }
    ;;
esac

# --- normalize the reviewer name -------------------------------------------
# The persona's example JSON uses reviewer:"adversarial"; if the peer echoed that
# instead of "adversarial-<peer>", Stage 5 would fold it as the in-process reviewer
# and lose the cross-model agreement signal. Force the distinct name.
if [ -s "$OUT" ]; then
  _norm="$(mktemp "${TMPDIR:-/tmp}/xmodel-norm-XXXXXX")"
  if jq --arg r "adversarial-$PEER" '.reviewer = $r' "$OUT" > "$_norm" 2>/dev/null; then mv "$_norm" "$OUT"; else rm -f "$_norm"; fi
fi

# --- validate the output ---------------------------------------------------
if [ -s "$OUT" ] && jq -e '.findings' "$OUT" >/dev/null 2>&1; then
  n="$(jq '.findings | length' "$OUT" 2>/dev/null || echo '?')"
  log "wrote $n finding(s) to $OUT (reviewer adversarial-$PEER)"
else
  log "$PEER produced no usable schema-shaped output; skipping fold-in"
  rm -f "$OUT"
fi
exit 0
