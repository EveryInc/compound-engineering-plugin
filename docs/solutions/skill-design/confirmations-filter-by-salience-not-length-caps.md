---
title: "Pre-write confirmations: filter by salience to the artifact, not by length caps"
date: 2026-09-30
category: skill-design
module: skills/ce-brainstorm, skills/ce-plan
problem_type: design_pattern
component: development_workflow
severity: high
applies_when:
  - A skill shows the user a pre-write confirmation or summary that runs long or gets rubber-stamped
  - Tempted to fix an overlong user-facing output by adding word, bullet, or screen caps
  - Deciding which decisions a confirmation should name versus leave to the written doc or plan
  - Rendering carried-forward or settled decisions in a scoping synthesis
  - Writing a worked example into skill prose that illustrates an output rule
symptoms:
  - Brainstorm confirmation ran 620 words and 18 bullets on an ambitious scope
  - Carrying-forward lines restated decisions the user made in the same dialogue
  - Explicit word and bullet caps did not move Claude output length
  - Brainstorm-sourced plan confirmations leaked implementation mechanism once salience alone governed
tags: [skill-design, ce-brainstorm, ce-plan, scoping-synthesis, salience, proxy-rule, settled-decisions, skill-eval]
---

# Pre-write confirmations: filter by salience to the artifact, not by length caps

## Context

`ce-brainstorm` and `ce-plan` show the user a scoping synthesis in chat before they write their document. The user confirms it or corrects it, and the confirmed version feeds the doc.

The contract from PRs #819 and #829 (May 2026) grew out of an earlier problem: chat output had turned into a 15-20+ bullet audit that users approved without reading. The fix at the time was a Stated/Inferred/Out internal draft plus a set of length controls: bullet caps scaled by tier (up to 9 on Deep-product), a keep test for each section, detail tests, bad/good tables, anti-pattern lists, and a pre-flight re-review. The HEAD copy of `skills/ce-brainstorm/references/synthesis-summary.md` says "The cap is heuristic, not law" and "Above the hard ceiling, the synthesis is misshapen — do not raise the cap, re-cut at a higher level of abstraction."

The change that added this doc rewrites Stage 2 as a goal and swaps the length controls for content rules. Gate logic (Path A/B tier guard, Lightweight auto-proceed, `SKIP_SCOPING_CONFIRM`), the revision loop, soft-cut, headless routing, and doc routing did not change. Several attempts failed along the way, and those failures are the part a future editor is most likely to repeat.

## Guidance

When a confirmation reads long, do not add a word or bullet cap. Fix the rule that decides what goes in. The current text rests on four rules.

**1. Lead with understanding, not recall.** The synthesis opens with the problem in the agent's own words. `skills/ce-brainstorm/references/synthesis-summary.md:31` states the goal: "Its job is to let the user check, in one read, whether you understood them" and "Show what you understood and what you assumed, not what the user said. Replaying their answers back ("you said X, then you said Y") shows recall rather than understanding, and they just lived through it."

The first section (line 35) is "**The problem** — 1–2 sentences, as prose: who has the problem, what it costs them now, and what will be true when it is solved. State the goal behind the request, not the feature restated. When the user never said why, say what you inferred so they can correct it." The ce-plan solo shape has the same section (`skills/ce-plan/references/synthesis-summary.md:40`). The brainstorm-sourced plan shape does not restate the problem, because the brainstorm already confirmed it: "The brainstorm already confirmed the problem and the WHAT; do not restate them" (line 46). It uses a one-sentence anchor and the plan-specific scope instead.

**2. Filter by salience to the artifact, not by length.** From ce-brainstorm line 40: "Include only what the user needs to know to judge whether the requirements are right: your understanding of the problem and the shape, and the decisions or assumptions that would change what gets built if they were wrong. Everything else belongs in the doc. A larger scope means naming those decisions at a higher level, not adding lines." ce-plan line 57 says the same thing about the plan ("whether the plan is aimed right ... Everything else belongs in the plan"). Neither file contains a word count or bullet count.

**3. Describe the shape in prose, and keep Carrying-forward for decisions from outside the skill.** "What we're building" (ce-brainstorm line 36) and "Scope claim" (ce-plan line 41) are prose. ce-brainstorm says "Say what the thing is and how it holds together, not the requested features listed back"; ce-plan says "Describe what the plan targets as a whole, not the requested features listed back." Carrying-forward lines cover only decisions made before the skill started. ce-brainstorm line 37: "Decisions the user made in this skill's own dialogue get no line; the shape already reflects them." ce-plan line 54: "Answers given in this skill's own questions get no line, and neither do decisions already recorded in an upstream brainstorm, which the user confirmed there." The shared protocol in `skills/ce-plan/references/settled-decisions.md:38` (byte-identical in ce-brainstorm, enforced by `tests/settled-decisions-parity.test.ts`) now reads: "one carried in from before the skill started renders as a "Carrying forward:" line, and one the user made in the skill's own dialogue is reflected in the stated shape instead." At HEAD it said every settled decision "renders as a "Carrying forward:" line", and that sentence caused the replay described below.

**4. Name effects, not mechanisms (ce-plan).** `skills/ce-plan/references/synthesis-summary.md:56`: "Name each decision by its effect on what the user gets, not by its mechanism ("a rerun can't charge an invoice twice", not "idempotency keys")."

**Worked examples must follow their own rules.** Agents copy examples more closely than they follow prose. An example that breaks a rule teaches the agent to break it.

## Why This Matters

Per this session's judged evals (`bun run test:skill-eval-judge`, a simulated user persona with hidden needs, a blind grader, Claude and Codex, before vs. after the change), these approaches failed before the current text worked:

