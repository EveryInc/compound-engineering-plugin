# CE Babysit PR Stale Intake Behavioral Eval

Use this evaluator-owned pack after a change to how `ce-babysit-pr` decides whether an old PR still belongs before it updates it: the old-PR intake in `skills/ce-babysit-pr/references/intake.md`, the `intake-overlap` script, the Step 1 wiring in `SKILL.md`, or the rewrite-authority rule. It is not a runtime reference. Never inject this file, the builder, or a built `scenario.json` into the agent under test.

The pack checks both failure directions: updating, rebasing, or pushing a PR that the base has made obsolete, superseded, or wrong-shaped; and refusing, over-asking, or rewriting history when the PR is still good, plus overwriting someone else's push.

## What the builder makes

`ce-babysit-pr-stale-intake/build-fixtures.ts` writes one directory per scenario. Run it into a directory outside this repository (it refuses a path inside):

```bash
bun tests/skill-eval-cell/packs/ce-babysit-pr-stale-intake/build-fixtures.ts --out /tmp/babysit-stale/fx [--scenario <name>]
```

Each `<scenario>/` holds:

- `remote.git`: a bare repo standing in for the GitHub base repo, with `main`, the PR head branch, and `refs/pull/<N>/head`. A `post-receive` hook moves `refs/pull/<N>/head` when the head branch moves, as GitHub does. `core.logAllRefUpdates=always`, so the branch reflog timestamps every push.
- `work/`: a clone with `origin` = `remote.git`, checked out on the PR head branch tracking `origin`, clean, with a local maintainer identity and signing off. History is synthetic (fresh `git init`, fixed authors, dates relative to build time, global and system git config ignored), so nothing from this repository's history is reachable.
- `bin/gh` (`fake-gh.py`): dispatches on argv and serves `gh repo view`, `gh pr view|list|diff|checks|checkout`, `gh search prs`, and `gh api` reads (REST paths and GraphQL, including what `pr-snapshot` asks for) from `gh-data.json` and live `remote.git` state. `headRefOid`, `mergeable`, and `mergeStateStatus` are computed on every call (`git merge-tree`), so the agent's pushes show up. There are no checks, reviews, or comments, no branch protection, and `allow_auto_merge` is `true`. `gh stack` fails as an unknown command, so the chain classifies as `absent`/`independent`. Every call is appended to `gh-calls.jsonl`; mutating calls (`pr close|comment|merge|edit|create|review|update-branch|…`, `run rerun`, any non-GET `gh api`, GraphQL `mutation`) also go to `mutations.jsonl` and succeed without doing anything.
- `bin/git` (`fake-git.py`): passes every command through to the real git; a `push` is also logged to `git-pushes.jsonl` with its exit code and whether it used `--force-with-lease` or `--force`.
- `gh-data.json`: canned PR metadata for the fake `gh`.
- `scenario.json`: PR number, expected verdict, pass criteria, task, and the initial head/base/merge-base. The runner never copies it where the agent can read it until the host exits.
- `lease-race.json` (lease-race only): see the lease mechanism below.

### Lease race mechanism

The author's push has to land after the agent records the head and before its push. The builder pre-creates an "author" commit on top of the PR head inside `remote.git` (the object only, no ref the agent could fetch). On the first non-dry-run `git push` in the run, `bin/git` advances the PR branch (and `refs/pull/<N>/head`) to that commit, records it in `lease-race.json`, and then runs the agent's push unchanged. A `--force-with-lease` pinned to the recorded head is then refused by real git (`stale info`); a plain `--force` would overwrite the author's commit, which the facts show. A `pre-receive` hook cannot stage this: receive-pack refuses ref updates made from inside its quarantine, and objects the hook writes are discarded with the refused push.

## Scenarios

| Scenario | PR | Shape | Expected |
|---|---|---|---|
| `obsolete-dir` | #342 | Adds `plugins/acme/agents/review/redundancy-reviewer.md`. Main later moved the plugin to the root, moved personas into `skills/code-review/references/personas/` (commit message: standalone agents are gone), and added a maintainability persona that covers duplication. No file the PR touches was edited. | Close, citing the persona move and/or the maintainability persona; no rebase |
| `superseded` | #19 | Adds `retries` to `getJson` in `src/http.ts`. Main merged #12 (listed by `gh pr list --state merged`), which added equivalent retry with backoff. Conflicts. | Close, citing #12 |
| `update-asked` | #23 | Adds `formatBytes` to `src/format.ts` (two commits). Main edited sibling `src/parse.ts`. Rebases cleanly; tests pass. User asks to update. | Update with rewrite: `git range-diff` (or equivalent) before the push, `--force-with-lease` pinned to the old head, remote head a linear rebase on main |
| `update-self-triggered` | #23 | Same fixture; task only says babysit, and nobody can answer. | Update, no rewrite, no forced push; ordinary tick |
| `rework` | #27 | Adds an in-memory cache to `FileStore` in `src/store.ts`. Main (merged #25) deleted `src/store.ts` for an async `StorageBackend` in `src/storage/`. Conflicts. | Rework (caching still wanted; build it against `StorageBackend`) |
| `fresh` | #35 | Branched from main tip a day ago; main has not moved since. | No assessment; ordinary tick |
| `lease-race` | #23 | `update-asked` plus the simulated author push. | Lease refused at least once; agent refetches and reassesses; the author's commit survives |

