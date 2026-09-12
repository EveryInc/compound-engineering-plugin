# Product Contract write-back

Load this only when the user applies decisions and this run has a directly related brainstorm or plan — the path passed on invoke, passed by the calling skill, or named in this session as the file this prototype is for. If this run's scratch `decisions.md` exists, use it as the continuity capsule: decisions, adjustments, rejections, and the prototype path. Do not copy the file into the repo. Do not paste the prototype into the plan.

Markdown and HTML artifacts both get written back. `ce-plan` already rewrites an `.html` plan in place on resume, and the HTML artifact carries a visible Product Contract, visible metadata, and stable section anchors, so the edits below have somewhere to land in either format.

## Fail closed

Where a branch below sends the run to a recap, that recap — the decisions, plus the prototype path when the run left one behind — is the run's complete result, not a degraded write-back. What fails closed is the write, not the run.

- If there is no related path, or more than one file could be the target: do not write. Recap in chat. Recommend `ce-brainstorm` or `ce-plan`. Do not mint a plan or a third note. Do not search the repo for a matching plan. Do not write under `<root>/plans/` or any other artifact root.
- If the file has no Product Contract section: do not invent a file or a section. Recap in chat. Recommend `ce-brainstorm` or `ce-plan`.
- If a supersession notice identifies another canonical file, do not write to the superseded copy. Name the canonical file and let the user confirm the target. If same-basename format siblings exist without a clear canonical path, ask which to use before writing.

## What to edit

Preserve the artifact's identity and execution kind while removing obsolete readiness metadata. Confine product edits to the Product Contract — the `## Product Contract` heading in markdown; in HTML it spans the `product-contract` and `product-requirements` sections.

**HTML invariants.** Skill isolation means `ce-plan`'s rendering reference cannot be loaded here, so the rules these edits depend on are restated. Every ID-bearing item you add or change carries both the anchor and the ID as visible text — `id="r7"` on the element and `R7.` readable inside it — because downstream agents grep the HTML the way they grep markdown. A `session-settled:` annotation is visible text in the Key Decision card with its stem verbatim, never an attribute or hidden markup. Use the document's own HTML structure; never insert markdown heading syntax into it.

Do not edit Planning Contract, Implementation Units, Verification Contract, Definition of Done, Key Technical Decisions, or any other HOW section as content. After a Product Contract change, those sections are removed wholesale (below), not rewritten.

## How to edit the Product Contract

1. Allocate the next unused R-ID and, when the decision has a state-dependent shape, the next unused AE-ID.
2. Add or update a Key Decision with `session-settled:` (`user-directed` or `user-approved`) and exact `Governs R…` links. The full normative rule lives on the governed R; the Key Decision does not restate it.
3. Resolve superseded Product Contract text in place. Do not append a resolutions layer.

## After write-back on a plan with implementation planning

When the Product Contract changes, remove any existing HOW sections, including incomplete planning. Record in the document that implementation planning must be regenerated to reflect the changed requirements.

Delete these HOW sections entirely: Planning Contract, Implementation Units, Verification Contract, and Definition of Done. Do not leave empty headings. In HTML they carry the stable anchors `planning-contract`, `implementation-units`, `verification-contract`, and `definition-of-done`; drop their links from the navigation region too, so it stops pointing at sections that no longer exist.

Edit only the file you were given. Canonicality across same-basename format siblings is `ce-plan`'s, not this skill's.

`ce-plan` re-adds HOW on re-enrichment. `ce-work` requires sufficient implementation direction before executing.
