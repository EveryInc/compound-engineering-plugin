# CE Simplify Code Structural Pass Behavioral Eval

Use this evaluator-owned pack after a change to `ce-simplify-code`'s structural pass: `skills/ce-simplify-code/references/structural-pass.md`, `references/personas/structure-reviewer.md`, or the sentence in `references/standalone-report.md` that decides when the pass runs. It is not a runtime reference and must not be injected into the agent under test.

## Fixture

`ce-simplify-code-structure/build-fixture.sh <dest> [--with-diff]` builds a small notification service with four commits. The quiet-hours check is copied into three channel files, and two commits change all the copies together. `send.ts` switches over the channel names. `settings.ts` keeps its own channel list, which leaves out `push`, and a test pins that list. Adding `push` would change behavior, so a run must report it and must not apply it. `--with-diff` adds an uncommitted function with two restating comments to `settings.ts`.

`ce-simplify-code-structure/build-large-fixture.sh <dest>` builds on that fixture with seven more commits and five more planted problems:

- `format.ts` reads a brand that only `boot()` sets.
- `core/retry.ts` imports its attempt limit from `campaigns/promo.ts`, which changes in four commits.
- `formatMessage` has a `forPromo` option that only the promo code uses.
- `services/notifier.ts` only forwards to `send`.
- The digest feature is split across `models/`, `services/`, and `controllers/`, and all three change together.

## Scenarios

Run each one with `bun run test:skill-eval-cell -- --skill ce-simplify-code --hosts claude,codex --fixture <built fixture> --ref <WORKTREE|pre-ref> --task "<task>"`.

| Scenario | Fixture | Task | Passes when |
|---|---|---|---|
| `report` | plain | `/ce-simplify-code simplify src/` | Tree unchanged. The run reads `structural-pass.md` and dispatches the structure reviewer. The report groups the findings one change removes under that change. The missing `push` entry is reported as a possible defect or as not applicable, never as a plain refactor. |
| `fix` | plain | `/ce-simplify-code simplify src/, just fix them, no need to check with me` | Tests pass. The quiet-hours check exists once. `CHANNEL_OPTIONS` is unchanged. Nothing is committed. |
| `diff` | `--with-diff` | `/ce-simplify-code` | The run does not read `structural-pass.md` or dispatch the structure reviewer. |

Grade the workspace and the `FILES_READ`, `ACTIONS`, and `DELEGATES_DISPATCHED` trailers in each host's `stdout.txt`. Check any history claim in a report against `git log` in the fixture.

## Reference results (2026-11-06)

One trial per scenario and host. Pre is `173bd337f`. Post is the working tree before the reader-pass wording fixes, which clarified grouping, numbering, and the reviewer's overlap with the other reviewers without changing when the pass runs.

| Scenario | Claude pre | Claude post | Codex pre | Codex post |
|---|---|---|---|---|
| `report` | no grouping; called the missing `push` pinned by the test | grouped the quiet-hours copies, and the two channel lists, each under one change; reported missing `push` as a possible bug | one finding | one finding, now citing co-change history; missed the settings list |
| `fix` | pass | tests pass, list unchanged; also moved the quiet-hours check from the channel functions into `send()` and dropped their `now` parameter | pass | pass |
| `diff` | not run | pass | not run | pass |

What the runs showed:

- On Claude, the pass changed the report: findings were grouped by the change that removes them, and the drifted settings list was raised as a possible bug, not as a pinned value.
- On Codex the report was about the same as before. It read the reference and dispatched the reviewer, but found only the quiet-hours copies.
- Claude's post `report` made one false history claim: it said `push.ts` missed the 22:00 fix, but `push.ts` was added after that fix.
- Claude's post `fix` changed the signatures of the exported channel functions. Every caller was inside the scope and the tests pass, but a direct caller of `sendEmail` would no longer get quiet-hours suppression. The pre arm kept the check in the channels for exactly that reason. The redesign instruction was pulling against Step 3.

That last finding led to the sentence in `structural-pass.md` that every export keeps its signature and behavior. The `fix` grade then gained one check: calling each channel function directly still returns `null` in quiet hours and a message during the day.

## Rerun after the export rule (2026-11-06)

Post is the working tree with the reader-pass wording fixes and the export rule. Three trials per scenario and host.

| Scenario | Claude | Codex |
|---|---|---|
| `fix` | 3 of 3 pass; direct channel calls keep quiet hours in all three | 3 of 3 pass |
| `report` | 3 of 3: tree unchanged, findings grouped, missing `push` reported as a possible defect, the channel-table change listed as not applicable | 3 of 3 on the tree and the reference; one finding each time, the settings list never raised |

In every Claude report, the agent considered moving the check into `send()` and rejected it because direct callers of the exported functions would lose quiet hours. Every history claim in the six reports matched `git log`. Codex's reports stayed the same as before the change apart from citing history.

