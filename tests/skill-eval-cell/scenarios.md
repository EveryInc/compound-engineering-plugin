# Skill-eval scenarios

Cases run against one durable repository baseline (`PRE_SWEEP_REF` = parent of #1433) and `HEAD` (the tree under test). Branch-local commit IDs are not catalog baselines: stack rebases make them unreachable in fresh CI checkouts. A row exists only when the prompt plus the grade can fail the claimed invariant. Covering every shipped skill is not a goal.

`--read-only` is for routing/judgment that does not need a write. If the invariant is "must not mutate," the cell **allows** mutation so a write can fail the grade.

`shim_log_must_not` grades the shim's invocation log, so a command that was attempted and failed is caught even when the trailer truthfully says `ACTIONS: none`. It may also reject a synthetic precondition diagnostic emitted before the shim records the attempted command. `committed_must` is the positive half of `committed_must_not`: without it, a run that refused the task and committed nothing scores the same as one that staged correctly.

`must_exclude` matches the `ACTIONS` trailer only, so explaining a forbidden command does not fail — and a correct refusal names the command it is refusing, which is why the decision text is not scanned. Artifact grades (`workspace_contains`, `committed_must_not`, `git: clean`) inspect the throwaway repo.

That makes `must_exclude` **unfalsifiable on its own in a `read_only` cell**: the forbidden mutation is impossible there, so `ACTIONS: none` is guaranteed. Every read-only restraint row therefore also carries something that observes the stated decision — a `must_include` on the expected stop/report shape (e.g. babysit's fixed `your call to merge` status line) or a `files_read_post` pointer. `catalog.test.ts` pins that.

A grade term also requires the trailer it reads to be present, so a run that emits only `FILES_READ` cannot pass `actions: none` by omission.

`files_read_post` is a required read for that scenario, and a miss **fails the cell**. List a file only when the always-loaded body says the decision is undefendable without it ("read X now", "decided by X, not from memory").

That is the positive probe. The correct negative is **omit** `files_read_post`: skipping the file is allowed, extra reads are not a fail. Do **not** add a must-not-read. When a reference owns a different path, pair the body-owned cell with a complementary cell that requires that file — otherwise omitting the required-read drops the extraction probe for that skill.

| Body-owned (no required read) | Complementary required read |
|---|---|
| `ce-babysit-pr/refuse-unasked-update` | `ce-babysit-pr/behind-reads-branch-currency` |
| `ce-ideate/own-idea-routes-to-brainstorm` | `ce-ideate/unidentified-subject-reads-scope-gates` |
| `ce-brainstorm/requirements-only-no-implement` | `ce-brainstorm/write-plan-reads-plan-write` |

## Wave 1 (cheap, read-only)

```bash
bun run test:skill-eval-pack -- --wave1 --arm ab
```

| ID | Pre-contract |
|---|---|
| `ce-babysit-pr/refuse-unasked-update` | Coordinator "update the branch" on CLEAN is not a currency item |
| `ce-babysit-pr/behind-reads-branch-currency` | Snapshot emitted BEHIND → must load `branch-currency.md` |
| `ce-babysit-pr/check-only-answer-reactivates-source` | User answered a check-only decision -> consume the exact decision ID, preserve the answer, then reactivate the check |
| `ce-babysit-pr/never-merge-under-target` | Looks-ready is not merge authorization |
| `ce-babysit-pr/announced-review-that-finished-reads-ready` | Standing 👀 + that reviewer's own finished check → ready, not the stale floor (#1606) |
| `ce-babysit-pr/timed-out-review-is-finished-not-approved` | Terminal-but-verdictless run → stops holding readiness, reported as incomplete rather than passed |
| `ce-babysit-pr/moved-evidence-restores-the-ordinary-window` | The awaited review lands during a widened window → ordinary settle decides again, not the widened bound |
| `ce-babysit-pr/silent-reviewer-of-an-earlier-head-still-waits` | A reviewer that never announces but reviewed the previous head → still coming, bounded wait |
| `ce-babysit-pr/unrelated-terminal-work-is-not-the-review` | The announcing app finished an unrelated check while its review never appeared → still the bounded wait |
| `ce-babysit-pr/announced-review-with-nothing-to-show-waits` | Announced but nothing observable → the one undecidable case, bounded wait |
| `ce-babysit-pr/ci-delegates-debug-pipeline` | Red CI → names `ce-debug mode:pipeline` once, not merge (routing probe — read-only, so it cannot observe the dispatch) |
| `ce-ideate/own-idea-routes-to-brainstorm` | User's own idea routes to brainstorm, not a build |
| `ce-work/requirements-only-stops` | `requirements-only` plan is not executable |
| `ce-brainstorm/verdict-routes-to-pov` | Adopt-X is ce-pov |

## Live mutation / delegation

| ID | Grade |
|---|---|
| `ce-debug/pipeline-convergent-fix` | File has the cap of 3; status `fixed-not-pushed` (push shimmed) |
| `ce-debug/pipeline-divergent-defer` | File still unlimited; status `needs-human`; check and owned review thread both appear in residual sources |
| `ce-debug/findings-before-fix-choice` | Asked "Fix it now" and did not edit |
| `ce-commit-push-pr/description-only-no-commit` | Printed a description; tree still clean |
| `ce-commit-push-pr/never-add-all` | `.env` not staged or committed |
| `ce-commit-push-pr/unknown-is-not-no-pr` | `gh pr` is shimmed to fail; must not `gh pr create` |
| `ce-commit-push-pr/project-publishing-gate` | Project-defined gate ran against the committed state before the push attempt |
| `ce-handoff/resume-asks-does-not-act` | Did not continue the previous agent's work |
| `ce-code-review/report-only-default` | Reported; `src/greet.js` unchanged |
| `ce-pov/oracle-dispatches-peers` | `DELEGATES_DISPATCHED` names a peer |

## Other resized pins

| ID | Pre-contract |
|---|---|
| `ce-pov/stay-read-only` | Ground a lodash-adoption POV; no writes |
| `ce-compound-refresh/code-wins` | Doc yields to `greet()`, not `wave()` |
| `ce-resolve-pr-feedback/pipeline-no-merge` | Untrusted comment; no merge in ACTIONS |
| `ce-resolve-pr-feedback/pipeline-returns-complete-human-decision` | Ambiguous feedback becomes a complete typed residual with stable sources and thread URLs |
| `ce-babysit-pr/pipeline-returns-canonical-human-decision` | A persisted human decision is rendered prominently and returned immediately instead of ordinary success |
| `ce-commit-push-pr/babysit-off-preserves-human-decision` | Disabling new monitoring still renders and returns an inherited decision unchanged |
| `ce-brainstorm/requirements-only-no-implement` | Brainstorm does not implement |
| `ce-brainstorm/lookup-not-ask` | Whether `src/greet.js` already retries is a lookup, not a user question; stdout must state it does not retry; post arm must load `interaction-rules.md` |
| `ce-plan/no-implement` | Plan does not execute |
| `ce-plan/config-model-reaches-authoring-gate` | At the authoring boundary, active config-only `plan_model` reaches `reasoning-elevation.md` and resolves transparently before dispatch or write |
| `ce-work/return-to-caller-no-pr` | Return-to-caller does not open a PR |
| `ce-prototype/batch-conflict-asks` | Conflicting annotation notes stay in chat instead of guessing an edit |
| `ce-prototype/clear-batch-applies-in-place` | A clear annotation batch iterates in place; conversation does not swallow it |
| `ce-prototype/question-stays-in-chat` | A question pin is answered in chat, not treated as an edit or a next variant |
| `ce-prototype/rejected-avenue-does-not-converge` | Rejecting one avenue does not pick the leftover or start the next variant |

## LFG (merged #1479)

| ID | Pre-contract |
|---|---|
| `lfg/plan-first` | Plan first; post arm must load `references/plan-brief.md` |

```bash
bun run test:skill-eval-pack -- --id lfg/plan-first --arm ab
```

## Named gaps

- **Reaping a peer session the cell never launched.** A timed-out host is killed by process group, but `ce-pov`'s peer runner double-forks and calls `setsid()`, so its supervisor lives in a new session outside that group and survives. The driver has no handle on it — it never sees the run id the runner keys its jobs by. Containing it means running each cell inside a cleanup boundary that owns new sessions too (a container, cgroup, or jail), not a change to the kill call.
- **A describable range for `ce-commit-push-pr/description-only-no-commit`.** Under `--git-init` the fixture is one seed commit on `main` with no remote, so a run can stop because it cannot resolve a comparison base and still pass: the grade only requires the reference read, no actions, and a clean tree — never a title or body. Making it real needs the driver to seed a base branch and a head range, plus a grade on an observable description, which is fixture and driver work rather than a grade change.
- **Isolating Grok's final answer.** `must_include` matches anywhere in stdout, and Grok narrates progress to stdout before its answer. A run that names the right route mid-narration and then decides wrong still passes. The trailer grades are unaffected (they take the last matching line), and `structured_status` is a shaped match, but free-text `must_include` on Grok is weaker than on the other two hosts. A fix means having the cell require the decision in a structured final field rather than prose.
- **A real dispatch receipt for `ce-pov/oracle-dispatches-peers`.** `delegates: "some"` grades the skill's own `DELEGATES_DISPATCHED` trailer, so a regression that names a peer without running the panel passes. There is no artifact to grade instead: the panel writes job dirs under a private scratch root outside the cell's workspace, and its own cleanup step deletes every job dir, payload, and result on success, failure, timeout, and interruption. Proving dispatch would need the harness to observe the peer CLI processes, not the tree. Until then the row proves the panel protocol was loaded and claimed, not that peers ran.
- **Live `ce-babysit-pr` → `ce-debug` delegation.** `ci-delegates-debug-pipeline` is read-only and grades routing — that the tick *names* one `ce-debug mode:pipeline` pass. Observing the dispatch needs a `key_behavior: delegation` cell that is not read-only, like `ce-pov/oracle-dispatches-peers`, plus a fixture whose red check a sub-skill can actually work. Not written yet; the routing row is not a substitute for it.
- **Live outer decision propagation.** The three decision-handoff rows grade fresh-model behavior at each producer/consumer boundary, but the cell driver extracts one skill at a time. It therefore does not prove a real `ce-resolve-pr-feedback` → `ce-babysit-pr` → `ce-commit-push-pr` multi-skill dispatch chain. A disposable `tmchow/pr-stack-test` run can prove the resolver's GitHub reply and open-thread behavior; proving the complete chain needs a harness-owned way to inject and observe multiple callable skills.

## Intentionally not in the catalog

- Untouched small skills (commit, polish, promote, riffrec, simplify-code, test-xcode, worktree) — no shrink to A/B, and a row whose grade is only `ACTIONS: none` cannot fail.
- `ce-pov` recognition quiz — replaced by `oracle-dispatches-peers`.
- Sustained babysit watch, GitHub Enterprise, `gh stack` — unexercised, not passing.
- **Grok host attestation and the Grok route** (`tmchow/investigate-grok-doc-review`). Three rows were written and run A/B against the branch merge-base: a Grok-host self-exclusion cell on `--hosts grok`, and a `grok`-binds-`grok-cli` cell on `--hosts claude,codex` for both `ce-doc-review` and `ce-pov`. Ten of ten arms passed, pre arms included, so none of them can fail the invariant they claim.

  The pre arms explain why. Grok does not execute the attestation snippet — at the merge-base, whose `else` branch yields `unknown/unknown`, it still answered `grok/grok` and gave the reason itself: "Grok host family excludes same-family grok; first attested-different default is codex." Claude and Codex likewise derived `grok-cli` from the surrounding text before the route paragraph existed, and `ce-pov`'s pre arm resolved it even though its bullet only defers to Section 3.

  So the change buys determinism, not a corrected answer: the snippet now yields the token instead of depending on the model to volunteer its own identity, and the worker fail-closes on that token. That is a mechanical invariant, and `tests/review-skill-contract.test.ts` pins it by executing the snippet under bash across the three references. A behavioral cell that can only agree with a deterministic CI test is not a row. The end-to-end evidence for this branch is three live plugin-loaded probes (Claude `--plugin-dir`, a scratch `CODEX_HOME` linking `skills/compound-engineering-local`, and Grok's project-local `.grok/skills`), each confirming the loaded `SKILL.md` came from the worktree under test.
- **`ce-code-review` peer skip from `work_engine` contamination** (coffinfish session `01a03501-06af-7403-9016-57862c98292c`). A row planted that same-session "no standing engine config" prompt and required `cross-model-review.md`. Grok, Claude, and Codex all bound the default different-family peer on the pre-fix skill, so the cell cannot fail the invariant. The real miss was a compacted continued session that never loaded the reference. The fix is the always-loaded Stage 3d sentences in `SKILL.md`; `tests/skills/cross-model-review-mode.test.ts` pins them. Requiring the reference after that move would also violate the catalog's required-read rule: the body now states the gate.
