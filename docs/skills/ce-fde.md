# `ce-fde`

> Improve one costly operating workflow, choose the simplest reliable fix, introduce it safely, and decide from real results whether to expand, fix once, stop, or wait.

`ce-fde` adds a business-outcome loop around the Compound Engineering code loop. It starts with observed work and a measurable baseline, not a feature request. If the approved fix requires software or an agent, it hands the bounded scope to `ce-brainstorm` -> `ce-plan` -> `ce-work`, then resumes after shipping to control the live test and value decision.

## TL;DR

| Question | Answer |
|---|---|
| What does it do? | Runs discovery, fix selection, controlled delivery, and value review for one workflow |
| When to use it | Workflow improvement, operational automation, AI project selection, or a pilot that must prove payback |
| What it produces | A durable `docs/fde/<slug>.md` project sheet with evidence, state, owner, controls, and decision |
| What's next | `ce-brainstorm` for approved software work; `ce-compound` after a terminal decision with reusable technical learning |

## Why it sits around the loop

The core CE loop answers how to define, implement, review, and learn from software work. `ce-fde` answers an earlier and broader question: which operating problem is worth solving, what is the simplest intervention, and did the deployed change create enough real value to expand?

```text
ce-fde discovery -> ce-fde design
                         |
                         +-> non-code fix -> ce-fde delivery
                         |
                         +-> ce-brainstorm -> ce-plan -> ce-work
                                                     |
                                                     +-> ce-fde delivery

ce-fde delivery -> ce-fde value review -> expand | fix-once | stop | wait
```

The handoff is optional. Training, checklists, deterministic rules, and process changes do not enter the code loop merely because CE is installed.

## Novel mechanics

### A durable business artifact

Each project writes one `ce-fde-project/v1` sheet under `docs/fde/`. The sheet separates facts, calculations, staff statements, and assumptions; records the current lifecycle state; and lets later sessions resume at the earliest incomplete gate.

### Process before AI

Fixes are considered in an explicit order: remove or simplify work, improve training and data capture, use deterministic rules and ordinary integrations, then use AI only for the remaining judgment or unstructured input. “No AI needed” is a successful result.

### Expansion is a measured gate

Historical cases prove whether a solution can work; they do not prove business value. Expansion requires controlled live results, comparable exposure, non-degraded quality, contained failures, positive monthly value, and payback within 30 days.

### Bounded authority

Invoking `ce-fde` authorizes only the project-sheet write. Production changes, external messages, spending, and customer-impacting actions retain the approval rules of the active harness and any downstream skill.

## Example invocations

```text
/ce-fde Our support team retypes emailed requests into the CRM
/ce-fde docs/fde/support-intake.md
```

The first form creates a new project sheet after establishing the project title. The second resumes an existing project from its recorded state.

## When to reach for it

Use `ce-fde` when:

- A team asks for an AI agent before the current workflow has been measured.
- An operating process is expensive, slow, error-prone, or fragmented across tools.
- A pilot needs explicit human approvals, fallback, monitoring, and an off switch.
- Leadership needs a real payback decision rather than estimated savings.

Skip it when:

- The input is already a bounded feature with approved requirements -> use `ce-brainstorm`.
- The input is a reproducible software defect -> use `ce-debug`.
- The only need is a time-windowed product health report -> use `ce-product-pulse`.

## See also

- [`ce-strategy`](./ce-strategy.md) - durable product direction and metrics
- [`ce-brainstorm`](./ce-brainstorm.md) - requirements for the approved software fix
- [`ce-work`](./ce-work.md) - implementation and shipping
- [`ce-product-pulse`](./ce-product-pulse.md) - product telemetry that may support a live test
- [`ce-compound`](./ce-compound.md) - reusable technical learning after the cycle
