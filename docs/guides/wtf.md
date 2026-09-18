# `wtf`

> The thing you did not follow, explained the way one person would explain it to another.

`wtf` is for the moment an agent's reply, a plan, or a document stops making sense. Run it with nothing and it explains the agent's last message. Pass it a file, a link, a pasted passage, or a pointer to one part of the conversation and it explains that instead.

It explains; it does not rewrite. The answer opens with the point, says what it means for you, and leaves out whatever you do not need in order to understand the source or act on it. It is shorter than the source and does not walk a document section by section.

It is not `ce-explain` (which investigates the code and its history to show how and why something works) and not `ce-noslop` (which rewrites prose and keeps every fact). `wtf` reads only what it is pointed at and adds no claims of its own.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Explains the last message, or a supplied file, link, or passage, in plain language |
| When to use it | You read something and did not follow it |
| What it produces | A short explanation in chat: the point, what it means for you, and anything you need to decide or do |
| What's next | Nothing. It explains and stops |

---

## Example invocations

```text
# Explain the agent's last message
/wtf

# Explain one part of the conversation
/wtf the part about the migration

# Explain a document
/wtf docs/plans/2026-09-07-feature.md

# Explain a pasted passage
/wtf <text>
```

Manual invoke only. In Codex use `$wtf`; in oh-my-pi use `/skill:wtf`.

---

## Novel mechanics

**Simpler does not mean more positive.** A plain-language restatement tends to drop caveats and sound more certain than the source. `wtf` keeps everything that would change what you do: failures, caveats, open questions, and requests.

**No new claims.** It explains what the source says. When the source is vague or contradicts itself, it says so. When re-reading its own last message shows that message was wrong, it says that and corrects it.

**Terms are explained, not banned.** A technical term that matters stays, with its meaning given once. Exact file names, commands, and values you will need stay as written.

**One question at most.** When it cannot tell what you want explained, it asks once instead of guessing.

---

## Chain position

Standalone. No skill calls it and it calls none.
