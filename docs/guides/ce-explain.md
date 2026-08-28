# `ce-explain`

> Build a dense visual document about a concept, a diff, an idea, or a window of your own recent work. Keep it. Optionally drill yourself on it.

`ce-explain` is an on-demand **teaching** skill. Point it at something worth understanding and you get a self-contained explainer, evidence-grounded when the material lives in this repo, written to disk before you are asked where to put it.

It is not a status update or a standup memo. A recap is a document you can study or speak from. If you want the terse update itself, say so and the skill declines that form. Ordinary Q&A stays in chat. Operational questions ("why is X doing Y", "is X configured right") get a direct answer first; an explainer is offered only when a real concept sits behind the question.

It also is not `ce-compound` (that teaches the repo) and not `ce-pov` (that returns a verdict). The check-in (predict a diff, or do corrected exercises) is opt-in. Most runs skip it.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Classifies the request as concept, diff, idea, or recap, grounds it, writes one visual explainer, then asks where to put it |
| When to use it | You want a document to keep about a change, a topic, an idea, or what you actually did in a window |
| What it produces | One self-contained HTML file (markdown if you ask). Written to a temp run dir first, then copied or published if you pick a destination |
| What's next | Keep the file, optionally take the quiz, then optional offers into `/ce-ideate`, `/ce-simplify-code`, `/ce-polish`, or `/ce-compound-refresh` |

---

## Example invocations

Plain language is the ordinary path. Tokens force a mode when inference could go either way.

```text
# Asks what to explain. Offers a recent-work recap as a shortcut
/ce-explain

# A window in prose is a recap, not a topic named "since last Monday"
/ce-explain since last Monday

# Force recap when the prompt could be a window or a topic
/ce-explain since:7d

# Catch yourself up before you speak. Still a teaching doc, not a status memo
/ce-explain catch me up on what I did this week

# Force diff mode on a range
/ce-explain diff:main..HEAD

# A PR, same force
/ce-explain diff:PR#42

# An idea, taken as given. Not scoped, not ranked
/ce-explain my idea of caching explainers per repository

# External concept. No repo grounding
/ce-explain Ruby garbage compaction

# Markdown instead of the default HTML
/ce-explain the parser split output:md

# Someone else will read it. Same depth, not a status memo
/ce-explain write this up for the team audience:team
```

`since last Monday` and `since:monday` resolve to the same window. A colon in a sentence is not a flag: "walk me through the diff: why did we split the parser" is prose, not `diff:why`.

---

## The Problem

Agent-driven work detaches you from what shipped, in two different ways.

You cannot account for it. A week of agent commits later, git has the record and you cannot read it in three minutes.

You cannot explain it. Writing the code forced comprehension. Reviewing agent output does not. The debt accumulates on your own projects.

The first wants a report. The second wants a report and, sometimes, a way to make it stick. Other skills do not cover this. `/ce-compound` stores knowledge for the repo. `/ce-pov` returns a verdict.

## The Solution

One artifact contract, four input shapes:

| Input | What you get |
|------|--------------|
| Work recap ("what did I do this week?") | A date-ordered timeline of real commits, PRs, and the plan or solution docs behind them |
| Diff (a sha, range, PR, or "the last change") | What the change actually does, with annotated hunks and the why per hunk |
| Concept (a topic, subsystem, or external subject) | An explainer grounded in this repo when the topic touches it, fully external when it does not |
| Idea (a proposal of yours) | Implications, mechanics, and trade-offs, taken as a fixed given |

Recap mode dispatches a scout that walks git activity, PRs (only when a PR interface is reachable), and project docs for the window, then writes an evidence file with shas and `file:line` pointers before any prose is composed. The main conversation does not pre-scan the window. An empty window says so and writes nothing.

Idea mode never scopes (`ce-brainstorm`) and never ranks alternatives (`ce-ideate`).

---

## What Makes It Novel

### Evidence first, including an honest empty

The scout gathers before anything is characterized. An early `git --all` glance would seed a false model of what happened. Unreachable PRs become one honest line, not a guess from branch names. An empty `diff:` range names what it resolved to and asks before substituting. An external topic with no web access is labeled in the header: *Unverified, from model knowledge, not checked against current sources*.

### Offline, one file, written before the ask

Default output is one self-contained HTML file (markdown via `output:md`). CSS and SVG are inline. Images are data URIs. System fonts only. No scripts, forms, or embedded quiz. A reader who skips every visual still gets the full explanation in prose. The form follows the material: diagram for architecture, annotated snippets for code, numbered flow for a lifecycle, timeline for a recap, two-column contrast for a trade-off.

The header is visible text: `Date`, `Input shape`, `Subject`. Those names are fixed so a later library can index them.

The file is written to `/tmp/compound-engineering-<effective-uid>/ce-explain/<run-id>/` before the destination ask. Declining every destination loses nothing. That path is temporary. Pick a destination if you want to keep it.

### The destination menu comes from this session

The menu offers only what this session actually has. Local file and Leave it are always there. HTML prefers a Claude Artifact in Claude Code when that tool is present, otherwise a public ht-ml.app URL. ht-ml.app is public and is never chosen headlessly; the option itself warns that the page may be indexed, crawled, copied, or archived. Proof is offered on markdown runs. Thinkroom appears only when that capability is detected.

