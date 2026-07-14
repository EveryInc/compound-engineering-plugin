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

## Context

Skills routinely need the user's invocation input — both as free-form description and as flag tokens like `output:html`, `mode:headless`, `delegate:codex`. The established mechanism is the Claude Code `$ARGUMENTS` substitution: the harness replaces `$ARGUMENTS` in the skill body with the user's argument string before the model sees it. This plugin is authored once and converted to Codex, Cursor, Gemini, and Kiro, so the question is whether `$ARGUMENTS` ports.

It is a sibling of the bundled-script path problem (see `bundled-script-path-resolution-across-harnesses.md`): a Claude-Code-specific construct that looks portable in source but isn't guaranteed off Claude. It surfaced while reframing the output-format precedence in `ce-plan`/`ce-brainstorm`/`ce-ideate`: the resolution prose said "scan `$ARGUMENTS` for a token starting with `output:`," which is Claude-only phrasing for what is really "the user typed a format request in their prompt."

## Guidance

**`$ARGUMENTS` substitution inside a SKILL.md body is only confirmed on Claude Code.** Per the target specs in `docs/specs/`: Codex documents `$1`–`$9`, `$ARGUMENTS`, and named placeholders for **prompts** (skill-body behavior is not documented); Cursor documents only `$1`/`$2` for commands; Kiro lists `$ARGUMENTS` interpolation as **"Lost."** The converter rewrites the `argument-hint` frontmatter into an `## Arguments` section but does **not** rewrite inline body `$ARGUMENTS` (the OpenCode writer even emits it deliberately). So inline `$ARGUMENTS` in skill prose is a portability risk off Claude.

Separate the two uses — they take different fixes:

