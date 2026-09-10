# Getting the document, and classifying it

- **Path provided:** read it, then proceed. If the read fails or the file is not on disk, apply the missing-document check below instead of continuing.
- **No path, interactive:** ask which document to review, or find the most recent under `<root>/plans/` with a file-search/glob tool.
- **No path, non-interactive:** output "Review failed: non-interactive mode requires a document path. Expected arguments: mode:non-interactive <path>" and stop without dispatching reviewers.

**Missing-document check — verify before any dispatch.** Persona reviewers read from the filesystem and several run without Bash, so they cannot read git refs. A path that exists only on an unchecked-out branch wastes the entire persona team discovering they cannot proceed (issue #925). Confirm every resolved path is readable on disk before Phase 2 (dispatch). Location does not matter — an absolute path outside the checkout or a doc in another checkout reviews fine. If any path is unreadable, dispatch **no** personas:

- **Interactive:** stop and name the missing path(s): "Document(s) not found on disk: <paths>. Check out the branch containing them, use a worktree, or provide corrected readable paths before retrying the review."
- **Non-interactive:** output "Review failed: document(s) not found on disk: <paths>. Expected input: paths to readable files on disk; check out the branch containing them or provide corrected paths." and return without dispatching reviewers.

### Resume a completed review

Reuse complete previous reviewer responses, evidence, classifications, and decision state when they cover the same document and scope, and the relevant source has not materially changed. Check the current document and the saved review state to confirm that they match and that the evidence is still current. A summary alone is not enough. A new interaction mode or a request to handle existing findings is not a new review.

On a valid resume, go directly to synthesis and presentation with the retained state. Preserve completed coverage instead of repeating the persona team or cross-model pass. Synthesis may obtain a limited independent local review when missing corroboration prevents resolution of a retained, worthwhile correction. Use the normal reviewer prompt and output contract from `references/dispatch.md` for that limited check. The reviewer must have a fresh context that has not seen the peer review. Supply the relevant document and source, agreed outcome, and constraints; do not supply peer claims, proposed fixes, or diagnostic questions derived from them. Choosing the relevant scope does not require telling the reviewer what problem to find. Reconcile new user decisions in synthesis. Missing complete evidence, material source changes, or an explicit request for a fresh review takes the normal dispatch path. Preserve prior decisions as history on either path. A rejected finding stays suppressed only while the evidence and assumptions supporting that rejection remain current; synthesis makes that check under rule R29 in `references/synthesis-and-presentation.md`.

### Classify Document Type

Classify by **content shape and metadata, not file path**. Under the unified plan contract a requirements-only plan and an implementation-ready plan both live in `<root>/plans/`, so location no longer signals type. Reviewers work differently per classification, so a misclassification produces noisy or under-scrutinized findings.

First check the unified artifact contract (`artifact_contract: ce-unified-plan/v1`):

- `artifact_readiness: requirements-only` -> **`unified-requirements`**. Review the Product Contract only; the absence of Planning Contract, Implementation Units, Verification Contract, or Definition of Done is expected and must not be flagged.
- `artifact_readiness: implementation-ready` -> **`unified-plan`**. Review Product Contract and Planning Contract with different lenses, then Implementation Units/Verification/DoD for execution completeness.
- Progress-like readiness values (`active`, `in_progress`, `completed`, `done`) are invalid. Report one as a document-contract finding; do not treat it as an execution state to honor.
- HTML unified artifacts (`.html`) use the same review and mutation routes. Apply changes in the document's native format and preserve its existing structure; never insert markdown syntax into HTML. For an ID-bearing HTML item, mirror the nearest sibling's structure and preserve both its anchor convention and visible ID text.

Otherwise decide between the two legacy types on these signals:

- **`requirements`** (what-to-build): frontmatter like `actors:`, `flows:`, `acceptance_examples:`, or brainstorm-shaped `status:`; headings such as `Acceptance Examples`, `Actors`, `Key Flows`, `User Flows`, `Outstanding Questions`, `Resolve Before Planning`; `R1`/`A1`/`F1`/`AE1` identifiers; framing on user/business problem, behavior, scope boundaries, success criteria; no implementation units, per-unit file lists, or unit-attached test scenarios.
- **`plan`** (how-to-build): frontmatter like `type: feat|fix|refactor`, `origin: docs/brainstorms/...`, or `product_contract_source: ce-brainstorm|ce-plan-bootstrap|legacy-requirements`; headings such as `Implementation Units`, `Output Structure`, `Key Technical Decisions`, `Risks & Dependencies`, `System-Wide Impact`; `U1`/`U2` unit identifiers; per-unit `Goal`/`Files`/`Approach`/`Test scenarios`/`Verification` fields; repo-relative paths to create/modify/test; framing on technical decisions, sequencing, implementer-facing detail.

**Tie-breaker:** treat the dominant content shape as authoritative. If the shape is genuinely ambiguous, default to `requirements`; that is the conservative choice because it activates fewer plan-specific feasibility checks. Path location never disambiguates. A legacy `origin: docs/brainstorms/...` field still reads as a `plan` signal.

Pass the result to each persona via the `{document_type}` slot — personas adapt their analysis to it.

## Extract once, here, for the dispatch payload

Personas never re-parse the document for these, so Phase 1 (this step) extracts both and passes them in the dispatch payload:

- `{origin_path}` — upstream Product Contract provenance: the document's `origin:` frontmatter when present, else `product_contract_source:<value>` when present, else `none`.
- `{settled_ktds}` — any Key Technical Decision **or Product Contract Key Decision** carrying a `session-settled:` annotation, listed as decision name, class (`user-directed` / `user-approved`), and rejected alternative; else the literal `none`.

The product-lens, adversarial, and scope-guardian personas use these slots to decide whether to suppress their premise-level techniques. An unfilled slot silently disables that suppression, so pass both even when the value is `none`.
