# CI coverage and efficiency

CI protects the distributable plugin and converter. Release automation does not provide a second validation gate, so platform-specific regressions still belong before merge.

The `test` job always runs release metadata validation, strict plugin schema validation, the complete Linux test suite, and typecheck. PR title validation and the docs audit retain their existing coverage. `bun run test` is unchanged locally and in CI.

## Specialized job selection

`scripts/ci-scope.ts` selects the Windows job and the acpx/macOS jobs for pull requests. It compares the PR base SHA with the checked-out merge tree, including deleted paths and both sides of renames. It uses local git rather than an API's potentially truncated changed-file listing.

| Changed surface | Windows | acpx and macOS bash |
|---|---|---|
| Only `src/`, `docs/`, root README, changelog, or concepts | Skip | Skip |
| Skill Markdown, optionally with the above | Run | Skip |
| Any other path, including scripts, tests, dependencies, workflow, or an unknown new area | Run | Run |
| Empty, unavailable, or invalid comparison | Run | Run |
| Main push or manual dispatch | Run | Run |

Markdown inside skills contains executable scratch-root preambles. Those need real Git Bash coverage: Linux previously passed a shell primitive that failed on Windows. The acpx and macOS jobs exercise scripts and their test fixtures, so prose-only changes do not require them. The allowlist covers independent inputs rather than enumerating every dependency of those jobs; new and unclassified paths run everything.

The selector publishes its decision in the workflow summary. If the selector job fails or produces no output, specialized jobs run. The Linux gate starts independently, so classification adds no dependency to its critical path. Specialized jobs retain their names for existing required-check configuration.

New commits cancel older CI runs for the same PR. Main pushes and manual dispatches have unique concurrency groups and are never coalesced. All jobs run on main, providing an ongoing check of the selection boundary, and manual dispatch is the full-coverage escape hatch.

## Measuring further changes

Compare both elapsed time to green and aggregate runner time. Skipping a two-minute job saves runner capacity but does not shorten a three-minute independent Linux job. Count selector startup time against the savings. Compare similar changes and the same acpx range: expanding the supported range changes the network contract suite's cost.

Use Actions job/step timestamps and the per-file timing recipe in [CI wall-time notes](../solutions/developer-experience/always-on-agents-md.md#ci-wall-time-notes). Benchmark on hosted runners before claiming speedups; laptop worker counts are not a reliable proxy. Existing history records an 8% hosted-runner gain from splitting a slow file where a laptop proxy predicted 26%.

Before narrowing selection further, check full main runs for failures in jobs that the PR skipped and add a regression case to `tests/ci-scope.test.ts`. A changed job's dependencies must remain outside the independent-input allowlist. The full Linux suite deliberately has no per-test selector: many guards scan multiple skills and repository metadata, and an import graph alone cannot capture those dependencies.
