---
title: "Skill opt-out flags block sibling invocation on every host, so a callee skill must stay model-invokable"
category: skill-design
date: 2026-09-08
module: skills
problem_type: design_pattern
component: tooling
severity: high
applies_when:
  - "A skill is authored so that other skills invoke it (a shared writing, commit, review, or simplify step)"
  - "Deciding whether to set disable-model-invocation or a Codex allow_implicit_invocation policy on a skill to stop it over-triggering"
  - "A caller skill's prose tells the agent how to reach a sibling skill on a host without a skill tool"
tags:
  - skill-invocation
  - disable-model-invocation
  - allow-implicit-invocation
  - cross-harness
  - codex
  - grok
  - activation
  - description-restraint
related_components:
  - development_workflow
---

## Context

While planning `ce-noslop`, a skill that sibling skills invoke at their prose-composition point, the question came up whether it could carry the per-host opt-out flags (`disable-model-invocation: true` on Claude Code and Grok, `policy.allow_implicit_invocation: false` on Codex) to keep it from firing on every prose-shaped prompt. The Claude Code docs say the flag prevents the model from "automatically" loading a skill, which reads as description matching only. Whether a sibling's explicit invocation also counts as model invocation was not stated for any host, so it was measured.

## Guidance

Any skill that another skill must reach stays model-invokable on every host. Restraint against over-triggering comes from the description's condition, never from an opt-out flag. `tests/skill-conventions.test.ts` holds `REQUIRED_MODEL_INVOKED_CALLEES`, the set of skills that pipelines or siblings call; add a new callee there so a later flag fails the suite.

Two facts decide this:

- **A sibling's invocation is model invocation on every host.** The flag blocks it outright, not only description-triggered loading.
- **Codex and Grok have no skill tool.** On those hosts a skill is "invoked" when the model reads the SKILL.md at the path the skills catalog lists. The opt-out flag removes the skill from that catalog, so the model has no path to read. A caller skill that forbids reading the target's SKILL.md breaks invocation on those hosts for the same reason: the read is the mechanism.

Write a caller's invocation line to name the capability, not a mechanism: "invoke the `ce-noslop` skill through this harness's skill mechanism." Do not tell the agent to avoid reading the target's file.

## Why this matters

A skill with the flag set looks correct in the authoring session, where the user invokes it by name, and fails silently everywhere a sibling names it: the caller's own rules were deleted in favor of the invocation, so the prose that skill produces loses the rules with no error. The failure only shows in a fresh session on the sibling's path, which ordinary skill evals do not run.

## Evidence

Measured 2026-09-07 with six headless runs, one caller skill and one target skill per arm, temp skills under `~/.agents/skills` symlinked into `~/.claude/skills`:

| Host | Command | Mechanism a sibling uses | Open target | Locked target |
|---|---|---|---|---|
| Claude Code | `claude -p` | Skill tool | ran, returned its token | Skill tool refused: "cannot be used with Skill tool due to disable-model-invocation" |
| Codex CLI 0.153.3 | `codex exec` | reads the catalog-listed SKILL.md | ran, returned its token | absent from the skills catalog, so no path to read |
| Grok CLI | `grok --prompt-file` | reads the catalog-listed SKILL.md | ran, returned its token | absent from the catalog |

"Locked" meant `disable-model-invocation: true` in frontmatter plus `policy.allow_implicit_invocation: false` in both the frontmatter and the temp skill's own OpenAI agent manifest (a file named `openai.yaml` under its `agents` directory; the temp skills were removed after the run). The Claude Code skills documentation states the flag blocks the Skill tool as well as automatic loading; the Codex skills catalog prompt lists only skills the policy allows; the Grok skills guide says the flag means "only your slash command runs the skill".

A first round on Codex and Grok failed for the wrong reason: the caller forbade reading the target's SKILL.md, and on those hosts that read is the invocation. That is the second fact above.

## When to apply

- Before setting either flag on any skill, check whether a sibling or pipeline names it; if so, the flag is wrong and the description carries the restraint.
- When a caller skill's prose describes how to reach a sibling, describe the capability and leave file reads allowed.
- When a skill eval must prove sibling invocation, run it in a fresh host session with both skills installed, on Codex and Grok as well as Claude Code; the eval cell that loads one skill per run cannot show it.

## Examples

Wrong, in a callee's frontmatter:

```yaml
disable-model-invocation: true
```

Right, in the callee's description: state the condition that should fire it (for example, "Use when asked to make writing plainer or to check it for AI writing tells"), so the description restrains over-triggering while siblings can still invoke the skill, and add the skill to `REQUIRED_MODEL_INVOKED_CALLEES`.

Wrong, in a caller: "Invoke the target skill; do not open its SKILL.md with a file-reading tool." Right: "Invoke the `<target>` skill through this harness's skill mechanism."
