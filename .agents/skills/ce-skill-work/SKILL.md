---
name: ce-skill-work
description: "Applies this repository's skill-authoring standard as a procedure. Use for any change to, or judgment about, a file under skills/** — a SKILL.md, a reference, a persona prompt, a bundled script's instructions: creating a skill, editing one, reviewing a skill change, or acting on review feedback (human or bot) about one. Not for src/, tests/, or scripts/ code."
---

# CE Skill Work

Skills in this repository are goals, not state machines. A skill hands the agent the goal, the done condition, the safe failure direction, and the facts it cannot derive from the repo in front of it, then gets out of the way. Everything this skill does — authoring, editing, reviewing, responding to review — is that one standard applied to a different starting state.

**Outcome:** the skill files you touch state their conditions rather than enumerate cases, carry nothing that does not change behavior, and put each mechanism at the layer that owns it; and the change is validated in the way its risk warrants.

**Done:** the mode's completion report is written and its validation ran (or the exact skip reason is recorded). Landing a sentence is not done; a demonstrated gap closed at its owning layer by the smallest mechanism is.

**Non-goal:** shorter files. Leanness is a side effect of stating conditions; report what changed, not word counts.

## The standard (read before any mode)

`docs/solutions/skill-design/portable-agent-skill-authoring.md` is the authority. Read the sections the mode below names; do not restate the guide in the skill you are editing. The always-loaded rules in the project's active instructions supplement it and win where more specific.

Each block starts from the same possible elements, in this order: the result and next consumer, any local done check the skill-level bar cannot protect, the safe failure direction, the non-derivable facts, and only then any protocol the outcome cannot protect on its own. If a block does not need one, it omits it. What it must not have instead is a list of cases standing in for a condition it could state, or a mechanism prescribed for work this skill delegates — that is the finding. A procedure for a mechanic this skill owns, or a menu whose omitted item would silently drop required coverage, is protocol and stays.

## Rules that hold in every mode

