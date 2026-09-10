# Establish the Frame Before Grounding

Settle the question before gathering decision-specific evidence. SKILL.md defines how to interact with the user and how to return to the caller.

If the request belongs to another skill, finish intake by routing it there. Send understanding questions to `ce-explain` with the subject and intended use. For other work outside this skill’s scope, return the route identified in `references/boundaries.md`. Do not issue a verdict or continue to tiering, selection, or evidence gathering. If the named capability is unavailable, report that limitation to the caller.

Every settled POV applies the reversibility tier and selection escape hatch below. A clear frame can proceed directly to those checks; an ambiguous one follows the skill body's interaction rule before decision-specific research.

## Output mode and warm invocations

By default this skill writes no document. Deliver the POV to its consumer. A requested write-up uses Phase 4 (Deliver and return); do not read rendering instructions for an ordinary answer.

A **warm** invocation is a mid-session second opinion, with the question sitting in the conversation or absent. On one, read `references/invocation.md`, and take only the *question and claims-to-verify* from the conversation, never grounding.

## Why this check exists

The same subject supports very different verdicts. A link to a new sign-in method could mean "should we **adopt** it?", "should we **migrate** to it, and how costly?", "how does it **compare** to what we have?", or "I just have a **question** about it." Guessing "migrate" sends all three scouts after migration cost and answers a question the user never asked. The frame determines what the scouts look for, so settle it first.

## Step 1 — Orient on what was provided (cheap, pre-grounding)

- **A bare link** → fetch it lightly (one fetch) to learn what the thing *is*; name it. If you cannot fetch it (no web tool, paywalled), return the missing subject information under the skill body's interaction rule.
- **A bare topic or name** → recognize it from your own knowledge; a single search only if you genuinely can't place it.
- **A document path** → read its headings to learn its purpose and shape; do not review it for findings yet.
- **An approach set** → identify the options already on the table; do not invent additional options during orientation.
- **A paste or provided context** → read it.

This is orientation, not grounding — keep it to one read/fetch. The project and external grounding (the scouts) come *after* the frame is set.

## Step 2 — Determine the POV intent

The subject is usually recoverable; the **intent** is the ambiguous part. Classify it:

- **Adopt** — use this new capability (net-new, or no incumbent)?
- **Migrate / replace** — switch *from an incumbent* to this?
- **Compare** — how does it stack up vs. what we have or the alternatives (no switch implied)?
- **Exposure** — is this (a CVE, deprecation, or ecosystem change) *our problem*?
- **Document-take** — what is the holistic take on this document: its strengths, risks, and bottom line, rather than a findings review?
- **Approach-set** — which of the supplied approaches fits this project, and why, or are the options honestly viable either way?
- **Explainer** — the requested result is understanding. Route to `ce-explain`, preserving the question and intended use.

## Step 3 — Resolve the frame

Resolve shorthand from the active conversation when one referent fits. A clear subject and intent need no confirmation. When competing readings would materially change the judgment, investigate what can be established and return **Blocked — missing context** with the remaining information needed, under the skill body's interaction rule. Do not start research or a panel on an invented question.

Uncertainty that does not affect the decision need not stop a recommendation supported by evidence. You may state a supported assumption if it does not invent a product commitment or choose an unresolved user preference. Still obtain any required approval before sending information to an unexpected external recipient or acting outside existing permission.

An understanding request belongs to `ce-explain`; no reversibility tier, selection workup, or verdict is required on that route.

## Tier, sizing, and the selection hatch

These two decide **every** invocation, however clear the frame already was.

**Apply the selection escape hatch** (the rule that stops this skill from judging a field it would have to invent). If the input is a *selection* over a field ("what should we use for auth?"), it belongs here only when the realistic field is bounded (roughly five or fewer real candidates) and the criteria are knowable. If judging the field would require inventing options, or the criteria are unclear, **stop**. Return a Hold that explains what is missing and identifies the skill that can resolve it. Use `ce-bakeoff` to develop competing solutions to a defined brief, `ce-ideate` to explore an open opportunity field, or `ce-brainstorm` to bring out goals and criteria. Bake-off selects and synthesizes its own result. A subsequent POV is an optional second opinion. Continuing through that route follows the follow-up authority check in `references/followup.md`.

**Classify the reversibility tier — three levels.** Infer it from project signals:

- **Tier 1 — two-way door:** a dependency, lint rule, or config; trivially reversible.
- **Tier 2 — one-way but bounded:** a data store, an internal API/contract, or a migration whose blast radius stays inside this codebase.
- **Tier 3 — one-way and high-stakes:** a security, legal, or privacy surface; a public API/contract; or an irreversible data migration.

The tier determines how much investigation and verification to do, not the answer’s format. Tier 1 uses a combined grounding pass. Tier 2 adds all three scouts and an alternatives pass. Tier 3 adds deep external research and precedent search. Explain the stakes when they affect the recommendation. Do not run a Tier-3 workup on a trivially reversible `npm i`, or hand a security-surface decision the moderate Tier-2 treatment.
