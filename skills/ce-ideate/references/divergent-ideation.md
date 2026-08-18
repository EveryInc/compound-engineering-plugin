# Divergent Ideation (Phase 2)

Read this file at the start of Phase 2 — after Phase 1 grounding and any Phase 1.5 evidence scouts complete, and before building any ideation dispatch prompt. It defines the ideation fleet, the dispatch payload, the frames, the per-idea output contract, and the post-merge synthesis steps. Model tier names (extraction / generation / ceiling) are defined in the model tiers in `references/grounding.md`.

## Fleet

Dispatch parallel ideation sub-agents per the model-tier fleet in `references/grounding.md`. Omit the `mode` parameter so the user's configured permission settings apply. The default fleet is **5 agents covering all six frames**:

- **3 generation-tier agents**, one per evidence-driven frame (Pain and friction; Inversion, removal, or automation; Leverage and compounding). These frames live on evidence — the dossiers do the heavy lifting, so the mid-tier model performs well here.
- **2 ceiling-tier agents** for the ceiling frames, where the strong model's reasoning is the product and must not be tiered down: one takes Cross-domain analogy; the other takes Assumption-breaking and reframing **plus** Constraint-flipping (cousins — both invert givens; one agent holds both as starting biases).

Fleet variants. **Every variant that uses the default frame set covers all six** — scaling changes the agent count, the tier, or the per-frame volume, never how many lenses run. Issue-tracker mode is the one variant that *replaces* the frame set (themes become the frames), so the six-frame floor does not apply to it:

- **surprise-me** and **`go deep`** — 6 agents, one frame each, all ceiling-tier.
- **tactical scope** (Phase 0.5 signals) — **the same 5 agents over 6 frames as the default.** Tactical does not repack the fleet; it lowers each frame's target to 3-4 ideas and each agent's verification budget to 2-3 reads. Packing frames into fewer agents was tried and reverted: per-frame targets stay the same under packing (see the volume line below), so it barely reduces generated output, while the verification budget below is **per agent** — an agent holding three frames verifies about a third as much per idea. Cost comes out of volume and reads; it never comes out of the basis check or the lens count.
- **issue-tracker mode** — 4 agents, only when issue-tracker intent was detected in Phase 0.2 AND the issue intelligence agent returned usable themes (see the override below — cluster-derived frames capped at 4, dispatched on the generation tier; padded frames keep their native tier). This is the one variant that legitimately narrows the frame set, because the themes *are* the surface.

**When two variants fire at once, the surface and the budget are decided separately.** Whichever variant owns the *surface* picks the frames and the agent count; tactical contributes only **its dials** (`references/scope-gates.md` Phase 0.5) — it never repacks another variant's fleet.

| Both fired | Frames | Agents | Volume / reads |
|---|---|---|---|
| issue-tracker + tactical | theme frames (issue-tracker owns the surface) | 4 (issue-tracker owns its fleet) | tactical's dials |
| issue-tracker + `go deep` | theme frames | 4, all ceiling-tier | `go deep`'s doubled reads (10) |
| issue-tracker + surprise-me | theme frames | 4, all ceiling-tier | default |
| tactical + `go deep` | six frames | 6, all ceiling-tier (`go deep` wins outright per Phase 0.5) | default; tactical is suppressed |
| tactical + surprise-me | six frames | 6, all ceiling-tier — surprise-me owns the fleet | tactical's dials |

**tactical + surprise-me** is reachable whenever a vague tactical prompt (`quick wins`) sends the user to the 0.2 subject gate and they pick "Surprise me." Surprise-me owns the fleet and tier — its subject discovery is the mode's entire value. Tactical still contributes **its dials** (`references/scope-gates.md` Phase 0.5), since the user did ask for small wins. Its axis and scout caps are moot here, because surprise-me skips decomposition entirely.

