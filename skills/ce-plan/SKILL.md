---
name: ce-plan
description: "Create structured plans for multi-step work, including software and non-software tasks. Use when asked to plan, break down implementation, plan from requirements, or deepen an existing plan; prefer ce-brainstorm for exploratory framing."
argument-hint: "[optional: feature description, requirements doc path, plan path to deepen, or any task to plan] [output:html]"
---

# Create Technical Plan

**Note: The current year is 2026.** Use this when dating plans and searching for recent documentation.

**Outcome:** a durable plan artifact an implementer can start from confidently, handed off through the Phase 5.4 menu. `ce-brainstorm` defines **WHAT** to build as a requirements-only unified plan; `ce-plan` enriches that same artifact with **HOW**; `ce-work` executes it. A prior brainstorm is useful context but never required — any input works: a requirements-only unified plan, a legacy requirements doc, a bug report, a feature idea, or a rough description.

**When directly invoked, always plan.** Never classify a direct invocation as "not a planning task" and abandon the workflow. If the input is unclear, ask clarifying questions or use the planning bootstrap to establish enough context — but always stay in the planning workflow.

**Research, decide, and write the plan — never implement.** This workflow does not write production code, run tests, or learn from execution-time results; if the answer depends on changing code and seeing what happens, that belongs in `ce-work`. Directional pseudo-code and DSL grammar sketches that communicate design remain welcome where the references allow them — the boundary is implementing, not sketching.

## Setup

Run this once at the start of this invocation, before any subagent dispatch, and follow the directives it prints — except where one conflicts with this skill's own rules on asking the user questions, whether those rules are scoped to a non-interactive mode or apply in every mode, in which case this skill's rules win and no blocking question is asked. Run the fence exactly as written, as its own command: do not pipe or filter it (no `head`, `tail`, or `grep`), do not truncate its output, and do not bundle it into a batch with other commands. Its output opens with a `=== skill context` header and ends with `CE_CONTEXT_END`; if you received one of those lines without the other, the output was truncated — rerun the fence verbatim once. That recovery is the only rerun: otherwise do not rerun it within the same invocation; a later invocation of this or any other skill runs its own. If no Node runtime is available the skill proceeds unchanged.

```bash
SKILL_DIR="<absolute path of the directory containing the SKILL.md you just read>";
NODE="$(for c in node nodejs; do command -v "$c" >/dev/null 2>&1 && "$c" -e '' >/dev/null 2>&1 && { echo "$c"; break; }; done)";
if [ -n "$NODE" ]; then
"$NODE" "$SKILL_DIR/scripts/context.mjs" || echo "context script failed; continue with the skill's normal behavior";
else
echo "no Node runtime; continue with the skill's normal behavior";
fi
```

## Mandatory Completion Contract

Every normal interactive `ce-plan` branch that produces a plan artifact or checkpoint is incomplete until its owning handoff question is presented. For software implementation-plan runs that continue past Phase 0.1b, that boundary is Phase 5.4's post-generation handoff menu. Non-software plan-seeking and approach-altitude branches use the terminal handoff in the reference workflow they route to; do not force those branches through Phase 5.4 after they have been told to skip subsequent phases. Answer-seeking is the exception: it may end after delivering the answer unless the universal-planning reference says to offer save/share.

For software implementation-plan runs, writing the plan file, running the confidence check, and running or skipping `ce-doc-review` are intermediate milestones, not completion. This remains true when the user's prompt says only "create a plan", "write the doc", "run `ce-doc-review`", or similar. The only exception is pipeline mode (LFG or any `disable-model-invocation` context), where the caller owns the next step after the plan file, confidence check, and non-interactive document review are complete.

Before any response that could end a software implementation-plan run, verify that the plan path is known, the non-interactive review state or documented skip state is summarized, and the user has been asked: "Plan ready at `<absolute path to plan>`. What would you like to do next?" If the menu fits the platform's blocking-question tool, ask it there; otherwise render the numbered handoff options in chat and wait. If the user selects an action, execute the Phase 5.4 routing for that selection before treating the skill as complete.

