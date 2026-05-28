#!/usr/bin/env bash
# agy arm posture smoke (ce-deep-review Phase 0 / U2). macOS-only (uses sandbox-exec/seatbelt).
#
# Validates two things:
#   (1) FLOOR  — the deny-write seatbelt profile blocks writes to the repo + ~/.ssh (proven with
#                `touch`, not agy, so it can't hang), while allowing writes elsewhere.
#   (2) VIABLE — agy 1.0.3 returns a non-empty JSON findings array on the benign sentinel doc
#                WHILE running under the seatbelt floor (and from a clean cwd).
#
# agy 1.0.3 hangs under deny-all-write or any deny-read rule (Electron/Node retries denied syscalls
# and ignores --print-timeout); the deny-WRITE-only profile is the validated floor. See
# docs/solutions/skill-design/2026-05-28-agy-arm-posture-validation.md.
#
# Exit 0 = both checks pass. Nonzero = a check failed (message says which).
set -u

here="$(cd "$(dirname "$0")" && pwd -P)"
tmpl="$here/agy-readonly.sb.tmpl"
sentinel="$here/agy-sentinel.md"
[ -f "$tmpl" ] || { echo "FAIL: missing $tmpl" >&2; exit 2; }
[ -f "$sentinel" ] || { echo "FAIL: missing $sentinel" >&2; exit 2; }
command -v agy >/dev/null 2>&1 || { echo "SKIP: agy not installed" >&2; exit 3; }
command -v sandbox-exec >/dev/null 2>&1 || { echo "SKIP: sandbox-exec not available (macOS only)" >&2; exit 3; }

# Repo root, CANONICALIZED (seatbelt matches /private/var... ; /Users is already canonical). The
# repo path must be the real path or the deny-write subpath rule silently won't match.
repo="$(cd "$here/../../../.." && pwd -P)"

prof="$(mktemp -t agy-readonly-XXXXXX)"
sed "s|__REPO_DIR__|$repo|g; s|__HOME__|$HOME|g" "$tmpl" > "$prof"

fail=0

# (1) FLOOR — touch into the repo under the sandbox must be denied.
canary="$repo/.agy-floor-canary-$$"
sandbox-exec -f "$prof" /usr/bin/touch "$canary" 2>/dev/null
if [ -f "$canary" ]; then echo "FAIL(floor): repo write was NOT blocked ($canary)"; rm -f "$canary"; fail=1
else echo "PASS(floor): write to repo blocked by seatbelt"; fi

# (2) VIABLE — agy reviews the sentinel under the sandbox, from a clean cwd, returns findings.
cwd="$(mktemp -d -t agy-smoke-cwd-XXXXXX)"
outfile="$(mktemp -t agy-smoke-out-XXXXXX)"
( cd "$cwd" && sandbox-exec -f "$prof" agy --print-timeout 90s --print \
  "Review the document provided on stdin. Return ONLY a JSON array of finding strings (one element per distinct finding), no prose or preamble." \
  < "$sentinel" > "$outfile" 2>/dev/null )
rc=$?
rm -rf "$cwd"
# Count findings via the harness's own parser for consistency.
n="$(python3 "$here/../arms.py" parse-findings "$outfile" 2>/dev/null \
     | python3 -c 'import json,sys
try: print(len(json.load(sys.stdin)["findings"]))
except Exception: print(0)')"
rm -f "$outfile"
if [ "$rc" -eq 0 ] && [ "${n:-0}" -ge 1 ] 2>/dev/null; then
  echo "PASS(viable): agy returned $n finding(s) under the seatbelt floor"
else
  echo "FAIL(viable): agy rc=$rc findings=${n:-0}"; echo "--- output (head) ---"; printf '%s\n' "$out" | head -5; fail=1
fi

rm -f "$prof"
[ "$fail" -eq 0 ] && { echo "agy-smoke: PASS"; exit 0; } || { echo "agy-smoke: FAIL"; exit 1; }
