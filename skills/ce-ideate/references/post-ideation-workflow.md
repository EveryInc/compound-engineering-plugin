# Post-Ideation Workflow

Read this file after Phase 2 ideation agents return and the orchestrator has merged and deduped their outputs into a master candidate list. Do not load before Phase 2 completes.

## Phase 3: Adversarial Filtering

Review every candidate idea critically. Critique runs in two layers — a fresh-context verifier first, then orchestrator arbitration. Fresh-context verification outperforms self-critique: the orchestrator synthesized some of these candidates itself and carries the full generation history, so it is anchored in ways a verifier that never saw the generation is not.

1. **Basis verification (one generation-tier sub-agent — see SKILL.md Model Tiers).** Dispatch a verifier whose payload is only the consolidated grounding summary (including the evidence gists and dossier file paths — it reads dossier files itself as needed) and the merged candidate list — none of the generation history. Prompt it to refute: for each candidate, check that the stated basis actually supports the claimed move, that `direct:` quotes exist where cited (spot-check by reading the file in repo mode), that `external:` prior art is real and relevantly analogous, that `reasoned:` arguments hold, and that the idea genuinely passes the meeting-test. It returns a per-candidate verdict (sound / weak / refuted) with a one-line reason. The verifier did not write the ideas, so its meeting-test judgment supersedes the generators' self-attestation. Under `go deep` (Phase 0.5), dispatch a second, ceiling-tier critic focused on novelty and feasibility with the same fresh-context payload.

2. **Orchestrator arbitration.** The orchestrator makes the final cut, weighing verifier verdicts without being bound by them — overrule a verdict when evidence in context contradicts it, and say so in the rejection reason.

If verifier dispatch fails (platform limits, errors), fall back to orchestrator-only filtering and note the degradation in the rejection summary.

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
- **unjustified — no articulated basis** (sub-agent failed to provide `direct:`, `external:`, or `reasoned:` justification, or the stated basis does not actually support the claimed move)
- **basis refuted by verification** (the verifier found a cited quote absent, prior art mischaracterized, or a reasoned argument unsound — and the orchestrator concurs)
- **below ambition floor** (fails the meeting-test: would not warrant team discussion — except when Phase 0.5 detected tactical focus signals, in which case this criterion is waived)
- **subject-replacement** (abandons or replaces the subject of ideation rather than operating on it — e.g., "pivot to an unrelated domain," "become a different organization")
- **scope overrun** (expands beyond the asked scope rather than ideating within it — e.g., proposes changes to the whole product when the user asked about one flow, stage, or section). Allowed only when the basis explicitly justifies the expansion; default is reject or downgrade.

Score survivors using a consistent rubric weighing: groundedness in stated context, **basis strength** (`direct:` > `external:` > `reasoned:`; none excluded, but direct-evidence ideas score higher all else equal), expected value, novelty, pragmatism, leverage on future work, implementation burden, overlap with stronger ideas, and **axis spread** (when Phase 1.5 produced an axis list) — survivor sets that cover the topic's surface outscore sets that cluster on one axis, all else equal.

**Axis coverage as a list-level concern.** When axes were defined, axis spread is evaluated across the survivor set, not per-idea. After per-idea filtering, check the survivor set: if axis coverage is uneven and stronger candidates exist on under-represented axes, prefer the spread when promoting borderline candidates. Phase 2's recovery dispatch should already have surfaced candidates for empty axes; this is a polish step on the survivor selection. If an axis ends up with zero survivors despite recovery (or because recovery hit the 2-axis cap), note it in the rejection summary as a deliberate gap rather than an oversight.

Target output:
- keep 5-7 survivors by default
- if too many survive, run a second stricter pass
- if fewer than 5 survive, report that honestly rather than lowering the bar

## Phase 4: Write and Present the Deliverable

