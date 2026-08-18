---
name: ce-ideate
description: "Generate and evaluate grounded ideas. Use when the user wants ideas, improvements, or surprising directions before choosing one to develop. Not for refining an idea they already have (ce-brainstorm) or judging one already on the table (ce-pov)."
argument-hint: "[feature, focus area, or constraint] [output:md]"

---

# Generate Improvement Ideas

**The current year is 2026** — use it when dating documents and checking recent artifacts.

`ce-ideate` runs before `ce-brainstorm`. This skill answers "which ideas are worth exploring?" `ce-brainstorm` then answers what one chosen idea should mean. `ce-plan` answers how it gets built.

**Done:** a ranked ideation artifact is written to `<root>/ideation/` when that root is present, else to a CE temp path. Every idea generated has been critiqued, and the survivors are explained. The user is left holding the next-steps menu. No requirements, plans, or code.

## Boundaries

1. **Ground before ideating.** No advice detached from the repo.
2. **Generate many, critique all, explain survivors only.** Generate the full candidate list before critiquing any of it. Rejection is explicit and carries a reason; this is not optimistic ranking.
3. **Route action into brainstorming.** Never skip from ideation output to planning.
4. **Never dispatch on an unidentified subject.** Ask instead, through the platform's blocking question tool: `AskUserQuestion` on Claude Code, `request_user_input` on Codex, `ask_question` on Antigravity, `ask_user` on Pi. Where none of those exists, offer numbered options on the user-visible surface. Never skip a question silently. Keep "Surprise me" a real option, alongside a Cancel that exits cleanly. Do not ask about solution direction, constraints, audience, tone, or success criteria — `ce-brainstorm` owns those. If it takes more than 3 questions, ideation is the wrong workflow.
5. **Never print the internal taxonomy label.** The labels `repo-grounded`, `elsewhere-software`, and `elsewhere-non-software` route dispatch only. Describe the mode to the user in the topic's own words.
6. **Warn and proceed when grounding fails.**
7. **Surface the cost line before dispatching.**

The **focus hint** is any optional context this run was invoked with, from the user or from a calling skill. The rest of this skill calls it `{focus_hint}`.

## Setup

Run this once at the start of the invocation, before any question or dispatch, and follow the directives it prints. Where one of those directives conflicts with this skill's own rules on asking questions, this skill wins and no blocking question is asked — whether the directive is scoped to a mode or not. Run the fence exactly as written, as its own command: do not pipe, filter, truncate, or bundle it. Its output opens with `=== skill context` and ends with `CE_CONTEXT_END`. If you get one of those lines without the other, rerun it once. With no Node runtime, proceed unchanged.

```bash
SKILL_DIR="<absolute path of the directory containing the SKILL.md you just read>";
NODE="$(for c in node nodejs; do command -v "$c" >/dev/null 2>&1 && "$c" -e '' >/dev/null 2>&1 && { echo "$c"; break; }; done)";
if [ -n "$NODE" ]; then
"$NODE" "$SKILL_DIR/scripts/context.mjs" || echo "context script failed; continue with the skill's normal behavior";
else
echo "no Node runtime; continue with the skill's normal behavior";
fi
```

## Artifact Root

Artifacts go under `<root>/ideation/`, and learnings are read from `<root>/solutions/`. Resolve `<root>` only when you are about to compose one of those paths, and never before the mode is classified — an elsewhere or no-repo run writes to a temp directory and never needs it. Pass a subagent the resolved path, not the config.

<!-- ce-docs-root:start -->
**Resolve the CE artifact root `<root>` before composing any artifact path.**

- **Read** `docs_root` from `<repo-root>/.compound-engineering/config.yaml` only (`<repo-root>` = `git rev-parse --show-toplevel`). Do not read it from `config.local.yaml`. Unset -> `<root>` is `docs`, exactly as before.
- **Validate** a set value: a repo-relative directory whose real, symlink-resolved path stays inside the repo and is neither the repo root nor under `.git/`. Otherwise stop with an error naming `docs_root` and the value -- never fall back to `docs`.
- **Use** `<root>` as the sole artifact location: create it if absent, compose each path as `<root>/<subdir>` with this skill's own subdirectory, and never also read `docs`.
<!-- ce-docs-root:end -->

## Phase 0: Resume and Scope

When the subject, mode, and format are already clear, resolve this phase in one pass. The gates below are for the ambiguous cases.

**Output mode is exclusive.** A run produces HTML (`.html`) or markdown (`.md`), never both. A pipeline or `disable-model-invocation` context forces `md`. Otherwise precedence runs from a request in this prompt, through a stated user preference and config (`ideate_output:`), down to the `html` default.

Read `references/output-mode.md` whenever a format is resolved. The read is required. It owns each step of the decision, and the 30-day recent-work check: when a relevant recent doc exists, update it in place in its own format rather than writing a duplicate, unless an explicit `output:` this run switches the format.

<!-- ce-config-layers:start -->
**Resolve ordinary CE yaml keys from the two repo files.**

- **Read** `<repo-root>/.compound-engineering/config.local.yaml`, then `config.yaml` (`<repo-root>` = `git rev-parse --show-toplevel`). Missing files are skipped. Gitignore does not change resolution.
- **Win** with the first active (non-commented) value. For scalars, empty is unset; an invalid value continues to the next layer, then the skill default. For lists and maps, a present key — including an empty list or map — replaces the whole key.
- **Do not** use this rule for `docs_root` — that key is `config.yaml` only.
<!-- ce-config-layers:end -->

**Non-software routing.** A topic with no software surface runs elsewhere-mode grounding rather than the repo scan. It then follows `references/universal-ideation.md` in place of Phase 2's frames and the Phase 5 menu. The deliverable is still written automatically.

**The gates.** Read `references/scope-gates.md` before any grounding dispatch. The read is required. That reference owns every Phase 0 gate, plus the surprise-me and tactical deltas. Ask when the subject is not identifiable. `go deep` beats a tactical signal.

## Phase 1: Mode-Aware Grounding

Read `references/grounding.md` before dispatching any grounding agent. The read is required. That reference owns every dispatch in this phase, including the routing test that runs *before* either dispatch block. Grounding runs in parallel, in the **foreground**.

Scratch lives beneath the effective user's private CE root: `/tmp/compound-engineering-<uid>` when that is usable, else the validated `$TMPDIR` fallback — never `.context/`. Generate one 8-hex `<run-id>` and reuse it for the cache and for every checkpoint.

## Phase 1.5: Topic-Surface Decomposition

Before frames are dispatched, decompose the topic into 3-5 orthogonal **axes** — what aspects of the subject to think about. Read `references/decomposition.md`. The read is required except in surprise-me mode or on an atomic subject; those are the only two skips. Append the axis list, or the skip reason, to the grounding summary under `Topic axes`. Evidence scouts are repo-mode only.

## Phase 2: Divergent Ideation

Read `references/divergent-ideation.md` before building any dispatch prompt. The fleet, the frames, and the generation rules live only there. Once its merge, synthesis, and axis-coverage steps are complete, load `references/post-ideation-workflow.md`. The filtering rubric, the Phase 4 auto-write, and the Phase 5 menu live only there.
