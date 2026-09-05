---
title: "$ARGUMENTS is reliably substituted inside SKILL.md only on Claude Code — reason over the user's prompt instead"
date: 2026-06-26
last_updated: 2026-07-12
category: skill-design
module: "skills (argument handling across harnesses)"
problem_type: convention
component: tooling
severity: medium
applies_when:
  - Authoring or reviewing a skill that needs the user's invocation arguments inside SKILL.md
  - A skill must work on more than one harness (Claude Code, Codex, Cursor, Gemini, Kiro)
  - "Scanning the prompt for a flag token (output:, mode:, delegate:) rather than only injecting a description"
  - Deciding whether to depend on the $ARGUMENTS substitution token in skill body prose
tags:
  - skill-authoring
  - cross-harness
  - arguments
  - claude-arguments
  - prompt-reasoning
  - portability
  - flag-parsing
related_components:
  - development_workflow
  - documentation
---

# $ARGUMENTS is reliably substituted inside SKILL.md only on Claude Code — reason over the user's prompt instead

## Per-host substitution facts

`$ARGUMENTS` substitution inside a SKILL.md **body** is confirmed only on Claude Code. Per each platform's own documentation: Codex documents `$1`–`$9`, `$ARGUMENTS`, and named placeholders for **prompts** (skill-body behavior is not documented); Cursor documents only `$1`/`$2` for commands; Kiro lists `$ARGUMENTS` interpolation as "Lost." The converter rewrites the `argument-hint` frontmatter into an `## Arguments` section but does not rewrite inline body `$ARGUMENTS`. The OpenCode command stub (`src/converters/claude-to-opencode.ts`) emits its own `$ARGUMENTS` deliberately; that is the generated command entry, not a skill body, and is fine.

No skill body in this repo uses the token any more (#1110). Do not reintroduce it.

## Why the token is never necessary

The user's request is redundantly present in the agent's context on every harness: Claude Code invokes a skill via the Skill tool so the user's turn stays in the transcript; OpenCode injects args through its command stub; Codex, Gemini, and Cursor load the skill mid-conversation. So both uses of the token have a harness-neutral replacement:

- **Flag detection** ("scan `$ARGUMENTS` for `output:`/`mode:`"): reason over the user's prompt for the intent, honoring both the shorthand token and plain language ("make this a webpage"). Add the discriminating guard: a format or flag named as **subject matter** ("add an HTML export feature") is the work, not a flag.
- **Input injection** (`<feature_description> #$ARGUMENTS </feature_description>`): bind the input in prose ("the input this skill was invoked with, present in the current prompt or conversation"), define the name downstream logic uses (`<input_document>`), and route a missing input into the skill's existing ask/proceed path rather than adding a competing one.

## The caller-neutral binding trap

`$ARGUMENTS` is *whatever the skill was invoked with*, by **any** caller. When replacing it with prose, bind the input to "the input this skill was invoked with," **not** "the user's request." Skills are routinely invoked by other skills in `mode:pipeline` (`ce-babysit-pr` calls `ce-debug` with failing jobs and log tails; `lfg` calls `ce-plan`/`ce-work` with a payload). A binding that says "read the user's request" makes a pipeline-delegated skill ignore the caller's payload and parse an empty input, silently breaking the autonomous path. This was caught in review on `ce-debug`'s binding: the first rewrite narrowed the input to "the user"; the fix was "from the user *or* a calling skill."

## Why medium, not high

An unsubstituted injection token fails loudly (`$ARGUMENTS` echoed, "planning $ARGUMENTS") and a capable agent routes around it. The quiet risk is flag scanning: an unsubstituted token means the scan finds no flag and silently falls to defaults, so a `mode:` could be skipped with no visible signal. Reasoning over the prompt removes that failure mode. A 2-harness probe (Claude and Codex, five input-ingestion cases across `ce-plan`, `ce-work`, `ce-pov`) confirmed the token-free bodies derive input, strip mode tokens, and hit the ask/discovery paths identically on both hosts.

## Related

- `bundled-script-path-resolution-across-harnesses.md`: the sibling class, a Claude-only construct that looks portable in source.
- AGENTS.md "Platform-Specific Variables in Skills": describe the capability, not the token. `$ARGUMENTS` is still not named there.
