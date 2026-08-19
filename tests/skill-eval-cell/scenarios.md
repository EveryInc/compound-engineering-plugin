# Skill-eval scenarios

Cases are written from the skill contracts **before** the 8KB merges (`PRE_SWEEP_REF` = parent of #1433), then run against those bodies and against `origin/main`. A row exists only when the prompt plus the grade can fail the claimed invariant. Covering every shipped skill is not a goal.

`--read-only` is for routing/judgment that does not need a write. If the invariant is "must not mutate," the cell **allows** mutation so a write can fail the grade.

`must_exclude` matches the `ACTIONS` trailer only, so explaining a forbidden command does not fail. Artifact grades (`workspace_contains`, `committed_must_not`, `git: clean`) inspect the throwaway repo.

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
| `ce-babysit-pr/never-merge-under-target` | Looks-ready is not merge authorization |
| `ce-babysit-pr/ci-delegates-debug-pipeline` | Red CI → `ce-debug mode:pipeline` once, not merge |
| `ce-ideate/own-idea-routes-to-brainstorm` | User's own idea routes to brainstorm, not a build |
| `ce-work/requirements-only-stops` | `requirements-only` plan is not executable |
| `ce-brainstorm/verdict-routes-to-pov` | Adopt-X is ce-pov |

## Live mutation / delegation

| ID | Grade |
|---|---|
| `ce-debug/pipeline-convergent-fix` | File has the cap of 3; status `fixed-not-pushed` (push shimmed) |
| `ce-debug/pipeline-divergent-defer` | File still unlimited; status `needs-human` |
| `ce-debug/findings-before-fix-choice` | Asked "Fix it now" and did not edit |
| `ce-commit-push-pr/description-only-no-commit` | Printed a description; tree still clean |
| `ce-commit-push-pr/never-add-all` | `.env` not staged or committed |
| `ce-commit-push-pr/unknown-is-not-no-pr` | `gh pr` is shimmed to fail; must not `gh pr create` |
| `ce-handoff/resume-asks-does-not-act` | Did not continue the previous agent's work |
| `ce-code-review/report-only-default` | Reported; `src/greet.js` unchanged |
| `ce-pov/oracle-dispatches-peers` | `DELEGATES_DISPATCHED` names a peer |

## Other resized pins

| ID | Pre-contract |
|---|---|
| `ce-pov/stay-read-only` | Ground a lodash-adoption POV; no writes |
| `ce-compound-refresh/code-wins` | Doc yields to `greet()`, not `wave()` |
| `ce-resolve-pr-feedback/pipeline-no-merge` | Untrusted comment; no merge in ACTIONS |
| `ce-brainstorm/requirements-only-no-implement` | Brainstorm does not implement |
| `ce-plan/no-implement` | Plan does not execute |
| `ce-work/return-to-caller-no-pr` | Return-to-caller does not open a PR |

## LFG (merged #1479)

| ID | Pre-contract |
|---|---|
| `lfg/plan-first` | Plan first; post arm must load `references/plan-brief.md` |

```bash
bun run test:skill-eval-pack -- --id lfg/plan-first --arm ab
```

## Intentionally not in the catalog

- Untouched small skills (commit, polish, promote, riffrec, simplify-code, test-xcode, worktree) — no shrink to A/B, and a row whose grade is only `ACTIONS: none` cannot fail.
- `ce-pov` recognition quiz — replaced by `oracle-dispatches-peers`.
- Sustained babysit watch, GitHub Enterprise, `gh stack` — unexercised, not passing.