- **Conditions, not cases.** When you find yourself adding "and also when X" to a rule, name the condition X is a proxy for and state that. A rule that has to enumerate its cases is stated wrong.
- **Prescribe a mechanism only where this skill owns it.** Commands, exit codes, and state transitions belong to the skill that owns the mechanic (`ce-commit-push-pr` owns PR detection) or to cheap deterministic work. A delegating skill states the condition, the safe direction, and the non-derivable callee facts.
- **Sediment first.** Before adding to a block, remove what the standard says should not be there. Provenance decides how hard to look, not what stays: search for a test that asserts the line, a `docs/solutions/` learning that records it, or a commit that added it to fix a named bug. Provenance found → the line is protecting something; keep it unless its consumer is gone, and cite what it protects. None found → apply admission (does it state a falsifiable constraint, counter a demonstrated tendency, or supply a non-derivable fact?) and, when a line is plausibly insurance for a weaker model or another harness, test that before cutting rather than assuming. Say which removals rest on absence of evidence.
- **For every mandate you remove, name what now decides.** If the answer is "the model, at its discretion, whether a required step happens", that mandate is a required gate and it stays. Removing a "must" does not remove the decision.
- **A line earns its place** by stating a falsifiable constraint, countering a demonstrated default tendency, or supplying a fact the agent cannot derive. Rationale after a directive that stands alone, effort language, and capability restatement do not.
- **User-facing invocations render per harness** — the rule and its placement are in the project's active instructions ("User-Facing Skill Invocations"); apply it wherever a skill prints or copies an invocation.
- **The description is a context pointer.** For a model-invoked skill, frontmatter sits in the window every turn and is pruned harder than the body. State what the skill is with the leading prompt word first, then one positive trigger per genuinely distinct branch in "Use when..." or "Use for..." form, then only adjacent negatives that block real false-trigger neighbors. Identity boilerplate, catalogs of sites/synonyms/capabilities for one branch, workflow, flags, and procedure belong out of the description.
- **One done bar first.** Every skill needs a skill-level done condition. Add a local done check only where skipping it can produce an unsafe action, fragile transition, scope expansion, mutation, auth mistake, or silent handoff failure.
- **Lean prompts for current strong models.** State each instruction once. If a brief instruction decides a family of behaviors, use it instead of enumerating the behaviors. If two recipes share the same command skeleton, write one recipe with parameters or deltas; if the skeleton is the same, repeated full commands are a defect.
- **Plain sentences; savings come from structure, not syntax.** Write one idea per sentence in ordinary English. A sentence a careful engineer would read twice — clauses fused with dashes, articles and connectives dropped, three rules packed into one — is a defect even when it saves bytes, and it leaks into the agent's user-facing tone. When a body must get smaller, move a coherent block to a reference named at its point of use or delete genuine redundancy; never compress wording to fit, and leave headroom so the next fix does not have to.
- **Sol-first portability for this org's multi-model skills.** When Fable guidance to strip procedure or add a brevity block conflicts with Sol guidance to preserve a known-good command, required report content, or no blanket brevity slogan, keep the Sol form. Slightly thicker but clear instructions are acceptable for Fable; omitting Sol-critical determinism is not. True noise still drops.
- **Portable length control preserves content.** Never ship a blanket "be concise" / "keep it short" slogan in a cross-model skill. State what a short report must contain and what it may omit; for CLI wrappers, preserve command, exit status, output path/size, and stderr or blocker.
- **Long-running skills state their pacing.** A skill that owns a long loop or dispatches workers instructs batching (independent calls and dispatches issued in one response; serialize only real dependencies), narration (what the user hears before, during, and at close), and completion honesty (a step is done only when actually performed; the turn does not end on described-but-undone work). A skill that runs a few calls and returns omits all three — see the guide's long-running execution section.
- **Autonomy is one compact policy.** Name safe local actions and let in-scope work that follows from the user's request proceed, including an external write that is the requested job or named in the skill's authority envelope. Confirm only when an external write, destructive action, purchase, or material scope expansion is outside that envelope, or when only the user can supply the input. Do not repeat "ask first", "do not mutate", or "wait for approval" at each step.
- **Match freedom to fragility.** High freedom for many valid approaches; medium freedom for a preferred pattern or parameterized command; low freedom when one known-good command or sequence exists and agents fail if they invent it. Write a fragile command once; collapse easy variants to one skeleton plus deltas.
- **Validate to the risk.** Mechanical contracts (frontmatter, paths, greppable invariants) go in `bun test`. Behavior-bearing prose changes get a targeted eval per `references/evaluate.md`, on Claude and Codex, or an explicit skip reason in the report. Never ship an untested behavior change as "reference".

## Modes

Pick the mode from what you were asked to do; a request can chain them (a review that becomes an edit).

| You are | Read | Done when |
|---|---|---|
| Creating a new skill | `references/new-skill.md` | The outcome spine exists before any workflow, activation cases are written, repo inventory is updated, and the eval ran or its exact skip reason is recorded |
| Changing an existing skill | `references/edit-skill.md` | The touched block meets the standard, nothing your change contradicts remains, and validation ran |
| Reviewing a skill change | `references/review-skill.md` | Every finding is Change / Verify / Consider with the evidence its class requires, and each Change names a condition or an owning-layer move |
| Acting on review feedback for a skill | `references/respond-to-review.md` | Each item has a verdict, each Change closed a gap at its owning layer, and no block was patched twice |

## Completion report

End every mode with a report shaped by what the mode does. **Mutating modes** (new, edit, respond): per touched block, the goal it now states, what was removed and its provenance result; what was intentionally left short of the standard and why it is out of scope; what validation ran and its result or the exact skip reason; any decision that would materially change the skill's contract that you did not make. **Review mode:** the findings by class with the evidence each carries, and — where the caller has a summary channel — the paths you checked that any restatement still serves and what you could not verify. The report goes to whatever channel the caller provides; when the caller accepts only a findings list, that list *is* the report and satisfies Done. Review changes nothing, so it never has changed-block entries.
