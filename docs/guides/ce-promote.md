# `ce-promote`

> Draft user-facing announcement copy for a feature that just shipped. It never posts.

`ce-promote` writes the announcement while the ship context is still in your session. After a merge, it works out what a user can now do, picks channels, and hands you copy-pasteable drafts: an X post or thread, a one-line changelog blurb, a LinkedIn post, an email, a blog intro, a short demo script.

It needs nothing installed. If the [Spiral CLI](https://www.npmjs.com/package/@every-env/spiral-cli) is present and signed in, drafts come back voice-matched to your brand; if you decline the one-time Spiral setup offer, that decline is remembered in checkout-local config (see the [configuration reference](./configuration.md)).

Two hard limits. It only runs when you invoke it (`disable-model-invocation: true`), so shipping a feature does not start it on its own. And it only drafts. It never posts, publishes, schedules, commits, or opens a PR. Posting stays a human action because it is outward-facing and hard to undo.

---

## Example invocations

```text
# Derive what shipped from the merged PR, diff, changelog, and recent commits
/ce-promote

# Supply the user-facing value when the repo context is not enough
/ce-promote announce one-click CSV export for account reports

# Several alternatives on one channel (not a cross-channel set)
/ce-promote 3 tweet options for the new one-click CSV export

# Coordinated set across named channels
/ce-promote a launch across X, LinkedIn, and email for one-click CSV export

# A single quieter channel
/ce-promote a one-line changelog blurb for one-click CSV export

# Spoken beats rather than a social post
/ce-promote a short demo script for the CSV export
```

An empty invoke derives what shipped from the repo and drafts the default set: an X post (or short thread) plus a one-line changelog blurb. Name channels when you want a different shape.

---

## Why it exists

Announcement copy usually waits for a later marketing pass, so it lags the ship. The engineer who knows the user value is rarely the person who writes it. And ad hoc drafts drift toward "We're thrilled to announce...", hashtag spam, and implementation talk instead of what a user can now do.

`ce-promote` drafts at ship time, from ship context. A free-form description in the prompt is the source of truth; without one, it reads the merged or active PR, the diff, the changelog, and recent commits, then writes a short user-facing summary. Outcome, not the serializer or endpoint. If it cannot tell what shipped, it asks one short question rather than guessing.

It scales to the change: a small fix gets one or two short drafts, a flagship feature can get a cross-channel set. Every draft arrives as a labeled block, followed by an offer to revise. Then it stops.

---

## How Spiral fits in

Detection is `which spiral` plus `spiral auth status --json`, which lands in one of three states: ready, installed but not signed in, or absent.

Ready means Spiral writes the drafts, voice-matched, and each one comes back with a web URL so you can keep tweaking in the Spiral app. Not ready means a one-time setup offer: sign in, or the one-step install. You approve in a browser, and the API key never passes through the agent. Decline and the skill drafts directly, then writes `ce_promote_spiral_optout: true` to `.compound-engineering/config.local.yaml` so it does not ask again in this repo. Non-interactive runs skip the offer entirely.

A Spiral failure never blocks the skill. An error or unusable output falls back silently to direct drafting for the affected channels.

### Phrasing picks one channel or many

Spiral treats "3 tweet options" as N variations of one channel. Words like `campaign`, `across`, `multi-channel`, `everywhere`, or `cross-post`, or naming two or more channels, switch it to a cross-channel set, and campaign mode ignores the variation count. So if you asked for three tweets and got one, a cue word or a second channel name is usually why. Want several tweets, avoid those words. Want a launch set, name the channels.

Without Spiral the same split holds: one strong draft per named channel, more only when you ask, capped at about three.

### Direct drafts have standards too

The summary is what a user can now do and why they would care. Direct drafts ban AI tells, throat-clearing, and hashtag spam, lead with the outcome, and match each channel's native length and shape. Nothing gets reused verbatim across channels.

---

## When to reach for it

Use it when a user-facing feature just shipped and you want the announcement drafted before the context fades, when you need several channels from one prompt, or when you want voice-matched copy and Spiral is installed.

Skip it when nothing user-facing shipped (internal refactor, CI-only, test-only), when you only need internal release history (use GitHub Releases), or when you want the agent to actually post or open a PR. It will not.

This is a post-ship utility, not a pipeline stage. It does not run as a side effect of `/ce-work`, `/lfg`, or `/ce-commit-push-pr`. Call it when you want the copy.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Derives what shipped from PR, diff, changelog, and recent commits. Drafts the default set (X plus a changelog blurb). |
| `<description>` | Free-form source of truth for what shipped, for example `announce one-click CSV export` |
| `<channels>` | Named shape: `3 tweet options`, `a tweet thread and a LinkedIn post`, `a launch across X, LinkedIn, and email`, `a one-line changelog blurb`, `a short demo script` |

Supported channels: X (post or short thread), changelog / release blurb, LinkedIn, email, blog intro, demo script.

Spiral CLI details live in the skill's `references/spiral-cli.md`.

---

## See also

- [Compound Engineering configuration](./configuration.md): `ce_promote_spiral_optout` and how local config is resolved
- Harness-native screenshots or recordings: useful visual context to pair with the copy when you have them
