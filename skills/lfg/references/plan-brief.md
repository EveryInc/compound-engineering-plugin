# Step 1: artifact root and settled-decisions brief (LFG)

## Artifact root

Resolve `<root>` when you first compose a `<root>/` path, never before you need it. LFG composes one: the `<root>/plans/` location step 1's gate checks the plan was written to. A run that stops before that gate — a routing-carrier blocker, a non-software plan report — never composes a `<root>/` path and never resolves a root.

<!-- ce-docs-root:start -->
**Resolve the CE artifact root `<root>` before composing any artifact path.**

- **Read** `docs_root` from `<repo-root>/.compound-engineering/config.yaml` only (`<repo-root>` = `git rev-parse --show-toplevel`). Do not read it from `config.local.yaml`. Unset -> `<root>` is `docs`, exactly as before.
- **Validate** a set value: a repo-relative directory whose real, symlink-resolved path stays inside the repo and is neither the repo root nor under `.git/`. Otherwise stop with an error naming `docs_root` and the value -- never fall back to `docs`.
- **Use** `<root>` as the sole artifact location: create it if absent, compose each path as `<root>/<subdir>` with this skill's own subdirectory, and never also read `docs`.
<!-- ce-docs-root:end -->

## Readiness check

An explicit `status: blocked` return is terminal even when `artifact_path` names a readable plan. Preserve and report its `artifact_path` when present, `phase`, `blocker`, and `recovery_path`; do not use artifact presence to retry planning or advance to implementation.

The plan the gate checks is the path `ce-plan` reported writing this run. A file already under `<root>/plans/` that `ce-plan` did not report — however closely it matches the feature — is not a written plan: a return with neither a blocker nor a reported path takes the single retry, never a stale artifact.

Read the plan metadata before continuing past step 1's gate. A plan carrying `artifact_contract: ce-unified-plan/v1` proceeds only when it is `artifact_readiness: implementation-ready` with `execution: code`. Every other value stops the pipeline: `artifact_readiness: requirements-only`, any unrecognized readiness value, an invalid progress-like readiness value, and `execution: knowledge-work`. An output that is not an implementation plan at all — an approach plan, an answer-seeking or universal output — stops it too, whether or not it carries the contract marker.

## Settled-decisions brief

Compose this brief from the invoking conversation and pass it with the sanitized feature request when you invoke `ce-plan`.

Contents: direction (1-2 lines); settled decisions, each with four required fields — the decision, its provenance class (`user-directed` or `user-approved`), the rejected alternative, and a one-line reason; open areas; and a standing report-conflicts line.

An entry whose rejected alternative cannot be stated demotes to a directive or open area. Scope topically — only decisions about the feature being shipped; when in doubt, demote (re-litigation is the safe floor; importing stale settlements is not). If the conversation contains no settled decisions, skip composition entirely and invoke `ce-plan` exactly as it is written in the body — no empty-brief ceremony.

The brief is transient: once `ce-plan` writes the plan, the plan's labeled KTDs are canonical. A step-1 retry reuses the composed brief verbatim — never recompose it.
