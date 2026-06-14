# Deepening Workflow

Confidence-check execution path (5.3.3-5.3.7). Load when deepening is warranted.

## 5.3.3 Score Confidence Gaps

Per section: trigger count + risk bonus (1 if high-risk) + critical bonus (1 for KTDs/Units/System-Wide/Risks/Open Questions in Standard/Deep). **Candidate if:** 2+ points or 1+ in high-risk. Top 2-5 sections (1-2 lightweight).

**Checklists:** Requirements (vague/disconnected, missing success criteria, origin IDs lost). Context (learnings don't shape plan, generic). KTDs (no rationale, missing tradeoffs, fork unaddressed). Open Questions (hidden assumptions, deferred-too-vague). HTD present (wrong medium, impl code, no connection). HTD absent Standard/Deep (DSL/API/complex flow benefits from visual). Implementation Units (unclear deps, missing paths, too large/vague, thin tests, U-IDs renumbered, missing F/AE citations). System-Wide Impact (missing interfaces, underexplored failure, absent state risks). Risks (no mitigation, missing rollout).

## 5.3.4 Report and Dispatch Research

Report sections being strengthened. Use `spawn_agent` with `ce-<name>` names. Max 1-3 agents per section, 8 total.

**Section-to-Agent:**

- **Requirements/OQs:** `ce-spec-flow-analyzer`, `ce-repo-research-analyst`
- **Context/Research:** `ce-learnings-researcher`, `ce-framework-docs-researcher`, `ce-best-practices-researcher`, `ce-web-researcher`, `ce-git-history-analyzer` (if historical rationale missing)
- **KTDs:** `ce-architecture-strategist`; add researchers if external grounding needed
- **HTD:** `ce-architecture-strategist`, `ce-repo-research-analyst`; add `ce-best-practices-researcher` for DSL/API
- **Implementation Units:** `ce-repo-research-analyst`, `ce-pattern-recognition-specialist`; add `ce-spec-flow-analyzer` if sequencing depends on flow
- **System-Wide Impact:** `ce-architecture-strategist` + risk-specific (`ce-performance-oracle`, `ce-security-sentinel`, `ce-data-integrity-guardian`)
- **Risks:** matching specialist

**Agent prompt:** scope, plan summary, section text, why selected (which checklist triggers), depth/risk, specific question. Returns: findings improving rationale/sequencing/verification/risk. No code/shell commands.

## 5.3.5 Choose Execution Mode

- **Direct (default):** parent reads inline. Small sets.
- **Artifact-backed:** agents write to scratch dir, return summary. For 5+ agents or high-risk.

Scratch: `mktemp -d -t ce-plan-deepen-XXXXXX`. Pass absolute path.

## 5.3.6 Run Research

Launch in parallel. Prefer local/repo evidence. Re-read origin doc before external dispatch.

**Direct:** agents return strongest findings. **Artifact-backed:** write compact files (section, why selected, 3-7 findings, rationale, plan change). Conflicts: prefer repo/origin-grounded over generic; official docs over secondaries. Record real tradeoffs.

## 5.3.6b Interactive Finding Review

Skip in auto mode. Per agent: present findings, user accepts/rejects/discusses (discuss → brief dialogue → re-ask accept/reject). Carry only accepted findings.

## 5.3.7 Synthesize and Update

Strengthen selected sections. May tighten (cut hedges, split sentences, remove superseded) and grow.

**Allowed:** tighten prose, clarify rationale, reorder/split units (never renumber U-IDs), add missing refs/paths, expand risks, update `deepened:`. **Not allowed:** impl code, git commands, "Research Insights" sections, full rewrite, invented requirements, renumbering U-IDs.

Product ambiguity → Open Questions, recommend `/ce-brainstorm`.
