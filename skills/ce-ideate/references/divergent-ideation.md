# Divergent Ideation (Phase 2)

Read this file at the start of Phase 2 — after Phase 1 grounding and any Phase 1.5 evidence scouts complete, and before building any ideation dispatch prompt. It defines the ideation fleet, the dispatch payload, the frames, the per-idea output contract, and the post-merge synthesis steps. Model tier names (extraction / generation / ceiling) are defined in SKILL.md Model Tiers.

## Fleet

Dispatch parallel ideation sub-agents per the Model Tiers fleet. Omit the `mode` parameter so the user's configured permission settings apply. The default fleet is **5 agents covering all six frames**:

- **3 generation-tier agents**, one per evidence-driven frame (Pain and friction; Inversion, removal, or automation; Leverage and compounding). These frames live on evidence — the dossiers do the heavy lifting, so the mid-tier model performs well here.
- **2 ceiling-tier agents** for the ceiling frames, where the strong model's reasoning is the product and must not be tiered down: one takes Cross-domain analogy; the other takes Assumption-breaking and reframing **plus** Constraint-flipping (cousins — both invert givens; one agent holds both as starting biases).

Fleet variants: **surprise-me** and **`go deep`** dispatch 6 agents, one frame each, all ceiling-tier. **Issue-tracker mode** dispatches 4 agents only when issue-tracker intent was detected in Phase 0.2 AND the issue intelligence agent returned usable themes (see override below — cluster-derived frames capped at 4, dispatched on the generation tier; padded frames keep their native tier). The insufficient-issue-signal fallback from Phase 1 uses the default 5-agent fleet.

Each frame targets ~6-8 ideas (a two-frame agent targets that per frame), yielding ~36-48 raw ideas in the default path or ~24-32 across 4 frames in issue-tracker mode; roughly 25-30 survive dedupe in the default path and fewer in the 4-frame path. Adjust per-frame targets when volume overrides apply (e.g., "100 ideas" raises it, "top 3" may lower the survivor count instead).

## Dispatch Payload (cache-friendly, long-context ordered)

Build one shared grounding block and keep it byte-identical across every ideation dispatch this run — identical prefixes let platforms with prompt caching reuse the expensive part. Longform shared material goes first; the agent-specific task goes last:

- `<grounding>` — the consolidated grounding summary, including the evidence gists and the absolute paths of the dossier files under `<scratch-dir>` (identical bytes across agents). Instruct each agent to read the dossier files before generating — they are the evidence layer its bases cite; the gists are orientation, not evidence. In elsewhere modes the only dossiers are user-supplied research dossiers (when present); otherwise the grounding summary itself is the evidence layer.
- `<constraints>` — the user's prompt, the focus hint, and any *User-named references*: ideas that violate these are out regardless of basis
- `<background>` — everything else in the grounding (codebase context, additional context, learnings, external context, user-supplied research): informative, not directive — it can supply an idea's basis, but it must not pull ideation toward whatever was loudest in the corpus when the user named a different focus
- `<axes>` — the Phase 1.5 axis list, when present
- `<task>` — the frame assignment, per-frame volume target, ambition charter, verification-read budget, and the per-idea output contract; generate raw candidates only (critique comes later)

The `<constraints>`/`<background>` split is the primary defense against grounding noise (an unrelated `FEEDBACK.md` the user did not name, a tangentially-cited prior-art result) shaping survivors against user intent — keep it mechanical via the tags, not prose hedging. User-supplied *research* artifacts are background even though user-named — supplying evidence is not issuing a directive; only directive files (per the Phase 1 routing test) ride in `<constraints>`.

**Ambition charter (include verbatim in every ideation dispatch):**

> This ideation exists so the user can choose a direction worth building — the output's value is decided by whether one idea changes what they do next. Generate the smartest, most inventive ideas your frame can reach: ideas a strong team would say "we have to do this" about. Your first few ideas will be the obvious ones — treat them as warm-up, and keep only the ones that still earn their place after the non-obvious ideas exist. If an idea would appear in a generic listicle about this topic, sharpen it with grounding evidence or drop it. Anchor every idea in specific entries from the grounding.