## Large fixture, `report` (2026-11-06)

One trial per arm. Pre is `173bd337f`, and post is the working tree with the export rule. The tree was unchanged in every arm, and every history claim matched `git log`. The table lists the seven planted problems: the two from the base fixture and the five from the large fixture.

| Planted problem | Claude pre | Claude post | Codex pre | Codex post |
|---|---|---|---|---|
| quiet-hours copies | found | found, grouped | missed | found |
| settings list missing `push` | missed | possible defect | missed | missed |
| brand read before `boot()` | missed | possible defect; passing the brand listed as not applicable | missed | missed |
| retry imports from promo | found | found, grouped with churn evidence | found | found |
| `forPromo` for one caller | missed | listed as not applicable | missed | missed |
| `notify` pass-through | found | found; asks before removing the export | found | found; keeps the export |
| digest split across layers | missed | listed as not applicable | missed | found; colocate and keep exports |
| **Total** | 3 of 7 | 7 of 7 | 2 of 7 | 4 of 7 |

Claude post also raised two real defects that nobody planted: a promo sent by SMS or push loses its opt-out line when the message is truncated, and promos never call `withRetry`. On the larger code base, Codex gained two findings from the pass, both of them problems that co-change history shows. It still reported nothing about the hidden start-up order, the one-caller parameter, or the drifted settings list, and it did not indent the removed findings under their change.

### Codex, three more post trials

All three left the tree unchanged and reported the same three grouped changes: the quiet-hours check, the retry import, and the digest feature with the wrapper folded into it. None reported the brand set at start-up, the `forPromo` option, or the settings list. That is 4 of 7 in every trial.

The cell keeps each reviewer's transcript under `<out>/user-config/codex/codex-home/sessions/`. In each trial, the main agent reported everything the structure reviewer returned, so the misses come from the reviewer. In two trials, the reviewer saw the missing problems and dismissed them:

- It called the brand state "existing import links". The persona says a link that an import already shows is not hidden. But the import shows only that `format.ts` uses `brand`. It does not show that `boot()` must run first.
- It treated the settings list as intended because a test pins it, and it left out special cases whose fix would change behavior. The persona asks for those to be reported. The main agent decides whether a change applies or should be reported as a possible defect.

## Rerun after the two reviewer fixes (2026-11-06)

`structure-reviewer.md` now says two more things. An import does not show a call order, or a value that must be set before it is read. And a finding is reported even when its change would alter behavior or a test pins the current behavior, because deciding whether a change applies happens after the review. Large fixture, post only.

| Run | Claude | Codex |
|---|---|---|
| `report`, 3 trials | 7, 7, 7 of 7 | 7, 4, 5 of 7 (was 4, 4, 4, 4) |
| `fix`, 1 trial | pass | pass |

On Codex, the brand set at start-up appeared in 2 of 3 reports, and the `forPromo` option and the settings list each appeared in 1. Each time it was listed as not applicable or as a possible defect, never as a change to make.

`fix` passes when the tests pass, nothing is committed, `CHANNEL_OPTIONS` is unchanged, and the exports still behave as before. For the exports, the grade checks quiet hours on each channel, `notify`, an uncapped `buildDigest`, `PROMO_MAX_ATTEMPTS` and four retry attempts, and the promo footer. Claude applied only the shared quiet-hours helper and skipped the rest with its reasons. Codex also moved the retry limit into `core/retry.ts` and moved the digest feature into `services/digest.ts`, keeping every old import path working through a re-export.

Two Claude reports still described the settings list as intended because a test pins it, though both reported it. One Claude report proposed deleting the exported `notify` because nothing in the repo imports it. The pre arm made the same proposal, and it was reported, not applied.

### Codex tokens

Totals are summed across the main agent and the reviewer sessions in each run's `codex-home/sessions/`.

| Arm | Total tokens | Uncached input | Output |
|---|---|---|---|
| pre, 1 trial | 476k | 52k | 3.4k |
| post, 7 trials (mean) | 743k | about 52k | about 6k |

Most of the increase is cached input: the structure reviewer is about 155k, and the main agent rises about 180k for the evidence and grouping. The pre arm has only one trial. Claude's runs record no token counts.

## Real repository, `report` (2026-11-06)

Post is the working tree with `scripts/structure-evidence.py`, the post-apply re-review, and not-applicable changes listed last. The scope was `src/lib/reports/` in a throwaway clone of a private Next.js and Python app: 41 files, 55 commits. The script ran in under a second. One trial per arm. Every tree was left unchanged.

A separate agent graded the four reports blind against the code and `git log`:

| Arm | Real | Partly | False | Trivial | Real structural |
|---|---|---|---|---|---|
| Claude pre | 16 | 6 | 1 | 1 | 5 |
| Claude post | 11 | 6 | 8 | 2 | 3 |
| Codex pre | 1 | 0 | 0 | 2 | 0 |
| Codex post | 4 | 1 | 0 | 1 | 2 |

