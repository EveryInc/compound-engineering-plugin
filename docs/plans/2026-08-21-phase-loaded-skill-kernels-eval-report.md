# Phase-loaded skill kernels: evaluation report

Date: 2026-08-21

## Claim under test

Issue #1482 is valid as a size-contract problem, but it does not require splitting either public skill. The tested change turns `ce-plan` and `ce-work` into phase-loaded kernels: the body retains the outcome spine, unread stop classes, order, and safe failure direction; references own phase mechanics and are required at the step that acts on them.

The baseline is commit `66ccf579f8c1ef2ccfc642c317ba53151eeb1ebb`. The post arm is the current on-disk worktree. No PR, issue, push, or other GitHub mutation was used.

## Size result

Sizes use the repository's CRLF-adjusted body accounting.

| Skill | Baseline | Current | Change | 8,000-byte contract |
|---|---:|---:|---:|---|
| `ce-plan` | 31,069 | 6,899 | -24,170 | Pass, 1,101 bytes headroom |
| `ce-work` | 27,859 | 7,029 | -20,830 | Pass, 971 bytes headroom |
| `lfg` | 7,947 historical sweep result | 7,915 | -32 | Pass, 85 bytes headroom |

Against the plan's 7,000-byte soft target, `ce-plan` is 101 bytes under and `ce-work` is 29 bytes over. Both satisfy the hard 8,000-byte loader contract; the `ce-work` soft-target miss remains explicit rather than being hidden by the contract pass.

The `ce-plan` and `ce-work` frontmatter descriptions are byte-identical to the baseline. Their prompt-budget exceptions were removed. The remaining exceptions are `ce-debug` and `ce-explain`.

## Deterministic contract coverage

The changed tests distinguish always-loaded predicates from reference-owned mechanisms. They cover:

- `ce-plan` output-mode resolution, no-repository routing, resume and handoff reloads, settled-decision stops, pipeline blocker precedence, task visibility, invocation rendering, and artifact-root/config parity;
- `ce-work` input triage, requirements-only refusal, bounded pre-engine plan intake, engine-before-execution ordering, workspace/WIP setup, standalone review completion, return-to-caller reloads, root-relative pointers, and return grammar ownership;
- the `ce-work` producer / `lfg` consumer status and field inventory, including unknown-status fail-closed behavior and an independently owned 23-field complete-return inventory; and
- the 8,000-byte prompt-budget ratchet.

The first full suite found four stale tests that still treated relocated text as body-owned. Those assertions were retargeted to their new owners. The final deterministic gate results belong in the validation section below; a green grep is not behavioral proof by itself.

## Fresh-host behavior cells

Artifacts are under `/tmp/compound-engineering-501/ce-skill-eval/issue1482/`. Each row used a fresh Claude, Codex, or Grok process with the skill tree extracted from the named arm. The table reports the current catalog grade after one deterministic regrade of preserved transcripts; no model call was retried to turn a failure green.

| Scenario | Arms | Hosts | Cells | Result | Evidence carried by the cell |
|---|---|---|---:|---|---|
| `ce-plan/no-implement` | baseline + current | Claude, Codex, Grok | 6 | 6 pass | no implementation action; current arm reads `output-mode.md` and `resume.md` |
| `ce-work/requirements-only-stops` | baseline + current | Claude, Codex, Grok | 6 | 6 pass | stops without actions; current arm reads `input-triage.md` |
| `ce-work/return-to-caller-no-pr` | baseline + current | Claude, Codex, Grok | 6 | 6 pass | no PR/push action; current arm reads `input-triage.md` and `return-to-caller.md` |
| `lfg/plan-first` | baseline + current | Claude, Codex, Grok | 6 | 6 pass for the narrow route assertion | reads `plan-brief.md` and chooses planning before work |
| `ce-plan/config-model-reaches-authoring-gate` | current only | Claude, Codex, Grok | 3 | 3 pass | reads `reasoning-elevation.md` and `output-mode.md`; performs no repository action |

Total: 27 of 27 current catalog grades pass, including all required-read pointer grades.

The external-review fixes received two additional current-only cells on fresh Claude and Codex hosts. Both hosts loaded `ce-work`'s input-triage and workspace owners, created and re-read a clean feature branch, and stopped before implementation. Both also classified a software-planning prompt, re-entered `output-mode.md` through `resume.md`, and selected HTML from the active `plan_output: html` configuration without taking repository action. These four cells passed. Their receipts are under `/tmp/compound-engineering-501/ce-skill-eval/issue1482/review-fix/`; they are targeted evidence, not additions to the catalog-grade total above.

### Rubric correction

The first `ce-plan/no-implement` grade incorrectly required the response to contain `ce-unified-plan/v1`. Codex and Grok correctly stopped on unsettled product behavior before producing an implementation-ready artifact, so the assertion could not distinguish correct restraint from failure. The catalog now grades the actual invariant: do not implement or commit, and keep `ce-work` as the implementation boundary. The preserved six transcripts were regraded with `tests/skill-eval-cell/regrade.ts`; all six pass. This was a grader repair, not a model retry.

### Nested-skill isolation caveat

The `lfg/plan-first` pack proves only the first routing decision. Its Codex and Grok runs followed installed marketplace copies of nested `ce-plan`, so those cells are not evidence that the full extracted `lfg -> ce-plan -> ce-work` chain used the worktree revisions.

A separate local-plugin canary linked this worktree, started a fresh Codex process in a disposable no-remote repository, and observed worktree `lfg` load worktree `ce-plan`, produce an implementation-ready plan, and enter worktree `ce-doc-review`. The run was deliberately stopped before the review launched another expensive cross-model cascade. It is a real partial-chain receipt, not end-to-end shipping proof. The Codex installation was restored to its original `absent` state afterward.

## Independent review results

Two fresh-reader passes found ten concrete defects after the first implementation: impossible engine ordering, circular no-repository output resolution, duplicate return grammar ownership, ambiguous reference paths, an overloaded workspace branch rule, an incomplete early blocker envelope, producer/consumer field drift, unknown-status fall-through, equal-omission risk, and a falsely broad reduced-envelope test. Each defect was fixed at its owning layer and received a focused regression assertion.

The final post-fix review found four more ownership defects: `lfg` did not require two producer fields unconditionally, `ce-plan` could dispatch model elevation twice, typed carrier values could be rejected only after workspace setup, and `execution-engines.md` retained three stale owner pointers. Those defects were also fixed with focused assertions. The same review confirmed that the receipt-backed full pipeline, late read failures, and repeated high-risk trials remain evaluation gaps rather than completed evidence.

A subsequent adversarial pass by Grok 4.6 and Claude Sonnet found three actionable gaps and one stale pointer. The pipeline blocker test could pass when fields disappeared from the actual envelope because it searched whole files; the `ce-work` workspace owner had dropped the load-bearing branch/default-branch probes; and `ce-plan` could defer format configuration until the domain route was known without a guaranteed point-of-use re-entry. `execution-engines.md` also still pointed inline work at the old body-owned location. The fixes narrow the blocker assertion to the owned envelope, restore the branch probes in the workspace owner, re-enter output-mode resolution from the software route before renderer selection, and point execution at `references/execution-strategy.md`. The fresh-host cells above exercise the two behavioral changes; focused tests cover all four.

