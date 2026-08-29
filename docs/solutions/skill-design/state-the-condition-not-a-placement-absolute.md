---
title: "A placement absolute forbids the case its own condition demands"
date: 2026-08-28
category: skill-design
module: skills/ce-commit-push-pr
problem_type: design_pattern
component: development_workflow
severity: high
applies_when:
  - "Enforcing a skill-prose condition with a placement, ordering, or format absolute ('never part of the opening', 'always a separate block')"
  - "The same authoring decision appears at more than one step of a skill or reference file"
  - "Writing an audit or pre-apply step that checks whether an artifact contains something, rather than whether it achieves its outcome"
  - "A maintainer rejects output that the skill was followed exactly to produce"
  - "Evaluating a placement or format rule that one host may obey literally and another may ignore"
symptoms:
  - "Maintainer rejected a PR description twice with 'doesn't read well' and 'the bigger picture is not clear', though the skill was followed exactly"
  - "The accepted rewrite satisfies the rule's stated condition while violating its stated absolute"
  - "An audit step would instruct the agent to break the accepted version, not merely fail to catch the rejected one"
  - "One decision restated at four passages with three absolutes among them; the owning site stated the thinnest version of the condition, so the absolute was the only clause all of them agreed on"
  - "Cross-host eval split: one host obeyed the absolute literally and failed, the other ignored it and passed"
resolution_type: workflow_improvement
related_components:
  - ce-babysit-pr
  - ce-skill-work
tags:
  - skill-design
  - state-conditions-not-cases
  - ce-commit-push-pr
  - pr-description
  - cross-host
  - skill-eval
  - owning-layer
  - audit-steps
related_pr: https://github.com/EveryInc/compound-engineering-plugin/pull/1572
---

# A placement absolute forbids the case its own condition demands

## Context

This repository already requires skill prose to state conditions rather than
enumerate cases (`AGENTS.md`, "Working on Skills"), and to prescribe a mechanism
only at the layer that owns it. `subordinate-the-failing-shape-to-the-condition.md`
records what it costs to over-apply the first rule;
`skill-gates-state-conditions-not-prescribed-git-commands.md` records the second.
What follows is a shape that slips past both, because the block *does* state its
condition — and then enforces it with an absolute about **where text may sit**.

`ce-commit-push-pr` owns PR-description composition, and
`skills/ce-commit-push-pr/references/pr-description-writing.md` tells the agent
how to write the description's opening. Three PRs moved that block:

- **PR #1329** (merged) introduced "Program altitude" for multi-PR work and told
  descriptions to "Lead with program -> lead-in (if any) -> this contribution ->
  lead-out (if any)" — an ordering the body was to follow. (#1422 later relabelled
  that same ordering as "the map's order".)
- **PR #1422** (merged, "make medium and large PR descriptions scannable")
  reversed it. Its own body records the demonstrated failure it was fixing:
  "a dense opening that mixed the change with program context and deferrals
  followed by paragraph-length bullets — the pattern that had readers of recent
  PRs asking for rewrites." Its eval note records that pre-change, both hosts led
  with program context and produced dense prose.

#1422 stated its condition correctly — the opening carries one idea, and a
reviewer who stops there knows what the PR does. Then it enforced that condition
with a placement absolute, replicated at three sites in the same file:

| Site | Owns | What #1422 put there |
|---|---|---|
| Step A (sizing) | how much description the change earns | "Program or series context, when present, is a short additive block after it (Step C), **never part of the opening's sentence**." |
| Step C (body assembly) | what the opening contains | "It never restates the outcome, and **the program is never folded into the opening's sentence**." |
| Step E (pre-apply audit) | catching a bad draft before it ships | "If it also carries **program context**, deferrals, or implementation detail the diff already supplies, **move those out**." |

All three sites kept a version of the condition and *added* the absolute beside it.
The owner, Step C, stated the thinnest version — "the opening carries one idea — this
PR's outcome" — dropping the reviewer-stops-there test that Steps A and E both kept. So
the absolute was the only clause all three agreed on, and it became the operative rule.
A fourth passage, Step A's program-altitude paragraph, stated the same placement
decision without an absolute, so a reader diffing the file finds four statements of one
decision with three absolutes among them.

