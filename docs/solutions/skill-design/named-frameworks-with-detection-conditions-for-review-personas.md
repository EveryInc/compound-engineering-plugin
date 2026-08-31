---
title: Attach named canonical frameworks to detection conditions in review personas; never anchor on authors
date: 2026-08-30
category: skill-design
module: ce-code-review reviewer personas
problem_type: design_pattern
component: development_workflow
severity: medium
applies_when:
  - "Designing or tuning reviewer/checker persona prompts that detect quality issues"
  - "Deciding whether to cite a canonical framework (OWASP, Fowler smells, Release It!) in a detection check"
  - "Tempted to anchor a persona on a named author ('review as Martin Fowler')"
  - "Choosing which code smells an LLM reviewer should and should not attempt"
tags: [skill-design, ce-code-review, reviewer-personas, prompt-design, code-smells, detection-conditions, llm-evaluation]
---

# Attach named canonical frameworks to detection conditions in review personas; never anchor on authors

## Context

While evaluating `skills/ce-code-review`'s reviewer personas, we asked whether naming canonical frameworks (Fowler smells, Ousterhout red flags, OWASP/CWE, Beck's test desiderata) in persona prompts would improve findings — or just add jargon. Instead of adopting name-for-name's-sake, we researched the LLM code-review literature first, then applied only what the evidence supports:

- arXiv 2601.09873, "Beyond Strict Rules: LLMs for Code Smell Detection" (2026): LLMs detect metric-shaped smells well (Large Class, Long Method, Data Class: F1 0.80–0.89) but fail on cross-file semantic smells — Refused Bequest F1 < 0.40 for every model tested, Shotgun Surgery F1 0.57–0.63 — and combined strategies increased false positives on complex smells.
- The same literature plus an SLR (ScienceDirect S095058492500299X): detailed smell-specific prompts with a named concept and guiding detection questions significantly beat generic "find quality issues" prompts. But the studies confound the name with the supplied definition, so the working rule is: name the concept AND state its detection condition. The name buys shared vocabulary and training-data calibration; the condition buys precision and decides whether the finding fires.
- Persona-prompting research (PRISM, arXiv 2603.18507; "Principled Personas") is mixed-to-negative: near-zero benefit and unpredictable accuracy drops. Named frameworks help; named people do not. Never "review as Martin Fowler".
- LLM-era practitioner consensus (Greptile, Graphite): false-positive noise, not recall, is the failure mode of AI review. A framework is adopted only where each principle can be stated as a diff-detectable condition with an evidence guard.

## Guidance

When authoring or revising a reviewer persona, attach canonical framework names to detection checks under these rules:

1. **Name + condition, never name alone.** Each check carries the canonical name in the finding-title vocabulary, but a stated, diff-detectable condition decides whether it fires. The policy line pattern (`skills/ce-code-review/references/personas/maintainability-reviewer.md`): "the name calibrates the finding against a shared vocabulary, but the stated detection condition, not the name, decides whether it fires." Security uses the same shape with "the traced attack path, not the identifier" (`security-reviewer.md`); reliability with "the missing protection you can point to, not the name" (`reliability-reviewer.md`).
2. **Adopt only smells the model class detects well.** The Data locality section in `maintainability-reviewer.md` is limited to four well-detected Fowler smells — Feature Envy, Data Clumps, Primitive Obsession, Repeated Switches — each with a concrete diff-shaped condition and fix. Refused Bequest and Shotgun Surgery are deliberately excluded per the F1 evidence: they require cross-file semantic reasoning LLMs measurably fail at.
3. **Add an evidence guard against false positives.** A data-locality finding anchors at confidence 75 only when the reviewer "can quote every occurrence of the repeated or misplaced shape" (`maintainability-reviewer.md`, anchor guidance).
4. **Frameworks, not people.** Cite Ousterhout's red flags, Fowler's smells, OWASP A0x + CWE identifiers, Beck's test desiderata (`testing-reviewer.md`), Nygard's Release It! vocabulary (`reliability-reviewer.md`), Hyrum's Law and SemVer (`api-contract-reviewer.md`), expand/contract (`data-migration-reviewer.md`), Google's code-review bar (`action-class-rubric.md`). Never instruct the model to role-play the author.
5. **Adopting a framework forces a coverage audit.** Walk every principle in the adopted framework and classify each absence as justified (not diff-detectable, owned by another persona, linter/scanner territory, measured LLM failure mode) or an omission to fix. This audit found four real gaps that became checks: cryptographic failures (OWASP A02) and disabled-protection-in-prod (narrowed to diffs that turn a protection off) in `security-reviewer.md`, resource leaks on error paths in `reliability-reviewer.md`, and comment-repeats-code in `maintainability-reviewer.md`.
6. **Keep research numbers out of skill prose.** The F1 scores, arXiv identifiers, and study citations live in this solutions doc; the personas carry only the names and detection conditions. Skill prose must not carry unresolvable external references the reading agent cannot check. (auto memory [claude])

