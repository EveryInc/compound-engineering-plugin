#!/usr/bin/env bash
# ce-deep-review-beta content preview for the consent gate. Emits exactly ONE JSON line:
#   {"status":"unavailable"}            gitleaks not installed OR the invocation errored ->
#                                       gate escalates to the sole-filter acknowledgment (does NOT block)
#   {"status":"ran","hits":[...]}       gitleaks ran successfully (hits may be empty == clean)
# --redact keeps secret VALUES out of the output (hits carry only line + rule + a redacted preview).
# Never blocks egress; the SKILL decides what to do with the result.
#
# An invocation error (gitleaks present but the run failed -- bad flag, config error, runtime fault)
# must NOT be reported as a clean "ran": that would open vendor egress under a false clean-scan
# signal. gitleaks documents exit 0 = no leaks, 1 = leaks found, and other nonzero codes (e.g. 2)
# for errors. We capture the exit code and treat anything outside {0,1}, or a missing/unparseable
# report, as "unavailable" so the gate routes to the escalated sole-filter path it already handles.
set -u
plan="${1:-}"
if [ -z "$plan" ] || [ ! -f "$plan" ]; then printf '{"status":"unavailable"}\n'; exit 0; fi
if ! command -v gitleaks >/dev/null 2>&1; then printf '{"status":"unavailable"}\n'; exit 0; fi

rep="$(mktemp -t gitleaks-XXXXXX)"
# gitleaks exits 0 when clean and 1 when leaks are found -- both mean it RAN. Any other code is an error.
gitleaks detect --no-git --source "$plan" --report-format json --report-path "$rep" --redact >/dev/null 2>&1
rc=$?
if [ "$rc" -ne 0 ] && [ "$rc" -ne 1 ]; then rm -f "$rep"; printf '{"status":"unavailable"}\n'; exit 0; fi

# Parse the report. A missing/unparseable report after an ostensibly-successful run is itself an
# error signal (e.g. gitleaks aborted before writing a valid report), so distinguish parse failure
# from a genuinely empty (clean) report rather than mapping both to "[]".
hits="$(python3 -c '
import json, sys
try:
    data = json.load(open(sys.argv[1]))
except Exception:
    print("__PARSE_ERROR__")
    sys.exit(0)
out = [{"line": d.get("StartLine"), "rule": d.get("RuleID"), "preview": (d.get("Match") or "")[:60]} for d in (data or [])]
print(json.dumps(out))
' "$rep" 2>/dev/null)"
rm -f "$rep"
if [ -z "$hits" ] || [ "$hits" = "__PARSE_ERROR__" ]; then printf '{"status":"unavailable"}\n'; exit 0; fi
printf '{"status":"ran","hits":%s}\n' "$hits"
