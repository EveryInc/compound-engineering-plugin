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
symptoms:
  - "Maintainer rejected a PR description twice with 'doesn't read well' and 'the bigger picture is not clear', though the skill was followed exactly"
  - "The accepted rewrite satisfies the rule's stated condition while violating its stated absolute"
  - "An audit step would instruct the agent to break the accepted version, not merely fail to catch the rejected one"
resolution_type: workflow_improvement
related_components:
  - ce-babysit-pr
  - ce-skill-work
tags:
  - skill-design
  - state-conditions-not-cases
  - ce-commit-push-pr
  - pr-description
  - owning-layer
  - audit-steps
related_pr: https://github.com/EveryInc/compound-engineering-plugin/pull/1572
---

# A placement absolute forbids the case its own condition demands

The rule this case produced is in `docs/solutions/skill-design/portable-agent-skill-authoring.md` ("Separate protocol from judgment": a placement or format absolute is judgment wearing protocol's clothes). This file is the worked case.

## What happened

`skills/ce-commit-push-pr/references/pr-description-writing.md` owns how a PR description opens. PR #1329 told descriptions to lead with program context for multi-PR work; PR #1422 reversed it after readers asked for rewrites of dense openings that mixed the change with program context. #1422 stated its condition correctly -- the opening carries one idea, and a reviewer who stops there knows what the PR does -- and then enforced it with a placement absolute, replicated at three sites in the same file:

| Site | Owns | What #1422 put there |
|---|---|---|
| Step A (sizing) | how much description the change earns | "Program or series context ... **never part of the opening's sentence**." |
| Step C (body assembly) | what the opening contains | "**the program is never folded into the opening's sentence**." |
| Step E (pre-apply audit) | catching a bad draft | "If it also carries **program context** ... **move those out**." |

The owner, Step C, stated the thinnest version of the condition (dropping the reviewer-stops-there test that A and E kept), so the absolute was the only clause all three agreed on, and it became the operative rule.

PR #1572 falsified it. That PR was first in a series -- a repo-owned review-criteria file whose whole point was to make a later persona consolidation safe -- so its local outcome was meaningless on its own. Following the skill produced an opening leading with the local mechanism and the program demoted to a "deferred scope" block. The maintainer rejected it twice in session (conversational feedback; the merged description, which leads with the program, is what is on record). The accepted opening **satisfies #1422's stated condition while violating its absolute**. Step E was the sharpest symptom: it does not merely fail to catch the bad opening, it instructs an agent to break the good one.

## Why the absolute was wrong

A placement absolute is a proxy. It is correct exactly when the local outcome stands on its own -- a middle slice of a series -- and wrong when the program is what gives the local change its shape or point. An absolute cannot express "usually X, unless the condition requires otherwise," so it forbids the case where the condition demands the opposite placement. The repaired rule (`pr-description-writing.md`, Step C, "The opening carries one idea ...") decides #1329's case and #1422's case with one sentence, and also rules out the failure neither PR had: an opening that names the arc and loses the local outcome.

Replication is the mechanism, not an aggravating factor. Once a decision lives at several sites, no single copy has to be complete for the block to read as complete, and the shared absolute becomes the clause they all enforce. The repair made Step C's statement the complete one and had Step A defer ("Step C decides what that one idea must include").

A containment audit ("does the opening contain program context? move it out") is strictly worse than no audit: it passes bad work that happens to be contained and breaks correct work that is not. The repaired Step E audits the property the artifact exists to have -- a reader who does not already know the project can say what the PR changes and why it takes this shape -- which is checkable without being positional.

The general reason a placement absolute survives review while the condition does not: the absolute is falsifiable against the text, the condition only against the artifact. A rule you can check by looking at where words sit is not evidence the rule is right.

## Reach

`ce-babysit-pr` refreshes a drifted PR description by invoking `ce-commit-push-pr mode:pipeline`, which reads this same reference, so a rule that breaks correct openings breaks them in unattended runs too.

## When to Apply

- A rule in skill prose constrains **where** something may appear. Ask what condition the placement stands in for, and whether any real input makes the condition demand the opposite placement. If one exists, state the condition instead.
- A rule states its condition and then adds an absolute to enforce it. The absolute is the finding, not the condition.
- The same decision appears at more than one step. Name the owning layer, state it once there, and have the other sites defer by reference.
- You are writing an audit step. Check the outcome the artifact must have, not whether some content is absent from some location.
- You are relaxing an existing absolute. Pin the failure the absolute existed to prevent as its own scenario and require it to pass on both arms, so the fix cannot pass by inverting the bias.

Not applicable when placement genuinely *is* the requirement -- a PR template heading order, a required frontmatter field, a file path. Those are data, not a proxy for a judgment.

## Mechanical pins

`tests/commit-push-pr-contract.test.ts` asserts the condition at Step C and the legibility-shaped audit, and asserts the two absolutes are gone. The negative assertions run against the whole document, not a section, because a pin that only asserted the new text would let the absolute be reintroduced elsewhere in the file.

## Related

- `docs/solutions/skill-design/size-driven-skill-restructure.md` -- "A size-driven restatement overshoots into an absolute" is the narrower form, triggered by a byte budget and detected by "a sentence qualified twice." Neither trigger applied here: #1422 had no byte cap and wrote the absolute deliberately on the first pass. This doc generalizes to any absolute standing in for a condition and adds a second tell: the same decision at more than one site.
- `docs/solutions/skill-design/subordinate-the-failing-shape-to-the-condition.md` -- the inverse asymmetry: there, deleting a concrete shape cost determinism on the most literal host; here, an over-broad absolute cost correctness on that same host.
- `docs/solutions/skill-design/skill-gates-state-conditions-not-prescribed-git-commands.md` -- the owning-layer half, one domain over: a prescribed mechanism standing in for the condition in a delegating gate.
- `docs/solutions/skill-design/strong-models-mask-defensive-skill-fixes.md` -- guard both failure directions when relaxing an absolute.
- `docs/solutions/skill-design/paired-old-vs-new-injection-skill-evals.md` -- the pre/post-arm methodology for the two-arm scenario above, and the cross-host default: a placement absolute is a literal instruction one host may obey and another treat as style.
- `docs/solutions/skill-design/portable-agent-skill-authoring.md` -- the standard; carries the rule.
