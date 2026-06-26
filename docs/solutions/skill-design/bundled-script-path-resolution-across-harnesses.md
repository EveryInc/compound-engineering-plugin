---
title: "Reference bundled skill files by tier: relative for reads, SKILL_DIR anchor for executed scripts"
date: 2026-06-26
category: skill-design
module: "skills (bundled-script invocation across harnesses)"
problem_type: convention
component: tooling
severity: high
applies_when:
  - Authoring or reviewing a skill that executes a bundled script via the Bash tool
  - A skill must work on more than one harness (Claude Code, Codex, Cursor, Gemini)
  - "Choosing between a bare relative path, ${CLAUDE_SKILL_DIR}, and a model-filled SKILL_DIR anchor"
  - Generalizing an empirical harness finding into a broad authoring rule
tags:
  - bundled-scripts
  - path-resolution
  - skill-authoring
  - cross-harness
  - skill-dir
  - bash-tool
  - claude-skill-dir
  - empirical-validation
related_components:
  - development_workflow
  - documentation
---

# Reference bundled skill files by tier: relative for reads, SKILL_DIR anchor for executed scripts

## Context

Skills bundle files the agent uses at runtime: reference docs, schemas, and `scripts/`. Getting paths to those files to resolve correctly across harnesses (Claude Code, Codex, Cursor) has been a recurring bug class — see closed issues #764 (`ce-worktree`), #811 (`ce-code-review`), #898 (`ce-compound`), all "script path resolved against the project root, not the skill dir," plus the still-open #944 ("reconcile contradictory AGENTS.md guidance on bare relative paths") and #949 (a live prose-reference variant).

The trigger for this learning was a wrong turn. An empirical finding — *the Bash tool's working directory is the user's project root, not the skill directory, on Claude Code, Codex, and Cursor* — was over-generalized into "bare relative paths like `bash scripts/x.sh` are broken, so anchor every invocation." That conclusion was codified and acted on before it was checked against the cross-tool skill spec or any independent implementation. It turned out to be wrong on the strong form: bare relative paths work fine in practice. The correction produced the tiered model below, and a transferable lesson about validating findings before codifying them.

## Guidance

Pick the reference form by **what the agent does with the file**, in three tiers.

**Tier 1 — Read-time file references (the agent *reads* a co-located file into context, e.g. `references/*.md`).** Bare relative path from the skill root, no anchor — the skill loader resolves these against the skill directory on every major harness (the form AGENTS.md Tier 1 codifies). The line vs Tier 2: reading a reference *into context* is Tier 1; the moment the file is used in an *action the agent performs* (copy it, pass it as an argument, execute it) it becomes Tier 2 and takes the cue. Open caveat (#949): if a `Read references/X` is ever observed to resolve against the project CWD and miss on a target, treat that read as Tier 2 and add the "from this skill's directory" cue.

```
Read `references/schema.yaml` and validate frontmatter against it.
```

**Tier 2 — Prose pointers to a bundled file the agent acts on but does *not* execute** (a template to copy, a file to inspect). Bare relative path **plus an explicit "from this skill's directory" cue**, so the agent resolves it against the skill dir rather than the project CWD.

```
Copy `scripts/hook.sh` from this skill's directory into `.claude/hooks/`.
```

**Tier 3 — Executed shell commands** (fenced ```bash``` blocks *or* inline `bash …` / `python …` the agent runs through the Bash tool). Use the **model-filled `SKILL_DIR` anchor**, set inline in the same command (shell state does not persist between separate Bash-tool calls):

```bash
SKILL_DIR="<absolute path of the directory containing the SKILL.md you just read>"
bash "$SKILL_DIR/scripts/measure.sh" "$ARG"
```

This is the conservative **house default** for executed shell — not because bare relative "fails," but because it bakes resolution into the command so a fenced block copied verbatim into a Bash call cannot miss, regardless of harness or model version.

Two adjacent rules:

- **Avoid `${CLAUDE_SKILL_DIR}`.** It is a Claude-Code-only SKILL.md *content* substitution (not an env var) and is empty on every other host. A `${CLAUDE_SKILL_DIR}`-guarded call's `then` branch then silently never fires off-Claude — a genuine silent skip. This plugin ships as a *native* Codex plugin (the converter is not in that path), so a Claude-only mechanism is a footgun, not a neutral fallback. The model-filled `SKILL_DIR` anchor works on every host with no downside. (Narrow exception: behavior that is genuinely Claude-only and will never run elsewhere — essentially never, given the cross-host install model.)
- **A script that needs its *own* directory** (to open a sibling file from inside the process) derives it from `BASH_SOURCE`, not `SKILL_DIR` — `SKILL_DIR` is the orchestrator's shell variable and is not exported to the child process.

### Where this is codified

`AGENTS.md` > "Platform-Specific Variables in Skills" codifies this three-tier model as the repo's authoring rule; this learning is the rationale and worked examples behind it. A few legacy `${CLAUDE_SKILL_DIR}` uses are still being migrated to the anchor (e.g. `ce-compound`'s `validate-frontmatter.py`), tracked by #944. Note `tests/skill-conventions.test.ts` enforces an existence guard only when a skill-dir *platform var* is used — it does not forbid the model-filled `SKILL_DIR` anchor (which uses no platform var), so anchor-based skills pass it.

