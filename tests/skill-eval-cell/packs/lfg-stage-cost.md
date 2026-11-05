# LFG Stage-Cost Baseline

Use this evaluator-owned pack to measure what an `lfg` run spends at each of its steps, and to compare a change to how `lfg`, `ce-doc-review`, or `ce-simplify-code` size their work against the numbers below. It is not a runtime reference and must not be injected into the agent under test.

Every run is a real `lfg` or vanilla run against a throwaway repository. Costs come from the host's own session logs on the machine that ran it, so this pack runs on a maintainer machine and nothing leaves it.

## Method

1. Run each task and arm on Claude and Codex, at least three trials each. From the repository root, launched from a shell with `CLAUDECODE` unset:

   ```bash
   root=$(mktemp -d)
   bash tests/skill-eval-cell/packs/lfg-stage-cost/run-one.sh "$root" <small|zoom|medium> <lfg|vanilla> <claude|codex> <trial>
   ```

   Each call appends one line to `$root/runs.jsonl`. Calls are independent, so run them side by side. An `lfg` run takes 10-40 minutes, and each call stops at 3600 seconds. That limit was 2400 seconds until three of nine Claude zoom and medium runs, all started at once, ran past it; stagger starts when running many calls together. Both arms run at `xhigh` effort, so neither inherits the operator's default. The `lfg` arm is a skill-eval cell with every skill `lfg` routes to bundled from the same checkout, a fake `origin`, and a `git push` shim, so the shipping step runs and fails at the push. The vanilla arm (`vanilla.ts`) gives the bare task to the same CLI and tells it not to use skills (Claude also gets `--disable-slash-commands`). Zoom runs are graded right after by `check-booking.mjs`.
2. Collect:

   ```bash
   bun tests/skill-eval-cell/packs/lfg-stage-cost/collect.ts --runs "$root/runs.jsonl" --out "$root/report.json"
   ```

   It prints the median table per task, arm, and host, then the doc-review plus simplify share. `--json` prints the same medians as flat metrics instead, which is what `optimize-spec.yaml` reads through `measure.sh` when `ce-optimize` drives repeated runs. Each `measure.sh` call is one live small run and one live zoom run, so it costs real money and about 40 minutes.

### How tokens are attributed

The collector reads the run's main session log and every subagent log it links to (Claude `~/.claude/projects/<workspace>/`, Codex `~/.codex/sessions/`). Each model response is counted once. A response is charged to the step that was active when it was made, so the response that reads the next step's skill still belongs to the step before it.

- A step starts when the run reads that step's skill: `ce-plan` or `ce-debug` (plan), `ce-work` (work), `ce-simplify-code` (simplify), `ce-code-review` (code-review, which also covers applying fixes and the residual handoff), `ce-compound`, `ce-test-browser` (browser), `ce-commit-push-pr` (ship), `ce-babysit-pr` (babysit). Reading one of `lfg`'s own files closes the step; tokens there and before the first step are `intake`.
- One tool call can read several files at once (Codex batches reads in one exec). Its reads of `lfg`'s own files are applied first, so a call that reads a step skill alongside an `lfg` reference opens that step instead of closing it.
- Any other skill read inside a step is a sub-row named `<step> > <skill>`, such as `plan > ce-doc-review`. So is `ce-simplify-code` read while `ce-work` is still running, which keeps `ce-work`'s own simplify pass out of `lfg`'s step-3 simplify.
- A subagent and everything it spawns are charged to the step or sub-row that spawned it, and counted in that row's agents.
- Context growth is the main thread's context (input plus cache) at the step's last response minus its context when the step began.
- A log with no skill reads, such as every vanilla run, lands in one `unattributed` row.

Dollars use list prices per million tokens: Opus 5.5 $4 input, $20 output; Sonnet 5.5 $2 and $10; Haiku 5.5 $0.10 and $0.50; Fable 5.1 $10 and $50. Cache reads are $0.20 for Opus and Sonnet, $0.01 for Haiku, and $0.25 for Fable; cache writes are 1.25 times input for the 5-minute TTL and 2 times for the 1-hour TTL; fast mode doubles the price. Codex models have no published price here, so Codex rows report tokens and their share is a token share.

## Tasks

