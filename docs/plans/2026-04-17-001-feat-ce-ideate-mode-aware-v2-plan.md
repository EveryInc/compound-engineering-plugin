---
title: "feat: ce:ideate v2 — mode-aware ideation with web-researcher and opt-in persistence"
type: feat
status: active
date: 2026-04-17
origin: docs/brainstorms/2026-03-15-ce-ideate-skill-requirements.md
---

# ce:ideate v2 — Mode-Aware Ideation with Web-Researcher and Opt-In Persistence

## Overview

`ce:ideate` v1 assumes the ideation subject is the current repository. Phase 1 always scans the codebase, the rubric weights "groundedness in current repo," and the skill always writes to `docs/ideation/`. This excludes non-repo use cases (greenfield product ideation, business model exploration, UX/naming/narrative work, personal decisions) and over-couples persistence to the file system.

v2 makes the skill **mode-aware** — preserving everything that works for repo-grounded ideation while expanding the audience to **elsewhere mode** (greenfield product ideation, business model exploration, design/UX/naming/narrative work, personal decisions). It also adds a `web-researcher` agent so external context becomes available for both modes (always-on by default, opt-out for speed), upgrades the ideation frame set with two new universal frames, and shifts persistence to **terminal-first / opt-in** with mode-determined defaults (Proof for elsewhere, `docs/ideation/` for repo).

**Terminology note:** "elsewhere mode" is the canonical term throughout this plan. Earlier conversation drafts used "greenfield," "non-repo," and "non-software" interchangeably; those terms describe overlapping but non-identical subsets of elsewhere-mode use cases.

The mechanism that makes the skill good — generate many → adversarial critique → present survivors with reasons — is preserved untouched. Only grounding, frames, and persistence become mode-variable.

---

## Problem Frame

**v1 limitations the conversation surfaced:**

- The skill description says "for the current project," Phase 1 is a mandatory codebase scan, and the rubric explicitly weights repo groundedness — there's no escape hatch for elsewhere-mode subjects (see origin: `docs/brainstorms/2026-03-15-ce-ideate-skill-requirements.md`).
- A user inside any repo who runs `/ce:ideate pricing model for a new SaaS` will get codebase-contaminated grounding and a rubric that punishes ideas not tied to the current repo.
- Persistence is mandatory before handoff (`Phase 5: Always write or update the artifact before handing off`), forcing a file write even when the user just wants in-conversation exploration.
- v1 explicitly defers external research as a future enhancement (origin scope boundary: "The skill does not do external research ... in v1"). For elsewhere mode, where user-supplied context is the only grounding, external research stops being optional and starts being load-bearing.

**Audience this v2 expansion enables (all elsewhere-mode use cases):**

- Designers ideating widget/interaction concepts not yet built
- PMs/founders exploring pricing, business models, product directions
- Writers/creatives working on naming, narrative beats, positioning
- Anyone using the codebase as workstation but ideating about something unrelated
- Existing repo-grounded users (no regression in the repo path)

---

## Requirements Trace

Numbered requirements that this plan must satisfy. Carries forward applicable v1 requirements (R-prefix from origin doc) and adds v2-specific requirements (V-prefix).

**Carried forward from v1 origin (unchanged in v2):**
- R4. Generate many → critique → survivors mechanism preserved
- R5. Adversarial filtering with explicit rejection reasons
- R6. Present survivors with description, rationale, downsides, confidence, complexity
- R7. Brief rejection summary
- R10. Handoff options after presentation: brainstorm, refine, share to Proof, end
- R11. Always route to `ce:brainstorm` when acting on an idea
- R13. Resume behavior: check `docs/ideation/` for recent docs (repo mode only in v2)
- R14. Present survivors before writing artifact
- R16. Refine routes by intent (more ideas / re-evaluate / dig deeper)
- R17. Agent intelligence supports the prompt mechanism, doesn't replace it
- R22. Orchestrator owns final scoring; sub-agents emit local signals only

**v2 additions:**

- V1. Phase 0 classifies the **subject** of ideation as `repo-grounded` or `elsewhere` based on prompt + topic-repo coherence + CWD signals. Mode classification is structurally **two sequential binary decisions**: (a) repo-grounded vs elsewhere, and (b) for elsewhere, software vs non-software (the latter routes to `references/universal-ideation.md`). Apply negative-signal enumeration at both decision points (per `docs/solutions/skill-design/claude-permissions-optimizer-classification-fix.md`). Agent states inferred mode in one sentence; on ambiguous prompts (signals genuinely conflict, OR a single-keyword/short-prompt invocation that maps cleanly to either mode) the agent asks a single confirmation question before dispatching grounding.
- V2. Phase 0 light context intake (elsewhere mode only) applies the **discrimination test**: would swapping one piece of context for a contrasting alternative materially change which ideas survive? Default to proceeding; ask 1-3 narrowly chosen questions only when context fails the test. Stop asking on dismissive responses; treat genuine "no constraint" answers as real answers.
- V3. New agent `web-researcher` performs iterative web search + fetch, returning structured external grounding (prior art, adjacent solutions, market signals, cross-domain analogies). Tools: WebSearch + WebFetch. Model: Sonnet. Reusable across skills.
- V4. `web-researcher` follows a phased search budget — scoping (2-4) → narrowing (3-6) → deep extraction (3-5 fetches) → gap-filling (1-3) — with soft ceilings (~15-20 searches, ~5-8 fetches) and an early-stop heuristic (stop when marginal queries return mostly redundant findings).
- V5. Phase 1 dispatches `web-researcher` always-on for both modes. User can skip with phrases like "no external research" / "skip web research."
- V6. Phase 1 grounding is mode-aware: repo-mode dispatches the v1 codebase scan + learnings + optional issues; elsewhere-mode skips the codebase scan and treats user-supplied context as primary grounding. Both modes always run learnings-researcher and the new web-researcher.
- V7. Phase 2 dispatches **6 always-on frames** for both modes: pain/friction, inversion/removal/automation, assumption-breaking/reframing, leverage/compounding, **cross-domain analogy (new)**, **constraint-flipping (new)**. Per-agent target reduced from 8-10 to 6-8 ideas to keep raw output volume comparable to v1.
- V8. Phase 3 rubric phrasing changes from "grounded in current repo" to "grounded in stated context" — mode-neutral wording, identical mechanism.
- V9. Persistence becomes **terminal-first and opt-in**. The terminal review loop is a complete end state — refinement loops happen in conversation with no file or network cost. Persistence only triggers when the user explicitly chooses to save, share, or hand off.
- V10. Persistence defaults are **mode-determined**: repo-mode defaults to `docs/ideation/` (v1 behavior preserved), elsewhere-mode defaults to Proof. Either mode can also use the other destination on request.
- V11. Proof failure ladder, **orchestrator-side**: the proof skill itself does single-retry-once internally on `STALE_BASE`/`BASE_TOKEN_REQUIRED` and then surfaces failure (via `report_bug` or returned status). The ce:ideate orchestrator wraps the proof skill invocation in **one additional best-effort retry** (single retry, ~2s pause) — it does not attempt to classify error types from outside the skill, because the proof skill's contract does not surface error classes to callers today. On persistent failure (proof skill returns failure twice from the orchestrator's perspective), present a fallback menu via the platform's question tool. Fallback options and partial-URL surfacing are detailed in Unit 6. The 2-vs-3 option count is captured in Open Questions; commit to one wording during implementation rather than re-litigating.
- V12. Cost transparency: orchestrator briefly discloses agent dispatch count on each invocation so multi-agent cost isn't invisible. Skip-phrases (web research, slack, etc.) reduce dispatch count. Phrasing format and placement deferred to implementation (see Open Questions).
- V13. New file `references/universal-ideation.md` provides the parallel non-software facilitation reference, mirroring `ce-brainstorm/references/universal-brainstorming.md` shape. Loaded in elsewhere-mode when topic is non-software.
- V14. `web-researcher` is named (agent file in `agents/research/web-researcher.md`) — not an inline frame — so it can be reused by `ce:brainstorm`, future skills, and direct user invocation. Reusability across other skills is deferred (see Scope Boundaries) — the named-agent decision is justified primarily on tool scoping, model pinning, discoverability, and stable output contract; reuse is forward-looking, not load-bearing today.
- V15. **Session-scoped web-research reuse via sidecar cache file:** the orchestrator persists each `web-researcher` result to `.context/compound-engineering/ce-ideate/<run-id>/web-research-cache.json`. The cache key is `{mode, focus_hint_normalized, topic_surface_hash}`. On every Phase 1 dispatch, the orchestrator first checks for any cache file under `.context/compound-engineering/ce-ideate/*/web-research-cache.json` (across run-ids — refinement loops within a session reuse across runs by topic, not run-id) and reuses a matching entry if found. If reuse fires, note "Reusing prior web research from this session — say 're-research' to refresh." User override "re-research" deletes the matching cache entry and re-dispatches. **Graceful degradation:** if the orchestrator cannot read prior tool-results across turns on the current platform — verified during Unit 4 implementation by attempting a sidecar cache read and confirming the file is readable on subsequent skill invocations within the same session — V15 degrades to "no reuse, dispatch every time" with a note in the consolidated grounding summary. This bounds the iteration-cost failure mode where rapid refinement loops pay the full ~15-20 search budget repeatedly without inventing a platform capability that may not exist.
- V16. **Active mode confirmation on ambiguous prompts:** when the mode classifier's confidence is low (single-keyword invocations, short prompts mapping cleanly to either mode, conflicting CWD/prompt signals), the orchestrator asks a single confirmation question before dispatching Phase 1 grounding. The cheap one-sentence inferred-mode statement remains the default for clear cases; explicit confirmation is reserved for ambiguity, sized to avoid burning a multi-agent dispatch on the wrong mode.
- V17. **Auto-compact safety with two checkpoints:** Phases 1-2 (multi-agent grounding + 6-frame ideation dispatch) are the longest and most expensive stages — protecting only the post-filter Phase 4 state would be theater. The orchestrator writes two checkpoints under `.context/compound-engineering/ce-ideate/<run-id>/`: (a) `raw-candidates.md` immediately after Phase 2 merge/dedupe completes (preserves the expensive multi-agent output before Phase 3 critique runs), (b) `survivors.md` immediately before Phase 4 survivors presentation (preserves the post-critique survivor list before the user reaches the persistence menu). Neither is the durable artifact (V9-V11 govern that). Both are best-effort — if write fails (disk full, perms), log warning and proceed; checkpoints are not load-bearing. Cleaned up together on Phase 6 completion (any path) unless the user opted to inspect them. If `.context/` namespacing is unavailable on the current platform, fall back to `mktemp -d` per repo Scratch Space convention. On resume, the orchestrator may detect a checkpoint via `.context/compound-engineering/ce-ideate/*/survivors.md` glob, but auto-resume from a partial checkpoint is out of v2 scope — V17 prevents *silent* loss, not lost-work recovery.

