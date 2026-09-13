# `ce-noslop`

> Prose with no AI tells that a reader understands on the first read, with every fact the source stated still there.

`ce-noslop` is the plugin's writing skill. It holds two goals at equal weight: the text carries no AI writing patterns, and a person understands it on the first read. Technical writing is included; a PR body, a plan section, a review finding, and a chat reply all get the same tests. Text that is free of tells but still dense has failed. Text that is plain but dropped a qualifier has failed too.

It preserves technical terms needed for precision and explains unfamiliar ones when the reader needs them. Internal workflow jargon is rewritten as the action or consequence it means. Exact identifiers and required status tokens stay intact.

Other skills invoke it where they compose prose. You invoke it directly when you want a draft checked, rewritten, or written from content you supply. Either way the rules are the same; mode and register change the shape of the output, never which rules apply.

It is not `ce-promote` (channel-specific announcement copy; that skill writes its own direct drafts through this one and presents Spiral-returned drafts as returned) and not `ce-doc-review` (findings on a plan's substance, not its sentences).

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Rewrites, checks, or drafts prose under seven tests, without changing what the text says |
| When to use it | You have text to fix or check, or content you want drafted plainly. Sibling skills call it on their own when they write |
| What it produces | Edit: the rewritten text, with one line on what changed only when the caller asks for it. Detect: each pattern found, with the quoted line and a short fix. Author: nothing returned; the tests hold while the caller writes |
| What's next | Nothing. It returns text or findings and stops |

---

## Example invocations

A `mode:` token picks the mode. Without one: no draft means author; an imperative on a draft means edit; a question about a draft means detect.

```text
# Edit: rewrite a pasted draft
/ce-noslop tighten this PR description: <text>

# Edit a file in place, only because the request says so
/ce-noslop mode:edit rewrite docs/plans/2026-09-07-feature.md in place

# Detect: name the patterns, do not rewrite
/ce-noslop does this release note read like a model wrote it? <text>

# Author: draft from supplied content
/ce-noslop mode:author write the summary for this incident from these notes: <notes>
```

---

## Modes

| Mode | Chosen when | Returns |
|------|-------------|---------|
| **author** | No draft is supplied, or `mode:author` | Nothing. The tests load as constraints and the caller writes. When handed content and asked to write, the skill drafts it under the same tests |
| **edit** | An imperative on a draft, or `mode:edit` | The rewritten text. A second pass on the returned text changes nothing. One line saying what changed is added only when the caller asks for it, and stays outside the rewritten text and out of any artifact |
| **detect** | A question about a draft, or `mode:detect` | Each pattern found, the quoted line, and the fix in a few words. No rewrite |

Edit and detect read a pattern catalog bundled with the skill. Author mode uses the tests alone, and opens the catalog only for a passage the tests do not settle. On text that is not English, edit and detect apply the tests only. The note that the catalog did not apply goes inside detect findings or inside a change line the caller asked for, and nowhere else.

---

## Registers

Who reads the result decides the register. A caller's own interaction contract wins over any register rule.

- **Agent talking to the user.** The reader is a teammate who knows the domain and did not watch the work. Each sentence is written as it would be said to them.
- **Repo or team artifact.** Neutral. Match the surrounding document's idiom. No first person, no opinion the artifact does not need. This is the default when no reader is named and no caller supplies context.
- **The user's own writing.** Preserve voice and make the minimum effective edit. Understandability edits stop at sentence splits and actor restoration that keep the user's word choice; tone and structure beyond that stay.

---

## The seven tests

Applied to every sentence: as constraints in author mode, as checks in edit and detect.

1. **Mechanism.** Say what the thing does, not how it feels.
2. **Portability.** A sentence that could move to another project unchanged says nothing about this one.
3. **Actor.** Name who does the verb. Passive stays only when the actor is unknown or does not matter.
4. **One idea.** If the reader would backtrack, split the sentence.
5. **Density.** One device proves nothing. Three or more distinct patterns in a passage, or one repeated across passages, is a finding.
6. **Decision first.** The first sentence carries the outcome the reader needs.
7. **Reader.** Someone without the document or the code open can act on it. Gloss the identifier or name the consequence.

Sentences get shorter; content does not. Exact identifiers, paths, commands, thresholds, and domain terms stay.

---

## What it never touches

- Code blocks, quoted text, frontmatter, link targets, identifiers, or any token the caller's own contract requires, unless the user names that content as the thing to fix.
- Facts. Every fact, number, name, quote, and citation in the input survives, and nothing is added that the source or the caller did not supply. Importance stapled to a fact ("a vital component", "marks a turning point") is not a fact and is cut; in the user's-own-writing register the edit stays minimal and keeps the author's voice.
- Files, unless the request asks for a named file to be written in place. Otherwise it returns the text.
- Authorship. It never says whether text was written by a model.

---

## When to reach for it

Use it when:

- You have a draft to check or rewrite: a PR body, a plan, a changelog entry, a message
- You have notes or a spec and want the prose written from them
- You want to know which patterns a piece of text carries before you edit it yourself

Skip it when:

- You want announcement copy shaped for a channel (X, changelog, LinkedIn, email, blog). That is `/ce-promote`, which writes its direct drafts through this skill
- You want findings on what a document says rather than how it reads. That is `/ce-doc-review`
- The text is code, config, or something the user asked to post as written

---

## Chain position

Sibling skills write their prose through `ce-noslop` at the point where they compose it, and their own presentation contracts sit on top of it:

- `ce-commit-push-pr` for the PR title and body
- `ce-code-review` for human-readable findings
- `ce-plan` and `ce-brainstorm` for the plan document's prose sections
- `ce-promote` for the announcement drafts it writes itself (Spiral-returned drafts are presented as returned)
- `ce-resolve-pr-feedback` for replies posted as the PR author

Skills with a presentation contract of their own (`ce-pov`, `ce-doc-review`, `ce-babysit-pr`) invoke `ce-noslop` before composing and keep only the rules specific to their output on top.

Nothing runs after it. The skill returns text or findings and the caller continues.

---

## Make it automatic

The skill is not in context when an agent writes an ordinary chat reply, so the invocation above covers artifacts, not the agent's own reports and summaries. A standing instruction in the project's agent-instructions file closes that gap. `ce-setup` offers to add it, verbatim, beside its compounding-directive offer; it skips the offer only when the file already carries an instruction covering the report boundary, the invocation of the skill, and the exclusions. A partial or merely related instruction still gets the offer.

The instruction:

> Write every report, summary, or handoff to the user through the `ce-noslop` skill. This applies when you are the top-level agent writing to the user, not when you are a subagent reporting to its caller. Do not apply it to code, config, verbatim quotes, or text the user asked to post as written.

The instruction and the skill are two layers. The instruction carries the boundary (a report, summary, or handoff to the user, from the top-level agent only) and the exclusions (code, config, verbatim quotes, text to post as written), because it has to work on its own when the skill cannot be loaded. The skill carries the tests and the pattern catalog. Copy the text as written: `ce-setup` inserts it byte-for-byte, and a test pins the wording, so a paraphrase forks the bar.

Put it in the repo's `AGENTS.md`/`CLAUDE.md`, or in your harness's global instruction file to apply it in every repo.

---

## See also

- [`ce-promote`](./ce-promote.md): channel-specific announcement copy; its direct drafts are written through this skill
- [`ce-commit-push-pr`](./ce-commit-push-pr.md): PR descriptions composed under this skill
- [`ce-code-review`](./ce-code-review.md): findings written under this skill
- [`ce-plan`](./ce-plan.md) and [`ce-brainstorm`](./ce-brainstorm.md): plan prose written under this skill
- [`ce-doc-review`](./ce-doc-review.md): what a document says, not how it reads
- [`ce-setup`](./ce-setup.md): offers the standing instruction above
