---
title: "Validate skill judgment changes with a fake-CLI harness and a discriminating fixture"
category: skill-design
module: ce-resolve-pr-feedback
problem_type: best_practice
component: tooling
severity: medium
applies_when:
  - Changing the judgment or decision logic of a skill that calls an external service (gh, git, an HTTP API)
  - Needing evidence that a prose/behavior change to a skill actually improves outcomes, not just that it runs
  - Comparing two versions of a skill (new vs committed baseline) on the same task
tags:
  - skill-eval
  - testing
  - fake-cli
  - fixture-design
  - ce-resolve-pr-feedback
  - skill-design
---

## Context

`ce-resolve-pr-feedback` was changed so the orchestrator judges every PR finding centrally (a "legitimacy gate") before dispatching fixer subagents, instead of each finding being judged-and-fixed by an isolated per-thread subagent. The motivating risk: a confidently-wrong code-review bot getting its finding blindly accepted and "fixed," introducing a bug the original code didn't have.

The change was prose-only (skill instructions), so the validation question was behavioral: *does the new design actually accept fewer wrong findings than the old one?* The skill talks to GitHub via `gh` and mutates a repo via `git`, so it cannot be unit-tested in the ordinary sense, and dispatching the skill inside the authoring session would run the cached pre-edit copy (Claude Code caches plugin skills at session start).

## Guidance

Build a **fake-CLI harness** plus a **discriminating fixture**, then run the skill new-vs-old over several reps and grade objective outcomes.

**1. Mock at the CLI boundary, not the network.** The skill's only external touchpoints are `gh` and `git`. Put a fake `gh` executable first on `PATH` that dispatches on argv and returns canned fixture JSON (matching the real output shape after `gh api graphql --slurp`), and logs every mutation (replies, resolves) to a file. Run inside a throwaway `git init` repo with a local bare remote so `git push` is a harmless no-op. This drives the skill's *real* bundled scripts (`get-pr-comments`, `reply-to-pr-thread`, …) unchanged — you mock what they call, not what they are. No network, no auth, no real PR.

**2. Observe outcomes through the side effects you already have.** Tag a baseline commit (`eval-base`) before the run; the grader diffs against that tag (not `HEAD`, because the skill commits its own fixes on top). Grade three channels: the `git diff` of the work-tree, the mutation log (what replies it posted), and the run's summary. Key metric: a binary `BLIND_ACCEPT=yes|no` per rep.

**3. The fixture must be *discriminating*, or the eval proves nothing.** A finding that is disprovable by reading the one file it points at is too easy — every design catches it, including the one you're trying to show is worse. Construct findings whose disproof lives **outside the referenced file**, so an isolated, narrowly-scoped agent is tempted to "fix" while a design with broader context debunks it. The sharpest case is a *systematically-wrong cluster*: several individually-plausible findings from one source, all false for the same reason (a shared invariant the referenced files don't reveal).

**4. Run new-vs-old over several reps and inspect the mechanism, not just the count.** Skill judgment is non-deterministic. A small-N ratio is suggestive; what makes it convincing is reading the failing reps and confirming they fail *the predicted way*.

## Why This Matters

The first fixture (a single bogus "null deref" finding, disprovable by a guard three lines up in the same file) showed **0/4 blind-acceptance on both** the new and old designs — i.e., it could not tell them apart. It would have let us "confirm" the change with no evidence, or wrongly conclude it did nothing.

The discriminating cluster fixture (3 plausible findings that `req.body.amount` is unvalidated, all false because a shared `validateAmount` middleware in a *different* file guards every route) separated them:

| Design | Blind-accepted ≥1 false finding | Per-rep |
|--------|-------------------------------|---------|
| New (central gate) | **0/4** | 6,6,6,5* |
| Old (per-thread judge+fix) | **2/4** | 6,6,2,2 |

\*the one new-design "miss" was a grader phrasing strictness, not blind acceptance.

The mechanism check confirmed it: old-design failures were the exact predicted pathology — each isolated agent read only its own handler file, never saw the shared middleware, added a redundant guard, and replied `Addressed:`. The insight isn't "old is always wrong" (it was right 2/4) — it's that the old design's correctness *depends on whether an isolated agent happens to read the right file*, while the gate makes it reliable. That distinction is invisible to an easy fixture.

## When to Apply

- Any change to a skill's decision/judgment logic where "it runs" is not the same as "it decides better."
- Especially when the skill hits an external service: mock the CLI/tool boundary so the real bundled scripts still execute.
- Skip the harness for mechanical skill changes (parsing, output paths, anything a normal test exercises) — those run current source and don't need it.

## Examples

Fake `gh` dispatch (sketch): match argv → `repo view`/`pr view` return identity; `api graphql` inspects the `-f query=` body to return `threads/comments/reviews.json` or log a `REPLY`/`RESOLVE` mutation. The reply/resolve scripts call this fake and append to `mutations.log`.

Discriminating fixture shape:
- `src/handlers.js` — three handlers use `req.body.amount` raw (the referenced lines; look naive in isolation).
- `src/routes.js` + `src/middleware.js` — a `validateAmount` middleware wired to every route guarantees `amount` is a positive finite number. **The disproof lives here, not in `handlers.js`.**
- one genuine bug (`src/math.js` divide-by-zero) as a control, so a design can't "win" by skipping everything.

Grader (objective): `handlers.js` unchanged vs `eval-base` AND each cluster thread replied `Not addressing`/`Declined` (never `Addressed:`) → `BLIND_ACCEPT=no`; `math.js` modified + `Addressed` → control passed.

The full harness lives under `.context/compound-engineering/ce-resolve-pr-feedback-eval/` (fake-bin/gh, two fixtures, `run-eval.sh`, `batch.sh`, graders). Related: [pass-paths-not-content-to-subagents](pass-paths-not-content-to-subagents.md), the in-session plugin-skill caching note in [bundled-script-path-resolution-across-harnesses](bundled-script-path-resolution-across-harnesses.md), and the sibling prose-injection variant [paired-old-vs-new-injection-skill-evals](paired-old-vs-new-injection-skill-evals.md) (injects SKILL.md excerpts into blind subagents instead of mocking a CLI boundary).