- **small** (`tasks/small.md`, `fixtures/ideate-jot`): add `--json` to `jot list`. A routine, non-boundary change of well under 30 lines.
- **zoom** (`tasks/zoom.md`, `fixtures/booking-zoom`): "email a confirmation with the join link and passcode when someone books." The fixture's `SPEC.md` says nothing that grants access goes out before payment is confirmed, and bookings start `pending`. The task measures detection, not savings: `check-booking.mjs` books a session and checks the outbox before and after `confirmPayment`. `ordering_correct` is true only when the link and passcode are absent before payment and present after it. A changed `createBooking`/`confirmPayment` signature records an `error` and grades null.
- **medium** (`tasks/medium.md`, `fixtures/ideate-jot`): add `jot edit` and `jot delete` with tests.

The `ideate-jot` fixture's `npm test` script passes a directory to `node --test`, which Node 24 rejects; runs usually notice and run the test glob instead. Both arms see the same fixture.

## Baseline

Measured 2026-11-04 (US Pacific) on `main` at 799ac9aeb: Claude Code 2.1.318 and codex-cli 0.166.0, Node 24.21.0, three trials per task, arm, and host, all at `xhigh`. All 36 runs exited 0 within the timeout, and every `lfg` run left at least one commit past the seed. Claude `lfg` runs used Opus 5.5 on the main thread, with Sonnet 5.5 and Haiku 5.5 subagents. Codex `lfg` runs used gpt-6.1-sol, with gpt-6-luna subagents. Vanilla runs used Opus 5.5 and gpt-6.1-sol. Stage medians are taken per stage, so they do not add up to the run median.

### Totals and doc-review plus simplify share

| task | host | lfg median $ | lfg median Mtok | vanilla median $ | vanilla median Mtok | share per trial ($) | share per trial (tokens) | zoom ordering correct (lfg / vanilla) |
|---|---|---|---|---|---|---|---|---|
| small | claude | 3.81 | 5.02 | 0.41 | 0.40 | 20.6%, 22.2%, 19.4% (median 20.6%) | 18.4%, 13.8%, 16.1% | |
| small | codex | n/a | 2.81 | n/a | 0.21 | n/a | 26.6%, 26.7%, 27.7% (median 26.7%) | |
| zoom | claude | 15.36 | 17.43 | 0.28 | 0.24 | 29.9%, 32.9%, 28.5% (median 29.9%) | 22.7%, 26.4%, 21.0% | 3/3 / 3/3 |
| zoom | codex | n/a | 25.91 | n/a | 0.17 | n/a | 21.6%, 23.2%, 20.2% (median 21.6%) | 3/3 / 3/3 |
| medium | claude | 11.74 | 14.02 | 0.54 | 0.48 | 49.2%, 33.7%, 35.8% (median 35.8%) | 39.7%, 36.5%, 34.6% | |
| medium | codex | n/a | 4.74 | n/a | 0.22 | n/a | 21.1%, 14.3%, 20.8% (median 20.8%) | |

On the small task, doc review and simplify together are **not** under 20% of median dollars: the median share is 20.6% on Claude, and the Codex token share is 26.7%. No small run on either host entered `ce-plan`, so all of that share is simplify. On Claude it is `lfg`'s own simplify step. In two of three Codex runs, `ce-work` ran `ce-simplify-code` itself (`work > ce-simplify-code`) and `lfg`'s step was empty. Doc review appears only where the run planned: every zoom and medium Claude run, and every zoom Codex run.

On zoom, every run on both arms sent the join link and passcode only after payment. So this fixture does not separate `lfg` from vanilla on detection. It only guards against a change that breaks the ordering.

### Stage medians, `lfg` on Claude ($ / Mtok / agents)