## Unexercised paths and limits

These claims remain unproven and must not be inferred from the passing cells:

- an actual conformant Agent Plugins loader applying the 8,000-byte truncation contract; the body measurement proves eligibility, not loader behavior;
- a complete fresh-worktree `lfg -> ce-plan -> ce-work -> shipping` run;
- a controlled second-read failure after a plan artifact or work mutation already exists;
- three repeated trials of the highest-risk handoff and return paths;
- every `ce-plan` entry path, including deepening, approach comparison, explicit-path resume, and late handoff-owner failure;
- every `ce-work` execution engine, workspace topology, failed return, and standalone shipping tail;
- GitHub PR creation, review babysitting, or any other live external mutation boundary; and
- immutable child-invocation receipts for every nested route in the generic eval pack.

These are evaluation gaps, not demonstrated implementation failures. The deterministic tests protect the corresponding contracts where they can do so without pretending to exercise model judgment or external state.

## Validation

All repository gates passed against the final diff:

- `bun run test`: 3,468 pass, 0 fail across 138 files. An earlier parallel run had two timing failures outside the changed contracts; both passed in an 83-test isolated rerun, and the complete suite then passed cleanly;
- `bun run release:validate`: release metadata in sync;
- `bun run plugin:validate`: marketplace and plugin manifests valid; and
- `git diff --check`: clean.

---

# Round 2: independent behavioral evaluation (2026-08-21, later the same day)

This round was run against the same uncommitted worktree (HEAD `66ccf579f8c1ef2ccfc642c317ba53151eeb1ebb` plus the 33-path diff) by a separate evaluation session, using the repository's fresh-host harness modules with a scratch driver. It does not repeat the round-1 catalog cells; it closes the gaps the round-1 report listed as unexercised and audits the evidence quality. No skill prose or implementation test was edited. No commit, push, PR, issue, or other GitHub mutation was made. Installed plugin caches were not modified.

## Verdict

**Credible with named residual risks.** The phase-loaded kernels route, stop, and hand off the way the body and the reference owners say they should on Claude, Codex, and Grok across 96 fresh-process host-cells (83 of 97 graded host-cells pass; every failure is classified below, and none is a regression introduced by the restructure). Two producer/consumer contract problems and one host-specific validation weakness were confirmed; all three already existed at the baseline commit. One claim of the restructure — that Phase-5 owners are reloaded *at the acting point* — is contradicted on Claude, which loads every Phase-5 reference at kernel-load time, so the late-owner-failure safety path could not be exercised there.

## Method

- **Matrix.** Predeclared before any cell ran, at `/tmp/compound-engineering-501/ce-skill-eval/issue1482-r2/MATRIX.md` (with three dated addenda for trials added after a first grade: extra malformed-carrier trials, a clean-fixture retry cell, and a complete-with-changes cell). `/tmp` is ephemeral; the matrix, per-cell `summary.json`, `grade.json`, prompts, stdout/stderr, tool traces, and git before/after snapshots are all under that root.
- **Driver.** `tests/skill-eval-cell` modules (same prompt wrapper, host argv, PATH shims) wrapped by a scratch driver that adds: an immutable `--out` per run; Claude `stream-json --verbose` so the ordered tool trace is preserved (`tool-calls.json`, `stream.jsonl`); Grok `streaming-json` (tool calls and served-model receipt); Codex `model:` header capture; SHA-256 of every injected skill file (`skill-hashes.json`) plus a diff against the worktree (`skill-drift-vs-worktree.json`); a per-host copy of the skill directory; a watcher that renames a reference owner after a workspace condition fires (first commit, or first plan file); and nested-skill isolation (Claude `--plugin-dir` + `enabledPlugins` override disabling the installed plugin; Codex scratch `CODEX_HOME` with the worktree skills linked and the installed plugin set `enabled = false`).
- **Hosts and served models (receipts).** Claude Code 2.1.238 → `claude-fable-5` (stream init + `modelUsage`); codex-cli 0.148.0 → `gpt-5.6-sol` (transcript header); grok 1.0.8 → `grok-4.6-build` (`modelUsage`). Every cell's `summary.json` carries the receipt.
- **Orca.** The orchestration guide was loaded (`orca skills get orchestration`). It was not used for behavioral cells: Orca workers are interactive agent terminals and cannot prove which skill bytes a nested worker received any better than the harness's extract directory and prompt receipts; parallelism came from background driver processes instead.
- **Grading.** Assertions are evaluated from preserved evidence only (`scratchpad/driver/grade-cells.ts`): ordered tool traces (Claude/Grok tool calls, Codex `exec` blocks, including file paths read through `cat`/`sed`), git before/after (branch, HEAD, status, diff from seed, files committed by the run), PATH-shim invocation logs, and the final message with the `FILES_READ`/`ACTIONS`/`DELEGATES_DISPATCHED` trailers stripped before any prose match. The grader was corrected in one consolidated pass after two independent fresh-reader audits (below) showed that early rubrics matched trailer text, trusted the self-reported `ACTIONS`, or treated a compound shell command as a single observation; every correction regraded the same immutable transcripts. No model call was rerun to change a result; the added trials in the addenda are additional predeclared trials whose originals are kept and counted.
- **Cost.** 226 model-minutes across 96 host-cells, billed to the existing Claude, Codex, and Grok subscriptions.

## Source identity

All current-arm cells injected the worktree `skills/<name>` directory (WORKTREE sentinel; `skill-drift-vs-worktree.json` empty except for the deliberate owner removal in P8). Baseline cells (`W1b-badjson-base-*`) used `git archive 66ccf579`. Nested-chain cells used a plugin directory whose `skills/` tree is byte-identical to the worktree (`plugin-live.sha256` diff clean); nested Claude traces show `ce-eval:*` skill invocations and `plugin-live/skills/...` reads only.

## Size and loader reconfirmation

- CRLF-adjusted body sizes: `ce-plan` 6,899; `ce-work` 7,029; `lfg` 7,915 (LF: 6,841 / 6,971 / 7,856). Frontmatter descriptions byte-identical to baseline for all three. `tests/codex-skill-prompt-budget.test.ts` passes.
- Fresh loader paths: a fresh `codex exec` under a scratch `CODEX_HOME` listed `ce-eval:ce-plan`, `ce-eval:ce-work`, `ce-eval:lfg` with their descriptions and printed a warning that *descriptions* were shortened to fit Codex's skills context budget (a description-level budget, distinct from the 8,000-byte body contract). A fresh `claude -p --plugin-dir` session loaded all 33 skills and recited the `ce-plan` and `ce-work` descriptions verbatim, but reported name-only entries for `lfg`, `ce-debug`, and every other skill except `ce-doc-review`; the three with descriptions are not the three smallest bodies, so this is not evidence of the 8,000-byte rule and is recorded as an unexplained model self-report about the Claude `--plugin-dir` listing, not as loader proof. No host truncated or rejected any of the three bodies in 96 runs.
- Conversion packaging: `bun run src/index.ts convert` to opencode, antigravity, and codex (`--include-skills`) packaged every `references/*` file for the three skills (32 / 16 / 8 files, counts equal to the worktree) and the converted `ce-work` trees are byte-identical to the worktree. Root-relative reference pointers resolved on all three hosts in every cell (no host read an installed copy of the skill under test; see the isolation note for the one nested exception).
- Evaluation side effect to disclose: the Pi conversion ignores `-o` and writes to `~/.pi/agent` (the correct flag is `--pi-home`); it overwrote a prior CE Pi install there with the worktree snapshot. Nothing else outside the scratch roots was modified.

