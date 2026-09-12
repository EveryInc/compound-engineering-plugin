---
name: ce-noslop
description: "Rewrite, check, or draft prose so it carries no AI writing tells, reads plainly on the first read, and keeps every source fact. Use when asked to make writing plainer or free of those tells, to check writing for them, or when drafting from supplied content. Use ce-promote for channel-specific marketing copy."
argument-hint: "[mode:author|edit|detect] [text, file path, or nothing]"
---

# Write without slop

Prose that carries no AI tells and that a reader understands on the first read, with every fact the source stated still there. Both goals hold at once: text that is free of tells but still dense has failed, and text that is plain but drops a qualifier has failed.

**Done:** the mode's output is returned, every fact, number, name, quote, and citation in the input survives, and nothing was added that the source or the caller did not supply.

**Boundaries:** never touch code blocks, quoted text, frontmatter, link targets, identifiers, or a token the caller's own contract requires, unless the user names that content as the thing to fix. Never say whether text was written by a model. Write a named file in place only when the request asks for that; otherwise return the text.

## Mode

Take a `mode:` token when one is given. Otherwise: no draft means **author**; an imperative on a draft means **edit**; a question about a draft means **detect**.

- **author.** Hold the tests below while the caller writes; return nothing. When handed content and asked to write, draft it under the same tests.
- **edit.** Rewrite only the sentences a test fails on, and return the text plus one line saying what changed. A sentence that passes stays as written, so a second pass on the returned text changes nothing.
- **detect.** Name each pattern found, quote the line, give the fix in a few words. Do not rewrite.

For edit and detect, and for an author passage the tests alone do not settle, read `references/patterns.md`. On text that is not English, apply the tests only, and open the summary line by saying the pattern catalog did not apply.

## Register

Pick by who reads the result. The caller's own interaction contract wins over any line here.

- **Agent talking to the user.** The reader is a teammate who knows the domain and did not watch the work. Write each sentence as you would say it to them.
- **Repo or team artifact.** Neutral. Match the surrounding document's idiom. No first person, no opinion the artifact does not need. This is the default when no reader is named.
- **The user's own writing.** Preserve voice; make the minimum effective edit. Understandability edits stop at sentence splits and actor restoration that keep the user's word choice.

## The tests

Apply these to every sentence, in author mode as constraints and in edit or detect mode as checks.

1. **Mechanism.** Does the sentence say what the thing does, or how it feels? Replace the feeling with the fact it displaced, or cut the sentence.
2. **Portability.** Could the sentence move to another project unchanged? Then it carries no fact about this one.
3. **Actor.** Who does the verb? Name them when the source says who. Keep the passive when the actor is unknown or naming it adds nothing.
4. **One idea.** Would the reader have to reread to hold the sentence? Split it. A sentence the reader gets on the first pass stays, however long.
5. **Density.** One device proves nothing. Three or more distinct patterns in a passage, or one repeated across passages, is a finding.
6. **Decision first.** Does the first sentence carry the outcome the reader needs?
7. **Reader.** Can someone without the document or the code open act on this? Gloss the identifier or name the consequence.

Keep exact identifiers, paths, commands, and thresholds. For wording choices, read `references/terminology.md`.
