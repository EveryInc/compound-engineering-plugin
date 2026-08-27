# `ce-prototype`

> Build a throwaway prototype so someone can experience how the product should work, feel, or read, then write those decisions into an existing plan or continue into brainstorm or plan.

`ce-prototype` is an on-demand **experience** skill, not a step in the core loop. Use it when committing the wrong answer would be expensive to unravel and neither talk nor a cheap sketch can settle it.

It grounds in the current repo and whatever conversation or artifact you already have, names the questions only a real artifact can settle, and builds for the one that would be most expensive to get wrong. One rule: do not fake the dimension being tested. A flow or state model is settled by driving it. A layout or a mark is settled by seeing it at real finish. Your perception settles the question, not the agent's judgment of the artifact.

It sits between a rough one-decision visual probe (those live in `ce-brainstorm`) and late-stage polish (`ce-polish`). More finished than a sketch, earlier than a working feature. It does not decide *what* to build; that is `ce-ideate` or `ce-brainstorm`.

`ce-brainstorm` and `ce-plan` both offer this insert on the same test: committing the wrong answer would be expensive to unravel, and neither talk nor a cheap sketch can settle it.

A person has to experience the prototype. On LFG, `mode:pipeline`, or any unattended run, the skill stops.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Picks the question only a real artifact can settle, builds a throwaway prototype at the fidelity that question needs, waits for you to try it, then writes the decisions back or hands off |
| When to use it | The decision is expensive to unravel, and talk or a cheap sketch cannot settle it, whether you settle it by driving the artifact or by seeing it finished |
| What it produces | A kept prototype (unless the run was a throwaway overlay), a `decisions.md` capsule in the run directory, and either Product Contract edits in a related plan or a recap plus a next-skill recommendation. No new plan type. |
| What's next | `ce-plan` after write-back (the plan is `requirements-only` again), or `ce-brainstorm` / `ce-plan` after a file-free run |

---

## Example invocations

Named questions can be a flow, a state model, a visual direction, or a close comparison. Passing a plan or brainstorm path makes that file the write-back target.

```text
# Wide: how this surface should work, no mechanism chosen yet
/ce-prototype make the reading queue more fun to use

# Drive a flow and state model conversation cannot settle
/ce-prototype checkout as guest vs account, including save-for-later and a failed payment

# See a visual direction at real finish, not as a sketch
/ce-prototype a brand lockup and type system for the marketing site, dense enough to judge

# Whole-product feel, not one page
/ce-prototype how the app should feel to navigate from first open through the main loop

# Density and chrome on a live page (throwaway overlay, undone when the try ends)
/ce-prototype whether the settings page can hold denser chrome without becoming unreadable

# Narrow: one control vs another, still expensive to reverse once coded
/ce-prototype vertical hamburger nav with animation instead of the current horizontal nav

# Ground in this plan, pick the feel-question that would be most expensive to
# get wrong, and build that. When you apply, decisions write into this file's
# Product Contract. An implementation-ready plan is set back to
# requirements-only and its HOW sections are removed, so ce-work cannot ship
# the old HOW; run ce-plan again to re-enrich.
/ce-prototype docs/plans/2026-08-12-1430-feat-reading-queue-plan.md

# Same write-back against a brainstorm artifact
/ce-prototype docs/plans/2026-08-10-reading-queue.md

# Infer from this conversation, or accept a brainstorm/plan handoff
/ce-prototype
```

---

## The Problem

Requirements and plans can name an outcome. They cannot say how something should work, feel, or read until someone experiences it. Settling that in conversation quietly commits a lot of behavior that later planning and code will treat as given.

People already ask an agent to mock something up, then rewrite the requirements once they have decided. The rewrite is fine. What is missing is picking which question to build for, matching finish to that question, a natural place to offer the step, and a write-back the other skills can pick up.

## The Solution

`ce-prototype` grounds first and asks only when the question or the constraints are too thin. It names the questions only a real artifact can settle and builds for the costliest one.

- Competing options sit on one surface so they can be judged together.
- After each action or option change, the relevant state is visible.
- It never marks a question answered on its own judgment. It waits for you to experience the thing and choose.
- After you decide, it re-lists what is still worth building and says what changed before the next one. A decision often answers a later question, kills one, or turns up one nobody had listed.
- If what you decide changes *what you want to build* rather than answering the question, it stops and hands back what it learned.
- With nobody there to try it, it stops rather than inventing how something should feel.
- Before it builds, it asks for a go-ahead: what it will try, why, and how the work is split.
- When a related plan exists, decisions land in that file's Product Contract (markdown or HTML). An implementation-ready plan is downgraded to `requirements-only` and its HOW sections are stripped, so `ce-work` cannot ship the old HOW.
- When no related file exists, it does not mint a plan. It recaps the decisions and recommends `ce-brainstorm` or `ce-plan` from the session.

---

## What Makes It Novel

### Picking the question before building

The skill names what still has to be decided against a real artifact, or takes the question you named, and builds only for that. A visual-probe question you already judged is not rebuilt. It re-works that list after every decision rather than marching the one it started with.

### How finished it gets matches the question

How finished the prototype gets follows this question, not a setting for the session. Throwaway constrains durability, not finish: unmaintained and unshipped, so nothing is tested, abstracted, or hardened past runnable, but finish goes as far as the dimension under test needs. Button placement stays cheap. A control you operate, motion, a transition, or a flow you move through gets rich enough to drive. A visual direction (a mark, a type system, a layout at real density) gets finished enough to judge, because rough would strip the thing being judged. Within one wide question, avenues can differ. Density or chrome on an existing page may need a throwaway overlay in the real app; that overlay is undone when the try ends and leaves no kept artifact.

