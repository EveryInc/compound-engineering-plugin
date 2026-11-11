# `ce-help`

> Find out where your work sits on the loop and which command moves it forward. Nothing runs until you run it.

`ce-help` is for when you know what you need but not which skill does it, or you just installed the plugin and want to know where to begin. It recommends a skill for the situation, works out the next step on work in progress, explains setup and configuration, says which runs are expensive, and sorts out problems.

It recommends and stops, because many CE skills dispatch several agents or call other model providers, and that spend should be your decision. Ask it for actual work instead ("fix the flaky login test with CE") and it routes to the right skill and does the work.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Orients you in Compound Engineering and recommends the next command |
| When to use it | You are unsure which skill to run, what comes next, or why something misbehaved |
| What it produces | A recommendation in chat with its reason, a ready-to-run command, and the page that backs it |
| What's next | You run the command, or don't |

---

## Example invocations

```text
# Find a skill for one job
/ce-help someone left comments on my PR, what handles those?

# Place work in progress on the loop
/ce-help I finished implementing, what now?

# Ask what runs cost
/ce-help how do I make these runs cheaper?

# Sort out a problem
/ce-help I updated the plugin and still get the old behavior

# Let it ask what you are trying to do
/ce-help
```

Manual invoke only. In Codex use `$ce-help`; in oh-my-pi use `/skill:ce-help`.

---

## Novel mechanics

**It reads your work before recommending.** For "what now?", it looks at the conversation, your branch, uncommitted changes, any open PR, and recent plans, respecting `docs_root`, then places the work on the loop and recommends the next step.

**Its skill map ships with your install.** The map from goals to skills is part of the skill, so it names only the skills you have and works offline. The test suite checks that it covers every skill and correctly marks the manual-only ones, which an agent cannot start for you.

**Details come from the docs, not from memory.** It fetches a page before quoting a flag, config key, or default. Those docs track `main`, so if a page describes something your install lacks, it says an upgrade may be needed.

**It separates what your work decides from what is your preference.** Where to start depends on what is already settled, so it gives a direct answer. Whether to run each step yourself or hand off to `lfg` is up to you, so it shows what each option means instead of picking one, unless you have already said how you like to work.

**It separates skills that sound alike.** `ce-explain` and `ce-pov`, or `ce-work` and `lfg`, get a direct comparison when your situation falls between them.

---

## Chain position

Standalone. No skill calls it. It recommends other skills and leaves starting them to you, and writes its reply through `ce-noslop`.