## Why This Matters

- Generic "find quality issues" prompts measurably underperform smell-specific prompts with named concepts and guiding conditions — the naming convention is a real precision/recall lever, not decoration.
- The condition-decides rule directly counters the dominant failure mode of AI review (false-positive noise): a name alone invites pattern-matching on vibes; a condition plus evidence guard makes each finding falsifiable.
- The exclusion rule (skip smells with measured F1 below roughly 0.65) prevents shipping checks that would mostly generate wrong findings.
- The coverage audit converts framework adoption from cargo-culting into a systematic gap-finder — four genuine detection gaps surfaced only because every OWASP/Ousterhout/desiderata principle had to be explained or adopted.

## When to Apply

- Adding or revising any reviewer persona under `skills/ce-code-review/references/personas/`.
- Evaluating a proposed check borrowed from an external review skill or checklist: demand a diff-detectable condition and, where the literature exists, evidence the model class detects it.
- Any skill prose that tempts you to cite a study, benchmark number, or external URL: move the evidence to `docs/solutions/`, keep only the name and condition in the skill.
- Not for role-play personas ("review as <famous engineer>") — the evidence says don't build those at all.

## Examples

Before (pre-redesign shape — a check with no shared vocabulary and no firing condition beyond judgment):

```
- **Thin wrappers** — pass-through helpers or identity abstractions that add indirection without clarity.
```

After (`maintainability-reviewer.md`):

```
- **Thin wrappers** (Ousterhout: *Pass-Through Method*, *Shallow Module*) — pass-through helpers, identity abstractions, or generic "magic" handlers that hide a simple data shape and add indirection without clarity.
```

A new check built to the full convention (`maintainability-reviewer.md`, Data locality):

```
- **Repeated Switches** — this diff adds another branch-set over the same discriminator (enum, type tag, status string) that is already switched on elsewhere, so the next variant requires edits in every copy. Fix: one shared mapping or polymorphic dispatch at the discriminator's owning layer.
```

Name (Fowler's Repeated Switches), diff-scoped condition ("this diff adds another branch-set... already switched on elsewhere"), and a fix at the owning layer — with the confidence anchor requiring every occurrence be quotable.

Validation of the change itself: fresh-agent probes of the edited personas on both Claude and Codex with planted positives and negatives found all planted defects with canonical names and quoted evidence, and produced zero false positives on the negative cases.

## Related

- [portable-agent-skill-authoring.md](portable-agent-skill-authoring.md) — the skill-authoring standard this convention supplements (state conditions, trust agent intelligence).
- [confidence-anchored-scoring.md](confidence-anchored-scoring.md) — same failure mode (noise from under-specified personas), solved with anchored rubrics; the evidence guards here plug into those anchors.
- [ce-doc-review-calibration-patterns.md](ce-doc-review-calibration-patterns.md) — persona calibration for doc review; complementary module.
- [safe-auto-rubric-calibration.md](safe-auto-rubric-calibration.md) — ce-code-review rubric tightening for autofix classification.
