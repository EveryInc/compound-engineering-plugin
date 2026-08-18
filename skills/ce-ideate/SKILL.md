---
name: ce-ideate
description: "Generate and evaluate grounded ideas. Use when the user wants ideas, improvements, or surprising directions before choosing one to develop. Not for refining an idea they already have (ce-brainstorm) or judging one already on the table (ce-pov)."
argument-hint: "[feature, focus area, or constraint] [output:md]"

---

# Generate Improvement Ideas

**The current year is 2026** — use it when dating documents and checking recent artifacts.

`ce-ideate` precedes `ce-brainstorm`: this skill answers "which ideas are worth exploring?", `ce-brainstorm` "what should the chosen one mean?" (writing a requirements-only unified plan under `<root>/plans/`), `ce-plan` "how is it built?"

**Done:** a ranked ideation artifact — ideas generated, all critiqued, survivors explained — written to `<root>/ideation/` when present, else a CE temp path, with the user holding the next-steps menu. No requirements, plans, or code.

## Boundaries

1. **Ground before ideating** — no advice detached from the repo.
2. **Generate many -> critique all -> explain survivors only.** Generate the full candidate list before critiquing any of it; the mechanism is explicit rejection with reasons, not optimistic ranking.
3. **Route action into brainstorming** — never skip from ideation output to planning.
4. **Never dispatch on an unidentified subject.** Ask through the platform's blocking question tool — `AskUserQuestion` (Claude Code), `request_user_input` (Codex), `ask_question` (Antigravity), `ask_user` (Pi), else numbered options on the user-visible surface — never skip a question silently, and keep "Surprise me" a real option alongside a Cancel that exits cleanly. Never ask about solution direction, constraints, audience, tone, or success criteria — `ce-brainstorm` owns those. Past 3 questions, ideation is the wrong workflow.
5. **Never print the internal taxonomy label** (`repo-grounded`, `elsewhere-software`, `elsewhere-non-software`) — state the mode in the topic's own words; labels route dispatch only.
6. **Warn and proceed on grounding failure**; surface the cost line before dispatching.

The **focus hint** is any optional context this run was invoked with, from the user or a calling skill; below it is `{focus_hint}`. Only literal-prefix flags (`output:`, `mode:`) are stripped — other `<word>:<word>` tokens, including `feat:`, pass through.

## Setup

Run this once at the start of this invocation, before any question or dispatch, and follow the directives it prints, except where one conflicts with this skill's own rules on asking questions — scoped to a mode or not, this skill wins and no blocking question is asked. Run the fence exactly as written, as its own command: no piping, filtering, truncating, or bundling. Its output opens with `=== skill context` and ends with `CE_CONTEXT_END`; on one without the other, rerun once. With no Node runtime, proceed unchanged.

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

Artifacts go under `<root>/ideation/`, learnings from `<root>/solutions/`. Resolve `<root>` only when composing such a path, never before mode is classified — the no-repo flow writes to a temp directory — and pass subagents the resolved path, not the config.

<!-- ce-docs-root:start -->
**Resolve the CE artifact root `<root>` before composing any artifact path.**

- **Read** `docs_root` from `<repo-root>/.compound-engineering/config.yaml` only (`<repo-root>` = `git rev-parse --show-toplevel`). Do not read it from `config.local.yaml`. Unset -> `<root>` is `docs`, exactly as before.
- **Validate** a set value: a repo-relative directory whose real, symlink-resolved path stays inside the repo and is neither the repo root nor under `.git/`. Otherwise stop with an error naming `docs_root` and the value -- never fall back to `docs`.
- **Use** `<root>` as the sole artifact location: create it if absent, compose each path as `<root>/<subdir>` with this skill's own subdirectory, and never also read `docs`.
<!-- ce-docs-root:end -->

## Phase 0: Resume and Scope

With subject, mode, and format already clear, resolve this phase in one pass — the gates are for ambiguity.

**Output mode is exclusive** — HTML (`.html`) OR markdown (`.md`), never both. Precedence: in-prompt request > user-stated preference > config (`ideate_output:`) > default (`html`); a pipeline or `disable-model-invocation` context forces `md`. Read `references/output-mode.md` whenever a format is resolved — a non-optional load owning every step and the 30-day recent-work check: a relevant recent doc is updated in place in its own format, never duplicated, unless an explicit `output:` this run switches it.

<!-- ce-config-layers:start -->
**Resolve ordinary CE yaml keys from the two repo files.**

- **Read** `<repo-root>/.compound-engineering/config.local.yaml`, then `config.yaml` (`<repo-root>` = `git rev-parse --show-toplevel`). Missing files are skipped. Gitignore does not change resolution.
- **Win** with the first active (non-commented) value. For scalars, empty is unset; an invalid value continues to the next layer, then the skill default. For lists and maps, a present key — including an empty list or map — replaces the whole key.
- **Do not** use this rule for `docs_root` — that key is `config.yaml` only.
<!-- ce-config-layers:end -->

**The gates.** Read `references/scope-gates.md` before any grounding dispatch — a non-optional load owning every Phase 0 gate and the surprise-me and tactical deltas. They settle three things: is the subject identifiable (ask if not), which mode it is, and which depth override is active — `go deep` beats a tactical signal.

**Non-software routing.** A topic with no software surface runs elsewhere-mode grounding, never the repo scan, then follows `references/universal-ideation.md` in place of Phase 2's frames and the Phase 5 menu; the deliverable is still auto-written.

## Phase 1: Mode-Aware Grounding

Read `references/grounding.md` before dispatching any grounding agent — a non-optional load owning every dispatch here, the issue-intelligence protocol and its one blocking question, the routing test that runs *before* either dispatch block, and the consolidated summary. Grounding runs in parallel in the **foreground**.

Scratch lives beneath the effective user's private CE root — `/tmp/compound-engineering-<uid>` when usable, else the validated `$TMPDIR` fallback — never `.context/`. Generate one 8-hex `<run-id>`, reused for the cache and every checkpoint.

## Phase 1.5: Topic-Surface Decomposition

Before frames are dispatched, decompose the topic into 3-5 orthogonal **axes** naming *what aspects of the subject to think about*: frames decide *how* to think, axes *what* to think on; without them parallel frames converge on the most salient reading. Read `references/decomposition.md` — non-optional unless this is surprise-me mode or the subject is atomic, the only two skips — and append the axis list or skip-reason to the grounding summary under `Topic axes`. Evidence scouts are repo-mode only.

## Phase 2: Divergent Ideation

Read `references/divergent-ideation.md` before building any dispatch prompt — the fleet, payload, six frames, per-idea contract, and generation rules live only there. Only after its merge, synthesis, and axis-coverage steps complete, load `references/post-ideation-workflow.md`: the filtering rubric, the Phase 4 auto-write, and the Phase 5 menu live only there.
