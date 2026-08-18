# Issue Intelligence (Phase 1, conditional)

Read this when Phase 1 step 4 fires — issue-tracker intent was detected in Phase 0.2. `references/grounding.md` owns the four-step sequence (scan → fall back or scope → cluster → await); this file owns the payload of each call and the scoping question's construction.

The lens works against whichever tracker is reachable — GitHub, Linear, or Jira. Probe by capability (a connector/MCP, a documented API, or a documented CLI), never by assuming a specific binary exists. A missing binary or env var is not proof the tracker is unreachable.

## a. Scan call

Read `references/agents/issue-intelligence-analyst.md` and dispatch a generic subagent seeded with that prompt, the focus hint, the `<scratch-dir>` resolved earlier in Phase 1, and the instruction that it is in **SCAN mode**.

It probes tracker access, does one bounded fetch, persists that fetched set to `<scratch-dir>/issue-scan.json`, and returns the distribution, a signal count, and an ambiguity assessment. It does **not** cluster.

The scan call may run alongside the other Phase 1 grounding agents.

## b. Fallback markers

Two outcomes end the lens before the cluster call. Both are warn-and-proceed — never block the run on them:

- **First line is the `Issue analysis unavailable:` marker** (no reachable tracker) — log `"{that message}. Proceeding with standard ideation."` and continue with the remaining grounding.
- **Fewer than 5 eligible issues** — note `"Insufficient issue signal for theme analysis"` and continue.

In both cases Phase 2 falls back to the six-frame default fleet rather than the 4-agent issue-tracker fleet — and **a fallback re-derives only what the abandoned surface determined, and never re-resolves anything else.** Carry forward Phase 0.5's **already-resolved** scaling state — which overrides ended up active *after* its collisions, plus the raw total or explicit survivor count. Do not re-read the prompt's raw signals: a `go deep` run that also said `quick wins` has already had tactical suppressed, and re-deriving from the raw signal would resurrect the waived floor and lowered volume on a maximum-depth run. Re-derive **only** the two values the frame count determined — the agent count and the per-frame split — because the surface changes from at most 4 themes to the 6 defaults. Carrying the old agent count would leave 4 agents holding 6 frames, the packing this skill rejects; carrying the old per-frame volume would multiply a requested total by the new frame count. See the fleet variants in `references/divergent-ideation.md`. No scoping question is asked.

## b. Scoping gate (the orchestrator decides; at most one question)

Read the scan's ambiguity assessment.

**Auto-scope silently by default.** Compose the scope from focus hint → priority (when populated) → workflow-state → recency.

Fire **one** blocking scoping question (per the asking rules in `references/grounding.md`) **only** on irreducible ambiguity: two or more coherent, materially-different scopes that no single deliberately-varied sample could fairly represent. Skip it entirely when the scan is unambiguous.

Its options are the scan's distribution-derived slices plus an always-present **"analyze a representative sample of everything,"** so the user can decline to narrow. When the slices plus that option would exceed the platform's blocking-tool option cap (Codex `request_user_input` takes 2-3 explicit options; `AskUserQuestion` takes 4), show the highest-mass slices that fit and fold the rest into the representative-sample option, or fall back to a numbered chat list. **Never drop the representative-sample option.**

This is a grounding / subject-scoping question — the same kind as the Phase 0.2 subject gate ("what should the agent work on"), not a Phase 0.4 solution-constraint question. It counts toward the ≤3-question grain, and "Surprise me" stays available.

## c. Cluster call

Dispatch the analyst again in **CLUSTER mode**, passing the resolved scope **and the same `<scratch-dir>`** so it reuses the persisted `issue-scan.json` rather than re-fetching. It returns the leverage-ranked themes plus coverage accounting.

## d. What consolidation must carry

The consolidated grounding summary's `Issue intelligence` section carries the theme summaries (titles, descriptions, issue counts, leverage, trend directions) **and the cluster call's coverage accounting** — fetched / eligible / analyzed / excluded / unknown-remainder, with any `>N` lower bound. That accounting is the non-exhaustive-coverage disclosure; it has to reach Phase 2 ideation and the Phase 4 artifact rather than being dropped at consolidation.

Themes become Phase 2 frames per the issue-tracker override in `references/divergent-ideation.md`.
