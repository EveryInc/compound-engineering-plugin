# Reviewing a skill change

A review agent is biased toward producing changes. Counter it: state the runtime you review from and what it may mask (the guide's decentering step — "this is missing X" and "this rule is redundant" are the two reactions to distrust first), then diagnose before prescribing. Read the guide's "Diagnose before prescribing" section and its "Compact review prompt"; use the prompt as your working frame.

## What a finding is, on `skills/**`

A gap in the goal, the done condition, or the safe failure direction; over-prescription that degrades the agent's degrees of freedom; under-prescription that removes a known-good fragile command; a Fable-only deletion that harms Sol; or a mechanism at the wrong owning layer — commands prescribed in a skill that delegates that work, repeated command blocks where one parameterized recipe would decide the same behavior, omitted exact commands where a capable model with live `--help` would still get the command wrong, a pinned command with no failure hatch, a hatch offered as a peer option to the pinned default, per-step done checks not protecting a fragile gate, blanket brevity slogans in cross-model skills, a rule placed where it will not fire, a Claude-only construct in a cross-host skill, a rendering that breaks on another harness, a route that hands off to a party not present in the run.

**A case a stated condition already decides is not a finding.** Before filing "what if X" against a rule, read the rule's condition and ask whether it decides X. If it does, do not file. If the condition is wrong or missing, file that — as a condition.

**State the requested fix as a condition or an owning-layer move, never as a case to add.** "This probe fails open on network error" is a correct observation; the fix to request is "state the condition (act only on positive proof)" or "delete the probe", not "also check the exit code". "Command X fails in state Y" against a delegating skill is a representation finding: propose the deletion and the condition.

**A block restated to the standard is the expected shape of an edit**, not scope creep, when the restatement covers every path the old text served. Check that coverage; that is the review.

## Classify every finding

- **Change** — demonstrated gap with a supported smallest fix. A correctness fix cites a reproduced failure or the exact path that necessarily fails. An addition names the observable consequence of its absence, the unmet consumer contract or risk, the layer, and why the mechanism is the smallest.
- **Verify** — concrete risk that still needs reproduction or implementation tracing. Return the verification task, not a prescription.
- **Consider** — plausible enhancement whose value is not demonstrated.

Do not solve a non-problem with a rewrite. Prefer an additive guard or an explicit definition over replacing something that works.

## Also check

- Description is a context pointer for a model-invoked skill: it states what the skill is with the leading prompt word first, names one trigger per genuinely distinct branch in "Use when..." or "Use for..." form, and keeps adjacent negatives only when they block real false-trigger neighbors. An identity-boilerplate opener, or a site/synonym/capability catalog for one branch, is a Change; workflow, flags, procedure, or body-owned detail in the description is also a Change. Use the single contrast pair in `references/new-skill.md` when the shape needs a labeled example.
- Every route completes or blocks; no phantom handoffs.
- One skill-level done bar decides ordinary completion; local done checks appear only around mutation, auth, scope expansion, irreversible external effects, fragile transitions, or silent handoff risk.
- CLI-wrapper skills use one canonical invocation plus named deltas; five or more near-duplicate command blocks is a Change unless each block protects a distinct load-bearing gate.
- Known-good fragile commands are pinned once. Omitting the command is a Change when agents fail if they invent it: interacting flags, brittle order, working format selector, clip/archive/auth recipe, or anything live `--help` will not reconstruct.
- Pinned commands are defaults with ordered failure hatches. A pinned command with no hatch is brittle; a hatch written as a peer option ("use this command, or compose from `--help`") is a Change because Sol may take the hatch first. The safe shape is command first, then named failure signal, then fallback.
- For this org's multi-model skills, Sol-first and Fable-acceptable wins over Fable-optimal. A Fable-only deletion of a Sol-critical command, report field, or no-blanket-brevity rule is a Change, not lean-prompt hygiene.
- Autonomy policy is one envelope; in-scope work proceeds, including external writes that are the requested job or named in the authority envelope. Repeated "ask first" gates, or an absolute stop for all external writes regardless of envelope, are a Change unless each marks a different outside-envelope external/destructive/scope/user-only boundary.
- Cross-model skills do not ship blanket "be concise" / "keep it short" slogans or Fable-only brevity blocks; they name the report content to preserve. For CLI wrappers, that includes command, exit status, output path/size, and stderr or blocker.
- Always-loaded prose vs conditionally-loaded references: cost them differently, and say whether the change moved weight between them.
- Cross-skill contracts changed on both ends, with the contract test.
- Portability: capabilities before tools, fallbacks for platform variables, no `!` pre-resolution, `SKILL_DIR` anchor on executed bundled scripts.
- Ordinary code in the same PR (`src/`, `tests/`, `scripts/`) gets ordinary code review.

## Output

For each finding: file and block, class, the evidence its class requires, and the requested fix stated as a condition or a move. Lead with Change items; list Verify and Consider separately as advisory, not as findings. When the caller's transport carries only actionable findings (inline PR review comments, a bot's finding list), emit Change items there and put Verify/Consider in the summary or omit them — never post a verification task as an inline finding. The completion report's review-mode shape (SKILL.md) says what goes where.
