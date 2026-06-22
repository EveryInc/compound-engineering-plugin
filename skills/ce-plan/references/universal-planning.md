# Universal Planning Workflow

This file is loaded when ce-plan detects a non-software task (Phase 0.1b). It replaces the software-specific phases (0.2 through 5.1) with a domain-agnostic planning workflow.

## Before starting: verify classification

The detection stub in SKILL.md routes here for anything that isn't clearly software. Verify the classification is correct before proceeding:

- **Is this actually a software task?** The key distinction is task-type, not topic-domain. A study guide about Rust is non-software (producing educational content). A Rust library refactor is software (modifying code). If this is actually software, return to Phase 0.2 in the main SKILL.md.
- **Is this a trivial single-fact lookup?** Only a question answerable from one fact with no research, retrieval, or judgment skips planning — answer it directly and stop, in the user's terms. Do not narrate that it "isn't a planning task" or explain the routing; that is process exhaust (see Veil of value below). Examples: "zsh: command not found: brew", "what's the capital of France." A question that needs multiple steps, any retrieval, or synthesis to answer well does **not** qualify: it is an answer-seeking task (see Disposition below), not a quick-help exit. When unsure, do not exit.
- **Pipeline mode?** If invoked from LFG or any `disable-model-invocation` context: output "This is a non-software task. The LFG pipeline requires ce-work, which only supports software tasks. Use `/ce-plan` directly for non-software planning." and stop.

Once past these checks, commit to the task — do not bail because it looks like a "lookup" or "research question." The user invoked the planning tool on purpose. Then choose the disposition below.

---

## Disposition: plan-seeking vs. answer-seeking

Two kinds of task land here, with different deliverables:

- **Plan-seeking** — the deliverable is a *plan*: a trip itinerary, a study curriculum, an event runbook, a project plan. The plan is the artifact, saved or shared. → Follow Steps 1-3 below.
- **Answer-seeking** — the deliverable is an *answer*: an investigative or analytical question ("how often does X happen — is it a big deal?", "how does our approach compare to Y?", "should we Z?"). No one wants a saved plan document for this; planning is the means to a good answer, not the output. → Follow the **Answer-seeking flow** below; skip the Step 3 artifact handling.

If a request blends both ("research X, then plan Y"), do the answer-seeking research first, then produce the plan artifact.

Commit to one disposition before reading further, and follow only that flow: a plan-seeking task still produces its plan document (Steps 1-3) and does not stop at a chat answer; an answer-seeking task does not write a plan file.

---

## Answer-seeking flow

The planning instinct still applies — but the plan is *working scaffold*, not an artifact. State it in chat to steer the work and show the human the approach; execute it; discard it. No plan file is written.

### State a brief plan-of-attack, then proceed

Say how the question will be answered, right-sized to it: a light question gets a one-line approach; a multi-part analytical question gets a short bulleted plan (a few steps). This is **non-blocking** — announce the approach and continue immediately. Do not ask the user to approve the plan; the stated approach is itself the checkpoint, and the user can interrupt if the framing is wrong. Stop to ask only on a genuine fork the agent cannot resolve (e.g., "his personal account or the org's?").

### Execute the plan

Carry out the approach. When the answer depends on facts the model can't reliably supply from memory — current data, recent events, specifics that drift — gather them using the **Research decomposition pattern** under Step 1 below (decompose into focused questions, dispatch in parallel via the platform's subagent/web primitive, collate). Skip research for anything the model already knows well.

**Ground answers about the user's own code, repo, or named artifacts in the actual sources — not memory.** When the question references local code, a specific file, a named CLI or service, or "our X", read those sources first (and any resource the user named — see Core Principle 8 in SKILL.md). "The model already knows the topic" covers general knowledge only, never the contents of the user's codebase: a comparison or recommendation about local code that was never read is ungrounded. Inspect, then answer.

**Execution here is research and analysis only — never code.** Reading code and artifacts to understand them is in-bounds research; writing or running code to change the system is not — that belongs in `ce-work`. This keeps the planning/execution boundary intact.

### Deliver the answer