## Interaction Method

When asking the user a question, use the platform's blocking question tool: `AskUserQuestion` in Claude Code (call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded), `request_user_input` in Codex, `ask_question` in Antigravity CLI (`agy`), `ask_user` in Pi (requires the `pi-ask-user` extension). Fall back to numbered options on the host's user-visible chat surface only when no blocking tool exists in the harness or the call errors (e.g., Codex edit modes) — not because a schema load is required. Never silently skip the question.

Ask one question at a time. Prefer a concise single-select choice when natural options exist.

The **feature description** is the input this skill was invoked with — what to plan, present in the current prompt or conversation, whether the user provided it directly or a calling skill passed it (e.g. `lfg` in `mode:pipeline`). If the input is present but unclear, do not abandon the workflow — ask one or two clarifying questions, or proceed to the planning bootstrap. If none was provided at all, ask: "What would you like to plan? Describe the task, goal, or project you have in mind." Then wait for their response before continuing.

## Artifact Root

**Every file reference inside the plan document is repo-relative** (`src/models/user.rb`), never absolute — unit file lists, pattern references, origin links, and prose mentions alike. Absolute paths break portability across machines, worktrees, and teammates. Paths printed to the user in chat are the exception and stay absolute so they are clickable.

This skill writes plans under `<root>/plans/` and reads learnings under `<root>/solutions/`. Resolve `<root>` when you first compose a `<root>/` path, never before you need it. A write to `<root>/...` and a read of `<root>/solutions/` both count, so either one triggers resolution; only a run that touches no `<root>/` path at all — a scratch-only or no-repo flow — skips it. Pass the resolved path to any subagent, not the config.

<!-- ce-docs-root:start -->
**Resolve the CE artifact root `<root>` before composing any artifact path.**

- **Read** `docs_root` from `<repo-root>/.compound-engineering/config.yaml` only (`<repo-root>` = `git rev-parse --show-toplevel`). Do not read it from `config.local.yaml`. Unset -> `<root>` is `docs`, exactly as before.
- **Validate** a set value: a repo-relative directory whose real, symlink-resolved path stays inside the repo and is neither the repo root nor under `.git/`. Otherwise stop with an error naming `docs_root` and the value -- never fall back to `docs`.
- **Use** `<root>` as the sole artifact location: create it if absent, compose each path as `<root>/<subdir>` with this skill's own subdirectory, and never also read `docs`.
<!-- ce-docs-root:end -->

## Task Visibility

After intake determines that `ce-plan` will perform a material multi-stage run, use the platform's task-tracking capability when available to show a short user-facing view derived from the selected route and remaining planning work. Track meaningful outcomes, not every phase, tool call, or microstep; add conditional work only when its gate fires, and update the view at meaningful transitions. Use short, outcome-led names. If no task-tracking capability is available, continue normally without simulating a task list in chat.

## Workflow

Phases run in order, except where a phase routes you out of the sequence: the Phase 0.1 resume and deepen fast paths short-circuit to Phase 5.3, Phase 0.1a holds at the approach, and Phase 0.1b hands non-software work to `references/universal-planning.md`. Once a phase tells you to skip subsequent phases, skip them. Each phase below names the reference that carries it; read that reference before starting the phase it names.

### Phase 0: Resume, Source, and Scope

#### 0.0 Resolve Output Mode

Determine `OUTPUT_FORMAT` before any other phase fires. Output mode is **exclusive** — the plan is written as either markdown (`.md`) OR HTML (`.html`), never both. Precedence: in-prompt request > user-stated preference > config > default (`md`), with a hard pipeline-mode override.

