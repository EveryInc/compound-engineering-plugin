# Getting the document, and classifying it

- **Path provided:** read it, then proceed. If the read fails or the file is not on disk, apply the missing-document gate below instead of continuing.
- **No path, interactive:** ask which document to review, or find the most recent under `<root>/plans/` with a file-search/glob tool.
- **No path, non-interactive:** output "Review failed: non-interactive mode requires a document path. Expected arguments: mode:non-interactive <path>" and stop without dispatching reviewers.

**Missing-document gate — verify before any dispatch.** Persona reviewers read from the filesystem and several run without Bash, so they cannot read git refs: a path that exists only on an unchecked-out branch wastes the entire persona team discovering they cannot proceed (issue #925). Confirm every resolved path is readable on disk before Phase 2. Location does not matter — an absolute path outside the checkout or a doc in another checkout reviews fine. If any path is unreadable, dispatch **no** personas:

- **Interactive:** stop and name the missing path(s): "Document(s) not found on disk: <paths>. Check out the branch containing them, use a worktree, or provide corrected readable paths before retrying the review."
- **Non-interactive:** output "Review failed: document(s) not found on disk: <paths>. Expected input: paths to readable files on disk; check out the branch containing them or provide corrected paths." and return without dispatching reviewers.

### Classify Document Type

Classify by **content shape and metadata, not file path** — under the unified plan contract a requirements-only and an implementation-ready plan both live in `<root>/plans/`, so location no longer signals type. Reviewers operate differently per classification, so a misclassification produces noisy or under-scrutinized findings.

First check the unified artifact contract (`artifact_contract: ce-unified-plan/v1`):

- `artifact_readiness: requirements-only` -> **`unified-requirements`**. Review the Product Contract only; the absence of Planning Contract, Implementation Units, Verification Contract, or Definition of Done is expected and must not be flagged.
- `artifact_readiness: implementation-ready` -> **`unified-plan`**. Review Product Contract and Planning Contract with different lenses, then Implementation Units/Verification/DoD for execution completeness.
- Progress-like readiness values (`active`, `in_progress`, `completed`, `done`) are invalid — a document-contract finding, not an execution state to honor.
- HTML unified artifacts (`.html`) use the same review and mutation routes. Apply changes in the document's native format and preserve its existing structure; never insert markdown syntax into HTML. For an ID-bearing HTML item, mirror the nearest sibling's structure and preserve both its anchor convention and visible ID text.

Otherwise decide between the two legacy types on these signals:

- **`requirements`** (what-to-build): frontmatter like `actors:`, `flows:`, `acceptance_examples:`, or brainstorm-shaped `status:`; headings such as `Acceptance Examples`, `Actors`, `Key Flows`, `User Flows`, `Outstanding Questions`, `Resolve Before Planning`; `R1`/`A1`/`F1`/`AE1` identifiers; framing on user/business problem, behavior, scope boundaries, success criteria; no implementation units, per-unit file lists, or unit-attached test scenarios.
- **`plan`** (how-to-build): frontmatter like `type: feat|fix|refactor`, `origin: docs/brainstorms/...`, or `product_contract_source: ce-brainstorm|ce-plan-bootstrap|legacy-requirements`; headings such as `Implementation Units`, `Output Structure`, `Key Technical Decisions`, `Risks & Dependencies`, `System-Wide Impact`; `U1`/`U2` unit identifiers; per-unit `Goal`/`Files`/`Approach`/`Test scenarios`/`Verification` fields; repo-relative paths to create/modify/test; framing on technical decisions, sequencing, implementer-facing detail.

**Tie-breaker:** treat the dominant content shape as authoritative; if shape is genuinely ambiguous, default to `requirements` (the conservative choice — it activates fewer plan-specific feasibility checks). Path location never disambiguates; a legacy `origin: docs/brainstorms/...` field still reads as a `plan` signal.

Pass the result to each persona via the `{document_type}` slot — personas adapt their analysis to it.

## Extract once, here, for the dispatch payload

Personas never re-parse the document for these, so Phase 1 extracts both and hands them down:

- `{origin_path}` — upstream Product Contract provenance: the document's `origin:` frontmatter when present, else `product_contract_source:<value>` when present, else `none`.
- `{settled_ktds}` — any Key Technical Decision **or Product Contract Key Decision** carrying a `session-settled:` annotation, listed as decision name, class (`user-directed` / `user-approved`), and rejected alternative; else the literal `none`.

An unfilled slot silently disables the provenance-gated technique suppression in product-lens, adversarial, and scope-guardian, so pass both even when the value is `none`.
