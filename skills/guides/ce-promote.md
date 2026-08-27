# `ce-promote`

> Draft user-facing announcement copy for a feature that just shipped. It never posts.

`ce-promote` is the **post-ship messaging** utility. After a merge, it figures out what a user can now do, picks channels, and drafts copy you can paste: an X post or thread, a one-line changelog blurb, a LinkedIn post, an email, a blog intro, a short demo script.

It drafts with nothing extra installed. When the [Spiral CLI](https://www.npmjs.com/package/@every-env/spiral-cli) is present and signed in, those drafts are voice-matched to your brand. Declining the one-time Spiral setup offer is remembered in checkout-local config. See the [configuration reference](./configuration.md).

It is explicit-invocation only (`disable-model-invocation: true`). Shipping a feature does not start it on its own.

It drafts only. It never posts, publishes, schedules, commits, or opens a PR.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Summarizes the user-facing value, picks channels, drafts copy, and presents it for review |
| When to use it | Right after a user-facing feature ships, while the context is still in the session |
| What it produces | Copy-pasteable drafts, labeled by channel. Never an auto-post. |
| What's next | You paste and publish. The skill offers a revision if the tone or channel is wrong. |
| Spiral | Optional. Ready CLI: voice-matched drafts plus a web URL per draft. Otherwise a one-time setup offer, then direct drafts. |

---

## Example invocations

Empty invoke derives what shipped from the repo. Named channels change the set. The skill always drafts and never posts.

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

Name channels when you need a particular shape. Otherwise the default is an X post (or short thread) plus a one-line changelog blurb.

---

## The Problem

Announcement copy usually waits for a later marketing pass, so it lags the ship. The engineer who knows the user value is often not the person who writes it. Ad hoc drafts tend toward "We're thrilled to announce…", hashtag spam, and implementation talk instead of what a user can now do.

## The Solution

`ce-promote` drafts at ship time, from ship context:

- A free-form description in the prompt is the source of truth. Otherwise it derives what shipped from the merged or active PR, the diff, the changelog, and recent commits, then writes a short **user-facing** summary. Outcome, not the serializer or endpoint.
- Default channels are an X post plus a changelog blurb. Named channels replace or add to that. A small fix gets one or two short drafts. A flagship change can get a cross-channel set.
- If Spiral is ready, drafts come back voice-matched and persist to the Spiral account. If not, the skill offers setup once, then drafts itself. A decline is recorded so the offer does not repeat in this repo.
- Every draft is presented as a labeled, copy-pasteable block. Then it offers a revision. It does not post.

---

## What Makes It Novel

### Spiral is optional

Detection is `which spiral` plus `spiral auth status --json`: ready, installed but not signed in, or absent. Ready uses Spiral. Otherwise it offers setup once (sign in, or the one-step install). You approve in a browser. The API key never goes through the agent. Decline and it drafts directly, then writes `ce_promote_spiral_optout: true` in `.compound-engineering/config.local.yaml` so it does not ask again.

Non-interactive runs skip the offer and draft directly.

### Phrasing picks one channel or many

Spiral treats "3 tweet options" as N variations of one channel. Words like `campaign`, `across`, `multi-channel`, `everywhere`, or `cross-post`, or naming two or more channels, switch it to a cross-channel set. The skill phrases the request so you get the shape you asked for. When you want several tweets, avoid those cue words. When you want a launch set, name the channels.

Without Spiral, the same split still holds: one strong draft per named channel, or more only when you ask (`3 tweet options`), capped at about three.

### Drafts only

The summary is what a user can now do and why they would care. Direct drafts ban AI tells, throat-clearing, and hashtag spam, and match length to the channel. Posting stays a human action because it is outward-facing and hard to undo.

---

## Quick Example

A PR adding one-click CSV export just merged.

`/ce-promote 3 tweet options for the new one-click CSV export` summarizes the value, then returns three distinct X drafts as labeled blocks. If Spiral is ready, each draft also has a web URL you can tweak.

`/ce-promote a launch across X, LinkedIn, and email` returns a labeled set for those channels. Spiral decides how many drafts per channel. Without Spiral, you get one draft per named channel.

---

## When to Reach For It

Use `ce-promote` when:

- A user-facing feature just shipped and you want the announcement drafted before the context fades
- You need several channels from one prompt
- You want voice-matched copy and Spiral is installed

Skip it when:

- Nothing user-facing shipped (internal refactor, CI-only, test-only)
- You only need internal release history (use GitHub Releases for plugin history)
- You want the agent to post or open a PR. This skill will not do that.

---

## Use Standalone

This is a post-ship utility, not a pipeline stage. Invoke it after merge, or after you already know what to announce.

It does not run as a side effect of `/ce-work`, `/lfg`, or `/ce-commit-push-pr`. Call it when you want the copy.

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

## FAQ

**Will it post the tweet or publish the email?**
No. It prints labeled drafts and reminds you they are yours to ship.

**What if I do not have Spiral?**
It still drafts. You get a one-time setup offer. Decline it and the skill will not ask again in this repo.

**Why did I get one tweet when I asked for three?**
A cue word (`campaign`, `across`, `multi-channel`, and similar) or a second channel name switches Spiral into campaign mode, which ignores the variation count. Ask for `3 tweet options` and do not name other channels.

**What if it cannot tell what shipped?**
It asks one short question rather than guessing.

---

## See Also

- [Compound Engineering configuration](./configuration.md): `ce_promote_spiral_optout` and how local config is resolved
- Harness-native screenshots or recordings: useful visual context to pair with the copy when you have them
