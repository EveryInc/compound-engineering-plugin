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
- **Direct on Claude.** In passes 1 and 3 the Claude post run stated the change, resolved Direct, then invoked the installed `ce-work`, which made the one-line fix on a branch and committed it. That is the Direct contract working as designed for an imperative request; the original cell grade (`actions: none`) contradicted the contract on a host where `ce-work` is callable. The row now names `ce-work` as unavailable so the cell grades the state-and-stop branch (the invoke branch is live delegation, evidenced by those two full runs). The runs also exposed a missing condition, now stated in `references/output-contracts.md`: when `ce-work` cannot be invoked, state the change and stop. One judgment call in those runs is worth knowing: `ce-work` classed a one-character string fix as a mechanical diff and skipped review, flagging it as a judgment call — that is `ce-work`'s pre-existing rule, not this change.
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

## Deterministic checks

`bun run test` (3,555 tests), `bun run release:validate`, `bun run plugin:validate`: green at every commit on the branch. Kernel sizes (CRLF-adjusted, 8,000 cap): `ce-plan` 7,788, `ce-brainstorm` 7,666, `ce-work` 7,664.

## What the eval surfaced that was not acted on

- Grok times out on the 900-second rows more often than the other hosts; the rows were not loosened.
- `ce-plan/no-implement` fails on the old prose for Codex and Grok; that predates this change.
