---
title: Conditional visual aids in generated documents and PR descriptions
date: 2026-03-29
category: best-practices
module: compound-engineering plugin skills
problem_type: design_pattern
component: documentation
symptoms:
  - "Generated documents and PR descriptions lack visual aids that would improve comprehension of complex workflows and relationships"
  - "No consistent criteria for when to include mermaid diagrams vs ASCII art vs markdown tables"
  - "Dense prose obscures architectural relationships that a diagram would clarify instantly"
  - "Downstream consumers recreate visuals from scratch because upstream documents did not include them"
root_cause: inadequate_documentation
resolution_type: documentation_update
severity: low
tags:
  - visual-aids
  - mermaid
  - ascii-diagrams
  - markdown-tables
  - pr-descriptions
  - skill-design
  - document-generation
---

# Conditional visual aids in generated documents and PR descriptions

## Problem

AI-generated documents and PR descriptions default to prose-only output, even when the content -- multi-step workflows, behavioral mode comparisons, multi-participant interactions, dependency structures -- would be understood significantly faster with a visual aid. The gap is not "no diagrams." The gap is that there is no principled framework for deciding when a visual aid earns its place, which format to use, and how to calibrate for different output surfaces.

---

## Symptoms

- Readers mentally reconstruct workflows, dependency graphs, or mode differences from dense prose paragraphs
- Downstream consumers (ce:plan reading a brainstorm, reviewers reading a PR) create their own visual aids from scratch because the upstream document didn't include them
- Plans with 5+ implementation units and non-linear dependencies force readers to scan every unit's Dependencies field to reconstruct the execution graph
- System-Wide Impact sections naming multiple interacting surfaces read as a wall of prose when a component diagram would take seconds to scan
- PR descriptions for architecturally significant changes are text-only even though they were built from plans that contained visual aids
- Simple, linear documents include diagrams that add no comprehension value beyond restating the prose

---

## What Didn't Work

- **Always adding diagrams** -- treating visual aids as mandatory by depth classification, document length, or PR size produces noise. Reflexive diagram inclusion trains readers to skip them.
- **Never adding diagrams** -- prose-only output fails when content has branching flows, mode comparisons, or multi-participant interactions. Downstream consumers end up building the visuals themselves.
- **Wrong diagram type for the content** -- using a mermaid flow diagram when the value is in rich annotations within each step (CLI commands, decision logic) produces a diagram that strips out the useful detail.
- **Wrong abstraction level for the surface** -- code-level detail in a brainstorm diagram is premature. Product-level user flows in a plan's Technical Design section miss the point. Oversized diagrams in a PR description slow down reviewers.
- **Size/depth as the trigger** -- gating visual aids on "Standard" or "Deep" depth classification, or on PR line count, produces false positives (long but simple docs get unwanted diagrams) and false negatives (short but complex docs get none).

---

## Solution: The Conditional Visual Aid Pattern

Visual aids are conditional on **content patterns** -- what the content describes -- not on document size, depth classification, or surface type alone. Include a visual aid when the content would be significantly easier to understand with one; skip it when prose already communicates the concept clearly.

### 1. Content-Pattern Triggers (Not Size/Depth Triggers)

Whether to include a visual aid depends on WHAT the content describes, not HOW MUCH content there is. A Lightweight brainstorm about a complex workflow may warrant a diagram; a Deep brainstorm about a straightforward feature may not.

| Content describes... | Visual aid type | Notes |
|---|---|---|
| Multi-step workflow or process with branching | Flow diagram (mermaid or ASCII) | Shows sequence, branches, decision points |
| 3+ behavioral modes, variants, or states | Comparison table (markdown) | Shows how modes differ across dimensions |
| 3+ interacting participants (roles, components, services) | Relationship/interaction diagram (mermaid or ASCII) | Shows who talks to whom and in what order |
| Multiple competing approaches or alternatives | Comparison table (markdown) | Structured side-by-side evaluation |
| 4+ units/stages with non-linear dependencies | Dependency graph (mermaid) | Shows parallelism, fan-in/fan-out, blocking order |
| Data pipeline or transformation chain | Data flow sketch (mermaid or ASCII) | Shows input/output transformations |
| State-heavy lifecycle | State diagram (mermaid) | Shows transitions and guards |
| Before/after performance or behavioral changes | Comparison table (markdown) | Structured quantitative comparison |

