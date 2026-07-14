# Product Principles

Product principles gate PRD completeness: the PRD is not final until every applicable principle is addressed. This encodes product rigor into the flow rather than emitting a free-form template.

## Baseline (ships with the skill)

Every PRD must address each of these, or explicitly record why one does not apply:

- **Target user and problem** — who this is for and the specific problem it solves.
- **Success metrics** — how success is measured; the observable signal the idea is working.
- **Data capture** — what data the product captures, and why.
- **Measurability / instrumentation** — what must be instrumented to know it works in the wild.
- **Explicit non-goals** — what is deliberately out of scope.
- **Edge and error states** — what happens on empty, invalid, failure, and boundary conditions.
- **Privacy and data handling** — how user/sensitive data is treated.

The baseline is a single list for all prototypes in v1; the interview layers org- and product-specific principles on top.

## Org-specific principles: load, interview, persist

**Read order** — use the first that exists:

1. **Repo copy** — `.compound-engineering/product-principles.md` at the **repository root**, resolved via `git rev-parse --show-toplevel` (not the current working directory — otherwise a run from a subdirectory like `apps/web/` reads/writes a different file and later runs from the root miss it). This is the active, gating copy; versioned with the repo, shareable with the team. When there is no git repo, fall back to the current working directory.
2. **User-global store** — `~/.config/compound-engineering/product-principles.md` (honor `XDG_CONFIG_HOME` when set; fall back to `$HOME/.compound-engineering/product-principles.md` when `~/.config` is unavailable). This is the cross-repo store, so a PM does not re-answer per project.
3. **Interview** — only when neither exists or the found copy is incomplete: ask the PM for org- and product-specific principles (e.g., an accessibility bar, a compliance constraint, a north-star metric).

Use only `$HOME`/XDG paths — no agent-platform environment variable — so this works across harnesses.

**Persist on capture.** When principles are interviewed or updated:
- Write the repo copy at the repo-root `.compound-engineering/product-principles.md` (same `git rev-parse --show-toplevel` resolution as the read path).
- Offer to update the user-global store so later runs in other repos reuse them (do not write the global store without the PM's ok).

Later runs read the doc instead of re-interviewing.

## The completeness gate (Phase 5)

Before finalizing the PRD, check it against the baseline plus any org principles. For each principle, it is either addressed in the PRD or explicitly marked not-applicable with a reason. If any applicable principle is unaddressed, surface the specific gaps and resolve them (loop back to Phase 4 or ask the PM) before finalizing. Do not emit a final PRD with an unaddressed applicable principle.