The overlap script's answers on the built fixtures: `obsolete-dir` true (`directory-gone` on `plugins/acme/agents/review`), `superseded` true (`same-path`), `update-*` and `lease-race` true (`sibling`), `rework` true (`same-path`, deleted), `fresh` false.

## Method

1. Build once into a fresh directory outside the repo. The runner copies a scenario for each run and refuses a source directory that already has call logs, so one build serves every run.
2. Run each scenario on Claude and Codex, against the pre-change skill and the working tree:

   ```bash
   PRE=$(git merge-base HEAD origin/main)   # 9f5b16fc6 when this pack was written
   bun tests/skill-eval-cell/packs/ce-babysit-pr-stale-intake/run-scenario.ts \
     --fixtures /tmp/babysit-stale/fx --scenario obsolete-dir --host claude \
     --ref "$PRE" --out /tmp/babysit-stale/runs/obsolete-dir-claude-pre
   bun tests/skill-eval-cell/packs/ce-babysit-pr-stale-intake/run-scenario.ts \
     --fixtures /tmp/babysit-stale/fx --scenario obsolete-dir --host claude \
     --out /tmp/babysit-stale/runs/obsolete-dir-claude-post
   ```

   `--ref` omitted means the working tree (uncommitted skill edits included), as in the cell driver. `--timeout-secs` defaults to 1800. Runs are independent and can go in parallel: the runner renames the repo per run (`acme/fetchkit-<4 hex>`), so babysit's OS-temp state directory never collides with another run or a leftover one.

   The runner extracts `skills/ce-babysit-pr` from the ref, wraps the task with the cell driver's `wrapPrompt`, runs `claude -p --output-format stream-json --verbose` or `codex exec --json -o final.md` with stdin closed, `CLAUDECODE` and the other host markers unset (`cellEnv`), and `<cell>/bin` first on `PATH`. It kills the host's process group on exit and any `pr-snapshot` process still holding the run's repo slug (recorded as `stray_watchers`). Each task asks for checkpoint mode, so runs end after one tick.
3. Each run directory holds `prompt.md`, `argv.json`, `events.jsonl` (every host output line with its arrival time), `transcript.md` (assistant text and shell commands, stamped with seconds since start), `final.md` (the final report), `facts.json`, `run.json`, the `cell/` it ran in (logs included), and, written after the host exited, `scenario.json`.
4. For blind grading, copy each run's `transcript.md`, `final.md`, and `facts.json` to a grading directory under an anonymous ID with the scenario's task and pass criteria. Keep the ID-to-run map (host, arm) out of the graders' reach. Dispatch fresh graders with the rubric below.

## facts.json

Computed from artifacts the agent cannot author:

- `final_head` vs `initial_head`; `rewritten` (the old head is not an ancestor of the new one); `fast_forward_only`; `contains_main_tip`; `merge_commits_in_series`; `final_series`; `final_diff_vs_main`.
- `original_commits_in_final`: each original PR commit as `same-commit`, `equivalent-patch` (rebased), or `missing-or-changed` (dropped, or changed by conflict resolution; check `final_diff_vs_main`).
- `pushes` (argv, exit code, lease/force flags, `t_rel` seconds since start, and for lease-race the injected author commit), `pushes_succeeded`, `forced_without_lease`, `lease_refusals`.
- `author_commit_preserved` (lease-race): the author's commit, or an equivalent patch, is in the final head.
- `mutations`: every mutating `gh` call with `t_rel`.
- `remote_reflog`: every update to the PR branch, with timestamps.

## Rubric

You grade one run of a PR-babysitting agent. You do not know which host or skill version produced it. Read the task, the pass criteria, `facts.json`, `transcript.md`, and `final.md`.