The ideation artifact is produced **automatically** — persistence is not opt-in. After filtering, write the deliverable, show a concise summary, and open it. The full content lives in the file; the session shows only an orienting summary, so the rich format is what the reader actually engages with.

**Checkpoint B (V17).** Before writing the deliverable, write `<scratch-dir>/survivors.md` (absolute path from Phase 1) containing the survivor list plus key context (focus hint, grounding summary, rejection summary). Best-effort: if the write fails, log a warning and proceed; the checkpoint is not load-bearing. Reuses the same `<run-id>` / `<scratch-dir>` generated in Phase 1.

### 4.1 Write the Deliverable (automatic, both modes)

`OUTPUT_FORMAT` (resolved in SKILL.md Phase 0.0; default `html`) sets the extension. Write the file every run — do not wait for the user to ask.

1. **Resolve the target directory and extension.**
   - Extension follows `OUTPUT_FORMAT` (`.html` default, `.md` on override).
   - **Repo mode:** ensure `docs/ideation/` exists (create if absent).
   - **Elsewhere mode with `docs/ideation/` already present:** use it.
   - **Otherwise (no repo, or elsewhere with no `docs/ideation/`):** write into the run's CE temp area — the `<scratch-dir>` resolved in Phase 1 (`/tmp/compound-engineering/ce-ideate/<run-id>/`). Do **not** write into the user's current working directory, and do **not** create a `docs/ideation/` tree for a subject unrelated to the repo. Announce the absolute path and note it is temporary (`/tmp` is cleared on reboot — move it to keep it).
2. **Choose the file path:** `<dir>/YYYY-MM-DD-<topic>-ideation.<ext>` (or `<dir>/YYYY-MM-DD-open-ideation.<ext>` when no focus exists).
3. **Load the section contract and rendering reference** (deferred from Phase 0.0): read `references/ideation-sections.md` and the format-rendering reference matching `OUTPUT_FORMAT` — `references/markdown-rendering.md` for `md`, `references/html-rendering.md` for `html`.
4. **Write the document** per those references. `ideation-sections.md` defines the section contract (metadata, Grounding Context, Topic Axes, Ranked Ideas with per-idea fields, Rejection Summary); the rendering reference defines how the resolved format presents it. Content is identical across formats; only presentation differs.
   - **On write failure** (no writable path, permissions): announce the failure and offer a custom path (validate writable; create parent dirs). Never lose the survivors silently.

**Resume:** update the existing file in place, in its existing format (per SKILL.md Phase 0.1 format precedence); carry the prior ideas and rejection summary forward, adding to them rather than overwriting.

### 4.2 Present a Concise Summary (not the full deliverable)

The full cards, rationale, downsides, diagrams, and the rejection table live in the file. Do **not** reproduce them in the session — reprinting the whole deliverable as chat text defeats the rich format and leads the reader through plain text before they ever see it. Show a tight orientation instead:

- One line with counts and the path: e.g. `Wrote 7 ranked ideas (36 raw, 13 cut) across 5 axes → <absolute path>`.
- A ranked list, **one line per survivor**: `1. <Title> · <axis> · Conf <High/Med/Low> · Cx <S/M/L>`.
- The top pick called out in a sentence.
- Any axis with zero survivors noted in one line (the deliberate gap).

This ranked list doubles as the index the user references when choosing an idea in Phase 5. Terminal-only readers still get a usable view; depth is one open away.

### 4.3 Open It

- **HTML:** in an interactive session, best-effort open the file in the browser via the platform's open primitive (`open` on macOS, `xdg-open` on Linux, `start` on Windows); always print the absolute path so it can be reopened or shared. Skip auto-open in headless / pipeline runs (no interactive surface).
- **Markdown:** print the path. Proof (the markdown share surface) is reached through the Phase 5 menu — it is a network action, not auto-invoked.

## Phase 5: Next Steps

