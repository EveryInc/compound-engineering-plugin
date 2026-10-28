---
title: "Pre-fetched evidence dossiers did not improve generator grounding; a read-and-cite rule did (ce-ideate scouts)"
date: 2026-10-28
category: skill-design
module: ce-ideate
problem_type: design_pattern
component: ce-ideate
severity: medium
applies_when:
  - A skill dispatches cheap retrieval subagents to pre-gather quotes or dossiers that later generator subagents cite
  - Deciding whether a grounding or evidence pass earns its extra agents and tokens
  - Generator subagents are given a verification-read budget and a requirement to cite code
  - Grading whether model-written citations actually exist at the cited location
tags:
  - evidence-dossier
  - grounding
  - subagent-dispatch
  - citations
  - skill-eval
  - cost-accounting
  - ce-ideate
related_components:
  - skills/ce-ideate/references/divergent-ideation.md
  - skills/ce-ideate/references/decomposition.md
  - tests/skills/ce-ideate-dispatch-contracts.test.ts
---

# Pre-fetched evidence dossiers did not improve generator grounding; a read-and-cite rule did (ce-ideate scouts)

## Context

`ce-ideate` used to split a repo-mode topic into 3-5 axes and dispatch one extraction-tier "evidence scout" per axis. Each scout wrote a dossier of up to 150 lines of verbatim `file:line` quotes, and the Phase 2 ideation agents read those dossiers and cited them as `direct:` bases. Scouts arrived in PR #924, whose eval checked only that dossiers were written, not whether ideas got better. They added 3-5 agents to a run of about 7.

A blind A/B/C eval tested whether they earned that cost:

- **A:** scouts, as shipped.
- **B:** scouts removed; generators keep the scan gist and their verification-read budget.
- **C:** B plus one citation rule (below).

The eval ran each arm through the skill-eval cell on real subagent dispatch, 3 trials per cell, 48 runs graded: Claude and Codex at default scope on a small area of this repo's installer CLI and a large, unfamiliar repo (Excalidraw collaboration), arms A and B; Claude and Grok at tactical scope on the small area, arms A, B, and C; and Claude arm C at default scope on both repos. Independent graders saw anonymized artifacts and opened every cited location.

## Guidance

**Do not assume a retrieval pass improves what generators produce. Measure it against a no-retrieval arm, and grade the artifact, not the mechanics.**

What the eval showed:

- **Quality did not move.** Wrong citations (misdescribed or not found) were 2 in arm A and 2 in arm B across the 24 default-scope artifacts. Grounded-idea rate, specificity, survivor count, and axis coverage matched within trial variance on every host and both topic sizes. The large, unfamiliar repo did not favor scouts.
- **Cost did.** Scouts took Claude default-scope runs from 7 to 12 subagents (10 under tactical scope) and about 4M to 10-11M tokens, and Grok runs from about $1.4 to $2.5 by its reported cost field. Codex rose from 7 to about 10 agents.
- **The one real difference was a side effect.** Without dossiers, Claude generators at default scope made 1-3 repo reads against a 5-read budget and cited files with no line number. The mean share of citations at the stated line fell to 0.54 and 0.37 on Claude default-scope runs and 0.33 on Grok tactical runs; Claude tactical runs stayed precise. Codex generators read heavily either way and stayed precise. The dossiers were doing the reading the generators skipped.

The fix that kept the benefit without the agents is one sentence in the generators' verification-read rule (`skills/ce-ideate/references/divergent-ideation.md`, "Verification reads"):

> A `direct:` basis must quote a line the agent read itself in this run and cite it as `path:line`, never a guessed citation. The grounding summary orients the agent but is not a citable source: when an idea's evidence comes only from the summary, spend a verification read on the line before citing it.

With it, the at-line share was 0.94-0.99 on every Claude and Grok cell, at arm-B cost.

Two eval-method lessons:

- **Citation formats vary too much for a regex checker.** Bases cited `path:line` and paraphrased, quoted under a file-only cite, or used a "Basis — direct:" heading. A mechanical quote checker produced inconsistent counts; a blind grader that opens each cited range and classifies it (verbatim at location, supported nearby, paraphrase supported, misdescribed, not found) was needed.
- **A "never fewer than N" dispatch rule is not self-enforcing.** Codex dispatched 2 scouts for 3 axes in 2 of 6 runs despite "never fewer scouts than retained axes".

## Why This Matters

A retrieval pass that pre-chews evidence for generators looks like obvious grounding insurance, and its own eval (did the dossiers land?) always passes. The cost is real on every run; the benefit has to be shown against the generators' own reads. Here the generators could do the reading themselves once a rule required it, so the extra agents bought nothing the rule did not.

## When to Apply

- Before adding a scout, researcher, or dossier stage whose output generator subagents cite: run the no-retrieval arm and a "require citations from own reads" arm first.
- When a skill that dropped such a stage starts producing file-only or summary-sourced citations: the read-and-cite rule is the first fix, not restoring the stage.
- Not shown here: tactical runs on a large repo whose prompt names no files, and the `go deep` and issue-tracker paths. Those extend the result by inference.

## Examples

Before (arm A), Phase 1.5 dispatched per-axis scouts:

```text
dispatch one extraction-tier sub-agent per axis (max 5) ... Write an evidence dossier
to {scratch-dir}/evidence-{axis-slug}.md: at most 150 lines of verbatim quotes ...
```

After, `skills/ce-ideate/references/decomposition.md` makes the axis pass "a single orchestrator-side pass ... no user-facing question, and no dispatch", and the contract test pins its no-dispatch clause and the read-and-cite rule (`tests/skills/ce-ideate-dispatch-contracts.test.ts`).

Citation shape the rule produces versus the one it prevents:

```text
direct: `src/commands/cleanup.ts:601-602` awaits the backup mover and returns 1   <- located
direct: `src/commands/cleanup.ts` OpenCode loop: `moved += await moveIfExists(...)` <- file-only
```

## Related

- `docs/solutions/skill-design/benchmark-review-peer-model-and-reasoning-tier.md` — grading a peer by what it catches, not what it asserts.
- `docs/solutions/skill-design/grading-live-delegation-evals-from-host-session-logs.md` — the ce-ideate live-delegation grading method this eval extended with per-citation checks.
- `docs/solutions/skill-design/paired-old-vs-new-injection-skill-evals.md` — paired pre/post eval design; a retrieval stage that changes nothing at the current tier is its no-op case.
- `docs/solutions/skill-design/portable-agent-skill-authoring.md` — the reasons a subagent dispatch must earn.
- Plan with the eval results: `docs/plans/2026-10-28-1016-fix-ce-ideate-drop-evidence-scouts-plan.md`.