The insufficient-issue-signal fallback from Phase 1 drops back to the six-frame default: **a fallback re-derives only what the abandoned surface determined, and never re-resolves anything else.** Carry forward Phase 0.5's **already-resolved** scaling state — which overrides ended up active *after* its collisions, plus the raw total or explicit survivor count. Do not re-read the prompt's raw signals: a `go deep` run that also said `quick wins` has already had tactical suppressed, and re-deriving from the raw signal would resurrect the waived floor and lowered volume on a maximum-depth run. Re-derive **only** the two values the frame count determined — the agent count and the per-frame split — because the surface changes from at most 4 themes to the 6 defaults. Carrying the old agent count would leave 4 agents holding 6 frames, the packing this skill rejects; carrying the old per-frame volume would multiply a requested total by the new frame count.

Each frame targets ~6-8 ideas — **3-4 under tactical scope** — and a two-frame agent targets that per frame, yielding ~36-48 raw ideas in the default path (~18-24 tactical) or ~24-32 across 4 frames in issue-tracker mode; roughly 25-30 survive dedupe in the default path and fewer in the 4-frame path. **A raw-number volume request is a total, not a per-frame multiplier.** Divide it across the frames in play — `100 ideas` over six frames is ~16-17 each, not 100 each — and adjust the per-frame target to hit that total. Requests shaped like `top 3` constrain the *survivor* count instead and leave generation alone.

**A total too small to spread across the frames is a survivor limit, not a generation target.** `3 ideas about auth` cannot mean three raw candidates divided six ways — that would either overshoot the ask or leave frames unrun, and the six-frame floor is not negotiable. Read any total at or below roughly one per frame the way `top 3` reads: generate normally, then cut to that many survivors.

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

**Verification reads (repo mode).** After an agent makes its internal cut, it may spend up to **5 targeted reads** — 10 under `go deep`, 2-3 under tactical scope — following dossier `file:line` pointers to verify or deepen the bases of ideas it will submit. A `direct:` basis must quote a line the agent actually read — in a dossier or in the repo — never a guessed citation. Elsewhere modes verify against the user-supplied context — including reading user-research dossiers when present — instead of reading repo files.

**The tactical budget is paired with the tactical volume cut, so an override that raises volume returns the ordinary budget.** Where tactical scope is still **active** after Phase 0.5 resolves collisions, a run with an explicit volume request generates at the override's level and verifies at 5 reads, not 2-3 — never raised volume against the lowered cap.

**Budgets are ceilings, not guarantees of uniform scrutiny.** A two-frame agent, and any run at a raised volume target, submits more ideas against the same ceiling, so per-idea depth is lower there. That is an accepted trade, not a defect — but the artifact says so rather than implying every basis got equal verification. An unverified basis presented as verified is the failure this whole mechanism exists to prevent.
## Frames

Assign each sub-agent its frame (or frame pair) as a **starting bias, not a constraint**. Prompt each to begin from its assigned perspective but follow any promising thread -- cross-cutting ideas that span multiple frames are valuable.

**Frame selection (mode-symmetric — same six frames in repo and elsewhere modes):**

1. **Pain and friction** — user, operator, or topic-level pain points; what is consistently slow, broken, or annoying.
2. **Inversion, removal, or automation** — invert a painful step, remove it entirely, or automate it away.
3. **Assumption-breaking and reframing** — what is being treated as fixed that is actually a choice; reframe one level up or sideways.
4. **Leverage and compounding** — choices that, once made, make many future moves cheaper or stronger; second-order effects.
5. **Cross-domain analogy** — generate ideas by asking how completely different fields solve a structurally analogous problem. The grounding domain is the user's topic; the analogy domain is anywhere else (other industries, biology, games, infrastructure, history). Push past the obvious analogy to non-obvious ones.
6. **Constraint-flipping** — invert the obvious constraint to its opposite or extreme. What if the budget were 10x or 0? What if the team were 100 people or 1? What if there were no users, or 1M? Use the resulting design as a candidate even if the constraint flip itself is not realistic.

**Issue-tracker mode override (repo mode only).** When issue-tracker intent is active and themes were returned by the issue intelligence agent: the **highest-leverage themes become frames** — leverage is the analyst's ranking (prevalence + severity + recurrence + breadth), so do not drop a top-leverage theme merely because its confidence is low; use confidence only to break ties among comparable-leverage themes. Pad with frames from the 6-frame default pool (in the order listed above) if fewer than 3 cluster-derived frames. Cap at 4 total — issue-tracker mode keeps its tighter dispatch by design. Theme frames dispatch on the generation tier (themes are evidence-driven); padded frames keep their native tier.

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
- **meeting_test** — one line confirming this would warrant team discussion (waived when tactical scope is active — Phase 0.5)

