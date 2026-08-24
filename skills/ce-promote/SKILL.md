---
name: ce-promote
description: "Draft launch or promotion copy for a shipped feature."
disable-model-invocation: true
argument-hint: "[optional: what shipped and/or channels, e.g. 'a tweet thread and a LinkedIn post']"
---

# Promotion Copy

Turn a feature that just shipped into copy-pasteable, user-facing announcement copy, right inside the engineering workflow — so the messaging doesn't wait for a separate marketing pass.

**Done when:** every drafted channel is presented as a labeled, copy-pasteable block and the user has been offered a revision. **This skill drafts only — it never posts, publishes, schedules, commits, or opens PRs.** Posting is a human action.

It is **spiral-agnostic**: with nothing installed it drafts directly from the editorial and social fundamentals in Path B. When the Spiral CLI is present and authed, drafts come back voice-matched to the user's brand — an enhancement, never a requirement.

## Phase 1 — Figure out what shipped

A free-form description in the arguments is the source of truth. Otherwise derive it from context, using what's available and blocking on no single source:

- **Merged/active PR** — `gh pr view --json title,body,url` (the title and body usually state the user-facing value)
- **The diff** — `git diff main...HEAD --stat`, skimming notable changes so the claim is grounded in what actually changed
- **Changelog** — the top or `[Unreleased]` entry in `docs/changelog.md`, `CHANGELOG.md`, or similar
- **Recent commits** — `git log --oneline -15` for the arc of the change

Then write a 1-3 sentence summary of the **user-facing value**: what a user can now do that they couldn't before, and why they'd care. Outcome, not implementation — "You can now export any report to CSV in one click", not "Added a CsvSerializer and an export endpoint." If you can't confidently tell what shipped, ask one short question rather than guessing.

## Phase 2 — Pick channels

Default to an X post (or short thread) plus a one-line changelog / release blurb. If the user named channels — LinkedIn, email, a blog intro, a demo script — draft those instead of or in addition to the defaults. Scale to the change: a small fix warrants one or two short drafts, a flagship feature a cross-channel set. Don't force a fixed template.

## Phase 3 — Draft the copy

Detect Spiral's state with two quick, non-blocking commands:

```bash
which spiral
spiral auth status --json 2>/dev/null
```

- No binary -> **Absent**
- `"authenticated": true` -> **Ready**
- `"authenticated": false` -> **Unauthed**
- Output isn't JSON (older CLI that ignores `--json`) -> ready iff it contains `spiral_sk_`, else unauthed

**Ready** -> Path A. **Absent or Unauthed** -> Path 0, then Path A if setup completes, else Path B. Never let a Spiral failure, timeout, or odd output block or slow the skill — when in doubt, treat it as not-ready and continue.

### Path 0 — Offer Spiral setup (once, declinable)

Go straight to Path B when running non-interactively — there is no human to answer. Otherwise offer setup **once**: read `references/spiral-cli.md` and follow its Path 0 section for the opt-out check, the blocking question, the agent-run `spiral login --json` flow (the API key never passes through the agent, and the user never pastes one into chat), the install path, and how the opt-out is recorded. Skip to Path B only when *that* check finds a recorded opt-out — it is the authority on what counts as recorded, and a naive config scan misreads `ce-setup`'s commented template example as one, silently suppressing the offer.

Two properties that section depends on: **any dismissal records the opt-out**, so a single first-run decline stops the offer for good in this repo, and a decline always proceeds to Path B rather than blocking. If a human is present but no blocking-question tool is in the current tool list, fall back to a numbered list of the two options in chat and wait — do not skip the offer, and never call a user-facing question tool to discover whether one exists.

### Path A — Spiral ready (voice-matched)

**Read `references/spiral-cli.md` before composing the prompt.** Whether Spiral returns a multi-channel set or several variations of one channel is phrasing-driven (channel keywords and cue words vs. `--num-drafts`), and getting it wrong silently returns the wrong number or shape of drafts — don't restate those rules from memory.

Always pass `--instant` and `--json`; parse `drafts[]` (each carries its own `channel`) plus `session_id`. **Present every returned draft, grouped by `channel`** — Spiral decides how many drafts per channel, so never assume one-per-channel or drop extras. If the `spiral write` call errors or returns no usable drafts, fall back silently to Path B for the affected channels.

### Path B — Direct drafting

No Spiral needed; draft directly. (The Spiral path goes further: brand-voice matching, humanization, saved styles, and cross-channel campaign orchestration.)

**Every channel:**

- Lead with the user-facing outcome — what someone can now do, not how it was built.
- One idea per piece. Cut windup, hedges, and throat-clearing.
- Plain, active language. Strip AI tells: "thrilled/excited to announce", "game-changer", "in today's fast-paced world", "unlock/leverage/seamless", em-dash padding.
- Read it back as if saying it to one user. If a person wouldn't say it, rewrite it.

**Distributed channels:** the first line is the hook and has to earn the next line (feeds truncate) — no preamble. Match each channel's native shape and length; never reuse one draft verbatim across channels. One clear CTA where the channel supports it. Hashtags 0-2, and only where the channel expects them.

**Per channel:**

- **X** — value in the first line; ~1-3 tight lines. Thread only when there's more than one beat worth its own line.
- **Changelog / release blurb** — one declarative line naming the new capability. Plain, not promotional.
- **LinkedIn** — a short paragraph: human angle (why it matters), then the what. Warmer than X.
- **Email** — benefit-stating subject + 2-4 sentence body + one CTA.
- **Blog intro** — one opening paragraph framing the problem and the new capability; leave the deep-dive to the author.
- **Demo script** — 3-6 spoken beats: hook, problem, action, payoff.

One strong draft per channel by default; produce more only when asked ("3 tweet options"), capped at ~3.

## Phase 4 — Present the drafts

Show every draft as a clean, copy-pasteable block labeled by channel:

```
### X post
<the copy>
```

When Path A produced them, also surface the `session_id` and each draft's `url` so the user can open and tweak them in the Spiral web app. Offer to revise (tone, length, angle, more variations, another channel). **Do not post, publish, schedule, commit, or open a PR** — end by reminding the user the drafts are theirs to ship.