**PR #1572** in this repo falsified it. That PR was first in a series: it added a
repo-owned review-criteria file whose entire point was to make a later
consolidation — taking sixteen overlapping reviewer personas down to six
dispatches — safe. Its local
outcome was meaningless on its own. Following the skill produced exactly the
shape the absolute prescribed: an opening leading with the local mechanism
("Review criteria now come from a file the repository owns"), with the program
demoted to a separate block framed as deferred scope. The maintainer rejected it twice,
in session, for reading badly and for leaving the bigger picture unclear. That feedback
was conversational and is not recorded on the PR, so it is reported here as this
session's account rather than as a citable quotation. What is on the record is the
merged description, which leads with the program.

The accepted opening led with the program and the local change as one connected
idea: the two problems with the skill are the same problem; you cannot delete the
personas unless teams can write the rules down themselves; so this PR adds the
mechanism that makes the consolidation safe. That version **satisfies #1422's
stated condition** — one idea, and a reviewer who stops there knows what the PR
does — while **violating #1422's absolute**. Step E was the sharpest symptom: it
does not merely fail to catch the bad opening, it instructs an agent to break the
good one.

## Guidance

### 1. State the condition and let placement fall out of it

A placement absolute is a proxy. It is correct exactly when the local outcome
stands on its own — a middle slice of a series where each piece is
self-explanatory — and wrong when the program is what gives the local change its
shape or its point. An absolute cannot express "usually X, unless the condition
requires otherwise," so it forbids the case where the condition demands the
opposite placement.

The repaired rule states one condition once, and both failure directions fall out
of it (`skills/ce-commit-push-pr/references/pr-description-writing.md:164`):

> The opening carries one idea. The test is whether a reviewer who reads only it
> can say what this PR changes and why it takes this shape. Usually that one idea
> is the local outcome by itself — the map's "this contribution" slot. Sometimes
> the local outcome does not stand on its own, because the program is what gives
> it its shape or its point. Then the connection to the program is part of the one
> idea and belongs in the opening, and either half may lead — whichever reads
> better for this change. Naming which part of the program this PR delivers is
> what keeps that opening honest — an opening that names the arc but leaves a
> reviewer unable to say what this PR changes fails the same test.

Note what the condition does that neither absolute could: it decides #1329's case
and #1422's case with the same sentence, and it also rules out the failure
*neither* PR had — an opening that names the arc and loses the local outcome.

### 2. Put the decision at its owning layer; make the other sites defer

The decision was restated at four passages, and the site that owned it stated the
condition least completely. That is the drift worth naming: an absolute added at every
site survives as the common denominator, while each site's copy of the condition is
written for that site's local job and none of them is authoritative. Step C owns body
assembly, so it owns what the opening contains, and the repair made its statement the
complete one. Step A owns sizing; it now names the map's order and hands the placement
question off — "Step C decides how much of it the opening carries"
(`pr-description-writing.md:71`) and "Step C decides what that one idea must
include and what goes in the block after it" (`pr-description-writing.md:94`).
Neither re-decides.

Replication is the mechanism, not an aggravating factor. Once a decision lives at
several sites, no single copy has to be complete for the block to read as complete, and
the shared absolute quietly becomes the clause they all enforce. Stating it once at the
owner removes the common denominator along with the copies.

### 3. An audit checks the outcome the artifact exists to produce, not containment

A containment check ("does the opening contain program context? move it out")
looks like a valid audit and is strictly worse than no audit: it passes bad work
that happens to be contained, and it actively breaks correct work that is not.
Audit the property the artifact exists to have. The repaired Step E bullet audits
legibility (`pr-description-writing.md:196`):

> A reader who does not already know this project is the test. If the local
> outcome reads as unmotivated without the program, the opening is missing that
> connection. If the opening names the arc but a reviewer cannot say which part of
> it this PR delivers, it is missing the outcome.

The test names an imagined reader, so it is checkable without being positional.

### 4. Eval a placement rule on more than one host, because it is host-split

