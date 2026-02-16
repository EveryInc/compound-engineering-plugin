---
date: 2026-02-13
topic: user-research-workflow-integration
---

# User Research Integration into Brainstorm & Plan Workflows

## What We're Building

Wire user research artifacts (personas, interview insights, opportunities) into the brainstorm and plan workflows so that product decisions are grounded in user evidence rather than assumptions.

Today, `/workflows:research` produces structured artifacts in `docs/research/` (personas, interview snapshots, research plans) and the `user-research-analyst` agent knows how to search them — but nothing in brainstorm or plan actually calls it. The research workflow hands off to brainstorm, but brainstorm doesn't consume the output. This integration closes that gap.

## Why This Approach

We considered three scoping strategies:

1. **All at once** — wire basics + deeper integrations + plan + work in a single pass. Rejected: too broad, hard to validate incrementally.
2. **Brainstorm-only** — focus exclusively on brainstorm, defer plan. Rejected: the plan wiring is trivial and documented as a TODO already.
3. **Phased approach** (chosen) — Phase 1 wires the basics into both brainstorm and plan. Phase 2 layers in deeper brainstorm integrations. This lets us ship value quickly and validate each layer before adding the next.

## Key Decisions

- **Phased delivery**: Phase 1 (basic wiring) then Phase 2 (deeper brainstorm integrations)
- **Brainstorm + Plan first**: These are where research evidence has the highest leverage. Work workflow integration deferred.
- **Parallel execution**: `user-research-analyst` runs in parallel with existing agents — no serial bottleneck added
- **Graceful degradation**: When `docs/research/` is empty, the agent returns a note suggesting `/workflows:research` — no errors, no blocking

## Phase 1: Basic Wiring

### 1a. Wire `user-research-analyst` into Brainstorm Phase 1.1

**Current state:** Brainstorm Phase 1.1 runs only `repo-research-analyst`.

**Change:** Add `user-research-analyst` as a parallel agent in Phase 1.1. The brainstorm would run:

```
- Task repo-research-analyst("Understand existing patterns related to: <feature_description>")
- Task user-research-analyst("Surface research relevant to: <feature_description>")
```

**What this unlocks:** Before the collaborative dialogue begins, the brainstormer knows which personas are relevant, what opportunities exist, and what pain points users have expressed. The "understand the idea" conversation becomes evidence-informed.

**Output flow:** Present a brief summary of relevant research findings (personas, key insights, research gaps) before starting the collaborative dialogue in Phase 1.2. Even without the deeper Phase 2 integrations, this gives the user and the brainstorm process shared context from real user evidence.

**Files to modify:**
- `plugins/compound-engineering/commands/workflows/brainstorm.md` — Phase 1.1
- `plugins/compound-engineering/agents/research/user-research-analyst.md` — remove "to be wired in PR 2" note

### 1b. Wire `user-research-analyst` into Plan Step 1

**Current state:** Plan Step 1 runs `repo-research-analyst` + `learnings-researcher` in parallel.

**Change:** Add `user-research-analyst` as a third parallel agent:

```
- Task repo-research-analyst(feature_description)
- Task learnings-researcher(feature_description)
- Task user-research-analyst(feature_description)
```

**Step 1.6 (Consolidate Research) update:** Add "User Research Findings" as a consolidation category alongside repo patterns and institutional learnings. Structure:

- Relevant personas and their relationship to this feature
- Key insights and quotes from interviews
- Research gaps (areas where coverage is thin)

**Files to modify:**
- `plugins/compound-engineering/commands/workflows/plan.md` — Step 1 and Step 1.6
- `plugins/compound-engineering/agents/research/user-research-analyst.md` — remove "to be wired in PR 2" note

## Phase 2: Deeper Brainstorm Integrations

### 2a. Opportunity-Driven Brainstorm Initiation

**When:** Brainstorm starts with no feature description or a vague one.

**Behavior:** Check persona opportunity tables for unaddressed opportunities. Present them as starting points:

> "Your research has identified these opportunities:
> 1. [Persona X] needs faster data export (high frequency, low satisfaction)
> 2. [Persona Y] struggles with team collaboration features
> 3. [Persona Z] wants better mobile support
>
> Would you like to explore one of these, or describe something else?"

This flips brainstorming from "what should we build?" to "your users told you what they need."

**Dependency:** Requires persona opportunity tables to be populated — the `persona-builder` skill must have run at least once via `/workflows:research personas`. When no personas exist, this step is skipped gracefully (same as Phase 1 graceful degradation).

