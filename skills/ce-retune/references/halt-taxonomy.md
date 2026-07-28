# Halt Taxonomy

## The mechanism

When a workflow "phase" is invoked by loading its instructions into the **same conversation** — a skill load, an include, a prose route to "the review phase" — rather than by spawning a separate process, the model on both sides of that seam is one model in one turn. In an unattended run there is no second party and no next user message, and a reply that contains no tool call ends the session. So an instruction to return, hand back, or report to a caller has exactly one expressible form at that seam: stop. The prose is not wrong about its protocol; the protocol has no runtime.

**The diagnostic that settles which seams are real.** In the run archive, find one session id whose trace contains *both* phase-invocation calls (skill loads, reads of another unit's `SKILL.md`) and real subagent dispatches. The phase invocations carry the same session id as the orchestrator — one conversation, a fictional boundary. The subagent dispatches carry a distinct child id — a real boundary that can carry a hand-off. One line of log settles it for the whole corpus. Run this before classifying anything: class 9 and survival screen 3 both depend on the answer.

If the archive carries no session or child ids (`references/baseline-mining.md` extracts them where it can), substitute the weaker structural test: a seam is real only where the trace shows a **dispatch tool call whose result returns into the parent trace**. A skill load, an include, or a file read is not one. Do not treat an unlabeled trace as evidence of a real boundary — that reading keeps every halt.

Each class below gives what to grep, why the match halts, and the replacement. Grep terms are starting points for a corpus that never used exactly these words — read the matches, do not batch-edit them. Case-insensitive, whole corpus including reference files, one class at a time:

```
grep -rniE 'return control|hand back|hand off to|the caller (owns|applies)' <corpus-dir>
```

## 1. Waits on helpers the runtime already terminated

**Grep:** `wait for all`, `in parallel`, `concurrently`, `background`, `up to <n> minutes`, `poll until`, `dispatch all <n>`

**Why it halts:** a mandated fan-out plus a wait ceiling. If the helpers were never spawned concurrently, or the runtime reaped them at turn end, the wait resolves to nothing — and "wait" has no tool call to express it, so the turn ends inside the ceiling.

**Falsifiable check before touching it:** from the archive, measure the maximum number of helpers dispatched *concurrently* per run (see `references/baseline-mining.md` for the extraction). In the engagement, 331 of 332 runs never exceeded one at a time, which falsified the wall-clock justification the corpus had written for its own fan-out machinery.

**Replacement:** dispatch serially, or state parallelism as an allowance rather than a mandate, and delete the wait ceiling with the wall-clock rationale that justified it.

## 2. Hand-off across a same-model seam

**Grep:** `return control`, `hand back`, `hand off to`, `the caller owns`, `the caller applies`, `report to the orchestrator`, `your caller will`

**Why it halts:** it names a recipient that does not exist on this side of the diagnostic above.

**Replacement:** record the envelope and continue — "write the envelope to `<path>`, then continue to `<next step>`." Keep every field name in the envelope untouched. The fields are data; the hand-off verb is the defect.

## 3. A step ending with no instruction to advance

**Diagnostic (count, not grep):** at each boundary between consecutive steps, classify the last sentence of the step as terminal (`stop`, `done`, `await`, `report`, `wait for confirmation`, `end of step`) or forward (`then`, `next`, `continue to`, `proceed to`). A corpus with more terminal than forward endings has a structural halt, not a wording problem.

**Why it halts:** a step that closes on a terminal word and says nothing about advancing leaves ending the turn as the only complete reading.

**Replacement:** an explicit continue-to-next at **each** transition — at the transition, not once in a preamble — plus one statement that a checkpoint means verify and continue rather than pause.

## 4. Completion defined without a successor

**Grep:** `is done once`, `is complete when`, `you are finished when`, `definition of done`, `success criteria`

**Why it halts:** "X is done once ..." with nothing after it reads as the end of the turn, not the end of a step.

**Replacement:** say what follows being done. "X is done once <criteria>; then <next step>."

## 5. An output envelope labeled as a return

**Grep:** `Return the following`, `Return:`, `your return value`, `respond with the following object`

**Why it halts:** the verb, and only the verb. A return is a control transfer; there is nowhere to transfer to.

**Replacement:** verb swap. `Return the following:` becomes `Write the following to <path>:`. The field list is untouched. This is the cheapest class and the easiest to over-cut — an agent told to fix "return" language will happily also delete the schema under it.

## 6. An output-format rule doubling as a turn boundary

**Grep:** `output nothing else`, `no other text`, `respond with only`, `a single bare`, `do not add commentary`, `the entire response must be`

**Why it halts:** a rule forbidding anything after the payload forbids the next tool call. It is a strictness constraint that has quietly become a stop instruction.

**Replacement:** write the machine-readable payload to a file at a stated path and let the reply continue. The strictness moves rather than being lost — a file at a fixed path is a *more* deterministic parse target for a programmatic consumer than the tail of a transcript, so say that in the replacement text or someone will restore the old rule.

## 7. A missing optional capability treated as fatal

**Grep:** `not installed`, `must be available`, `required tool`, `abort if`, `did not start`, `if <x> is unavailable, stop`

**Why it halts:** a step that cannot execute takes the whole run with it, when the correct outcome is a partial result.

**Replacement:** record the step as skipped with the reason and what it would have covered, report partial, continue. Keep the stop only where the missing capability makes every later step meaningless — that is a real precondition, not this class.

## 8. An unresolvable precondition with no unattended path

**Grep:** `resolve ... first`, `ask the user to`, `credentials`, `log in`, `confirm before`, `requires approval`

**Why it halts:** "resolve credentials first" is satisfiable only by a human, and no human is present.

**Replacement:** report the unmet precondition and continue without the step. Where the step is mutating and unsafe to perform unattended, skip the mutation and record the exact command a human would run. Do not resolve a halt by widening what the run is allowed to change.

## 9. The subagent-prompt trap

**Grep:** the vocabulary of classes 2 and 6, restricted to the corpus's own prompt assets — its persona or agent-prompt directories, prompt templates. Also `report and stop`, `return only a gist`, `the orchestrator owns that decision`, `do not act on this yourself`.

**Why a naive sweep misses it entirely:** while the asset is sent to a real subagent, every one of those lines is correct and load-bearing. They become a live session terminator the moment a documented no-subagent fallback routes the asset **inline** into the orchestrator's own conversation. Same words, different consumer. A sweep that reads only the asset sees a correct file; a sweep that reads only the orchestrator sees no offending prose.

**Resolution:** classify each prompt asset by who actually consumes it. Grep every unit that dispatches the asset for an inlining fallback — `if you cannot dispatch`, `if subagents are unavailable`, `run this yourself`, `inline`. Then:

| Consumer | Action |
|---|---|
| Always a real subagent | Leave as is. The boundary is real. |
| Any documented inline fallback | Rewrite so the text is safe in both paths, or remove the fallback. |
| Asset shared by several units | Resolve once, for the union of consumers (see the shared-asset rule in `references/cut-passes.md`). |

Do not blanket-rewrite prompt assets. That deletes the one boundary in the corpus that was not fiction.

## 10. Over-correction: removing the mandate that made phases required

This class belongs here because the cure for 1 through 9 causes it.

A dispatch mandate carries two payloads: the fictional seam, and the requirement that the phase run at all. Remove the first without preserving the second and nothing in the corpus says the workflow's own phases are required.

**Observed:** after a dispatch-mandate removal, a run did the task inline and reported success with no artifacts. The transcript looked clean. That defect is invisible to a did-it-finish metric and surfaces only if process adherence and task completion are tracked as separate numbers (`references/baseline-mining.md`).

**Replacement:** keep the requirement, drop the seam — "Phase N is required. Do it in this session; do not skip it." Then verify the phase by artifact existence, never by the final message.

## Screens for a stop that must survive

Treating every stop as the enemy is the failure mode of applying this file. Run these before editing any match above; **any one** is sufficient to keep the stop as written.

1. **The user is genuinely the subject.** The instruction concerns a human's decision, consent, or preference — not a fabricated caller.
2. **It is a terminal no-op.** Nothing is left for anyone: "no findings, stop." A continuation here invents work.
3. **The roles split across a real runtime boundary.** The opening diagnostic shows two distinct sessions or processes. Then "return to the caller" is accurate and the halt is somebody else's turn ending, correctly.
4. **The site already has an unattended default.** "If no reply within X, choose Y", "in non-interactive mode, do Z." The path exists; the stop is the interactive branch.
5. **The word bounds an activity, not the turn.** "Stop expanding the search once you have three candidates", "halt the retry loop after two failures." A grep for `stop` catches these; they are scope quantifiers and removing them removes a threshold.

**Sixth case, stated separately because it is the one that gets deleted anyway:** a workflow whose product **is** stopping to ask. An interview that must take one question at a time. A teaching check-in that pauses for the learner's answer. An approval gate that exists in order to be a gate. Deleting the pause deletes the unit. These get an unattended degradation path — a stated default, a skip-with-reason, or an explicit refusal to run unattended — never a deletion. If such a unit fails the benchmark, the benchmark's task is wrong for it: exclude the unit and report the exclusion rather than editing the unit to pass.
