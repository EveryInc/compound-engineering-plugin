# Step 1: artifact root and settled-decisions brief (LFG)

## Artifact root

Resolve `<root>` when you first compose a `<root>/` path, never before you need it. LFG composes only one such path: the `<root>/plans/` location where step 1's GATE checks that the plan was written. A run that stops before that check never composes a `<root>/` path and never resolves a root. Two examples: a routing-carrier blocker (a stage assignment LFG cannot pass on, as `references/stage-routing.md` defines), or a report that the task is non-software.

<!-- ce-docs-root:start -->
**Resolve the CE artifact root `<root>` before composing any artifact path.**

- **Read** `docs_root` from `<repo-root>/.compound-engineering/config.yaml` only (`<repo-root>` = `git rev-parse --show-toplevel`). Do not read it from `config.local.yaml`. Unset -> `<root>` is `docs`, exactly as before.
- **Validate** a set value: a repo-relative directory whose real, symlink-resolved path stays inside the repo and is neither the repo root nor under `.git/`. Otherwise stop with an error naming `docs_root` and the value -- never fall back to `docs`.
- **Use** `<root>` as the sole artifact location: create it if absent, compose each path as `<root>/<subdir>` with this skill's own subdirectory, and never also read `docs`.
<!-- ce-docs-root:end -->

## Readiness check

An explicit `status: blocked` return is terminal even when `artifact_path` names a readable plan. Report its `phase`, `blocker`, and `recovery_path`, and its `artifact_path` when present. A plan file existing on disk is not a reason to retry planning or to move on to implementation.

The plan the GATE checks is the path `ce-plan` reported writing this run. A file already under `<root>/plans/` that `ce-plan` did not report is not a written plan, however closely it matches the feature. When the return has neither a blocker nor a reported path, invoke `ce-plan` the single allowed second time; never accept a stale file instead.

Inspect the returned plan before continuing past step 1's GATE. It must describe code implementation with sufficient scope, direction, and verification, and no launch-blocking question or finding. A Product Contract without implementation planning, an approach-only or answer-seeking output, or a non-code deliverable (`execution: knowledge-work`) stops the pipeline. An old readiness label cannot override the contents. `ce-work` owns verification of the active work's repository prerequisites; this gate does not duplicate that investigation.

## Settled-decisions brief

Compose this brief from the invoking conversation and pass it with the sanitized feature request when you invoke `ce-plan`.

The brief contains:

- direction (1-2 lines);
- settled decisions, each with four required fields: the decision, its provenance class (`user-directed` or `user-approved`), the rejected alternative, and a one-line reason;
- open areas;
- a standing line asking `ce-plan` to report any conflict it finds with these decisions.

If you cannot state an entry's rejected alternative, demote it to a directive or an open area. Include only decisions about the feature being shipped. When in doubt, demote: having `ce-plan` reconsider a decision is the safe direction; carrying in a stale decision as settled is not. If the conversation contains no settled decisions, skip composition entirely and invoke `ce-plan` exactly as it is written in the body, with no empty brief.

The brief is temporary: once `ce-plan` writes the plan, the plan's labeled KTDs are the record. A step-1 retry reuses the composed brief verbatim; never recompose it.