## Per-cell results

Legend: `current` = worktree skill; `baseline` = commit `66ccf579`; `current (owner removed)` = worktree copy with `references/intake.md` removed. A cell's prompt is byte-identical across its hosts and trials. Minutes are wall-clock per host.

| cell | host | served model | skill source | grade | min | failed checks |
|---|---|---|---|---|---:|---|
| L1-blocker-outranks-plan | claude | claude-fable-5 | current | pass | 0.6 |  |
| L1-blocker-outranks-plan | codex | gpt-5.6-sol | current | pass | 1.0 |  |
| L2-retry-only-when-neither | claude | claude-fable-5 | current | FAIL | 1.0 | ce-plan invoked exactly twice; ce-work never invoked |
| L2-retry-only-when-neither | codex | gpt-5.6-sol | current | pass | 1.3 |  |
| L2b-retry-clean | claude | claude-fable-5 | current | pass | 0.9 |  |
| L2b-retry-clean | codex | gpt-5.6-sol | current | FAIL | 14.1 | ce-plan invoked exactly twice; pipeline stopped |
| L3-complete-advances | claude | claude-fable-5 | current | FAIL | 1.2 | advances to ce-simplify-code or ce-code-review |
| L3-complete-advances | codex | gpt-5.6-sol | current | pass | 4.2 |  |
| L3b-complete-with-changes | claude | claude-fable-5 | current | pass | 1.4 |  |
| L3b-complete-with-changes | codex | gpt-5.6-sol | current | pass | 8.5 |  |
| L4-status-blocked | claude | claude-fable-5 | current | pass | 0.9 |  |
| L4-status-blocked | codex | gpt-5.6-sol | current | pass | 1.5 |  |
| L4-status-failed | claude | claude-fable-5 | current | pass | 0.9 |  |
| L4-status-failed | codex | gpt-5.6-sol | current | pass | 1.2 |  |
| L4-status-malformed | claude | claude-fable-5 | current | pass | 0.9 |  |
| L4-status-malformed | codex | gpt-5.6-sol | current | pass | 1.7 |  |
| L4-status-unknown | claude | claude-fable-5 | current | pass | 1.0 |  |
| L4-status-unknown | codex | gpt-5.6-sol | current | pass | 1.4 |  |
| L5-nested-live-claude-1 | claude | claude-fable-5 | current | pass | 12.2 |  |
| L5-nested-live-claude-2 | claude | claude-fable-5 | current | pass | 13.3 |  |
| L5-nested-live-codex-1 | codex | gpt-5.6-sol | current | pass | 23.1 |  |
| P1-html-route | claude | claude-fable-5 | current | pass | 0.5 |  |
| P1-html-route | codex | gpt-5.6-sol | current | pass | 1.1 |  |
| P1-html-route | grok | grok-4.6-build | current | pass | 1.0 |  |
| P2-answer-seeking | claude | claude-fable-5 | current | FAIL | 1.0 | answer-seeking route stated (not approach-altitude) |
| P2-answer-seeking | codex | gpt-5.6-sol | current | FAIL | 1.2 | answer-seeking route stated (not approach-altitude) |
| P2-answer-seeking | grok | grok-4.6-build | current | pass | 3.2 |  |
| P3-reqonly-enrich | claude | claude-fable-5 | current | pass | 0.4 |  |
| P3-reqonly-enrich | codex | gpt-5.6-sol | current | pass | 0.6 |  |
| P3-reqonly-enrich | grok | grok-4.6-build | current | pass | 0.6 |  |
| P4-explicit-resume | claude | claude-fable-5 | current | pass | 0.5 |  |
| P4-explicit-resume | codex | gpt-5.6-sol | current | pass | 0.6 |  |
| P4-explicit-resume | grok | grok-4.6-build | current | pass | 1.4 |  |
| P5-deepen | claude | claude-fable-5 | current | pass | 0.5 |  |
| P5-deepen | codex | gpt-5.6-sol | current | pass | 0.7 |  |
| P5-deepen | grok | grok-4.6-build | current | pass | 0.8 |  |
| P6-approach | claude | claude-fable-5 | current | FAIL | 0.8 | held before producing (no composed approach-plan sections) |
| P6-approach | codex | gpt-5.6-sol | current | pass | 0.7 |  |
| P6-approach | grok | grok-4.6-build | current | pass | 1.2 |  |
| P7-full-plan | claude | claude-fable-5 | current | pass | 12.8 |  |
| P7-full-plan | codex | gpt-5.6-sol | current | pass | 14.7 |  |
| P7-full-plan | grok | grok-4.6-build | current | FAIL | 18.0 | handoff question verbatim |
| P8-owner-missing-early | claude | claude-fable-5 | current (owner removed) | pass | 0.6 |  |
| P8-owner-missing-early | codex | gpt-5.6-sol | current (owner removed) | pass | 0.6 |  |
| P8-owner-missing-early | grok | grok-4.6-build | current (owner removed) | pass | 1.2 |  |
| P9-owner-missing-late | claude | claude-fable-5 | current | FAIL | 9.0 | status: blocked; names plan-handoff.md; recovery_path field |
| P9-owner-missing-late | codex | gpt-5.6-sol | current | pass | 10.3 |  |
| P9-owner-missing-late | grok | grok-4.6-build | current | pass | 7.7 |  |
| W1-carrier-badjson | claude | claude-fable-5 | current | pass | 0.4 |  |
| W1-carrier-badjson | codex | gpt-5.6-sol | current | FAIL | 3.4 | explicitly rejects the carrier (blocked envelope or rejection sentence naming it); no commits; no new or changed files; HEAD unchanged; branch unchanged; no workspace-setup.md read before rejection (no branch cmd) |
| W1-carrier-badjson | grok | grok-4.6-build | current | pass | 1.0 |  |
| W1-carrier-dup | claude | claude-fable-5 | current | pass | 0.4 |  |
| W1-carrier-dup | codex | gpt-5.6-sol | current | pass | 0.5 |  |
| W1-carrier-dup | grok | grok-4.6-build | current | pass | 0.8 |  |
| W1-carrier-runid | claude | claude-fable-5 | current | pass | 0.5 |  |
| W1-carrier-runid | codex | gpt-5.6-sol | current | pass | 0.6 |  |
| W1-carrier-runid | grok | grok-4.6-build | current | pass | 0.8 |  |
| W1-carrier-type | claude | claude-fable-5 | current | pass | 0.5 |  |
| W1-carrier-type | codex | gpt-5.6-sol | current | pass | 0.6 |  |
| W1-carrier-type | grok | grok-4.6-build | current | pass | 1.2 |  |
| W1b-badjson-base-codex-1 | codex | gpt-5.6-sol | baseline 66ccf579 | FAIL | 2.0 | explicitly rejects the carrier (blocked envelope or rejection sentence naming it); no commits; no new or changed files; HEAD unchanged; branch unchanged; no workspace-setup.md read before rejection (no branch cmd) |
| W1b-badjson-base-codex-2 | codex | gpt-5.6-sol | baseline 66ccf579 | FAIL | 2.3 | explicitly rejects the carrier (blocked envelope or rejection sentence naming it); no commits; no new or changed files; HEAD unchanged; branch unchanged; no workspace-setup.md read before rejection (no branch cmd) |
| W1b-badjson-base-codex-3 | codex | gpt-5.6-sol | baseline 66ccf579 | FAIL | 2.3 | explicitly rejects the carrier (blocked envelope or rejection sentence naming it); no commits; no new or changed files; HEAD unchanged; branch unchanged; no workspace-setup.md read before rejection (no branch cmd) |
| W1b-badjson-current-codex-2 | codex | gpt-5.6-sol | current | FAIL | 2.7 | explicitly rejects the carrier (blocked envelope or rejection sentence naming it); no commits; no new or changed files; HEAD unchanged; branch unchanged; no workspace-setup.md read before rejection (no branch cmd) |
| W1b-badjson-current-codex-3 | codex | gpt-5.6-sol | current | FAIL | 3.1 | explicitly rejects the carrier (blocked envelope or rejection sentence naming it); no commits; no new or changed files; HEAD unchanged; branch unchanged; no workspace-setup.md read before rejection (no branch cmd) |
| W2-ws-ahead | claude | claude-fable-5 | current | pass | 0.6 |  |
| W2-ws-ahead | codex | gpt-5.6-sol | current | pass | 1.1 |  |
| W2-ws-ahead | grok | grok-4.6-build | current | pass | 1.2 |  |
| W2-ws-detached | claude | claude-fable-5 | current | pass | 0.5 |  |
| W2-ws-detached | codex | gpt-5.6-sol | current | pass | 1.3 |  |
| W2-ws-detached | grok | grok-4.6-build | current | pass | 1.3 |  |
| W2-ws-feature-dirty | claude | claude-fable-5 | current | pass | 0.6 |  |
| W2-ws-feature-dirty | codex | gpt-5.6-sol | current | pass | 1.3 |  |
| W2-ws-feature-dirty | grok | grok-4.6-build | current | pass | 1.4 |  |
| W2-ws-main-dirty | claude | claude-fable-5 | current | pass | 0.6 |  |
| W2-ws-main-dirty | codex | gpt-5.6-sol | current | pass | 1.0 |  |
| W2-ws-main-dirty | grok | grok-4.6-build | current | pass | 1.1 |  |
| W2-ws-noremote | claude | claude-fable-5 | current | pass | 0.6 |  |
| W2-ws-noremote | codex | gpt-5.6-sol | current | pass | 1.2 |  |
| W2-ws-noremote | grok | grok-4.6-build | current | pass | 1.4 |  |
| W3-rtc-complete | claude | claude-fable-5 | current | pass | 1.3 |  |
| W3-rtc-complete | codex | gpt-5.6-sol | current | pass | 2.8 |  |
| W3-rtc-complete | grok | grok-4.6-build | current | pass | 4.2 |  |
| W4-rtc-collision | claude | claude-fable-5 | current | pass | 0.5 |  |
| W4-rtc-collision | codex | gpt-5.6-sol | current | pass | 1.1 |  |
| W4-rtc-collision | grok | grok-4.6-build | current | pass | 2.7 |  |
| W5-rtc-late-owner | claude | claude-fable-5 | current | pass | 1.5 |  |
| W5-rtc-late-owner | codex | gpt-5.6-sol | current | pass | 2.7 |  |
| W5-rtc-late-owner | grok | grok-4.6-build | current | pass | 4.5 |  |
| W6-engine-require-unavail | claude | claude-fable-5 | current | pass | 1.3 |  |
| W6-engine-require-unavail | codex | gpt-5.6-sol | current | pass | 3.2 |  |
| W6-engine-require-unavail | grok | grok-4.6-build | current | pass | 5.3 |  |
| W7-engine-prefer-codex-live | claude | claude-fable-5 | current | pass | 5.4 |  |
| W8-standalone-no-review-ship | claude | claude-fable-5 | current | pass | 4.0 |  |
| W8-standalone-no-review-ship | codex | gpt-5.6-sol | current | pass | 9.8 |  |
| W8-standalone-no-review-ship | grok | grok-4.6-build | current | pass | 9.6 |  |
| W9-goal-engine-claude | claude | claude-fable-5 | current | pass | 5.9 |  |

