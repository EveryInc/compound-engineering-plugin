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
3. **Send the user to brainstorming for action.** Never skip from ideation output to planning.
4. **Never dispatch on an unidentified subject.** Ask instead, through the host's blocking question tool already in the current tool list (match by capability, not by a host-specific name). Presence in the current tool list is proof the tool exists; never call a user-facing question tool to discover whether it exists. If a matching tool is listed but unloaded, use the host's tool-discovery primitive to load that capability — do not search for another host's tool name. Where no such tool is in the list, offer numbered options on the user-visible surface. Never skip a question silently. Keep "Surprise me" a real option, alongside a Cancel that exits cleanly. Do not ask about solution direction, constraints, audience, tone, or success criteria; `ce-brainstorm` asks those. If it takes more than 3 questions, ideation is the wrong workflow.
5. **Never print the internal taxonomy label.** The labels `repo-grounded`, `elsewhere-software`, and `elsewhere-non-software` only decide which agents to dispatch. Describe the mode to the user in the topic's own words.
6. **Warn and proceed when grounding fails.**
7. **Show the user the cost line before dispatching.**

The **focus hint** is any optional context this run was invoked with, from the user or from a calling skill. The rest of this skill calls it `{focus_hint}`.


## Artifact Root

Artifacts go under `<root>/ideation/`, and learnings are read from `<root>/solutions/`. Resolve `<root>` only when you are about to compose one of those paths, and never before the mode is classified — an elsewhere or no-repo run writes to a temp directory and never needs it. Pass a subagent the resolved path, not the config.

<!-- ce-docs-root:start -->
**Resolve the CE artifact root `<root>` before composing any artifact path.**

- **Read** `docs_root` from `<repo-root>/.compound-engineering/config.yaml` only (`<repo-root>` = `git rev-parse --show-toplevel`). Do not read it from `config.local.yaml`. Unset -> `<root>` is `docs`, exactly as before.
- **Validate** a set value: a repo-relative directory whose real, symlink-resolved path stays inside the repo and is neither the repo root nor under `.git/`. Otherwise stop with an error naming `docs_root` and the value -- never fall back to `docs`.
- **Use** `<root>` as the sole artifact location: create it if absent, compose each path as `<root>/<subdir>` with this skill's own subdirectory, and never also read `docs`.
<!-- ce-docs-root:end -->

## Phase 0: Resume and Scope

Both reads this phase names are required, even when the subject, mode, and format look clear. Those two references define the resume check, the format decision, and the scope classification. Nothing here is resolved before reading them.

**Output mode is exclusive.** A run produces HTML (`.html`) or markdown (`.md`), never both. Precedence runs from a request in this prompt, through a stated user preference and config (`ideate_output:`), down to the `html` default; a headless run resolves the format the same way, with no pipeline override.

Read `references/output-mode.md` whenever a format is resolved. The read is required. It defines each step of the decision, and the 30-day recent-work check that decides whether this run updates an existing doc instead of writing a new one.

<!-- ce-config-layers:start -->
**Resolve ordinary CE yaml keys from the two repo files.**

- **Read** `<repo-root>/.compound-engineering/config.local.yaml`, then `config.yaml` (`<repo-root>` = `git rev-parse --show-toplevel`). Missing files are skipped. Gitignore does not change resolution.
- **Win** with the first active (non-commented) value. For scalars, empty is unset; an invalid value continues to the next layer, then the skill default. For lists and maps, a present key — including an empty list or map — replaces the whole key.
- **Do not** use this rule for `docs_root` — that key is `config.yaml` only.
<!-- ce-config-layers:end -->

**Non-software routing.** A topic with no software surface runs elsewhere-mode grounding rather than the repo scan. It then follows `references/universal-ideation.md` in place of Phase 2's frames and the Phase 5 menu. The deliverable is still written automatically.

**The Phase 0 checks.** `references/scope-gates.md` defines every Phase 0 check, plus what changes in surprise-me and tactical runs. Ask when the subject is not identifiable. `go deep` beats a tactical signal.

## Phase 1: Mode-Aware Grounding

Read `references/grounding.md` before dispatching any grounding agent. The read is required. That reference defines every dispatch in this phase, including the routing test that runs *before* either dispatch block. Grounding runs in parallel, in the **foreground**.

Scratch lives beneath the effective user's private CE root: `/tmp/compound-engineering-<uid>` when that is usable, else the validated `$TMPDIR` fallback, and never `.context/`. Generate one 8-hex `<run-id>` and reuse it for the cache and for every checkpoint.

## Phase 1.5: Topic-Surface Decomposition

Before frames are dispatched, decompose the topic into 3-5 orthogonal **axes** — what aspects of the subject to think about. Read `references/decomposition.md`. Surprise-me mode is the only case that skips this phase. That file's own criteria decide whether a subject is too small to split, so make that judgment after the read. Append the axis list, or the skip reason, to the grounding summary under `Topic axes`. Evidence scouts are repo-mode only.

## Phase 2: Divergent Ideation

Read `references/divergent-ideation.md` before building any dispatch prompt. The fleet, the frames, and the generation rules live only there. When its merge, synthesis, and axis-coverage steps are complete, continue with `references/post-ideation-workflow.md`, which it names as the next required read.
