# `ce-prototype`

> Build a throwaway prototype of the product so someone can try it and decide how it should work or feel, then write those decisions into an existing plan or continue into brainstorm or plan.

`ce-prototype` is the **experience** skill. It grounds in the current repo and whatever conversation or artifact already exists, works out which questions can only be answered by using something, builds for the one that would be most expensive to get wrong, and keeps going until the user applies what they decided. `ce-brainstorm` offers it when committing an approach would be expensive to unravel. `ce-plan` offers it at handoff when a remaining question still has to be used, not inspected.

It sits between a display-only visual probe and late-stage polish: more real than a sketch, earlier than a working feature.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Works out which questions can only be answered by using something, builds a throwaway prototype, waits for the user to try it, then writes the decisions into an existing Product Contract or hands off to `ce-brainstorm` / `ce-plan` |
| When to use it | A decision is expensive to unravel and has to be used, not inspected — how finished the prototype gets scales to that question |
| What it produces | Decisions in the existing plan, markdown or HTML, or a session handoff into brainstorm or plan. No new document type. |
| What's next | `ce-plan` after write-back (the plan is `requirements-only` again), or `ce-brainstorm` / `ce-plan` after a file-free run |

---

## Example invocations

```text
# Named question, no plan file yet
/ce-prototype vertical hamburger nav with animation instead of the current horizontal nav

# Grounded in an existing plan
/ce-prototype docs/plans/2026-08-12-1430-feat-reading-queue-plan.md

# Accepted from a brainstorm or plan handoff
/ce-prototype
```

---

## The Problem

Requirements and plans can name an outcome. They cannot say how something should work or feel until someone uses it — and settling that in conversation quietly commits a lot of behavior that later planning and code will treat as given. People already reach for a quick prototype by asking an agent to make one, then rewrite the requirements and the plan once they have decided. That rewrite is not the problem. What is missing is picking which question to build for, matching how finished the prototype gets to that question, a natural place to offer the step, and a write-back the other skills can pick up.

---

## The Solution

`ce-prototype` grounds first, asks only when the question or the constraints are too thin, works out which questions have to be answered by using something, and builds for the one that would be most expensive to get wrong.

- Competing options sit on one surface, so they can be judged against each other.
- After each action or change of option, the relevant state is visible, so you can see what changed.
- It never marks a question answered on its own judgment — it waits for you to use the thing and choose.
- After you decide, it works out what is still worth building for, and says what changed before building the next one. A decision often answers a later question too, makes one pointless, or turns up one nobody had listed.
- If what you decide changes what you want to build rather than answering the question, it stops and hands back what it learned instead of building on.
- With nobody there to try the prototype — an unattended or pipeline run — it stops rather than inventing how something should feel.
- When a related plan exists, decisions land in that file's Product Contract, in whichever format it uses. An implementation-ready plan is downgraded to `requirements-only` and its HOW sections are stripped, so `ce-work` cannot ship the old HOW.
- When no related file exists, it does not mint a plan. It recaps the decisions and recommends `ce-brainstorm` or `ce-plan` from the session.

---

## What Makes It Novel

### Picking the question before building

The skill names what still has to be decided by using it — or takes the question you named — and builds only for that. A visual-probe question you already judged is not rebuilt. It re-works that list after every decision rather than marching the one it started with, so the order follows what you have learned.

### How finished it gets matches the question

How finished the prototype gets follows this question, not a setting for the session. Button placement stays cheap. A control you have to operate, motion, a transition, or a flow you move through gets rich enough to actually drive. Density or chrome on an existing page may need a throwaway overlay in the real app. The default is a scratch prototype — not the full product, and not a seed for production code.

A **narrow** question (this control vs that one) stays a close comparison of two or three variants. A **wide** question (make this more fun to use) names three to five genuinely different mechanisms first, then narrows by using them. The skill does not invent a wild alternative for a one-detail question, and it does not answer a wide question by building a single idea.

### Write-back into the existing artifact

Decisions update the Product Contract in the plan you already have. They do not become a third kind of note. After write-back, `ce-plan` re-enriches HOW.

---

## When to Reach For It

Use `ce-prototype` when:

- Committing an approach now would encode substantial behavior that later planning and code will treat as given.
- You cannot decide how something should work or feel from a requirements doc, a plan, or a cheap sketch.
- You want to compare competing options on one surface, or explore an open space — look, flow, or state — before picking.
- One prototype answered its question and the next related question still has to be used to be decided.

Skip it when:

- The question is a display-only shape decision during brainstorm → visual probes
- The feature already works and you are refining it → `/ce-polish`
- You are ready to implement → `/ce-plan` then `/ce-work`

---

## Chain Position

`ce-prototype` is an on-demand insert, not a required pipeline stage.

```text
/ce-brainstorm  →  /ce-prototype (optional)  →  /ce-plan
/ce-plan        →  /ce-prototype (optional)  →  /ce-plan (re-enrich)  →  /ce-work
```

Standalone prompt-only runs stay file-free and continue into `ce-brainstorm` or `ce-plan`.

---

## See Also

- [`/ce-brainstorm`](./ce-brainstorm.md) — offers a prototype when committing an approach would be expensive to unravel
- [`/ce-plan`](./ce-plan.md) — offers the same insert; re-enriches HOW after write-back
- [`/ce-polish`](./ce-polish.md) — late-stage polish on a feature that already works
