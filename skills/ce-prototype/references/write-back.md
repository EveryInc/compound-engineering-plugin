# Product Contract write-back

Load this only when the user applies decisions and this run has a directly related markdown brainstorm or plan — the path passed on invoke, passed by the calling skill, or named in this session as the file this prototype is for. If this run's scratch `decisions.md` exists, use it as the continuity capsule: decisions, adjustments, rejections, and the prototype path. Do not copy the file into the repo. Do not paste the prototype into the plan.

## Fail closed

- If the file is HTML, there is no related path, or more than one file could be the target: do not write. Recap in chat. Recommend `ce-brainstorm` or `ce-plan`. Do not mint a plan or a third note. Do not search the repo for a matching plan. Do not write under `<root>/plans/` or any other artifact root.
- If the markdown file has no `## Product Contract` heading: do not invent a file or a heading. Recap in chat. Recommend `ce-brainstorm` or `ce-plan`.

## What to edit

Scan headings. Edit `## Product Contract` only.

Do not edit Planning Contract, Implementation Units, Verification Contract, Definition of Done, Key Technical Decisions, or any other HOW section as content. Those sections are removed wholesale when readiness is downgraded (below), not rewritten.

## How to edit the Product Contract

1. Allocate the next unused R-ID and, when the decision has a state-dependent shape, the next unused AE-ID.
2. Add or update a Key Decision with `session-settled:` (`user-directed` or `user-approved`) and exact `Governs R…` links. The full normative rule lives on the governed R; the Key Decision does not restate it.
3. Resolve superseded Product Contract text in place. Do not append a resolutions layer.

## After write-back on an implementation-ready markdown plan

If the file was `artifact_readiness: implementation-ready`:

1. Set `artifact_readiness: requirements-only`.
2. Delete these HOW sections entirely: Planning Contract, Implementation Units, Verification Contract, and Definition of Done. Do not leave empty headings.
3. If a same-basename other-format sibling (`.md` / `.html`) is also `implementation-ready`, apply the same downgrade and strip.

`ce-plan` re-adds HOW on re-enrichment. `ce-work` refuses `requirements-only`.