**Verification reads (repo mode).** After an agent makes its internal cut, it may spend up to 5 targeted reads (10 under `go deep`) following dossier `file:line` pointers to verify or deepen the bases of ideas it will submit. A `direct:` basis must quote a line the agent actually read — in a dossier or in the repo — never a guessed citation. Elsewhere modes verify against the user-supplied context — including reading user-research dossiers when present — instead of reading repo files.

## Frames

Assign each sub-agent its frame (or frame pair) as a **starting bias, not a constraint**. Prompt each to begin from its assigned perspective but follow any promising thread -- cross-cutting ideas that span multiple frames are valuable.

**Frame selection (mode-symmetric — same six frames in repo and elsewhere modes):**

1. **Pain and friction** — user, operator, or topic-level pain points; what is consistently slow, broken, or annoying.
2. **Inversion, removal, or automation** — invert a painful step, remove it entirely, or automate it away.
3. **Assumption-breaking and reframing** — what is being treated as fixed that is actually a choice; reframe one level up or sideways.
4. **Leverage and compounding** — choices that, once made, make many future moves cheaper or stronger; second-order effects.
5. **Cross-domain analogy** — generate ideas by asking how completely different fields solve a structurally analogous problem. The grounding domain is the user's topic; the analogy domain is anywhere else (other industries, biology, games, infrastructure, history). Push past the obvious analogy to non-obvious ones.
6. **Constraint-flipping** — invert the obvious constraint to its opposite or extreme. What if the budget were 10x or 0? What if the team were 100 people or 1? What if there were no users, or 1M? Use the resulting design as a candidate even if the constraint flip itself is not realistic.

**Issue-tracker mode override (repo mode only).** When issue-tracker intent is active and themes were returned by the issue intelligence agent: each high/medium-confidence theme becomes a frame. Pad with frames from the 6-frame default pool (in the order listed above) if fewer than 3 cluster-derived frames. Cap at 4 total — issue-tracker mode keeps its tighter dispatch by design. Theme frames dispatch on the generation tier (themes are evidence-driven); padded frames keep their native tier.

**Axis spread instruction.** When an axis list is present, instruct each sub-agent to distribute its ideas across multiple axes — the frame's lens applies to every axis, but ideas should not all cluster on one. Each idea must be tagged with the axis it targets. The frame is a lens; the axis list is the surface map. A frame that plausibly reaches an axis should produce at least one idea there before doubling up on a different axis. When decomposition was skipped (atomic subject or surprise-me), omit the axis instruction entirely — do not invent axes at dispatch time.

**Surprise-me mode addendum.** When Phase 0.2 routed to surprise-me, include this additional instruction in each sub-agent's dispatch prompt:

> No user-specified subject. Through your frame's lens, explore the Phase 1 material and identify the subject(s) you find most interesting for this frame. Different frames finding different subjects is the feature — cross-subject divergence is what makes surprise-me valuable. Each idea still carries a basis; the basis may include identification of the subject itself (why *this* subject is worth ideating on through your lens, citing what in the Phase 1 material signals it).

## Per-Idea Output Contract (uniform across all frames, all modes)

Each sub-agent returns this structure per idea:

- **title**
- **summary** (2-4 sentences)
- **axis** — required when Phase 1.5 produced an axis list. Pick the one axis this idea most centrally targets; do not span. Omit entirely when decomposition was skipped.
- **basis** (required, tagged) — one of:
  - `direct:` quoted line / specific file / named issue / explicit user-supplied context
  - `external:` named prior art, domain research, adjacent pattern, with source
  - `reasoned:` explicit first-principles argument for why this move likely applies — not a gesture; the argument is written out
