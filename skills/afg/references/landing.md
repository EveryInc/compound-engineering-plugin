# Landing

Landing is judged on the exact head, after the last push to it. Commands and denials work as in `references/run.md`. A missing receipt is a step not taken yet, not a final denial.

Before building on a commit, run `test --dry-run` on it: a limit found low in a stack changes every commit above.

## The steps

1. **`gate --pr <n>`.** If any reason other than a missing or failed receipt remains, stop here for this PR. `behind` alone, with or without missing receipts: `update --pr <n>`, adopt the new head when it is an own PR, and continue once its checks settle.
2. **`test --pr <n>`.** Runs every check that applies to the changed files in a clean worktree without credentials, in the machine's line, and retries a failed one once when the machine is calm. Name what it lists as `flaky` in the digest. A timing test that fails twice under high `load` is unproven: test again later before treating it as broken.
3. **Review the same head.** In a clean worktree at it, a reviewer that did not write it runs `ce-code-review mode:agent base:<merge base sha>`; pipe its one JSON object, unedited, into `review --pr <n>`. Do it before `test` when the author is not this account. Start it as soon as the commit exists, beside `test`; proof beyond the project's checks runs alongside and is not waited for unless a finding calls for it. A clean review still counts after a rebase when every touched file has the same content before and after, nothing in or below those folders moved in between, and no later review of the job said otherwise; `gate` and `direct` ask for a new one when it does not.
4. **`rule --pr <n> --rule <id> --head <sha> --verdict pass|fail --why "<reason>"`** for each entry in the policy's `rules`, which include the landing steps. Repeat `--rule` for rules that one reason covers. Unsure is `fail`. A step that happens at or after the landing passes when the script's landing does it or this run will do it next; then do it.
5. **`guard`** for each file `test` lists in `guards`, as below.
6. **`land --pr <n> --head <sha>`.** Observe again before the next; it is denied until main is green.

On anyone else's PR, a failed test, a refused guard or an open finding is parked. On an own PR it goes to a fixing worker; adopt the new head and repeat. Fixing review findings needs no second `lfg`; a fix that changes what the job does is a new job. Keep a fix to what the finding says, because widening it costs another full review. When a second round finds something the previous fix broke, cut the change back to the smallest one that does the job, or end it and say what stays unsolved, instead of a third round on the same design.

A PR parked for a person is finished once: tested and reviewed on its head, with the recommendation. Do not `update` or review it again because main moved; bring it up to date when the answer comes, or when it conflicts.

On the pull-request route, when main moves while it is red, `update` the repair PR, start a new `main-red` job for the new tip without `--opens-pr`, and adopt the updated head under it.

## Direct landing

`test`, `review`, `rule` and `guard` take `--sha` in place of `--pr`; then `direct --sha <sha> --job <id>`. When the tip moves first, have the worker rebase, adopt the new commit under the same job, and repeat. One job lands one commit; with `autonomous_merge_method: merge`, that commit sits on the tip and the adopted `<sha>` is the `--no-ff` merge of it. Below level `merge`, keep the branch unpublished and park `commit:<sha>`, naming the branch.

Base independent commits on the tip, not on each other: their reviews run at once and carry over as the others land. Stack only a commit that needs the one below, because a fix below voids every review above.

## Guards

A guard is a file that decides only what a check reports, such as linter settings or a guard test. In hands-off, own work may change one. `guards` names the files the script holds to this; `hard-limit` means something else needs a person. A change elsewhere that makes a check accept more is a question for the code review.

Prefer fixing the code to loosening the guard. When the guard is wrong, change only what it gets wrong. After `test` passes, give a fresh worker that did not write the change the diff, the guard and the code it judges, not your conclusion. It returns one JSON object per guard file, piped unedited into `guard --sha <sha>|--pr <n> --file <path>`:

`{"head_sha", "reviewer", "narrow": bool, "probe_is_real": bool, "reason", "check": "<the run command of a check that reads this file>", "probe": "<unified diff>", "expect": "<text>"}`

`narrow` means it lets through nothing beyond what the change needs. `probe` plants, in ordinary code and never in a test, a violation of the kind this change loosens, as close to the new exception as one can be and still be wrong. `expect` is what the check prints when it catches it. The script applies the probe and runs the check: the guard passes only when the check fails with that text.

## Close

Close only what you can show is already fixed on the default branch, a duplicate of an older issue, or replaced by a merged PR. Read the code or the other item to establish it; a claim in the item is not evidence. `close --kind issue|pr --number <n> --as fixed|duplicate|replaced --evidence commit:<sha>|pr:<n>|issue:<n> --comment "<reason>"`. Age is never a reason.
