# `ce-promote`

> Turn a shipped feature into copy-pasteable, user-facing announcement copy — right inside the engineering workflow. Spiral-agnostic by default; voice-matched when the Spiral CLI is installed.

`ce-promote` is the **post-ship messaging** skill. After a feature merges, it figures out what shipped, picks the right channels, and drafts the announcement copy — an X post or thread, a one-line changelog blurb, a LinkedIn post, an email, a blog intro, a short demo script. It produces good copy with nothing installed, and uses the [Spiral CLI](https://www.npmjs.com/package/@every-env/spiral-cli) for brand-voice-matched drafts when it's present and authed.

It drafts only. It never posts, publishes, commits, or opens PRs — shipping the copy is a human action.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Summarizes what shipped, picks channels, drafts announcement copy, presents it for review |
| When to use it | Right after a feature ships and you want the user-facing messaging drafted in-workflow |
| What it produces | Copy-pasteable drafts, labeled by channel — never an auto-post |
| Spiral | Optional enhancement: voice-matched drafts when the CLI is ready; otherwise offers setup once, then drafts with a lite layer of editorial & social expertise |

---

## The Problem

Messaging usually waits for a separate marketing pass, so it lags the ship — and the engineer who has the most context on the user value isn't the one who writes the copy. When announcement copy *is* written ad hoc, it tends toward AI tells ("We're thrilled to announce…"), hashtag spam, and implementation-speak instead of user value.

## The Solution

`ce-promote` drafts the copy at ship time, from ship context:

- **Derives what shipped** from a free-form description, or from the merged PR, the diff, the changelog, and recent commits — then summarizes the *user-facing value*, not the code.
- **Picks channels** sensibly (an X post + a changelog blurb by default) and scales to what the user asks for and what the change warrants.
- **Drafts voice-matched copy via Spiral** when ready; when not, offers setup once (sign in or install), and on a decline draws on a lite layer of editorial & social-media fundamentals to draft strong channel-specific copy on its own.
- **Presents drafts for review** — copy-pasteable, labeled by channel, never posted.

---

## What Makes It Novel

### 1. Spiral as a subtle, optional enhancement — never a dependency

Spiral is detected into three states (`which spiral` + `spiral auth status --json`): ready, installed-but-unauthed, or absent. When ready, drafts are voice-matched to the user's brand and persist to their Spiral account (each draft carries a web-app `url` for tweaking). When not ready, the skill offers setup **once** — if installed but unauthed the agent runs `spiral login` and shares the sign-in link (you approve in a browser — the API key never touches the agent); if absent it points to the one-step install command — and a decline is always fine: it falls back to a lite layer of editorial & social-media expertise to draft strong copy on its own, and records the opt-out so it never nags again. The skill is equally useful with or without Spiral.

### 2. The multi-channel / cue-word gotcha is encoded

Spiral's multi-channel behavior is phrasing-driven, not flag-driven, and it has a sharp edge the skill handles explicitly:

- **N variations of one channel** → ask for "3 tweet options", *avoid* cue words (`campaign`, `across`, `multi-channel`, `everywhere`, `cross-post`), and pass `--num-drafts 3`. A stray cue word trips campaign mode and collapses output to a single draft, silently ignoring `--num-drafts`.
- **A real cross-channel set** → name the channels in the prompt; Spiral returns a set of drafts per channel — it decides the count, often several — and `--num-drafts` is ignored. One call produces the whole cross-channel set.

### 3. Drafts only — posting is always human

The skill never posts, schedules, publishes, commits, or opens a PR. Output is always review-ready drafts. This keeps a human in the loop for the one action that's outward-facing and hard to reverse.

### 4. User value over implementation

The "what shipped" summary describes what a user can now do and why they'd care — never the serializer or endpoint that made it possible. Direct drafting bans AI tells, throat-clearing, and hashtag spam, and matches length/tone to each channel.

---

## Quick Example

You merge a PR adding one-click CSV export.

**Single-channel variations:** `/ce-promote 3 tweet options for the new one-click CSV export` → the skill summarizes the value, then (Spiral path) runs `spiral write "3 tweet options for one-click CSV export" --instant --num-drafts 3 --json` with no cue words, or (no-Spiral path) writes three distinct tweets directly. All three are presented as copy-pasteable blocks.

**Cross-channel set:** `/ce-promote draft a launch across X, LinkedIn, and email` → (Spiral path) `spiral write "announcing one-click CSV export — a launch across X, LinkedIn, and email" --instant --json` returns a set of drafts per channel (Spiral decides the count); (no-Spiral path) the skill drafts one X post, one LinkedIn post, and one email directly. Every returned draft is labeled by channel and ready to copy.

---

## When to Reach For It

Reach for `ce-promote` when:

- A feature just shipped and you want the announcement drafted before context fades
- You need cross-channel copy (tweet + LinkedIn + email) from one prompt
- You want voice-matched copy and have Spiral installed

Skip it when:

- Nothing user-facing shipped (internal refactor, CI-only, test-only)
- You only need internal release history — use GitHub Releases for plugin release history

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Derives what shipped from PR/diff/changelog/commits; drafts the default channel set |
| `<description>` | Free-form description of what shipped, used as the source of truth |
| `<channels>` | e.g., "a tweet thread and a LinkedIn post", "3 tweet options", "a launch across X, LinkedIn, and email" |

Detailed Spiral CLI mechanics live in the skill's `references/spiral-cli.md`.

---

## See Also

- Harness-native screenshots or recordings — useful visual context to pair with announcement copy when available
