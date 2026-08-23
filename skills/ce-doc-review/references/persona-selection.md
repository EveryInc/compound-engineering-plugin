# Selecting the review team

The team is `coherence-reviewer` and `feasibility-reviewer` always, plus each conditional persona whose signals the document shows.

Activate a conditional persona when the document shows its signals:

**product-lens** — the document stakes a product position — what to build, why, or what comes first — that a knowledgeable stakeholder could reasonably challenge and that no upstream Product Contract settled, or the work carries strategic weight beyond the immediate problem. Users may be end users, developers, operators, maintainers, or any other audience; the criteria are domain-agnostic. Either leg qualifies:

- *Unsettled product position* — a problem framing, a goal predicting a specific user outcome, or a prioritization that ranks what gets built against what is deferred, which the document's origin did not already settle. A choice among mechanisms for an agreed outcome is an implementation decision, not a product position; describing a task or restating known requirements stakes nothing.
- *Strategic weight* — the work could affect trajectory, perception, or positioning even with a sound premise: it shapes what the system becomes known for; it is a complexity or simplicity bet affecting adoption, onboarding, or cognitive load; it opens or closes future directions (path dependencies, architectural commitments); it carries opportunity cost — building this means not building something else.

**design-lens** — UI/UX references, frontend components, or visual design language; user flows, wireframes, screen/page/view mentions; interaction descriptions (forms, buttons, navigation, modals); responsive behavior or accessibility.

**security-lens** — auth/authorization, login flows, session management; API endpoints exposed to external clients; handling of **sensitive** data — PII, payments, tokens, credentials, secrets, encryption; third-party integrations with trust-boundary implications. Ordinary data handling is not a trigger, and neither is storage-layer churn on its own: an internal schema migration, field rename, or data-store move activates this lens only when the data is sensitive or the change alters who can read or write it. Deployment-ordering risk is a feasibility concern, not a security signal.

**scope-guardian** — multiple priority tiers (P0/P1/P2, must/should/nice-to-have); >8 distinct requirements or implementation units; stretch goals, nice-to-haves, or "future work" sections; scope boundary language misaligned with stated goals; goals that don't clearly connect to requirements.

**adversarial** — a high-value challenge surface, not merely structural complexity. Activate when ANY holds:

- A **requirements document** with 2+ challengeable claims (problem framing, solution selection, prioritization, predicted outcomes) — premise scrutiny is core to the brainstorm phase
- A **high-stakes domain** — auth, payments, billing, data migrations, privacy/compliance, external integrations, cryptography — regardless of doc type or size
- A **new abstraction, framework, or significant architectural pattern**, regardless of doc type
- A **plan with no validated upstream Product Contract signal** (no legacy `origin:` requirements doc and no `product_contract_source: ce-brainstorm` or `legacy-requirements`) — the premise wasn't validated upstream
- A **plan that explicitly extends scope** beyond its origin requirements doc (new actors, new flows, deferred-then-restored features)
- An **explicit alternatives section** or unresolved tradeoffs — adversarial helps stress-test the chosen direction

Do NOT activate adversarial on a routine plan that derives from a validated upstream Product Contract, stays in scope, and introduces no high-stakes domain or new abstraction. Validated provenance includes legacy `origin: docs/brainstorms/...`, `product_contract_source: ce-brainstorm`, and `product_contract_source: legacy-requirements`; a direct `product_contract_source: ce-plan-bootstrap` plan is greenfield and does not suppress premise-level techniques by itself. A well-structured plan with stated rationale is the plan doing its job, not adversarial signal — activating on that alone re-litigates settled questions.

## Announce the review team

Tell the user which personas will review and why, with a justification for each conditional one:

```
Reviewing with:
- coherence-reviewer (always-on)
- feasibility-reviewer (always-on)
- scope-guardian-reviewer -- plan has 12 requirements across 3 priority levels
- security-lens-reviewer -- plan adds API endpoints with auth flow
```

The team is `coherence-reviewer` and `feasibility-reviewer` always, plus each activated conditional persona (`product-lens-reviewer`, `design-lens-reviewer`, `security-lens-reviewer`, `scope-guardian-reviewer`, `adversarial-document-reviewer`).