| stage | small | zoom | medium |
|---|---|---|---|
| unattributed | 0.22 / 0.05 / 0 | 0.22 / 0.05 / 0 | 0.20 / 0.05 / 0 |
| intake | 0.19 / 0.17 / 0 | 0.21 / 0.29 / 0 | 0.19 / 0.23 / 0 |
| plan | | 2.28 / 2.18 / 0 | 2.69 / 2.46 / 1 |
| plan > ce-doc-review | | 3.19 / 2.78 / 5 | 3.91 / 4.28 / 5 |
| work | 0.90 / 1.71 / 0 | 0.96 / 1.89 / 0 | 1.63 / 2.39 / 0 |
| simplify | 0.77 / 0.86 / 4 | 1.34 / 1.08 / 5 | 1.03 / 1.15 / 5 |
| code-review | 1.08 / 1.43 / 0 | 6.23 / 7.46 / 6 | 1.94 / 2.33 / 0 |
| browser | 0.17 / 0.28 / 0 | 0.21 / 0.52 / 0 | 0.24 / 0.61 / 0 |
| ship | 0.43 / 0.67 / 0 | 0.72 / 1.33 / 0 | 0.81 / 1.03 / 0 |

### Stage medians, `lfg` on Codex (Mtok / agents)

| stage | small | zoom | medium |
|---|---|---|---|
| unattributed | 0.03 / 0 | 0.03 / 0 | 0.03 / 0 |
| intake | 0.08 / 0 | 0.08 / 0 | 0.08 / 0 |
| plan | | 0.72 / 0 | |
| plan > ce-doc-review | | 3.32 / 5 | |
| work | 0.59 / 0 | 1.74 / 0 | 0.69 / 0 |
| work > ce-doc-review | | 0.30 / 0 | |
| work > ce-commit | 0.00 / 0 | 0.00 / 0 | 0.08 / 0 |
| work > ce-simplify-code | 0.72 / 4 | 1.45 / 3 | 0.81 / 4 |
| simplify | 0.00 / 0 | 0.00 / 0 | 0.00 / 0 |
| code-review | 0.65 / 0 | 15.87 / 7 | 2.43 / 0 |
| browser | 0.21 / 0 | 0.25 / 0 | |
| ship | 0.44 / 0 | 1.04 / 0 | 0.00 / 0 |

`plan > ce-noslop` (zoom, 0.00 Mtok) is omitted.

## After doc-review depth and simplify sizing

