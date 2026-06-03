#!/usr/bin/env bash
# grok arm posture smoke (ce-deep-review Phase 0 / U1).
#
# As of grok 0.2.8 (2026-05-28) the headless `-p` reviewer is BLOCKED by a WebSocket-relay auth bug
# ("worker quit with fatal: Transport channel closed, when Auth(AuthorizationRequired)") that
# neither `grok login` nor `grok agent --reauth` clears (shell auth is healthy; the relay layer
# isn't). grok is therefore deferred from v1. See the U1 posture-validation solution doc.
#
# This script is the re-probe: run it after a grok version bump. The intended read-only posture
# (clean cwd + tools off + plan mode + no web search + no subagents + read-only sandbox) is baked
# in, so a green run both clears the relay bug AND validates the arm posture.
#
# Exit 0 = grok returned findings (relay fixed -> arm can ship). Exit 1 = still blocked.
set -u

here="$(cd "$(dirname "$0")" && pwd -P)"
sentinel="$here/grok-sentinel.md"
command -v grok >/dev/null 2>&1 || { echo "SKIP: grok not installed" >&2; exit 3; }

cwd="$(mktemp -d -t grok-smoke-cwd-XXXXXX)"
errf="$(mktemp -t grok-smoke-err-XXXXXX)"; outf="$(mktemp -t grok-smoke-out-XXXXXX)"
prompt="Review the following plan and return ONLY a JSON array of finding strings, one per distinct finding:
$(cat "$sentinel")"

grok --cwd "$cwd" -p "$prompt" \
  --output-format json --disable-web-search --no-subagents \
  --tools "" --permission-mode plan --sandbox read-only \
  --max-turns 20 > "$outf" 2> "$errf"
rc=$?
rm -rf "$cwd"

if grep -q "AuthorizationRequired\|Transport channel closed\|max_turns exceeded" "$errf" "$outf" 2>/dev/null; then
  echo "grok-smoke: BLOCKED — relay-auth bug still present (grok $(grok --version 2>/dev/null | head -1))"
  echo "--- stderr tail ---"; tail -3 "$errf"
  rm -f "$errf" "$outf"; exit 1
fi
# Working path: expect a non-empty JSON array of findings.
n="$(python3 "$here/../arms.py" parse-findings "$outf" 2>/dev/null \
     | python3 -c 'import json,sys
try: print(len(json.load(sys.stdin)["findings"]))
except Exception: print(0)')"
if [ "$rc" -eq 0 ] && [ "${n:-0}" -ge 1 ] 2>/dev/null; then
  echo "grok-smoke: PASS — relay fixed; grok returned $n finding(s) under the read-only posture"
  rm -f "$errf" "$outf"; exit 0
fi
echo "grok-smoke: FAIL — rc=$rc findings=${n:-0} (not the known relay signature; inspect output)"
echo "--- output head ---"; head -5 "$outf"; rm -f "$errf" "$outf"; exit 1