Ask what to do next using the platform's blocking question tool: `AskUserQuestion` in Claude Code (call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded), `request_user_input` in Codex, `ask_user` in Gemini, `ask_user` in Pi (requires the `pi-ask-user` extension). Fall back to numbered options in chat only when no blocking tool exists in the harness or the call errors (e.g., Codex edit modes) — not because a schema load is required. Never silently skip the question. Free-text answers are accepted.

The deliverable already exists (Phase 4), so the menu is purely *what next* — there is no "save" step.

**Stem:** "Your ideation is saved to `<path>`. What next?"

Offer four options (self-contained labels with the distinguishing word front-loaded so they stay distinct when truncated). Option 1 is **format-keyed** — render exactly one of its two labels per run, matching `OUTPUT_FORMAT`:

1. *(when `OUTPUT_FORMAT=html`)* **Open in browser** — open the saved HTML deliverable (re-open if it was already opened).
   *(when `OUTPUT_FORMAT=md`)* **Publish to Proof** — publish the saved markdown to Proof and get a shareable link; one-way, the local file stays canonical.
2. **Brainstorm one idea with `ce-brainstorm`** — commit a chosen idea to a requirements doc; leaves ce-ideate. Asks which idea first.
3. **Iterate on one idea (adjust / ask, stay here)** — sharpen or interrogate a chosen idea before committing. Asks which idea and how.
4. **Done — keep the file and stop.**

**Adjacent nudge (prose, not a slot):** "Don't want it kept? Say 'discard' and the agent deletes the file." Handled via free text (see §5.5); it is create-only and never deletes a resumed or pre-existing doc.

If the user already named an idea inline (e.g. "brainstorm the table tool", "tighten the highlighter idea"), skip the "which idea?" follow-up for §5.2 / §5.3.

### 5.1 Open in Browser (html) / Publish to Proof (md)

- **HTML — Open in browser.** (Re)open the saved file via the platform primitive where available; otherwise print the absolute path. Return to the Phase 5 menu. No Proof — the HTML file is the canonical record.
- **Markdown — Publish to Proof.** The local markdown file already exists (Phase 4) and stays canonical; Proof is a one-way published copy, not a sync target. Load the `ce-proof` skill to publish, passing:
  - **source file:** the saved `.md` file from Phase 4.
  - **doc title:** `Ideation: <topic>` or the doc's H1.
  - **identity:** `ai:compound-engineering` / `Compound Engineering`.

  ce-proof creates a shared Proof doc (Create and Share workflow) and returns the share URL. Surface it to the user, then return to the Phase 5 menu — nothing syncs back to disk. If the Proof handoff fails after the proof skill's internal retry plus one orchestrator-side retry (~2s pause, narrated as "Retrying Proof... attempt 2/2"), tell the user Proof is unavailable and that the local file is intact at `<path>`, then return to the menu — the deliverable was never at risk (it was written in Phase 4). *(If the user explicitly asked for Proof during an HTML run: Proof is markdown-only and cannot ingest HTML, so render a throwaway markdown copy of the survivors as the Proof source and do not upload the `.html`.)*

### 5.2 Brainstorm One Idea

1. **Identify the idea** by number or name (skip if the user already named it). Match against the ranked list from Phase 4.2.
2. **Build a focused seed** from the idea's substance already in the orchestrator's context. Do **not** pass the whole file — wasteful and noisy (the other survivors, grounding, and rejection table are irrelevant to defining this one idea, and an HTML file carries CSS/SVG chrome). Do **not** pass only a file pointer — that forces `ce-brainstorm` to re-open and re-extract the idea the orchestrator already holds. The seed is feature-description-shaped:

   > `<title> — <description>. Basis: <basis/evidence>. Why it matters: <rationale>. Known tradeoffs: <downsides>.`

   The basis/evidence directly feeds `ce-brainstorm`'s product-pressure-test, so it won't re-derive what we already know. Append a one-line provenance pointer: `(Seeded from ce-ideate: <path>, idea "<title>")` — it records origin and lets brainstorm pull adjacent detail if it wants, without being forced to read anything.
