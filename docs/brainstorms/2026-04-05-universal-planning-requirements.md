---
date: 2026-04-05
topic: universal-planning
---

# Universal Planning: Non-Software Task Support for ce:plan and ce:brainstorm

## Problem Frame

Users naturally reach for `/ce:plan` to plan any multi-step task — trip itineraries, study plans, content strategies, research workflows. Currently, the model self-gates and refuses non-software tasks because ce:plan's language is heavily software-centric ("implementation units", "test scenarios", "repo patterns"). This forces users back to unstructured prompting for non-software work, losing the structured thinking that makes ce:plan valuable.

The structured thinking behind ce:plan — breaking down ambiguity, researching context, sequencing steps, identifying dependencies — is domain-agnostic. The skill's value proposition should not be limited to software.

**Why a conditional path instead of just softening language:** Softening the self-gating language in SKILL.md would be cheaper and might stop the refusal. But the value of ce:plan for non-software tasks comes from the structured workflow — ambiguity assessment, research orchestration, quality-guided output, and a durable plan file. Without the non-software path, the model would attempt to follow software-specific phases (repo research, implementation units, test scenarios) on a non-software task, producing a worse result than a direct prompt. The conditional path lets non-software tasks benefit from structured thinking without fighting software-specific structure.

See: [GitHub issue #517](https://github.com/EveryInc/compound-engineering-plugin/issues/517)

## Requirements

**Skill Description and Trigger Language**

- R1. ce:plan's YAML `description` and trigger phrases are updated to include non-software planning. The model reads this description when deciding which skill to invoke — if triggers only mention software concepts, the internal detection logic never fires. Example: *"Create structured plans for any multi-step task — software features, research workflows, events, study plans, or any goal that benefits from structured breakdown."*

**Detection and Routing**

- R2. ce:plan detects whether a task is software-related or not early in Phase 0, before searching for requirements docs or launching software-specific research agents
- R3. Detection error policy: false positives (software task routed to non-software path) are worse than false negatives (non-software task staying on software path), because a false positive skips repo research and produces a disconnected plan. When detection is ambiguous, ask the user rather than guessing. Default to software path when uncertain.
- R4. ce:brainstorm: verify whether it actually self-gates on non-software tasks. If it doesn't (its description is already domain-agnostic), no changes needed — its existing Phase 4 handoff to ce:plan already works. If it does self-gate, soften the gating language so it stops refusing. ce:plan owns the non-software planning path; ce:brainstorm only needs to not block the flow.

**Non-Software Planning Path in ce:plan (Core — Phase 1)**

- R5. When a non-software task is detected, ce:plan skips Phases 0.2-0.5 and Phase 1 (all software-specific) and loads a reference file (`references/universal-planning.md`) containing the alternative workflow. Existing Phase 5.2 (Write Plan File) and Phase 5.4 (Handoff options) are reusable; Phase 5.3 (Confidence Check with software-specific agents) is not.
- R6. The non-software path assesses ambiguity: is the request clear enough to plan directly, or does it need clarification first?
- R7. When clarification is needed, the non-software path runs focused Q&A inline — up to 3 questions as a guideline, not a hard cap — targeting the most impactful clarifying questions. Stop when remaining ambiguity is acceptable to defer to plan execution.
- R8. The plan output is guided by quality principles (what makes a great plan), not a prescribed template. The model decides the format based on the task domain

**Non-Software Planning Path (Extensions — Phase 2, after core validation)**

- R9. The non-software path can invoke web search directly (no new MCP integrations or research subsystems) when the task benefits from external context. The main skill collates findings inline.
- R10. The non-software path can still interact with local files when the task involves them (e.g., "read these materials and create a study plan")

**Token Cost Management**

- R11. The non-software path lives entirely in reference files loaded conditionally via backtick paths. Main SKILL.md changes are minimal — detection stub only
- R12. The software planning path remains completely unchanged — negligible token cost increase for software-only users (detection stub only)

## Success Criteria

- `/ce:plan a 3 day trip to Disney World with 2 kids ages 11 and 13` produces a thoughtful, structured plan instead of refusing
- `/ce:plan look at the materials in this folder and create a study plan` reads local files and produces a study plan
- `/ce:brainstorm plan my team offsite` produces a structured plan (verify — may already work without changes)
- `/ce:plan plan the database migration to support multi-tenancy` routes to the software path (boundary case — software despite "plan" and "migration")
- `/ce:plan plan our team's migration to the new office` routes to the non-software path (boundary case — non-software despite "migration")
- Software tasks continue to work identically — no regression
- Non-software detection adds negligible tokens to the software path

## Scope Boundaries

- Not building domain-specific planning templates (travel, education, etc.) — the model adapts format to domain
- Not changing the software planning path in ce:plan at all
- Not adding non-software support to ce:work or other downstream skills — those remain software-focused
- Not adding MCP integrations or domain-specific research tools — use existing web research capabilities
- Pipeline mode (LFG/SLFG): non-software tasks are not supported. Detection should short-circuit the pipeline gracefully rather than producing a plan that ce:work cannot execute. The short-circuit contract (what ce:plan returns, how LFG's retry gate handles it) is deferred to planning.

## Key Decisions

- **ce:plan owns universal planning, not ce:brainstorm**: The durable output is a plan file. Brainstorming Q&A is a means to an end, not a separate non-software workflow. ce:plan does its own focused Q&A when needed.
- **No prescribed template for non-software outputs**: Impossible to anticipate all domains. Quality principles guide the model; format is emergent.
- **Reference file extraction**: Non-software path in `references/universal-planning.md` keeps token costs down and avoids bloating the main skill for software users.
- **Default to software when uncertain**: False positives (software → non-software) are costlier than false negatives (non-software → software). When ambiguous, ask the user.
- **Non-software plan file location is user-chosen.** Before writing, prompt the user with options: (a) `docs/plans/` if it exists, (b) current working directory, (c) `/tmp`, or (d) a path they specify. Frontmatter omits software-specific fields (`type: feat|fix|refactor`). Filename convention (`YYYY-MM-DD-<descriptive-name>-plan.md`) applies regardless of location.
- **Incremental delivery**: Core path (R5-R8) first — detection, ambiguity assessment, quality-guided output. Extensions (R9-R10) — research orchestration, local file interaction — added after core validation.

## Outstanding Questions

### Deferred to Planning

- [Affects R2][Technical] What heuristics should the detection use? Likely a combination of: does the request reference code/repos/files in a software context, specific programming languages, software concepts? Needs to handle ambiguous cases like "plan a migration" (could be data migration or office migration). Error policy (R3) constrains the design: default to software, ask when uncertain.
- [Affects R8][Technical] What output quality principles produce the best non-software plans? Define these directly during planning — principles like specificity, sequencing, resource identification, contingency planning — rather than running a separate research effort.
- [Affects R9][Technical] Which research mechanisms work best for non-software tasks? WebSearch/WebFetch directly, or best-practices-researcher adapted for non-software topics? Defer until core path is validated.
- [Affects R4][Technical] Does ce:brainstorm actually self-gate on non-software tasks? Verify before building detection there. Its description appears domain-agnostic — changes may be unnecessary. Note: even if it doesn't self-gate, its Phase 1.1 repo scan would waste tokens finding nothing on a non-software task. Decide whether that's acceptable or needs a skip.
- [Affects R5][Technical] Non-software plan file location: prompt the user with options (docs/plans/ if it exists, CWD, /tmp, or custom path). Only show docs/plans/ option when the directory exists.
- [Affects pipeline][Technical] LFG/SLFG short-circuit contract: does ce:plan write a stub file, return an error, or produce no file? LFG has a hard gate that retries if no plan file exists — the contract must satisfy or bypass that gate.

## Next Steps

-> `/ce:plan` for structured implementation planning
