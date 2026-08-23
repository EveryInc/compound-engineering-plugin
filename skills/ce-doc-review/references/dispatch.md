# Dispatching the reviewers

## Run directory

Every review has a run directory before any reviewer is dispatched: it holds the manifest, each local persona's findings file, and any cross-model peer file, so a run can be measured and joined to the document it reviewed. Resolve it once per review, in the same shell call that creates it (shell state does not persist between tool calls), and pass the absolute path to every reviewer and to the cross-model pass as `<run-dir>`:

```bash
SCRATCH_ROOT="/tmp/compound-engineering-$(id -u)";
[ ! -L "$SCRATCH_ROOT" ] && (umask 077; mkdir -p "$SCRATCH_ROOT") 2>/dev/null && [ ! -L "$SCRATCH_ROOT" ] && [ -O "$SCRATCH_ROOT" ] && [ -w "$SCRATCH_ROOT" ] || SCRATCH_ROOT="${TMPDIR:-/tmp}/compound-engineering-$(id -u)";
if [ -L "$SCRATCH_ROOT" ]; then echo "unsafe scratch root symlink: $SCRATCH_ROOT" >&2; exit 1; fi;
(umask 077; mkdir -p "$SCRATCH_ROOT") || exit 1;
if [ -L "$SCRATCH_ROOT" ] || [ ! -O "$SCRATCH_ROOT" ]; then echo "scratch root is not owned by the current user: $SCRATCH_ROOT" >&2; exit 1; fi;
chmod 700 "$SCRATCH_ROOT" || exit 1;
RUN_ID="$(date +%Y%m%d-%H%M%S)-$(head -c4 /dev/urandom | od -An -tx1 | tr -d ' ')";
RUN_DIR="$SCRATCH_ROOT/ce-doc-review/$RUN_ID"; (umask 077; mkdir -p "$RUN_DIR") || exit 1; chmod 700 "$RUN_DIR" || exit 1;
echo "RUN_DIR=$RUN_DIR"
```

A new run id per review, including a round-2 review of the same document: a reused id would let a later reap touch an earlier round's jobs. Then write `run.json` (mode 600) into that directory with exactly these keys: `document` (the reviewed document's absolute path), `document_type`, `depth` (the document's metadata value, or null), `team` (the announced reviewer names), and `dispatched_at` (ISO 8601). Nothing deletes the run directory; the cross-model pass removes only its consumed `jobs/` subtree.

## Dispatch

Dispatch generic subagents with **bounded parallelism** using the platform's subagent primitive (e.g., `Agent` in Claude Code, `spawn_agent` in Codex) where available; otherwise run the work inline or serially. Omit the `mode` parameter so the user's configured permission settings apply. Respect the harness's active-subagent limit even at the 7-agent maximum: queue the selected reviewers, dispatch only as many as the harness accepts, and fill freed slots as reviewers complete. Treat active-agent/thread/concurrency-limit spawn errors as backpressure, not reviewer failure — leave the reviewer queued and retry after a slot frees, and if the harness cap is lower than the team size, queue the remainder rather than dropping it. Record a reviewer as failed only after a successful dispatch times out or fails, or when dispatch fails for a non-capacity reason that survives correcting the invocation.

For each selected reviewer, read `references/personas/<reviewer-name>.md` and pass its full content as `{persona_file}`. Do not dispatch standalone agents by type/name and do not rely on platform-level custom-agent registration.

**Model tiering lives here, not in prompt assets.** Local prompt files have no frontmatter and carry no model metadata. Apply these dispatch-time preferences when the platform exposes a known model override; otherwise omit the override and inherit the parent model rather than guessing a platform-specific model name:

- `coherence-reviewer`: cheapest capable extraction/reasoning tier.
- `security-lens-reviewer`, `feasibility-reviewer`, `product-lens-reviewer`, `adversarial-document-reviewer`: inherit the parent model unless the harness has an established high-capability review tier.
- `design-lens-reviewer`, `scope-guardian-reviewer`: platform mid-tier model.

Each subagent receives the prompt built from the subagent template included below, with these variables filled:

| Variable | Value |
|----------|-------|
| `{persona_file}` | Full content of the selected local prompt asset from `references/personas/` |
| `{schema}` | Content of the findings schema included below |
| `{document_type}` | "requirements", "plan", "unified-requirements", or "unified-plan" from Phase 1 classification |
| `{document_path}` | Path to the document |
| `{origin_path}` | Upstream Product Contract provenance extracted once during Phase 1: prefer the document's `origin:` frontmatter field when present; otherwise `product_contract_source:<value>` when present; otherwise `none`. Personas that adapt on provenance (product-lens, adversarial, scope-guardian) read this slot to gate technique suppression — they do NOT re-parse frontmatter themselves. |
| `{settled_ktds}` | Session-settled decisions extracted once during Phase 1: any Key Technical Decision **or Product Contract Key Decision** entries carrying a `session-settled:` annotation, listed as decision name, class (`user-directed` / `user-approved`), and rejected alternative; or the literal `none`. Personas read this slot — they do NOT re-parse the document for it. |
| `{document_content}` | Reviewer-specific slice. **Legacy** requirements/plan documents: pass the full document, never split. **Unified** artifacts can be large, so a section slice is the default rather than the full artifact — metadata, Goal Capsule, plus Product Contract for product-lens/adversarial/scope reviewers, and additionally Planning Contract and active Implementation Units/Verification/DoD for feasibility/coherence reviewers when `artifact_readiness: implementation-ready`. Escalate to a broader slice only when a reviewer needs cross-section traceability the initial slice cannot assess. |
| `{decision_primer}` | Round 1: the block below. Round 2+: read `references/decision-primer.md` and render per that file. |
| `{run_dir}` | The absolute `$RUN_DIR` from the Run directory step. |
| `{reviewer_name}` | The selected persona's short name (`coherence`, `feasibility`, `product-lens`, `adversarial`, ...), the same value the `reviewer` field carries. The orchestrator fills the artifact path `{run_dir}/{reviewer_name}.json` from this allowlisted name; the reviewer never derives the file name from its own output. For a reviewer run inline because the harness has no subagent primitive, the orchestrator writes that file itself from the return as received, stamping the return time. |

On round 1 — no prior decisions in this interactive session — set `{decision_primer}` to:

```
<prior-decisions>
Round 1 — no prior decisions.
</prior-decisions>
```

**Error handling:** if a subagent fails or times out, proceed with the findings from those that completed and name the failed reviewer in the Coverage section. Never block the whole review on one reviewer failure.
