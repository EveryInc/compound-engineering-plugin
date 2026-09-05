---
title: "Prove a skill prose change moved behavior with paired old-vs-new blind injection"
date: 2026-07-01
last_updated: 2026-09-02
category: skill-design
module: compound-engineering-plugin skill evaluation
problem_type: design_pattern
component: testing_framework
severity: medium
applies_when:
  - Validating a prose/behavior edit to a SKILL.md, agent persona, or prompt
  - Needing to tell "demonstrated improvement" apart from "no regression"
  - One skill's output is consumed or gated by another skill or a test
  - Adding or renaming a field in a cross-skill output contract
  - Changing the judgment of a skill that calls an external CLI (gh, git, a peer model CLI)
  - Reading a null result from a harness that freezes an upstream stage
  - Skill prose instructs constructing a command from recorded variables
  - Fixing a defect that only appears after context compaction or a mid-flow resume
related_components:
  - tooling
  - development_workflow
tags:
  - skill-evals
  - paired-injection
  - behavior-verification
  - cross-skill-contract
  - anti-drift-test
  - frontier-model
  - named-fields
  - fake-cli
  - fixture-design
  - variance
  - cross-host
  - eval-methodology
---

# Prove a skill prose change moved behavior with paired old-vs-new blind injection

## Context

Editing the prose of an agent skill is cheap; *knowing whether the edit changed agent behavior* is not. Prose changes look self-evidently good in a diff, so they ship on intuition, and two failure modes hide in that gap: the change is a no-op at the current model tier (a frontier model already does the "new" thing), or the change creates a cross-skill contract no test enforces (producer and consumer drift independently while every test stays green).

