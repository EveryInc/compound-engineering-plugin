---
name: ce-explain
description: "Turn a concept, a diff, an idea, or a window of your own recent work into a dense, visual explainer written for you personally — with an optional check-in (predict-then-reveal for diffs, corrected exercises) that makes the material stick. For learning, not repo docs or verdicts."
argument-hint: "[a concept, a diff ref, an idea, or 'what happened this week?'] — or invoke bare to be asked"
---

# Explain It To Me

Teach the user one thing well: a concept, a change, an idea, or a window of their own recent work. Agent-driven development removed the learning that writing code by hand used to provide; this skill is the replacement — the human keeps learning while agents do the writing.

<explain_request> #$ARGUMENTS </explain_request>

*(If `$ARGUMENTS` above appears as a literal token rather than the user's words — it was not substituted on this host — use the user's actual request from the conversation as the input.)*

**Note: The current year is 2026.** Use this when weighting external sources and dating artifacts.

## Who the explainer is for

The user personally — dense, technical, one voice, no audience adaptation. Meeting prep preps the user; it never produces the deck. The artifact is display-only: no embedded quizzes, forms, or widgets — the doing happens in the session, where answers can be checked.

## Interaction Method

When you must ask the user a question, use the platform's blocking question tool: `AskUserQuestion` in Claude Code (call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded), `request_user_input` in Codex, `ask_question` in Antigravity CLI (`agy`), `ask_user` in Pi (requires the `pi-ask-user` extension). Fall back to numbered options in chat only when no blocking tool exists in the harness or the call errors (e.g., Codex edit modes) — not because a schema load is required. In the fallback, stop and wait for the user's reply. Never silently skip the question. Ask one question at a time.

## Model Tiers

Dispatch is tiered by task shape, never hardcoded to a model name:

- **Extraction tier** — the work-recap scout and the repo-profiler: search-and-quote work. Use the platform's cheapest capable model when the harness exposes a known override; otherwise inherit.
- **Ceiling tier** — the explainer composition, the check-in reasoning, and the corrections. These run in the main conversation on the orchestrator's model; nothing is dispatched for them.

**Degradation rule.** When the platform's subagent primitive cannot select per-agent models, dispatch scouts on the inherited model and keep their read budgets. When the platform has no subagent primitive at all, run the scout work inline with the same budgets.

## Execution Flow

### Phase 1: Classify the input

Read `references/intake.md` now and classify the request into one of the four input shapes — concept, diff, idea, or work-recap window. It owns the token table (`diff:`, `since:`, `output:`), the explicit-token-beats-inference rule, the concept-vs-diff tiebreak, and conflict handling. Do not improvise classification.

**Bare invocation** (no input at all): ask one blocking question — "What should I explain?" — offering a shortcut option for a recap of recent work in this repo alongside free-text. Do not produce a default artifact unprompted.

### Phase 2: Ground

Match grounding to the input shape. Create the run directory first — every run gets one, before any artifact exists:

```bash
RUN_DIR="/tmp/compound-engineering/ce-explain/$(date +%Y%m%d)-$(openssl rand -hex 3)"
mkdir -p "$RUN_DIR"
echo "$RUN_DIR"
```

**Repo-touching inputs** (a concept with footprint in this repo, a diff, a recap): resolve the question-agnostic project profile from the shared cache instead of re-deriving it. Set `SKILL_DIR` to this skill's directory and run the helper (full protocol in `references/repo-profile-cache.md`):

```bash
SKILL_DIR="<absolute path of the directory containing the SKILL.md you just read>"
python3 "$SKILL_DIR/scripts/repo-profile-cache.py" get
```

