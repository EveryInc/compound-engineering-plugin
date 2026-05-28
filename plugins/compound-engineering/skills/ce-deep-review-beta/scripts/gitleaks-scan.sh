#!/usr/bin/env bash
# ce-deep-review-beta content preview for the consent gate. Emits exactly ONE JSON line:
#   {"status":"unavailable"}            gitleaks not installed -> gate degrades gracefully (does NOT block)
#   {"status":"ran","hits":[...]}       gitleaks ran (hits may be empty == clean)
#   {"status":"error","detail":"..."}   unexpected failure
# --redact keeps secret VALUES out of the output (hits carry only line + rule + a redacted preview).
# Never blocks egress; the SKILL decides what to do with the result.
set -u
plan="${1:-}"
if [ -z "$plan" ] || [ ! -f "$plan" ]; then printf '{"status":"error","detail":"plan not found"}\n'; exit 0; fi
if ! command -v gitleaks >/dev/null 2>&1; then printf '{"status":"unavailable"}\n'; exit 0; fi

rep="$(mktemp -t gitleaks-XXXXXX)"
# gitleaks exits 1 when leaks are found, 0 when clean -- both mean it RAN. Ignore exit code; read report.
gitleaks detect --no-git --source "$plan" --report-format json --report-path "$rep" --redact >/dev/null 2>&1
hits="$(python3 -c '
import json, sys
try:
    data = json.load(open(sys.argv[1]))
except Exception:
    data = []
out = [{"line": d.get("StartLine"), "rule": d.get("RuleID"), "preview": (d.get("Match") or "")[:60]} for d in (data or [])]
print(json.dumps(out))
' "$rep" 2>/dev/null)"
rm -f "$rep"
[ -n "$hits" ] || hits="[]"
printf '{"status":"ran","hits":%s}\n' "$hits"
