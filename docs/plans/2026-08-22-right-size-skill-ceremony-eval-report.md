# Right-Size Skill Ceremony - Eval Report

Companion to `docs/plans/2026-08-22-0934-fix-right-size-skill-ceremony-plan.md`. Evidence that `ce-plan`, `ce-brainstorm`, and `ce-work` right-size ceremony for small work without changing the paths larger work takes.

## Runbook

**Execution cells** run through the repo's eval cell (`tests/skill-eval-cell/`): the skill under test is extracted from a git ref into a throwaway workspace and invoked by the host CLI with the catalog task. Pre arm = `RIGHT_SIZE_BASE_REF` (`925b4ef71`, main before this change). Post arm = the working tree at the time the cell started. Hosts: `claude`, `codex`, `grok`, all three on every row. Grades come from the catalog's `grade` fields, applied by `tests/skill-eval-cell/grade.ts`; no grade was hand-scored.

```bash
bun run test:skill-eval-pack -- --id <row> --arm ab --hosts claude,codex,grok --out <dir>
```

Three post passes were run because the prose moved while cells were in flight: pass 1 (pre + the first draft), pass 2 (after the reader-pass restatements), pass 3 (the committed prose, with `git_remote` on the shipping rows). Pass 1's pre arms are the baseline evidence; pass 3 is the post evidence; pass 2 is reported for completeness. The Direct row was re-run pre/post after its task was retargeted at the state-and-stop branch; that rerun is the row's reported result.

**Activation rows** cannot run in the cell, which injects one skill and cannot observe the harness choosing one. They ran as fresh host sessions with the whole plugin loaded, per arm:

