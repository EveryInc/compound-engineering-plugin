# Input Triage

Read this before classifying the invocation, discovering a plan, or deciding whether normal implementation may begin. It owns source resolution, mode and carrier parsing, recovery routing, plan-readiness classification, latest-plan discovery, and bare-prompt intake routing. Return the resolved source, execution class, tail owner, and any typed engine or recovery binding to the kernel; do not perform implementation writes here.

## Input Document

The **input document** for this run is the input this skill was invoked with — present in the current prompt or conversation, whether the user provided it directly or a calling skill passed it (e.g. `lfg` in `mode:pipeline`, which passes a plan path). It may be a plan or spec path, a `mode:` token followed by a path, or a bare work prompt. This reference calls it `<input_document>`; if nothing was provided, treat `<input_document>` as blank.

Invocation origin is not observable or relevant: apply the same source-resolution rules whether the user invoked `ce-work` explicitly or the host selected it automatically.

## Artifact Root

This skill discovers plans under `<root>/plans/`. Resolve `<root>` when you first compose a `<root>/` path (per the block below), never before you need it. A write to `<root>/...` and a read of `<root>/solutions/` both count as composing a `<root>/` path, so either one triggers resolution; only a run that touches no `<root>/` path at all -- a scratch-only or no-repo flow -- skips it; pass the resolved path to any subagent, not the config.

<!-- ce-docs-root:start -->
**Resolve the CE artifact root `<root>` before composing any artifact path.**

- **Read** `docs_root` from `<repo-root>/.compound-engineering/config.yaml` only (`<repo-root>` = `git rev-parse --show-toplevel`). Do not read it from `config.local.yaml`. Unset -> `<root>` is `docs`, exactly as before.
- **Validate** a set value: a repo-relative directory whose real, symlink-resolved path stays inside the repo and is neither the repo root nor under `.git/`. Otherwise stop with an error naming `docs_root` and the value -- never fall back to `docs`.
- **Use** `<root>` as the sole artifact location: create it if absent, compose each path as `<root>/<subdir>` with this skill's own subdirectory, and never also read `docs`.
<!-- ce-docs-root:end -->

## Recovery and Control Grammar

**Recovery activation comes first.** Before normal plan, path, blank-input, or bare-prompt classification, interpret whether the user is semantically asking to resume, inspect status, reap, or clean up an existing external implementation run and has supplied its run id. This is intent recognition, not verb-only matching. Validate the id with the controller's safe-id contract: `^[A-Za-z0-9._-]{1,128}$` and at least one non-period character. When this direct recovery intent is present, read `references/cross-model-execution.md`, use that run id as authoritative for the requested controller operation, and return the observed state or blocker. Recovery must not dispatch a new worker, select a new route, fall through to latest-plan discovery, or run either shipping tail. When every unit is already cleaned, **completed recovery is read-only reconciliation**: Do not rerun test, build, format, install, generation, or `verify-run`; report the stored unit and plan-wide verification receipts. If recovery intent is clear but the run id is missing, request the id instead of guessing or classifying the text as new work.

**Otherwise, parse a leading mode token.** If `<input_document>` begins with `mode:return-to-caller` (or the legacy aliases `mode:caller-owned-tail` / `caller:lfg`), strip that token before anything else and enter **Return-to-Caller Mode** — implement and locally verify only, then return the structured envelope instead of running the standalone shipping tail. Before the plan path, accept up to two optional carriers in this fixed order: first one compact JSON object prefixed exactly `implementation_engine:`, then one run id prefixed exactly `implementation_run:`. Fully validate and normalize both before any workspace action. The engine object must contain exactly four fields: `mode` is `prefer` or `require`; `target` is `codex`, `claude`, `grok`, `cursor`, or `composer`; `model` is a string pin or `null`; and `source` is a non-empty caller-visible provenance string. The run carrier is accepted only for return-to-caller recovery and must satisfy the safe-id contract above. Reject malformed JSON, missing/extra fields, invalid field types or values, an unsafe run id, an out-of-order carrier, or a duplicate carrier. The entire remaining string is the plan path. A mode token or carrier with no following path is an error; report it instead of treating control data as a bare prompt. Without either optional carrier, the original `mode:return-to-caller <plan-path>` form is unchanged and standing configuration remains eligible.

