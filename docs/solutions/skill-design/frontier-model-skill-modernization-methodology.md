---
title: Frontier-model skill modernization methodology
date: 2026-06-10
category: skill-design
module: compound-engineering
problem_type: design_pattern
component: development_workflow
severity: medium
applies_when:
  - "Reviewing or modernizing an existing skill against current frontier-model prompting guidance"
  - "Deciding whether to compress enumerated judgment examples or keep protocol text verbatim in SKILL.md"
  - "Designing model-tier vocabulary and degradation rules for sub-agent fleets"
  - "Extracting load-bearing skill content into reference files with inline load stubs"
  - "Verifying skill prose changes with injected-subagent evals instead of cached plugin dispatch"
tags:
  - skill-design
  - prompting-guidance
  - frontier-models
  - model-tiers
  - context-window
  - reference-extraction
  - load-reliability
  - subagent-evals
---

# Frontier-Model Skill Modernization Methodology

## Context

We modernized the `ce-ideate` skill (a ~13-agent ideation orchestrator) against the Claude Fable 5 prompting guide and the Claude prompting best-practices doc, then verified the result with a transcript-graded eval. The review surfaced a repeatable methodology for bringing any orchestration-heavy skill up to frontier-model standards: the skill went from 424 to 372 lines (-12%) while *gaining* capability (model tiering, file-based data flow, ceiling-raising dispatch mechanics), and the eval passed 6/8 mechanical assertions with 0 failures. This doc generalizes that sequence so the next skill review (ce-plan, ce-brainstorm, ce-code-review, ...) starts from the playbook instead of rediscovering it.

---

## Guidance

Run the steps in order. Each has a named test or rule — apply the test, don't improvise the judgment.

### 1. Audit: classify every prescriptive block as PROTOCOL or JUDGMENT

Read the skill top to bottom and tag each instruction block:

- **PROTOCOL** — *what to do*: output-format resolution order, cache file shapes, scratch paths, read budgets, agent counts, checkpoint mechanics. Unambiguous, costs a strong model nothing, and the workflow mechanically breaks without it. **Keep at full prescription.** (`git-workflow-skills-need-explicit-state-machines.md` is the canonical example of protocol content that regressed whenever it was softened to prose.)
- **JUDGMENT** — *how to think*: enumerated example lists, multi-row sample classification tables, multi-paragraph elaborations of a single principle. A frontier model already has the capability; the prescription only narrows it. **Candidate for compression.**

The test: *would a strong model behave correctly given only the principle?* If yes, it's JUDGMENT. If the skill produces wrong file paths, wrong agent counts, or broken handoffs without it, it's PROTOCOL.

This refines (not replaces) the three-level prescription model in the plugin's AGENTS.md Skill Design Principles — hard rules / strong guidance / trust. Protocol maps to hard rules; the protocol-vs-judgment test decides which of the other two levels a block deserves.

### 2. Establish the orchestrator-model floor before cutting anything

Pruning JUDGMENT prescription is only safe if the skill realistically runs on frontier models. State the floor argument explicitly in your review notes. For ce-ideate: anyone launching a 13-agent workflow on any platform picks a frontier model, so the floor holds. If a skill plausibly runs on small models (e.g., a lightweight formatting skill), keep more scaffolding. The Fable guide's warning is the anchor: "Skills developed for prior models are often too prescriptive for Claude Fable 5 and can degrade output quality."

### 3. Prune: compress each JUDGMENT block to principle + ONE contrast pair

The compression rule: replace the enumeration with the underlying principle and a single minimal contrast pair that makes the boundary unmistakable. Example from ce-ideate: a list of vague-phrase examples became "`browser sniff` is identifiable, `quick wins` is not — vagueness is about referent, not length." One pair carries the distinction; seven rows of table did not carry more. Also deduplicate: triplicated boilerplate becomes one full copy + pointers. This matches the broader principle: prefer principles + a named test over enumerated specifics — specifics drift. (auto memory [claude])

### 4. Tier: define cost tiers semantically, once, and reference by name

Define three tiers in one place in SKILL.md; everywhere else refers to the tier name, never a model name:

- **Extraction tier** — cheapest capable model. Scouts, retrieval, quoting.
- **Generation tier** — mid-tier model. Evidence-driven generation, mechanical verification.
- **Ceiling tier** — *inherit the orchestrator's model by omitting the model parameter*. Never name a model for the ceiling.

Rules that travel with the tiers:

- Per-platform model hints follow the plugin's existing platform-enumeration pattern (the same shape used for blocking-question tools); never pin other vendors' model names in pass-through skill content — naming drifts faster than release cadence. Note: the converter does propagate `model:` params to all targets (see `best-practices/ce-pipeline-end-to-end-learnings.md`), so tier hints are not Claude-only decoration.
- **Degradation rule**: when the platform's subagent primitive lacks per-agent model selection, dispatch everything on the inherited model and keep read budgets/output caps — cost control comes from structure, not tiering. Write this rule into the skill; it fired correctly in our eval (the harness had no nested dispatch).
- **Architecture principle**: separate evidence-gathering (cheap extraction scouts producing quote+pointer dossiers) from ceiling reasoning (strong model only at choke points: ceiling framing, cross-cutting synthesis, final arbitration). This is cheaper *and* better grounded than a uniform fleet fed a thin summary.

