# Grounding the POV (Phase 1 machinery)

Read this before dispatching scouts.

## Model Tiers

Dispatch is tiered by task shape, never hardcoded to a model name:

- **Extraction tier** — the project-grounding scout and the precedent-&-activity scout: search-and-quote work. Use the platform's cheapest capable model when the harness exposes a known override; otherwise inherit.
- **Generation tier** — the external-evidence researcher: web/docs retrieval and entailment checking. Use the platform's mid-tier model when a known override exists; otherwise inherit.
- **Ceiling tier** — the POV reasoning itself (the grounding gate, the skeptic synthesis, the subject-shape contract). This runs in the main conversation on the orchestrator's model; nothing is dispatched for it.

**Degradation rule.** When the platform's subagent primitive cannot select per-agent models, dispatch every scout on the inherited model and keep their read budgets — cost control then comes from the read budgets and the tier-sensitive scout count, not from tiering.

Classify a rejected scout dispatch by whether an agent launched: correct a pre-launch argument rejection once, leave capacity-limited work queued, and if another launch failure survives correction, gather that scout's bounded evidence inline and lower the verdict's stated confidence.

Create the scratch dir once, and reuse the echoed path for every scout this run:

```bash
SCRATCH_ROOT="/tmp/compound-engineering-$(id -u)";
[ ! -L "$SCRATCH_ROOT" ] && (umask 077; mkdir -p "$SCRATCH_ROOT") 2>/dev/null && [ ! -L "$SCRATCH_ROOT" ] && [ -O "$SCRATCH_ROOT" ] && [ -w "$SCRATCH_ROOT" ] || SCRATCH_ROOT="${TMPDIR:-/tmp}/compound-engineering-$(id -u)";
if [ -L "$SCRATCH_ROOT" ]; then echo "unsafe scratch root symlink: $SCRATCH_ROOT" >&2; exit 1; fi;
(umask 077; mkdir -p "$SCRATCH_ROOT") || exit 1;
if [ -L "$SCRATCH_ROOT" ] || [ ! -O "$SCRATCH_ROOT" ]; then echo "scratch root is not owned by the current user: $SCRATCH_ROOT" >&2; exit 1; fi;
chmod 700 "$SCRATCH_ROOT" || exit 1;
SCRATCH_DIR="$SCRATCH_ROOT/ce-pov/$(openssl rand -hex 4)";
(umask 077; mkdir -p "$SCRATCH_DIR") || exit 1; chmod 700 "$SCRATCH_DIR" || exit 1;
echo "$SCRATCH_DIR";
```

**Scoping applies on both paths.** Use the project's active instructions already in context. If the candidate cannot be scoped from the frame and existing context, allow one targeted root or workspace probe — whether this phase dispatches scouts or resolves the facts with bounded inline reads.

**Every scout payload carries the same context.** A fresh subagent does not inherit this conversation, so fill the persona files' `{subject}` / `{scratch-dir}` placeholders at dispatch: pass each scout the framed question (subject + intent), the named incumbent and the reversibility tier, and the resolved `<scratch-dir>` path — plus any user-supplied links for the external researcher. A scout seeded with only its generic persona grounds "some external thing" and can produce an empty or unfocused dossier.

**Tier-sensitive dispatch.** For **Tier 1** (reversible), run a single combined grounding pass: seed one subagent with `references/agents/project-grounding-scout.md` covering the candidate-specific project facts (incumbent, call-sites) at a tight read budget, and one with `references/agents/external-evidence-researcher.md`; skip the standalone precedent scout — on this tier the project-grounding scout's **prior-decision scan** (`<root>/solutions/`, ADRs, design docs) is the precedent check, so it must run. For **Tier 2/3**, dispatch the full fleet in parallel:

- **project-grounding scout** (extraction tier) — read `references/agents/project-grounding-scout.md` and seed a generic subagent with it. Run the **candidate-specific** slice fresh: the named incumbent for *this* candidate, its call-sites/footprint, incumbent-pain, exact runtime or framework constraints that materially affect compatibility, and the project/candidate/dependency license check. Do not start with generic shape discovery; the project floor (see `references/method.md`) still requires a freshly verified call-site and current compatibility evidence.
- **precedent-&-activity scout** (extraction tier) — read `references/agents/precedent-activity-scout.md` and seed a generic subagent with it. Always run its **local-doc precedent pass** (`<root>/solutions/`, ADRs, design docs — file reads, no tools needed); only its tracker/PR portion is capability-gated and degrades gracefully when those interfaces aren't reachable. Do **not** skip the whole scout for missing tracker access — that would drop the only path that surfaces a prior local adopt/reject decision.
- **external-evidence researcher** (generation tier) — read `references/agents/external-evidence-researcher.md` and seed a generic subagent with it; capability-gated on web tools. **Scale the remit to the tier so Tier 3's deeper-workup promise is real, not nominal:** at **Tier 3**, seed it with a deeper brief — a wider source net, a larger read budget, and *mandatory* two-source corroboration on every load-bearing claim (at Tier 3 a single-source claim cannot anchor the verdict); **Tier 2** uses the persona's standard budget and its prefer-two-sources default.

**Capability gating is two-level:** skip only a scout (or scout-portion) with **no reachable surface at all** — the project-grounding scout and the precedent scout's local-doc pass are file reads and always run; the tracker/PR reads and the external researcher are tool-gated and degrade. Let a scout that loses a tool mid-run self-report "unavailable." Never block on a missing surface — record it and let it lower the verdict's stated confidence, or trip the external floor (Phase 2) when the external leg is entirely absent.

**Populate the provenance buckets** from the returned dossiers and your own bounded inline-read observations, keeping them separate for Phase 2: *observed-project-facts* and *verified-external-facts* (these count as grounding) vs. *conversation-claims* and *unconfirmed-assumptions* from a warm invocation (these do not count until a scout or a bounded inline read of the authoritative source corroborates them). Read dossiers from their paths on demand; do not pull their bulk into this context.
