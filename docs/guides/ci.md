# CI coverage and efficiency

CI protects the distributable plugin and converter. Release automation does not provide a second validation gate, so platform-specific regressions still belong before merge.

The `test` job always runs release metadata validation, strict plugin schema validation, baseline Linux tests, and typecheck. PR title validation and the docs audit retain their existing coverage. Ordinary `bun run test`, main pushes, and manual dispatches run the full suite.

## Linux test selection

PRs pass `--changed-since=<base SHA>` to the same test runner. `scripts/test-scope.ts` lists only expensive test groups; every other discovered test is baseline and runs on every PR. New tests therefore run without registration. Discovery honors `bunfig.toml` fixture exclusions. The runner uses exact file paths and retains parallel execution, lost-child recovery, timeout-only serial reruns, and failure propagation.

| Group | Inputs selecting it |
|---|---|
| Cross-model routes and integration | Any file under `skills/ce-work/`, `ce-code-review/`, `ce-doc-review/`, or `ce-pov/` |
| Work workspace | Any file under `skills/ce-work/` |
| PR babysitting snapshots | Any file under `skills/ce-babysit-pr/` |
| Setup health | `skills/ce-setup/`, `skills/ce-polish/`, `docs/guides/`, root `README.md`, or `.compound-engineering/config.example.yaml` |
| Prototype server | Any file under `skills/ce-prototype/` |

Changing a grouped test selects its entire group. Shared helpers and fixtures, runner/CI/dependency/configuration changes, unknown paths, and unavailable or empty comparisons run full coverage. Inputs inside an owning directory include prose and resources: the subprocess tests read these files as well as executing scripts. Outside those owners, converter source, ordinary documentation, ungrouped tests, and skill Markdown need only baseline coverage. Unrecognized skill executables run the full suite.

For a local comparison against a committed base:

```bash
bun run test --changed-since=<40-character-base-SHA>
```

This compares the base to `HEAD`, not uncommitted edits. Selected mode accepts only the optional `--timings=<path>` and `--update-timings` Bun flags; other arguments are rejected so a caller cannot accidentally narrow the baseline. Use an ordinary full run to verify working-tree changes.

The runner prints selection mode, file counts, groups, and fallback reason, and copies them to the Actions summary. Linux starts independently of the specialized-job selector. Actions uploads Bun's per-file timing data as `linux-test-timings`, including on test failure when available; a missing timing artifact does not turn a failing test green.

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

Before narrowing selection further, check full main runs for failures in groups or jobs that the PR skipped and add a regression case to the relevant selector test. Keep every transitive input in its owner mapping or the full-coverage fallback. Broad guards that scan multiple skills and repository metadata stay in baseline; an import graph alone cannot capture their dependencies.

The initial replay of 50 commits ending at `e86a51a744de2fc884752d86c817dc5351884fa2` selected baseline only for 10, some expensive groups for 9, and full coverage for 31. It omitted cross-model tests in 13 changes. Applying one local full run's summed case times estimates 22.5% less aggregate test work across that sample. This is a workload estimate, not a hosted wall-time speedup. The earlier 45/50 figure described specialized jobs, not Linux selection, and is not the same metric.

Full fallbacks in that sample included eval infrastructure such as `tests/skill-eval-cell/catalog.ts` (10 commits), `package.json` (7), and release metadata (6). These counts overlap. Those paths remain shared or unclassified; full selection is a conservative boundary, not evidence that every group depends on every changed file.
