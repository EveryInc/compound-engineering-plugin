# Reviewing a skill change

A review agent is biased toward producing changes. Counter it: diagnose before prescribing. Read the guide's "Diagnose before prescribing" section and its "Compact review prompt"; use the prompt as your working frame.

## What a finding is, on `skills/**`

A gap in the goal, the done condition, or the safe failure direction; or a mechanism at the wrong owning layer — commands prescribed in a skill that delegates that work, a rule placed where it will not fire, a Claude-only construct in a cross-host skill, a rendering that breaks on another harness, a route that hands off to a party not present in the run.

**A case a stated condition already decides is not a finding.** Before filing "what if X" against a rule, read the rule's condition and ask whether it decides X. If it does, do not file. If the condition is wrong or missing, file that — as a condition.

**State the requested fix as a condition or an owning-layer move, never as a case to add.** "This probe fails open on network error" is a correct observation; the fix to request is "state the condition (act only on positive proof)" or "delete the probe", not "also check the exit code". "Command X fails in state Y" against a delegating skill is a representation finding: propose the deletion and the condition.

**A block restated to the standard is the expected shape of an edit**, not scope creep, when the restatement covers every path the old text served. Check that coverage; that is the review.

## Classify every finding

- **Change** — demonstrated gap with a supported smallest fix. A correctness fix cites a reproduced failure or the exact path that necessarily fails. An addition names the observable consequence of its absence, the unmet consumer contract or risk, the layer, and why the mechanism is the smallest.
- **Verify** — concrete risk that still needs reproduction or implementation tracing. Return the verification task, not a prescription.
- **Consider** — plausible enhancement whose value is not demonstrated.

Do not solve a non-problem with a rewrite. Prefer an additive guard or an explicit definition over replacing something that works.

## Also check

- Description is a trigger, not a workflow summary; adjacent negatives are present.
- Every route completes or blocks; no phantom handoffs.
- Always-loaded prose vs conditionally-loaded references: cost them differently, and say whether the change moved weight between them.
- Cross-skill contracts changed on both ends, with the contract test.
- Portability: capabilities before tools, fallbacks for platform variables, no `!` pre-resolution, `SKILL_DIR` anchor on executed bundled scripts.
- Ordinary code in the same PR (`src/`, `tests/`, `scripts/`) gets ordinary code review.

## Output

For each finding: file and block, class, the evidence its class requires, and the requested fix stated as a condition or a move. Lead with Change items; list Verify and Consider separately as advisory, not as findings. When the caller's transport carries only actionable findings (inline PR review comments, a bot's finding list), emit Change items there and put Verify/Consider in the summary or omit them — never post a verification task as an inline finding. End with the paths you checked that the restatement (if any) still serves.