Answer in chat. Do **not** write a plan file and do **not** run the Step 3 save/share menu by default. If the investigation produced something the user might want to keep (a comparison table, a sourced summary), offer to save it; otherwise just give the answer. In headless or non-interactive runs, skip the offer and deliver the answer.

### Veil of value: what to surface, what to hide

The plan-of-attack and the answer are for the caller; the skill's internal machinery is not. Edit for relevance the way an expert consultant does — they tell you their thinking about your problem, not which template their back office applied.

- **Surface** (question-domain — reads as value): the approach to the user's actual question, in the user's terms.
- **Hide** (skill-domain — process exhaust): which skill, mode, or phase is running; whether a plan file was or wasn't written; the routing or disposition decision itself.
- **Never hide** (audit content — affects trust in the answer): caveats, gaps, and uncertainty. "I could only pull his last ~100 stars, so this is partial" or "this is my read, not a hard signal" is not junk — it is what a good assistant surfaces. The veil hides plumbing, never the limits of the answer.

Register example, for "how often does he star things — is this a big deal?":

> Wrong: "Quick note first: /ce-plan builds implementation plans, so I ignored the template and just answered the question. Here's what the data says..."

Leaks the skill's name, narrates an internal routing decision, apologizes for deviating — the caller sees the seams of the tool.

> Right: "Let me size this up — I'll check how active a starrer he is overall, his recent cadence, and the kinds of repos he tends to star, then weigh where this one lands. [gathers data] Yes, this is a real signal: ..."

Same underlying process; none of the machinery surfaces. The caller sees thinking about their question.

---

## Step 1: Assess Ambiguity and Research Need

Evaluate two things before planning:

**Would 1-3 quick questions meaningfully improve this plan?**

- **Default: ask 1-3 questions** via Step 1b when the answers would change the plan's structure or content. Always include a final option like "Skip — just make the plan with reasonable assumptions" so the user can opt out instantly.
- **Skip questions entirely** only when the request already specifies all major variables or the task is simple enough that reasonable assumptions cover it well.

**Research need — does this plan depend on facts that change faster than training data?**

| Research need | Signals | Action |
|--------------|---------|--------|
| **None** | Generic, timeless, or conceptual plan (study curriculum methodology, project management approach, personal goal breakdown) | Skip research. Model knowledge is sufficient. After structuring the plan, offer: "I based this on general knowledge. Want me to search for [specific thing research would improve]?" — e.g., sourced recipes, current product recommendations, expert frameworks. Only if the user accepts. |
| **Recommended** | Plan references specific locations, venues, dates, prices, schedules, seasonal availability, or current events — anything where stale information would break the plan (closed restaurants, changed prices, cancelled events, wrong seasonal dates). | Research before planning. Decompose into 2-5 focused research questions and dispatch parallel web searches. In Claude Code, use the Agent tool with `model: "haiku"` for each search to reduce cost. Collate findings before structuring the plan. |

When research is recommended, do it — don't just offer. Stale recommendations (closed restaurants, rethemed attractions, outdated prices) are worse than no recommendations. The user invoked `/ce-plan` because they want a good plan, not a disclaimer about training data.

**Research decomposition pattern:**
1. Identify 2-5 independent research questions based on the task. Good questions target facts the model is least confident about: current prices, hours, availability, recent changes, seasonal specifics.
2. Dispatch parallel research. Prefer user-named surfaces first per Core Principle 8 in SKILL.md; fall back to web search for questions those surfaces don't cover.
3. Collate findings into a brief research summary before proceeding to planning.

Example for "plan a date night in Seattle this Saturday":
- "Best restaurants open late Saturday in Capitol Hill Seattle 2026"
- "Events happening in Seattle [specific date]"
- "Seattle waterfront current status and hours"

## Step 1b: Focused Q&A

Ask up to 3 questions targeting the unknowns that would most change the plan. Use the platform's blocking question tool: `AskUserQuestion` in Claude Code (call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded), `request_user_input` in Codex, `ask_user` in Gemini, `ask_user` in Pi (requires the `pi-ask-user` extension). Fall back to numbered options in chat only when no blocking tool exists or the call errors (e.g., Codex edit modes) — not because a schema load is required. Never silently skip the question.

