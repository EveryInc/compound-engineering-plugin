# Plan Sections

What a great implementation plan contains. Rendering in `markdown-rendering.md`.

## The Outcome

Three audiences: **Implementer** starts informed (decisions named, breadcrumbs orient, units clear). **Reviewer** finds load-bearing decisions and change boundaries in one pass. **Future reader** traces why, what shaped it, where artifacts live.

## Decide Whether a Plan Doc Is Warranted

**Bias toward producing.** Skip only when ALL hold: atomic (one commit, no unit boundaries), no KTDs, no scope boundaries worth pinning, no upstream artifact needing traceability.

**Stress-test atomic:** "Add caching" hides TTL/invalidation/KTDs; "Migrate A→B" hides semantic migration KTDs.

## Hard Floor (Required)

- **Summary** — what's proposed, 1-3 lines. Forward-looking.
- **Problem Frame** — why the work. May merge with Summary.
- **Requirements** (R-IDs) — what must be true after shipping.
- **Key Technical Decisions** (KTDs) — `<decision>: <rationale>`.
- **Implementation Units** (U-IDs) — discrete, landable work. `ce-work` consumes.

## Include When Material

Include only when carrying information not covered elsewhere:

- **High-Level Technical Design** — architecture/sequencing/state machines. Skip for one-paragraph patterns.
- **Scope Boundaries** — contested scope, tempting non-goals, or "deferred" vs "outside identity."
- **Open Questions** — unresolved items blocking planning/implementation.
- **System-Wide Impact** — cross-cutting (data lifecycles, auth, performance, shared infra).
- **Risks & Dependencies** — real risks (external changes, version pins, behavioral assumptions).
- **Acceptance Examples** — state-dependent/conditional requirements where prose leaves ambiguity.
- **Documentation / Operational Notes** — docs, monitoring, runbooks, rollout.
- **Sources / Research** — orienting breadcrumbs. Surface inline next to KTD/unit.

## Agent Agency

Catalog is floor, not ceiling. Agent picks: merge Problem Frame into Summary, subgroupings, detail level, diagrams.

## Prose Economy

One idea per sentence. Requirement/unit = intent + at most one qualifier. Cut hedges/intensifiers. Prefer verb to nominalization. Resolve in place (no strikethrough/stacked resolutions). **Test:** implementer finds no contradiction per section in one pass.

## Metadata Fields

**Required:** `title` (matches H1), `type` (conventional-commit prefix), `status` (active→completed), `date` (ISO 8601). **Optional:** `origin` (upstream brainstorm path), `deepened` (ISO date), `execution` (code/knowledge-work).

## ID and Content Rules

Stable IDs (R, U, A, F, AE — never renumber). Plain prefix (`R1.`, `U1.`, no bold). Repo-relative paths only. No process exhaust (no Phase X notes, Next Steps, provenance). Group Requirements by capability, not discussion order. R-IDs continuous across groups.
