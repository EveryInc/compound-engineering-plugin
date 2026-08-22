---
name: ce-brainstorm
description: "Explore vague or ambitious ideas into a right-sized requirements-only unified plan. Use when the user wants to brainstorm, scope what to build, or needs collaborative product framing before planning. Also use when they must scope work in territory they do not know, or ask for a blindspot pass. Not for executing already-specified work — implementation, debugging, or code review with no product scope left to decide. Not for a verdict on whether to adopt or switch to a named external technology, library, or platform; that is ce-pov."
argument-hint: "[feature idea or problem to explore] [output:html]"
---

# Brainstorm a Feature or Improvement

Brainstorming answers **WHAT** to build through dialogue; `ce-plan` then enriches the same unified plan artifact with **HOW**. This skill does not implement code. **The current year is 2026**, for dating the artifact.

**Outcome:** a right-sized result planning can enrich without inventing product behavior, scope boundaries, or success criteria: a chat paragraph for Lightweight work, or a requirements-only unified plan under `<root>/plans/` when a file is earned.

**Done, on the brainstorm path:** that artifact is written and passes the Ready for Planning Check — or no file was written because the dialogue produced no decision a downstream consumer needs in IDed form and the user asked for none — and Phase 4's handoff has been presented.

**Lightweight work ends in chat.** Phase 0.3 classifies the tier from the request and bounded inline reads before anything is dispatched; when the tier is uncertain, take the heavier one. Lightweight work — small, well-bounded, low ambiguity — ends in a chat paragraph with no file, no grounding scout, no approach generation, and no claim verifier. A file is earned only by a decision a downstream consumer needs in IDed form, or by the user asking for one.

**Stop and route instead** in three cases, decided by `references/phase-0.md`, not from memory. Each ends the run its own way, so the done bar above does not apply: non-software work, where `references/universal-brainstorming.md` replaces Phases 0.2–4; a verdict question about a named external candidate, where you offer the `ce-pov` handoff; and neither — quick help, a factual question, a single-step task — answered directly.

The feature description is what the invocation carries, whether the user wrote it or a calling skill passed it. If none came, ask the user what they want to explore and do not proceed until you have one.


## Artifact Root

Resolve `<root>` the first time you compose or read a `<root>/` path, never earlier; a scratch-only or no-repo run that touches none skips this entirely.

<!-- ce-docs-root:start -->
**Resolve the CE artifact root `<root>` before composing any artifact path.**

- **Read** `docs_root` from `<repo-root>/.compound-engineering/config.yaml` only (`<repo-root>` = `git rev-parse --show-toplevel`). Do not read it from `config.local.yaml`. Unset -> `<root>` is `docs`, exactly as before.
- **Validate** a set value: a repo-relative directory whose real, symlink-resolved path stays inside the repo and is neither the repo root nor under `.git/`. Otherwise stop with an error naming `docs_root` and the value -- never fall back to `docs`.
- **Use** `<root>` as the sole artifact location: create it if absent, compose each path as `<root>/<subdir>` with this skill's own subdirectory, and never also read `docs`.
<!-- ce-docs-root:end -->

`brainstorm_output` and `brainstorm_model` resolve by this rule instead:

<!-- ce-config-layers:start -->
**Resolve ordinary CE yaml keys from the two repo files.**

- **Read** `<repo-root>/.compound-engineering/config.local.yaml`, then `config.yaml` (`<repo-root>` = `git rev-parse --show-toplevel`). Missing files are skipped. Gitignore does not change resolution.
- **Win** with the first active (non-commented) value. For scalars, empty is unset; an invalid value continues to the next layer, then the skill default. For lists and maps, a present key — including an empty list or map — replaces the whole key.
- **Do not** use this rule for `docs_root` — that key is `config.yaml` only.
<!-- ce-config-layers:end -->

## Execution Flow

Phases run in this order. Each names the files it cannot run correctly without: read them when you reach it, and never do its work from this table alone.

| Phase | Read first | What only those files carry |
|---|---|---|
| before the first question, and for the whole run — non-software route included | Read `references/interaction-rules.md` | the Core Principles, and the Interaction Rules: one question per turn, ask only decisions the environment cannot settle, the blocking-question-tool default and the visual-probe gate that overrides it, when a question is genuinely open-ended, and the one `ce-prototype` routing test this skill states in full there |
| before treating a decision the conversation carries as settled | Read `references/settled-decisions.md` | the settlement test; skipping it re-asks a decided question or promotes an unexamined assertion |
| 0.0 output mode | `references/output-mode.md` | the `OUTPUT_FORMAT` precedence; the token-parsing convention |
| 0.1–0.4 resume, classify, route, scope | `references/phase-0.md` | resume scan; the stop-and-route classification; scope tiers; coherent-work gate; both tripwires; task spine |
| 1 understand the idea | `references/dialogue.md` | context scan and grounding scout; opt-in Slack researcher; pressure test; blindspot and visual-probe gates; the conflict gate against existing `CONCEPTS.md` and verified code; Phase 1.3 exit condition |
| 2–2.6 approaches, synthesis, verification | `references/approaches.md`, plus `references/synthesis-summary.md` before composing the synthesis | approach generation; model elevation; the scoping synthesis; the claim verifier |
| 3 write the plan | `references/plan-write.md`, then `references/brainstorm-sections.md` and the rendering reference for the format | whether a doc is warranted; the section contract; the Ready for Planning Check |
| 4 handoff | `references/handoff.md` | the option set and its visibility conditions; the rendering-mode rule; per-selection dispatch, including what `ce-plan` is passed; closing summaries |

These rules hold without any read:

**`OUTPUT_FORMAT` is exclusive** — markdown OR HTML, never both — and pipeline mode (LFG, or any `disable-model-invocation` context) forces `md`.

**When a file is written on the brainstorm path the artifact contract does not change**: write to `<root>/plans/YYYY-MM-DD-HHMM-<type>-<topic>-plan.<md|html>`, with `HHMM` from local wall-clock time at write; frontmatter carries `artifact_contract: ce-unified-plan/v1`, `artifact_readiness: requirements-only`, and `product_contract_source: ce-brainstorm`; the body is a Goal Capsule plus the Product Contract. Do **not** emit a Goal Launch Block or Reader Index. The non-software route writes none of this.

**When a file is written, do not declare it written or enter Phase 4 while any check fails** in the Ready for Planning Check; a chat result enters Phase 4 with no check to run. An improvised Phase 4 menu is the other silent failure: it surfaces options that must be hidden and passes the wrong payload downstream.

The Phase 1.1 grounding scout, the Phase 2.6 claim verifier, and the opt-in Slack researcher are tiered by task shape, never hardcoded to a model name; read `references/model-tiers.md` before dispatching one. Model elevation is a separate mechanism (`references/reasoning-elevation.md`).