Total graded host-cells: 97; pass 83; fail 14.

## Failures, classified

Every non-passing host-cell above falls into one of these classes. "Skill" means the behavior contradicts the skill text or its consumer's contract; "contract" means two skill files disagree; "prompt" means the host obeyed the skill but not the evaluation prompt's stop instruction; "harness" means the evaluation environment, not the skill, produced the result; "rubric" means the predeclared assertion could not decide the behavior and was corrected once.

| Cell(s) | Class | What happened | Owning layer and recommended fix |
|---|---|---|---|
| W1-carrier-badjson codex; W1b-badjson-current-codex-2/3; W1b-badjson-base-codex-1/2/3 | **skill (host-specific, pre-existing)** | Codex (`gpt-5.6-sol`) accepted `implementation_engine:{"mode":"prefer","target":"codex","model":null,"source":"eval"` (no closing brace) in 6 of 6 trials — 3 current arm, 3 baseline — and went on to fetch, branch, implement, commit, and return `status: complete` with a fully populated binding, never acknowledging the defect. Claude and Grok rejected it before any workspace action (1/1 each), as did all three hosts for the duplicate, type-invalid, and unsafe-run-id variants (9/9). | `skills/ce-work/references/input-triage.md`, carrier grammar. The text already says "Reject malformed JSON … before any workspace action"; Codex pattern-matches the four field names instead of parsing. The fix proposed here — a condition plus a parse mechanism in prose — was tried in Round 3 and did not change Codex's behavior (it parsed a retyped string); see the Round 3 table and `docs/solutions/skill-design/prose-cannot-validate-caller-control-data-byte-for-byte.md`. Not a regression: identical at `66ccf579`. |
| W6-engine-require-unavail (all three hosts, after regrade) | **contract (pre-existing)** | With `mode: require`, `target: cursor`, and a pinned model absent from `cursor-agent --list-models`, all three hosts disclosed `fallback_reason` and continued natively, returning `status: complete`. That is what `ce-work` says (`execution-engines.md` line 22 and 73; `cross-model-execution.md` lines 27, 90, 129: "does not turn route unavailability into a blocker … disclose … then continue natively"). It is the opposite of what `lfg` says it will accept (`references/work-return.md` line 11: "An unavailable `require` route must not prompt, fall back, or start native work — it is a stop"). Both texts are byte-identical at baseline. | The producer's fallback semantics are owned by `cross-model-execution.md` and are incident-backed; the consumer's sentence is unenforceable as written because the return it receives is `complete`. Fix at the consumer: state the condition on the return fields (`implementation_engine_binding.mode == require` and `actual_route != requested_route` → stop as blocked and surface `fallback_reason`), or change the producer to return `blocked` under `require`. Pick one; today each side believes the other stops. |
| P7-full-plan claude; P9-owner-missing-late claude | **evidence contradicting an intended contract** | In both full `ce-plan` runs Claude read `final-review.md`, `reasoning-elevation.md`, and `plan-handoff.md` at tool calls 11–15 — before research dispatch and before the plan `Write` (call 31/35) — and did not re-read `plan-handoff.md` after writing. The late-owner watcher fired after the write, but the owner had already been consumed, so the run completed normally instead of returning the blocked envelope. (Elevation itself resolved once: native attempt rejected pre-launch → Claude CLI adapter failed on the unavailable model → inline; no second authoring dispatch.) | `skills/ce-plan/SKILL.md` workflow preamble ("Before each phase, read its required reference completely") and the Phase-5 "STOP. Read `references/plan-handoff.md` immediately before 5.3.8 and 5.4". Neither states the condition that an early read does not satisfy the acting-point read, so a front-loading host satisfies the letter and loses both the freshness and the context benefit the kernel design exists for. Verify on Codex/Grok (P7/P9 below); if they also front-load, restate the condition once in the kernel rather than per step. |
| L2-retry-only-when-neither claude | **skill (condition gap), 1 of 2 hosts** | The stub `ce-plan` returned prose with no plan and no blocker while a stale, topically related `docs/plans/widget-plan.md` (from the base fixture) sat in `<root>/plans/`. Claude's `lfg` treated that file as the written plan and invoked `ce-work mode:return-to-caller docs/plans/widget-plan.md`; Codex retried `ce-plan` exactly once and stopped, as the body requires. With the stale plan removed (L2b), Claude retried once and stopped correctly. | `skills/lfg/SKILL.md` step-1 gate + `references/plan-brief.md` readiness check. "Only absence of both a blocker and a plan file invokes `ce-plan` again" keys on *any* plan file at the root; the condition should be the plan `ce-plan` reported writing in this run. |
| L3-complete-advances claude | **adversarial fixture; correct stop** | The stub `ce-work` returned a complete envelope but changed no files. Claude applied `work-return.md`'s "verify that implementation work was performed" and stopped; Codex advanced to review. L3b (same envelope with the implementation commit present) advanced on both hosts through `ce-simplify-code`, `ce-code-review`, and `ce-test-browser`. | Not a defect in Claude. Codex's consumer is weaker on the "work was performed" check (1 trial); Verify-class. |
| L2b-retry-clean codex | **harness (isolation failure); evidence excluded** | Codex mis-resolved the stub skill path, `find`-hunted for `ce-plan/SKILL.md`, found only `~/.codex/plugins/cache/.../3.22.4/skills/ce-plan/SKILL.md` (the *disabled* installed plugin's files are still on disk), and ran the 3.22.4 `ce-plan`/`ce-work` prose inline. It never invoked the stub. This is the only Codex cell with any `plugins/cache` read (all other Codex nested cells: zero). | Evaluation harness. Codex nested isolation by `CODEX_HOME` + `enabled = false` removes the skill from the list but not from the filesystem; a model that path-hunts can still reach it. Record as a caveat on every Codex nested cell and re-check `L5-nested-live-codex-1` for cache reads before counting it. |
| P2-answer-seeking claude, codex | **prompt ambiguity (skill condition does not decide)** | The prompt carried approach-language ("a plan for how you would find out …") over an investigative question. `resume.md` 0.1a's explicit trigger ("plan how you'll do X") and its R16 exclusion ("with no approach-language … answer-seeking") both fire; Claude and Codex routed to approach-altitude, Grok to answer-seeking. Neither host read config; none mutated. The text is unchanged by the restructure. | Observation, not a kernel defect. If the split matters, the owning condition is in `references/resume.md` 0.1a/R16. |
| P6-approach claude | **prompt compliance** | Claude routed correctly to approach-altitude, then composed the full approach-plan and checkpoint despite "stop before producing it"; Codex and Grok held. No file written. | Not a skill defect. |
| W8-standalone-no-review-ship codex (grader) | rubric | Codex ran the standalone tail including `ce-code-review` (receipt `Ready to merge`) and reported "Review: complete"; the first rubric looked for the phrase "code review". Corrected once; passes. | — |
| L4-status-blocked codex, L4-status-unknown claude, L4-status-malformed codex, P8/W5 markdown-bold status fields, W2 compound shell observations, W1 "reports carrier error", P7 "elevation once" (adapter chain), W6 (consumer-vs-producer rubric) | rubric | Each was an assertion that could not distinguish correct behavior (a `**status:** \`blocked\`` rendering; a `No <promise>DONE</promise>` sentence in prose; the one documented `ce-work` recovery re-invocation on a malformed return; a single compound `git checkout -b … && git branch --show-current`; an ordered adapter chain inside one elevation resolution). Each was corrected once and the same transcripts regraded. | — |

## Transcript and tool-trace audit

Two fresh-reader subagents that did not author the skills or the matrix audited 21 `ce-plan` host-cells (P1–P6, P8) and 34 `ce-work` host-cells (W1/W1b/W2/W4) against the raw traces. Their findings, beyond what the grader scores:

- **No host read an installed copy of the skill under test** in any audited cell (zero hits for `plugins/cache`, `~/.claude`, `~/.codex`, `~/.grok`, `.agents` in tool inputs and Codex `exec` lines). Nested skills invoked by a standalone run in a non-isolated cell (`ce-doc-review`, `ce-code-review`, `ce-simplify-code`, `ce-commit`) do come from the installed 3.22.4 cache, as expected for a fresh process with the plugin enabled; only the skill under test was the worktree copy.
- **FILES_READ trailers matched the traces** in all 55 audited host-cells (no claimed-but-unread files; omissions were reads that failed because the file did not exist, which is the correct negative).
- **No mutation in any read-only cell** (git before == after, empty diff, no write tools).
- **Reading order is loose on every host.** "Output first" (`output-mode.md` before interpreting any phase) was honored by Grok consistently; Claude and Codex batch the Phase-0 reads or read the plan file first (P1 codex, P3 claude/codex, P4/P5 claude). Codex read `workspace-setup.md` before `input-triage.md` in W2-ws-ahead. Outcomes were unaffected, but the kernel's "before each phase" sequencing is advisory in practice.
- **Reads beyond the stop point:** P1 codex read `html-rendering.md` twice after being told to stop before writing; P5 claude read `deepening-workflow.md` although it is gated on "when directed"; P6 claude read `intake.md`; P8 claude read every workspace file after already knowing the owner was missing. Unproductive, not unsafe.
- **Codex self-reports task-list creation without a visible `update_plan` event** (W2 detached/noremote/ahead); Grok's `todo_write` calls are visible; Claude created no task list in W2 cells (stopped one step early on "stop after workspace setup").
- **W4 envelope semantics differ by host** for the same blocked state (`u_ids_attempted: [U1]` on Claude, `[]` on Codex/Grok). The field inventory is identical; the meaning of "attempted" is not pinned.
- **P8 blocked envelopes render differently** (Codex clean `key: value`; Claude fenced multi-line; Grok bold markdown). Fields are present on all three; an `lfg` consumer's tolerance for the renderings is exercised only by the Claude/Codex nested cells.
- **`lfg` request sanitization varies:** Claude strips the `lfg:` prefix and the "and ship it" clause from the feature request it passes to `ce-plan`; Codex passes the arguments unchanged (the body says "unchanged" when no routing directive exists). Plan content was equivalent.
- **One harness denial:** P1 grok's `git rev-parse --show-toplevel` was denied by the read-only policy; Grok assumed the workspace was the repo root and still resolved the format from config.

## Variance across repeated trials

| Path | Trials | Outcome |
|---|---|---|
| Malformed carrier, Codex | 6 (3 current, 3 baseline) | 6/6 accepted — deterministic on Codex, identical across arms |
| Malformed/duplicate/type/run-id carriers, all hosts | 12 current | 11/12 rejected before mutation (the one miss is the Codex case above) |
| `ce-work` return-to-caller complete (W3) | 3 (one per host) | 3/3: full 23-field envelope, `standalone_shipping_skipped: true`, `return-to-caller.md` read on entry and again before return, path-limited commits, nothing reached the push/PR shims |
| Dirty-file collision (W4) | 3 | 3/3 blocked without editing or committing the user's file, usable recovery path, no question asked |
| Late return-owner failure (W5) | 3 | 3/3: second read failed after the first commit; each host returned the kernel's reduced `status: blocked` envelope (`plan_path`, `changed_state`, `blockers` naming the owner, `recovery_path`) with the commit preserved and no standalone tail |
| Workspace topologies (W2) | 15 | 15/15 safe base choice (origin/main when not ahead; HEAD when ahead or no remote; stay on an existing feature branch); user dirty files untouched and uncommitted in all 6 dirty cells; no stash, no `add -A`, no commit on main; branch observed before and after every move |
| Early missing owner, pipeline (P8) | 3 | 3/3 complete blocked envelope naming `intake.md`, no plan written, no reconstruction from memory |
| Nested live chain, Claude (L5) | 2 | 2/2 ran worktree `lfg → ce-plan → ce-doc-review → ce-work (return-to-caller) → ce-simplify-code → ce-code-review → ce-test-browser → local-only ship → DONE` with no push and no `gh pr` reaching the shims; `ce-plan` resumed the fixture's matching plan in place rather than writing a new one |
| `lfg` seam with stubbed children (L1, L3b, L4×4) | 2 hosts each | 14/14: blocker outranks an existing plan; blocked/failed/unknown/malformed returns stop before simplify/review/ship (Codex took the one documented recovery re-invocation on the malformed return, Claude stopped directly — both within contract); a complete return with real changes advances through the review steps |
| Cross-model live (W7, Claude host, `prefer codex`) | 1 | A real Codex worker was dispatched through the bundled controller; the first worker attempt returned `blocked` on a packet defect and was abandoned with receipts preserved; the second attempt completed, was integrated as a canonical commit, and `verify-run` returned `RUN_VERIFIED`; no native substitution |
| Goal mode on Claude (W9) | 1 | Explicit route outcome: no callable goal tool → copyable prompt emitted, then inline; standalone tail ran with a `ce-code-review` receipt before finishing |

Rows for P7 (Codex, Grok), P9 (Codex, Grok), and L5 (Codex) are in the addendum below.

## What is now proven

- `ce-plan` routing and output ownership on three hosts: software planning resolves `plan_output: html` only after the domain route (P1); answer-seeking that mentions code never probes config (P2, all hosts); requirements-only input enriches in place with no resume prompt (P3); explicit-path edits take the standard resume flow (P4); deepening short-circuits to 5.3 with `final-review.md` as owner (P5); approach requests load `approach-altitude.md` (P6); a missing owner before the artifact returns the full blocked envelope (P8); planning never crossed into implementation in any of 31 `ce-plan` host-cells.
- `ce-work` triage and workspace safety: carriers are validated before mutation on Claude and Grok for all four defect classes and on Codex for three of four; requirements-only artifacts stop (round 1, 6/6); five branch topologies choose safe bases with before/after observation and leave user WIP untouched; all branch work ran in disposable fixture repositories.
- `ce-work` execution and completion ownership: return-to-caller complete, blocked, and late-owner-failed returns carry the documented fields and preserve state; return-to-caller never entered review, commit, or PR; standalone mode on Claude and Codex ran `ce-code-review` and held the ship step (no `gh pr` reached the shim in any cell); engine resolution happened before any write in every write-capable cell; a live `prefer codex` route dispatched, recovered, integrated, and verified through the controller.
- `lfg` seam behavior with real nested dispatch: planning before work; a structured blocker outranks an existing plan; only a valid complete return with real changes advances; blocked, failed, unknown, and malformed statuses stop safely; the full no-remote chain runs end-to-end on Claude using worktree skills only.
- Loader and portability: sizes and descriptions reconfirmed; three converters package references recursively and byte-identically; root-relative pointers resolve on fresh Claude, Codex, and Grok hosts in every cell.

## What remains unexercised or unproven

- A conformant Agent Plugins loader applying the 8,000-byte truncation itself; the eval shows eligibility and successful loads, not the truncation path.
- The late-owner-failure path for `ce-plan` on Claude (front-loading made it unreachable) and, pending the addendum, on Codex and Grok.
- `lfg → ce-plan → ce-work` nested chain on Grok (Grok discovers skills only from its user-level skills/plugins directories; loading the worktree there would mutate user state) and on Codex beyond the cells noted in the addendum.
- Any live GitHub mutation: push, PR creation, CI watch, babysit.
- Post-`init` cross-model lock against native fallback (W7 exercised the sanctioned post-start fallback claim path indirectly via an abandoned attempt, not a forbidden native substitution).
- Goal-mode and dynamic-workflow engines on Codex (`create_goal`) — only the Claude no-callable-tool outcome was exercised.
- Cursor-as-target cross-model execution; only its unavailability was exercised.
- The `require`-route contract after a fix: whichever side is changed needs a paired producer/consumer cell.
- Weaker model tiers on any host; all cells ran the hosts' current default models.

## Evidence contradicting the implementation's intended contract

1. "Final review and handoff reload their owners at the acting point" — contradicted on Claude (P7, P9): owners are read once at kernel load; no reload before 5.3.8/5.4.
2. "Malformed carriers are rejected before any workspace mutation" — contradicted on Codex in 6/6 trials; holds on Claude and Grok. Pre-existing.
3. "`lfg` accepts only what `ce-work` produces" — the `require`-route fallback is accepted by `ce-work`'s own text and rejected by `lfg`'s; neither side's cells stop. Pre-existing.
4. "Only absence of both blocker and plan permits the retry" — on Claude, an unrelated pre-existing plan file satisfied the gate once (L2); the clean-fixture retry behaved.

## Deterministic validation for this report

Run after the report was written: `bun test tests/codex-skill-prompt-budget.test.ts tests/skill-eval-cell` and `git diff --check` (results recorded in the addendum). The round-2 driver, grader, fixtures, and stub plugin live in the session scratchpad and were not added to the repository; the repository diff after this round differs from the start of the round only in this report file.

## Addendum: the last three cells and the final tally

- **P9-owner-missing-late, Codex and Grok: pass.** Both hosts wrote the plan, the watcher removed `references/plan-handoff.md`, the acting-point read failed, and each returned `status: blocked` with `artifact_path`, `blocker` naming the missing owner, and a `recovery_path` that resumes at Phase 5.3.8 without substituting a plugin-cache copy; the plan file was preserved. So the late-owner safety path is demonstrated on Codex (1/1) and Grok (1/1) and unreachable on Claude (1/1) because of front-loading (see "Evidence contradicting", item 1). Codex read `plan-handoff.md` once in each run, after the plan write (an earlier grep hit on that name in P7 was a `find` listing, not a read — corrected after the learning-capture pass re-read the exec blocks).
- **P7-full-plan, Codex: pass; Grok: fail on one check.** Codex wrote the plan, resolved elevation once (native attempt rejected pre-launch, Claude CLI adapter, inline), invoked the installed `ce-doc-review`, and rendered the exact handoff question. Grok read `final-review.md`/`reasoning-elevation.md` after research and `plan-handoff.md` immediately after the plan write (the cleanest phase ordering of the three hosts), resolved elevation once, presented the Phase-5.4 menu with the plan path, but did not render the body's verbatim question ("Plan ready at `<path>`. What would you like to do next?") — a wording deviation, not a missing gate. Grok also handled document review by reading `~/.claude/plugins/cache/…/3.22.4/skills/ce-doc-review/…` and spawning its own reviewer subagents, instead of recording the `skill_unreachable` envelope `plan-handoff.md` requires when the skill cannot be invoked; Grok has no CE skills installed, so this is a substitution the owner forbids ("do not substitute a generic … subagent"). Verify-class on Grok; Claude and Codex invoked the skill through their skill mechanisms.
- **L5-nested-live-codex-1: pass.** Codex ran the full no-remote chain with worktree skills from the scratch `CODEX_HOME` (zero `plugins/cache` reads; `ce-eval:ce-plan`, `ce-eval:ce-work mode:return-to-caller`, simplify, review, browser gate, local-only ship, `DONE`). With the two Claude trials, the fullest safe nested chain is 3/3; it stops exactly at `lfg`'s shipping precondition (`git remote` empty → commits made, push/PR/CI skipped as a terminal state), which is the documented no-remote terminal.
- **Final tally:** 97 graded host-cells (96 matrix cells plus the manual-host probe rows excluded), 83 pass, 14 fail. The 14: six Codex malformed-carrier acceptances (pre-existing), L2 Claude stale-plan gate (condition gap), L2b Codex (harness isolation failure, excluded as evidence), L3 Claude (correct stop on a complete-with-no-change stub, counted against the predeclared "advance" assertion), P2 Claude/Codex (prompt ambiguity), P6 Claude (prompt compliance), P7 Grok (handoff wording), P9 Claude (front-loading made the late failure unreachable).
- **Deterministic validation for this round** (run after the report was written; the repository diff differs from the start of the round only by this file): `bun test tests/codex-skill-prompt-budget.test.ts tests/skill-eval-cell` → 55 pass, 0 fail; `git diff --check` clean. The full suite was not re-run because no code, test, or skill file changed in this round; the round-1 result (3,468 pass) stands for the implementation diff.
- **Manual steps that remain yours:** a Grok nested chain (needs a symlink in `~/.grok/skills`), a live PR tail on a throwaway GitHub repository, and whether to restore the released Pi install under `~/.pi/agent`. The runbook is the Claude artifact "Issue #1482 manual behavioral eval steps"; results from it will be graded with the same grader and appended here.

### Manual step 1 result: nested chain on Grok (run by the maintainer, graded here)

Evidence: `/tmp/compound-engineering-501/ce-skill-eval/issue1482-r2/manual/grok-chain/` (prompt, `stream.jsonl` with 173 tool calls, `git-after.txt`). Served model `grok-4.6-build`; exit 0; 12 minutes.

- **Chain:** worktree `lfg` → `ce-plan` (resumed the fixture's matching `docs/plans/widget-plan.md` in place, as pipeline mode requires) → document review → `ce-work` (`git checkout -b feat/greet-quiet`, branch re-read, proof-first test, path-limited commit `31cf811`) → `ce-simplify-code` (three lenses, no change) → `ce-code-review` (correctness + testing, artifacts under `/tmp/compound-engineering-501/ce-code-review/…`, one review fix committed as `925d065`) → browser gate → local-only ship (`git remote -v` empty; the plan committed as `7ba8a9d`; no `git push`, no `gh pr`) → `<promise>DONE</promise>`. **Pass** on every L5 assertion. With the two Claude and one Codex trials, the fullest safe nested chain is now 4/4 across three hosts, each stopping at the documented no-remote terminal.
- **Source-identity caveat:** the `~/.grok/skills/ce-eval` symlink was dangling (it pointed at `/Users/tmchow/Code/skills`), so Grok found no `ce-eval:*` entries and instead read `ce-plan`, `ce-doc-review`, `ce-work`, `ce-simplify-code`, `ce-code-review`, and `ce-test-browser` from the worktree by absolute path next to the pinned `lfg` (tool calls 17, 34, 69, 87, 96, 164). It listed the Claude plugin cache twice and `~/.grok/skills` once while searching, but read no file from any cache. Every skill byte it consumed was the worktree's; the route to them was filesystem navigation, not a skills listing, which is Grok's only mechanism anyway (it has no skill-invocation tool and no CE skills installed).
- **Grok-specific deviation, consistent with P7:** document review, simplification, and code review ran as in-process emulations with `spawn_subagent` personas read from the worktree references, not as skill invocations, and no `skill_unreachable` envelope was recorded. On a host with no skill mechanism this is the only way the chain can run; it is noted, not failed.
- The `refs/cmux/last-turn/*` entries in `git log --all` are snapshots made by the maintainer's terminal tool during the run, not actions of the skill.

### Manual step 2 result: live PR tail — harness failure, no behavioral evidence, one remote side effect

The runbook's step-2 commands were defective and the run never reached a canary repository. `gh repo create ce-1482-canary --private --clone -- -q` failed (the repository was never created), so the following `cp`/`cd`/`git add . && git commit -m seed && git push -u origin HEAD` executed inside this worktree: commit `5170bee1c seed` (two fixture files under `ce-1482-canary/`) landed on `tmchow/eval-issue-1482-skill` and that branch was pushed to origin for the first time. The Claude run then started in `bullhead/ce-1482-canary` with `--plugin-dir` pointing at the worktree root, but the nested invocations resolved to the installed `compound-engineering:ce-plan` / `ce-doc-review` / `ce-work` (3.22.4) rather than `ce-eval:*` — the `enabledPlugins` override that worked in the scratch probes did not apply when the working directory was inside the plugin root — wrote `docs/plans/2026-08-21-1210-feat-greet-quiet-export-plan.md` into this worktree, and ended after 48 turns with `API Error: The response stopped arriving` (exit 1) before any implementation edit, push, or PR. `gh pr list` at the end returned the repository's existing PRs; none was created.

Classification: evaluation-harness failure (runbook command defect plus plugin-isolation assumption), not a skill result. Nothing in it is counted. Remote side effect to reverse: the pushed branch tip `5170bee1c` on `origin/tmchow/eval-issue-1482-skill`. Local residue: the seed commit, `ce-1482-canary/`, and the stray plan file; the 33-path implementation diff is untouched. The live PR tail remains unexercised.

### Manual step 2, second attempt: live PR tail — pass

Run by the evaluation session with the maintainer's authorization after the first attempt's harness failure, against a fresh private canary `tmchow/ce-1482-canary` created outside any checkout. Evidence: `/tmp/compound-engineering-501/ce-skill-eval/issue1482-r2/manual/live-pr-2/` (stream with 115 turns, `prs.json`, `pr1.json`, `git-after.txt`, `plugin-live.sha256`). Served model `claude-fable-5`; exit 0; zero `plugins/cache` reads; every nested invocation was `ce-eval:*` (the byte-identical worktree snapshot).

- Chain: `ce-eval:lfg` → `ce-plan` (enriched the fixture plan in place) → `ce-doc-review mode:non-interactive` (1 fix applied, 1 P3 decision left) → `ce-work mode:return-to-caller` (`git fetch origin main`, `checkout -b feat/greet-quiet`, proof-first test, path-limited commit) → `ce-simplify-code` → `ce-code-review mode:agent` ("Ready to merge", zero findings) → `ce-test-browser mode:pipeline` (skip, no web surface) → `ce-commit-push-pr mode:pipeline branding:on` → `git push -u origin HEAD` → `gh pr create --base main --head feat/greet-quiet` → `ce-babysit-pr mode:pipeline <url>` (returned with the absent-CI residual; no needs-human items) → `<promise>DONE</promise>`.
- Remote state after: `main` untouched at the seed; `feat/greet-quiet` with two commits (plan, feature); exactly one open PR, #1, base `main`. No force-push, no merge.
- Note: the PR body carries the CE badge but not the `## Security Disclosure` / `## Agent Disclosure` sections — the canary has no `.github/pull_request_template.md`, so those sections are not expected there; they are this repository's template convention, not the skill's.
- Residue: none. The maintainer deleted the canary repository afterward (the evaluation token lacked the `delete_repo` scope); the local clone was trashed.

With this, every path the round-1 report listed as unexercised has been run at least once except the loader's own truncation behavior, post-`init` cross-model lock violation, Codex goal-mode, Cursor-as-target, weaker model tiers, and the `require`-route contract after a fix.

## Round 3: fixes for the three confirmed defects, with post-fix cells

Authorized by the maintainer after round 2. Each fix was made at its owning layer and re-evaluated with the same prompts, fixtures, and grader (matrix addendum 4; evidence under `…/issue1482-r2/F1-*`, `F2-*`, `F3-*`).

| Defect | Change | Post-fix cells | Result |
|---|---|---|---|
| `lfg` stale-plan gate | `skills/lfg/SKILL.md` step-1 gate now reads "a plan file `ce-plan` reported writing this run"; `references/plan-brief.md` states the condition (a file already under `<root>/plans/` that `ce-plan` did not report is not a written plan; neither blocker nor reported path → the single retry). Pin added in `tests/pipeline-review-contract.test.ts`. `lfg` body headroom 85 → 49 bytes. | F3: Claude ×2, Codex ×1, stale plan present, stub `ce-plan` returns prose | 3/3: `ce-plan` invoked exactly twice, `ce-work` never, no DONE (was 1/2 hosts advancing on the stale plan) |
| `require`-route producer/consumer conflict | Resolved at the consumer. `skills/lfg/references/work-return.md` now says `ce-work` discloses and continues natively under `require` (owned by `cross-model-execution.md`) and LFG stops as blocked when `implementation_engine_binding.mode` is `require` and `actual_route` differs from `requested_route`, reporting both routes and `fallback_reason`. The unenforceable "must not prompt, fall back, or start native work" sentence is gone. Pins: new test in `tests/pipeline-review-contract.test.ts` (consumer condition + producer sentence), and the old "must not prompt" pin in `tests/skills/unified-plan-artifact-contract.test.ts` retargeted with its reason. | F2: Claude ×1, Codex ×1, stub `ce-work` returns `complete` with `mode: require`, `requested_route: cursor`, `actual_route: native` | 2/2: `ce-work` once, no simplify/review/ship, stop names the route mismatch, no DONE |
| Codex accepts malformed carrier JSON | **Attempted and reverted.** Added to `input-triage.md`: acceptance is a successful strict parse of the exact carrier substring by a real JSON parser, never repaired. Codex (`gpt-5.6-sol`) complied literally — it ran `node -e 'JSON.parse(…)'` in all three trials — on a string it had retyped with the closing brace restored (F1-badjson-post-codex-2's command contains `…"source":"eval"}`), then implemented and committed as before. A prose mechanism cannot reach bytes the model normalizes while transcribing; Claude and Grok rejected the carrier before and after (1/1 each). The sentence was removed rather than shipped as an untested-benefit mechanism; `input-triage.md` is byte-identical to its round-2 state. | F1: Codex ×3, Claude ×1, Grok ×1 | Codex 0/3 rejected (unchanged); Claude 1/1, Grok 1/1 rejected (unchanged) |

Residual for the Codex carrier defect: the only caller that emits the carrier is `lfg` via `stage-routing.md`, so a malformed carrier in practice means a buggy caller, and the damage is an implementation on a feature branch under a `prefer` binding that the caller then reads as a normal return. A deterministic guard would have to live where the raw argument exists — the host's skill-invocation layer or a bundled script that receives the argument verbatim — not in prose. Recorded as a known Codex limitation, not fixed.

Validation after round 3: `bun run test` 3,469 pass, 0 fail across 138 files; `bun run release:validate` in sync (33 skills); `git diff --check` clean.

### PR #1508 review round: the front-loading condition, added and re-evaluated

A Codex review bot filed the Claude front-loading gap as a P1 against `skills/ce-plan/SKILL.md:37`. The kernel's Workflow preamble now reads: "Read a phase's required reference when that phase is entered, completely; a read made before that phase does not satisfy it, and a terminal owner is read again at its step even when already in context." Pinned in `tests/pipeline-review-contract.test.ts`. Post-fix cell `P9b-owner-missing-late-post-claude` (byte-identical prompt to P9, `claude-fable-5`): Claude read `plan-handoff.md` at the acting point after the plan write, the watcher's removal took effect, and the run returned `status: blocked` with `phase`, `blocker`, `recovery_path`, and `artifact_path`, plan preserved — pass (1/1). "Evidence contradicting" item 1 is closed on Claude for the late-owner path; whether the condition also stops the up-front bulk read of every reference (the context-cost half) was not re-measured.