Unit tests and code review are blind to this class. `bun test` validates a bundled script for given inputs; it never constructs the invocation the way an agent would. Review reads the diff's logic and the prose's content; across five review rounds on one PR (#1216), no reviewer simulated "what command would an agent emit from this paragraph?" — and a cross-host eval then found 3 of 4 agents emitting a flag the script rejects (technique 9). A behavioral eval that puts a fresh agent in front of the loaded prose is the only layer that catches instruction-interpretation defects, and for an authored-once-converted-many plugin those ship silently to every harness.

Tooling: inject the current on-disk prose into a fresh agent at dispatch time (`bun run test:skill-eval-cell`, `test:skill-eval-pack`), never invoke the already-loaded plugin skill in the same session — cached skill definitions run pre-edit content. Run Claude and Codex both by default; a prose ambiguity often fails on one model and not the other (in #1216: 2/2 Codex wrong, 1/2 Claude wrong).

## Guidance

### 1. Paired old-vs-new blind injection

Extract the **actual** pre-change excerpt from `git HEAD~1` and the post-change excerpt from the working tree — real bytes, not a paraphrase. Dispatch two subagents, one seeded with each, **both blind** to which version they hold and to the expected answer, given an **identical** realistic scenario, each returning a **concrete decision plus an artifact** (ordered steps, the structured return object, the next pipeline action) — not an opinion. Then compare.

- Both produce the same correct decision -> **no-regression only**. Real, but not improvement.
- Old fails / new succeeds -> **improvement**. Design for this discriminating case explicitly; if you cannot find one, the honest conclusion is that the change is not an improvement at this tier.

Complement with **new-only restraint negatives**: a plain case with no triggering condition must not emit the new field or note. A rule that fires on everything is as broken as one that fires on nothing.

### 2. Read a non-discriminating result honestly

At a capable tier, many prose rules buy determinism, weaker-model insurance, and variance reduction — not a behavior flip. When old and new both do the right thing (and the old-prose agent even justifies it on its own reasoning), record it as "already emergent at this tier; the rule locks in determinism and protects weaker models." Both kinds are worth shipping; only the discriminating kind is a behavior change you can demonstrate.

### 3. Standardize the field NAME, not just the information

When one skill's output is gated by another skill or a test, the value of the edit is a **stable token to match on**. A capable producer already surfaces the information as improvised free text nothing downstream can key on. Emit a named field with named subfields and write the consumer's gate against that name. "Prompt the producer to consider X" is not testable; "the producer emits `X` and the consumer requires `X` when a condition holds" is.

### 4. Prove the parity test fails on one-sided drift

Prose-presence tests guard each skill in isolation and stay green when the producer renames a field the consumer still gates on. A structural parity test **scopes** its assertions to the owning section of each file via string-slice anchors (an unscoped match passes on an incidental mention elsewhere) and **cross-checks a shared facts map** so both ends name the same facts. Then do the step almost always skipped: rename the field on the producer side only, run the parity test, confirm it goes red, restore. A parity test you have never seen fail on injected drift may be asserting a tautology.

```ts
const EVIDENCE_FACTS = {
  existing_tests_inspected: "existing tests inspected",   // producer token -> consumer prose
  tests_added_or_changed:   "tests added/changed",
};
const producerBlock = slice(ceWorkSrc, "## Return-to-Caller Mode", "Engine selection (");
const consumerGate  = slice(lfgSrc, "2. Invoke the `ce-work`", "3. Invoke the `ce-simplify-code`");
for (const [token, prose] of Object.entries(EVIDENCE_FACTS)) {
  expect(producerBlock).toContain(token);
  expect(consumerGate).toContain(prose);
}
```

### 5. Seal the injection — the excerpt must be the only source

Three leaks produce a **falsely green** result because the agent found the answer somewhere other than the prose under test.

**Leak A — the agent reads the real skill.** `codex exec` defaults to full filesystem access; in one run, agents given an excerpt read the *installed* plugin's `SKILL.md` instead. Run with a read-only sandbox *and* state the constraint in the prompt, then **verify compliance** by grepping each transcript for paths outside the eval directory before grading. This bites harder in a plugin repo because the installed skill is usually a different checkout: measured once, installed `ce-doc-review` was 3,746 words against the worktree's 2,886. Inject the file; never invoke the installed skill.

**Leak B — the fixture carries the answer key.** Stripping HTML comments is not enough: `ce-doc-review` fixtures also carried inline `(Seeded gated_auto: …)` markers in body prose. Grep the *stripped* fixture for the vocabulary you grade on. (Closed for this repo's fixtures 2026-08-13: answer keys live in sibling `tests/fixtures/ce-doc-review/<name>.expectations.md`; keep the grep for new fixtures, since nothing enforces the separation.)

A leak identical across arms still permits an old-vs-new comparison — it is a constant, not a confound — but invalidates any *absolute* measurement. Say which you are claiming.

**Leak C — the harness froze the layer you changed.** Evaluating `ce-doc-review`'s synthesis layer meant fighting reviewer variance, so reviewer output was captured once and replayed into every trial. It worked for synthesis. Two later reviewer-facing changes (identifier glossing — `U1 (the load gate)` rather than bare `U1`; the report-versus-question grammar) were then measured on the same harness and appeared to do nothing, because the frozen set was captured from reviewers that never saw them. Freezing removes reviewer *variance* by removing reviewer *execution*; those are the same act, and the harness is structurally blind to everything upstream of the freeze point. The trap is that it reports normally: no error, trials complete, no effect — indistinguishable from a change that does not work. So: locate your change relative to the freeze point *before* running; record which shipped changes a run does not cover where the results are written (silence becomes a false "we tested it"); re-capture the frozen set when the emitting layer changes — it is an artifact with a provenance, not a fixture; and measure emission-layer changes against real output (grep captured runs for the shape you are eliminating — bare identifiers, questions with one option). General form: a harness that controls a variable (frozen output, pinned model, fixed seed, stubbed service) cannot measure a change to the thing it controls.

**And the fixtures may be too easy.** Sealing guarantees the agent answered from your prose; it says nothing about whether the prose was tested against anything hard. See [[authored-eval-corpora-contain-the-happy-path]].

### 6. Ground the answer key in the criteria, not in the fixture's intent

A seeded fixture encodes what its author expected at the time; when the skill's criteria have since changed, grading against the fixture scores the skill as wrong for following its own rules. Observed: three `ce-doc-review` fixtures lacked the frontmatter that the criterion "a plan with no validated upstream Product Contract signal" keys on, so every run in both arms activated the adversarial reviewer while one seed map expected it off. Drop that dimension from the graded set, report the fixture/spec disagreement as its own finding, and grade only where criteria and fixture agree. Silently scoring it either way manufactures a delta.

### 7. Mock the CLI boundary, and make the fixture discriminate

For a skill whose external touchpoints are CLIs (`gh`, `git`, a peer-model CLI), put a fake executable first on `PATH` that dispatches on argv, returns canned fixture JSON in the real output shape, and logs every mutation to a file; run inside a throwaway `git init` repo with a local bare remote so `git push` is a no-op. This drives the skill's *real* bundled scripts unchanged — mock what they call, not what they are. Tag a baseline commit before the run and grade against that tag (not `HEAD`, since the skill commits its own fixes): the work-tree diff, the mutation log, and the run summary.

**The fixture must be discriminating or the eval proves nothing.** Validating `ce-resolve-pr-feedback`'s central legitimacy gate: a single bogus finding disprovable by a guard three lines up in the same file showed 0/4 blind acceptance on *both* the new and old designs — it could not tell them apart, and would have "confirmed" the change with no evidence. A **systematically-wrong cluster** — three individually plausible findings that `req.body.amount` is unvalidated in `handlers.js`, all false because a shared `validateAmount` middleware wired in `routes.js`/`middleware.js` guards every route, plus one genuine bug as a control so a design cannot win by skipping everything — separated them: new 0/4 blind-accepted, old 2/4. Construct findings whose disproof lives **outside the referenced file**, so an isolated narrowly-scoped agent is tempted to "fix" while a design with broader context debunks. Then inspect the mechanism, not just the count: the old-design failures were the predicted pathology exactly (each isolated agent read only its handler, never saw the middleware, added a redundant guard, replied `Addressed:`). The insight is not "old is always wrong" — it is that the old design's correctness depended on whether an isolated agent happened to read the right file.

### 8. Variance first, N>=3, negative control

For any persona-rubric change that outputs into discrete buckets, measure **variance reduction on ambiguous fixtures** as the first-order signal, stable disagreements on boundary cases as the second, and classification-rate shifts on textbook cases as a noise-prone third — textbook fixtures do not move on a well-tuned model. A baseline that emits three different classes across four trials on one input, paired with a tightened version that pins to one class across seven, is a win independent of *which* class was chosen: run-to-run determinism on identical inputs is what justifies the prompt's token cost.

**Never trust N=1 on a synthetic fixture for a directional read.** The fixture feels deterministic, so one trial feels sufficient; it is not. In one calibration, two early N=1 reads produced two confidently-wrong conclusions in succession ("no effect," then "wrong-direction regression"), both reversed at N=3 and resolved only at N=4 to N=7 on the noisy cell — because the baseline was sampling a tri-modal distribution, and any single pair of samples tells a different story. N=3 is the floor; if three trials disagree, run more trials *before* running more fixtures (depth on the noisy cell, not breadth). Aggregate variance explicitly in the summary table (`4 trials, 3 distinct classes`). **Keep a negative-control fixture that must not move** under either version; if it moves, the rubric has a stability problem the calibration is masking. The lens applies less when you have ground-truth labels or free-text output.

### 9. Name the CLI flag, not the recorded variable

When prose instructs constructing a command, name the actual flags. `ce-babysit-pr`'s continuation prose named the recorded variable (`RUN_STARTED_AT`) but never the flag; 3 of 4 fresh agents emitted `--invocation-started-at`, which `pr-snapshot` rejects (the accepted anchor is `--session-started-at`). A variable named `..._STARTED_AT` invites the wrong guess. Pair variables with their flags — `--session-started-at "$RUN_STARTED_AT"` — and re-run the same eval after the fix to confirm the rate flips (it did: both models then emitted the right flag).

### 10. Reproduce the context loss the defect needs

A defect that only manifests after compaction or a mid-flow resume is invisible to the standard cell. `ce-commit-push-pr`'s babysit gate named `auto_babysit: false` as an opt-out but read the key only in an earlier reference for another purpose; a Codex user with the opt-out set got babysat anyway (#1601). The full-skill eval cell passed on both hosts in *both* the pre-fix and post-fix arms — a full-context agent finds the key mentioned anywhere and honors it. Only a fixture that withheld the rest of the skill and handed the agent just the reference owning the gate (what survives compaction) discriminated: pre-fix, Codex handed off and Claude reported the PR "unmonitored"; post-fix, both skipped citing the config. When the defect is context-loss-triggered, build the fixture to reproduce the loss; supplying full context tests a different, easier problem and passes on the buggy version.

## Why This Matters

- Prose diffs are persuasive and unfalsifiable by inspection; blind paired injection is the cheapest conversion of a hunch into evidence.
- Blindness removes the two biggest confounds: an agent told it has the improved version rationalizes a better answer; one told the expected answer pattern-matches to it.
- Honest non-discriminating results prevent shipping weaker-model insurance as a "behavior fix."
- Named fields are the unit of cross-skill testability; parity tests never seen to fail are decoration.

## When to Apply

Full methodology when the edit changes prose/behavior intended to flip a decision or add/rename a contract field, or when one skill's output gates another (techniques 3-4). Techniques 1-2 alone for a single skill with no consumer. Nothing for typo/formatting no-ops. Skip the fake-CLI harness for mechanical changes a normal test already exercises.

## Related

- [ce-doc-review-calibration-patterns](ce-doc-review-calibration-patterns.md) — reinforces techniques 2 and 8: skill judgment is non-deterministic, so grade across reps rather than trusting a single run.
- [authored-eval-corpora-contain-the-happy-path](authored-eval-corpora-contain-the-happy-path.md) — sealing the injection does not make the corpus hard.
- [strong-models-mask-defensive-skill-fixes](strong-models-mask-defensive-skill-fixes.md) — a green run must engage the protected failure mode.
- [confidence-anchored-scoring](confidence-anchored-scoring.md) — the A/B-against-baseline pattern technique 8 generalizes.
- Source: PR [#1054](https://github.com/EveryInc/compound-engineering-plugin/pull/1054) plus the parity test in `tests/pipeline-review-contract.test.ts`; PR #1216 (technique 9); issue #686 (technique 8); issue #1601 (technique 10).
