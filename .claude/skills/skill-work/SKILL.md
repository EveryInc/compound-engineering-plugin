---
name: skill-work
description: "Use when creating, editing, reviewing, or acting on review feedback for anything under this repository's skills/** — a SKILL.md, a references/ file, a persona prompt, or the prose contract of a bundled script. Not for src/, tests/, or scripts/ code."
---

# Skill Work

Skills in this repository are goals, not state machines. A skill hands the agent the goal, the done condition, the safe failure direction, and the facts it cannot derive from the repo in front of it, then gets out of the way. Everything this skill does — authoring, editing, reviewing, responding to review — is that one standard applied to a different starting state.

**Outcome:** the skill files you touch state their conditions rather than enumerate cases, carry nothing that does not change behavior, and put each mechanism at the layer that owns it; and the change is validated in the way its risk warrants.

**Done:** the mode's completion report is written and its validation ran (or the exact skip reason is recorded). Landing a sentence is not done; a demonstrated gap closed at its owning layer by the smallest mechanism is.

**Non-goal:** shorter files. Leanness is a side effect of stating conditions; report what changed, not word counts.

## The standard (read before any mode)

`docs/solutions/skill-design/portable-agent-skill-authoring.md` is the authority. Read the sections the mode below names; do not restate the guide in the skill you are editing. The always-loaded rules in the project's active instructions supplement it and win where more specific.

Five things every block must hand the reading agent, in this order: the result and next consumer, the done condition, the safe failure direction, the non-derivable facts, and only then any protocol the outcome cannot protect on its own. If a block does not need one, it omits it; if it has something else instead — a menu, a bash procedure, a list of cases — that is the finding.

## Rules that hold in every mode

- **Conditions, not cases.** When you find yourself adding "and also when X" to a rule, name the condition X is a proxy for and state that. A rule that has to enumerate its cases is stated wrong.
- **Prescribe a mechanism only where this skill owns it.** Commands, exit codes, and state transitions belong to the skill that owns the mechanic (`ce-commit-push-pr` owns PR detection) or to cheap deterministic work. A delegating skill states the condition, the safe direction, and the non-derivable callee facts.
- **Sediment first.** Before adding to a block, delete what the standard says should not be there. Provenance decides what stays: a line survives if a test asserts it, a `docs/solutions/` learning records it, or a commit added it to fix a named bug — cite which. A line with no provenance after a real search is a cut; a line with provenance is a keep, and you do not relitigate it.
- **For every mandate you remove, name what now decides.** If the answer is "the model, at its discretion, whether a required step happens", that mandate is a required gate and it stays. Removing a "must" does not remove the decision.
- **A line earns its place** by stating a falsifiable constraint, countering a demonstrated default tendency, or supplying a fact the agent cannot derive. Rationale after a directive that stands alone, effort language, and capability restatement do not.
- **User-facing invocations render per harness** — the rule and its placement are in the project's active instructions ("User-Facing Skill Invocations"); apply it wherever a skill prints or copies an invocation.
- **The description is a trigger, not a summary.** It says when to use the skill — situations, symptoms, adjacent negatives — never what the skill does; a description that summarizes the workflow gets followed instead of the body.
- **Every step states how the agent tells done from not-done.** A step without a checkable completion invites stopping early; sharpen the criterion before hiding later steps.
- **Validate to the risk.** Mechanical contracts (frontmatter, paths, greppable invariants) go in `bun test`. Behavior-bearing prose changes get a targeted eval per `references/evaluate.md`, on Claude and Codex, or an explicit skip reason in the report. Never ship an untested behavior change as "reference".

## Modes

Pick the mode from what you were asked to do; a request can chain them (a review that becomes an edit).

| You are | Read | Done when |
|---|---|---|
| Creating a new skill | `references/new-skill.md` | The outcome spine exists before any workflow, activation cases are written, repo inventory is updated, and the eval ran |
| Changing an existing skill | `references/edit-skill.md` | The touched block meets the standard, nothing your change contradicts remains, and validation ran |
| Reviewing a skill change | `references/review-skill.md` | Every finding is Change / Verify / Consider with the evidence its class requires, and each Change names a condition or an owning-layer move |
| Acting on review feedback for a skill | `references/respond-to-review.md` | Each item has a verdict, each Change closed a gap at its owning layer, and no block was patched twice |

## Completion report

End every mode with, in order: what changed (per block: goal it now states, what was removed and its provenance search result), what was intentionally left short of the standard and why it is out of scope, what validation ran and its result or the exact skip reason, and any decision that would materially change the skill's contract that you did not make.
