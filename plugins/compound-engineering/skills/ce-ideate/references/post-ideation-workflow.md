# Post-Ideation Workflow

Read this file after Phase 2 ideation agents return and the orchestrator has merged and deduped their outputs into a master candidate list. Do not load before Phase 2 completes.

## Phase 3: Adversarial Filtering

Review every candidate idea critically. The orchestrator performs this filtering directly -- do not dispatch sub-agents for critique.

Do not generate replacement ideas in this phase unless explicitly refining.

For each rejected idea, write a one-line reason.

Rejection criteria:
- too vague
- not actionable
- duplicates a stronger idea
- not grounded in the stated context
- too expensive relative to likely value
- already covered by existing workflows or docs
- interesting but better handled as a brainstorm variant, not a product improvement

Score survivors using a consistent rubric weighing: groundedness in stated context, expected value, novelty, pragmatism, leverage on future work, implementation burden, and overlap with stronger ideas.

Target output:
- keep 5-7 survivors by default
- if too many survive, run a second stricter pass
- if fewer than 5 survive, report that honestly rather than lowering the bar

## Phase 4: Present the Survivors

**Checkpoint B (V17).** Before presenting, write `.context/compound-engineering/ce-ideate/<run-id>/survivors.md` containing the survivor list plus key context (focus hint, grounding summary, rejection summary). This protects the post-critique state before the user reaches the persistence menu. Best-effort: if the write fails (disk full, permissions), log a warning and proceed; the checkpoint is not load-bearing. Reuses the same `<run-id>` generated in Phase 1; not cleaned up at the end of the run (the run directory is preserved so the V15 cache remains reusable across run-ids in the same session — see Phase 6). If `.context/` namespacing is unavailable, fall back to OS temp (`mktemp -d`).

Present the surviving ideas to the user. The terminal review loop is a complete ideation cycle in itself — persistence is opt-in (Phase 5), and refinement happens in conversation with no file or network cost (Phase 6).

Present only the surviving ideas in structured form:

- title
- description
- rationale
- downsides
- confidence score
- estimated complexity

Then include a brief rejection summary so the user can see what was considered and cut.

Keep the presentation concise. Allow brief follow-up questions and lightweight clarification.

## Phase 5: Persistence (Opt-In, Mode-Aware)

Persistence is opt-in. The terminal review loop is a complete ideation cycle. Refinement loops happen in conversation with no file or network cost. Persistence triggers only when the user explicitly chooses to save, share, or hand off (selected in Phase 6).

When the user picks an option in Phase 6 that requires a durable record (Brainstorm, Save and end), ensure a record exists first. When the user ends in conversation only or chooses to keep refining, no record is needed unless the user asks.

**Mode-determined defaults:**

| Action | Repo mode default | Elsewhere mode default |
|---|---|---|
| Save | `docs/ideation/YYYY-MM-DD-<topic>-ideation.md` | Proof |
| Share | Proof (additional) | Proof (primary) |
| Brainstorm handoff | `ce:brainstorm` | `ce:brainstorm` (universal-brainstorming) |
| End | Conversation only is fine | Conversation only is fine |

Either mode can also use the other destination on explicit request ("save to Proof even though this is repo mode", "save to a local file even though this is elsewhere"). Honor such overrides directly.

### 5.1 File Save (default for repo mode; on request for elsewhere mode)

1. Ensure `docs/ideation/` exists
2. Choose the file path:
   - `docs/ideation/YYYY-MM-DD-<topic>-ideation.md`
   - `docs/ideation/YYYY-MM-DD-open-ideation.md` when no focus exists
3. Write or update the ideation document

Use this structure and omit clearly irrelevant fields only when necessary:

```markdown
---
date: YYYY-MM-DD
topic: <kebab-case-topic>
focus: <optional focus hint>
mode: <repo-grounded | elsewhere-software | elsewhere-non-software>
---

# Ideation: <Title>

## Grounding Context
[Grounding summary from Phase 1 — labeled "Codebase Context" in repo mode, "Topic Context" in elsewhere mode]

## Ranked Ideas

### 1. <Idea Title>
**Description:** [Concrete explanation]
**Rationale:** [Why this idea is strong in the stated context]
**Downsides:** [Tradeoffs or costs]
**Confidence:** [0-100%]
**Complexity:** [Low / Medium / High]
**Status:** [Unexplored / Explored]

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | <Idea> | <Reason rejected> |
```

