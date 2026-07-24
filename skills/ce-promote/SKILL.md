---
name: ce-promote
description: "Draft launch or promotion copy for a shipped feature."
disable-model-invocation: true
argument-hint: "[optional: what shipped and/or channels, e.g. 'a tweet thread and a LinkedIn post']"
---

# /ce-promote

Turn a feature that just shipped into copy-pasteable, user-facing announcement copy — right inside the engineering workflow.

**This skill drafts only. It never posts, publishes, schedules, commits, or opens PRs.** The output is always drafts for the user to review, edit, and ship themselves.

## What shipped

If the user gave a free-form description of the feature, use it as the source of truth. Otherwise derive it from the PR, the diff, the changelog's top / `[Unreleased]` entry, and recent commits — use what's available.

Then write a 1–3 sentence summary of the **user-facing value** — what a user can now do that they couldn't before, and why they'd care. Describe the outcome, not the implementation. ("You can now export any report to CSV in one click" — not "Added a CsvSerializer and an export endpoint.")

If you can't confidently tell what shipped, ask the user one short question rather than guessing. With no human to answer (headless / unattended), draft from the strongest signal you have and state the assumption alongside the drafts.

## Channels

Default to an X post or short thread (lead with the value) plus a one-line changelog / release blurb. If the user named channels ("LinkedIn", "email", "a blog intro", "a short demo script"), draft those instead of or in addition to the defaults.

## Drafting

Detect Spiral's state with `spiral auth status --json`. JSON with `"authenticated": true` (equivalently `"status": "authenticated"`) → draft with Spiral. Anything else — no binary, `"authenticated": false`, non-JSON output, error, timeout — is not-ready.

**Spiral is optional:** any absence, error, timeout, or unparseable output means draft directly for the affected channels, silently.

### With Spiral (voice-matched)

**Read `references/spiral-cli.md` before composing the prompt** — multi-channel vs. single-channel-variations is phrasing-driven (channel keywords / cue words vs. `--num-drafts`) and getting it wrong silently returns the wrong number or shape of drafts.

**Present every returned draft, grouped by `channel`.** Spiral decides how many drafts per channel — multi-channel runs often return several — so never assume one-per-channel or drop extras.

If the `spiral write` call errors or returns no usable drafts, silently draft directly for the affected channels.

### Not ready — offer setup once, then draft

Offer Spiral setup **once**; a decline records the opt-out and drafts directly. Skip the offer entirely — straight to direct drafting — when the opt-out is already recorded, or when running headless / non-interactive (no human to answer). Read `references/spiral-cli.md` for the opt-out check, the sign-in / install steps, and how a decline is recorded so later runs skip this.

### Direct drafting (lite editorial & social expertise)

**Editorial** — every channel:
- Lead with the user-facing outcome: what someone can now do, not how it was built.
- Strip AI tells — "thrilled/excited to announce," "game-changer," "in today's fast-paced world," "unlock/leverage/seamless," em-dash padding.

**Social** — distributed channels:
- Never reuse one draft verbatim across channels.
- Hashtags: 0–2, only where the channel expects them — never a wall of tags.

**Per channel:**
- **X** — value in the first line; ~1–3 tight lines. Thread only when there's more than one beat worth its own line.
- **Changelog / release blurb** — one declarative line naming the new capability. Plain, not promotional.
- **LinkedIn** — a short paragraph: human angle (why it matters), then the what.
- **Email** — benefit-stating subject + 2–4 sentence body + one CTA.
- **Blog intro** — one opening paragraph framing the problem and the new capability.
- **Demo script** — 3–6 spoken beats: hook, problem, action, payoff.

**Drafts per channel:** one strong draft by default; produce more only when asked ("3 tweet options"), capped ~3.

## Output

Show every draft as a clean, copy-pasteable block, labeled by channel.

- If Spiral produced them, also surface the `session_id` and each draft's `url` so the user can open and tweak them in the Spiral web app.
- **Do not post, publish, schedule, commit, or open a PR.**
