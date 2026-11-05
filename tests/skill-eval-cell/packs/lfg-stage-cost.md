# LFG Stage-Cost Baseline

Use this evaluator-owned pack to measure what an `lfg` run spends at each of its steps, and to compare a change to how `lfg`, `ce-doc-review`, or `ce-simplify-code` size their work against the numbers below. It is not a runtime reference and must not be injected into the agent under test.

Every run is a real `lfg` or vanilla run against a throwaway repository. Costs come from the host's own session logs on the machine that ran it, so this pack runs on a maintainer machine and nothing leaves it.

## Method

1. Run each task and arm on Claude and Codex, at least three trials each. From the repository root, launched from a shell with `CLAUDECODE` unset:

   ```bash
   root=$(mktemp -d)
   bash tests/skill-eval-cell/packs/lfg-stage-cost/run-one.sh "$root" <small|zoom|medium> <lfg|vanilla> <claude|codex> <trial>
   ```

   Each call appends one line to `$root/runs.jsonl`. Calls are independent, so run them side by side. An `lfg` run takes 10-40 minutes. Both arms run at `xhigh` effort, so neither inherits the operator's default. The `lfg` arm is a skill-eval cell with every skill `lfg` routes to bundled from the same checkout, a fake `origin`, and a `git push` shim, so the shipping step runs and fails at the push. The vanilla arm (`vanilla.ts`) gives the bare task to the same CLI and tells it not to use skills (Claude also gets `--disable-slash-commands`). Zoom runs are graded right after by `check-booking.mjs`.
2. Collect:

   ```bash
   bun tests/skill-eval-cell/packs/lfg-stage-cost/collect.ts --runs "$root/runs.jsonl" --out "$root/report.json"
   ```

   It prints the median table per task, arm, and host, then the doc-review plus simplify share. `--json` prints the same medians as flat metrics instead, which is what `optimize-spec.yaml` reads through `measure.sh` when `ce-optimize` drives repeated runs. Each `measure.sh` call is one live small run and one live zoom run, so it costs real money and about 40 minutes.

### How tokens are attributed

The collector reads the run's main session log and every subagent log it links to (Claude `~/.claude/projects/<workspace>/`, Codex `~/.codex/sessions/`). Each model response is counted once. A response is charged to the step that was active when it was made, so the response that reads the next step's skill still belongs to the step before it.

- A step starts when the run reads that step's skill: `ce-plan` or `ce-debug` (plan), `ce-work` (work), `ce-simplify-code` (simplify), `ce-code-review` (code-review, which also covers applying fixes and the residual handoff), `ce-compound`, `ce-test-browser` (browser), `ce-commit-push-pr` (ship), `ce-babysit-pr` (babysit). Reading one of `lfg`'s own files closes the step; tokens there and before the first step are `intake`.
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
