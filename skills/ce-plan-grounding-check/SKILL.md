---
name: ce-plan-grounding-check
description: "Verify an implementation plan against the actual code, fixtures, contracts, and tests before it is marked implementation-ready or before ce-work starts. Use when a plan says implementation-ready, before starting any ce-work unit, or when asked whether a plan is grounded."
argument-hint: "[path/to/plan.{md,html}]"
---

# Plan grounding check

Run after `ce-plan` writes a Durable software plan and before any unit of `ce-work` begins; run again whenever a plan carries `artifact_readiness: implementation-ready`. The check may read anything in the repository and run read-only scripts. It must not change product code or plan text. Its output is a readiness review file and a verdict.

The failure it exists to stop: a planning chain built document-on-document, where later documents cite files, helpers, fields, fixtures, and pipelines by name without anyone opening them.

**Done when:** the claim ledger is complete, every red row cites file and line (or is marked unverified), the review file is written, and the verdict is one of the two values below.

<!-- ce-docs-root:start -->
**Resolve the CE artifact root `<root>` before composing any artifact path.**

- **Read** `docs_root` from `<repo-root>/.compound-engineering/config.yaml` only (`<repo-root>` = `git rev-parse --show-toplevel`). Do not read it from `config.local.yaml`. Unset -> `<root>` is `docs`, exactly as before.
- **Validate** a set value: a repo-relative directory whose real, symlink-resolved path stays inside the repo and is neither the repo root nor under `.git/`. Otherwise stop with an error naming `docs_root` and the value -- never fall back to `docs`.
- **Use** `<root>` as the sole artifact location: create it if absent, compose each path as `<root>/<subdir>` with this skill's own subdirectory, and never also read `docs`.
<!-- ce-docs-root:end -->

## Inputs

The plan under review (the invocation path, or the newest Durable software plan under `<root>/plans/` when none is given) and every document in its `sources:` frontmatter. The repository root: code, fixtures, packs, contracts, tests, house-rule files.

If the path is missing or unreadable, stop. Do not invent a plan.

## Workflow

**STOP. Read `references/check.md` before building the ledger or writing the review.** It owns the eight steps, claim kinds, fixture mapping, pipeline-arrow rule, semantics-parity rule, house-rule scan, and the review file shape. If that reference cannot be read, stop and report the blocker; do not reconstruct the steps from memory.

Run the bundled profiler against every fixture or pack the plan relies on. Resolve a working Python interpreter by probing execution, then invoke the script. Repeat the probe in every self-contained shell block (each tool call is a fresh shell):

```bash
SKILL_DIR="<absolute path to this skill>";
PY="$(for c in python3 python py; do command -v "$c" >/dev/null 2>&1 && "$c" -c '' >/dev/null 2>&1 && { echo "$c"; break; }; done)"; [ -n "$PY" ] || { echo "no working Python 3 interpreter on PATH" >&2; exit 1; };
"$PY" "$SKILL_DIR/scripts/pack_reality.py" <files...>
```

Paste the profiler output into the review. If no working interpreter is found, mark every fixture claim unverified and continue; do not skip the rest of the check.

Write `<root>/plans/<date>-<nnn>-<feature>-plan-readiness-review.md`. Verdict is one of:

- **implementation-ready** — no red ledger rows, no unsatisfiable fixtures, every pipeline arrow has code, no unamended rule contradictions.
- **amend then re-check** — list the amendments. The caller resets or withholds `artifact_readiness` until a re-check passes.

`artifact_readiness: implementation-ready may only be set by a passing plan-grounding-check review`. This skill does not write that flag. The caller (`ce-plan` Phase 5.3.85, or the human) sets it only on a passing verdict.

## Rules

- Read the data, not the description of the data. Counts and hashes beat prose.
- Cite file and line for every finding; a finding without a citation is a hypothesis.
- Prefer discovering an existing mechanism over recommending new invention; name it and say who authored it.
- Change no product code and no plan text. Produce the review and hand amendments back.
- Per-unit re-check at the start of `ce-work`: repeat path and fixture steps for that unit's files and fixtures only, before writing the first test.
