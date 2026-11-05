# Selecting the review team

The team is `coherence-reviewer` and `feasibility-reviewer` always, plus each conditional persona whose signals the document shows.

**Later rounds in the same session.** Rerun only the reviewers whose lens covers something that changed since their last return, whether the change came from applied fixes or from the user's own edits. Coherence reruns whenever anything changed, because edits are where new contradictions appear. Every other reviewer's previous return carries forward: its findings were already applied, deferred, or rejected, and its scope has not moved. Rerun the whole team when the user asks for a fresh full review, or when the changes reach most of the document. Name the carried-over reviewers in the announcement. The cross-model pass runs only when a lens that triggers it reruns.

Activate a conditional persona when the document shows its signals. For a plan, `references/depth.md` decides from this selection whether the review runs lite or full, and owns the lite pass and its later rounds.

**product-lens** — the document stakes a product position — what to build, why, or what comes first — that a knowledgeable stakeholder could reasonably challenge and that no upstream Product Contract settled, or the work carries strategic weight beyond the immediate problem. Users may be end users, developers, operators, maintainers, or any other audience; the criteria are domain-agnostic. Either leg qualifies:

- *Unsettled product position* — a problem framing, a goal predicting a specific user outcome, or a prioritization that ranks what gets built against what is deferred, which the document's origin did not already settle. A choice among mechanisms for an agreed outcome is an implementation decision, not a product position; describing a task or restating known requirements stakes nothing.
- *Strategic weight* — the work could affect trajectory, perception, or positioning even with a sound premise: it shapes what the system becomes known for; it is a complexity or simplicity bet affecting adoption, onboarding, or cognitive load; it opens or closes future directions (path dependencies, architectural commitments); it carries opportunity cost — building this means not building something else.

**design-lens** — UI/UX references, frontend components, or visual design language; user flows, wireframes, screen/page/view mentions; interaction descriptions (forms, buttons, navigation, modals); responsive behavior or accessibility.

**security-lens** — auth/authorization, login flows, session management; API endpoints exposed to external clients; handling of **sensitive** data — PII, payments, tokens, credentials, secrets, encryption; third-party integrations with trust-boundary implications. Ordinary data handling is not a trigger, and neither is storage-layer churn on its own: an internal schema migration, field rename, or data-store move activates this lens only when the data is sensitive or the change alters who can read or write it. Deployment-ordering risk is a feasibility concern, not a security signal.

**scope-guardian** — every plan document, because its mechanism-sizing check applies to all plans. For other documents: multiple priority tiers (P0/P1/P2, must/should/nice-to-have); >8 distinct requirements or implementation units; stretch goals, nice-to-haves, or "future work" sections; scope boundary language misaligned with stated goals; goals that don't clearly connect to requirements.

**adversarial** — a high-value challenge surface, not merely structural complexity. Activate when ANY holds:

- A **requirements document** with 2+ challengeable claims (problem framing, solution selection, prioritization, predicted outcomes) — premise scrutiny is core to the brainstorm phase
- A **high-stakes domain** — auth, payments, billing, data migrations, privacy/compliance, external integrations, cryptography — regardless of doc type or size
- A **change to a public contract** that an outside consumer already relies on: an API, CLI output or flag, file format, or published schema that the plan renames, removes, or changes the meaning of, even when the requester asked for it. A purely additive change that leaves existing consumers working is not one
- A **new abstraction, framework, or significant architectural pattern**, regardless of doc type
- A **plan that makes a product choice** (what users get, what is deferred, who can do what) that no requester, upstream contract, or settled decision made. A choice the requester or a feedback item asked for counts as made, and so does a choice its origin settled; a plan that merely lacks a brainstorm makes no unmade choice by that alone
- A **plan that explicitly extends scope** beyond its origin requirements doc (new actors, new flows, deferred-then-restored features)
- An **explicit alternatives section** or unresolved tradeoffs — adversarial helps stress-test the chosen direction

Do NOT activate adversarial on a routine plan that carries out choices already made, stays in scope, and introduces no high-stakes domain or new abstraction. A well-structured plan with stated rationale is the plan doing its job, not adversarial signal — activating on that alone re-litigates settled questions.

## Announce the review team

Before dispatch, tell the user in one or two sentences which reviewers will run, giving each conditional one a reason of a few words. When the cross-model pass runs, its disclosure from `references/cross-model-review.md` goes in the same message. For example:

```
Reviewing with coherence, feasibility, scope-guardian (12 requirements across 3 priorities), and security-lens (new public API with auth).
```

While reviewers run, do not post an update as each one returns or narrate which reference you are reading next. Speak again when the results are ready, or earlier only when a reviewer fails or a wait runs unusually long.

The team is `coherence-reviewer` and `feasibility-reviewer` always, plus each activated conditional persona (`product-lens-reviewer`, `design-lens-reviewer`, `security-lens-reviewer`, `scope-guardian-reviewer`, `adversarial-document-reviewer`).
