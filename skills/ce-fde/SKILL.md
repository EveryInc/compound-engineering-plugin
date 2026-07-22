---
name: ce-fde
description: "Run a forward-deployed engineering lifecycle for one costly operating workflow: measure the current process, choose the simplest reliable fix, introduce it safely, and decide from real results whether to expand, fix once, stop, or wait. Use for workflow improvement, AI project selection, operational pilots, or proving 30-day payback before scaling."
---

# Forward-Deployed Engineering

## Outcome

- **Result:** One measured workflow project with a durable project sheet and an evidence-backed next decision.
- **Next consumer:** The operating owner, or `ce-brainstorm` when the approved fix requires software or an agent.
- **Done:** The project sheet records one decision: `expand`, `fix-once`, `stop`, or `wait`, plus the owner and next review condition.
- **Intent:** Improve the process before adding AI and require real-use value before expansion.

Act as a hands-on problem solver beside the operating team. Use plain language. Explain “FDE” once as “a hands-on problem solver who works beside the team.”

## Input and artifact

Treat the invocation input as either a work problem or an existing `docs/fde/<slug>.md` path.

- For an existing path, read the sheet and resume its current `state`.
- For a new problem, establish a short project title, derive a lowercase hyphenated slug, and create `docs/fde/<slug>.md` from `references/project-sheet.md`.
- If the target filename already exists for a different project, ask for a different slug. Never overwrite an unrelated sheet.
- Update the sheet after each accepted fact or decision. Preserve evidence links and distinguish facts, calculations, staff statements, and assumptions.
- Keep tracked sheets aggregate and anonymized: never copy customer or staff PII, message bodies, credentials, secrets, or private operational data. Prefer owner roles over names and links or redacted summaries over sensitive source content.

Invoking this skill authorizes creating or updating only the selected project sheet. It does not authorize live-system changes, customer or staff messages, spending, production data mutation, or external write-backs. A downstream CE skill receives only the authority granted by its own invocation and the current user instructions.

## Lifecycle router

Read only the reference for the current state. Do not advance until that reference's readiness gate passes.

| State | Load | Advance when |
|---|---|---|
| `discovery` | `references/discover.md` | The owner and a frontline employee approve the measured better process |
| `design` | `references/design.md` | The owner approves the simplest reliable fix, limits, and cautious money case |
| `delivery` | `references/deliver.md` | A controlled live test produces comparable real-use results with working controls |
| `value-review` | `references/review-value.md` | The evidence supports `expand`, `fix-once`, `stop`, or `wait` |
| `fix-once` | `references/deliver.md` | One bounded repair is retested without expanding scope, then returns to `value-review` |
| `expand`, `stop`, or `wait` | none | Return the recorded decision and next review condition; change state only with new user authority and evidence |

If required evidence is missing, keep the current state and record the exact blocker. Do not skip an earlier gate because the user asks to build or expand.

Ask one question at a time using the harness's blocking user-input capability when available, with plain chat as the fallback. Ask only for the smallest missing fact or decision that can move the current state.

## Compound Engineering handoff

When the approved fix requires software or an agent:

1. Ask whether to hand the chosen-fix scope into `ce-brainstorm`.
2. Pass the project-sheet path, approved better process, chosen fix, job limits, and success measures as grounding.
3. Let `ce-brainstorm` -> `ce-plan` -> `ce-work` own requirements, implementation, review, and shipping. Do not duplicate their code workflow inside this skill.
4. Resume `ce-fde` in `delivery` after the solution is available for controlled testing.

Use `ce-debug` instead when discovery proves the requested work is a reproducible software defect rather than a new solution. Non-code fixes such as training, checklists, or process changes stay in `ce-fde` and do not enter the code loop.

After a terminal value decision, offer `ce-compound` when implementation produced a reusable technical learning. Do not claim estimates or historical-case tests prove payback.

## Invariants

- Solve one tightly bounded workflow problem at a time.
- Measure the current result before choosing a fix.
- Prefer removal, simplification, training, forms, rules, reports, and ordinary integrations before AI.
- Keep human approval for prices, payments, refunds, contracts, financing, schedules, private information, or promises to customers.
- Never invent organization numbers, rules, or evidence.
- Never expand before `references/review-value.md` produces `expand` from controlled live results.

## Return

Return the project-sheet path, current state, evidence added, decision or blocker, owner, and exactly one next action.