The default is a scratch prototype, not the full product and not a seed for production code, left in place when the run ends so later implementation can read it next to the decisions.

The substrate defaults to the web, whatever the product is written in. A native app's navigation feel gets a web approximation, not SwiftUI. That yields in two cases only: you name a technology, or the dimension under test cannot be rendered in a browser without faking it. The skill says which it picked before building.

A **narrow** question (this control vs that one) stays a close comparison of two or three variants. A **wide** question (make this more fun to use) names three to five genuinely different mechanisms first, then narrows by using them. The skill does not invent a wild alternative for a one-detail question, and it does not answer a wide question by building a single idea.

### A floor under the thing you are judging

On a question settled by seeing (a layout, a type system, a mark, density) the render itself can produce the wrong answer. Text you cannot read, or a control with no visible focus, gets read as "that direction is worse" when the direction was never the problem. So a seeing question loads a craft floor: measurable thresholds for contrast, line measure, spacing rhythm, real states, and keyboard focus; one authored motion moment instead of scattered effects; and copy that names actions and recoveries. It applies only the items the question's dimensions actually reach. A placement question does not acquire an empty state because the floor lists one.

Cleanliness is not enough. A surface can clear every threshold and still be a template: the arrangement any product would get for any subject. Avenues have to differ by organizing principle. A palette or typeface swap over one arrangement is one avenue shown twice.

### Where the prototype lives

The prototype stays on disk. It lands in `.context/compound-engineering/ce-prototype/<date>-<slug>/`, gitignored, not committed, so it is still openable next week when implementation reads it. Each question in a run gets its own directory beneath that, and the capsule names them, so a second question cannot bury the first one's winner. If `.context/compound-engineering/` is not already ignored, the skill offers to append that one line. Decline it, or run outside a git repository, and it falls back to OS temp, where survival is best-effort. Nothing is deleted for you. The directory is yours to prune.

The run also writes `decisions.md` in that run directory: the question, what was built, which screen sits in which directory, what won and why, what was rejected, stated adjustments that were not in the prototype, and what is still open. That capsule is continuity for the next skill, not a plan.

### Write-back into the existing artifact

Decisions update the Product Contract in the related brainstorm or plan you already have. They do not become a third kind of note. After write-back, `ce-plan` re-enriches HOW. If relatedness is unclear, the skill recaps in chat instead of guessing a file.

---

## When to Reach For It

Use `ce-prototype` when:

- Committing an approach now would be expensive to unravel. Later planning and code will treat it as given.
- Neither talk nor a cheap sketch can settle it. A question turning on finish or motion is already past the sketch tier, because rough strips those dimensions.
- You want to compare competing options on one surface, or explore an open space (look, flow, or state) before picking.
- One prototype answered its question and the next related question still needs an artifact to be decided.

Skip it when:

- A rough one-decision sketch can settle the question during brainstorm, or the decision is cheap to reverse however visual it is → visual probes in `/ce-brainstorm`
- You are still deciding *what* to build → `/ce-ideate` or `/ce-brainstorm`
- The feature already works and you are refining it → `/ce-polish`
- You are ready to implement → `/ce-plan` then `/ce-work`
- Nobody will be there to try the prototype → do not invoke this in LFG or pipeline mode

---

## Chain Position

`ce-prototype` is an on-demand insert, not a required pipeline stage.

```text
/ce-brainstorm  →  /ce-prototype (optional)  →  /ce-plan
/ce-plan        →  /ce-prototype (optional)  →  /ce-plan (re-enrich)  →  /ce-work
```

Standalone prompt-only runs stay file-free and continue into `ce-brainstorm` or `ce-plan`. Stay in this skill for the next *related* question that still needs an artifact. Do not bounce out while that list is open, and do not start an unrelated campaign.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Uses this conversation. Asks only if it cannot tell what to try. |
| `<prompt>` | Named question: a flow, a state model, a visual direction, whole-product feel, or a close comparison |
| `<brainstorm or plan path>` | Grounds in that file and builds for the costliest unsettled feel-question. Applying writes the Product Contract in that file (and downgrades an implementation-ready plan to `requirements-only`). |
| Unattended / LFG / `mode:pipeline` | Stops. This skill needs a human. |

---

## FAQ

**How is this different from a visual probe in `ce-brainstorm`?**
A visual probe is a rough, display-only sketch for a one-decision question you can judge in chat. Use `ce-prototype` when the question turns on finish, motion, or behavior you have to drive, or when a sketch was built and failed to settle it.

**Does it become the real feature?**
No. The prototype is throwaway: unmaintained and unshipped. A scratch prototype is kept so implementation can read it. An overlay on the real app is undone when the try ends.

**What happens to an existing plan when I apply?**
Decisions land in that file's Product Contract. If the plan was `implementation-ready`, it is set back to `requirements-only` and its HOW sections are removed so `ce-work` cannot ship the old HOW. Then `ce-plan` re-enriches.

**Can it run unattended?**
No. If there is no person to experience the prototype, the skill stops and does not invent how something should feel.

---

## See Also

- [`/ce-brainstorm`](./ce-brainstorm.md): offers a prototype when committing an approach would be expensive to unravel; also owns cheap visual probes
- [`/ce-plan`](./ce-plan.md): offers the same insert; re-enriches HOW after write-back
- [`/ce-ideate`](./ce-ideate.md): discover *what* is worth exploring; this skill answers how a chosen direction should work or feel
- [`/ce-polish`](./ce-polish.md): late-stage polish on a feature that already works