### Written for you, or re-rendered for a reader

Default voice is second person and assumes the context you already have. `audience:team` (or "write this up for the team") drops second person, names the subject in third person when the evidence supplies a name, and adds the minimum orientation an outside reader needs. Depth, real code, and honesty labels do not change. Wanting to *speak* from the material (standup prep, meeting prep) stays personal. You are still the reader.

If you compose the personal default and then pick a destination that puts it in front of other people, it offers once to re-render before sending.

### The check-in lives in the session

Before anything is revealed, the skill decides whether the material warrants active recall. A gnarly diff or a hard concept does. A routine recap or a document written for someone else does not. The offer is two choices, in this order: **Just the explainer (Recommended)**, then **Quiz me**. Declining is final for the run.

Quiz me on a diff shows the raw change and nothing else, asks what you think it does and why, and ends the turn there. The explainer is composed after your prediction. The reveal names what you got right, missed, and wrong.

Quiz me on a concept, idea, or dense recap poses two to four exercises in chat after the document, one at a time. Each answer is checked once. The gap is named. No lecture past it.

---

## Quick Example

You type `/ce-explain since last Monday`. That is a recap. A scout walks the window and writes evidence with shas. The week has real commits, so a document is composed: a timeline, each entry naming what changed and why it mattered.

The material is a routine recap, so there is no quiz offer. The HTML lands in the run dir. You are asked where to put it. You pick a local file and open it.

The recap evidence includes a plan that shipped work has since contradicted. After the destination is settled, the skill offers `/ce-compound-refresh` on that doc. You can take it or leave it.

---

## When to Reach For It

Use `ce-explain` when:

- You need a written breakdown of a change you did not type, to keep
- You want to learn a concept or subsystem, in this repo or outside it
- You have an early idea and want its implications laid out before committing to it
- You cannot account for a window of your own work and want a document you can study or speak from

Skip it when:

- You want a standup blurb or status memo. This skill will not write one. Recap mode can still catch you up so you can write it
- Ordinary Q&A, a quick "why?", or a trade-off that belongs in chat
- Operational diagnosis ("why is X doing Y") unless you then accept the explainer offer
- You need a verdict on whether to adopt something → `/ce-pov`
- The knowledge belongs to the repo's future work → `/ce-compound`

---

## Use as Part of the Workflow

`ce-explain` sits outside the core loop. Invoke it when your account of the work, or your understanding of it, lags behind what shipped.

Closing offers, only after the destination is settled:

- New-capability ideas → `/ce-ideate`
- Code-clarity findings → `/ce-simplify-code`
- UI/UX polish → you invoke `/ce-polish` yourself (`ce-polish` is user-invoked only)
- A plan or solution doc the evidence has overtaken → `/ce-compound-refresh`

Those are offers. They do not auto-fire. An unattended run reports the temp path and skips them.

---

## Use Standalone

No plan and no brainstorm required. It works in any repo, and with no repo at all for an external topic.

A bare `/ce-explain` asks what to explain. It does not invent a default artifact.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Asks "What should I explain?" and offers a recap shortcut |
| free text | Classified as concept, idea, diff, or recap by shape |
| `diff:<ref-or-range>` | Force diff mode (`diff:abc1234`, `diff:main..HEAD`, `diff:PR#42`) |
| `since:<window\|date\|ref>` | Force recap mode (`since:monday`, `since:7d`, `since:v2.1.0`). Last 7 days only when no window was named |
| `output:md` | Markdown artifact instead of HTML (`output:html` forces HTML) |
| `audience:<who>` | Render for that reader instead of you personally |

A token in flag position beats inference. A colon inside a sentence does not. `diff:` and `since:` together conflict, and the skill asks which you meant. An unrecognized `word:value` (including `feat:` inside a topic) stays as request text.

---

## FAQ

**Do I have to do the quiz?**
No. "Just the explainer" is first and recommended. Routine material skips the offer entirely.

**Can I use this for standup?**
You can use recap mode to catch yourself up, then speak. Prepping you to speak stays personal. The skill will not write the status update. If the document itself is going to a team, say so (or pass `audience:`) and it renders for them at full depth.

**Can I share the report?**
Yes. Ask for that audience up front, or take the re-render offer when you pick a shared destination.

**Where does the artifact go?**
`$RUN_DIR` under `/tmp/compound-engineering-<effective-uid>/ce-explain/` first. A destination copies or publishes it. Leave it, and the path is temporary.

**Is this `ce-compound` for humans?**
Roughly. A Learning teaches the repo's future work. An explainer documents something for you. They are complements.

**Can it quiz me later, or track what I have learned?**
Not in v1. No library, no spaced repetition, no progress state. The stable run-dir layout and fixed header fields are the hook a later library can use.

---

## See Also

- [`ce-pov`](./ce-pov.md): a verdict on something external, not a document about it
- [`ce-compound`](./ce-compound.md): knowledge that belongs to the repo
- [`ce-ideate`](./ce-ideate.md): where new-capability observations can go next
- [`ce-simplify-code`](./ce-simplify-code.md): where code-clarity findings can go next
- [`ce-polish`](./ce-polish.md): late polish you invoke yourself
- [`ce-compound-refresh`](./ce-compound-refresh.md): a plan or solution doc the recap just contradicted