1. **In-prompt request.** Reason over the user's prompt for this run for a request about *this document's* output format, expressed either as the `output:` shorthand or in plain language ("make the plan a webpage"). Match an explicit format case-insensitively to `md`/`html`, and ignore the `output:` token when reading the rest of the prompt as the feature description. Distinguish a request about the document's format from a format named as subject matter: "add an HTML export feature" is the work, not a doc-format request.
   - `output:` alone (no value) → no-op, fall through to step 2.
   - `output:<unknown>` (e.g., `output:pdf`) → drop the token, fall through, and emit a one-line note above the post-generation menu after final resolution: `Ignored unknown output: value '<value>' — using <resolved_format> instead.` Do not hardcode `md` in the note — that misleads users when config has set HTML.
2. **User-stated preference.** If this prompt holds no format request, honor an output-format preference the user established earlier that is already in your context, matching `md`/`html` case-insensitively. A remembered preference is more current than the rarely-edited config, so it **overrides** the config in step 3. Do not open or search instruction files to find it.
3. **Config.** Apply the ordinary-key rule below: the first **active (non-commented)** `plan_output:` matching `md` or `html` (case-insensitively) wins. Missing, invalid, or commented values continue to the next layer, then step 4. The shipped template's commented examples are not settings.
4. **Default.** Otherwise `OUTPUT_FORMAT=md`. If `<repo-root>` cannot be resolved so the config cannot be read, fall through to this default rather than failing.
5. **Pipeline override.** When invoked from LFG or any `disable-model-invocation` context, force `OUTPUT_FORMAT=md` regardless of steps 1-4. Pipeline mode forces markdown and skips interactive questions but does **not** disable model elevation — `plan_model` config (and a `plan_model:<alias>` caller carrier) is still honored (see the model-elevation sub-step below and `references/reasoning-elevation.md`).

**Token-parsing convention:** only literal-prefix flag tokens (`output:`, `mode:`, the exact `confirm:auto`/`confirm:ask` forms, `plan_model:<alias>`, `delegate:` where applicable) are consumed and stripped. Other `<word>:<word>` tokens — including commit prefixes like `feat:` and any unrecognized `confirm:<value>` — pass through verbatim into the feature description. A stripped `plan_model:<alias>` carrier is retained for the Phase 5.2 model-elevation step.

**Load the format-rendering reference for the resolved value:** `references/markdown-rendering.md` when `OUTPUT_FORMAT=md`, `references/html-rendering.md` when `OUTPUT_FORMAT=html`. Section content is the same either way; presentation differs. Both are paired with `references/plan-sections.md`.

<!-- ce-config-layers:start -->
**Resolve ordinary CE yaml keys from the two repo files.**

- **Read** `<repo-root>/.compound-engineering/config.local.yaml`, then `config.yaml` (`<repo-root>` = `git rev-parse --show-toplevel`). Missing files are skipped. Gitignore does not change resolution.
- **Win** with the first active (non-commented) value. For scalars, empty is unset; an invalid value continues to the next layer, then the skill default. For lists and maps, a present key — including an empty list or map — replaces the whole key.
- **Do not** use this rule for `docs_root` — that key is `config.yaml` only.
<!-- ce-config-layers:end -->

Also resolve `SKIP_SCOPING_CONFIRM` here by the same precedence. `confirm:auto` skips the scoping-synthesis confirmation for this run and `confirm:ask` forces it on; honor an equivalent plain-language instruction the same way ("just write it, don't ask me to confirm" skips; "ask me before writing the plan" asks). Only those two literal values are consumed as a flag — any other `confirm:<value>` stays verbatim in the feature description. Then a preference already in your context, then the first **active (non-commented)** `plan_skip_scoping_confirm:` matching `true` or `false`, then the default of asking. `references/intake.md` owns what the skip does and does not cover, at the gate it applies to.

**Model-elevation visibility.** Treat a stripped `plan_model:<alias>` carrier or a surfaced `plan_model` config value as a pending Phase 5.2 input, not a resolved choice. Phase 5.2 resolves the choice from the current conversation, carrier, and config immediately before authoring, so later user intent cannot be lost.