What the runs showed:

- Codex gained both structural findings it reported: a helper map that a shared module imports from the diff engine, and reveal pacing that is mixed into the synthesis parser.
- Claude post grouped three real structural changes. But most of its false findings were proposed tests that already exist, and comments that explain a reason. Those came from the test and comment reviewers, not the structure reviewer. With one trial per arm, this gap may be variance.
- Claude post reported one false possible defect. It said two source maps disagree about which keys are X. They do disagree, but the keys involved never reach report stats.
- No arm found the largest structural problems in the scope. A rule about localized house reports is copied in two files, and the copies have drifted. The share card counts and folds sources with different rules than the permalink stats, though a comment says they match.

Codex tokens, summed across sessions:

| Arm | Total tokens | Uncached input | Output |
|---|---|---|---|
| pre | 2.51M | 220k | 7.0k |
| post | 3.21M (+28%) | 254k (+15%) | 10.6k |

### Claude, two more trials per arm

Same scope and task, graded blind by a second agent. Times were 2m 57s and 3m 06s before, and 3m 51s and 4m 20s after.

| Arm | Trial | Real | False | Real structural |
|---|---|---|---|---|
| pre | 1, 2, 3 | 16, 7, 13 | 1, 2, 2 | 5, 0, 6 |
| post | 1, 2, 3 | 11, 15, 16 | 8, 2, 3 | 3, 10, 9 |
| **mean** | pre / post | 12 / 14 | 1.7 / 4.3 | 3.7 / 7.3 |

- Over three trials, the pass roughly doubled the real structural findings. The first trial's drop was variance.
- The drifted copies were found only with the pass. The copied house-report rule appeared in two of three post reports, and the share-card count mismatch in one. Two post reports also found that the two citation rules have drifted, which changes what Explore cards show. No pre report found any of these.
- Every post report raised the same false possible defect: two source maps disagree about X keys, but the worker never emits the keys they disagree on. The reviewer confirmed the disagreement in code, but not that any input can reach it.
- The second grader found that `return data as OgCardInput` in `getReportCardFields`, graded real the first time, would fail a test that checks the card drops `user_id`. It counted as partly in this round.

### Rerun after the reachability sentence

`structure-reviewer.md` now says that copies which disagree are a defect only once the reviewer finds where a real input reaches the difference. One trial per host, checked by hand against the earlier grading, not blind.

- Claude (5m 36s) no longer raised the X-key defect. It listed unifying the two folding rules as not applicable because it changes output, which is correct. Its structural changes were the alias table, the `calendar_brief` constant, the text helper, and the shared 30-day window. It did not find the copied house-report rule or the share-card count mismatch. Its two possible defects were an error that `getDiffSummary` swallows without logging (real) and a 14-day comment next to a 16-day constant (trivial).
- Codex (4m 02s) dispatched one reviewer subagent and reported two findings, one of them structural (the alias table). It never raised the X-key defect before the sentence either. The thin report matches its earlier habit of dispatching fewer reviewers than the skill names, which the pre arm shows too. Tokens: 753k total, against 3.21M for the earlier post run, which dispatched three subagents.

The first Codex post run stopped to ask about a skill that the repository's own instructions require and that was not installed. The rerun went ahead. Both Codex arms dispatched only three of the five reviewers.

## Reviewer dispatch fix (2026-11-06)

Codex used to run some reviewers itself instead of waiting for a free agent slot. Codex allows three agents besides the caller at once. Step 2 now says to dispatch every reviewer as its own subagent and to run one inline only when dispatch is unavailable or fails. `reviewer-dispatch.md` says a full harness means wait, not run inline. Same scope and task. Agent counts come from the Codex session files.

| Run | Wording | Agents | Reviewers covered | Tokens | Time |
|---|---|---|---|---|---|
| Codex 1 | wait for a slot | 3 | 6: three were sent as follow-ups to agents that had already reviewed | 1.49M | 3m 16s |
| Codex 2 | wait for a slot | 3 | 6: combined in pairs | 1.01M | 3m 10s |
| Codex 3 | + one fresh agent per reviewer | 6 | 6 | 1.49M | 3m 10s |
| Codex 4 | + one fresh agent per reviewer | 5 | 5: the test reviewer's dispatch hit the agent limit, it was not retried, and the report said so | 1.61M | 3m 03s |
| Claude 1 | wait for a slot | 6 | 6 | n/a | 7m 03s |

- With only the "wait for a slot" wording, Codex did not run reviewers inline, but it fitted them into three agents. The added sentence says each reviewer starts in a fresh agent holding only its own rubric, never in a combined prompt or an agent that already ran another reviewer. After it, neither run shared an agent.
- One of the two later runs dropped a reviewer after a limit error, which the existing retry rule already forbids. That rule is left as it is and recorded here as a known gap.
- No run changed the fixture or made a commit.
