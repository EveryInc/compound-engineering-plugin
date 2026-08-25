# Phase 3: capture the requirements-only unified plan

### Phase 3: Capture the Requirements-Only Unified Plan

Write or update a requirements-only unified plan only when a file was earned — see `references/brainstorm-sections.md` "Decide whether a doc is warranted at all" for the condition and the bug-fix stress test. Otherwise the chat paragraph from Phase 2.5 is the result and the decisions flow downstream (ce-plan's prompt, commit message, <root>/solutions/) without a brainstorm artifact in the middle.

When a doc is warranted, compose it using:

- `references/brainstorm-sections.md` — section contract (unified plan skeleton contract, Product Contract hard floor, include-when-material catalog, agency rules, ID conventions).
- The format-specific rendering reference for the `OUTPUT_FORMAT` resolved at Phase 0.0 — read `references/markdown-rendering.md` (md) or `references/html-rendering.md` (html) **now**, before composing. It defines how the format presents the sections and was deliberately deferred from Phase 0.0; composing without it produces format drift the section contract alone cannot prevent.

Session-settled decisions land in the Product Contract's Key Decisions section carrying their `session-settled:` annotation (shape in `references/settled-decisions.md`), so `ce-plan` enrichment inherits the label into plan KTDs.

**Write tight.** A section being material is not license to pad it. Hold every kept section to the prose-economy discipline in `references/brainstorm-sections.md`: lead with the decision or outcome, one idea per sentence, a requirement is intent plus at most one qualifier, defer forks to Outstanding Questions rather than specifying both arms, resolve superseded text in place rather than stacking strata.

`SKILL.md` states the artifact contract — path shape, frontmatter fields, title, and the Goal-Capsule-plus-Product-Contract body — and it is not restated here. What this step adds: do not allocate a daily sequence number; reserve the candidate path atomically with exclusive creation, retrying the smallest available numeric collision suffix (`-2`, `-3`, …) before the extension rather than overwriting; the extension follows `OUTPUT_FORMAT`; the Goal Capsule holds objective, product authority, and open blockers; there is no conventional-commit prefix on the title. `references/brainstorm-sections.md` owns the artifact content rules, including repo-relative file paths inside the doc.

**Ready for Planning Check.** After writing the actual file, run the four checks in `references/brainstorm-sections.md`: Complete, Consistent, Focused, and Usable by planning. Fix failures in place when the correction preserves settled intent, then rerun the failed checks. If a correction would choose or change product behavior or scope, ask one targeted question, update the artifact after the answer, and rerun the checks. When confirming in chat after the pass, report the artifact with its absolute path so the reference is clickable.

#### Vocabulary Capture — after the requirements-only unified plan (only if CONCEPTS.md already exists)

**Skip this step entirely if `CONCEPTS.md` does not exist at repo root** — creation is owned by ce-compound and ce-compound-refresh.

Run this **after** the approaches, the scope synthesis, and the requirements-only unified plan — that is where the canonical term often gets chosen or corrected, so capturing during early dialogue (before this point) would miss the final resolved name. If it exists, scan the full dialogue and the Product Contract for **resolved** domain terms — terms where the conversation actively pinned down a precise local meaning, not terms merely mentioned in passing. **Resolved means the definition is settled, not still under discussion.** Provisional terms that may still revise stay in the conversation only.

For each resolved term: if missing, add it; if present but new precision surfaced, refine it; if already consistent, no action. A term whose whole meaning an existing entry already carries is a refinement of that entry, not a new heading. Folding an existing entry is owned by ce-compound and ce-compound-refresh; retiring or deleting one is ce-compound-refresh's alone.

**Domain entities, named processes, and status concepts with project-specific meaning only.** Not file paths, class names, function signatures, or implementation decisions — `CONCEPTS.md` is a glossary, not a spec or catch-all.

Follow the format set by existing entries. Apply edits silently. (If Phase 3 skipped the doc, still run this against the resolved dialogue.)