#### 0.1 Resume Existing Plan Work When Appropriate

Read `references/resume.md` before acting on this phase; it carries the deepen-intent triggers, the extension-then-frontmatter routing table, and the format-preservation rules. This check needs `<root>/plans/`, so it only applies to a repo-backed run — if there is no git repository or `<root>` fails to resolve, skip resume discovery and continue to Phase 0.1a rather than failing the run. When a plan path was given explicitly, use it directly without resolving `<root>` — the skip never discards a path the user named.

If the user references an existing plan file or an obvious recent match exists in `<root>/plans/`, read it and confirm whether to update it in place or create a new plan.

**A requirements-only unified plan is not a resume target.** A `<root>/plans/` file with `artifact_readiness: requirements-only` is an *enrichment input* — do **not** fire the update-or-create confirm for it. Fall through to Phase 0.2, which enriches it in place. In pipeline mode the resume choice is made automatically (default to in-place update of the referenced plan) and is never prompted, because no user is present to answer.

Normal editing requests ("update the test scenarios", "add an implementation unit") follow the standard resume flow rather than the deepening fast path.

#### 0.1a Recognize Approach-Altitude Requests

Some requests are better answered one level up: produce a grounded approach-plan — a plan for *how the deliverable will be made* — and hold there. This runs after Phase 0.1's fast paths and before Phase 0.1b's domain split.

Two entries. **Explicit is always honored**: when the user asks for the approach itself ("plan the approach", "plan how you'd do X", "don't do it yet — just plan how you'd approach it"), enter approach altitude and hold there; do not begin the deliverable. **Proactive is rare**: offer only when method uncertainty and the cost of getting it wrong are *both* clearly high, as a single dismissible line naming the signal — never a blocking question. If either is low, or it is borderline, stay silent and plan normally; cost alone never fires the offer, and a large but method-obvious change is not method uncertainty. An investigative request with no approach-language passes through this gate untouched to Phase 0.1b.

`references/resume.md` carries the full entry conditions and the boundaries against the other approach surfaces. On entry, read `references/approach-altitude.md` and follow it. Otherwise continue to Phase 0.1b unchanged.

#### 0.1b Classify Task Domain

If the task asks to build, modify, refactor, deploy, or architect software (code, schemas, infrastructure), continue to Phase 0.2.

Classify by task-type, not topic. A request that merely *references* code, a repo, an API, or a database is not automatically software work: building or modifying code is software; investigating or analyzing it is answer-seeking. If the domain is genuinely ambiguous, ask the user before routing.

Otherwise, read `references/universal-planning.md` and follow that workflow instead. Skip all subsequent phases. Named tools or source links don't change this routing — they're inputs.

**Honor user-named resources (Core Principle 8).** When the user names a specific resource — a CLI, MCP server, URL, file, doc link, or prior artifact — treat it as authoritative input, not a suggestion. Discover it if unknown (`command -v`, fetch, read) before assuming it is unavailable, and use it in place of generic alternatives. If it fails or does not exist, say so explicitly rather than silently substituting. The remaining core principles and the plan quality bar are in `references/intake.md`.

#### 0.2–0.7 Source, Bootstrap, Depth, and Scoping

Read `references/intake.md` now and follow it. It carries Phase 0.2 (find the upstream product contract), 0.3 (use it as primary input, with the preservation and restructuring rules), 0.4 (planning bootstrap and route-outs to `ce-brainstorm`, `ce-debug`, or `ce-work`), 0.5 (blocking questions), 0.6 (plan depth), and 0.7 (the solo-mode scoping synthesis gate). Phase 0.7 is a required gate on solo runs that are not on a Phase 0.1 fast path, and it blocks before Phase 1 research is spent, so do not proceed past it when its conditions in that reference hold.

### Phase 1: Gather Context