- **Reasoning / flag detection** ("scan `$ARGUMENTS` for `output:`/`mode:`"). The agent does not need the token here — the user's request is already in its context on every harness. Phrase it harness-neutrally: **reason over the user's prompt** for the intent, honoring both the shorthand token (`output:html`) and plain language ("make this a webpage"). Add the discriminating guard: a format/flag named as **subject matter** ("add an HTML export feature", "plan the CSV importer") is the work, not a flag — do not act on it.
- **Input injection** (`<feature_description> #$ARGUMENTS </feature_description>`). On Claude this is *how* the description reaches the agent inline, but the token is not actually necessary — the user's request is redundantly present in the agent's context on every harness (Claude Code invokes a skill via the Skill tool, so the user's turn stays in the transcript; the OpenCode converter injects args through its own command stub; Codex/Gemini/Cursor load the skill mid-conversation). Two tiers of fix, in increasing cleanliness:
  - *Minimal (graceful degradation):* keep the token but pair it with a fallback — *"if this shows a literal `$ARGUMENTS`, the harness did not substitute it — use the user's actual request from the conversation."* Mirrors the pre-resolution-with-fallback pattern AGENTS.md prescribes for `${CLAUDE_PLUGIN_ROOT}`. Fixes the failure but leaves the Claude-only token in place with prose wrapped around it.
  - *Preferred (remove the token entirely):* replace the slot with a prose binding that reads the input from the invocation — e.g. "the **feature description** is the input this skill was invoked with, present in the current prompt or conversation." This removes the "was it substituted?" question by construction instead of papering over it. Three things must be preserved when you do this:
    1. **Named references.** Several skills use the injection tag as a *variable* elsewhere (`<input_document>`, `<bug_description>`, `{focus_hint}`), so define the name in the prose ("the rest of this skill refers to it as `<input_document>`") rather than orphaning those references.
    2. **Empty/clarify handling.** Route a missing input into the skill's own "ask the user" / "proceed open-ended" path rather than adding a competing one.
    3. **Caller-neutral semantics — the subtle one.** `$ARGUMENTS` is *whatever the skill was invoked with*, by **any** caller. Bind the input to "the input this skill was invoked with," **not** "the user's request" — because a skill is often invoked by *another skill* in `mode:pipeline` (e.g. `ce-babysit-pr` calls `ce-debug` passing failing jobs and log tails as the argument; `lfg` calls `ce-plan`/`ce-work` with a payload). A binding that says "read the user's request" makes a pipeline-delegated skill ignore the caller's payload and parse an empty input, silently breaking the autonomous path. This was caught in review on `ce-debug`'s binding: the first-pass rewrite narrowed the input to "the user," and the fix was to phrase it as the invocation input from the user *or* a calling skill. The prose-logic phrasing "the arguments you were invoked with" was already caller-neutral; only the injection-slot bindings needed this widening.

  This was applied to every injection-slot skill in #1110 (open as of this writing).

## Why This Matters

The failure is **recoverable and loud**, which is why this is `medium`, not `high`. Because the user's input is redundantly present in the conversation, a capable agent on Cursor/Kiro that meets a literal `$ARGUMENTS` routes around it and uses the real request; and if it does misfire, the output is visibly wrong (`$ARGUMENTS` echoed, or "planning $ARGUMENTS") and the user re-prompts. Contrast the silent-failure class — bundled-script `exit 127`, an empty `${CLAUDE_PLUGIN_ROOT}` — where nothing announces the break.

The quieter, higher-value risk is **flag-scanning**: an unsubstituted token means the scan finds no flag and falls to defaults — harmless for `output:` (defaults to `md`), but a missed `mode:` could skip an intended mode without any visible signal. Reasoning over the prompt removes that failure mode entirely.

Dominant harnesses (Claude native, Codex documented for prompts) are fine; the genuinely-exposed slice is Cursor/Kiro users invoking a flag-scanning skill on a weaker model. Worth fixing for robustness, not worth treating as a blocker.

## When to Apply

- Any skill that reads invocation arguments inside SKILL.md — especially one that **scans for flag tokens** rather than only injecting a description.
- When generalizing a Claude-only mechanism for cross-harness use: prefer describing the **capability** ("the user's prompt for this run") over naming the **token** (`$ARGUMENTS`), consistent with AGENTS.md "Platform-Specific Variables in Skills."

## Examples

Flag detection — before (Claude-only) vs after (harness-neutral), from the output-format resolution tier:

```text
# Before
1. CLI arg. Scan $ARGUMENTS for a token starting with the literal prefix
   output:. If found, strip it from arguments before treating the remainder
   as the feature description.

# After
1. In-prompt request. Reason over the user's prompt for this run for a request
   about this document's output format, expressed either as the output:
   shorthand or in plain language ("make the plan a webpage"). Ignore the
   output: token when reading the rest of the prompt as the feature
   description. Distinguish a request about the document's format from a format
   named as subject matter: "add an HTML export feature" is the work, not a
   doc-format request — do not switch on it.
```

Injection point — two fixes. Minimal (keep the token, add a fallback):

```text
<feature_description> #$ARGUMENTS </feature_description>

(If the block above shows a literal "$ARGUMENTS", your harness did not
substitute it — use the user's actual request from the conversation.)
```

Preferred (remove the token; bind the input in prose, preserving the named
reference downstream logic uses):

```text
The input document for this run is the input this skill was invoked with —
present in the current prompt or conversation, whether the user provided it
directly or a calling skill passed it (e.g. in mode:pipeline). The rest of this
skill refers to it as <input_document>; if nothing was provided, treat
<input_document> as blank.
```

**Status / scope note (updated 2026-07-12):** both items the original capture deferred are now done, and the fix landed cleaner than the deferred plan.

- **The broad sweep is complete, via removal rather than fallback.** Every `$ARGUMENTS` reference was removed from all skill *bodies* — five prose-logic references reworded to "the arguments you were invoked with," and ten input-injection slots converted to conversation-sourced prose bindings (preserving named references and each skill's empty/clarify handling). Done in #1110 (open as of this writing). The OpenCode command-stub converter still emits its own `$ARGUMENTS` (`src/converters/claude-to-opencode.ts`) and is untouched — removal applies to skill bodies, not the converter's generated command entry.
- **The empirical question is settled by the 2-harness probe the original note called for.** The *current* skill bodies (no `$ARGUMENTS`) were injected into fresh Claude and Codex subagents across five input-ingestion cases — explicit request, empty/bare invocation, `mode:` token stripping, blank-input discovery, and subject identification — covering `ce-plan`, `ce-work`, and `ce-pov`. Result: **5/5 on both hosts**, every run confirming no `$ARGUMENTS` reliance. Codex derived the input from the conversation, stripped mode tokens, and hit the ask/discovery paths identically to Claude. So "reason over the prompt / read from the conversation" is verified cross-host, not just reasoned from specs.

Still open (low-priority): a portability note in AGENTS.md's "Platform-Specific Variables in Skills" section — `$ARGUMENTS` is still not called out there by name. See `bundled-script-path-resolution-across-harnesses.md` and `codex-skill-prompt-entrypoints.md` for adjacent cross-harness skill-portability findings.
