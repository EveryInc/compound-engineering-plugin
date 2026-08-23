# Dispatching the reviewers

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

On round 1 — no prior decisions in this interactive session — set `{decision_primer}` to:

```
<prior-decisions>
Round 1 — no prior decisions.
</prior-decisions>
```

**Error handling:** if a subagent fails or times out, proceed with the findings from those that completed and name the failed reviewer in the Coverage section. Never block the whole review on one reviewer failure.