Read `references/research.md` now and follow it. It carries local research, the conditional agent-native triage, execution-direction signals, the external-research decision and its intent classification, consolidation, depth reclassification, and flow analysis. All specialist prompts are skill-local assets under `references/agents/`: read the matching file and seed a generic subagent with that content plus task-specific context. Do not dispatch standalone agents by type or name.

### Phases 2-4: Resolve Questions, Structure, and Compose

Read `references/structure.md` now and follow it. It carries Phase 2 (resolving planning questions, including the rule that a session-settled decision is never re-asked), Phase 3 (title and file naming, implementation units and their stable U-IDs, high-level technical design, anti-expansion), and Phase 4 (depth guidance, optional deep-plan extensions, and the planning rules — including that every file path in the plan is repo-relative, never absolute).

Compose the plan itself from `references/plan-sections.md` (what the plan contains) plus the format-rendering reference loaded at Phase 0.0 (how it is presented). Right-size the artifact: change the amount of detail across depths, not the boundary between planning and execution.

### Phase 5: Final Review, Write File, and Handoff

Read `references/final-review.md` now and follow it. It carries Phase 5.1 (the pre-write review checklist, including the load-bearing High-Level Technical Design presence audit), 5.1.5 (the brainstorm-sourced scoping synthesis gate), and 5.3.1-5.3.2 (depth and risk classification, and the gate deciding whether to deepen). Phase 5.1.5 is a required gate on any run with an upstream Product Contract source that is not on a Phase 0.1 fast path, and it blocks before the plan is written, so do not proceed to Phase 5.2 when its conditions in that reference hold. When deepening is warranted, `references/deepening-workflow.md` carries steps 5.3.3 through 5.3.7.

#### 5.2 Write Plan File

**Model elevation.** Before authoring the plan, load `references/reasoning-elevation.md`, resolve the choice at this boundary, and follow it. Do not author until activation resolution has completed and any selected dispatch or transparent fallback has settled. When no model is selected it is a no-op. It runs the same on every harness — do not gate it on the host.

**REQUIRED: Write the plan file to disk before presenting any options.** Write it to `<root>/plans/` with the extension `OUTPUT_FORMAT` resolved to, following the naming and atomic-reservation rules in `references/final-review.md`. Both formats continue through `ce-doc-review`; fixes apply in the artifact's native format while preserving its existing structure.

**The artifact contract downstream skills read.** Software implementation plans set `artifact_contract: ce-unified-plan/v1`, `artifact_readiness: implementation-ready`, and `execution: code`. Do not set that contract on universal-planning, answer-seeking, or approach-plan outputs. When the source is a requirements-only unified plan, enrich **that same file in place** unless `OUTPUT_FORMAT`, pipeline mode, or an explicit conversion requires a new canonical path — do not create a second artifact. Do not write a launch prompt into the doc; it is generated at handoff so it cannot go stale. `references/final-review.md` carries the rest of the write path. Then confirm, using the absolute path so the reference is clickable in modern terminals:

```text
Plan written to <absolute path to plan>
```

**Pipeline mode:** when invoked from LFG or any `disable-model-invocation` context, skip interactive questions, make the needed choices automatically, and proceed to writing the plan. One exception stops the write: when research produced invalidating evidence against a session-settled decision in play for this run, do **not** write the plan and do **not** resolve it silently — return a blocked report to the caller containing the token `settled-decision-invalidated`, the decision, and the reason, so the caller can stop. `references/final-review.md` carries the severity ladder that classifies the evidence.

#### 5.3 Confidence Check and Deepening

After writing the plan file — or on arrival here from a Phase 0.1 resume or deepen short-circuit, which skips the Phase 5 intro above — read `references/final-review.md` for 5.3.1-5.3.2 and follow it. Its two overrides force a scoring pass even on a plan that looks grounded: when Phase 1.2 ran external research because local patterns were thin, and when Phase 1.4 marked external research as load-bearing. Then evaluate whether the plan needs strengthening. Auto mode is the default during plan generation and runs without asking; interactive mode is activated by the re-deepen fast path in Phase 0.1 and presents each finding for the user to accept or reject. Pipeline runs always use auto mode.

