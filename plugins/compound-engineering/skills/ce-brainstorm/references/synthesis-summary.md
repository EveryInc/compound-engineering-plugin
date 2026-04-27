# Synthesis Summary

This content is loaded when Phase 2.5 fires — after Phase 2 (approaches chosen) and before Phase 3 (write requirements doc). The synthesis is the user's last opportunity to correct the agent's interpretation before the doc lands. It serves two purposes: synthesis confirmation (the user agreed to many individual things in dialogue but never saw the whole) and a transition checkpoint ("about to write a doc").

Fires for **all tiers** including Lightweight. Skip Phase 2.5 entirely on the Phase 0.1b non-software (universal-brainstorming) route — that flow has its own facilitation pattern.

---

## Three-bucket structure

Every synthesis is structured in three labeled buckets. Items may appear in two buckets when meaningfully both — flag the inclusion-then-exclusion as Inferred so the reader sees the agent's reasoning.

- **Stated** — what the user said directly (in the original prompt, prior conversation, dialogue answers, approach selection in Phase 2). Items here have explicit user-language anchors.
- **Inferred** — what the agent assumed to fill gaps. Scope boundaries the user never explicitly named, success criteria extrapolated from intent, technical assumptions made because the brief interview didn't probe them. The "Inferred" list is the most actionable bucket — items here are the agent's bets that the user can correct.
- **Out of scope** — deliberately excluded items. Adjacent work the agent considered but decided not to include, refactors, nice-to-haves, future-work items. Making exclusions explicit lets the user spot anything they actually wanted included.

---

## Tier-shaped output

Lightweight gets one paragraph plus brief bulleted lists. Standard, Deep-feature, and Deep-product get a few paragraphs with explicit lists per bucket.

The synthesis is not a section of the requirements doc yet — it's a chat output that the user reacts to. After confirmation (or revision), it becomes the first section of the requirements doc when Phase 3 writes the file.

## Prompt template

This is directional guidance — adjust phrasing to fit dialogue context. Open prose feedback per Interaction Rule 5(a) (option sets would leak the agent's framing of valid corrections).

**Prose summary discipline (Standard, Deep-feature, Deep-product tiers — required):** start with a 1-3 line summary in plain prose describing **what's being proposed for the requirements doc** at a glance. Forward-looking (what *will* be in the doc), not retrospective (what's been discussed). The prose's job is to help the user pattern-match against intent before reading bullets — they may agree with each individual Stated bullet but disagree with the overall framing, and the prose surfaces that gist. **Skip for Lightweight** when the bullets ARE the summary (the work is small enough that prose would just restate them).

**Anti-fluff guidance:** if the prose starts with "This is a substantive proposal that..." or "The synthesis addresses important concerns about...", stop and rewrite. Lead with the actual thing being proposed in plain words. No qualifiers ("comprehensive," "thoughtful," "substantive"). No re-stating dialogue context the user just lived through. If you can't say what the work is in 1-3 lines without filler, the synthesis isn't ready yet.

```
Based on our dialogue and approach selection, here's the scope I'm proposing for the requirements doc:

[Standard/Deep: 1-3 line prose summary — what's being proposed in plain language. Skip for Lightweight when bullets are the summary.]

**Stated** (from your input and our dialogue):
- [item]
- [item]

**Inferred** (gaps I filled with assumptions — flag anything I got wrong):
- [item]
- [item]

**Out of scope** (deliberately excluded):
- [item]
- [item]

Does this match your intent? Tell me what to add, remove, redirect, or that I got wrong — or just confirm to proceed. (You can rebut even if my synthesis accurately reflects what you said earlier — you may have changed your mind, surfaced new context, or want to correct an unstated assumption.)
```

Use prose for the user response (no `AskUserQuestion` menu). The justification is Interaction Rule 5(a) in SKILL.md — option sets bias the answer by signaling which dimensions matter.

---

## Soft-cut on circularity (not iteration count)

