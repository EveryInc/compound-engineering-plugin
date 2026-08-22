# Planning Research

Phase 1 of `ce-plan`. Read this before dispatching any research subagent.

### Phase 1: Gather Context

All specialist research and deepening prompts used in this phase are skill-local prompt assets under `references/agents/`. When dispatching one, read the matching file and seed a generic subagent with that prompt content plus the task-specific context below. Do not dispatch standalone agents by type/name.

Model tiering lives in this caller, not in prompt assets. Local prompt files have no frontmatter. Use the platform's mid-tier model for external/organizational research prompts such as `slack-researcher` and `web-researcher` when the current harness exposes a known override; otherwise omit the override and inherit. Use inherited model for high-judgment architecture, migration, and planning-deepening prompts unless the harness has an established cheaper capable tier.

#### 1.1 Local Research

At every native subagent boundary in this phase, classify a rejected dispatch by whether an agent launched: correct a pre-launch argument rejection once, leave capacity-limited work queued, and otherwise follow that boundary's stated fallback or failed-pass handling.

A **Lightweight** Durable plan does not dispatch the research agents below. Ground it from bounded inline reads of the files the request names and their tests, note any `<root>/solutions/` entry whose title matches the topic, and continue to 1.1b; 1.4b's reclassification still applies when those reads surface an external contract surface.