On `HIT`, load the profile JSON — stack, conventions, vocabulary — and take orientation from it. On `MISS`, dispatch a generic subagent with `references/agents/repo-profiler.md` to derive the profile, write its JSON to a file, then persist with `python3 "$SKILL_DIR/scripts/repo-profile-cache.py" put <file>` (re-set `SKILL_DIR` in that call — shell vars don't persist between Bash invocations). On `NO-CACHE` — or if the call errors — derive orientation inline and skip the `put`. The cache is an optimization, never a correctness dependency. The topic-specific evidence (the diff, the concept's call-sites, the window's commits) is always gathered fresh.

- **Diff mode:** resolve the change (the `diff:` ref, or the most recent substantial change when the request points at one implicitly) and gather its evidence — the diff itself, the files it touches, any plan or solution doc that motivated it. Gather silently: nothing learned here is narrated to the user until Phase 3's ordering rule is satisfied.
- **Recap mode:** dispatch a generic subagent seeded with `references/agents/work-recap-scout.md` (extraction tier), passing the resolved window, the repo root, and `$RUN_DIR`. It returns an evidence summary with commit shas and `file:line` pointers. **Empty window** (no git activity, no doc changes): say so, offer to widen the window, write no artifact, and end the run after the user responds.
- **External concepts** (no footprint in this repo): skip repo grounding entirely — do not force repo context into the output. Research with whatever web tools are reachable. When none are, you may explain from model knowledge, but the artifact must label that content **Unverified — from model knowledge, not checked against current sources** in its metadata header.
- **Idea mode:** the idea is a fixed given. Explain its implications, mechanics, and trade-offs for the user's understanding. Never scope it (`ce-brainstorm`'s job), never generate and rank alternatives (`ce-ideate`'s job).

### Phase 3: Check-in gate — before anything is revealed

Judge whether the material warrants a check-in (a routine recap does not; a gnarly diff or a hard concept does), then offer it with the blocking question tool. The user can always decline, and declining is never re-litigated. Read `references/check-in.md` for the warrant test, the prediction protocol, and exercise design.

**Diff mode with check-in accepted — hard ordering rule.** No interpretive content — explanation, annotation, diagram, or surfaced opportunity — may be shown before the user's prediction turn ends. Show only the raw change reference (the diff or its stat summary), ask for the prediction ("What do you think this change does, and why was it made?"), and **end the turn there**. When no blocking tool exists, ask in chat and stop — never print the reveal in the same message as the prediction prompt. Compose the explainer only after the prediction lands; the reveal names the gaps between the prediction and what the change actually does.

### Phase 4: Compose the explainer

Read the rendering reference for the resolved format **now**, not earlier: `references/explainer-html.md` (default) or `references/explainer-markdown.md` (when intake resolved `output:md`). Compose per its contract — visible metadata header, show-n-tell form matched to the material, ~70ch measure, single self-contained file — and write the artifact to `$RUN_DIR/explainer.html` (or `$RUN_DIR/explainer.md` when intake resolved `output:md`) before anything else happens with it. Display it to the user (inline summary plus the file path; open locally per Phase 6 when chosen). The artifact exists at that stable path from this moment — a declined destination ask never loses it.

### Phase 5: Exercises (when warranted)

For concepts, ideas, and dense recaps where the check-in was accepted: pose the exercises from `references/check-in.md` in chat, one at a time, using the blocking question tool where its option shape fits and free chat where the answer is narrative. Check each answer, correct it, and name the gap it exposed. Do not put exercises inside the artifact.

### Phase 6: Destination ask and close

Detect destinations by capability — probe the agent's own toolset and session context, never a closed list, and never treat a missing binary, env var, or unloaded MCP tool as proof a destination is unavailable when a connector could supply it. Local file and Leave it are ungated and always offered. Offer only what is detected; absence hides an option silently. Ask once with the blocking question tool — counting visible options against the platform's cap first (Claude Code's `AskUserQuestion` allows up to 4 explicit options; Codex's `request_user_input` only 2-3): when the visible set exceeds the cap, render a numbered list in chat with "Pick a number or describe what you want." and wait instead. Per-option routing:

- **Artifact surface** (offered when an artifact-publishing tool is present in the current session's tools) — publish per `references/destinations.md`: re-emit the explainer as body-only markup (no doctype/html/head/body, styles inline, no external font links); the surface wraps content in its own skeleton and blocks external hosts.
- **Local file** — copy the artifact out of `$RUN_DIR` to the path the user names, then where the platform exposes a browser-opening primitive (`open` on macOS, `xdg-open` on Linux, `start` on Windows) offer to open it; otherwise print the absolute path.
- **Publish to Proof** (markdown output only) — publish per `references/destinations.md` and surface the returned share URL; on failure retry once, then report and move on.
- **Send to Thinkroom** (offered only when a Thinkroom skill or CLI capability is detected) — send per `references/destinations.md`.
- **Leave it** — report the `$RUN_DIR` path and state it is a temporary location that does not survive reboot; nothing else is written.

**Non-interactive degradation:** when no interaction is possible at this ask (no blocking tool and no reply), do not hang and do not discard — the artifact is already at `$RUN_DIR`; report that path and end, skipping the improvement-observation handoffs below (they are offers, and an offer cannot fire without a user).

**Improvement observations.** When composing the explainer surfaced things that could be better, route them by type after the destination ask — offer, don't auto-fire:

- **New-capability ideas** — offer first; on acceptance invoke the `ce-ideate` skill via the platform's skill-invocation primitive, passing the observations as seed context. Do not merely tell the user to run it.
- **Code-clarity findings** — offer first; on acceptance invoke the `ce-simplify-code` skill via the platform's skill-invocation primitive, passing the observations and the files they concern. Do not merely tell the user to run it.
- **UI/UX polish opportunities** — present the observations in chat and tell the user to run `/ce-polish` themselves; ce-polish is user-invoked only (`disable-model-invocation`), so never attempt to invoke it via the skill primitive — the in-session observations carry into their run.

## Boundaries

- **Not a verdict.** "Should we adopt X?" is `ce-pov`. ce-explain teaches what X is and how it works.
- **Not repo memory.** Documenting a solved problem for future work is `ce-compound`. ce-explain teaches the human, not the repo.
- **Not ideation or scoping.** An idea input is explained as given — implications and trade-offs — never expanded into options or a requirements dialogue.
- **The check-in is never headless.** It exists to exercise the human; automating the answers deletes the product.