Cross-host eval is the repo default for model-interpreted skill behavior
(`validate-skill-prose-behavior-with-cross-host-evals.md`; also "Skill-eval
cross-host default", auto memory [claude]). A placement absolute is a case where
the default is not merely prudent but load-bearing: it is a literal, mechanical
instruction, so one host obeys it and another treats it as a stylistic hint. That
divergence is not, however, what let #1422 ship the defect: #1422 ran its own eval on
Claude and Codex, and both hosts complied with the new rule, because no scenario put
the condition and the absolute in conflict. Divergence is why the defect could not be
caught by a single-host run afterward.

The scenarios added for this fix ran on Claude and Codex, pre arm `f6c301caf`
(#1572's merge commit — the tree before this repair), post arm the working tree:

| Cell | Arm | Host | Result |
|---|---|---|---|
| `enabler-opening-carries-the-program` | pre | Claude | FAILED — "A per-user session stamp now exists as a single readable, incrementable value. Nothing consumes it yet ... so this PR changes no behavior on its own." The exact #1572 rejected shape. |
| `enabler-opening-carries-the-program` | pre | Codex | PASSED — "This adds the monotonic per-user stamp that server-side session revocation will build on. It is the first of three PRs..." Codex ignored the absolute. |
| `enabler-opening-carries-the-program` | post | Claude | PASSED |
| `enabler-opening-carries-the-program` | post | Codex | PASSED |
| `standalone-slice-keeps-its-outcome` | pre and post | both | PASSED — no run led with the arc and lost the local outcome. |

A single-host eval on Codex would have passed the defective rule outright.

The second cell is the other half of the method: when a fix relaxes an absolute,
pin the failure the absolute existed to prevent as its own scenario, and require
it to pass on **both** arms. That is what distinguishes a fix from an inverted
bias. A third, ad-hoc run — the slice fixture with all series context
stripped from the prompt — confirmed neither host invents a series. It is not a pinned
catalog cell, so it is evidence from this session rather than a standing guard.

## Why This Matters

The cost is not a missed catch. It is an instruction that tells an agent to
degrade a correct artifact — and the agent has no way to notice, because the rule
reads as settled and self-justifying. #1572 spent two maintainer rejection rounds
on a description whose author was following the skill exactly.

The reach is wider than interactive use. `ce-babysit-pr` refreshes a drifted PR
description by invoking `ce-commit-push-pr mode:pipeline`
(`skills/ce-babysit-pr/SKILL.md:55`), which reads this same reference. A rule that
breaks correct openings breaks them in unattended runs too, where no one is
watching to reject the result.

The general reason a placement absolute is attractive is that it is easy to check
— by a reader, by a review bot, by a mechanical test. That is precisely why it
tends to survive review while the condition it replaced does not: the absolute is
falsifiable against the text, and the condition is only falsifiable against the
artifact. A rule you can check by looking at where words sit is not evidence that
the rule is right.

## When to Apply

- You are about to write, or are reviewing, a rule in skill prose that constrains
  **where** something may appear: "never in the opening," "always its own
  section," "must come after," "goes in a block below." Ask what condition the
  placement is standing in for, and whether any real input makes the condition
  demand the opposite placement. If one exists, state the condition instead.
- A rule states its condition and then adds an absolute to enforce it. The
  absolute is the finding, not the condition.
- The same decision appears at more than one step of a skill. Name the owning
  layer, state it once there, and have the other sites defer by reference rather
  than restate.
- You are writing an audit or checklist step. Check the outcome the artifact must
  have, described so a reader can test it, not whether some content is absent from
  some location.
- You are relaxing an existing absolute. Add a scenario for the failure the
  absolute prevented and require it to pass on both arms, alongside the scenario
  for the case that motivated the relaxation.

Not applicable when placement genuinely *is* the requirement — a project's PR
template heading order, a required frontmatter field, a file path. Those are data,
not a proxy for a judgment.

## Examples

**Before — condition plus absolute, Step A (shipped in #1422):**

```
The opening is one or two sentences carrying one idea — what is now different and
the gap or failure it replaces — so a reviewer who stops there knows what the PR
does. Program or series context, when present, is a short additive block after it
(Step C), never part of the opening's sentence. ... Deliberately deferred scope is
stated once, not woven into the opening.
```

**After — sizing defers the placement decision to its owner
(`pr-description-writing.md:94`):**

```
The opening is one or two sentences carrying one idea — what is now different and
the gap or failure it replaces — so a reviewer who stops there knows what the PR
does. Step C decides what that one idea must include and what goes in the block
after it. ... Deliberately deferred scope is stated once.
```

**Before — the audit checked containment (Step E, shipped in #1422):**

```
Does the opening carry one idea in one or two sentences, and could a reviewer stop
there and know what the PR does? If it also carries program context, deferrals, or
implementation detail the diff already supplies, move those out; ...
```

Run against the accepted #1572 opening, this bullet instructs the agent to strip
the program out — turning the accepted version back into the twice-rejected one.

**After — the audit checks legibility (`pr-description-writing.md:196`):**

```
Does the opening carry one idea in one or two sentences, and could a reviewer who
reads only it say what this PR changes and why it takes this shape? A reader who
does not already know this project is the test. If the local outcome reads as
unmotivated without the program, the opening is missing that connection. If the
opening names the arc but a reviewer cannot say which part of it this PR delivers,
it is missing the outcome. Move out whatever that one idea does not need ...
```

**Worked example added alongside the pinned one
(`pr-description-writing.md:74-75`).** The existing example keeps the standalone
case and now says *why* it is standalone; the new one shows the case the absolute
forbade:

```
- Good: that same opening, then a block: "Continues the session-revocation rewrite
  after refresh-path rejection; multi-device revocation remains follow-on." — the
  outcome stands on its own, so the block adds the program and its neighbors, not a
  second copy of the outcome.
- Good (outcome does not stand on its own): "Sessions now carry a revocation epoch
  — the field that makes server-side revocation possible at all. Nothing reads it
  yet." Here the program is what gives the change its point, so the connection is
  part of the opening's one idea rather than a block after it.
```

**Mechanical pins, both directions.** `tests/commit-push-pr-contract.test.ts`
asserts the condition is present at Step C (lines 78 and 82) and that the audit is
legibility-shaped (lines 97-99), and asserts the two absolutes are gone (lines
65-66). A pin
that only asserted the new text would let the absolute be reintroduced elsewhere
in the file, so the negative assertions run against the whole document rather than
a section. Eval rows `ce-commit-push-pr/enabler-opening-carries-the-program` and
`ce-commit-push-pr/standalone-slice-keeps-its-outcome`
(`tests/skill-eval-cell/catalog.ts:419`, `:447`) share the A/B base
`PR_OPENING_BASE_REF` (`catalog.ts:21`), with fixtures under
`tests/skill-eval-cell/fixtures/pr-series-enabler/` and `.../pr-series-slice/`.

**Status as of this writing:** the repair described here is uncommitted
working-tree state on branch `tmchow/fix-ce-commit-push`, not merged. `bun run test` reports
3644 pass / 0 fail, and `bun run release:validate` and `bun run plugin:validate`
pass. PRs #1329, #1422, and #1572 are merged and reachable; the quoted "before"
text is from the #1422 revision of this file.

## Related

- `docs/solutions/skill-design/size-driven-skill-restructure.md` — "A size-driven
  restatement overshoots into an absolute" states lesson 1 in narrower form,
  conditioned on a byte budget forcing a restatement and detected by "a sentence
  qualified twice." Neither trigger applied here: #1422 had no byte cap and wrote
  the absolute deliberately on the first pass. This doc generalizes that trigger to
  any absolute standing in for a condition, however it arose, and adds a second
  tell — the same decision appearing at more than one site in a procedure. The
  ce-optimize #1456 evidence stays there.
- `docs/solutions/skill-design/subordinate-the-failing-shape-to-the-condition.md` —
  the inverse asymmetry. There, deleting a concrete shape cost determinism on the
  most literal host; here, an over-broad absolute cost correctness on that same
  host. Its prescription (keep the shape subordinated under the condition) is what
  the second worked example in `pr-description-writing.md:75` applies in the
  permissive direction.
- `docs/solutions/skill-design/skill-gates-state-conditions-not-prescribed-git-commands.md`
  — the owning-layer half of lesson 2, one domain over: a prescribed mechanism
  standing in for the condition in a *delegating* gate, where this defect put a
  proxy inside the owning layer and then replicated it outward.
- `docs/solutions/skill-design/strong-models-mask-defensive-skill-fixes.md` — guard
  both failure directions; the source of the second-cell method used here.
- `docs/solutions/skill-design/validate-skill-prose-behavior-with-cross-host-evals.md`
  — the cross-host default this incident supplies a load-bearing case for.
- `docs/solutions/skill-design/paired-old-vs-new-injection-skill-evals.md` — the
  pre/post-arm methodology the two cells use.
- `docs/solutions/skill-design/portable-agent-skill-authoring.md` — the standard.
  Its "Separate protocol from judgment" section now carries the rule this incident
  produced: a placement or format absolute is protocol-shaped and is usually
  judgment wearing protocol's clothes, so state the condition at the one layer that
  owns the decision, read a decision restated at several sites or a maintainer
  rejecting output the skill was followed exactly to produce as the tell that the
  proxy has become the operative rule, and verify a placement rule on more than one
  host. It cites this file as the worked case. **Open follow-up:** widening the
  runtime rule at `.agents/skills/ce-skill-work/references/edit-skill.md`
  ("A shortened rule comes out absolute", whose byte-budget trigger could not have
  fired here) is a deliberate call left for a human.
- Overlap note for a future consolidation pass: this doc scores Moderate against
  `size-driven-skill-restructure.md` (problem statement, root cause, solution
  approach), and the two should be reviewed together if that file's hazard section
  is ever generalized.