### 5. Optimize context: extract only conditional/late content, and move bulk data to files

Two independent levers:

- **Reference extraction pays only for CONDITIONAL or LATE-SEQUENCE content.** Early unconditional content gains nothing — it would be read at start and carried anyway, plus a read round-trip. The test: *how many turns of other work happen before this content executes, and might it never execute?* ce-ideate's Phase 2 (~100 lines, ~22% of the file, runs after 5-8 turns of grounding) qualified; Phase 0 gating did not.
- **Data flows usually dominate prose.** Measure both: 5 scouts × 150-line dossiers ≈ 10k tokens carried every subsequent turn if returned inline — more than the entire SKILL.md (~6k). Fix: subagents write outputs to scratch files (`/tmp/compound-engineering/<skill>/<run-id>/...`), return a 3-5-line gist; downstream agents receive paths and read the files themselves. This extends the established path-passing pattern (`skill-design/pass-paths-not-content-to-subagents.md`) with the gist refinement: the orchestrator keeps just enough orientation to route, never the bulk.

### 6. Load-stub design: make extracted references information-asymmetric

A soft pointer ("see references/X.md for details") gets skipped. When extracting load-bearing content, the inline stub must satisfy all five properties:

1. **Load-instruction-only** — no spec, no contract, nothing to improvise from. Converts "should load" into "cannot proceed without loading."
2. **Names exactly what the reference contains** and states those details appear nowhere in the main body.
3. **Names the failure mode of skipping** in the skill's own terms (e.g., "improvising produces unverifiable candidates — the precise failure this skill exists to prevent").
4. **Closes inline-information leaks** — any number or detail that remains inline for other reasons gets explicitly disclaimed ("the fleet counts in Phase 0.6 are cost transparency, not the dispatch spec").
5. **Pre-empts rationalizations** ("'Quickly' means smaller volume targets, not skipping the reference").

Defense in depth: anchor downstream phases on *different* reference files (rejection criteria, section contract) so a skipped load fails visibly, not silently.

This is the complement of `skill-design/post-menu-routing-belongs-inline.md`: inline the content when it is always-on; use an information-asymmetric stub when it is genuinely conditional or late-sequence but must load when its branch fires.

### 7. Eval verification: fresh subagent, mechanical transcript grading

- **Bypass the cache.** Plugin skill/agent definitions cache at session start; typed invocation tests the stale copy. Instead, spawn a fresh subagent told to read the skill source from disk and follow it.
- **Grade from the transcript, not the self-report.** Parse the JSONL into a tool-call timeline and assert mechanically: Read-event ordering against generation checkpoints (e.g., the extracted-reference Read landing after scout writes and before the candidates checkpoint); zero orchestrator Reads of bulk data files; filesystem artifacts present with correct names and the full section contract.
- **Know the harness limits and record them.** An eval subagent without nested dispatch *cannot* verify dispatch payload shape or fleet tiering — mark those assertions "not testable," don't fudge them. It *does* verify load ordering, file contracts, volume/format overrides, and degradation-rule behavior. Closing the gap requires a main-session run.
- Errors encountered while following the skill during the eval are findings about the skill, not noise. (auto memory [claude])

### 8. Ceiling mechanics: explicitly request above-and-beyond behavior in dispatches

Floor-guarding (basis requirements, rejection criteria) prevents bad output; it does not produce ambitious output. From the best-practices doc:

- **Ambition charter**, included verbatim in every generation dispatch: intent framing (why the output matters), warm-up framing ("your first few ideas are warm-up; keep only those that earn their place after the non-obvious ones exist"), and an anti-genericness test ("if it would appear in a generic listicle, sharpen or drop").
- **Fresh-context verifiers over self-critique** (per the Fable guide): the orchestrator grading its own synthesis is anchored; a verifier that never saw generation, prompted to *refute*, is not.
- **Dispatch payload structure**: XML tags (`<grounding> <constraints> <background> <task>`); longform shared material first, task last (documented long-context gain); byte-identical shared prefix across parallel dispatches for prompt-cache reuse; constraint-vs-background made mechanical by tags rather than prose.

---

## Why This Matters

Skills written for prior model generations accumulate two opposite debts simultaneously: too much JUDGMENT prescription (which the Fable guide warns actively degrades frontier-model output) and too little PROTOCOL infrastructure for cost, context, and verification. A naive "shorten it" pass cuts the wrong things; a naive "harden it" pass bloats the wrong things. The PROTOCOL/JUDGMENT split plus the ordered sequence resolves the tension: prune where the model is strong, prescribe where the workflow is mechanical.

Measured outcomes from the ce-ideate application:

