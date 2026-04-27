# Synthesis Summary

**Synthesis ≠ requirements doc.** The synthesis is NOT a preview, draft, or substitute for the requirements doc — it's the scope checkpoint that doc-write consumes as input. The requirements doc itself is written in Phase 3 from the confirmed synthesis. Concretely: implementation detail (file paths, code shapes, exact error wording, behavior bullets) belongs IN the doc; the synthesis tells the next phase WHAT scope to expand into a doc. If the synthesis reads like a doc preview, it's misshaped — re-cut to scope-only.

**Three-bucket structure is a chat-time artifact only.** It does its scope-confirmation job in dialogue with the user, then dissolves when Phase 3 writes the doc: Stated content informs the Requirements section, Inferred content informs Key Decisions, Out-of-scope content informs Scope Boundaries. The doc has no parallel `## Synthesis` section — only the prose summary embeds, as `## Summary`. See "Doc shape after confirmation" below for the routing.

This content is loaded when Phase 2.5 fires — after Phase 2 (approaches chosen) and before Phase 3 (write requirements doc). The synthesis is the user's last opportunity to correct the agent's interpretation before the doc lands. It serves two purposes: synthesis confirmation (the user agreed to many individual things in dialogue but never saw the whole) and a transition checkpoint ("about to write a doc").

Fires for **all tiers** including Lightweight when there is a user to confirm to. Skip Phase 2.5 entirely on the Phase 0.1b non-software (universal-brainstorming) route — that flow has its own facilitation pattern. Skip Phase 2.5 entirely in headless mode — see "Headless mode" below.

---

## Three-bucket structure

Every synthesis is structured in three labeled buckets. Items may appear in two buckets when meaningfully both — flag the inclusion-then-exclusion as Inferred so the reader sees the agent's reasoning.

- **Stated** — what the user said directly (in the original prompt, prior conversation, dialogue answers, approach selection in Phase 2). Items here have explicit user-language anchors.
- **Inferred** — what the agent assumed to fill gaps. Scope boundaries the user never explicitly named, success criteria extrapolated from intent, technical assumptions made because the brief interview didn't probe them. The "Inferred" list is the most actionable bucket — items here are the agent's bets that the user can correct.
- **Out of scope** — deliberately excluded items. Adjacent work the agent considered but decided not to include, refactors, nice-to-haves, future-work items. Making exclusions explicit lets the user spot anything they actually wanted included.

---

## Tier-shaped output

Lightweight gets one paragraph plus brief bulleted lists. Standard, Deep-feature, and Deep-product get a few paragraphs with explicit lists per bucket.

The synthesis is a chat-time artifact. The buckets exist for the user to scan, correct, or confirm — they do not carry into the doc as a parallel section. After confirmation, only the prose summary embeds in the doc (as `## Summary`); bucket content dissolves into the doc's body sections per "Doc shape after confirmation" below.

## Prompt template

This is directional guidance — adjust phrasing to fit dialogue context. Open prose feedback per Interaction Rule 5(a) (option sets would leak the agent's framing of valid corrections).

**Prose summary discipline (Standard, Deep-feature, Deep-product tiers — required):** start the synthesis with a 1-3 line summary in plain prose describing **what's being proposed for the requirements doc** at a glance. Forward-looking (what *will* be in the doc), not retrospective (what's been discussed). The prose's job is to help the user pattern-match against intent before reading bullets — they may agree with each individual Stated bullet but disagree with the overall framing, and the prose surfaces that gist. **Skip for Lightweight** when the bullets ARE the summary (the work is small enough that prose would just restate them).

**Prose lives inside the synthesis section**, immediately after the lead-in line and before the Stated bucket — not as a separate prose block above the synthesis. Putting extensive prose ABOVE the synthesis (an approach pitch, behavior bullets, rationale) inverts the structure: the synthesis becomes a footnote to the proposal instead of the proposal being a 1-3 line gloss on the synthesis.

**Anti-fluff guidance:** if the prose starts with "This is a substantive proposal that..." or "The synthesis addresses important concerns about...", stop and rewrite. Lead with the actual thing being proposed in plain words. No qualifiers ("comprehensive," "thoughtful," "substantive"). No re-stating dialogue context the user just lived through. If you can't say what the work is in 1-3 lines without filler, the synthesis isn't ready yet.

**Anti-pattern: synthesis as proposal-pitch.** If you find yourself writing a "Recommendation" / "Behavior when X" / "Why this shape" block above the synthesis with file paths, JSON shapes, or error messages, stop. That content is Phase 3 (doc-write) territory — it belongs in the requirements doc body the next phase will write, not in the synthesis presentation. The synthesis is a scope checkpoint: three buckets plus a 1-3 line gloss. Implementation detail leaking into the synthesis is a sign that Phase 2 (approach selection) and Phase 3 (doc-write) have collapsed into Phase 2.5.

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

## Re-present after revision; write only on confirm

A revision is not a confirmation. After any user revision (even a trivially-understood swap like "rename `--foo` to `--bar`"), integrate the change, re-present the revised synthesis with the change reflected, and wait for explicit confirmation before writing the doc. The loop is:

