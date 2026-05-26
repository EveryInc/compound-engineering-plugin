#!/usr/bin/env bash
# Non-Claude blind judge for the decision-grade run. Scores the pooled, label-stripped findings
# with codex (OpenAI) or gemini (Google) -- NOT Claude -- which is what clears the judge-family
# confound (R4: a Claude judge may under-rate non-Claude-shaped findings). The judge sees finding
# uids + text + each doc's ground-truth bug, never the arm; arms are re-attached afterward via
# `run_arms.py gt-resolve` so the blind holds.
#
# Usage:  run-judge.sh <pool.json> <manifest.json> <codex|gemini> [out-verdicts.json]
#   pool.json     output of `run_arms.py gt-pool <records.json>`
#   manifest.json the corpus manifest (carries each known_failure doc's ground_truth.bug)
# Sends the findings to that vendor. gemini needs GEMINI_API_KEY. Verdicts -> out (default
# /tmp/cmre-judge-verdicts.json), ready for gt-resolve / gt-score / yield-score / aggregate.
set -u

here="$(cd "$(dirname "$0")" && pwd)"
runarms="$here/run_arms.py"

case "${1:-}" in -h|--help|"") sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0;; esac

pool="$1"; manifest="$2"; cli="${3:-codex}"; out="${4:-/tmp/cmre-judge-verdicts.json}"
[ -f "$pool" ] || { echo "error: pool not found: '$pool'" >&2; exit 2; }
[ -f "$manifest" ] || { echo "error: manifest not found: '$manifest'" >&2; exit 2; }
command -v "$cli" >/dev/null 2>&1 || { echo "error: judge cli '$cli' not installed" >&2; exit 2; }

prompt="$(python3 "$runarms" judge-prompt "$pool" "$manifest")"
cwd="$(mktemp -d -t cmre-judge-cwd)"   # clean cwd: the judge gets no ambient workspace
raw="/tmp/cmre-judge-raw.txt"

case "$cli" in
	codex)
		( cd "$cwd" && printf '%s' "$prompt" | codex exec -s read-only --skip-git-repo-check - ) > "$raw" 2>/dev/null
		;;
	gemini)
		( cd "$cwd" && printf '%s' "$prompt" | gemini -p "Return ONLY the JSON array of verdicts." --approval-mode plan --skip-trust -o text ) > "$raw" 2>/dev/null
		;;
	*)
		echo "error: judge cli must be 'codex' or 'gemini' (a non-Claude judge)" >&2; exit 2;;
esac

python3 "$runarms" judge-parse "$raw" > "$out"
n="$(python3 -c "import json;print(len(json.load(open('$out')))) " 2>/dev/null || echo ERR)"
echo "judge=$cli  verdicts=$n  -> $out"
[ "$n" = "0" ] && echo "  (0 verdicts — check $raw; the judge may have returned prose or hit a quota/auth error)"