Basis is required, not optional. If a sub-agent cannot articulate a basis of at least one type, the idea does not surface. The failure mode to prevent is generic "AI-slop" ideas that sound plausible but lack a basis the user can verify.

**Generation rules (uniform across frames, all modes):**

- Every idea carries an articulated basis. Unjustified speculation does not surface, regardless of how plausible it sounds.
- Bias toward the basis type your frame naturally produces — pain/inversion/leverage tend toward `direct:`; analogy and constraint-flipping tend toward `reasoned:`; assumption-breaking is mixed — but don't exclude other basis types.
- Apply the meeting-test as a default floor: would this idea warrant team discussion? If not, it's below the floor and does not surface. The floor is relaxed only when tactical scope is active (Phase 0.5) — a `go deep` run that also carried a tactical word is not tactical.
- Stay within the subject's identity. Product expansions, new surfaces, new markets, retirements, and architectural pivots are fair game when the basis supports them. Subject-replacement moves (abandoning the project, pivoting to unrelated domains, becoming a different organization) are out regardless of basis.
- **Honor the asked scope.** When the focus hint names a part of the subject (a flow, a stage, a section, a feature within a larger product — e.g., "account settings", "onboarding flow", "pricing page copy", "gameplay rules"), ideate at full ambition *within that scope*. Expanding the surface to the whole subject — proposing fundamental changes to the broader product when the user named one slice — is a scope mismatch even when no subject-replacement occurred. Big-picture thinking still applies; it just operates inside the bounded surface the user named, not by widening the surface.

## After All Sub-Agents Return

1. Merge and dedupe into one master candidate list.
2. Synthesize cross-cutting combinations -- scan for ideas from different frames that combine into something stronger. In specified mode, expect 3-5 additions at most. **In surprise-me mode, cross-cutting is the magic layer** — frames often converge on overlapping subjects or find complementary angles; expect 5-8 additions and give this step more attention. Surface combinations that span multiple frame-chosen subjects as a distinctive surprise-me output pattern.
3. **Axis-coverage check (when Phase 1.5 produced an axis list; skipped otherwise).** Count ideas per axis after dedupe. For any axis with zero ideas, dispatch one recovery sub-agent (any unused frame, or the frame whose lens fits the missing axis best — e.g., Pain & friction for usability axes, Cross-domain analogy for distribution or compounding axes; dispatched on that frame's native tier) targeting that axis specifically. The recovery dispatch carries the same per-idea output contract and ~3-5 ideas as its target. **Cap recovery at 2 axes total** — if more than 2 axes are empty after the first round, accept thin coverage rather than fanning out further. After recovery returns, merge into the master list and dedupe again. Note empty axes that were not recovered in the rejection summary as "axis: <name> — recovery skipped (cap reached)" so the gap is visible to the user.
4. If a focus was provided, weight the merged list toward it without excluding stronger adjacent ideas.
5. Spread ideas across multiple dimensions when justified: workflow/DX, reliability, extensibility, missing capabilities, docs/knowledge compounding, quality/maintenance, leverage on future work.

**Checkpoint A (V17).** Immediately after the cross-cutting synthesis step completes and the raw candidate list is consolidated, write `<scratch-dir>/raw-candidates.md` (using the absolute path captured in Phase 1) containing the full candidate list with sub-agent attribution. This protects the most expensive output (the parallel ideation dispatches + dedupe) before Phase 3 critique potentially compacts context. Best-effort: if the write fails (disk full, permissions), log a warning and proceed; the checkpoint is not load-bearing. Not cleaned up at the end of the run (the run directory is preserved so the V15 cache remains reusable across run-ids in the same session — see Phase 5).

When the merge, synthesis, and axis-coverage steps are complete, load `references/post-ideation-workflow.md` before any critique begins. That read is required: the filtering rubric, the Phase 4 auto-write, and the Phase 5 menu live only there.