- SKILL.md: 424 → 372 lines (-12%) while adding model tiering, file-based dossier flow, the information-asymmetric stub, and the ambition charter. ~16 lines recovered from three judgment-prescription cuts alone, with no behavior loss in the verification run.
- Context math: inlined dossiers would have cost ~10k tokens carried every turn — more than the whole SKILL.md (~6k). The file+gist pattern removed that entirely from the orchestrator's window.
- Eval: 6/8 mechanical assertions passed, 2 correctly reported untestable (nested-dispatch assertions in a dispatch-less harness), 0 failures. The degradation rule fired as designed. Degraded inline run: 14 minutes, 208k tokens.
- Cost architecture: cheap extraction scouts feeding quote+pointer dossiers to ceiling-tier choke points was both cheaper and better grounded than a uniform inherited-model fleet fed a thin summary.

---

## When to Apply

Run this sequence when reviewing a skill that matches one or more of:

- **Multi-agent orchestration skills** — anything dispatching subagent fleets (the tiering, file-flow, and dispatch-payload steps only matter here).
- **Skills over ~300 lines** — large enough that conditional/late-sequence extraction and judgment pruning have measurable payoff.
- **Skills written before frontier models** (or before the current Fable guide) — likely over-prescribed on judgment, under-built on protocol.
- **Skills inlining bulk data into dispatch prompts or return values** — any place subagent output re-enters the orchestrator's window as content rather than a path.
- **Skills with soft "see reference" pointers guarding load-bearing content** — apply step 6 even without the rest.

Skip or scale down when: the skill is short and unconditional (extraction won't pay), or it plausibly runs on non-frontier models (the step-2 floor fails — keep the scaffolding). Always pair structural changes with the step-7 eval; never ship on the agent's self-report.

---

## Examples

**1. Judgment enumeration → principle + one contrast pair**

Before (enumerated list of vague phrases plus a 7-row sample classification table):

```
Vague subjects include: "quick wins", "low-hanging fruit", "improvements",
"polish", "cleanup", "things to fix", ...
[+ 7-row table classifying sample subjects as vague/identifiable]
```

After:

```
A subject is workable when it names an identifiable referent:
`browser sniff` is identifiable, `quick wins` is not — vagueness is
about referent, not length.
```

**2. Inline bulk data → file + gist**

Before (scout returns its full dossier; orchestrator carries it forever):

```
Return your complete evidence dossier (~150 lines of quotes + pointers)
in your final message.
```

After:

```
Write your dossier to /tmp/compound-engineering/<skill>/<run-id>/evidence-<axis-slug>.md.
Return only a 3-5 line gist plus the file path. Downstream agents read
the file themselves; the orchestrator never does.
```

**3. Soft pointer → information-asymmetric stub**

Before:

```
Phase 2: Divergent ideation. See references/divergent-ideation.md for details
on the fleet structure. Dispatch the agents and collect candidates.
```

After:

```
Phase 2: Read references/divergent-ideation.md now. It contains the fleet
spec, per-agent dispatch contract, and volume targets — none of which appear
in this main body. Dispatch prompts cannot be correctly constructed without
it; improvising them produces unverifiable candidates — the precise failure
this skill exists to prevent. The fleet counts in Phase 0.6 are cost
transparency, not the dispatch spec. "Quickly" means smaller volume targets,
not skipping the reference.
```

The before version leaves enough inline (phase name, "dispatch the agents") to improvise from; the after version makes proceeding without the read impossible, names the skip-failure, closes the leak, and pre-empts the "we're in a hurry" rationalization.

---

## Related

- `docs/solutions/skill-design/pass-paths-not-content-to-subagents.md` — established precedent for path-passing to subagents; step 5 extends it with the gist refinement.
- `docs/solutions/skill-design/post-menu-routing-belongs-inline.md` — the complementary lever for the same load-reliability failure: inline always-on content; load-stub conditional content (step 6).
- `docs/solutions/skill-design/git-workflow-skills-need-explicit-state-machines.md` — canonical example of PROTOCOL content that must keep full prescription (step 1).
- `docs/solutions/skill-design/script-first-skill-architecture.md` — complementary token-optimization pattern (bundled scripts instead of model-context work).
- `docs/solutions/skill-design/safe-auto-rubric-calibration.md` — earlier eval-methodology precedent (fixture-based grading, variance awareness) consistent with step 7.
- `docs/solutions/skill-design/paired-old-vs-new-injection-skill-evals.md` — sharpens step 7's fresh-subagent grading into a controlled old-vs-new blind A/B that separates demonstrated improvement from no-regression.
- `docs/solutions/best-practices/ce-pipeline-end-to-end-learnings.md` — evidence that `model:` params propagate to all conversion targets (step 4).
- Plugin `AGENTS.md` → Skill Design Principles — the prescription-calibration framework this methodology refines; and the conditional/late-sequence extraction rule step 5 operationalizes.
- GitHub issues #714 and #374 — historical reference-load failures in the same family step 6 addresses.