**Why content patterns beat size thresholds:** Size correlates weakly with structural complexity. A 200-line brainstorm about a simple CRUD feature is structurally simple. A 50-line brainstorm about a multi-actor authorization workflow is structurally complex. Pattern-based triggers correctly distinguish these; size-based triggers don't.

**Universal skip criteria:**
- Prose already communicates the concept clearly
- Diagram would just restate content in visual form without adding comprehension value
- Content is simple and linear with no multi-step flows, mode comparisons, or multi-participant interactions
- Visual describes detail at the wrong abstraction level for the surface
- Three or fewer items in a straight chain -- text is sufficient
- Diagram would be 3 nodes or fewer -- it adds ceremony without comprehension benefit

### 2. Which Visual Aid to Choose

```
                    +---------------------------+
                    | Does the content warrant   |
                    | a visual aid at all?        |
                    +-------------+-------------+
                                  |
                         +--------+--------+
                         |                 |
                        No                Yes
                         |                 |
                    Skip entirely    What kind of content?
                                         |
                    +--------------------+--------------------+
                    |                    |                    |
              Flows/sequences     Comparisons/data     Relationships
                    |                    |                    |
              +-----+-----+       Markdown table       +-----+-----+
              |           |                            |           |
         Annotation    Simple flow               Simple graph   Complex
         density high? (5-15 nodes)              (5-15 nodes)   spatial
              |           |                            |        layout
              |        Mermaid                      Mermaid        |
           ASCII                                                ASCII
```

**Mermaid diagrams (default for most flow and relationship content)**

- Best for: simple flows (5-15 nodes), dependency graphs, sequence diagrams, state diagrams, component diagrams
- Strengths: renders as SVG in GitHub; source text readable as fallback in email, Slack, terminal, diff views; standardized syntax; easy to maintain
- Limitations: poor at rich in-box annotations; node labels must be concise; awkward for multi-line content within a node
- Use `TB` (top-to-bottom) direction for narrow rendering in both SVG and source fallback

**ASCII/box-drawing diagrams (when annotation density is high)**

- Best for: annotated flows with CLI commands, decision logic, file paths at each step; multi-column spatial arrangements; layouts where the value is in *annotations within steps*, not just the flow between them
- Strengths: renders identically everywhere (no renderer dependency); more expressive for in-box content
- Constraints: 80-column max for terminal and diff view compatibility; use vertical stacking to fit
- Choose over mermaid when: the diagram's value comes from what's written inside each box, not from the graph shape

**Markdown tables (structured comparison data)**

- Best for: mode/variant comparisons (3+ modes), before/after data, decision matrices, approach evaluations, trade-off summaries
- Strengths: wrap naturally in renderers; universally supported; dense information in scannable form
- Choose for any structured data that maps inputs to outputs or compares items across dimensions

### 3. Surface-Specific Calibration

Each output surface has different reading patterns. The trigger bar and diagram density must adjust.

| Surface | Reading pattern | Trigger bar | Abstraction level | Typical diagram size |
|---|---|---|---|---|
| Requirements (ce:brainstorm) | Studied deeply | Standard | Conceptual/product-level: user flows, information flows, mode comparisons | 5-20 nodes |
| Plan -- Technical Design (ce:plan 3.4) | Studied deeply | Work-characteristic-driven | Solution architecture: component interactions, data flow, state machines | 5-15 nodes |
| Plan -- Readability (ce:plan 4.4) | Studied deeply | Standard | Document structure: unit dependencies, impact surfaces, mode overviews | 5-15 nodes |
| PR description (git-commit-push-pr) | Scanned quickly | High | Change impact: what changed architecturally, what flows differently | 5-10 nodes |

Key distinctions:
- **Brainstorm**: conceptual level only. No implementation architecture, data schemas, or code structure.
- **Plan Technical Design vs. Plan Readability**: Section 3.4 diagrams describe *what's being built*. Section 4.4 diagrams help readers *comprehend the plan document itself*. These are complementary, not overlapping.
- **PR description**: highest bar. Only include when the change involves structural complexity a reviewer would struggle to reconstruct from prose alone. Derived from the branch diff, not from upstream plan/brainstorm artifacts.

### 4. Layout and Cross-Device Optimization