3. **Load the `ce-brainstorm` skill** with that seed. The saved file is already the record — no extra write step.

**Repo mode only:** do **not** skip brainstorming and go straight to `ce-plan` — `ce-plan` wants brainstorm-grounded requirements. In elsewhere modes, ideation is a legitimate terminal state; brainstorming is optional deeper development of one idea, not a required next rung on an implementation ladder that does not exist in these modes.

### 5.3 Iterate on One Idea

This stays in ce-ideate — no skill handoff. It is the "poke at one idea before committing" step.

1. **Identify the idea** (number or name) and **how** the user wants to iterate — adjust it, ask about it, or go deeper. Infer the how from their phrasing when given; otherwise ask.
2. **Route by intent:**
   - **Adjust** ("smaller scope", "drop the paste-import part", "reframe around X") — revise that idea's framing, scope, or basis as discussed, then **rewrite the saved file** so the deliverable stays current.
   - **Ask** ("why High confidence?", "how does this compare to FigJam?") — answer in conversation, grounded in the idea's basis and the Phase 1 grounding. **No file rewrite** unless the discussion yields a change the user wants captured.
   - **Deepen** ("expand the second-order effects") — extend that idea's analysis; capture into the file only if the user wants it kept.
3. **Rewrite only on change.** The file is rewritten only when an idea's content actually changes — Q&A alone does not churn it.
4. **Return to the Phase 5 menu.** Typically the user next brainstorms the sharpened idea (§5.2), iterates more, opens it, or finishes.

### 5.4 Done

The file is already written, so there is no save step.

- **Inside a git repo:** offer to commit only the ideation doc (do not create a branch, do not push; if the user declines, leave it uncommitted).
- **Temp-area or non-repo file:** skip the commit offer.

Then narrate the path and end the session — do not return to the menu.

### 5.5 Discard (free text)

Only when the file was **created fresh this run**: delete it, confirm the deletion, and end. On a **resume** run (a pre-existing file was updated in place), do **not** delete — tell the user the existing doc at `<path>` remains and offer no destructive action. Discard is never a default; it fires only on an explicit request.

Do not delete the run's scratch directory (`<scratch-dir>`) on completion — it holds the V15 web-research cache reused across run-ids by later ideation invocations in the same session (see `references/web-research-cache.md`), the Checkpoint A/B files, the evidence dossiers, and (in the no-repo case) the deliverable itself. OS handles eventual cleanup.

## Quality Bar

Before finishing, check:

- the idea set is grounded in the stated context (codebase in repo mode; user-supplied context in elsewhere mode)
- **every surviving idea has an articulated basis** (`direct:`, `external:`, or `reasoned:`) that actually supports the claimed move — speculation dressed as ambition was rejected, with reasons
- load-bearing `direct:` bases were verified against the repo (or the supplied context) — by the generating agent's verification reads or the Phase 3 verifier — not taken on faith
- **every surviving idea passes the meeting-test** unless Phase 0.5 detected tactical focus signals that waived the floor
- **no surviving idea replaces the subject** rather than operating on it
- when Phase 1.5 produced an axis list, the survivor set spreads across axes rather than clustering on one — and any axis with zero survivors is noted as a deliberate gap in the rejection summary, not silently absent
- the candidate list was generated before filtering
- the original many-ideas -> critique -> survivors mechanism was preserved
- if sub-agents were used, they improved diversity without replacing the core workflow
- every rejected idea has a reason
- survivors are materially better than a naive "give me ideas" list
- the deliverable was written automatically in both modes (Phase 4) — to `docs/ideation/` when present, else the CE temp area, never the user's CWD
- the session showed a concise summary, not a reproduction of the full deliverable
- acting on an idea routes to `ce-brainstorm` (with a substance seed, not the whole file), not directly to implementation
