---
name: ce-ticket-scope
description: Interrogate a work ticket until someone who did not write it — human or agent — could produce the intended result from the ticket alone. Resolves the baseline/starting context, observable acceptance criteria, which of several valid approaches is wanted, explicit out-of-scope boundaries, assumptions that must be validated before work starts, and any existing skill or runbook that already executes the work. Use when writing or refining a ticket before assigning it, when the user says "scope this ticket", "is this ready to assign", or "pressure-test this ticket", or when the user has been assigned a ticket someone else wrote and wants the gaps surfaced. Use it even for tickets that look complete — a filled-in checklist can still carry an unresolved either/or inside it.
---

# Ticket Scope

Make a ticket executable by a competent engineer — or agent — who is new to this codebase, using only what the ticket says. The skill closes the gap between what the author *meant* and what they *wrote*, then emits a fully specified ticket or a batched clarification comment.

## The bar

Keep going until this is true:

> Could an engineer (or agent) skilled in the relevant technology, but new to this codebase and its history, produce the **intended** result from this ticket alone — without asking anyone?

If not, name the exact unwritten thing and get it written. "It was unclear" is not a finding; the specific missing criterion or context item is.

## Phase 0: Operator case and proportionality

**Identify the operator case first — it changes where questions go:**

- **Author-operated** — the session user wrote (or is writing) the ticket. Unresolved fields become interactive questions to them.
- **Implementer-operated** — the session user received a ticket someone else wrote. The answers live in the author's head; the session user cannot confirm them. Unresolved fields become a batched clarification comment addressed to the author (see Output). Do not run a blocking question loop against someone who cannot answer, and do not treat the session user's guess as confirmation of another author's intent.

When the ticket's author is ambiguous, ask the session user which case applies before interrogating.

**Proportionality:** size the blast radius before interrogating — what rework costs if the ticket is misread. A small, reversible, single-file change gets a single question (usually the baseline); interrogate all fields only when misreading is expensive (multi-day work, release-bound work, shared infrastructure, more than one plausible end state). State which depth you chose.

**Read everything the ticket links** — related tickets, PRs, referenced docs — before asking anything. Treat "N/A" in a field that plausibly needs content as missing, not resolved.

## The fields

Resolve each field. The parenthetical names the failure mode leaving it blank produces.

1. **Baseline / starting context** *(starting-context gap)* — which branch, release line, environment, or precondition the work targets. Most often left blank and most expensive: an acceptance check can pass trivially against the wrong baseline (the end state already true on the default branch, when the work is only coherent against a release branch never named). In a sub-ticket, "see parent" is not a baseline — the sub-ticket states its own slice.
2. **Acceptance criteria / observable end state** — what is true and testable when the work is done. Signals to test the result against, never implementation steps. Three sub-checks:
   - Name what the check runs against — shipped/published artifact vs. working tree, and which environment.
   - An either/or inside a criterion ("backport X, *or* add Y") is an unresolved decision deferred into review, not a resolved field.
   - Mark must-have vs. severable-if-blocked, with the fallback stated.
3. **Approach resolution** *(end-state gap)* — if more than one valid path exists: is one required, or is the implementer's documented choice acceptable? Name who adjudicates if review disagrees with a sanctioned choice, and record any later redirect as a scope change rather than a miss.
4. **Out of scope** — explicit boundaries; what this ticket does *not* include.
5. **Assumptions + validity** *(goalpost-moved)* — what the ticket assumes, each tagged `confirmed` (with source) or `validate-before-building`. A blanket disclaimer ("may not be 100% accurate", an AI-generated note) flags that assumptions exist while tagging none of them.
6. **Unwritten context / prior decisions** — anything the author knows that the implementer cannot derive. A decision recorded as a bare link to a chat thread or doc is unresolved: put the decision's content inline in one sentence; keep the link as provenance.
7. **Existing executable knowledge** *(reinvented-runbook gap)* — does a skill, runbook, script, or CI workflow already execute this work? Search the project's skills/runbooks locations and ask before deriving the procedure by hand: a hand-derived command can be parameter-perfect and still miss the preflights and failure patterns the existing runbook encodes. A guide link is documentation; a runbook reference is operator knowledge — the ticket needs the second.

Cross-cutting: information in the wrong field counts as a gap. Baseline data filed under acceptance criteria while the assumptions field reads "N/A" means the next reader checks the field, sees content, and moves on.

## Author-operated flow

1. Self-answer whatever the codebase, the ticket's links, version-control history, or existing docs can answer; mark each "proposed — confirm." Only what genuinely lives in the author's head becomes a question.
2. Ask one question at a time, in dependency order (target release before environment-specific behavior; approach before approach-specific criteria). Provide 2–4 concrete options plus a custom answer; skip generic Yes/No unless the question is genuinely binary.
3. Use the platform's blocking question tool for every question. In Claude Code, `AskUserQuestion` is a deferred tool: call `ToolSearch` with query `select:AskUserQuestion` once, before the first question, to load its schema. Fall back to a numbered list and wait for the reply only when the harness genuinely lacks a blocking question tool — never silently skip a question.
4. After each answer, acknowledge the decision in 1–2 sentences, then ask the next.
5. Re-run **The bar** against the result. Stop when it passes at the chosen proportionality depth.

## Implementer-operated flow

1. Self-answer whatever the codebase and history can answer; mark each "proposed" and cite the evidence (file, commit, linked PR). These are proposals for the author to confirm, not confirmed facts.
2. Convert each remaining gap into one specific question naming the field it resolves.
3. Emit the batched clarification comment (see Output). Do not post it: writing to the tracker is the user's action, taken with whatever interface the project's issue tracker exposes (connector/MCP, documented API, or a documented CLI).

## Output

**Author-operated:** emit the ticket with every field populated, paste-ready in the project's ticket format (use its existing template when the tracker or project defines one; otherwise use the field list above as sections). End with a one-line summary of the decisions made and a short list of what was surfaced that had not previously been written down.

**Implementer-operated:** emit two blocks —

1. **Proposed readings** — the self-answered fields with evidence, framed for confirmation ("Reading the linked PR, this targets `release/1.2` — please confirm").
2. **Clarification comment** — a single paste-ready comment addressed to the ticket's author: batched questions, each tied to the field it resolves, ordered by how much the answer changes the work. No preamble beyond one sentence of context.

## Framing

Attribute findings to the artifact, never the author. Do not moralize or imply the author did something wrong by leaving a field blank. The output is always the improved artifact, not a critique of the person who wrote it.