---

## Scope Boundaries

- **No changes to v1 mechanism.** Many → critique → survivors stays. Sub-agent fan-out stays. Resume behavior stays. Handoff to `ce:brainstorm` stays.
- **No new persona-style ideation agents.** Frames remain prompt-defined and dispatched via anonymous Phase 2 sub-agents per origin R18. Reasoning: named personas ossify into stereotypes; frames stay flexible.
- **No keyword-driven mode rules.** Mode classification leans on agent reasoning over the prompt + signals, mirroring `ce:brainstorm` Phase 0.1b's approach.
- **No structural changes to Phase 3 (adversarial filtering) or Phase 4 (presentation)** beyond the rubric phrasing change in V8.
- **No automatic mixing of grounding sources.** Hybrid topics ("ideate pricing for our open-source CLI") default to mode-pure (elsewhere) — the user provides repo facts as context if they want.

### Deferred to Separate Tasks

- **Per-skill cost surfacing UI/UX standardization.** V12's "disclose dispatch count" applies to ce:ideate only here. A broader convention across all multi-agent skills (`ce:plan`, `ce:review`, etc.) is worth a separate effort.
- **`web-researcher` adoption in other skills.** This plan creates the agent and uses it from ce:ideate. Wiring it into `ce:brainstorm`, `ce:plan` external research stage, and other future consumers happens in follow-up PRs.
- **Linear/Jira issue intelligence integration.** Origin issue-intelligence requirements (`docs/brainstorms/2026-03-16-issue-grounded-ideation-requirements.md`) deferred this. v2 doesn't change it.
- **Frame quality measurement.** The learnings researcher noted ideation frame design has no captured prior art. Capturing a `docs/solutions/skill-design/` learning *after* v2 ships is in scope; running a formal frame-quality study is not.

---

## Context & Research

### Relevant Code and Patterns

- `plugins/compound-engineering/skills/ce-ideate/SKILL.md` — current v1 implementation; Phase 1 codebase scan dispatch starts at line ~96
- `plugins/compound-engineering/skills/ce-ideate/references/post-ideation-workflow.md` — current Phase 3-6 spec; persistence and handoff logic to rewrite
- `plugins/compound-engineering/skills/ce-brainstorm/SKILL.md:59-71` — Phase 0.1b "Classify Task Domain" — the mode classification pattern to mirror
- `plugins/compound-engineering/skills/ce-brainstorm/references/universal-brainstorming.md` — 56-line shape to mirror for `universal-ideation.md`
- `plugins/compound-engineering/agents/research/learnings-researcher.md` — frontmatter and structure exemplar (mid-size, ~9.6K)
- `plugins/compound-engineering/agents/research/issue-intelligence-analyst.md` — methodology + tool guidance + integration points pattern (~13.9K)
- `plugins/compound-engineering/agents/research/slack-researcher.md` — `model: sonnet` exemplar; precondition-check pattern
- `plugins/compound-engineering/skills/proof/SKILL.md` — Proof skill API and HITL handoff contract; line 3 already names ce:ideate as a consumer

### Institutional Learnings

- `docs/solutions/skill-design/claude-permissions-optimizer-classification-fix.md` — classification pipeline invariants: classify on the same scope as action; re-evaluate after any broadening step; enumerate negative signals (not just positive). Apply to V1's mode classifier.
- `docs/solutions/skill-design/research-agent-pipeline-separation-2026-04-05.md` — research agents must be classified by information type and dispatched only from the matching pipeline stage. Apply: `web-researcher` serves grounding (Phase 1), not generation (Phase 2).
- `docs/solutions/best-practices/codex-delegation-best-practices-2026-04-01.md` — token-economics method for evaluating "always-on" defaults. Implication: V12 cost transparency exists because always-on web-research has real overhead worth disclosing.
- `docs/solutions/skill-design/pass-paths-not-content-to-subagents-2026-03-26.md` — instruction phrasing dramatically affects tool-call count (14 vs 2 for the same task). Implication: `web-researcher` prompt should be benchmarked with stream-json before considering it stable.
- `docs/solutions/skill-design/compound-refresh-skill-improvements.md` — explicit opt-in beats auto-detection. Apply to V11's Proof failure ladder: don't infer "terminal-only is fine" from environment; ask explicitly.
- `docs/solutions/skill-design/script-first-skill-architecture.md` — push deterministic work to scripts when judgment isn't load-bearing. Not directly applicable to this plan but worth keeping in mind for any future `web-researcher` triage logic.

**Documentation gaps surfaced:** No prior learnings on (a) mode classification heuristics generally, (b) web research agents, (c) Proof integration patterns/fallbacks, (d) ideation frame design. Capturing learnings *from* this v2 build is in scope as a follow-up.

### External References