When `implementation_run:<safe-id>` is present, recovery wins over ordinary input classification: read `references/cross-model-execution.md`, use `resume --run-id <safe-id>` as the authoritative entrypoint, and return the normal Return-to-Caller envelope after reconciliation. Preserve the supplied `implementation_engine` binding when present. Do not resolve a different route, redispatch, reimplement, rerun completed verification, or start another caller tail.

When a valid `implementation_engine:` binding is present without recovery, **pre-controller discovery is read-only**. Do not run baseline, test, build, format, install, or generation commands in the canonical checkout before resolving the binding and initializing the external controller: those commands can create ignored or untracked artifacts before the controller records its clean starting point. Limit triage to reads such as metadata, source, configuration, branch, status, and command-availability probes. If a non-read probe is genuinely required to decide whether the route can start, run it only with artifact suppression and prove the canonical Git snapshot is byte-for-byte unchanged before continuing; otherwise stop with a route blocker.

**Resolve a session-carried plan before blank or bare-prompt classification.** When the current request is continuation language such as "proceed" and the conversation identifies exactly one current plan for this work — a plan/spec path or an in-conversation brief from `ce-plan` — that was authored, selected, or accepted, treat it as `<input_document>`; a brief enters as a bare prompt with `source_kind: prompt`. If multiple session plans are plausible, ask which one; do not choose by recency. Do not replace a concrete new work request with an unrelated earlier plan. This rule depends only on visible conversation state, never on whether invocation was explicit or automatic.

## Source Classification

Determine how to proceed based on what was provided in `<input_document>` after any mode token is stripped.

**Plan document** (input is a file path to an existing plan or specification): read the plan's metadata first — YAML frontmatter for a markdown plan, or the visible header text for an HTML plan (both formats carry the same fields).

- If it carries `artifact_contract: ce-unified-plan/v1`, classify `artifact_readiness` before reading the body.
  - `artifact_readiness: requirements-only` -> stop and tell the user this Product Contract needs `ce-plan` enrichment before implementation. Offer the exact `ce-plan <plan-path>` handoff.
  - `artifact_readiness: implementation-ready` plus `execution: code` -> continue to workspace setup using the unified-plan reader strategy in `references/work-intake.md`.
  - Any other readiness value or any non-code/unclassified execution mode -> do not auto-execute as code. Route `execution: knowledge-work` to the non-code carve-out; otherwise ask the user to return to `ce-plan` to produce an implementation-ready code plan.
  - Progress-like values (`active`, `in_progress`, `completed`, `done`) are invalid readiness values. Stop and ask for plan repair rather than guessing.
- If it carries `execution: knowledge-work`, this is a **non-code plan** — read `references/non-code-execution.md` and follow that carve-out instead of the code workflow.
- Otherwise (legacy plan, field absent, or `execution: code`) -> continue through the normal code lifecycle.

**Blank invocation latest-plan discovery:** when `<input_document>` is blank, glob `<root>/plans/*.md` and `<root>/plans/*.html`, inspect metadata for the newest candidates, and only auto-select a plan that is `artifact_readiness: implementation-ready` plus `execution: code` or a legacy code plan. Stop instead of silently executing when the newest matching artifact is requirements-only, `execution: knowledge-work`, an approach-plan, or an unclassified universal/answer-seeking output. Ask for an explicit path or a `ce-plan` enrichment step. **Superseded sibling:** if a requirements-only candidate has a same-basename file in the other format (`<basename>.md` / `<basename>.html`) that is `implementation-ready`, a format conversion left the requirements-only copy stale — select the implementation-ready sibling and execute it rather than stopping.

**Bare prompt** (input is a description of work, not a file path): read `references/work-intake.md` and follow its scan-and-route steps. Trivial work (1-2 files, no behavioral change) must skip only the task list, then pass the kernel's mandatory engine-before-write gate before implementing directly, with no unit execution loop. Do not treat an unclear prompt as external-worker authority. If discovery cannot state a concrete goal, bounded scope, and authoritative verification, clarify or route to `ce-plan` before any cross-model egress.