1. Present synthesis → user responds
2. User confirms → write the doc
3. User revises → integrate, re-present revised synthesis, return to step 1

Doc-write fires only on explicit confirm or after the soft-cut blocking question's "proceed" option (see below). The confirmation step is what makes the synthesis **confirmed** rather than "agent's last proposal" — never write immediately after a revision, even when the revision is small enough that the agent feels it understood.

---

## Soft-cut on circularity (not iteration count)

Track which Stated/Inferred/Out items the user touched per round. The soft-cut blocking question fires **only when the same item is revised twice** (or a third-round revision targets an item already revised in round two). New-item revisions across rounds proceed without limit — revising different aspects of a wrong synthesis (e.g., user pushed back on Stated, then on Inferred) is exactly what the mechanism should support.

When the soft-cut fires, use the platform's blocking question tool (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini, `ask_user` in Pi) with two options:

- `Proceed with the current revised synthesis`
- `Stop and redirect — discuss further before writing the doc`

Fall back to a numbered list in chat only when no blocking tool exists or the call errors. Never silently skip.

---

## Headless mode

When the skill is invoked from an automated workflow such as LFG or any `disable-model-invocation` context, **skip Phase 2.5 entirely**. There is no user to confirm a synthesis to; composing one as a self-check before discarding it is ceremony. The agent goes from approach selection (Phase 2) directly to doc-write (Phase 3).

The doc itself is mode-agnostic — interactive and headless modes produce structurally identical requirements docs. No `authoring_mode` frontmatter, no `## Assumptions` section, no italic capture-context note. If a downstream pipeline needs to know whether human scope-confirmation occurred, that is the pipeline's concern at orchestration time, not the doc's concern.

Pipeline risk note (for orchestrator design, not for embedding in the doc): a headless requirements doc has not been through human scope-confirmation. Downstream stages flow forward on the agent's interpretation alone. If un-reviewed scope is unacceptable for a given pipeline, the orchestrator should add a review gate or route to a reviewer — not mark up the doc.

---

## Self-redirect

If the user response indicates they're in the wrong skill or want a different workflow (e.g., "this is too small, just /ce-work it" or "this needs more thought, let me brainstorm differently"):

- Stop ce-brainstorm
- Suggest the alternative skill the user appears to want (e.g., `/ce-work`, `/ce-debug`)
- Offer to load it in-session
- Do not push back or argue — the user's redirect signal is the deliberate choice

This support exists because the synthesis is an honest checkpoint. If the user discovers the skill choice was wrong by reading the synthesis, redirecting is the right move.

---

## Doc shape after confirmation

After user confirmation (or after the soft-cut decision proceeds), Phase 3 writes the requirements doc. The three-bucket structure does NOT carry into the doc as a `## Synthesis` section. Only the prose summary embeds, as `## Summary` at the top. Bucket content dissolves into the doc's body sections:

| Chat-time element | Where it goes in the doc |
|---|---|
| Prose summary | `## Summary` (1-3 lines, forward-looking, what's proposed) |
| Stated bullets | `## Requirements` (numbered R-IDs, full detail) and where relevant `## Problem Frame` for narrative context |
| Inferred bullets | `## Key Decisions` (with rationale) — bets the user accepted in dialogue become decisions in the doc |
| Out-of-scope bullets | `## Scope Boundaries` |

No italic capture-context note (e.g., "Captured at Phase 2.5..."). It would leak engineering process into an artifact whose readers do not need that signal.

The doc's `## Summary` and `## Problem Frame` must serve distinct purposes — see `references/requirements-capture.md` "Summary vs Problem Frame discipline" for the rules.

---

## When the synthesis would be redundant

For trivial Lightweight cases where the user's prompt was already a complete scope statement (e.g., "fix the typo on line 47"), the synthesis is mostly Stated with no Inferred or Out items. The transition checkpoint still has value (signals "about to write a doc; confirm or interrupt"), but keep the output to one paragraph with no ceremony. Do not pad the buckets to look thorough.

---

## What does NOT belong in the synthesis

- Implementation details (libraries, schemas, file paths, JSON shapes, exact error message wording) — those are Phase 3 plan-time content, not scope-level synthesis
- Re-statement of the entire dialogue — the synthesis is a summary, not a transcript
- Defensive what-ifs and hedges — if a concern is real, state it as Inferred or Out; if it's speculation, drop it
- Open questions surfaced outside the three buckets — by synthesis time, every scope-shaping question must be in **Stated** (asked and answered earlier), **Inferred** (agent's bet for correction), or **Out** (deliberately excluded). There is no fourth status. If a question genuinely cannot be defaulted, pause synthesis and resolve it before presenting — pick the question shape that matches: a blocking multiple-choice tool when options are bounded and meaningfully distinct, prose when option sets would bias the answer per Interaction Rule 5(a). Integrate the answer, then present synthesis. Never present synthesis with adjacent floating questions — that gives the user no clear resolution path
