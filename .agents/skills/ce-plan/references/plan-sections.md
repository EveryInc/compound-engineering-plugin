# Plan Sections

Describes what a great implementation plan contains. Rendering is handled by `markdown-rendering.md`.

## The outcome

A great plan enables three audiences to act:
- **Implementer** starts from an informed baseline — load-bearing decisions are named, research breadcrumbs orient investigation, unit boundaries are clear.
- **Reviewer** identifies load-bearing decisions and change boundaries in one pass.
- **Future reader** traces why work was done, what shaped it, and where artifacts live.

## Decide whether a plan doc is warranted

**Bias toward producing a plan.** Skip only when ALL hold:
- Work is **atomic** — fits in one commit, no meaningful unit boundaries.
- **No design choices** constrain implementation — no Key Technical Decisions worth recording.
- **No scope boundaries** worth pinning — scope is self-evident.
- **No upstream artifact** (brainstorm with R-IDs, incident report, prior plan) needs traceability.

Stress-test "looks atomic": "Add caching" hides TTL/invalidation/cache-key KTDs. "Migrate package A to B" hides semantic migration KTDs.

## Hard floor (required sections)

- **Summary** — what the plan proposes, 1-3 lines. Forward-looking.
- **Problem Frame** — why the work is being done. Backward-looking. May merge with Summary for compact plans.
- **Requirements** (R-IDs) — what must be true after shipping. Reviewer's checklist.
- **Key Technical Decisions** (KTDs) — load-bearing choices that constrain implementation. Each entry is `<decision>: <rationale>`.
- **Implementation Units** (U-IDs) — discrete units of work, independently landable. `ce-work` consumes these.

## Include when material

Include these sections only when they carry information not covered elsewhere:

- **High-Level Technical Design** — architecture, sequencing, state machines, branching gates. Skip for one-paragraph pattern applications.
- **Scope Boundaries** — when scope is contested, tempting non-goals exist, or "deferred" needs distinguishing from "outside product identity."
- **Open Questions** — genuinely unresolved items that block planning/implementation. Skip when complete; empty "Open Questions: none" signals false uncertainty.
- **System-Wide Impact** — cross-cutting concerns (data lifecycles, auth boundaries, performance, shared infra). Skip for localized changes.
- **Risks & Dependencies** — real risks (external service changes, version pins, behavioral assumptions). Skip for low-risk localized work.
- **Acceptance Examples** — state-dependent/conditional requirements where prose alone leaves ambiguity.
- **Documentation / Operational Notes** — docs, monitoring, runbooks, rollout steps. Skip for internal work with existing scaffolding.
- **Sources / Research** — research that orients the implementer or justifies load-bearing choices. Surface inline next to the KTD or unit it justifies, or as a dedicated section.

## Prose economy

- **One idea per sentence.** Summary is a handful of sentences, not one sentence with five semicolons.
- **A requirement or unit is intent plus at most one qualifier.** Forks go to Open Questions.
- **Cut hedges and intensifiers.** "Critically", "deliberately", "explicitly", "simply" carry nothing the implementer acts on.
- **Prefer verb to nominalization.** "Demote the grid", not "the demotion of the grid."

**Resolve in place; don't stratify.** Rewrite or remove original text rather than leaving strikethrough or stacking resolutions.

**Named test:** could the implementer find a contradiction in each section in one pass?

## Plan metadata fields

### Required
- **`title`** — verbatim plan title. Matches H1.
- **`type`** — conventional-commit prefix (`feat`, `fix`, `refactor`, etc.).
- **`status`** — `active` on creation; `ce-work` flips to `completed` on ship.
- **`date`** — ISO 8601 (`YYYY-MM-DD`).

### Optional but well-known
- **`origin`** — repo-relative path to upstream brainstorm doc.
- **`deepened`** — ISO 8601 date when confidence check first substantively strengthened the plan.
- **`execution`** — `code` (default) or `knowledge-work`. Routes to `ce-work`'s non-code carve-out.

## ID and content rules

- **Stable IDs.** R-IDs, U-IDs, A-IDs, F-IDs, AE-IDs. Never renumber to "clean up gaps."
- **Plain prefix.** `R1.`, `U1.` as bullet/heading prefixes. Do not bold.
- **Repo-relative paths.** Never absolute paths.
- **No process exhaust.** No "captured at Phase X" notes, no `## Next Steps`, no provenance lines.
- **Group Requirements by concern** when they span distinct logical areas. Group by capability, not discussion order. R-IDs stay continuous across groups.
