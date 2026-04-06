# Post-Ideation Workflow

Read this file after Phase 2 ideation agents return and the orchestrator has merged and deduped their outputs into a master candidate list. Do not load before Phase 2 completes.

## Phase 3: Adversarial Filtering

Review every candidate idea critically. The orchestrator performs this filtering directly -- do not dispatch sub-agents for critique.

Do not generate replacement ideas in this phase unless explicitly refining.

For each rejected idea, write a one-line reason.

Rejection criteria:
- too vague
- not actionable
- duplicates a stronger idea
- not grounded in the current codebase
- too expensive relative to likely value
- already covered by existing workflows or docs
- interesting but better handled as a brainstorm variant, not a product improvement

Score survivors using a consistent rubric weighing: groundedness in the current repo, expected value, novelty, pragmatism, leverage on future work, implementation burden, and overlap with stronger ideas.

Target output:
- keep 5-7 survivors by default
- if too many survive, run a second stricter pass
- if fewer than 5 survive, report that honestly rather than lowering the bar

## Phase 4: Present the Survivors

Present the surviving ideas to the user before writing the durable artifact. This is a review checkpoint, not the final archived result.

Present only the surviving ideas in structured form:

- title
- description
- rationale
- downsides
- confidence score
- estimated complexity

Then include a brief rejection summary so the user can see what was considered and cut.

Keep the presentation concise. The durable artifact holds the full record.

Allow brief follow-up questions and lightweight clarification before writing the artifact.

Do not write the ideation doc yet unless:
- the user indicates the candidate set is good enough to preserve
- the user asks to refine and continue in a way that should be recorded
- the workflow is about to hand off to `ce:brainstorm`, Proof sharing, or session end

## Phase 5: Write the Ideation Artifact

Write the ideation artifact after the candidate set has been reviewed enough to preserve.

Always write or update the artifact before:
- handing off to `ce:brainstorm`
- sharing to Proof
- ending the session

To write the artifact:

1. Ensure `docs/ideation/` exists
2. Choose the file path:
   - `docs/ideation/YYYY-MM-DD-<topic>-ideation.md`
   - `docs/ideation/YYYY-MM-DD-open-ideation.md` when no focus exists
3. Write or update the ideation document

Use this structure and omit clearly irrelevant fields only when necessary:

```markdown
---
date: YYYY-MM-DD
topic: <kebab-case-topic>
focus: <optional focus hint>
---

# Ideation: <Title>

## Codebase Context
[Grounding summary from Phase 1]

## Ranked Ideas

### 1. <Idea Title>
**Description:** [Concrete explanation]
**Rationale:** [Why this improves the project]
**Downsides:** [Tradeoffs or costs]
**Confidence:** [0-100%]
**Complexity:** [Low / Medium / High]
**Status:** [Unexplored / Explored]

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | <Idea> | <Reason rejected> |

## Session Log
- YYYY-MM-DD: Initial ideation — <candidate count> generated, <survivor count> survived
```

If resuming:
- update the existing file in place
- append to the session log
- preserve explored markers

## Phase 6: Refine or Hand Off

After presenting the results, ask what should happen next.

Offer these options:
1. brainstorm a selected idea
2. refine the ideation
3. share to Proof
4. end the session

### 6.1 Brainstorm a Selected Idea

If the user selects an idea:
- write or update the ideation doc first
- mark that idea as `Explored`
- note the brainstorm date in the session log
- invoke `ce:brainstorm` with the selected idea as the seed

Do **not** skip brainstorming and go straight to planning from ideation output.

### 6.2 Refine the Ideation

Route refinement by intent:

- `add more ideas` or `explore new angles` -> return to Phase 2
- `re-evaluate` or `raise the bar` -> return to Phase 3
- `dig deeper on idea #N` -> expand only that idea's analysis

After each refinement:
- update the ideation document before any handoff, sharing, or session end
- append a session log entry

### 6.3 Share to Proof

If requested, share the ideation document using the standard Proof markdown upload pattern already used elsewhere in the plugin.

Return to the next-step options after sharing.

### 6.4 End the Session

When ending:
- offer to commit only the ideation doc
- do not create a branch
- do not push
- if the user declines, leave the file uncommitted

## Quality Bar

Before finishing, check:

- the idea set is grounded in the actual repo
- the candidate list was generated before filtering
- the original many-ideas -> critique -> survivors mechanism was preserved
- if sub-agents were used, they improved diversity without replacing the core workflow
- every rejected idea has a reason
- survivors are materially better than a naive "give me ideas" list
- the artifact was written before any handoff, sharing, or session end
- acting on an idea routes to `ce:brainstorm`, not directly to implementation