## Why This Matters

There are two payoffs, and the second is the larger one.

First-order: correctness. A bundled script that silently no-ops on a non-Claude host, or resolves the wrong path, fails quietly in a user's environment and is hard to catch in review. The tier rules remove that class of failure while keeping the simple cases simple.

Second-order — the meta-lesson: **a single empirical finding is not an authoring rule until it is validated against the spec and independent implementations.** "The shell's CWD is the project root" is a true, narrow *harness fact*. It was inflated into "bare relative is broken" without checking the actual *resolution mechanism* — which is the agent, not the shell. The agentskills.io spec says it directly: relative script paths work because "the agent resolves these paths automatically." Conflating "where the shell starts" with "who resolves the path" produced guidance that diverged from the ecosystem and added unnecessary machinery. Distinguish the harness fact from the resolution mechanism, and confirm any broad rule against the cross-tool spec plus two or three real skills before codifying it. Vendor docs alone do not settle a cross-harness question — they are platform-centric by construction (e.g., Anthropic's Claude Code docs recommend `${CLAUDE_SKILL_DIR}`, which is exactly the non-portable form to avoid here).

The evidence that corrected the over-generalization, for the record: the agentskills.io spec ships bare `bash scripts/validate.sh` as its canonical example; obra/superpowers' `brainstorming` skill runs bare `scripts/start-server.sh` with no anchor across four named platforms; its `subagent-driven-development` skill pairs a bare relative path with a "from this skill's directory" cue (Tier 2); mattpocock/skills sidesteps in-place execution entirely (copies a hook to `.claude/hooks/`, or ships a `.template.sh` referenced in prose); and `last30days` adopts the explicit `SKILL_DIR` anchor for its critical multi-host engine — *after* a path-resolution regression. The tiers reconcile all of these: relative is the ecosystem norm and works via agent resolution; the anchor is the determinism upgrade reserved for executed shell.

## When to Apply

- Whenever a SKILL.md or a reference file tells the agent to run a bundled script through the Bash tool (Tier 3).
- When adding files under a skill's `scripts/` that are *executed* rather than *read*.
- When reviewing or migrating a skill that uses `${CLAUDE_SKILL_DIR}` guards — check whether they silently no-op off-Claude and move executed-shell calls to the anchor.
- When weighing "inline logic" vs. "bundled script" for portability — the tiers remove the old fear that bundled scripts are inherently fragile cross-harness; just give executed scripts Tier-3 treatment.
- Do **not** apply the anchor to Tier 1 or Tier 2 references — it adds noise without benefit there.

## Examples

Tier 3 — executed script, before and after:

```bash
# Before: bare relative in a fenced block. Works via agent resolution, but a
# verbatim-copied block resolves against the project root and misses.
bash scripts/measure.sh "$TARGET"
```

```bash
# After: model-filled anchor, deterministic regardless of harness/model.
SKILL_DIR="<absolute path of the directory containing the SKILL.md you just read>"
bash "$SKILL_DIR/scripts/measure.sh" "$TARGET"
```

Anti-pattern — the `${CLAUDE_SKILL_DIR}` existence guard (silently no-ops on Codex/Cursor):

```bash
# AVOID — `then` branch never fires off-Claude, where ${CLAUDE_SKILL_DIR} is unset.
if [ -n "${CLAUDE_SKILL_DIR}" ] && [ -f "${CLAUDE_SKILL_DIR}/scripts/x.sh" ]; then
  bash "${CLAUDE_SKILL_DIR}/scripts/x.sh"
else
  echo "script unavailable"
fi
```

Tier 1 — read-time reference, already correct, no anchor needed:

```
Read `references/schema.yaml` and apply its field definitions.
```

## Related

- [`script-first-skill-architecture.md`](script-first-skill-architecture.md) — *whether* to offload work to a bundled script (token cost). This doc is the companion *how to invoke it* once you have. Low overlap, complementary.
- [`pass-paths-not-content-to-subagents.md`](pass-paths-not-content-to-subagents.md) — path-passing for orchestrator->subagent dispatch; a different "paths" problem (token efficiency, not CWD resolution).
- [`../best-practices/prefer-python-over-bash-for-pipeline-scripts.md`](../best-practices/prefer-python-over-bash-for-pipeline-scripts.md) — which language to write a bundled script in.
- `AGENTS.md` > "Platform-Specific Variables in Skills" — codifies this three-tier model as the repo's authoring rule; this doc is its rationale and worked examples. Its Tier 1 (read-time references) and Tier 2 (prose pointers + cue) address the prose-reference bug class in #949.
- Issues: #944 (open — audit/reconcile bundled-script invocation guidance; this learning informs it), #949 (open — live Tier-2 prose-reference miss), #943/#898/#811/#764 (closed — the Tier-3 origin bug class).