`ce-doc-review` and this confidence check are different: use `ce-doc-review` when the document needs clarity, simplification, completeness, or scope control; this check strengthens rationale, sequencing, risk treatment, and system-wide thinking when the plan is structurally sound but still needs stronger grounding.

##### 5.3.8–5.4 Document Review, Final Checks, and Post-Generation Options

**STOP. Load `references/plan-handoff.md` now before continuing.** It carries the full instructions for 5.3.8 (document review), 5.3.9 (final checks and cleanup), and 5.4 (post-generation handoff, including the `/goal` objective construction, its clipboard handoff, and Issue Creation branching). **This load is non-optional** — without it, the agent renders the post-generation menu, captures the user's selection, and stops without firing the routed action. Document review at 5.3.8 runs unconditionally for both output formats regardless of whether the confidence check already ran. Document review is mandatory. The default is non-interactive (`mode:non-interactive`) — `safe_auto` fixes apply silently in the artifact's native format, remaining findings surface contextually above the menu, and a deeper interactive review is opt-in via free-form prompt.

After document review and final checks, print the one-line summary of the non-interactive review state that reference specifies above the menu, then present the menu.

**Menu rendering.** The per-option visibility gates are in that reference; two decide what the user sees at all. Options 1 and 2 render only for implementation-ready code plans. `Decide on the review's open items` renders only when actionable findings remain (`proposed_fixes_count + decisions_count > 0`) — an FYI-only envelope or `skipped_reason: skill_unreachable` hides it, because the walkthrough it routes to is gated to actionable findings and would otherwise dead-end. Detect goal capability by capability, not by slash-command shape: Codex has goal capability when `create_goal` is in the available tool list, while Claude Code has it through the user-typed `/goal` command. Account for each platform's option cap rather than trimming choices — Claude Code `AskUserQuestion` supports up to 4 explicit options and Codex `request_user_input` supports only 2-3 explicit options — so a visible menu over the cap is rendered as a numbered list in chat. Renumber the visible options 1-N. Never silently skip the question.

**Question:** "Plan ready at `<absolute path to plan>`. What would you like to do next?" (use absolute path so the reference is clickable in modern terminals)

**Options.** `Open in browser` renders only when `OUTPUT_FORMAT=html`. Exclusive output: the local plan file stays canonical.

1. **Start `ce-work`** - Build and ship the plan in this session. Implementation-ready code plans only.
2. **Run it as a `/goal`** - Run the plan through your harness's autonomous goal mode instead. The alternative to option 1, not an add-on — pick one.
3. **Decide on the review's open items** - Confirm or skip the suggested edits, and settle the judgment calls the auto-pass left for you.
3. **Prototype a remaining feel-question** - Invoke `ce-prototype` on a named remaining question that is expensive to unravel and that neither talk nor a cheap sketch can settle. A question turning on finish or motion is already past the sketch tier; a cheap-to-reverse decision does not qualify however visual it is. Shown only when such a question remains, and its description names the proposed slice. Options 3 are exclusive: when this one is shown, omit **Decide on the review's open items**.
4. **Create Issue** - Create a tracked issue from this plan in your configured issue tracker (e.g., GitHub Issues, Linear, Jira)
5. **Open in browser** - Open the HTML plan file locally for review and sharing. **Render only when `OUTPUT_FORMAT=html`.**

`ce-work` (option 1) always carries *(recommended)* and option 2 stays unmarked; exactly one option carries the marker.

**Routing.** Act on the user's selection — do not just announce it. Elaborate sub-flows live in `references/plan-handoff.md`.

**Cross-skill invocation rule:** Invoke `ce-work`, `ce-doc-review`, and `ce-prototype` using the host's normal skill-invocation mechanism. Do not substitute a generic Task, Agent, or subagent; the invoked skill may still dispatch its own subagents according to its protocol.