**TB direction for mermaid.** Top-to-bottom diagrams stay narrow in both rendered SVG and source text fallback. This matters for:
- GitHub's PR description view (limited horizontal space)
- Side-by-side diff views (source text appears as code block)
- Email/Slack notifications (source text is all that renders)

**80-column max for ASCII.** Terminal windows, diff views, and email clients clip or wrap beyond 80 columns. Use vertical stacking to fit complex content within column limits.

**Proportionality: 5-15 nodes typical.** Every node should earn its place:
- Simple 5-step workflow -> 5-10 nodes
- Complex workflow with decision branches -> 15-20 nodes if every node earns its place
- PR descriptions trend smaller (5-10 nodes); brainstorms and plans can trend larger
- Exceeding 15 should be because the content genuinely has that many meaningful steps

**Mermaid source as text fallback.** Many consumers first encounter generated documents through contexts that don't render mermaid:
- Email notifications of PR descriptions
- Slack link previews
- Terminal diff views and `git log` output
- RSS readers
Source text must be readable as text. TB direction and concise node labels help.

**Inline placement at point of relevance.** Always place visual aids where they help comprehension:
- Workflow diagram after Problem Frame, not in a "Diagrams" appendix
- Dependency graph before or after Implementation Units heading
- Comparison table within the section discussing modes or alternatives
- A separate "Diagrams" section invites diagrams for diagrams' sake
- Exception: substantial flows (>10 nodes) may warrant their own heading near the point of relevance

---

## Why This Works

The conditional, content-pattern-based approach ties the inclusion decision to an observable property of the content itself, not to a proxy metric. This produces correct decisions at both ends: a short brainstorm about a complex multi-actor workflow gets a diagram (trigger matches); a long brainstorm about a straightforward feature does not (no trigger matches).

Surface-specific calibration ensures the same core principle -- "include when content patterns warrant it" -- adapts to consumption context. The trigger bar rises and diagram sizes shrink as reading pattern shifts from deep study to quick scanning.

Self-contained format selection per skill (rather than cross-references) keeps skills independently functional while shared structural patterns (When to include / When to skip / Format selection / Prose-is-authoritative) maintain consistency.

The prose-is-authoritative invariant resolves the trust problem: when diagram and prose disagree, prose governs. No ambiguity for reviewers or implementers.

---

## Prevention

Concrete guidance for any skill that generates documents with visual aids:

1. **Use content-pattern triggers, not size/depth gates.** Define an explicit "When to include" table mapping content patterns to visual aid types. Never gate on depth classification or line count.

2. **Define explicit skip criteria.** Every "When to include" needs a "When to skip." Include at minimum: prose already clear, diagram would restate without value, content is simple/linear, visual is at wrong abstraction level.

3. **Make format selection self-contained per skill.** Each skill contains its own format guidance (mermaid, ASCII, markdown tables) with surface-appropriate calibration. Don't cross-reference other skills' guidance.

4. **Calibrate to the surface's reading pattern.** Define trigger bar relative to consumption context. Studied surfaces get standard bar; scanned surfaces get higher bar with smaller diagrams.

5. **Specify the abstraction level.** State what detail level belongs in visual aids for this surface. "Conceptual level only -- not implementation architecture" is the brainstorm example.

6. **Enforce prose-is-authoritative.** State that when visual aid and prose disagree, prose governs. Cross-skill invariant.

7. **Require post-generation accuracy check.** After generating any visual aid, verify it matches surrounding content -- correct sequence, no missing branches, no merged steps, no omitted participants.

8. **Use TB direction for mermaid, 80-column max for ASCII.** Layout constraints for cross-device compatibility.

9. **Place inline at point of relevance.** Never create a separate "Diagrams" section.

10. **Keep diagrams proportionate.** Every node earns its place. 5-15 nodes typical. Exceed 15 only for genuinely complex content.

---

## Related Issues

- `docs/solutions/skill-design/git-workflow-skills-need-explicit-state-machines-2026-03-27.md` -- related but distinct: covers git-commit-push-pr state machine correctness, not output content quality
- GitHub issue #44 -- mermaid dark mode rendering, relevant when considering diagram styling
- PR #437 -- ce:brainstorm visual aids implementation
- PR #440 -- ce:plan visual aids implementation
- `docs/plans/2026-03-29-003-feat-pr-description-visual-aids-plan.md` -- git-commit-push-pr visual aids plan
