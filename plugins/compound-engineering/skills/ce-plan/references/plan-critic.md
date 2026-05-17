# Plan Critic

Use this reference at `ce-plan` Phase 5.1.7, after the complete plan draft exists and before writing it to disk.

## Goal

Answer one question: can a capable implementer execute this plan without getting blocked?

This is a pre-write gate, not a second planning workflow. Catch blockers while the draft is still cheap to revise. Keep the post-write confidence check and `ce-doc-review` intact because they catch different issue classes.

## Execution

Use the lightest reliable critic path:

- Prefer a CE-shipped reviewer when the platform supports subagent dispatch. Use `ce-feasibility-reviewer` for executability. Add `ce-coherence-reviewer` only when the draft has complex sequencing, many cross-references, or high contradiction risk.
- If subagent dispatch is unavailable, run this rubric as a self-critic in the parent session.
- Do not use local-only planning agents or local command-specific contracts. This skill must work from the Compound Engineering plugin alone.

Send the critic:

- The complete draft plan text
- The origin document path and summary, if any
- The plan depth and risk profile
- A request for an `OKAY` or `REJECT` verdict only

## Rubric

Return `OKAY` by default unless there is a true blocker.

`OKAY` means:

- The plan has enough file paths, patterns, sequencing, and verification detail to start work.
- Any remaining uncertainty is implementation-time discovery, explicitly deferred, or minor enough not to block.
- The plan preserves source requirements and scope boundaries.

`REJECT` means one or more blockers would stop or mislead implementation:

- Referenced files or patterns are missing, impossible to locate, or clearly unrelated.
- An implementation unit is too vague to start.
- Dependencies or sequencing contradict each other.
- A planning-owned question is hidden as certainty or deferred to implementation without justification.
- Runtime-path work violates the scalability baseline without mitigation.
- Feature-bearing units omit meaningful test scenarios or verification outcomes.
- The plan changes product scope beyond the user's request or origin document.

Return max three blocking issues. Each issue must include:

- The section or U-ID affected
- Why it blocks implementation
- The smallest plan change that would resolve it

Do not reject for style, completeness polish, optional edge cases, wording preference, or a merely non-optimal architecture.

## Revision Loop

Run max two revision loops:

1. Draft critic returns `OKAY` or `REJECT`.
2. If `OKAY`, continue to Phase 5.2 and write the plan.
3. If `REJECT`, revise only the blocking sections.
4. Re-run the critic on the revised draft.
5. Stop after max two revision loops, even if the critic still returns `REJECT`.

If still rejected after max two revision loops:

- Write the plan only if it is useful as a durable artifact.
- Record unresolved blockers in `Open Questions`, `Risks & Dependencies`, or the affected implementation units.
- Clearly state in the handoff summary that the pre-write critic still had unresolved blockers.
- Do not route directly to `ce-work` without surfacing those blockers first.

## Output Shape

Use this compact result:

```text
Critic verdict: OKAY|REJECT
Summary: [1-2 sentences]
Blocking issues:
1. [section/U-ID] [why blocking] -> [smallest fix]
```

Omit `Blocking issues` when the verdict is `OKAY`.
