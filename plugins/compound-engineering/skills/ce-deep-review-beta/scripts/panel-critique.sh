#!/usr/bin/env bash
# Fair cross-model PANEL critique: run the cross-model arms through the SAME six review lenses the
# Claude ce-doc-review panel uses (coherence, feasibility, security, scope, product, adversarial),
# so a Claude-panel-vs-cross-model comparison isn't confounded by prompt asymmetry. Persists the
# FULL record per (model x lens) for post-hoc judging — nothing is truncated away.
#
# Usage:  panel-critique.sh [--models <csv>] <doc.md> [context.md]
# Arms = codex + agy. agy is macOS-ONLY (read-only floor is a seatbelt). gemini was retired from
# the skill (it 410s 2026-06-18); the arms.py gemini arm remains for the cross-model eval. Records
# -> $CMRE_OUT_DIR (default /tmp/cmre-panel/records). Each run SENDS THE DOCUMENT to that vendor
# (codex -> OpenAI, agy -> Antigravity); arms can be slow — raise CMRE_TIMEOUT.
set -u

here="$(cd "$(dirname "$0")" && pwd)"
arms="$here/arms.py"

# Optional `--models <csv>` subset (default = all available arms = codex + agy). Lets a caller (e.g.
# ce-deep-review-beta's consent gate) restrict egress to exactly the consented models. Egress must
# equal consent, so the subset is filtered BEFORE running each arm -- never by discarding records
# post-hoc (the document would already have been sent). Unavailable / off-platform arms are
# warn-SKIPped per cell (not a missing binary, not agy off-macOS), never fatal: the rest still run.
models="codex agy"
if [ "${1:-}" = "--models" ]; then
	models="$(printf '%s' "${2:-}" | tr ',' ' ')"
	shift 2
fi

case "${1:-}" in -h|--help|"") sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0;; esac

plan="$1"; context="${2:-}"
[ -f "$plan" ] || { echo "error: doc not found: '$plan'" >&2; exit 2; }
if [ -n "$context" ] && [ ! -f "$context" ]; then echo "error: context not found: '$context'" >&2; exit 2; fi

# The agy arm's deny-write floor must deny writes to the REVIEWED document's repo, not arms.py's own
# location (matters for the installed skill reviewing a user's plan). Resolve it from the plan's
# directory; fall back to that directory when the plan isn't inside a git repo. arms.py reads CMRE_REPO_DIR.
plan_dir="$(cd "$(dirname "$plan")" && pwd)"
CMRE_REPO_DIR="$(git -C "$plan_dir" rev-parse --show-toplevel 2>/dev/null || printf '%s' "$plan_dir")"
export CMRE_REPO_DIR

out="${CMRE_OUT_DIR:-/tmp/cmre-panel}"; rec_dir="$out/records"; mkdir -p "$rec_dir"
arm="b_isolated"; [ -n "$context" ] && arm="c_fixed_context"
doc_id="$(basename "$plan" .md)"
timeout="${CMRE_TIMEOUT:-420}"

# Six lens rubrics, distilled from the ce-doc-review personas so the cross-model arms get the
# same coverage the Claude panel does.
lens_dir="$(mktemp -d -t cmre-lenses-XXXXXX)"
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
	if [ "$cli" = "agy" ] && [ "$(uname -s)" != "Darwin" ]; then
		printf '  [%-7s %-12s] SKIP — agy is macOS-only (read-only floor is a seatbelt)\n' "$cli" "$lens"; return
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
echo "Models: $models  (each runs all 6 lenses; models run in parallel — progress lines interleave)"

# One background subshell PER MODEL, each running the six lenses sequentially. Parallelizing across
# models (not across lenses) overlaps the slow arms while bounding concurrency to the model count --
# at most one in-flight request per vendor, which avoids rate-limit / resource contention. Each
# (model, lens) cell streams its own self-labeled progress line as it completes (R15: no silent
# multi-minute runs); lines from different models interleave, which is fine. Records key on
# ${cli}__${lens}.json, so parallel writers never collide.
run_model() {
	cli="$1"
	for lens in coherence feasibility security scope product adversarial; do
		run "$cli" "$lens"
	done
}
pids=""
for cli in $models; do
	run_model "$cli" &
	pids="$pids $!"
done
for pid in $pids; do wait "$pid"; done

echo ""
echo "DONE. Full records in $rec_dir — read them for the per-lens findings."