For Standard and Deep, prepare a concise planning context summary (a paragraph or two) to pass as input to the research agents:
- If an origin document exists, summarize the problem frame, requirements, and key decisions from that document
- Otherwise use the feature description directly
- Read `STRATEGY.md` at the repo root (the shared project doc), and a legacy `PRODUCT.md` or `VISION.md` only when `STRATEGY.md` is absent or does not carry a meaning you need, and include the relevant pieces (purpose, positioning or approach, active tracks, and stated boundaries or non-goals; go by each section's meaning, since heading names vary by writer and version) in the summary so downstream research and planning decisions are anchored to product strategy
- If `CONCEPTS.md` exists at repo root, read it — its definitions are the canonical names for domain entities, named processes, and status concepts. Plan with those terms rather than synonyms.
- Include session-settled decisions with their rejected alternatives, plus the standing line "If you find evidence a settled decision cannot work, report it — do not suppress it." Do not pass the decision's advocacy or rationale, and keep any adversarial or validation lens blind to settlement markers.

Pass the project's active instructions and the planning context summary to `repo-research-analyst`, and send it directly to the requested current scopes. If the feature cannot be scoped from that context, allow one targeted root or workspace probe. Read an exact dependency or runtime version when the plan or an external-doc query materially depends on it.

Run these agents in parallel:

- `references/agents/repo-research-analyst.md` — scope: **patterns**. Pass the planning context summary so it can go directly to current feature patterns and owning code.
- `references/agents/learnings-researcher.md` — pass the planning context summary.

**Agent-native planning triage** (conditional) — consider broadly, dispatch selectively. Dispatch a generic subagent with `references/agents/agent-native-planning-strategist.md` in parallel with the local research agents when the request, origin document, or repo research indicates any of:

- agent, assistant, chat, workflow automation, MCP, plugin, skill, tool registry, prompt, or autonomous-loop work
- a codebase with an existing agent surface where this feature changes user-visible capabilities
- a primary domain action that is repetitive, high-volume, complex, naturally language-shaped, or likely to need automation access
- a risk that the plan will widen the gap between UI/API actions and agent-accessible tools or context

Do **not** dispatch for cosmetic, layout-only, animation-only, brand, low-value preference, or narrow work in a product with no agent surface. If the signal is borderline, do not dispatch; carry only a short future parity consideration when it affects a high-value domain action. Include any resulting findings in consolidation as planning inputs, not as a standalone advice appendix.

Collect:
- Exact dependency or runtime versions only when they materially affect the plan or an external research decision
- Relevant architecture and implementation patterns, files, modules, and tests for the requested scope
- Applicable constraints from the project's active instructions and context
- Institutional learnings from `<root>/solutions/`
- Product strategy context when any product doc is present — flag any plan decisions that pull away from the active tracks or the stated positioning, or that land inside its stated boundaries or non-goals
- Agent-native planning findings when the conditional triage dispatched: action/context parity decisions, tool/workspace/execution-lifecycle choices, scope boundaries, and verification scenarios

**Slack context** (opt-in) — never auto-dispatch. Route by condition:

- **Tools available + user asked**: Dispatch a generic subagent with `references/agents/slack-researcher.md` and the planning context summary in parallel with other Phase 1.1 agents. If the origin document has a Slack context section, pass it verbatim so the researcher focuses on gaps. Include findings in consolidation.
- **Tools available + user didn't ask**: Note in output: "Slack tools detected. Ask me to search Slack for organizational context at any point, or include it in your next prompt."
- **No tools + user asked**: Note in output: "Slack context was requested but no Slack tools are available. Install and authenticate the Slack plugin to enable organizational context search."

#### 1.1b Detect Execution Direction Signals

Decide whether the plan should carry a lightweight execution direction signal.

Look for signals such as:
- The user explicitly asks for TDD, test-first, or characterization-first work
- The origin document calls for test-first implementation or exploratory hardening of legacy code
- Local research shows the target area is legacy, weakly tested, or historically fragile, suggesting characterization coverage before changing behavior
- The work is mostly configuration, packaging, UI styling, or environment setup where the right first proof is a smoke/runtime check rather than unit coverage

When the signal is clear, carry it forward silently in the relevant implementation units.

Ask the user only if the direction would materially change sequencing or risk and cannot be responsibly inferred.

#### 1.2 Decide on External Research

Based on the origin document, user signals, and local findings, decide **whether** external research adds value and, if so, **what kind**. Resolve this in three stages: explicit-request priority, intent classification, then the implicit signals below.

**Stage 1 — An explicit request takes precedence.** If the user prompt **or** the origin requirements document explicitly asks for external input — a signal that the answer lives outside the repo, such as competitor/prior-art comparison, "what should we borrow", "from the web", "best practices", "official docs", "alternatives to", a market scan, or naming a specific external technology to consult — external research is **required**, regardless of how strong local patterns look. The list is illustrative; key on the signal, not the exact phrase — any wording that clearly points outside the repo qualifies. The skip conditions below do **not** apply to an explicit request. The only thing that overrides it is an explicit opt-out ("no web research", "skip external research"): honor that, skip, and note it. Improvement or quality verbs ("improve", "make better") carry no external signal on their own and never trigger research by themselves.

**Stage 2 — Classify the research intent** (whenever external research will run, from Stage 1 or the implicit signals below) so Phase 1.3 routes correctly. Use this mechanical test, not a fixed phrase list:
- **Implementation-guidance** — the approach or technology is already settled; the question is *how to build it well* (best practices, version-specific docs, API constraints, known pitfalls, deprecations).
- **Landscape / option-discovery** — the question is *what options or prior art exist* (competitor scans, build-vs-buy, library/provider selection, prior art, market signals, cross-domain analogies).
- **Mixed** — both: discover an unsettled external option set first, then research the shortlisted choice for implementation guidance.

**Stage 3 — Implicit signals** decide the call when no explicit request fired.

**Read between the lines.** Pay attention to signals from the conversation so far:
- **User familiarity** — Are they pointing to specific files or patterns? They likely know the codebase well.
- **User intent** — Do they want speed or thoroughness? Exploration or execution?
- **Topic risk** — Security, payments, external APIs warrant more caution regardless of user signals.
- **Uncertainty level** — Is the approach clear or still open-ended?

**Leverage the repo research prompt's technology context:**

Use technology facts already present in the project's active instructions, planning context, or task-specific repo research. Read any exact version fresh from the owning manifest when it materially affects an external-research decision:

- If specific frameworks and versions were detected (e.g., Rails 7.2, Next.js 14, Go 1.22), pass those exact identifiers to the `framework-docs-researcher` local prompt so it fetches version-specific documentation
- If the feature touches a technology layer the scan found well-established in the repo (e.g., existing Sidekiq jobs when planning a new background job), lean toward skipping external research -- local patterns are likely sufficient
- If the feature touches a technology layer the scan found absent or thin (e.g., no existing proto files when planning a new gRPC service), lean toward external research -- there are no local patterns to follow
- If the scan detected deployment infrastructure (Docker, K8s, serverless), note it in the planning context passed to downstream agents so they can account for deployment constraints
- If the scan detected a monorepo and scoped to a specific service, pass that service's tech context to downstream research agents -- not the aggregate of all services. If the scan surfaced the workspace map without scoping, use the feature description to identify the relevant service before proceeding with research

**Always lean toward external research when:**
- The topic is high-risk: security, payments, privacy, external APIs, migrations, compliance
- The codebase lacks relevant local patterns -- fewer than 3 direct examples of the pattern this plan needs
- Local patterns exist for an adjacent domain but not the exact one -- e.g., the codebase has HTTP clients but not webhook receivers, or has background jobs but not event-driven pub/sub. Adjacent patterns suggest the team is comfortable with the technology layer but may not know domain-specific pitfalls. When this signal is present, frame the external research query around the domain gap specifically, not the general technology
- The user is exploring unfamiliar territory
- The technology scan found the relevant layer absent or thin in the codebase
- The plan's recommendations depend on a genuinely external, **unsettled** option set — which library, provider, or approach to adopt, or what competitors and prior art do — **even when local implementation patterns are strong** (intent: landscape). Bound this implicit landscape trigger by three gates: (a) the option set genuinely lives outside the repo, (b) the decision materially shapes the plan (a KTD, dependency, or architecture choice — not an incidental detail), and (c) no settled local or team choice already exists. Improvement verbs alone never satisfy this.

**Skip external research when** (only when Stage 1 found no explicit request — an explicit request is never skipped):
- The codebase already shows a strong local pattern -- multiple direct examples (not adjacent-domain), recently touched, following current conventions
- The user already knows the intended shape
- Additional external context would add little practical value
- The technology scan found the relevant layer well-established with existing examples to follow

When an explicit request *did* fire but a settled local or team choice already exists, **narrow the research rather than skipping it** — research the current pitfalls, docs, and practices for the chosen library/pattern instead of re-surveying the whole option set.

Announce the decision and the intent briefly before continuing. Examples:
- "Your codebase has solid patterns for this. Proceeding without external research."
- "This involves payment processing, so I'll research current best practices first (implementation-guidance)."
- "You asked what to borrow from competitors, so I'll run a landscape scan first (landscape/option-discovery)."

#### 1.3 External Research (Conditional)

If Step 1.2 indicates external research is useful, dispatch by the **intent** classified in Stage 2, using the platform's subagent primitive (`Agent`/`Task` in Claude Code, `spawn_agent` in Codex) where available; otherwise run the work inline or serially. Read the selected prompt asset from `references/agents/` and seed a generic subagent with it. For `web-researcher.md`, pass a focus hint plus the planning context summary and do **not** pass codebase content — it operates externally.

- **Implementation-guidance** — run in parallel:
  - `references/agents/best-practices-researcher.md` with the planning context summary.
  - `references/agents/framework-docs-researcher.md` with the planning context summary and exact frameworks/versions from Phase 1.1 where available.
- **Landscape / option-discovery** — `references/agents/web-researcher.md` with the focus hint and planning context summary. When the request targets projects on a code host (e.g., "competitors on GitHub"), name the discovery dimensions in the focus hint: project names and URLs, release recency and activity, CLI/UX shape, install path, docs and examples, plugin/extension surfaces, recurring issue themes, and license — treating star counts as a weak signal only.
- **Mixed** — **sequential, not parallel**: run the `web-researcher` local prompt first to map the landscape and produce a shortlist; then run the `framework-docs-researcher` and/or `best-practices-researcher` local prompts against the shortlisted technologies only when their details materially shape the plan.

**Tool-unavailable handling.** `web-researcher` self-checks for web tools and stops if they are missing. Never block on this: if it reports research unavailable, or any researcher fails, warn and proceed, and carry the gap into Phase 1.4 so the plan records it honestly — especially when the user explicitly requested external research, where a silent skip would leave the plan looking evidence-based when it is not.

#### 1.4 Consolidate Research

Summarize:
- Relevant codebase patterns and file paths
- Relevant institutional learnings
- Organizational context from Slack conversations, if gathered (prior discussions, decisions, or domain knowledge relevant to the feature)
- External references, prior art, competitor/landscape findings, and best practices, if gathered
- Related issues, PRs, or prior art
- Any constraints that should materially shape the plan

**Land external findings in decisions, not an appendix.** Any external research that ran must surface where it changes a choice — Key Technical Decisions rationale, Alternatives, Risks, or Sources & Research — not as a detached list with no bearing on the plan. If a finding shaped nothing, it was not load-bearing; do not pad the plan with it.

**Mark whether external research was load-bearing.** Record a single internal flag: did external findings materially shape a KTD, Alternative, Scope boundary, or Risk? This flag answers only that question — it does **not** gate whether research runs (Phase 1.2 owns that decision). Phase 5.3.2 reads it to decide whether to enter a confidence-scoring pass.

**Record requested-but-unavailable.** If the user explicitly requested external research but it could not run (web tools unavailable, researcher failed), state that in the plan as an assumption or open question rather than presenting the plan as externally grounded.

#### 1.4b Reclassify Depth When Research Reveals External Contract Surfaces

If the current classification is **Lightweight** and Phase 1 research found that the work touches any of these external contract surfaces, reclassify to **Standard**:

- Environment variables consumed by external systems, CI, or other repositories
- Exported public APIs, CLI flags, or command-line interface contracts
- CI/CD configuration files (`.github/workflows/`, `Dockerfile`, deployment scripts)
- Shared types or interfaces imported by downstream consumers
- Documentation referenced by external URLs or linked from other systems

This ensures flow analysis (Phase 1.5) runs and the confidence check (Phase 5.3) applies critical-section bonuses. Announce the reclassification briefly: "Reclassifying to Standard — this change touches [environment variables / exported APIs / CI config] with external consumers."

#### 1.5 Flow and Edge-Case Analysis (Conditional)

For **Standard** or **Deep** plans, or when user flow completeness is still unclear, run:

- `references/agents/spec-flow-analyzer.md` with the planning context summary and research findings.

Use the output to:
- Identify missing edge cases, state transitions, or handoff gaps
- Tighten requirements trace or verification strategy
- Add only the flow details that materially improve the plan
