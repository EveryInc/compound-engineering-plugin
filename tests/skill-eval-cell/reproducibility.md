# Reproducible evaluation evidence

This change preserves the inputs and evidence behind a grade. It does **not**
make provider/model output deterministic or turn the runner into a sandbox.
Existing host execution/permission policies are unchanged. Start with read-only
cells; write-enabled cells retain their pre-existing permission policies.

## Collection

Use a new output directory for each `run.ts` or `pack.ts` invocation. A nonempty
`--out` is now an error, before extraction or workspace replacement. A private
`.eval-owner` marker reserves an empty directory against another collector.
Do not delete that marker to resume an old run; choose a new directory instead.
The collector updates only its own in-progress summaries, using same-directory
rename so a normal interruption does not expose a half-written JSON summary.
This is not a power-loss durability or hostile-local-process guarantee.

Each cell writes:

- `task.md`: exact task text.
- `input-manifest.json`: actual extracted skill/initial workspace fingerprints,
  task SHA-256, harness source fingerprints, requested ref and resolved commit,
  timeout/Git options, runtime and explicitly unknown model state.
- `hosts/<host>/runtime.json`: CLI path, bounded version probe, unknown model state.
- The existing prompt, argv, output, exit and workspace evidence.
- `evidence-manifest.json`: fingerprints of the evidence roots after collection.

Fingerprints sort relative paths and hash exact bytes, entry types and executable
bits. They include empty directories and do not depend on the absolute root or
mtime. `.git` internals and symlink target contents are excluded. The Git status,
commit/file summaries remain evidence, not a replacement for a complete Git clone.
Symlinks are recorded without dereferencing; historical grading refuses such
bundles because the grader could otherwise follow an unsealed target.
Workspace criteria must address paths covered by the fingerprint. Traversal and
`.git` path components are rejected before collection and historical grading,
including when the requested file does not yet exist.

For a committed ref, resolve once to a commit and extract that commit. For
`WORKTREE`, HEAD is context only; the actual extracted content fingerprint is the
identity. The initial skill/workspace and task fingerprints are checked against
the collected bytes before grading.

Do not edit the skill/harness/evidence while a collection or regrade is running.
The checks detect ordinary drift, not an adversary replacing files and hashes
consistently or changing them between a check and a read.

## Packs and partial failure

Schema-v2 packs retain each complete scenario snapshot, its hash, the initial
result, and hashes of the grader's runtime dependencies. `grade.ts`, `hosts.ts`
and `path-shim.ts` currently form that dependency set; update `GRADER_FILES` if
that runtime import graph changes. Type-only catalog imports are not dependencies.

`pack.json` is written before collection and after each arm. An arm records
`collecting`, `graded`, or `collection-error`. Failed collection does not erase
completed arms. It never becomes a passing grade. Nonzero host exits and timeouts
remain their original grading failures, with their raw exit evidence preserved;
an exit code alone is not enough to diagnose an infrastructure versus model error.

A cell may still skip unavailable hosts under the original selection rules.
`summary.json` records wanted/run/skipped hosts: a successful subset is not a
claim that every requested host was tested. No-host collections fail.

## Historical regrading

```bash
bun tests/skill-eval-cell/regrade.ts /absolute/path/to/pack.json
```

The command uses the **recorded scenario**, never the current catalog. It requires
matching grader bytes and checks the evidence before and after grading. A new
`pack.regrade-<uuid>.json` report is written alongside the input pack. The input
pack and its original grades are never replaced. Reports identify the original
pack hash and both original/used grader fingerprints. Exit 0 means passing,
1 means failed/uncollected arms, and 2 means invalid input/integrity/usage.

When intentionally applying a changed grader to old observations:

```bash
bun tests/skill-eval-cell/regrade.ts /absolute/path/to/pack.json --use-current-grader
```

This still uses the frozen criteria and checks evidence. The report says
`changed-grader`; it is a new assessment, not proof of an agent improvement.
Archived TypeScript and saved commands are **never executed**. To reproduce the
original grader, use a trusted checkout matching the recorded dependency hashes.

Move or copy the **whole pack directory**, not only pack.json. Relative cell paths
are resolved beneath its current parent; obsolete absolute paths are not used.
Legacy packs without frozen provenance are refused rather than silently using
today's catalog. Preserve those originals; they cannot acquire missing historical
provenance retrospectively.

## Boundaries

Host CLI versions are probed with a timeout and output cap. A failed probe records
unknown, not a guessed version. No credentials, raw environment, or user config
are copied by the new metadata code. Existing prompts/workspace/stdout/stderr may
still contain sensitive material: review the **whole bundle** before sharing.

No explicit model selector was added. Requested/observed model remain null because
host defaults are inherited. User configuration/hooks, provider/model revisions,
external tools and services, and host wall-clock effects are not frozen. Source
hashes are recorded, not executable archives. This supports audit and historical
regrading, not hermetic replay or cryptographic authenticity.

## Mechanical tests

```bash
bun test --timeout 30000 \
  tests/skill-eval-cell/provenance.test.ts \
  tests/skill-eval-cell/reproducibility.test.ts \
  tests/skill-eval-cell/integration-reproducibility.test.ts
```

These tests use temp files and a fake CLI, never a provider or real credentials.
The integration tests copy the real driver modules into a temporary repo with a
small synthetic catalog. Unix subprocess cases are not Windows-native coverage.
Run `bun run test` in the complete checkout before merging. Mechanical success is
not live-model behavioral validation.
