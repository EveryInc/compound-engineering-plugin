#!/usr/bin/env bash
# Quick cross-model critique of a single plan/document.
#
# Runs the cross-model arms (codex = OpenAI, gemini = Google) as isolated reviewers over one
# document and prints each model's findings side by side. This is the turnkey path — the full
# four-arm eval (baseline + self-critic + judge) is agent-driven; see README.md.
# (agy/Antigravity was dropped — unreliable as a non-interactive reviewer; gemini needs GEMINI_API_KEY.)
#
# Usage:
#   critique.sh <plan.md> [rubric.md] [context.md]
#
#   <plan.md>    document to critique (required)
#   [rubric.md]  challenge rubric (optional; a built-in independent-challenge rubric is used if omitted)
#   [context.md] if given, models also receive this as a fixed context set (arm c_fixed_context);
#                otherwise they review the document text only (arm b_isolated)
#
# Each model run SENDS THE DOCUMENT to that vendor (codex -> OpenAI, gemini -> Google).
# A missing/unauthenticated CLI is skipped with a note rather than failing the whole run.
set -u

here="$(cd "$(dirname "$0")" && pwd)"
arms="$here/arms.py"

case "${1:-}" in
	-h|--help|"")
		sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'
		exit 0
		;;
esac

plan="$1"
rubric="${2:-}"
context="${3:-}"

if [ ! -f "$plan" ]; then
	echo "error: plan file not found: '$plan'" >&2
	exit 2
fi

# Built-in default rubric (kept self-contained so this works outside the repo layout).
if [ -z "$rubric" ]; then
	rubric="$(mktemp -t cmre-rubric)"
	cat > "$rubric" <<'EOF'
Independent challenge rubric: challenge the premise, surface unstated assumptions, name
unconsidered alternatives, and state what would falsify this plan. Be concrete and specific
to the document. Return findings, one per line.
EOF
elif [ ! -f "$rubric" ]; then
	echo "error: rubric file not found: '$rubric'" >&2
	exit 2
fi

arm="b_isolated"
if [ -n "$context" ]; then
	if [ ! -f "$context" ]; then
		echo "error: context file not found: '$context'" >&2
		exit 2
	fi
	arm="c_fixed_context"
fi

doc_id="$(basename "$plan" .md)"
timeout="${CMRE_TIMEOUT:-300}"   # per-arm timeout in seconds; override with CMRE_TIMEOUT (gemini can be slow)

run_one() {
	cli="$1"
	label="$2"
	if ! command -v "$cli" >/dev/null 2>&1; then
		printf '\n=== %s — not installed, skipped ===\n' "$label"
		return
	fi
	printf '\n=== %s — arm %s ===\n' "$label" "$arm"
	if [ -n "$context" ]; then
		rec="$(python3 "$arms" run-arm "$arm" "$cli" "$plan" "$rubric" --context "$context" --doc-id "$doc_id" --trial 1 --timeout "$timeout" 2>/dev/null)"
	else
		rec="$(python3 "$arms" run-arm "$arm" "$cli" "$plan" "$rubric" --doc-id "$doc_id" --trial 1 --timeout "$timeout" 2>/dev/null)"
	fi
	# Persist the FULL record (display below truncates to 240 chars). Set CMRE_OUT_DIR to keep
	# records for post-hoc judging — without this the full findings are unrecoverable after the run.
	if [ -n "${CMRE_OUT_DIR:-}" ]; then
		mkdir -p "$CMRE_OUT_DIR"
		printf '%s' "$rec" > "$CMRE_OUT_DIR/${cli}__${doc_id}.json"
	fi
	printf '%s' "$rec" | python3 -c '
import json, sys
try:
    r = json.load(sys.stdin)
except Exception:
    print("  (no or invalid output — the CLI may be unauthenticated or timed out)")
    sys.exit()
print("  status=%s  findings=%d  latency=%.0fs" % (r["status"], len(r["findings"]), r["latency_ms"] / 1000))
for f in r["findings"]:
    t = " ".join(f["text"].split())
    print("  - " + (t[:240] + ("..." if len(t) > 240 else "")))
'
}

echo "Cross-model critique of: $plan"
if [ -n "$context" ]; then
	echo "Rubric: $rubric  |  Context: $context"
else
	echo "Rubric: $rubric"
fi
run_one codex "codex (OpenAI)"
run_one gemini "gemini (Google)"
echo ""