**Files to modify:**
- `plugins/compound-engineering/commands/workflows/brainstorm.md` — new Phase 0.5 between assessment and Phase 1
- May need a lightweight "opportunity scanner" helper or extend `user-research-analyst` output

### 2b. Research-Informed Question Generation

**When:** After `user-research-analyst` surfaces findings in Phase 1.1, entering Phase 1.2 (Collaborative Dialogue).

**Behavior:** Use research findings to shape questions. Instead of generic questions:

- Generic: "Who are the users of this feature?"
- Research-informed: "Your research shows two user types here — [Persona A] who uses this daily vs [Persona B] who uses it quarterly. Should we optimize for one or both?"

- Generic: "What problem does this solve?"
- Research-informed: "Interviews show users currently work around this by [workaround]. Should we replace that workaround entirely, or build alongside it?"

**Files to modify:**
- `plugins/compound-engineering/commands/workflows/brainstorm.md` — Phase 1.2 guidelines
- `plugins/compound-engineering/skills/brainstorming/SKILL.md` — add "research-informed questioning" technique

### 2c. Persona-Grounded Approach Evaluation

**When:** Phase 2 (Explore Approaches), evaluating 2-3 approaches.

**Behavior:** Evaluate each approach against relevant personas:

> **Approach A: Simple Export Button**
> - Serves [Persona X] well (matches their "quick export" workflow from interviews)
> - Doesn't address [Persona Y]'s need for scheduled exports
>
> **Approach B: Export Configuration Panel**
> - Addresses both [Persona X] and [Persona Y]
> - Higher complexity; [Persona X] may find it slower than current workaround

This makes trade-off discussions concrete and user-grounded instead of hypothetical.

**Files to modify:**
- `plugins/compound-engineering/commands/workflows/brainstorm.md` — Phase 2 guidelines
- `plugins/compound-engineering/skills/brainstorming/SKILL.md` — add persona-grounded evaluation pattern

### 2d. Research Evidence in Brainstorm Capture

**When:** Phase 3 (Capture the Design), writing the brainstorm document.

**Behavior:** Add a "Research Evidence" section to the brainstorm document template:

```markdown
## Research Evidence

### Relevant Personas
- **[Persona Name]** (confidence: high) — [one-line relevance]

### Key Quotes
- "[quote]" — participant NNN, on [topic]

### Opportunities Addressed
- [Opportunity from persona table] → addressed by [decision]

### Research Gaps
- [Areas where we're making assumptions without research backing]
```

This creates a traceable chain: research → brainstorm decisions → plan → implementation.

**Files to modify:**
- `plugins/compound-engineering/commands/workflows/brainstorm.md` — Phase 3 template
- `plugins/compound-engineering/skills/brainstorming/SKILL.md` — update design doc structure

## Open Questions

- **`deepen-plan` coverage: resolved.** `deepen-plan` explicitly runs ALL agents from ALL sources with no relevance filtering (Step 5 rule: "Do NOT filter agents by relevance - run them ALL"). So `user-research-analyst` will be picked up automatically — no changes needed there.
- **Opportunity tracking:** Should we track which opportunities have been addressed across brainstorms? This was deferred (Tier 5) but could be lightweight metadata in the brainstorm YAML frontmatter.
- **Research freshness:** Should we warn when persona data is stale (>90 days)? Deferred but low-effort to add.

## Deferred Ideas (Future Phases)

These were explored but deferred based on priority:

| Idea | Tier | Reason Deferred |
|------|------|----------------|
| Persona-informed stakeholder analysis in plan | 3 | Plan wiring covers the basics; deeper integration later |
| Research-backed acceptance criteria in plan | 3 | Valuable but complex; needs careful design |
| Research gap detection warnings | 3 | Nice-to-have; basic wiring surfaces gaps naturally |
| Persona context during work setup | 4 | Light touch; work executes plans that already have context |
| Persona-driven test scenarios | 4 | Interesting but speculative; validate Phase 1-2 first |
| Research-to-brainstorm handoff with context | 5 | Can be addressed when improving research workflow |
| Brainstorm-to-research feedback loop | 5 | Closes the loop; depends on Phase 2 working well |
| Opportunity tracking across workflows | 5 | Needs Phase 2a working first |
| Research freshness indicators | 5 | Low-effort but low-priority |

## Next Steps

→ `/workflows:plan` for Phase 1 implementation (basic wiring into brainstorm + plan)
→ Validate Phase 1 works with real research data before starting Phase 2