If resuming:
- update the existing file in place
- preserve explored markers

### 5.2 Proof Save (default for elsewhere mode; on request for repo mode)

Hand off the ideation content to the `proof` skill in HITL review mode. This uploads the doc, runs an iterative review loop (user annotates in Proof, agent ingests feedback and applies tracked edits), and (in repo mode) syncs the reviewed markdown back to `docs/ideation/`.

Load the `proof` skill in HITL-review mode with:

- **source content:** the survivors and rejection summary from Phase 4 (in repo mode, this is the file written in 5.1; in elsewhere mode, render to a temp file as the source for upload)
- **doc title:** `Ideation: <topic>` or the H1 of the ideation doc
- **identity:** `ai:compound-engineering` / `Compound Engineering`
- **recommended next step:** `/ce:brainstorm` (shown in the proof skill's final terminal output)

The Proof failure ladder in Phase 6.5 governs what happens when this hand-off fails.

**Caller-aware return.** The return-rule bullets below describe default control flow back to the Phase 6 menu. When Proof Save was invoked from §6.1's durable-record step (Brainstorm a selected idea), a successful Proof return must **not** stop at the Phase 6 menu — after applying the per-status handling below (including any stale-local pull offer), continue into §6.1's remaining bullets (mark the chosen idea as `Explored`, then load `ce:brainstorm`). Only the `status: aborted` branch returns to the Phase 6 menu from §6.1, since no durable record was written. All other callers (e.g., §6.3 Save and end) follow the bullets as written.

When the proof skill returns control:

- `status: proceeded` with `localSynced: true` → the ideation doc on disk now reflects the review. Return to the Phase 6 menu (or continue §6.1 per the caller-aware return note above).
- `status: proceeded` with `localSynced: false` → the reviewed version lives in Proof at `docUrl` but the local copy is stale. Offer to pull the Proof doc to `localPath` using the proof skill's Pull workflow. Return to the Phase 6 menu (or continue §6.1 per the caller-aware return note); if the pull was declined, include a one-line note above the menu (or, for the §6.1 path, in the handoff preamble to `ce:brainstorm`) that `<localPath>` is stale vs. Proof so the next handoff doesn't read the old content silently.
- `status: done_for_now` → the doc on disk may be stale if the user edited in Proof before leaving. Offer to pull the Proof doc to `localPath` so the local ideation artifact stays in sync, then return to the Phase 6 menu (or continue §6.1 per the caller-aware return note). `done_for_now` means the user stopped the HITL loop — it does not mean they ended the whole ideation session; they may still want to brainstorm or refine. If the pull was declined, include the stale-local note above the menu (or in the §6.1 handoff preamble).
- `status: aborted` → fall back to the Phase 6 menu without changes (even when invoked from §6.1 — no durable record was written, so the brainstorm handoff should not proceed).

## Phase 6: Refine or Hand Off

Ask what should happen next using the platform's blocking question tool (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini). If no question tool is available, present numbered options in chat and wait for the user's reply.

**Question:** "What should the agent do next?"

Offer these four options (each label is self-contained per the Interactive Question Tool Design rules in the plugin AGENTS.md — the distinguishing word is front-loaded so options stay distinct when truncated):

1. **Brainstorm a selected idea** — load `ce:brainstorm` with the chosen idea as the seed. The orchestrator first writes a durable record using the mode default in Phase 5.
2. **Refine the ideation in conversation** — add ideas, re-evaluate, or deepen analysis. No file or network side effects.
3. **Save and end** — persist the ideation using the mode default (file in repo mode, Proof in elsewhere mode), then end.
4. **End in conversation only** — no save, no Proof. The terminal review was the value.

Do not delete the run's scratch directory (`.context/compound-engineering/ce-ideate/<run-id>/`) on completion. The V15 web-research cache is session-scoped and reused across run-ids by later ideation invocations in the same session (see `references/web-research-cache.md`); per-run cleanup would defeat that reuse. Checkpoint A (`raw-candidates.md`) and Checkpoint B (`survivors.md`) are cheap to leave behind and follow the repo's Scratch Space convention — `.context/` is session-scoped scratch space that another skill invocation may need, and natural session/OS cleanup handles it.

### 6.1 Brainstorm a Selected Idea

- Write or update the durable record per the mode default in Phase 5 (file in repo mode, Proof in elsewhere mode). When this routes through §5.2 Proof Save, apply §5.2's caller-aware return rule: continue into the next bullet on a successful Proof return instead of bouncing back to the Phase 6 menu. If Proof returned `aborted` (no durable record written), go back to the Phase 6 menu and do **not** proceed with the brainstorm handoff.
- Mark the chosen idea as `Explored` in the saved record
- Load the `ce:brainstorm` skill with the chosen idea as the seed

Do **not** skip brainstorming and go straight to planning from ideation output.

### 6.2 Refine the Ideation in Conversation

Route refinement by intent:

- `add more ideas` or `explore new angles` -> return to Phase 2
- `re-evaluate` or `raise the bar` -> return to Phase 3
- `dig deeper on idea #N` -> expand only that idea's analysis

No persistence triggers during refinement. The user can choose Save and end (or Brainstorm) when they are ready to persist.

### 6.3 Save and End

Persist via the mode default (5.1 in repo mode, 5.2 in elsewhere mode), then end. If the user instead asked to use the non-default destination, honor that explicit request.

When the path lands in a file save (5.1):

- offer to commit only the ideation doc
- do not create a branch
- do not push
- if the user declines, leave the file uncommitted

### 6.4 End in Conversation Only

No file save, no Proof handoff. Acknowledge briefly and stop.

### 6.5 Proof Failure Ladder

The `proof` skill performs single-retry-once internally on transient failures (`STALE_BASE`, `BASE_TOKEN_REQUIRED`) before surfacing failure. The proof skill's return contract does not expose typed error classes to callers — the orchestrator cannot distinguish retryable vs terminal failures from outside.

**Orchestrator-side retry harness (intentionally minimal):** wrap the proof skill invocation in **one** additional best-effort retry with a short pause (~2 seconds). The proof skill already retried internally, so this catches transient races at the orchestrator boundary without compounding latency. Do not classify error types from outside the skill — no detection mechanism exists.

Distinguish create-failure from ops-failure by inspecting whether the proof skill returned a `docUrl` before failing:

- **Create-failure** (no `docUrl` returned): retry the create.
- **Ops-failure** (a `docUrl` was returned, but a later operation failed): retry only the failing operation. **Do not recreate** the document.

**Failure narration.** Narrate the single retry to the terminal so the pause does not look like a hang ("Retrying Proof... attempt 2/2"). On persistent failure, narrate that retry exhausted before showing the fallback menu.

**Fallback menu after persistent failure.** Use the platform's blocking question tool. Present these options (omit option (a) if no repo exists at CWD):

- "Save to `docs/ideation/` instead" (repo-mode default destination, available when CWD is inside a git repo)
- "Save to a custom path the user provides" (validate writable; create parent dirs)
- "Skip save and keep the ideation in conversation" (no persistence)

If proof returned a partial `docUrl` before failing, surface that URL alongside the fallback options so the user can recover or share the partial record.

After the fallback completes (any path), continue back to the Phase 6 menu so the user can still brainstorm, refine, or end.

## Quality Bar

Before finishing, check:

- the idea set is grounded in the stated context (codebase in repo mode; user-supplied topic in elsewhere mode)
- the candidate list was generated before filtering
- the original many-ideas -> critique -> survivors mechanism was preserved
- if sub-agents were used, they improved diversity without replacing the core workflow
- every rejected idea has a reason
- survivors are materially better than a naive "give me ideas" list
- persistence followed user choice — terminal-only sessions did not write a file or call Proof
- when persistence did trigger, the mode default was respected unless the user explicitly overrode it
- acting on an idea routes to `ce:brainstorm`, not directly to implementation
