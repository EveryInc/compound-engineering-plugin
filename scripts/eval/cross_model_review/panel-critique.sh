#!/usr/bin/env bash
# Fair cross-model PANEL critique: run codex + gemini through the SAME six review lenses the
# Claude ce-doc-review panel uses (coherence, feasibility, security, scope, product, adversarial),
# so a Claude-panel-vs-cross-model comparison isn't confounded by prompt asymmetry. Persists the
# FULL record per (model x lens) for post-hoc judging — nothing is truncated away.
#
# Usage:  panel-critique.sh <doc.md> [context.md]
# Output: full records under $CMRE_OUT_DIR (default /tmp/cmre-panel/records); a summary to stdout.
# Each run SENDS THE DOCUMENT to that vendor (codex -> OpenAI, gemini -> Google). gemini needs
# GEMINI_API_KEY. 12 calls total (6 lenses x 2 models); gemini can be slow — raise CMRE_TIMEOUT.
set -u

here="$(cd "$(dirname "$0")" && pwd)"
arms="$here/arms.py"

case "${1:-}" in -h|--help|"") sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0;; esac

plan="$1"; context="${2:-}"
[ -f "$plan" ] || { echo "error: doc not found: '$plan'" >&2; exit 2; }
if [ -n "$context" ] && [ ! -f "$context" ]; then echo "error: context not found: '$context'" >&2; exit 2; fi

out="${CMRE_OUT_DIR:-/tmp/cmre-panel}"; rec_dir="$out/records"; mkdir -p "$rec_dir"
arm="b_isolated"; [ -n "$context" ] && arm="c_fixed_context"
doc_id="$(basename "$plan" .md)"
timeout="${CMRE_TIMEOUT:-420}"

# Six lens rubrics, distilled from the ce-doc-review personas so the cross-model arms get the
# same coverage the Claude panel does.
lens_dir="$(mktemp -d -t cmre-lenses)"
cat > "$lens_dir/coherence.md" <<'EOF'
Review this document for INTERNAL CONSISTENCY: contradictions between sections, terminology drift,
dependency/sequencing claims that conflict, and ambiguity where two readers would diverge. Return
your findings as a JSON array of strings, one element per distinct finding; quote the conflicting text in each.
EOF
cat > "$lens_dir/feasibility.md" <<'EOF'
Review whether the proposed approach will SURVIVE CONTACT WITH REALITY: architecture conflicts,
dependency gaps, migration/cutover risks, environment assumptions, implementability. Challenge the
load-bearing claims. Return your findings as a JSON array of strings, one element per distinct finding; name the concrete risk in each.
EOF
cat > "$lens_dir/security.md" <<'EOF'
Review for SECURITY gaps: auth/authz assumptions, data exposure, credential handling, trust
boundaries, PII, and missing threat-model elements. Return your findings as a JSON array of strings, one element per distinct finding.
EOF
cat > "$lens_dir/scope.md" <<'EOF'
Review for SCOPE alignment and unjustified complexity: abstractions/frameworks larger than the goal
needs, scope creep beyond stated intent, premature generality, dependencies declared but not needed.
Return your findings as a JSON array of strings, one element per distinct finding.
EOF
cat > "$lens_dir/product.md" <<'EOF'
Review as a senior PRODUCT leader: are the premises sound? What strategic/adoption/trust
consequences (including for the people the system affects) does this carry even if the premise
holds? Where does the work drift from the goal? Return your findings as a JSON array of strings, one element per distinct finding.
EOF
cat > "$lens_dir/adversarial.md" <<'EOF'
ADVERSARIALLY stress-test this document: surface unstated assumptions, construct failure modes the
mitigations do not actually cover, name the cheaper/safer alternative it dismissed, and find any
irreversible step taken before its validation. Try to BREAK it. Return your findings as a JSON array of strings, one element per distinct finding.
EOF

run() {
	cli="$1"; lens="$2"
	if ! command -v "$cli" >/dev/null 2>&1; then
		printf '  [%-7s %-12s] SKIP — %s not installed\n' "$cli" "$lens" "$cli"; return
	fi
	cmd=(run-arm "$arm" "$cli" "$plan" "$lens_dir/$lens.md" --doc-id "${doc_id}__${lens}" --trial 1 --timeout "$timeout")
	[ -n "$context" ] && cmd+=(--context "$context")
	rec="$(python3 "$arms" "${cmd[@]}" 2>/dev/null)"
	printf '%s' "$rec" > "$rec_dir/${cli}__${lens}.json"
	n="$(printf '%s' "$rec" | python3 -c 'import json,sys
try:
    print(len(json.load(sys.stdin)["findings"]))
except Exception:
    print("ERR")')"
	printf '  [%-7s %-12s] findings=%s\n' "$cli" "$lens" "$n"
}

echo "Panel critique of: $plan   (arm=$arm)"
echo "Full records -> $rec_dir"
for lens in coherence feasibility security scope product adversarial; do
	echo "--- lens: $lens ---"
	run codex "$lens"
	run gemini "$lens"
done
echo ""
echo "DONE. Full records in $rec_dir — read them for the per-lens findings."