**How to ask well:**
- Offer informed options, not open-ended blanks. Instead of "When are you going?", try "Mid-week visits have 30-40% shorter lines — are you flexible on timing?" The question should give the user a frame of reference, not just extract information.
- Use multi-select when several independent choices can be captured in one question. This is compact and respects the user's time.
- Always include a final option like **"Skip — just make the plan with reasonable assumptions"** so the user can opt out at any point.

Focus on the unknowns specific to this task that would change what the plan recommends or how it's structured. Do not ask more than 3 — after that, proceed with assumptions for anything remaining.

## Step 2: Structure the Plan

Create a structured plan guided by these quality principles. Do NOT use the software plan template (implementation units, test scenarios, file paths, etc.).

### Format: when to prescribe vs. present options

Not every plan should be a single linear path. Match the format to the task:

| Task type | Best format | Why |
|-----------|------------|-----|
| **High personal preference** (food, entertainment, activities, gifts) | Curated options per category — present 2-3 choices and let the user compose | Preferences vary; a single pick may miss. Options respect the user's taste. |
| **Logical sequence** (study plan, project timeline, multi-day trip logistics) | Single prescriptive path with clear ordering | Sequencing matters; options at each step create decision paralysis. |
| **Hybrid** (event with fixed structure but variable details) | Fixed structure with choice points marked | The skeleton is set but specific vendors/venues/activities are options. |

Example: A date night plan should present 2-3 restaurant options, 2-3 activity options, and a suggested flow — not pick one restaurant and build the whole evening around it. A study plan should prescribe a single weekly progression — not present 3 different curricula to choose from.

### Formatting: bullets over prose

- Prefer bullets and tables for actionable content (steps, options, logistics, budgets)
- Use prose only for context, rationale, or explanations that connect the dots
- Plans are for scanning and executing, not reading cover-to-cover

### Quality principles

- **Actionable steps**: Each step is specific enough to execute without further research
- **Sequenced by dependency**: Steps are in the right order, with dependencies noted
- **Time-aware**: When relevant, include timing, durations, deadlines, or phases
- **Resource-identified**: Specify what's needed — tools, materials, people, budget, locations
- **Contingency-aware**: For important decisions, note alternatives or what to do if plans change
- **Appropriately detailed**: Match detail to task complexity. A weekend trip needs less structure than a 3-month curriculum. A dinner plan should be concise, not a 200-line document.
- **Domain-appropriate format**: Choose a structure that fits the domain:
  - Itinerary for travel (day-by-day, with times and locations)
  - Syllabus or curriculum for study plans (topics, resources, milestones)
  - Runbook for events (timeline, responsibilities, logistics)
  - Project plan for business or operational tasks (phases, owners, deliverables)
  - Research plan for investigations (questions, methods, sources)
  - Options menu for preference-driven tasks (curated picks per category)

## Step 3: Save or Share

After structuring the plan, ask the user how they want to receive it using the platform's blocking question tool: `AskUserQuestion` in Claude Code (call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded), `request_user_input` in Codex, `ask_user` in Gemini, `ask_user` in Pi (requires the `pi-ask-user` extension). Fall back to numbered options in chat only when no blocking tool exists or the call errors (e.g., Codex edit modes) — not because a schema load is required. Never silently skip the question.

**Question:** "Plan ready. How would you like to receive it?"

**Options:**

1. **Save to disk** — Write the plan as a markdown file. Ask where:
   - `docs/plans/` (only show if this directory exists)
   - Current working directory
   - `/tmp`
   - A custom path
   - Use filename convention: `YYYY-MM-DD-<descriptive-name>-plan.md`
   - Start the document with a `# Title` heading, followed by `Created: YYYY-MM-DD` on the next line. No YAML frontmatter.

2. **Publish to Proof — shareable link** — Publish the doc to Every's Proof editor and get a shareable link to read, comment on, or share with others. Load the `ce-proof` skill to create the shared document and return the URL. One-way: nothing syncs back to disk.

3. **Save to disk AND publish to Proof** — Do both: write the markdown file to disk and publish a shareable Proof copy for review. The local file stays canonical.

Do not offer `/ce-work` (software-only) or issue creation (not applicable to non-software plans).