- **A per-section limit plus "use bullets for any list".** The first rewrite kept an "about five call-outs" limit. On an ambitious dunning scope it produced a 620-word, 18-bullet brainstorm confirmation. Seven of those bullets were Carrying-forward lines restating decisions the user had just made in the same dialogue, and "What we're building" came out as a bulleted feature list. The cause was the settled-decisions protocol, which rendered every settled decision as a Carrying-forward line and counted every in-dialogue choice as settled. The bullets instruction made it worse.
- **Explicit caps.** "Under about 250 words and about seven bullets" did not control Claude. Its output sat around 370 words with or without the cap. The user also rejected length as the governing idea: the goal is a confirmation that communicates well and reads easily, not one that hits a count. "Fits on one screen" was rejected too, because a screen means different things on desktop and mobile.
- **Loose filters.** "Every line should tell them something they would want to confirm or correct" let every restated feature through. "Surfaces something you decided or assumed" was also too loose, since an agent decides hundreds of things.
- **Salience alone.** On brainstorm-sourced plans, Claude's needs-code items rose from 2 to 6 (Stripe idempotency keys, Kubernetes CronJob concurrency, wrapper changes, test fakes). Mechanism does change the plan, so it passed the salience test. Adding the effect-not-mechanism sentence brought the count to 1 in a 4-conversation check.
- **A self-contradicting example.** A cross-model panel (a `ce-pov` oracle with Codex and Grok) noticed that the worked example said "per-channel" in both the shape and a call-out, which broke the example's own "leave out what the prose already says" rule.

Results after the change (graded totals, 2 trials per cell unless noted):

- ce-plan solo, nightly charging job (run 1): problem stated went from 0/3 to 4/4. Confirmations the user had to correct went from 3/3 to 0/4.
- Final run, problem stated where intended: brainstorm dunning 2/4 -> 4/4, ce-plan solo dunning 0/4 -> 4/4, solo job 1/4 -> 3/4. The brainstorm-sourced plan is 0 by design. Noise items fell (brainstorm dunning 26 -> 13), needs-code items reached 0 on brainstorm and solo dunning, and the one-read score rose in 3 of 4 scenarios.
- On solo dunning, both Claude post-change confirmations stated a bet (that "retry now" waits on the pre-charge email), and the user corrected it before research began. That is the checkpoint doing its job by surfacing a hidden need. No pre-change run surfaced it.

The fewer corrections came from stating the problem, not from shortening the output. Replaying the user's answers was the low-value part, and it was also what made the output long.

Watch item: on the brainstorm-sourced path, Codex confirmations are terse (about 115 words), and one of them missed "voided invoices must not be charged". Pre-change runs missed it as well.

## When to Apply

- Editing Stage 2 of either `synthesis-summary.md`, the "Never re-ask" line in either `settled-decisions.md`, or the call sites (`skills/ce-brainstorm/references/approaches.md`, `skills/ce-plan/references/intake.md`, `skills/ce-plan/references/final-review.md`).
- Responding to feedback or an eval that says the confirmation is too long, too detailed, or too technical. Look for which content rule let the extra lines in (replay, mechanism, restated features, in-dialogue decisions rendered as Carrying-forward) and tighten that rule.
- Any other skill with a user-facing checkpoint that summarizes before acting. The same approach applies there: lead with what the agent understood and filter by what the user needs to judge the output.
- Adding or changing a worked example in skill prose. Check it against every rule in the section it illustrates.

## Examples

**Carrying-forward replay (illustrative, based on the failed first rewrite).** Before, each choice the user made in the brainstorm's own dialogue came back as a line:

```
Carrying forward: email reminders over SMS — you said customers ignore texts.
Carrying forward: three retries over five — you picked three.
Carrying forward: pause the account after final failure over cancel — your call.
...
What we're building:
- Retry schedule
- Reminder emails
- Account pause
```

After, those choices appear inside the shape prose and get no Carrying-forward lines:

```
**The problem:** <who loses money or time to failed payments today, and what is true once it is solved>

**What we're building:** <one to three sentences saying what the dunning flow is and how the retries, emails, and pause fit together>

**Call outs:**
- <a bet or consequence the user has not seen stated>
```

**Mechanism vs effect (ce-plan).** The failing brainstorm-sourced confirmations had call-outs like "Use Stripe idempotency keys on the charge call" and "Set the CronJob to forbid concurrent runs". The effect version names what the user gets: "a rerun can't charge an invoice twice". The shipped solo example (`skills/ce-plan/references/synthesis-summary.md:101`) does this: "I'm treating "never charge twice for one invoice" as a hard requirement, including when a run is retried".

**Problem in the agent's own words.** From the ce-brainstorm example (line 55): "The support team gets paged at 3 AM by noisy channels they can't act on until morning, and today the only fix is deleting the rule." It says who is affected, what it costs them, and what they do today. It does not restate the request "add per-channel mute", and the shape line that follows is the only place "per-channel" appears.

## Related

- `docs/solutions/skill-design/portable-agent-skill-authoring.md` — the standard's length-control rule (name what short output must preserve; no brevity slogans). This case extends it: numeric caps are not a length control either.
- `docs/solutions/skill-design/state-the-condition-not-a-placement-absolute.md` — the same move: audit the property the output exists to have, not a countable proxy.
- `docs/solutions/skill-design/subordinate-the-failing-shape-to-the-condition.md` — why the effect-not-mechanism sentence names a concrete failing shape under the salience condition.
- `docs/solutions/skill-design/paired-old-vs-new-injection-skill-evals.md` — the pre/post eval method used here.
- `docs/plans/2026-07-14-001-feat-session-settled-decisions-plan.md` — origin of rendering every settled decision as a Carrying-forward line, now scoped to decisions from outside the skill's own dialogue.
- GitHub #1423 — the same outcome-over-mechanism drift in the Goal Capsule objective.