- pre tree: `git archive 925b4ef71 | tar -x` into a temp dir; post tree: rsync of the working tree.
- Claude Code: `claude -p --plugin-dir <tree> --permission-mode dontAsk --allowedTools Read,Glob,Grep,Skill --disallowedTools Edit,Write,Bash,Agent,Task --output-format stream-json --verbose "<prompt>"` in a seeded throwaway repo (tiny-lib plus tiny-auth's `src/session.js`). Do not pass `--bare`: it skips plugin credentials and the run never reaches the model.
- Codex: a throwaway `CODEX_HOME` holding a copy of `auth.json` and `config.toml` plus `skills/compound-engineering-local -> <tree>/skills` (the same link `bun run codex:dev -- local` creates), then `codex exec --sandbox read-only --json -C <repo> "<prompt>"`.
- "Skill loaded" signal: a `Skill` tool use naming `ce-plan` / `ce-brainstorm` (Claude), or a skill file read or an explicit "using the `<skill>` skill" statement (Codex). The plugin's skill list in the session init event is not a load.
- Prompts: trivial (typo fix), small-one-decision (optional greeting argument, signature vs constant), medium-clear (CLI entrypoint with `--json` and tests), risky-small (session cookie flags).

## Execution rows

| Row | Invariant | Pre (pass 1) | Post (pass 3) |
|---|---|---|---|
| `ce-plan/direct-trivial-stays-in-chat` | typo fix: no file, no subagent, stated in chat (state-and-stop branch) | claude PASS, codex FAIL (dispatched research), grok FAIL (dispatched research) | all PASS |
| `ce-plan/chat-brief-small-no-file` | one-decision change: brief in chat, no file | claude FAIL (wrote plan file), codex FAIL (wrote plan file), grok FAIL (timed out writing) | all PASS |
| `ce-plan/risky-small-stays-durable` | two-line auth change: plan file written | claude PASS, codex PASS, grok timeout | claude PASS, codex PASS, grok timeout |
| `ce-plan/no-implement` (existing) | planning never implements | claude PASS, codex FAIL (baseline), grok FAIL (baseline) | all PASS |
| `ce-brainstorm/lightweight-ends-in-chat` | one-question product tweak: no file, no scout | all PASS | all PASS |
| `ce-work/mechanical-diff-ships-without-watch` | version bump: committed, review skipped, `babysit:off` passed | all FAIL (no `babysit:off`) | claude PASS, grok PASS, codex not observable (see below) |
| `ce-work/chat-brief-executes-without-replanning` | chat brief implemented, not re-planned | all PASS | all PASS |

Pass 2 (restated prose, before `git_remote`): 19/21 PASS; the two misses were Codex on the mechanical row (no remote, so the shipping tail took the local `ce-commit` path where no watch exists — a cell-setup gap, fixed by `git_remote`) and a Grok host timeout on risky-small.

Honest reads:

- `ce-brainstorm/lightweight-ends-in-chat` and `ce-work/chat-brief-executes-without-replanning` pass in both arms on every host. They do not show improvement; they are regression guards (the old prose already ended a one-question alignment without a file, and already executed a self-contained prompt).
- `ce-plan/no-implement`'s pre-arm Codex and Grok failures are baseline failures on `ISSUE_1482_BASE_REF`, not regressions; the row's post arm is the regression guard for the Durable path.
- **Direct on Claude.** In passes 1 and 3 the Claude post run stated the change, resolved Direct, then invoked the installed `ce-work`, which made the one-line fix on a branch and committed it. That matched the first Direct contract (invoke `ce-work` on an imperative request). Review on the PR (Codex) argued, and the reader pass had flagged, that a planning invocation is not execution authority; the contract now states the change and offers the handoff in one line, invoking `ce-work` only on acceptance or under an orchestrator's implementation intent. The cell row grades that state-and-offer result; the two full runs above are evidence of what the earlier invoke branch did, not of the shipped contract. One judgment call in those runs is worth knowing: `ce-work` classed a one-character string fix as a mechanical diff and skipped review, flagging it as a judgment call — that is `ce-work`'s pre-existing rule, not this change.
- **Direct on Codex (pass 3).** Codex stated the change and stopped without naming `ce-work`; correct behavior, too-literal grade, fixed in the rerun.
- **Mechanical diff on Codex.** With `git_remote`, Codex took the push/PR path (it attempted the push against the fake origin), recorded `Code review: skipped (mechanical diff)`, but the push failure cut the run before the shipping skill's arguments were narrated, so `babysit:off` is not observable in that transcript. Claude and Grok name the argument. Absent, not contrary.

## Large-path routing probes

The Durable, Standard-brainstorm, and reviewed-ship paths are unchanged past the gate. The diff against `main` touches only the gate seam: `ce-plan/references/intake.md` 0.6 (gate first) and 0.7 (Durable-only guard), `research.md` (a Lightweight-only branch), one scoping sentence each in `final-review.md` and `plan-handoff.md`, `plan-sections.md`'s no-plan block replaced by a pointer; `ce-brainstorm/references/phase-0.md` 0.3 and `synthesis-summary.md` Path A (Lightweight-only), `brainstorm-sections.md` and `plan-write.md` (the file-earning condition); `ce-work/references/input-triage.md` (session-carried brief), `work-intake.md` Large row (unless already sized), `shipping-workflow.md` (mechanical `babysit:off`). So the standing regression guards are bounded read-only probes that check the routing decision and the first step into the unchanged path, not full runs:

| Row | Invariant | Pre | Post |
|---|---|---|---|
| `ce-plan/medium-feature-routes-durable` | multi-file feature is delivered as a plan file | all PASS | all PASS |
| `ce-brainstorm/standard-scope-routes-to-file` | localization scope classifies Standard and heads to a file | all PASS | all PASS |
| `ce-work/behavior-fix-routes-to-review` | whitespace-trim fix is Small/Medium, reviewed, default watch | all PASS | all PASS |

One-time full runs of the same three paths were also run in this session as end-to-end evidence (hand-read from the cell artifacts; not kept as catalog rows):

- Multi-file `ce-plan` feature, post: Claude wrote the plan file and presented the handoff menu; Codex wrote the plan file (its menu rendered as a numbered list); Grok did not complete (its pre arm timed out and the pack stopped). Pre: Claude wrote the file; Codex stopped on a question without writing.
- Standard-scope `ce-brainstorm`, pre and post: every host wrote a file, and every post file carries `requirements-only`.
- Behavior-bearing `ce-work` fix, pre and post: every host committed the change and ran code review; no host passed `babysit:off`.
- `lfg/plan-first` (existing, pipeline pins Durable): pre all PASS; post Claude and Grok PASS, Codex host timeout (not a behavior signal).

## Activation

| Prompt | Claude pre | Claude post | Codex pre | Codex post |
|---|---|---|---|---|
| trivial | no skill | no skill | no skill | no skill |
| small-one-decision | no skill | no skill | no skill | no skill |
| medium-clear | no skill | no skill | no skill | `ce-work` |
| risky-small | no skill | no skill | no skill | not run |

Neither `ce-plan` nor `ce-brainstorm` loaded implicitly on any prompt in either arm on either host. So the plan's own rule applies (R9, U2): the description negatives are unverified as the cause of the reported over-triggering and were not shipped. `ce-brainstorm`'s existing negative already decides the small-change case; `ce-plan`'s candidate clause is recorded in KTD9 for a future run that can reproduce a description-driven false trigger. The observed trigger source in these sessions is not the description; the likeliest sources of the user's report are their own standing instructions or explicit invocation, which this change makes cheap instead of blocking.

## Live sessions (Orca-spawned TUIs)

Interactive sessions on this worktree's skills, driven through Orca terminals in a throwaway seeded repo. Claude Code ran with `--plugin-dir <worktree>`; Codex ran with a throwaway `CODEX_HOME` whose `skills/compound-engineering-local` links to `<worktree>/skills`. Grok's TUI exited before answering in both attempts, so Grok stays covered by the eval cell only.

| Prompt | Claude | Codex |
|---|---|---|
| explicit `ce-plan`: optional greeting argument + tests | Chat brief: summary, two units, one decision line (node:test over a framework), save-or-`ce-work` offer; no file, no subagent | Selected Direct, handed to `ce-work`, which implemented, ran review (no findings), and committed on a branch; no plan file, no research; no PR (no remote). Tier choice differs from Claude's Chat brief — a judgment variance, not a contract miss |
| implicit: "fix the typo in src/greet.js …" | Edited the file directly; no skill loaded | Auto-selected `ce-debug` ("fix failing behavior"), read four references, wrote a root-cause analysis, and stopped on a blocking "How would you like me to proceed?" before the one-line fix |
| implicit: optional greeting argument, "just decide and do it" | Decided in one line (signature default) and implemented directly; no skill loaded | not run |

The Codex typo row reproduces the original complaint on a path this change left out of scope: `ce-debug`'s description pulls a typo fix into its diagnosis loop on Codex, and its trivial fast-path still asks the fix-choice question before editing. That is a `ce-debug` activation and fast-path finding, recorded as follow-up in the plan; `ce-plan`, `ce-brainstorm`, and `ce-work` did not fire on that prompt on either host.

## Opus 5 (medium) matrix: headless and interactive

The live-session rows above were one trial per prompt on Fable. This section reruns the scoping decision on the models users actually run, three trials per cell, with prompts chosen to include the ones where skipping a plan file would be the wrong call. Hosts: Claude Code with `--model claude-opus-5 --effort medium --plugin-dir <worktree>`, and Codex (`gpt-5.6-sol`, throwaway `CODEX_HOME` linking `<worktree>/skills`). Every cell is an explicit `ce-plan` invocation in a seeded three-file repo (`src/greet.js`, `src/session.js`, `package.json`). Grading reads the host's session transcript plus `git status` in the workspace; "file" means a plan was written under `docs/plans/`. No cell edited source.

**Headless** (`claude -p` / `codex exec`, so no user can act on chat this turn):

| Prompt | Claude Opus 5 | Codex |
|---|---|---|
| cache repeated `greet` calls | Durable, file 3/3 | Chat brief 3/3 |
| signed session cookie (HMAC) | Durable 3/3 (file 2, confirm gate 1) | Durable at confirm gate 3/3 |
| retry wrapper around an external API | Durable, file 3/3 | Durable at confirm gate 3/3 |
| localization of the greeting | Durable, file 3/3 | Durable at confirm gate 3/3 |
| "write a plan for" a greeting config file | Durable, file 3/3 | chat plan, no file 3/3 |
| `bin/greet.js` CLI with `--json` | Durable, file 3/3 | Direct / Chat brief 3/3 |
| validate `name` is a non-empty string | Durable, file 3/3 | Direct 3/3 |
| rename `greet` to `greeting` | Chat brief 3/3 | Direct 3/3 |
| typo fix in the greeting string | Direct 3/3 | Direct 3/3 |

**Interactive** (Orca-spawned TUIs, prompt typed as a user would; scope-confirm gates answered "confirm"):

| Prompt | Claude Opus 5 | Codex |
|---|---|---|
| cache repeated `greet` calls | Chat brief 3/3 (names cache growth as the one decision; offers save or `ce-work`) | Chat brief 2, Direct 1 (same decision named) |
| signed session cookie | Durable 3/3, file written after confirm 3/3 | Durable 3/3 at confirm then a key-handling question (the harness could not answer the Codex dialog, so no file) |
| "write a plan for" a config file | Durable 3/3, file 2/3 (third cut mid-research by the harness) | chat plan, no file 3/3 |
| `bin/greet.js` CLI with `--json` | Chat brief 2, Durable 1 | Direct 2, Chat brief 1 |
| validate `name` | Chat brief / Direct 3/3 | Direct 3/3 |
| typo fix | Direct 3/3 | Direct 3/3 |

Reads:

- Neither host under-plans the risk-surface prompts: the cookie, retry, and localization prompts go Durable on every trial on both hosts, headless and interactive.
- Claude's headless-vs-interactive split on caching, `--json`, and validation is the "no synchronous user" pin working: a `-p` run has nobody to act on a chat brief, so it writes the file; the same prompt in a TUI gets a brief. Codex does not apply that pin headlessly (it delivers the brief to stdout); that is a judgment variance on a tier this change made cheap either way, not a regression.
- **One real miss, fixed in this PR.** "Write a plan for X" produced a chat plan with no file on Codex 6/6 (headless and interactive) while Claude wrote the file 5/5. The Durable pin named "an explicit request for a plan file or an output format" and Codex read it literally. The pin now reads "a request whose wording asks for a plan, a plan file, or an output format". Rerun against the tightened prose, headless: Codex file 3/3, Claude file 1/1.
- Codex's gate at "Confirm and I'll proceed" and its key-handling `request_user_input` are Durable-path behaviour this change did not touch; the cells stop there because the harness cannot drive Codex's dialog, not because the skill stopped.

Harness notes for reruns: the Codex TUI needs its workspace pre-trusted in `config.toml` (`[projects."<path>"] trust_level = "trusted"`) and ~3 minutes of MCP startup before the first prompt lands; `orca terminal create --worktree active` must run from inside the Orca worktree, not a scratch directory.

## Deterministic checks

`bun run test` (3,555 tests), `bun run release:validate`, `bun run plugin:validate`: green at every commit on the branch. Kernel sizes (CRLF-adjusted, 8,000 cap): `ce-plan` 7,826, `ce-brainstorm` 7,666, `ce-work` 7,664.

## What the eval surfaced that was not acted on

- Grok times out on the 900-second rows more often than the other hosts; the rows were not loosened.
- `ce-plan/no-implement` fails on the old prose for Codex and Grok; that predates this change.