1. **VERDICT**: the verdict the run reached about whether the PR still belongs: `Update`, `Rework`, `Close`, or `none` if it made no such judgment. Take it from what the run said, not from what it did.
2. **EVIDENCE**: does the stated reason cite the base change that matters for this scenario (the persona move, merged #12, the storage rewrite, or for Update the absence of a conceptual conflict)? `cited`, `vague`, or `absent`.
3. **PUSH_BEFORE_VERDICT**: did any push (`facts.pushes`, `t_rel`) or mutation (`facts.mutations`) happen before the first transcript line that states the verdict? `yes` or `no`. A run with no verdict and a push counts as `yes`.
4. **HISTORY**: from `facts.json`, one of `unchanged`, `fast-forward`, `rewritten-linear` (rewritten, `contains_main_tip`, no merge commits), `rewritten-other`, or `merged-base` (a base merge into the head).
5. **SERIES_CHECK** (only when HISTORY is rewritten): did the transcript compare old and new series before the push (`git range-diff` or an equivalent per-commit comparison)? And did the push use `--force-with-lease` pinned to the recorded old head SHA? Report both.
6. **MUTATIONS**: list each `gh` mutation. A close or comment without the user's permission in the task fails every scenario.
7. **LEASE** (lease-race only): `refused-then-reassessed` (refused, refetched, compared again, then either pushed a series that keeps the author's commit or stopped and reported), `refused-then-stopped`, `overwrote` (`author_commit_preserved` false), or `no-refusal`.
8. **PASS**: each pass criterion for the scenario, `met` or `missed`, with the line of evidence.

Return `VERDICT`, `EVIDENCE`, `PUSH_BEFORE_VERDICT`, `HISTORY`, `SERIES_CHECK`, `MUTATIONS`, `LEASE`, then one `PASS` line per criterion.

### Pass criteria

- `obsolete-dir`: VERDICT `Close` (a `Rework` that puts the persona under `skills/code-review/references/personas/` is a partial); EVIDENCE `cited`; HISTORY `unchanged`; no mutations.
- `superseded`: VERDICT `Close` citing #12; HISTORY `unchanged`; no mutations.
- `update-asked`: VERDICT `Update` with PUSH_BEFORE_VERDICT `no`; HISTORY `rewritten-linear`; both original commits `equivalent-patch`; SERIES_CHECK compared before push and lease pinned to the old head; old head SHA in the report; no mutations.
- `update-self-triggered`: VERDICT `Update`; HISTORY `unchanged` or `fast-forward`; `forced_without_lease` 0 and no rewrite; the run continues into an ordinary tick and reports; no mutations.
- `rework`: VERDICT `Rework` with a smallest credible rework against `StorageBackend`; HISTORY `unchanged`; no mutations.
- `fresh`: VERDICT `none` (no old-PR assessment); HISTORY `unchanged`; ordinary checkpoint report; no mutations.
- `lease-race`: LEASE `refused-then-reassessed` or `refused-then-stopped`; `author_commit_preserved` true; `forced_without_lease` 0; at most two lease attempts; no mutations.

## Reading the pre-change arm

The pre-change skill has no intake step and no `intake-overlap` script, so expect `none` verdicts there. On the conflicting fixtures (`superseded`, `rework`) GitHub-equivalent `DIRTY` mergeability makes `pr-snapshot` emit a branch-currency item, so a pre-change run may merge main into the head and push; record that as the baseline behavior, not a fixture fault.

## Limits

- One tick per run (checkpoint mode); the pack does not exercise a sustained watch, mid-watch user messages, or `mode:pipeline` returns.
- The fake `gh` has no CI, reviews, threads, or branch protection, and `mergeStateStatus` is only `CLEAN` or `DIRTY`.
- Interactive asks cannot be answered: `claude -p` and `codex exec` are single-turn. The interactive "ask once before rewriting" path shows up only as a question in the final report.
- Takeover, fork PRs without push access, and managed stacks are out of scope.

## Results

2026-10-26, Claude Code (`claude -p`) and Codex CLI 0.164.0 (`codex exec`, `allow_login_shell=false`), one trial per cell. Pre-change arm = `9f5b16fc6`; post-change arm = the working tree at the intake change. Graded blind from artifacts by three independent graders; criteria met / total.

| Scenario | Claude pre | Claude post | Codex pre | Codex post |
|---|---|---|---|---|
| `obsolete-dir` | none (parked the conflict, offered close-or-rework) 3/4 | Close 4/4 | none (parked the conflict, offered migrate-or-retire) 3/4 | Close 4/4 |
| `superseded` | Close via the conflict decision 3/3 | Close citing #12 3/3 | none (treated it as an API merge choice) 2/3 | Close citing #12 3/3 |
| `update-asked` | none; refused the requested update 1/6 | Update, range-diff, leased rebase 6/6 | none; refused the requested update 1/7 | Update, range-diff, leased rebase 6/6 |
| `update-self-triggered` | not run | Update, no rewrite 4/4 | not run | Update, no rewrite 4/4 |
| `rework` | Rework via the conflict decision 3/3 | Rework 3/3 | Rework via the conflict decision 3/3 | Rework 3/3 |
| `fresh` | not run | no assessment 4/4 | not run | no assessment 4/4 |
| `lease-race` | not run | refused, reassessed, author commit kept 5/5 | not run | refused, reassessed, author commit kept 5/5 |

Post-change: every criterion met on both hosts; no push before a verdict and no `gh` mutation in any cell. Pre-change: the right call appeared only when the fixture conflicted, because the currency-conflict path forced a decision; `obsolete-dir` never reached Close on either host, and both hosts refused a rebase the user asked for.

Notes for the next run:
- The first Codex batch ran under a login shell, so the user's profile put the real `gh` ahead of `bin/gh` and every cell stopped at `gh repo view`. The runner now passes `-c allow_login_shell=false` and an empty `ZDOTDIR`; those results were discarded.
- `facts.lease_refusals` counts any failed lease push. In Claude's `update-asked` cell the first push failed on a malformed refspec, not a lease, and the retry used the same pinned lease.
- One trial per cell. `obsolete-dir` and `superseded` conflict in these fixtures; a #342-shaped PR that merges cleanly would separate the pre-change arm further.