Track which Stated/Inferred/Out items the user touched per round. The soft-cut blocking question fires **only when the same item is revised twice** (or a third-round revision targets an item already revised in round two). New-item revisions across rounds proceed without limit — revising different aspects of a wrong synthesis (e.g., user pushed back on Stated, then on Inferred) is exactly what the mechanism should support.

When the soft-cut fires, use the platform's blocking question tool (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini, `ask_user` in Pi) with two options:

- `Proceed with the current revised synthesis`
- `Stop and redirect — discuss further before writing the doc`

Fall back to a numbered list in chat only when no blocking tool exists or the call errors. Never silently skip.

---

## Headless mode

When the skill is invoked from an automated workflow such as LFG or any `disable-model-invocation` context, run in headless mode:

- **Skip the user prompt.** Do not fire any blocking question.
- **Embed the synthesis as the first section of the requirements doc**, but **omit the "Inferred" list.** Stated and Out-of-scope are kept (they reflect input the user gave or scope the agent deliberately excluded — both are anchored in concrete dialogue or deliberate decisions). The Inferred list is the agent's un-validated bets; pipelines consume the doc without human review, so propagating speculation as authoritative content is unsafe.
- **Pipeline propagation is uncorrected.** A wrong headless synthesis flows through downstream stages until a human PR reviewer reads the resulting code. There is no automated downstream validation — that's an accepted limitation, not an oversight. Document it in the doc itself if it would help the reviewer.

---

## Self-redirect

If the user response indicates they're in the wrong skill or want a different workflow (e.g., "this is too small, just /ce-work it" or "this needs more thought, let me brainstorm differently"):

- Stop ce-brainstorm
- Suggest the alternative skill the user appears to want (e.g., `/ce-work`, `/ce-debug`)
- Offer to load it in-session
- Do not push back or argue — the user's redirect signal is the deliberate choice

This support exists because the synthesis is an honest checkpoint. If the user discovers the skill choice was wrong by reading the synthesis, redirecting is the right move.

---

## Embedding the confirmed synthesis in the requirements doc

After user confirmation (or after the soft-cut decision proceeds), Phase 3 writes the requirements doc with the synthesis as the first section. The synthesis section title is `## Synthesis`, with the prose summary at the top followed by three subsections matching the buckets:

```markdown
## Synthesis

*Captured at Phase 2.5 — agent's interpretation of scope before doc-write, confirmed by the user. Recorded for audit (which inferences shaped the doc) rather than as a separate requirements source. Downstream consumers (e.g., ce-plan Phase 0.3) treat this as a record/summary, not as additional content to carry forward.*

[1-3 line prose summary in plain language — what's being proposed for the requirements doc. Required for Standard / Deep-feature / Deep-product. Omit for Lightweight when bullets are the summary.]

### Stated

- [item]

### Inferred

- [item]

### Out of scope

- [item]
```

In headless mode, the `### Inferred` subsection is omitted (the prose summary stays — it summarizes what's in the doc, not the un-validated agent inferences). The framing italic line above explicitly identifies the section's role so downstream tooling (ce-plan, ce-doc-review) treats it correctly.

---

## When the synthesis would be redundant

For trivial Lightweight cases where the user's prompt was already a complete scope statement (e.g., "fix the typo on line 47"), the synthesis is mostly Stated with no Inferred or Out items. The transition checkpoint still has value (signals "about to write a doc; confirm or interrupt"), but keep the output to one paragraph with no ceremony. Do not pad the buckets to look thorough.

---

## What does NOT belong in the synthesis

- Implementation details (libraries, schemas, file paths) — those are Phase 3 plan-time content, not scope-level synthesis
- Re-statement of the entire dialogue — the synthesis is a summary, not a transcript
- Defensive what-ifs and hedges — if a concern is real, state it as Inferred or Out; if it's speculation, drop it
- Multiple synthesis sections per doc — exactly one `## Synthesis` section, at the top