- [How we built our multi-agent research system — Anthropic](https://www.anthropic.com/engineering/multi-agent-research-system) — multi-agent systems use ~15× chat tokens; "scale effort with task complexity" framing for budgets; parallel sub-agent dispatch
- [Claude Sonnet vs Haiku 2026: Which Model Should You Use?](https://serenitiesai.com/articles/claude-sonnet-vs-haiku-2026) — Sonnet for multi-source synthesis; Haiku for single-source extraction
- [Claude Benchmarks (2026): Every Score for Opus 4.6, Sonnet 4.6 & Haiku](https://www.morphllm.com/claude-benchmarks) — pricing/perf justification for Sonnet on `web-researcher`
- [From Web Search towards Agentic Deep ReSearch (arxiv)](https://arxiv.org/html/2506.18959v1) — frontier/explored query model
- [Deep Research: A Survey of Autonomous Research Agents (arxiv)](https://arxiv.org/html/2508.12752v1) — phased iterative pattern (broad → narrow → extract → gap-fill)
- [EigentSearch-Q+ (arxiv)](https://arxiv.org/html/2604.07927) — query decomposition and gap-filling architecture

---

## Key Technical Decisions

- **Subject-based mode classification, not environment-based.** CWD repo presence is a weak signal; the prompt is the strong signal. A user in a Rails repo can ideate about pricing for a future product, and a user in `/tmp` can ideate about code in their head. (See origin: conversation alignment, mirrors `ce:brainstorm` 0.1b approach.)
- **Two modes, not three.** "Adjacent greenfield" (new feature for existing app) collapses cleanly into repo-grounded — the repo is the constraint set even when the feature is new. Three-bucket modes add ceremony without insight.
- **Discrimination test for intake gating.** "Would swapping one piece of context change which ideas survive?" is a sharper test than "do you have enough?" because it tests whether context is *load-bearing*, not just present. Replaces the rote "ask 4 standard questions" pattern.
- **All 6 frames always-on, both modes.** The four current frames hold up across creative/business/UX domains better than initial instinct suggested (inversion applies to plot/pricing/UX; leverage applies to compounding choices in any domain). Rather than mode-asymmetric frame sets, dispatch all six universally. Cost increase is bounded; predictability and simplicity gain is real.
- **Per-agent idea target reduced from 8-10 to 6-8.** Maintains raw-idea volume in the same ballpark as v1 (~36-48) while accommodating two additional frames, keeping dedupe and adversarial filter loads manageable.
- **Sonnet for `web-researcher`.** 2026 benchmarks confirm Sonnet handles multi-source synthesis well; Opus opens a meaningful gap only on expert-reasoning benchmarks (GPQA Diamond) which web research isn't; Haiku struggles with cross-source synthesis. Pricing makes Sonnet the only economically viable always-on choice.
- **Phased search budget for `web-researcher`, not fixed query counts.** "Scale effort with task complexity" is Anthropic's own framing. Fixed counts (the 5-8 the conversation initially proposed) are too low for one round of broad scoping; true deep research is iterative.
- **`web-researcher` as a named agent, not an inline frame.** The primary justifications are tool scoping (WebSearch + WebFetch only), explicit model pinning (`model: sonnet`), discoverability in agent roster, and a stable output contract. Reusability across other skills (ce:brainstorm, future ce:plan external-research stage) is deferred and therefore forward-looking, not load-bearing today — but these four structural reasons alone justify the agent file. Phase 2 ideation sub-agents stay anonymous because they're skill-coupled.
- **Terminal-first opt-in persistence.** Most ideation sessions are exploratory and reasonably end with no artifact. v1's "always write before handoff" rule conflated handoff with end-of-session. Splitting them: write/share only when the user wants persistence; conversation-only is a first-class end state.
- **Mode-determined persistence defaults, not user-configured.** Repo-mode defaults to file (preserves v1); elsewhere-mode defaults to Proof (no natural file home). User can always override at Phase 6 ("save to file even though this is elsewhere"). Cleaner UX than asking every time.
- **Proof failure surfaces real options.** Don't silently fall through to file; don't loop indefinitely on retry. After the orchestrator's single best-effort retry (atop the proof skill's own internal retry-once), surface a fallback menu so the user picks the next step explicitly. Final option count (2 vs 3) and exact labels are surfaced for maintainer judgment in Open Questions; the design commitment is "ask, don't infer," not a specific option count.

---

## Open Questions

### Resolved During Planning

- **Should external research be opt-in or always-on?** Resolved: always-on for both modes. Ideation is exploratory; users are worst-positioned to know when external context helps. Skip-phrase available for speed.
- **Should the 2 new frames be flexible/per-topic or always-on?** Resolved: always-on for both modes. Per-topic flexibility forces a frame-selection decision the agent often gets wrong; predictability is more valuable than adaptive selection.
- **Should `web-researcher` use Sonnet or Haiku?** Resolved: Sonnet. Validated against 2026 benchmarks — multi-source synthesis is Sonnet's domain.
- **What's the right search budget for `web-researcher`?** Resolved: phased (scoping 2-4 / narrowing 3-6 / extraction 3-5 fetches / gap-filling 1-3) with soft ceilings (~15-20 searches, ~5-8 fetches), early-stop heuristic.
- **Should `web-researcher` be a named agent or inline?** Resolved: named agent. Reusability and tool scoping justify it.
- **How should mode be classified?** Resolved: agent infers from prompt + signals, states in one sentence at top, asks only on conflict.
- **Where does the artifact live for elsewhere mode?** Resolved: Proof default; file fallback on Proof failure or user request.
- **What about the in-conversation refinement loop?** Resolved: terminal-first; persistence opt-in; conversation-only is fine.
- **What's the intake question pattern for elsewhere mode?** Resolved: discrimination test, no rote template, build on user-provided context, stop on dismissive answers.

### Deferred to Implementation

- **Exact prompt wording for `web-researcher` system prompt.** Will be benchmarked with `claude -p --output-format stream-json --verbose` per `pass-paths-not-content` learning. Initial draft based on existing research-agent patterns; refine after observing tool-call counts.
- **Whether `references/universal-ideation.md` should be a near-clone of `universal-brainstorming.md` or substantially different.** The shape mirrors (scope tiers, generation techniques, convergence, wrap-up menu) but the wrap-up specifically routes to ideation outputs (top-N candidate list) not brainstorm outputs (chosen direction). Final structure decided during writing.
- **Exact Phase 0.x numbering.** Today's Phase 0 has 0.1 (resume) and 0.2 (interpret focus and volume). Mode classification + intake fits between. Final numbering (0.1b vs 0.3 vs renumber) decided during edit.
- **Mode-classification statement format.** Specific phrasing of the one-sentence mode statement (e.g., "Reading this as repo-grounded ideation about X" vs "Treating this as elsewhere ideation focused on Y") settled at draft time.
- **Cost-transparency line phrasing and placement.** Whether to express dispatch cost as agent count ("This will dispatch 9 agents"), wall-clock estimate ("~30s"), or token/dollar estimate; and whether the line appears before mode-classification confirmation (so users opt out before answering questions) or after (so the count is mode-accurate). Defer to implementation; pick one and keep it consistent across modes.
- **Active-confirmation question wording.** When V16's ambiguous-mode confirmation fires, the exact stem and option labels (per AGENTS.md "Interactive Question Tool Design" rules: self-contained labels, max 4, third person, front-loaded distinguishing words). Decide at edit time.

### Surfaced for Maintainer Judgment (challenged in document review)

These were resolved in conversation but reviewers raised non-trivial counterarguments. Captured here so future-us (or a follow-up PR) can revisit deliberately rather than accidentally:

- **`universal-ideation.md` as full mirror vs routing stub.** Plan creates a ~60-line parallel facilitation reference mirroring `universal-brainstorming.md`. Reviewer challenge: this forks from day one (the wrap-up menu already diverges) and creates a maintenance-sync burden with no enforcement mechanism. A narrower stub design (routing rule + grounding override + mode-neutral rubric phrasing only, leaving the 6 frames in SKILL.md) would avoid the divergence problem. Maintainer chose the full mirror because parallel facilitation references are the established pattern; revisit if sync drift becomes a real cost.
- **Proof failure ladder: 3 options vs 2.** Plan specifies retry 2-3× then a 3-option fallback menu (file save / custom path / skip). Reviewer challenge: a single fallback ("save locally or skip?") covers the common case; the custom-path option introduces its own edge handling for an error-path. Maintainer chose 3 options because explicit choice respects user effort; revisit if the custom-path branch is rarely used in practice.
- **Drop constraint-flipping (use 5 frames not 6).** Plan adds both cross-domain analogy and constraint-flipping. Reviewer challenge: constraint-flipping is structurally a special case of assumption-breaking/reframing, and frame overlap will produce thematic collisions. Maintainer chose both because they produced different idea types in conversation testing; revisit if Phase 3 dedupe consistently merges across these two frames.
- **Frame-quality measurement gap.** No baseline measurement on v1 survivor quality means v2's "capture as a learning" risk mitigation has nothing to compare against — regression detection relies on maintainer vibe. Reviewer challenge: a lightweight measurement (e.g., manual scoring of 10 representative ideation runs pre- and post-v2) would close the loop. Maintainer chose to defer measurement because no measurement infrastructure exists; revisit if v2 survivors visibly degrade.

---

## Implementation Units

> **Coupling note:** Units 3, 4, and 5 all modify the same file (`plugins/compound-engineering/skills/ce-ideate/SKILL.md`) and share structural decisions: phase numbering (Unit 3 defers numbering to edit time), dispatch-list format (Unit 4 references Unit 3's cost-transparency line), and grounding-summary schema (Unit 5 assumes Unit 4's "structural shape preserved"). **Ship Units 3-5 as a single PR with a single author.** Splitting them across PRs creates rebase pain on a moving target and re-litigation of phase numbering. Unit 6 also touches `references/post-ideation-workflow.md` and cross-references Phase 0.1 in SKILL.md, so coordinate Unit 6 with the Units 3-5 PR or sequence it after Unit 3's numbering settles.

- [ ] **Unit 1: Create `web-researcher` agent**

**Goal:** Add a reusable, mode-agnostic web research agent to the `agents/research/` roster. Returns structured external grounding (prior art, adjacent solutions, market signals, cross-domain analogies) for ideation and (later) other skills.

**Requirements:** V3, V4, V14

**Dependencies:** None

**Files:**
- Create: `plugins/compound-engineering/agents/research/web-researcher.md`
- Modify: `plugins/compound-engineering/README.md` (add row to research agents table; update agent count — current count is 49, adding `web-researcher` crosses the 50+ threshold and **README count update is required, not conditional**)

**Approach:**
- Follow the structural pattern of `learnings-researcher.md` and `slack-researcher.md`: frontmatter (`name`, `description` with verb + "Use when...", `model: sonnet`), opening "You are an expert ... Your mission is to ..." paragraph, numbered `## Methodology` with phased steps, `## Tool Guidance`, `## Output Format`, `## Integration Points`.
- **Frontmatter tools field:** declare `tools: WebSearch, WebFetch` in frontmatter — agents use the comma-separated `tools:` string form (verified against `agents/review/*.md`, e.g., `agents/review/correctness-reviewer.md:5` uses `tools: Read, Grep, Glob, Bash`). Do NOT use `allowed-tools:` (that's the *skill* frontmatter format) and do NOT use the array form `["WebSearch", "WebFetch"]`. Existing research agents in `agents/research/` do not declare tool restrictions today, but a tool-restricted reusable agent should enforce restriction at the structural level so adoption by other skills doesn't accidentally inherit a wider tool surface.
- Frontmatter `description`: lead with "Performs iterative web research..."; "Use when ideating outside the codebase, validating prior art, scanning competitor patterns, finding cross-domain analogies, or any task that benefits from current external context. Prefer over manual web searches when the orchestrator needs structured external grounding."
- Methodology codifies the phased budget: Step 1 Scoping (2-4 broad queries to map the space), Step 2 Narrowing (3-6 targeted queries based on Step 1 findings), Step 3 Deep Extraction (3-5 fetches of high-value sources), Step 4 Gap-Filling (1-3 follow-ups if synthesis reveals holes). Soft caps: ~15-20 total searches, ~5-8 fetches. Stop when marginal queries return mostly redundant findings. **The budget is prompt-enforced, not rate-limited** — no harness-level tool-call cap exists for sub-agents in the current platform. The early-stop heuristic and phased structure are advisory; benchmark actual tool-call counts after first implementation per the `pass-paths-not-content` learning.
- Tool Guidance section restricts to WebSearch + WebFetch; explicitly forbids shell-based web tools and inline pipes per AGENTS.md "Tool Selection in Agents and Skills" rule.
- Output Format mirrors other research agents — concise structured summary with sections for prior art, adjacent solutions, market/competitor signals, cross-domain analogies, source list with URLs.
- Integration Points lists ce:ideate as initial consumer; notes that ce:brainstorm and ce:plan can adopt later.
- README update: add row to the research agents table in alphabetical position (after `slack-researcher`); update the agent count in the component count table (49 → 50, crosses 50+ threshold).

**Patterns to follow:**
- `plugins/compound-engineering/agents/research/learnings-researcher.md` — frontmatter, mid-size structure
- `plugins/compound-engineering/agents/research/slack-researcher.md` — `model: sonnet`, precondition pattern, tool guidance
- `plugins/compound-engineering/agents/research/issue-intelligence-analyst.md` — phased methodology with ~Step N structure

**Test scenarios:**
- Happy path: agent file passes `bun test tests/frontmatter.test.ts` (YAML strict-parses, required fields present).
- Happy path: `bun run release:validate` succeeds (note: validator only checks plugin.json/marketplace.json description+version drift — it does NOT validate agent registration or README counts; those are verified manually below).
- Integration: invoking the agent from a test ce:ideate dispatch on a real topic returns a structured response within phased-budget bounds (manual smoke test, not CI-automated).
- Edge case: agent dispatched with a topic that returns sparse external signal (e.g., highly internal/proprietary) — should report "limited external signal found" and exit cleanly within early-stop heuristic, not exhaust the search budget.
- Edge case: agent dispatched without WebSearch/WebFetch available — should detect tool absence in Step 1 precondition check, return clear unavailability message and stop (mirroring `slack-researcher.md:25` precondition pattern).
- Edge case: agent dispatched twice in the same conversation on the same topic — second dispatch should be skipped by the orchestrator per V15 (verified at the orchestrator level in Unit 4, not in the agent itself).

**Verification:**
- New agent file present, passes frontmatter test, **manually confirmed** listed in README research-agents table with correct alphabetical position and count incremented (49 → 50)
- `bun run release:validate` passes (does not catch README drift; see scope note above)
- Manual smoke: agent responds to a representative ideation topic ("pricing models for an open-source dev tool") with structured external grounding within phased budget

---

- [ ] **Unit 2: Create `references/universal-ideation.md`**

**Goal:** Provide a parallel non-software facilitation reference for ce:ideate, mirroring `ce-brainstorm/references/universal-brainstorming.md`. Loaded when the topic is non-software so the skill doesn't try to apply software-flavored ideation phases to band names, plot beats, or business decisions.

**Requirements:** V13

**Dependencies:** None (independent of Unit 1; can build in parallel)

**Files:**
- Create: `plugins/compound-engineering/skills/ce-ideate/references/universal-ideation.md`

**Approach:**
- Target ~60 lines, mirroring `universal-brainstorming.md`'s shape
- Header: explicit "this replaces software ideation phases — do not follow Phase 1 codebase scan or Phase 2 software frame dispatch" instruction
- `## Your role` — divergent thinker stance, tone-matching
- `## How to start` — quick scope tier (give them ideas now), standard scope (light intake then ideate), full scope (rich intake, multiple frames, deep critique). Single-question intake pattern (discrimination-test driven, not rote)
- `## How to generate` — frames usable in non-software contexts: friction (pain), inversion, assumption-breaking, leverage, cross-domain analogy, constraint-flipping. Same six frames as software path but described in domain-agnostic language. Note that frames are starting biases, not constraints
- `## How to converge` — adversarial critique with mode-neutral rubric ("grounded in stated context"), 5-7 survivors, brief rejection summary
- `## When to wrap up` — post-presentation menu adapted to ideation: brainstorm a chosen idea / refine ideas / save to Proof / save to local file / done in conversation. Mirror the elsewhere-mode persistence defaults.

**Patterns to follow:**
- `plugins/compound-engineering/skills/ce-brainstorm/references/universal-brainstorming.md` — entire shape
- Conversational, imperative tone; avoid second person where possible per AGENTS.md writing-style rules

**Test scenarios:**
- Happy path: file exists, valid markdown, no broken backtick references
- Edge case: referenced from ce:ideate SKILL.md via backtick path (not `@`-inclusion) so it loads on demand only when elsewhere-mode + non-software detected
- No automated test surface for content quality — manual review by reading

**Verification:**
- File exists at correct path
- Referenced from SKILL.md routing block (Unit 3) via backtick path

---

- [ ] **Unit 3: SKILL.md — Phase 0 mode classification + intake**

**Goal:** Add a Phase 0.x block to ce:ideate that (a) classifies subject mode (repo-grounded vs elsewhere) as **two sequential binary decisions**, (b) routes non-software elsewhere-mode invocations to `references/universal-ideation.md`, (c) gates light context intake via the discrimination test for elsewhere-mode software topics, (d) confirms ambiguous-mode classifications actively rather than silently.

**Requirements:** V1, V2, V12, V13, V16

**Dependencies:** Unit 2 (the routing target must exist)

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-ideate/SKILL.md`

**Approach:**
- Insert Phase 0.x ahead of current Phase 1 (Codebase Scan), after the existing 0.1 (Resume) and 0.2 (Focus and Volume) blocks. Likely numbering: rename current 0.2 to 0.3, insert new mode classifier as 0.2 — or append as 0.3 and shift focus/volume. Decide at edit time based on flow.
- **Mode classifier** is two sequential binary decisions, each with negative-signal enumeration per `docs/solutions/skill-design/claude-permissions-optimizer-classification-fix.md`:
  - Decision 1: repo-grounded vs elsewhere. Positive signals: prompt references repo files/code/architecture; topic clearly bounded by current codebase. Negative signals: prompt references things absent from repo (pricing, naming, narrative, business model). Three strength-ordered inputs: (1) prompt content, (2) topic-repo coherence, (3) CWD repo presence as supporting evidence only.
  - Decision 2 (only fires if Decision 1 = elsewhere): software vs non-software. Positive signals for non-software: topic is creative, business, personal, or design with no code surface. Routes non-software to `references/universal-ideation.md`.
- State inferred mode in one sentence at the top: "Reading this as [repo-grounded | elsewhere-software | elsewhere-non-software] ideation about X — say 'actually [other-mode]' to switch."
- **V16 active confirmation on ambiguity:** when classifier confidence is low — single-keyword/short prompts mapping cleanly to either mode (`/ce:ideate ideas`, `/ce:ideate ideas for the docs`), conflicting CWD/prompt signals, or topic mentioning both repo-internal and external surfaces — ask one confirmation question via the platform's blocking question tool BEFORE dispatching Phase 1 grounding. Question stem and option labels must follow AGENTS.md "Interactive Question Tool Design" rules (self-contained labels, max 4, third person, front-loaded distinguishing word, no anaphoric references, no leaked internal mode names). Sample wording (subject to refinement at edit time per Open Questions): stem "What should the agent ideate about?"; options "Code in this repository — features, refactors, architecture", "A topic outside this repository — business, design, content, personal decisions", "Cancel — let me rephrase the prompt". For clear cases the one-sentence inferred-mode statement is sufficient.
- Light context intake block (elsewhere-mode software topics only): "Apply the discrimination test before asking anything: would swapping one piece of the user's context for a contrasting alternative materially change which ideas survive? If yes, you have grounding — proceed. If no, ask 1-3 narrowly chosen questions, building on what the user already provided rather than starting over. Default to free-form; use single-select only when the answer space is small and discrete (e.g., genre, tone). After each answer, re-apply the test before asking another. Stop on dismissive responses; treat genuine 'no constraint' answers as real answers."
- Apply classification-pipeline invariants from learnings: classify on the same scope you act on; if any prompt-broadening happens during 0.x, re-evaluate after.
- Include cost-transparency notice (V12): one line listing the agents that will be dispatched. Mode-aware — exact phrasing, format (count vs time vs cost), and whether the line appears before or after V16 confirmation are deferred to implementation (see Open Questions). Repo-mode example: "Will dispatch ~9 agents: codebase scan + learnings + web-researcher + 6 ideation sub-agents. Skip phrases: 'no external research', 'no slack'." Elsewhere-mode example: "Will dispatch ~8 agents: context synthesis + learnings + web-researcher + 6 ideation sub-agents."

**Patterns to follow:**
- `plugins/compound-engineering/skills/ce-brainstorm/SKILL.md:59-71` — Phase 0.1b classifier mechanism (three buckets: software / non-software / neither; routing rule)
- AGENTS.md "Cross-Platform User Interaction" — name `AskUserQuestion`/`request_user_input`/`ask_user`
- AGENTS.md "Interactive Question Tool Design" — labels self-contained, max 4 options, third person

**Test scenarios:**
- Happy path: SKILL.md passes `bun test tests/frontmatter.test.ts` after edits
- Happy path: invocation with `/ce:ideate ideas for our auth system` in a repo with auth code → infers repo-grounded, no question, proceeds
- Happy path: invocation with `/ce:ideate pricing model for a new dev tool` in any repo → infers elsewhere, no question, proceeds with intake
- Edge case: invocation with `/ce:ideate` (no argument) inside a multi-skill repo → ambiguous; V16 confirmation fires before dispatch
- Edge case: invocation with `/ce:ideate ideas for the docs` in a repo with docs/ → ambiguous (current docs vs hypothetical doc product); V16 confirmation fires
- Edge case: user-provided pasted context that fails discrimination test → agent asks one question building on the paste, not from a template
- Edge case: user pastes rich context that passes discrimination test → agent confirms understanding in one line, proceeds without questions
- Edge case: V16 confirmation fired and user picks "elsewhere" — Decision 2 (software vs non-software) still runs and may route to `universal-ideation.md`
- Error path: user responds "idk just go" to an intake question → agent stops asking, proceeds with what it has
- Integration: classifier output flows correctly into Phase 1 (repo mode triggers codebase scan; elsewhere mode skips it)

**Verification:**
- Frontmatter test passes
- Manual smoke across the scenarios above shows agent makes sensible mode inferences, fires V16 confirmation only on ambiguity, and gates intake appropriately
- `bun run release:validate` passes (validator scope: plugin.json/marketplace.json description+version drift only)

---

- [ ] **Unit 4: SKILL.md — Phase 1 mode-aware grounding + always-on web-researcher**

**Goal:** Update Phase 1 to dispatch grounding agents based on mode. Repo mode preserves v1 dispatch; elsewhere mode skips the codebase scan; both modes always run learnings-researcher and the new `web-researcher` (with session-scoped reuse).

**Requirements:** V5, V6, V12, V15

**Dependencies:** Unit 1 (`web-researcher` must exist), Unit 3 (mode classification must precede)

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-ideate/SKILL.md`

**Approach:**
- Restructure the existing Phase 1 dispatch list as a mode-conditional table:

  | Source | Repo mode | Elsewhere mode |
  |---|---|---|
  | Codebase quick scan (Haiku) | always | skip |
  | learnings-researcher | always | always |
  | issue-intelligence-analyst | when issue intent detected | n/a |
  | slack-researcher | opt-in (current behavior) | opt-in |
  | web-researcher (new, Sonnet) | always-on (skip phrase available) | always-on (skip phrase available) |
  | User-provided context | n/a | primary grounding source |

- Express the dispatch list in prose (the skill format doesn't render tables for sub-agent dispatch — use the table as structural reference and write the actual dispatch text accordingly).
- For elsewhere mode: replace "codebase quick scan" dispatch with "synthesize the user-supplied context (from Phase 0 intake or rich-prompt material) into a structured grounding summary with the same shape as the codebase context summary." This keeps Phase 2 sub-agents agnostic to grounding source.
- Always-on web-researcher dispatch: pass the focus hint and a brief planning context summary; do not pass codebase content (web-researcher operates externally).
- Skip-phrase handling: if user said "no external research" / "skip web research" in their prompt or earlier answers, omit web-researcher from dispatch and note the skip in the consolidated grounding summary.
- **V15 session-scoped reuse via sidecar cache:** before dispatching `web-researcher`, glob for `.context/compound-engineering/ce-ideate/*/web-research-cache.json` and read any matches. The cache file is a JSON array of `{key: {mode, focus_hint_normalized, topic_surface_hash}, result: <web-researcher output>, ts: <iso>}` entries. If a key matches the current dispatch (same mode + same case-insensitive normalized focus hint + same topic surface hash), skip the dispatch and pass the cached result to the consolidated grounding summary; note "Reusing prior web research from this session — say 're-research' to refresh." On override "re-research", delete the matching entry and dispatch fresh. After a fresh dispatch, append the new result to the run-id's cache file (create dir + file if needed). **Verification step (perform during Unit 4 implementation):** invoke the skill, dispatch web-researcher, exit the skill, re-invoke within the same session, and confirm the orchestrator reads the prior cache file. If the file is unreachable across invocations, V15 degrades to "no reuse" — surface the limitation in the consolidated grounding summary and proceed without reuse. This avoids hand-waving over a platform capability the orchestrator may not actually have.
- Cost note (V12): update the Phase 0.x cost-transparency line so it reflects the actual dispatch count for the inferred mode (e.g., elsewhere mode without slack/issues is fewer agents than repo mode with both). When V15 reuse fires, the line should reflect the reduced count.

**Patterns to follow:**
- Current Phase 1 in `plugins/compound-engineering/skills/ce-ideate/SKILL.md` (codebase scan dispatch around line 96-130) — preserve repo-mode dispatch text closely; only restructure mode-conditional layer
- AGENTS.md "Sub-Agent Permission Mode" — omit `mode` parameter on dispatch
- `docs/solutions/skill-design/research-agent-pipeline-separation-2026-04-05.md` — Phase 1 owns grounding-information dispatch; do not duplicate at other stages

**Test scenarios:**
- Happy path: repo mode invocation dispatches Haiku scan + learnings-researcher + web-researcher in parallel
- Happy path: elsewhere mode invocation dispatches synthesis-of-user-context + learnings-researcher + web-researcher; no codebase scan
- Edge case: repo mode + "skip web research" → dispatches Haiku scan + learnings-researcher only
- Edge case: elsewhere mode + "skip web research" → dispatches synthesis + learnings-researcher only
- Edge case: web-researcher returns failure (network, tool unavailable) → log warning, proceed without external grounding (mirror existing issue-intelligence-analyst failure handling)
- Edge case: elsewhere mode with no usable user-supplied context (intake produced nothing meaningful) → grounding summary explicitly notes thin context; Phase 2 sub-agents informed
- Edge case: re-invocation on same topic within the conversation → V15 reuse fires; web-researcher is not re-dispatched; user sees the reuse note
- Edge case: re-invocation with "re-research" override → web-researcher is dispatched again, fresh
- Edge case: re-invocation with substantively different focus hint → V15 equivalence test fails; web-researcher is dispatched fresh
- Integration: consolidated grounding summary preserves the same structural shape (codebase/synthesis context, past learnings, [issue intelligence], external context) so Phase 2 prompts don't need branching

**Verification:**
- Manual smoke across scenarios shows correct dispatch sets per mode
- Failure handling preserves the v1 invariant of "warn and proceed" — never block on grounding failure
- `bun run release:validate` passes

---

- [ ] **Unit 5: SKILL.md — Phase 2 (6 always-on frames) + Phase 3 mode-neutral rubric**

**Goal:** Expand Phase 2 from 4 frames to 6 always-on frames for both modes, add cross-domain analogy and constraint-flipping. Reduce per-agent target from 8-10 to 6-8 ideas. Soften Phase 3 rubric phrasing from "grounded in current repo" to "grounded in stated context" — mode-neutral wording, identical mechanism. Write V17 Checkpoint A after Phase 2 merge/dedupe.

**Requirements:** V7, V8, V17 (Checkpoint A only; Checkpoint B lives in Unit 6)

**Dependencies:** Unit 4 (the grounding summary feeds Phase 2)

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-ideate/SKILL.md`
- Modify: `plugins/compound-engineering/skills/ce-ideate/references/post-ideation-workflow.md` (Phase 3 rubric phrasing only)

**Approach:**
- Phase 2 frame catalog (both modes): pain/friction · inversion/removal/automation · assumption-breaking/reframing · leverage/compounding · cross-domain analogy · constraint-flipping
- Define cross-domain analogy: "Generate ideas by asking how completely different fields solve analogous problems. The grounding domain is the user's topic; the analogy domain is anywhere else (other industries, biology, games, infrastructure, history). Push past the obvious analogy to non-obvious ones."
- Define constraint-flipping: "Generate ideas by inverting the obvious constraint to its opposite or extreme. What if the budget were 10x or 0? What if the team were 100 people or 1? What if there were no users, or 1M? Use the resulting design as a candidate even if the constraint flip itself isn't realistic."
- Dispatch 6 parallel sub-agents, each with one frame as starting bias (per current "starting bias, not a constraint" rule).
- Per-agent target: ~6-8 ideas (down from 8-10) so total raw output stays in the ~36-48 range, similar to v1 ~30 raw → ~20-25 dedupe → 5-7 survivors.
- Update the merge step to expect ~6 sub-agent returns instead of 3-4. No structural changes to dedupe and synthesis.
- For issue-tracker mode: theme-derived frames remain (current behavior, unchanged) — but if fewer than 4 themes, pad from the new 6-frame default pool, not the old 4-frame pool.
- Phase 3 rubric: change "groundedness in the current repo" → "groundedness in stated context" in `references/post-ideation-workflow.md` (Phase 3 rubric section). One-line phrasing change. The mechanism (rejection criteria, rubric weights, second-stricter-pass behavior) is otherwise unchanged.
- **V17 Checkpoint A (after Phase 2):** immediately after the cross-cutting synthesis step completes and the raw candidate list is consolidated, write `.context/compound-engineering/ce-ideate/<run-id>/raw-candidates.md` containing the full candidate list with sub-agent attribution. Best-effort; if write fails, log and proceed. The Phase 4 checkpoint (Checkpoint B, `survivors.md`) is added in Unit 6's `post-ideation-workflow.md` edits.

**Patterns to follow:**
- Current Phase 2 dispatch text (~line 134-160 of SKILL.md) — preserve "starting bias, not constraint" framing and the merge-and-dedupe synthesis step
- `references/post-ideation-workflow.md` Phase 3 rubric section — preserve all rejection criteria

**Test scenarios:**
- Happy path: repo mode invocation dispatches 6 sub-agents with the 6 frames; total raw output lands in ~36-48 range
- Happy path: elsewhere mode invocation dispatches the same 6 frames (mode-symmetric); raw output similar
- Happy path: Phase 3 critique uses mode-neutral rubric phrasing; all rejection criteria still apply
- Edge case: issue-tracker mode with 2 themes → 2 cluster-derived frames + 2 padding frames from the 6-frame pool (not the old 4-frame pool); total 4 frames dispatched (not 6, per existing issue-tracker behavior)
- Edge case: ideation topic where one frame produces zero usable ideas (e.g., "constraint-flipping" for a topic with no obvious constraints) → that sub-agent returns honest "no strong candidates from this frame"; orchestrator merges the others without inflating
- Integration: cross-cutting synthesis step (current "Synthesize cross-cutting combinations") still runs after merge across all 6 sub-agent outputs

**Verification:**
- Manual smoke: dispatch count is 6 (or expected mode-conditional count) and raw output volume is in expected range
- Survivors are not visibly weaker than v1 (qualitative — manual review)
- Frontmatter test + release:validate pass

---

- [ ] **Unit 6: post-ideation-workflow.md — terminal-first opt-in persistence + Proof failure ladder + auto-compact checkpoint**

**Goal:** Restructure Phase 5 (Write Artifact) and Phase 6 (Refine or Hand Off) to be terminal-first and opt-in. Mode-determined defaults: repo-mode → `docs/ideation/`, elsewhere-mode → Proof. Add a Proof failure ladder (with retry harness specified — proof skill provides only single-retry-once). Add a lightweight survivor checkpoint before Phase 4 to bound auto-compact loss. Conversation-only is a first-class end state.

**Requirements:** V9, V10, V11, V17

**Dependencies:** Unit 3 (cross-references Phase 0.x mode classification — this unit's Phase 6 menu and persistence defaults branch on mode). Coordinate authoring with Units 3-5 in a single PR per the coupling note above to avoid rebase pain on phase numbering and grounding-summary schema.

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-ideate/references/post-ideation-workflow.md`

**Approach:**
- Rename/reframe Phase 5 from "Write the Ideation Artifact" to "Persistence (Opt-In, Mode-Aware)". State the new invariant clearly at the top: "Persistence is opt-in. The terminal review loop is a complete ideation cycle. Refinement loops happen in conversation with no file or network cost. Persistence triggers only when the user explicitly chooses to save, share, or hand off."
- Replace the v1 "always write before handoff" rule with: "If the user is handing off to brainstorm/Proof/file-save, ensure a durable record exists first. If they're ending in conversation, no record needed unless they ask. If they're refining, no record yet — refinement is in-conversation."
- Mode-determined defaults table:

  | Action | Repo mode default | Elsewhere mode default |
  |---|---|---|
  | Save | `docs/ideation/YYYY-MM-DD-*-ideation.md` | Proof |
  | Share | Proof (additional) | Proof (primary) |
  | Brainstorm handoff | `ce:brainstorm` | `ce:brainstorm` (universal-brainstorming) |
  | End | Conversation only is fine | Conversation only is fine |

- Phase 6 menu (use `AskUserQuestion` / equivalent) — present 4 options max per AGENTS.md "Interactive Question Tool Design":
  - "Brainstorm a selected idea" → loads `ce:brainstorm`
  - "Refine the ideation in conversation" → returns to Phase 2 or 3
  - "Save and end" → saves to mode default (file or Proof), then ends
  - "End in conversation only" → no save, ends
- Each label is self-contained and front-loads the distinguishing word per AGENTS.md interactive-question rules.
- **V17 auto-compact checkpoints — TWO write points:**
  - **Checkpoint A — after Phase 2 merge/dedupe (added in Unit 5 SKILL.md edits, but the rule belongs in this workflow doc for completeness):** "Immediately after Phase 2's cross-cutting synthesis step completes and the raw candidate list is consolidated, write `.context/compound-engineering/ce-ideate/<run-id>/raw-candidates.md` containing the full candidate list with sub-agent attribution. This protects the most expensive output (6 parallel sub-agent dispatches + dedupe) before Phase 3 critique potentially compacts context."
  - **Checkpoint B — before Phase 4 survivors presentation:** "Before presenting survivors, write `.context/compound-engineering/ce-ideate/<run-id>/survivors.md` containing the survivor list + key context. Protects the post-critique state before the user reaches the persistence menu."
  - **Common rules:** Neither checkpoint is the durable artifact — V9-V11 govern persistence. Both are best-effort: if write fails (disk full, perms), log warning and proceed; checkpoints must not block phase progression. Clean up both files on Phase 6 completion (any path) unless the user opted to inspect them. Use OS temp (`mktemp -d` per repo Scratch Space convention) only if `.context/` namespacing is unavailable in the current platform. Auto-resume from a partial checkpoint is out of v2 scope — V17 prevents *silent* loss, not lost-work recovery; if a stale `<run-id>/` directory exists from an aborted prior run, the orchestrator may surface it as a recovery hint but does not auto-load.
  - **Run-id generation:** generate `<run-id>` once at the start of Phase 1 as 8 hex chars (precedent: existing `.context/` usage in this repo). Reuse the same id for both checkpoints and the V15 cache file so cleanup is one directory remove.
- **Proof failure ladder (insert as Phase 6.x sub-section).** Important: the proof skill (`skills/proof/SKILL.md:79,145,291`) does single-retry-once internally on `STALE_BASE`/`BASE_TOKEN_REQUIRED`, then surfaces failure (via `report_bug` or returned status). The proof skill's return contract does NOT expose typed error classes to callers, so the orchestrator cannot distinguish retryable vs terminal failures from outside without a contract change to proof. v2 design accepts this constraint:
  - **Retry harness (orchestrator-side, intentionally minimal):** wrap the proof skill invocation in ONE additional best-effort retry with a short pause (~2s) — the proof skill already retried internally, so this catches transient races at the orchestrator boundary without compounding latency. Do NOT classify error types from outside the skill (no detection mechanism exists). Distinguish create-failure (retry the create) from ops-failure (proof returned a partial URL — retry the failing op only, do NOT recreate). The orchestrator detects ops-vs-create by inspecting whether the proof skill returned a `docUrl` before failing.
  - **Fallback menu after persistent failure:** present options via the platform question tool. Final option count (2 vs 3) and exact labels deferred to implementation per Open Questions; the option set is some combination of (a) save to `docs/ideation/` (only if a repo exists at CWD), (b) save to a custom path the user provides (validate writable, create parent dirs), (c) skip save and keep in conversation. If proof returned a partial URL before failing, surface that URL alongside fallback options.
  - **Failure narration:** narrate the single retry to the terminal so the pause doesn't look like a hang ("Retrying Proof... attempt 2/2"). On persistent failure, narrate that retry exhausted before showing the menu.
  - **Future work (out of v2 scope):** if the proof skill's return contract is extended to expose typed error classes, the orchestrator can graduate to a richer retry policy (longer backoff for transient classes, immediate skip for auth failures). Capture as a follow-up only if the simpler retry proves inadequate in practice.
- Resume behavior (current Phase 0.1 in SKILL.md, references this file) is unchanged for repo mode. For elsewhere mode (Proof-saved artifacts), resume cross-session is best-effort — depends on whether Proof's API supports listing user docs by topic. Document as known limitation; default elsewhere-mode resume to in-session only.

**Patterns to follow:**
- AGENTS.md "Interactive Question Tool Design" — labels self-contained, max 4 options, third person, front-loaded distinguishing words
- AGENTS.md "Cross-Platform Reference Rules" — say "load the `proof` skill" semantically, not `/proof` slash
- `compound-refresh-skill-improvements.md` learning — explicit opt-in beats auto-detection (apply to Phase 6 menu)

**Test scenarios:**
- Happy path: repo-mode user picks "Save and end" → writes to `docs/ideation/YYYY-MM-DD-*-ideation.md`
- Happy path: elsewhere-mode user picks "Save and end" → shares to Proof, returns URL
- Happy path: any-mode user picks "End in conversation only" → no file/Proof side effects
- Happy path: any-mode user picks "Refine" → returns to Phase 2/3, no persistence triggered
- Happy path: any-mode user picks "Brainstorm" → durable record written first (mode default), then loads `ce:brainstorm`
- Edge case: Proof create fails 3× (network) → retry harness narrates each backoff, fallback menu appears; user picks file save → writes to `docs/ideation/` if repo exists or custom path
- Edge case: Proof create fails 3×, no repo at CWD → fallback menu omits the docs/ideation option; only custom path + skip remain
- Edge case: Proof create succeeded but a later refinement op fails → ops-only retry (do NOT recreate); on persistent failure, existing URL surfaced alongside fallback options
- Edge case: Proof returns terminal auth error → no retry beyond proof skill's single retry; immediate fallback menu
- Edge case: user in repo mode explicitly asks "save to Proof" instead → uses Proof, not file; same for elsewhere mode user asking "save to docs/ideation/"
- Edge case: V17 Checkpoint A write fails after Phase 2 (disk full, perms) → log warning, proceed to Phase 3 anyway (checkpoint is best-effort, not load-bearing)
- Edge case: V17 Checkpoint B write fails before Phase 4 → log warning, proceed to Phase 4 anyway
- Edge case: context compacts after Checkpoint B but before Phase 6 completion → survivors.md reachable; document recovery hint to user
- Edge case: context compacts after Checkpoint A but before Phase 4 → raw-candidates.md reachable; user is informed they can re-trigger Phase 3 from the persisted candidates (manual; auto-resume is out of v2 scope)
- Error path: custom path provided is not writable → agent surfaces error and re-prompts
- Integration: Phase 0.1 resume check still finds repo-mode docs in `docs/ideation/`; elsewhere-mode resume notes in-session only

**Verification:**
- Manual smoke across all menu paths
- Proof failure simulated by tool unavailability or forced retry exhaustion (verify retry harness actually retries with correct backoff and narrates)
- V17 Checkpoint A (`raw-candidates.md`) created after Phase 2 and Checkpoint B (`survivors.md`) created before Phase 4; both cleaned up after Phase 6 (any path)
- Resume invariant for repo mode still works after edits

---

- [ ] **Unit 7: Final integration check + release validation**

**Goal:** Verify the v2 changes hang together as a system. Pass automated checks. Update plugin description if counts change.

**Requirements:** all

**Dependencies:** Units 1-6 complete

**Files:**
- Modify: `plugins/compound-engineering/.claude-plugin/plugin.json` (only if description text mentions outdated count or capability description; do NOT bump version per AGENTS.md "Versioning Requirements")
- Verify: `plugins/compound-engineering/skills/ce-ideate/SKILL.md`, `references/post-ideation-workflow.md`, `references/universal-ideation.md`, `agents/research/web-researcher.md`, `README.md`

**Approach:**
- Run `bun test tests/frontmatter.test.ts` — verify all touched YAML frontmatter parses cleanly
- Run `bun run release:validate` — **scope note:** the validator only checks plugin.json/marketplace.json description+version drift. It does NOT validate agent registration, README counts, or skill content. README updates are verified manually below.
- Read AGENTS.md "Skill Compliance Checklist" and verify ce:ideate SKILL.md against each item: backtick references (not `@` for ~150-line files; not markdown links), description format, imperative writing style, rationale discipline (every line earns its load cost), platform question tool naming, task tool naming, script path conventions, cross-platform reference rules, tool selection
- **Manual README verification** (validator does not catch these):
  - Research agents table includes `web-researcher` row in alphabetical position
  - Component count table reflects 50 agents (was 49)
  - Any prose referencing "ce:ideate scans the codebase" updated to reflect mode-aware grounding
- Check `plugins/compound-engineering/AGENTS.md` "Stable/Beta Sync" — confirm ce:ideate has no `-beta` counterpart needing sync (verify with glob)
- Manual smoke test the full workflow in 4 scenarios:
  1. Repo-grounded with focus hint (`/ce:ideate ideas for our skill compliance checks`)
  2. Repo-grounded open-ended (`/ce:ideate`) — expect V16 confirmation; tester picks "Repo mode"
  3. Elsewhere software (`/ce:ideate pricing model for an open-source dev tool`)
  4. Elsewhere non-software (`/ce:ideate names for my band`) — expect routing to `universal-ideation.md`; tester verifies the wrap-up menu uses ideation labels, not brainstorm labels
- Verify each manual scenario hits the right mode, dispatches the right agents, presents survivors with mode-neutral rubric, offers correct mode-aware persistence menu
- Verify V15 reuse: invoke scenario 3 twice in a row; confirm second invocation skips web-researcher dispatch with reuse note
- Verify V17 checkpoints: invoke scenario 1, confirm `.context/compound-engineering/ce-ideate/<run-id>/raw-candidates.md` exists after Phase 2 and `survivors.md` exists between Phase 4 and Phase 6, and both are cleaned up after Phase 6
- If plugin.json description mentions a specific agent count or capability that's now outdated, update the prose (do NOT bump version)

**Patterns to follow:**
- AGENTS.md "Pre-Commit Checklist" — verify no manual version bump, no manual changelog entry, README counts accurate, plugin.json description matches counts
- Repo working agreement: "Run `bun test` after changes that affect parsing, conversion, or output."

**Test scenarios:**
- Happy path: `bun test tests/frontmatter.test.ts` exit 0
- Happy path: `bun run release:validate` exit 0 (validator scope: plugin.json/marketplace.json description+version drift only)
- Happy path: all 4 manual smoke scenarios complete without orchestrator confusion
- Happy path: V15 reuse and V17 checkpoint behaviors confirmed via the verification steps above
- Edge case: skill compliance checklist surfaces a missed item → fix and re-verify
- Test expectation: end-to-end ideation behavior is exercised manually; no automated regression test exists for skill behavior

**Verification:**
- Both bun commands exit clean
- All 4 manual scenarios produce sensible output
- V15 reuse + V17 checkpoint behaviors verified manually
- Skill compliance checklist items all satisfied
- README manually verified accurate (counts, table row, prose), plugin.json description coherent

---

## System-Wide Impact

- **Interaction graph:** ce:ideate now dispatches `web-researcher` always-on; future skills (`ce:brainstorm`, `ce:plan` external research stage) may adopt the same agent. The mode classification pattern mirrors `ce:brainstorm`'s 0.1b — establishing a convention worth applying to other skills that may need to span software/non-software audiences.
- **Error propagation:** Phase 1 grounding agent failures already follow "warn and proceed" (issue-intelligence pattern). `web-researcher` failure follows the same pattern. Proof failure introduces a new pattern — explicit user choice via fallback menu — which is a deliberate departure from "silently degrade" for a reason: persistence is user-visible and worth surfacing.
- **State lifecycle risks:** v2 introduces an asymmetric resume story: repo-mode resume reads from `docs/ideation/` (works cross-session, file-system-backed); elsewhere-mode resume relies on Proof's listing API (best-effort, may be in-session only). Document this asymmetry in `post-ideation-workflow.md` so users aren't surprised. **Mid-session compaction risk** is bounded by V17's two checkpoints: Checkpoint A (`raw-candidates.md`) lands after Phase 2 merge/dedupe — protecting the most expensive output (multi-agent dispatch); Checkpoint B (`survivors.md`) lands before Phase 4 presentation — protecting the post-critique state. Together they cover the longest-running stages. Compaction during Phase 1 grounding dispatch (briefly, before Checkpoint A) remains a residual risk; mitigation is keeping Phase 1 short-running and accepting full-rerun on partial-run abort. Auto-resume from checkpoint files is out of v2 scope.
- **Validator scope (corrected):** `bun run release:validate` only checks plugin.json/marketplace.json description+version drift. It does NOT validate agent registration, README counts, skill content, or component-table accuracy. Treat README updates and component-table edits as manual responsibilities verified at edit time, not validator-caught.
- **API surface parity:** `web-researcher` becomes available to all skills as an agent file. Other skills can adopt incrementally without coordinated rollout. Phase 2 frame changes are scoped to ce:ideate.
- **Integration coverage:** No automated end-to-end test surface exists for skill behavior. Manual smoke testing in Unit 7 covers the four primary scenarios; future regression risk is real but accepted (consistent with current ecosystem testing posture).
- **Unchanged invariants:**
  - The many → critique → survivors mechanism (origin R4-R7) — preserved
  - Adversarial filtering criteria (origin R5) — preserved; only rubric phrasing changed
  - Resume behavior for repo mode (origin R13) — preserved
  - Handoff to `ce:brainstorm` (origin R11) — preserved
  - Sub-agent role pattern (origin R18: prompt-defined frames, not named agent reuse) — preserved for Phase 2; `web-researcher` is a Phase 1 grounding agent and follows the established named-research-agent pattern
  - Orchestrator owns scoring (origin R22) — preserved
  - Plugin versioning rules (do not bump in feature PRs) — preserved

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Mode classifier mis-infers and silently produces wrong-flavored ideation | One-sentence mode statement at top of every invocation gives the user a cheap correction surface ("actually elsewhere"). On ambiguous prompts, V16 fires an active confirmation question before dispatching grounding — silent miscarriage of intent is bounded to clearly-classifiable prompts. Apply classification-pipeline invariants from learnings: re-evaluate after any prompt-broadening; enumerate negative signals at both binary decisions. |
| Always-on `web-researcher` makes ideation perceptibly slower or more expensive | Sonnet model + phased budget + early-stop heuristic bound single-invocation cost. V15 session-scoped reuse skips re-dispatch on substantively-equivalent re-runs within the same conversation. Skip-phrases respect speed-over-context preference. Cost-transparency line (V12) makes dispatch count visible so users know what they're paying for. |
| 6 sub-agents instead of 4 in Phase 2 produces too many ideas to filter well | Per-agent target reduced from 8-10 to 6-8 keeps total raw output in v1's range. If filter quality degrades in practice, capture as a `docs/solutions/` learning and tune in v2.1. Frame overlap (especially cross-domain analogy vs assumption-breaking) acknowledged in Open Questions; revisit if Phase 3 dedupe consistently merges across these. |
| Proof failure ladder creates UX confusion (3-option menu after retries) | Use the platform's question tool with self-contained labels per AGENTS.md interactive-question rules. Order options by likely usefulness (file save first if repo exists). Don't loop on retries — surface the choice clearly. Narrate retry backoff so 9s waits don't look like hangs. The 3-option ladder vs simpler 2-option fallback is captured in Open Questions for future revisit. |
| Universal-ideation reference diverges from universal-brainstorming over time | Mirror the shape on creation; add a comment in both files noting they're parallel facilitation references and structural changes should be considered for both. The full-mirror vs routing-stub design tradeoff is captured in Open Questions; revisit if sync drift becomes a real cost. |
| `web-researcher` prompt produces more tool calls than necessary | Per `pass-paths-not-content` learning, instruction phrasing dramatically affects tool-call count. Phased budget is prompt-enforced (no harness rate limiter). Benchmark with `claude -p --output-format stream-json --verbose` after Unit 1 implementation; tune wording before considering the agent stable. |
| Conversation-only end state means lost ideas users wished they'd saved | V17's two checkpoints (raw-candidates after Phase 2; survivors before Phase 4) bound the auto-compact loss case. The Phase 6 menu always offers save options; users opt in by selection. Future enhancement could add a "save before timeout" prompt; out of v2 scope. |
| Mid-session context compaction destroys ideation work | V17 writes Checkpoint A (`raw-candidates.md`) after Phase 2 merge/dedupe and Checkpoint B (`survivors.md`) before Phase 4 presentation. Compaction during Phase 1 grounding dispatch (the only unprotected window — short-running) remains residual risk; mitigation is keeping Phase 1 short and accepting full-rerun on partial-run abort. Auto-resume from checkpoint files is out of v2 scope. |
| Plugin.json or marketplace.json drift from new agent | `bun run release:validate` catches plugin.json/marketplace.json description+version drift. **It does NOT catch README count drift or agent-registration drift** — those are manual responsibilities in Unit 1 verification and Unit 7 README-verification step. |
| `web-researcher` frontmatter `tools:` field unsupported on a converted target platform | Field is verified for Claude Code (`agents/review/*.md` use it) but other targets (Codex, Gemini) may not honor it. Converters scope tools at writer level; if a target ignores the field, the agent inherits the platform's default tool surface. Acceptable for v2; revisit if a target adoption surfaces over-broad tool access in practice. |

---

## Documentation / Operational Notes

- **AGENTS.md updates:** No edits required to `plugins/compound-engineering/AGENTS.md` for this plan — the new agent fits the existing `agents/research/` category, the ce:ideate changes don't introduce new conventions, and the universal-ideation reference follows the established universal-brainstorming pattern.
- **README.md updates (manual, not validator-caught):** Add `web-researcher` row to the research agents table; update agent count from 49 → 50 (crosses the 50+ threshold); update any prose referencing "ce:ideate scans the codebase" to reflect mode-aware grounding.
- **Capture learnings post-ship:** The learnings-researcher findings explicitly noted documentation gaps in (a) mode classification heuristics, (b) web research agents, (c) Proof integration patterns, (d) ideation frame design. After v2 ships, write `docs/solutions/skill-design/` entries capturing what worked and what didn't — this is exactly the institutional knowledge the gaps revealed.
- **Pre-commit checklist (per plugin AGENTS.md):**
  - [ ] No manual release-version bump in `.claude-plugin/plugin.json`
  - [ ] No manual release-version bump in `.claude-plugin/marketplace.json`
  - [ ] No manual release entry added to root `CHANGELOG.md`
  - [ ] README.md component counts verified
  - [ ] README.md research-agents table includes new row
  - [ ] plugin.json description matches current counts
- **Stable/beta sync:** ce:ideate has no `-beta` counterpart (verified via `ls plugins/compound-engineering/skills/`); no sync decision needed.

---

## Sources & References

- **Origin documents:**
  - `docs/brainstorms/2026-03-15-ce-ideate-skill-requirements.md` (v1 requirements)
  - `docs/brainstorms/2026-03-16-issue-grounded-ideation-requirements.md` (issue-grounded mode, preserved unchanged in v2)
- **Conversation-derived design alignment:** This plan reflects a sequence of design decisions reached in conversation between the maintainer and the planning agent on 2026-04-16/17. Key resolved questions are captured in "Open Questions → Resolved During Planning" above.
- **Related code:**
  - `plugins/compound-engineering/skills/ce-ideate/SKILL.md` (target of edits)
  - `plugins/compound-engineering/skills/ce-ideate/references/post-ideation-workflow.md` (target of edits)
  - `plugins/compound-engineering/skills/ce-brainstorm/SKILL.md:59-71` (mode classifier reference)
  - `plugins/compound-engineering/skills/ce-brainstorm/references/universal-brainstorming.md` (universal-ideation reference shape)
  - `plugins/compound-engineering/skills/proof/SKILL.md` (Proof handoff contract)
  - `plugins/compound-engineering/agents/research/learnings-researcher.md`, `slack-researcher.md`, `issue-intelligence-analyst.md` (agent file conventions)
- **Related learnings:**
  - `docs/solutions/skill-design/claude-permissions-optimizer-classification-fix.md`
  - `docs/solutions/skill-design/research-agent-pipeline-separation-2026-04-05.md`
  - `docs/solutions/best-practices/codex-delegation-best-practices-2026-04-01.md`
  - `docs/solutions/skill-design/pass-paths-not-content-to-subagents-2026-03-26.md`
  - `docs/solutions/skill-design/compound-refresh-skill-improvements.md`
- **External research:**
  - [How we built our multi-agent research system — Anthropic](https://www.anthropic.com/engineering/multi-agent-research-system)
  - [Claude Sonnet vs Haiku 2026: Which Model Should You Use?](https://serenitiesai.com/articles/claude-sonnet-vs-haiku-2026)
  - [Claude Benchmarks (2026)](https://www.morphllm.com/claude-benchmarks)
  - [From Web Search towards Agentic Deep ReSearch (arxiv)](https://arxiv.org/html/2506.18959v1)
  - [Deep Research: A Survey of Autonomous Research Agents (arxiv)](https://arxiv.org/html/2508.12752v1)
  - [EigentSearch-Q+ (arxiv)](https://arxiv.org/html/2604.07927)
