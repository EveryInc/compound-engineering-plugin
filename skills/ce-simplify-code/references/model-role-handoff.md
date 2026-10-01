# Model role hand-off for apply and verify

Read this when the `simplify` role resolved to `inherit` or `entries`. `references/model-roles.md` decides whether a hand-off happens, which route serves it, what the fallback is, and how the `Model role` line reads. This file adds only what is specific to this skill.

**What the role governs.** The deliverable is the applied simplification edits and their verification, which is Step 3 and Step 4 together. The session keeps scope resolution, the three reviewer dispatches, and the Step 5 summary. The three reviewers keep their Model tier from Step 2. The entry does not change them.

**Route.** This skill has no peer route, so a native subagent is the only hand-off route. When the host's subagent primitive takes a model but no effort, an entry that has an effort is served through the fallback ladder's effort-not-applied rung.

**Hand-off.** When a hand-off is called for and the host can hand the entry's model to a subagent, dispatch one subagent on that model once all three review outcomes are complete. The session edits nothing while that subagent runs. Step 2's permission-mode and agent-lifecycle rules apply to this dispatch as well. The subagent's prompt carries:

- the three reviewers' findings, as they were returned
- the resolved scope, and the mutation boundary Step 3 draws around it
- any structure constraint the caller passed, with its plan path
- the text of Step 3 and Step 4 from `SKILL.md`, verbatim and without the model role paragraph, as the rules it works under
- the instruction to perform both steps itself, inside that boundary, and to dispatch no further agent
- the return it owes: the findings it applied, grouped as reuse, quality, and efficiency; the findings it skipped; the edits it reverted; and each check it ran, with its outcome

The session writes the Step 5 summary from that return.

**Inline fallback.** When the host cannot hand the entry's model to a subagent, or the dispatch fails before the subagent has edited anything, the session performs Steps 3 and 4 itself, as it does when there is no map. The `Model role` line then names the session as the route and gives the reason.

**Mid-edit failure.** When the subagent fails or stops after it has started editing, the working tree is the record of what it did. The session finishes inline from the working tree. It reads the current files and treats each finding as applied or not by what they now show. It completes Step 3 for the findings that are left, then runs Step 4 again over the whole result. The `Model role` line reports the fallback and its reason.
