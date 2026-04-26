#!/usr/bin/env bash
# Set up synthetic ~/.claude/projects/ fixtures for the session-historian
# sparse-mismatch eval.
#
# Generates 3 recent synthetic Claude Code session files in a fake-repo
# directory so the dispatch under test sees a realistic discovery surface.
# Content is chosen to NOT match the dispatch's topic keywords, so the
# correct agent behavior is "no relevant prior sessions".
#
# Outputs (stdout):
#   FIXTURE_DIR=<absolute path to fake repo dir>
#   FAKE_REPO_NAME=<the repo name to pass in the dispatch prompt>
#
# Re-run is idempotent: each call generates a new unique suffix and
# fixture directory. Use cleanup.sh to remove a specific fixture dir.

set -euo pipefail

# Unique-per-run suffix. od reads exactly 3 bytes -> 6 hex chars, with no
# pipe-and-truncate that would trip pipefail with SIGPIPE.
SUFFIX=$(od -An -N3 -tx1 /dev/urandom | tr -d ' \n')
FAKE_REPO_NAME="historian-eval-$SUFFIX"
ENCODED_CWD="-tmp-eval-$FAKE_REPO_NAME"
FIXTURE_DIR="$HOME/.claude/projects/$ENCODED_CWD"

mkdir -p "$FIXTURE_DIR"

# Three sessions on different branches, all within the last 7 days, none
# touching auth/middleware/crash topics.
TS_NOW_S=$(date -u +%s)

write_session() {
  local file="$1" branch="$2" age_hours="$3" topic_user="$4" topic_assistant="$5"
  local ts_s ts_iso last_ts_s last_ts_iso uuid sid
  ts_s=$((TS_NOW_S - age_hours * 3600))
  last_ts_s=$((ts_s + 1800))  # session was active for 30 min
  ts_iso=$(date -u -r "$ts_s" +%Y-%m-%dT%H:%M:%S.000Z 2>/dev/null \
           || date -u -d "@$ts_s" +%Y-%m-%dT%H:%M:%S.000Z)
  last_ts_iso=$(date -u -r "$last_ts_s" +%Y-%m-%dT%H:%M:%S.000Z 2>/dev/null \
           || date -u -d "@$last_ts_s" +%Y-%m-%dT%H:%M:%S.000Z)
  uuid="eval-$SUFFIX-$RANDOM"
  sid="eval-session-$SUFFIX-$RANDOM"

  {
    printf '{"parentUuid":null,"type":"user","message":{"role":"user","content":%s},"uuid":"%s","timestamp":"%s","gitBranch":"%s","sessionId":"%s","cwd":"/tmp/eval/%s"}\n' \
      "$(printf '%s' "$topic_user" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')" \
      "$uuid" "$ts_iso" "$branch" "$sid" "$FAKE_REPO_NAME"
    printf '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":%s}]},"timestamp":"%s"}\n' \
      "$(printf '%s' "$topic_assistant" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')" \
      "$last_ts_iso"
  } > "$file"

  # Touch with desired mtime so discover-sessions.sh -mtime filtering picks it up.
  touch -t "$(date -u -r "$last_ts_s" +%Y%m%d%H%M.%S 2>/dev/null \
              || date -u -d "@$last_ts_s" +%Y%m%d%H%M.%S)" "$file"
}

write_session \
  "$FIXTURE_DIR/session-styles.jsonl" \
  "feat/styles-refresh" \
  6 \
  "tighten the spacing on the marketing page hero section" \
  "Adjusted hero padding and grid gap; preview looks balanced now."

write_session \
  "$FIXTURE_DIR/session-docs.jsonl" \
  "chore/docs-cleanup" \
  30 \
  "rewrite the contributor onboarding README so the prerequisites section is shorter" \
  "Trimmed the prerequisites list to 4 items and moved the optional tools section below."

write_session \
  "$FIXTURE_DIR/session-tests.jsonl" \
  "test/snapshot-stabilization" \
  72 \
  "the snapshot tests are flaky, can you make them deterministic" \
  "Switched the date-based fixture to a frozen clock; suite is now stable across 50 runs."

printf 'FIXTURE_DIR=%s\n' "$FIXTURE_DIR"
printf 'FAKE_REPO_NAME=%s\n' "$FAKE_REPO_NAME"
