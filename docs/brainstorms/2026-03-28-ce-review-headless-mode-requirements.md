---
date: 2026-03-28
topic: ce-review-headless-mode
---

# ce:review Headless Mode

## Problem Frame

ce:review currently has three modes (interactive, autofix, report-only), but all assume some level of direct user interaction or have mode-specific behaviors that don't fit programmatic callers. When another skill needs code review results as structured input, there's no way to invoke ce:review without it trying to prompt a user or applying fixes with interactive-session assumptions.

document-review solved this same problem in PR #425 with a `mode:headless` pattern. ce:review needs the same capability so it can be used as a utility skill by other workflows.

## Requirements

**Argument Parsing**
- R1. Add `mode:headless` argument, parsed alongside existing mode flags

**Runtime Behavior**
- R2. In headless mode, apply `safe_auto` fixes silently (matching autofix behavior)
- R4. No `AskUserQuestion` or other interactive prompts in headless mode
- R5. End with a clear completion signal so callers can detect when the review is done

**Output Format**
- R3. Return all non-auto findings (`gated_auto`, `manual`, `advisory`) as structured text output, preserving their original classifications (severity, autofix_class, owner, confidence, evidence[], pre_existing)
- R6. Follow document-review's structural output pattern (same envelope format, same section headings, similar parsing heuristics) while adapting per-finding fields to ce:review's own schema

## Success Criteria

- Another skill can invoke ce:review with `mode:headless`, receive structured findings, and act on them without any user interaction
- Output envelope (section headings, severity grouping, completion signal) is structurally consistent with document-review's headless output so callers can use a similar consumption pattern for both, while per-finding fields reflect ce:review's own schema

## Scope Boundaries

- Not changing the existing three modes (interactive, autofix, report-only)
- Not adding new reviewer personas or changing the review pipeline itself
- Not building a specific caller workflow in this change — just enabling the capability

## Key Decisions

- **Apply safe_auto fixes in headless**: Matches document-review's pattern where auto-fixes are applied silently and everything else is returned for the caller to handle
- **Structural consistency with document-review, not schema compatibility**: Same envelope and section headings, but per-finding fields use ce:review's own schema (which has different autofix_class values, owner, pre_existing, etc.). Callers will need skill-aware parsing for individual findings

## Outstanding Questions

### Deferred to Planning

- [Affects R3][Technical] Exact structured output format — should it mirror document-review's text format verbatim, or adapt to ce:review's richer findings schema (which includes fields like `autofix_class`, `evidence[]`, `pre_existing` that document-review doesn't have)?
- [Affects R1][Technical] How `mode:headless` interacts with the existing mode parsing — is it a fourth mode, or an overlay that modifies report-only/autofix behavior?
- [Affects R5][Technical] What the completion signal looks like — "Review complete (headless mode)" text, or a more structured envelope?
- [Affects R2][Technical] Should headless mode write run artifacts (`.context/compound-engineering/ce-review/<run-id>/`) and create durable todo files like autofix, or suppress them like report-only?
- [Affects R1][Technical] How should headless mode handle checkout/branch switching in Stage 1? Programmatic callers may need the checkout to stay stable (like report-only) even though headless applies fixes (like autofix).
- [Affects R1][Technical] Error behavior when headless receives conflicting mode flags (e.g., `mode:headless` + existing mode flags) or missing diff scope (no changes, no PR).
- [Affects R2][Technical] Should headless mode support bounded re-review rounds (max_rounds: 2) like autofix, or be single-pass?

## Next Steps

-> `/ce:plan` for structured implementation planning
