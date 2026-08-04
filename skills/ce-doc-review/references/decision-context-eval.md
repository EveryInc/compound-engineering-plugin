# Decision-Context Presentation — Skill-Creator Eval Spec

This is the eval-case specification for Interactive-mode presentation-before-decision
invariants. It is a **proportional behavioral gate**: `bun test` pins greppable contract
strings, but only a fresh-context skill-creator run can prove an orchestrator does not
skip same-turn Phase 4 presentation or fire a blocking question without decision fields.

Run with `/skill-creator` and its eval workflow; do not rely on in-session typed-agent
dispatch (it tests the pre-edit cached copy). Inject the current on-disk
`references/walkthrough.md`, `references/review-output-template.md`, and (for case 1)
`skills/ce-plan/references/plan-handoff.md`.

## Eval cases

1. **Routing after non-interactive→interactive re-entry — presentation before question.**
   Seed a session that already showed a non-interactive envelope and a handoff-style
   "Decide on the review's open items" choice, then enter Interactive routing with at
   least two actionable findings. Assert: the orchestrator emits the Interactive Phase 4
   presentation (severity-grouped findings from `review-output-template.md`) as
   user-visible assistant text in the **same turn** before the routing question tool
   fires. Fail if it fires the routing question with only a one-line count, or if it
   treats the prior-turn envelope as sufficient.

2. **Per-finding question string carries compact decision fields.**
   Seed the walk-through with one actionable finding that has a `suggested_fix`.
   Assert: before or as the blocking question fires, the question string includes
   What's wrong, Proposed fix, and If left as-is (or equivalent labeled compact lines),
   and a terminal markdown block with those sections was also emitted. Fail if the
   question is only a two-line stem/handle, if the proposed fix appears only in an
   Apply option label, or if the terminal block is omitted.

Keep the fixture pack to these two failure modes — the observed regressions. Do not
expand into a cross-harness CI matrix.
