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
# codex exec streams its reasoning to stdout, so a productive long run is allowed to
# continue and is killed only when its output STALLS for IDLE_SECS (the cross-model
# "second opinion" idle-timeout pattern), with HARD_SECS as an absolute backstop.
# claude's --output-format json is single-shot, so it gets a hard cap only.
#
# Orphan safety: codex runs in its OWN process group (set -m) and the watchdog reaps the
# whole group (TERM then KILL) on idle/hard -- we do NOT signal a (g)timeout wrapper for
# this, because an external kill of (g)timeout forwards only TERM (its -k escalates only
# on gtimeout's OWN expiry), so a peer that defers SIGTERM could survive `wait` and write
# $OUT after Stage 5 skipped it. claude keeps the (g)timeout wrapper: it is single-shot
# and gtimeout's own timeout (with -k) escalates to KILL correctly; perl(alarm) is the
# fallback when neither (g)timeout exists.
IDLE_SECS="${CROSS_MODEL_IDLE_SECS:-180}"   # reap codex if its streamed output stalls this long
HARD_SECS="${CROSS_MODEL_HARD_SECS:-600}"   # absolute ceiling (backstop) for either peer
TO_BIN="$(command -v gtimeout || command -v timeout || true)"

# Reap a backgrounded job's whole process group: TERM, then KILL after a short grace if
# anything is still alive. The grace loop tests GROUP liveness (kill -0 on the negative
# pgid), not just the leader pid -- otherwise a leader that exits while a child defers TERM
# would let reap() return before the group KILL, leaking the child. Falls back to the bare
# pid only when group signaling isn't accepted at all.
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

# Run codex in its own process group; stream to PEERLOG; reap the group on idle stall or
# hard cap. This watchdog owns both bounds and the kill -- no (g)timeout wrapper to signal.
run_codex() {
  local prev; case "$-" in *m*) prev=1;; *) prev=0;; esac
  set -m   # background job becomes a process-group leader (pgid == pid) so reap() kills the tree
  # Force reasoning output on for THIS subprocess (overriding a user's hide_agent_reasoning
  # = true), so the streamed reasoning keeps PEERLOG growing and gives the idle watchdog a
  # liveness signal -- otherwise a long, quiet reasoning phase on a big diff could be
  # misread as a stall and reaped.
  # `command codex` bypasses any interactive shell function/alias a user has wrapped
  # around codex, so we hit the real binary.
  command codex exec - -C "$REPO_ROOT" -s read-only -o "$OUT" \
    -c 'model_reasoning_effort="high"' -c 'hide_agent_reasoning=false' < "$PROMPT_FILE" > "$PEERLOG" 2>&1 &
  local pid=$!
  [ "$prev" = 0 ] && set +m   # group is already assigned; restoring silences job-control noise
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

log "running $PEER adversarial review against base $BASE (read-only; idle ${IDLE_SECS}s / hard ${HARD_SECS}s)"
case "$PEER" in
  codex)
    run_codex
    # Fallback: codex's -o write is CLI-level and works under -s read-only, but if it
    # ever fails to materialize, recover the same JSON from the stdout we already
    # captured (codex prints the final message to stdout too). Belt-and-suspenders.
    if { [ ! -s "$OUT" ] || ! jq -e . "$OUT" >/dev/null 2>&1; } && [ -s "$PEERLOG" ] && command -v python3 >/dev/null 2>&1; then
      python3 - "$PEERLOG" "$OUT" <<'PY' 2>/dev/null && [ -s "$OUT" ] && log "recovered codex JSON from stdout (-o file unavailable)"
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
    fi
    ;;
  claude)
    # Single-shot output -> hard cap only. Disallowed tools as SEPARATE variadic args
    # (unambiguous; a single quoted "Edit Write NotebookEdit" is risky since tool names
    # can contain spaces). We deny the built-in mutators (Edit/Write/NotebookEdit/Bash)
    # AND `mcp__*` (a user's pre-approved MCP write/deploy tools would otherwise run under
    # dontAsk) AND `Task` (a subagent would bypass this deny list) -- so the peer stays
    # read-only even with MCP servers configured. claude can't write a file under those
    # perms, so it emits the JSON envelope on stdout (captured to PEERLOG); we extract it.
    if [ -n "$TO_BIN" ]; then
      "$TO_BIN" -k 10 "$HARD_SECS" claude -p --model opus --permission-mode dontAsk \
        --disallowedTools Edit Write NotebookEdit Bash Task 'mcp__*' --max-turns 15 --no-session-persistence \
        --json-schema "$(cat "$SCHEMA")" --output-format json \
        < "$PROMPT_FILE" > "$PEERLOG" 2>/dev/null \
        || log "claude exited non-zero or timed out"
    else
      perl -e 'alarm shift; exec @ARGV' "$HARD_SECS" claude -p --model opus --permission-mode dontAsk \
        --disallowedTools Edit Write NotebookEdit Bash Task 'mcp__*' --max-turns 15 --no-session-persistence \
        --json-schema "$(cat "$SCHEMA")" --output-format json \
        < "$PROMPT_FILE" > "$PEERLOG" 2>/dev/null \
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
  # Force the distinct reviewer name AND satisfy Stage 5's full top-level contract
  # (reviewer string + findings/residual_risks/testing_gaps arrays). Backfill the two
  # soft arrays if the peer omitted them; drop the return entirely if findings is not
  # an array (empty output -> the validation below removes the file -> clean skip).
  if jq --arg r "adversarial-$PEER" \
       'if (.findings|type)=="array" then {reviewer:$r, findings, residual_risks:(.residual_risks // []), testing_gaps:(.testing_gaps // [])} else empty end' \
       "$OUT" > "$_norm" 2>/dev/null; then mv "$_norm" "$OUT"; else rm -f "$_norm"; fi
fi

# --- validate the output against the Stage 5 reviewer-return contract -------
if [ -s "$OUT" ] && jq -e '(.reviewer|type=="string") and (.findings|type=="array") and (.residual_risks|type=="array") and (.testing_gaps|type=="array")' "$OUT" >/dev/null 2>&1; then
  n="$(jq '.findings | length' "$OUT" 2>/dev/null || echo '?')"
  log "wrote $n finding(s) to $OUT (reviewer adversarial-$PEER)"
else
  log "$PEER produced no usable schema-shaped output; skipping fold-in"
  rm -f "$OUT"
fi
exit 0