- **why_it_matters** — connects the basis to the move's significance
- **meeting_test** — one line confirming this would warrant team discussion (waived when Phase 0.5 detected tactical focus signals)

Basis is required, not optional. If a sub-agent cannot articulate a basis of at least one type, the idea does not surface. The failure mode to prevent is generic "AI-slop" ideas that sound plausible but lack a basis the user can verify.

**Generation rules (uniform across frames, all modes):**

- Every idea carries an articulated basis. Unjustified speculation does not surface, regardless of how plausible it sounds.
- Bias toward the basis type your frame naturally produces — pain/inversion/leverage tend toward `direct:`; analogy and constraint-flipping tend toward `reasoned:`; assumption-breaking is mixed — but don't exclude other basis types.
- Apply the meeting-test as a default floor: would this idea warrant team discussion? If not, it's below the floor and does not surface. The floor is relaxed only when Phase 0.5 detected tactical focus signals.
- Stay within the subject's identity. Product expansions, new surfaces, new markets, retirements, and architectural pivots are fair game when the basis supports them. Subject-replacement moves (abandoning the project, pivoting to unrelated domains, becoming a different organization) are out regardless of basis.
- **Honor the asked scope.** When the focus hint names a part of the subject (a flow, a stage, a section, a feature within a larger product — e.g., "account settings", "onboarding flow", "pricing page copy", "gameplay rules"), ideate at full ambition *within that scope*. Expanding the surface to the whole subject — proposing fundamental changes to the broader product when the user named one slice — is a scope mismatch even when no subject-replacement occurred. Big-picture thinking still applies; it just operates inside the bounded surface the user named, not by widening the surface.

## After All Sub-Agents Return

1. Merge and dedupe into one master candidate list.
2. Synthesize cross-cutting combinations -- scan for ideas from different frames that combine into something stronger. In specified mode, expect 3-5 additions at most. **In surprise-me mode, cross-cutting is the magic layer** — frames often converge on overlapping subjects or find complementary angles; expect 5-8 additions and give this step more attention. Surface combinations that span multiple frame-chosen subjects as a distinctive surprise-me output pattern.
3. **Axis-coverage check (when Phase 1.5 produced an axis list; skipped otherwise).** Count ideas per axis after dedupe. For any axis with zero ideas, dispatch one recovery sub-agent (any unused frame, or the frame whose lens fits the missing axis best — e.g., Pain & friction for usability axes, Cross-domain analogy for distribution or compounding axes; dispatched on that frame's native tier) targeting that axis specifically. The recovery dispatch carries the same per-idea output contract and ~3-5 ideas as its target. **Cap recovery at 2 axes total** — if more than 2 axes are empty after the first round, accept thin coverage rather than fanning out further. After recovery returns, merge into the master list and dedupe again. Note empty axes that were not recovered in the rejection summary as "axis: <name> — recovery skipped (cap reached)" so the gap is visible to the user.
4. If a focus was provided, weight the merged list toward it without excluding stronger adjacent ideas.
5. Spread ideas across multiple dimensions when justified: workflow/DX, reliability, extensibility, missing capabilities, docs/knowledge compounding, quality/maintenance, leverage on future work.

**Checkpoint A (V17).** Immediately after the cross-cutting synthesis step completes and the raw candidate list is consolidated, write `<scratch-dir>/raw-candidates.md` (using the absolute path captured in Phase 1) containing the full candidate list with sub-agent attribution. This protects the most expensive output (the parallel ideation dispatches + dedupe) before Phase 3 critique potentially compacts context. Best-effort: if the write fails (disk full, permissions), log a warning and proceed; the checkpoint is not load-bearing. Not cleaned up at the end of the run (the run directory is preserved so the V15 cache remains reusable across run-ids in the same session — see Phase 5).

When the merge, synthesis, and axis-coverage steps are complete, return to SKILL.md Phase 2's closing instruction and load `references/post-ideation-workflow.md` before any critique begins.