- **Start `ce-work`** — Offered only when the artifact is `artifact_readiness: implementation-ready` and `execution: code`. Invoke the `ce-work` skill under the cross-skill invocation rule, passing the plan path as the skill argument; `ce-work` owns engine selection and the tail. If it cannot be invoked, print the `ce-work` fallback prompt for the user to run. Do not merely tell the user to type an invocation when the host can invoke it directly.
- **Run it as a `/goal`** — Offered on the same implementation-ready-code gate, and only where the host has goal capability. **`ce-work` does not also run.** `references/plan-handoff.md`, already loaded at the STOP above, owns the objective's text, its deletion test, and the clipboard recipe; take the objective from there rather than composing one here. Where `create_goal` is available, start the goal with it and end here — that session completes itself. Otherwise hand the user a copyable `/goal` prompt, then return to the menu.
- **Decide on the review's open items** — Invoke the `ce-doc-review` skill again under the cross-skill invocation rule, passing the plan path **without** `mode:non-interactive` so the interactive routing question and walkthrough fire. If it cannot be invoked, say that it did not run and return to the menu. After it returns, re-render this menu with refreshed counts.
- **Create Issue** — Detect the project tracker from the project instructions already in your context and create the issue from the plan file as described under "Issue Creation" in `references/plan-handoff.md`. Use whatever interface the tracker actually exposes — `gh` for GitHub when installed and authenticated, otherwise its connector/MCP tool or API; for Linear, a connector/MCP tool, documented API/GraphQL, or a documented CLI (there is no guaranteed `linear` CLI). Do not treat a missing binary, env var, or unloaded MCP tool as proof the tracker is unavailable. After creation, display the issue URL and ask whether to proceed with `ce-work` via the platform's blocking question tool.
- **Prototype a remaining feel-question** — Invoke the `ce-prototype` skill under the cross-skill invocation rule, passing the plan path as the skill argument. Do not build a prototype in this skill. If it cannot be invoked, say that it did not run and return to the menu.
- **Open in browser** — Display the absolute path to the `.html` plan file so the user can open it locally. Where the platform exposes a browser-opening primitive (`open`, `xdg-open`, `start`), the agent may use it. Do not invoke `ce-work` from this option — the user picked HTML for review and sharing, not handoff.

If the user types free-form prompts targeting the findings (e.g., "review", "walk through", "deep review"), route as if they picked `Decide on the review's open items` — fire the skill rather than looping back to the menu. For other free-text revisions, accept the input and loop back to this menu after applying the revision.

**Final pre-response checklist:** Before sending any response that could end `ce-plan`, verify:
- Plan file exists on disk
- Confidence check ran or was intentionally skipped by the interactive re-deepen no-accepted-findings path
- `ce-doc-review` ran in non-interactive mode, or the documented `skill_unreachable` state / interactive re-deepen no-accepted-findings path skipped it
- Non-interactive review state or documented skip state was summarized above the menu
- Phase 5.4 menu was presented for software implementation-plan runs, even if the user only asked to create the plan or run doc review, unless pipeline mode returned control to the caller
- If the user selected an action, the selected routing was executed

**Completion check:** This skill is not complete until the post-generation menu above has been presented, the user has selected an action, and the inline routing for that selection has been executed. Presenting the menu and stopping at the user's selection is not completion — fire the routed action.

Incorrect final response: "Created the plan and ran doc review."

Correct terminal handoff: "Created the plan and ran doc review. Plan ready at `<absolute path to plan>`. What would you like to do next?" followed by the numbered handoff options or the platform's blocking question.

**Pipeline mode exception:** In LFG or any `disable-model-invocation` context, skip the interactive menu and return control to the caller after the plan file is written, confidence check has run, and `ce-doc-review` has run in non-interactive mode or `ce-plan` has recorded the documented `skill_unreachable` envelope (per `references/plan-handoff.md`). Pipeline mode still forces `OUTPUT_FORMAT=md` at Phase 0.0.