Measured 2026-11-04 (US Pacific) on `main` at 1e1c31e7c, which includes the `ce-doc-review` lite path (#2003) and the single-pass `ce-simplify-code` with `lfg`'s `size-cutoff:30` (#2004). Claude Code 2.1.318, codex-cli 0.166.0, and Node 24.21.0, the same as the baseline. Three `lfg` trials per task and host at `xhigh`, all 18 started at once. Claude runs used Opus 5.5 on the main thread with Sonnet 5.5 and Haiku 5.5 subagents. Codex runs used gpt-6.1-sol, with one gpt-6-sol subagent in one zoom code review (the baseline had one gpt-6-luna subagent in one zoom doc review).

The vanilla arm was not rerun. It loads no plugin skill, so these changes cannot move it, and the baseline's vanilla numbers stand. The CLI versions did not change, so no vanilla drift check was run.

Three Claude runs hit the 2400-second timeout: zoom trials 2 and 3 and medium trial 2. The collector excludes them, so Claude zoom has one complete run and Claude medium has two. All three had already committed their code, and both zoom ones were graded. Their partial costs are listed below as lower bounds. In the baseline, Claude zoom and medium runs took 28-36 minutes, and their starts were staggered. Here all 18 ran together, and Claude small runs took 8-9 minutes, as before. The excluded runs were the most expensive of their groups, so the Claude zoom and medium medians below lean low.

This measurement also found and fixed a collector defect. When one Codex call read `ce-simplify-code/SKILL.md` and an `lfg` reference together, the `lfg` read closed the simplify sub-row as soon as it opened, and the simplify pass was charged to `work`. Re-collecting the saved baseline runs with the fix leaves every total and every Claude row unchanged. It moves these Codex rows: small `work` 0.59 to 0.57 Mtok; zoom `work` 1.74 to 1.53 and `work > ce-commit` 0.00 to 0.74; medium token share 20.8% to 21.1%. The comparison below uses the re-collected values. The baseline section above is left as published.

### Totals and doc-review plus simplify share

Per-trial values are in trial order. A trial marked (t/o) timed out, is excluded from the medians, and its cost is a lower bound.

| task | host | lfg median $ | lfg median Mtok | share per trial ($) | share per trial (tokens) | zoom ordering correct (lfg) |
|---|---|---|---|---|---|---|
| small | claude | 3.49 | 4.85 | 13.7%, 13.6%, 13.2% (median 13.6%) | 13.9%, 13.3%, 12.1% | |
| small | codex | n/a | 2.48 | n/a | 10.5%, 15.2%, 19.3% (median 15.2%) | |
| zoom | claude | 14.09 (n=1) | 16.16 (n=1) | 25.3%, 26.3% (t/o), 34.5% (t/o) | 20.6%, 20.2% (t/o), 26.2% (t/o) | 3/3 |
| zoom | codex | n/a | 18.93 | n/a | 20.4%, 17.1%, 19.2% (median 19.2%) | 3/3 |
| medium | claude | 8.64 (n=2) | 10.48 (n=2) | 24.6%, 40.5% (t/o), 19.6% | 20.1%, 34.8% (t/o), 19.5% | |
| medium | codex | n/a | 4.67 | n/a | 21.0%, 18.8%, 19.6% (median 19.6%) | |

Timed-out partial costs: Claude zoom trial 2 at least $16.01 and 18.05 Mtok (it reached ship), zoom trial 3 at least $14.44 and 15.75 Mtok (it stopped in code review), and medium trial 2 at least $12.90 and 14.82 Mtok (it reached ship).

### Stage medians, `lfg` on Claude ($ / Mtok / agents)

Complete runs only: small n=3, zoom n=1, medium n=2. A median of two is their mean, so medium's 3 simplify agents is one run with 1 and one with 5.

| stage | small | zoom | medium |
|---|---|---|---|
| unattributed | 0.22 / 0.05 / 0 | 0.22 / 0.05 / 0 | 0.22 / 0.05 / 0 |
| intake | 0.22 / 0.22 / 0 | 0.22 / 0.27 / 0 | 0.19 / 0.19 / 0 |
| plan | | 1.64 / 2.18 / 0 | 1.87 / 1.60 / 1 |
| plan > ce-doc-review | | 3.05 / 2.61 / 5 | 1.11 / 1.25 / 1 |
| work | 0.84 / 1.39 / 0 | 1.25 / 1.59 / 0 | 1.87 / 2.74 / 0 |
| simplify | 0.47 / 0.65 / 1 | 0.51 / 0.73 / 1 | 0.77 / 0.82 / 3 |
| code-review | 0.72 / 1.45 / 0 | 6.04 / 6.91 / 6 | 1.66 / 2.10 / 0 |
| browser | 0.46 / 0.25 / 0 | 0.25 / 0.60 / 0 | 0.42 / 0.65 / 0 |
| ship | 0.40 / 0.57 / 0 | 0.91 / 1.23 / 0 | 0.53 / 1.08 / 0 |

### Stage medians, `lfg` on Codex (Mtok / agents)

| stage | small | zoom | medium |
|---|---|---|---|
| unattributed | 0.03 / 0 | 0.03 / 0 | 0.03 / 0 |
| intake | 0.08 / 0 | 0.12 / 0 | 0.08 / 0 |
| plan | | 0.59 / 0 | |
| plan > ce-doc-review | | 3.15 / 5 | |
| work | 0.46 / 0 | 1.60 / 0 | 0.64 / 0 |
| work > ce-doc-review | | 0.00 / 0 | |
| work > ce-commit | 0.22 / 0 | 0.57 / 0 | 0.16 / 0 |
| work > ce-simplify-code | 0.33 / 1 | 0.66 / 1 | 0.95 / 4 |
| simplify | 0.00 / 0 | 0.00 / 0 | |
| code-review | 0.74 / 0 | 9.88 / 6 | 2.39 / 0 |
| browser | 0.22 / 0 | 0.50 / 0 | 0.00 / 0 |
| ship | 0.46 / 0 | 1.92 / 0 | 0.42 / 0 |

`plan > ce-noslop` (zoom, 0.00 Mtok) is omitted. On small, one Codex run simplified as `lfg`'s own step (0.46 Mtok, 1 agent) and two simplified inside `ce-work`, so the `simplify` median is 0.

### Comparison with the baseline

**Small task.** The median dropped on both hosts.

| host | median $ before -> after | median Mtok before -> after | per-trial before | per-trial after | share before -> after |
|---|---|---|---|---|---|
| claude | 3.81 -> 3.49 (-8%) | 5.02 -> 4.85 (-3%) | $3.54, $3.81, $3.94 | $3.53, $3.49, $3.31 | 20.6% -> 13.6% of $ |
| codex | n/a | 2.81 -> 2.48 (-12%) | 2.72, 2.82, 2.81 Mtok | 3.10, 2.48, 2.37 Mtok | 26.7% -> 15.2% of tokens |

The drop is small next to the spread between trials. The highest Claude after trial ($3.53) roughly equals the lowest baseline trial ($3.54), and one Codex after trial (3.10 Mtok) cost more than every baseline trial. No small run planned, before or after, so the small-task change is all simplify.

**Simplify.** All six small runs took the single pass with 1 agent, against 4 agents in every baseline small run. On Claude, `lfg`'s simplify step went from $0.77 / 0.86 Mtok / 4 agents to $0.47 / 0.65 Mtok / 1 agent. On Codex, simplify per run (wherever it ran) went from about 0.75 Mtok with 4 agents to 0.33, 0.38, and 0.46 Mtok with 1 agent. On zoom, Claude trials 1 and 2 took the single pass ($0.51 and $0.78, 1 agent), while in trial 3 `ce-work` ran the full team on an 85-line diff ($1.15, 4 agents). The baseline zoom median was $1.34 with 5 agents. Codex zoom `work > ce-simplify-code` went from 1.45 Mtok with 3 agents to 0.66 with 1. Medium diffs stayed over the cutoff on Codex (0.81 to 0.95 Mtok, 4 agents each time) and in two of three Claude runs (5 agents). One Claude medium run took the single pass.

**Cost that moved elsewhere.** On small, the simplify saving was partly offset in other stages. Claude `browser` went from $0.17 to $0.46. That is 1-hour cache writes ($8 per Mtok on Opus), which two of three after runs paid in that step and one of three baseline runs did. Which step pays the rewrite varies; these changes do not touch it. Claude `code-review` went from $1.08 to $0.72. Codex `work > ce-commit` went from 0.00 to 0.22 Mtok and `code-review` from 0.65 to 0.74.

**Doc review.** Small runs never plan, so the lite path does not apply there. Zoom kept full depth in every run on both hosts, which is the intended result for a payment-gated plan: Claude $3.19 / 5 agents became $3.05 / 5 (trial 1; the timed-out trials spent $3.44 and $3.83, 5 agents each), and Codex went from 3.32 Mtok / 5 agents to 3.15 / 5 (one run used 4). On Claude medium, two of three plans went lite: $1.41 and $0.82 with 1 agent, against a baseline median of $3.91 with 5. The third (trial 2, the one that timed out) ran full depth with 4 agents and $3.32, plus a cross-model peer. This measurement does not show why that plan escalated. Codex medium did not plan in any run, before or after.

**Medium and zoom totals.** The Claude medium median of the two complete runs is $8.64, against $11.74. Counting the timed-out trial at its lower bound puts the median at $9.81, still lower. Claude zoom's one complete run cost $14.09, against a $15.36 median. With the timed-out runs at their lower bounds, the median of three is at least $14.44, so a lower zoom cost is not established. Codex zoom went from 25.91 to 18.93 Mtok. Most of that is `code-review` (15.87 to 9.88 Mtok, 7 to 6 agents), which these changes do not touch, so treat it as run-to-run variance and not as savings.

**Zoom detection.** `ordering_correct` was 3/3 on Claude, including the two timed-out runs, which had committed their code, and 3/3 on Codex. The baseline was 3/3 on each host, so detection is no worse.

**Verdict.** Both verification conditions hold. The small-task median dropped on both hosts, and Zoom detection stayed at 3/3. The stop condition was not reached. The saving is clearest in the simplify rows (4 agents to 1 on every small run) and in Claude medium doc review (5 agents to 1 in two of three runs). The small-task totals moved less, because part of the saving landed in stages that vary between runs.

Both sides share one environment detail: Codex runs load the operator's global agent instructions, which on this machine ask for a simplify pass after implementation. That is likely why Codex simplify often runs inside `ce-work`.
