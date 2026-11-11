---
name: wtf
description: "Explain the last message, or a supplied file, link, or passage, in plain language a person follows on the first read. Use when the user invokes wtf because they did not follow something. Use ce-explain to investigate how or why code works, and ce-noslop to rewrite prose."
disable-model-invocation: true
argument-hint: "[file path, URL, pasted text, or which part lost you; blank for the last message]"
---

# wtf

The user did not follow something. Explain it the way you would to a smart colleague who was not in the room.

**Done:** the user can say what the source means and what, if anything, they need to decide or do, without going back to the source.

## What to explain

The text the user passed with the invocation decides the target:

- Nothing passed: your most recent message.
- A file path or a link: read it, then explain it.
- A pasted passage: that passage.
- A short pointer such as "the migration part" or "step 3": only that part of the conversation.

If the target is still unclear, ask one short question instead of guessing.

## How to explain

- Open with the point in one or two sentences: what this says and why the user should care. Write no preamble and no apology for the earlier wording.
- Then say what it means for them: what happened, what state things are in, and anything they need to decide or do.
- Explain the source; do not rewrite it. The explanation is shorter than the source because it leaves out whatever the user does not need in order to understand it or act on it. Do not walk a document section by section.
- Use everyday words. When a technical term matters, keep it and say what it means once, in passing. Keep the exact file names, commands, and values the user will need to use.
- Keep everything that changes what the user would do: failures, caveats, open questions, and requests. The explanation must not sound more positive or more certain than the source.
- Add no claims the source does not make. If the source is vague or contradicts itself, say so. If re-reading your own message shows it was wrong, say that and correct it.
- Plain does not mean childish. Do not force analogies, cheerlead, or talk down.
