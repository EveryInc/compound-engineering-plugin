# CE Simplify Code Sizing Behavioral Eval

Use this evaluator-owned pack after a change to how `ce-simplify-code` sizes a pass, or how a caller scopes and sizes it: `skills/ce-simplify-code/references/single-pass.md`, the `size-cutoff:` handling in `skills/ce-simplify-code/SKILL.md`, lfg's step 3 in `skills/lfg/SKILL.md` and `references/review-followup.md`, or ce-work's `simplified_through` return. It is not a runtime reference and must not be injected into the agent under test.

The contract under test:

- A caller may pass `size-cutoff:<N>`. The skill counts the changed lines of non-test source code in its scope. Below N, one combined reviewer runs every persona in a single pass; at N or more, the full team runs. The summary names the mode.
- Tests, fixtures, docs and plans, generated files, and blank lines do not count toward the size.
- Without the token, the skill behaves exactly as before: the full team at any size.
- The cutoff never skips a pass. Skipping a change of roughly under 10 lines stays lfg's own decision, made before the skill runs.
- When ce-work's return carries `simplified_through: <sha>`, lfg's step 3 scopes the pass to `git diff <sha>`, so code ce-work already simplified is not reviewed again.

## Method

The scripts live in `ce-simplify-code-sizing/`:

- `build-fixture.sh <dest> <l5|l12|l12noise|l45|ae6>` builds one throwaway repo. Each holds an order-pricing module with a committed baseline and a change of known size on top. `l12` adds 12 substantive code lines (a discount that re-implements an existing rounding helper) and a test file. `l12noise` adds the same plus a 40-line plan under `docs/plans/` and a 60-line test fixture, so an every-line count would reach the cutoff. `l45` adds 33 more code lines (tax and shipping, each re-implementing the same sum and rounding). `l5` commits a 5-line helper on a feature branch. `ae6` commits the tax and shipping code, records that commit as `.git/SIMPLIFIED_THROUGH`, then commits the 12-line discount on top.
- `run-scenario.sh <scenario> <post|pre> <trial> [hosts]` builds a fresh fixture and runs one cell on Claude and Codex through `bun run test:skill-eval-cell`. `post` uses the working tree; `pre` uses `45f221138`, main before this change. Output goes under `EVAL_DIR` (default `/tmp/ce-simplify-sizing`). Launch from a Claude Code shell under `env -u CLAUDECODE` (the script does this), and run trials side by side, for example `xargs -P 7 -L 1 run-scenario.sh < jobs.txt`.
- `grade.ts <run-out-dir> <host> <scenario> <arm>` reads the host's session log through `../lfg-stage-cost/collect.ts` and prints one JSON line. It counts subagents (every dispatched child, recursively), checks whether the run read the simplify skill, whether the final answer names single-pass, and whether files the pass must not touch are unchanged. For the post arm it lists failed expectations and exits non-zero.

| Scenario | Fixture | Task | What it tests |
|---|---|---|---|
| `cut12` | `l12` | `mode:pipeline size-cutoff:30`, invoked as lfg step 3 | 12 code lines under cutoff 30 run one combined reviewer and the summary names single-pass |
| `cut12noise` | `l12noise` | the same | Plan and fixture lines do not count, and the pass is not skipped |
| `cut45` | `l45` | the same | 45 code lines run the full team and the summary names the mode |
| `nocut12` | `l12` | `mode:pipeline`, invoked as lfg step 3 | No token means the full team, as before |
| `s_bare12` | `l12` | `/ce-simplify-code` | A standalone user run is unchanged: full team, report first, tree unchanged |
| `lfg5` | `l5` | lfg resumed at step 3 after a ce-work return | A 5-line change is still skipped by lfg |
| `lfg_ae6` | `ae6` | lfg resumed at step 3; the return carries `simplified_through` | Step 3 covers only the 12 lines after the SHA, in single-pass |

### What the grader checks

- `cut12`: at most one subagent (a combined reviewer, or inline review), and the final answer names single-pass.
- `cut12noise`: as `cut12`, and the plan and fixture files are unchanged.
- `cut45`: at least three subagents, and the final answer names a mode.
- `nocut12`: at least three subagents, and no single-pass.
- `s_bare12`: source tree unchanged, at least three subagents, and no single-pass.
- `lfg5`: no subagents, source tree unchanged, and the answer reports the skip.
- `lfg_ae6`: the run read `ce-simplify-code`, used at most one subagent, named single-pass, and left `taxFor`, `shippingFor`, and `grandTotal` (the code before the SHA) byte-identical.

The single-pass check matches `single pass` or `single-pass` in the final answer, but not `single pass with`, which a reviewer used once to describe a loop.

## Reference results (2026-11-04)

Pre is `45f221138`; post is the working tree with this change. Three trials per arm and host. Both arms are graded against the post expectations, so a pre failure shows what the change adds. Cells count passing runs.

| Scenario | Claude pre | Claude post | Codex pre | Codex post |
|---|---|---|---|---|
| `cut12` | 0 of 3 | 3 of 3 | 0 of 3 | 3 of 3 |
| `cut12noise` | 0 of 3 | 3 of 3 | 0 of 3 | 3 of 3 |
| `cut45` | 0 of 3 | 3 of 3 | 0 of 3 | 3 of 3 |
| `nocut12` | 3 of 3 | 3 of 3 | 3 of 3 | 3 of 3 |
| `s_bare12` | 3 of 3 | 3 of 3 | 3 of 3 | 3 of 3 |
| `lfg5` | 3 of 3 | 3 of 3 | 3 of 3 | 3 of 3 |
| `lfg_ae6` | 0 of 3 | 3 of 3 | 0 of 3 | 3 of 3 |

What the pre arm did:

- `cut12`, `cut45`, and `lfg_ae6` ran the full team of four reviewers. They named no mode, and in `lfg_ae6` they re-simplified the tax and shipping code before the SHA in all six runs.
- In five of six `cut12noise` pre runs, the agent read the unknown `size-cutoff:30` token as a skip threshold and ran no review at all. Claude counted every changed line; Codex counted 12 lines but still skipped. That is why `single-pass.md` says the cutoff is never a reason to skip.

In all three Claude `cut12noise` post runs, the combined reviewer deleted `tests/fixtures/lines.json`, a 60-entry file the current work added that nothing references. Tests and fixtures stay in scope for review and only stop counting toward the size, so the grader checks that the plan is untouched, not the fixture.

Grok did not run: it was not requested for this change.
