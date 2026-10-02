# Model role hand-off for apply and verify

`references/model-roles.md` decides whether the `simplify` role hands off, which route serves it, what the fallback is, and how the `Model role` line reads. This file adds only what is specific to this skill.

**What stays with the session.** The session keeps scope resolution, the three reviewer dispatches, and the Step 5 summary. The three reviewers keep their Model tier from Step 2.

**Hand-off.** When a hand-off is called for and the host can hand the entry's model to a subagent, dispatch one subagent on that model once all three review outcomes are complete. The session edits nothing while that subagent runs. Step 2's permission-mode and agent-lifecycle rules apply to this dispatch as well. The subagent's prompt carries:

- the three reviewers' findings, as they were returned
- the resolved scope, and the mutation boundary Step 3 draws around it
- any structure constraint the caller passed, with its plan path
- the text of Step 3 and Step 4 from `SKILL.md`, verbatim and without the model role paragraph, as the rules it works under
- the active project instructions and subdirectory-scoped instructions that govern the files in scope, as text or as the paths of the instruction files to read before it edits, because a subagent may start without the instructions the session has loaded
- the instruction to perform both steps itself, inside that boundary, and to dispatch no further agent
- the return it owes: the findings it applied, grouped as reuse, quality, and efficiency; the findings it skipped; the edits it reverted; and each check it ran, with its outcome

The session writes the Step 5 summary from that return.

**Inline fallback.** When the host cannot hand the entry's model to a subagent, or the dispatch fails before the subagent has edited anything, the session performs Steps 3 and 4 itself.

**Mid-edit failure.** When the subagent fails or stops after it has started editing, the session finishes inline from the working tree. It treats each finding as applied or not by what the files now show. It completes Step 3 for the findings that are left, then runs Step 4 again over the whole result.
