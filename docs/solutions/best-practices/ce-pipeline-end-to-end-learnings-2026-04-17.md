---
title: "End-to-end learnings from running the full CE pipeline on a substantial feature"
date: 2026-04-17
category: best-practices
module: plugins/compound-engineering
problem_type: best_practice
component: development_workflow
severity: medium
applies_when:
  - Running ce:brainstorm → ce:plan → ce:work → ce:review on any non-trivial feature (more than ~1 unit of implementation work)
  - Orchestrating the full compound-engineering pipeline end-to-end in a single session
  - Deciding when to insert document-review passes between pipeline stages
  - Any feature that introduces a new user-facing flow, especially bulk actions or single-keystroke commitments
  - Any time a research agent returns a confident architectural recommendation that would add a stage, schema field, or module
tags: [compound-engineering, ce-pipeline, ce-brainstorm, ce-plan, ce-work, ce-review, document-review, workflow, hitl, pipeline-discipline]
---

# End-to-end learnings from running the full CE pipeline on a substantial feature

## Context

The compound-engineering pipeline is designed as a sequence of progressively more expensive stages: `ce:brainstorm` → `document-review` → `ce:plan` → `document-review` → `ce:work` → `ce:review` → `resolve-pr-feedback`. Each stage operates on a different artifact (requirements doc, plan doc, diff, PR) and applies a different lens (exploration, critique, execution, synthesis, defense).

It is tempting, on a substantial feature, to collapse this sequence — jump from a rough idea to implementation, or skip document-review because the plan "looks right." A recent session ran the full pipeline end-to-end on a non-trivial feature: redesigning the Interactive mode of `ce:review` with a per-finding walk-through, a compact bulk-action preview, a four-option routing model, and defer-to-tracker integration.

The cross-cutting insight from that run is that **the pipeline itself compounds**. Issues that would have been cheap to fix at brainstorm time became expensive in PR review; issues document-review caught at plan time would have corrupted implementation if they had slipped through. Each stage catches a different class of problem, and each cheaper stage eliminates issues before they become expensive ones downstream. The value of running the pipeline in full isn't process-for-its-own-sake — it is that the stages are not redundant. They find different things.

This document codifies the concrete patterns that surfaced repeatedly so future runs — by humans or agents — inherit the lessons instead of rediscovering them.

---

## Guidance

### 1. Sample actual evidence before accepting research-agent claims

Research agents and sub-agents return confident conclusions. Treat those conclusions as hypotheses, not facts, whenever an architectural decision rides on them. "Did you check?" is the correct response to any recommendation framed as "our analysis shows..." when the downstream cost of being wrong is a new stage, a new schema, or a new module.

The concrete practice:

- When a research agent recommends a structural intervention (new stage, new field, new module), name the specific artifacts the claim is derived from.
- Sample 10-20 real artifacts across the relevant axes.
- Compare what the sampled evidence actually shows to what the research claim asserts.
- Update the intervention to match the evidence, not the claim.

Sampled evidence is often directionally correct but mechanistically wrong — and the mechanism is what determines the fix.

### 2. Run document-review after brainstorm AND after plan

Document-review is not a single gate. It operates differently on requirements (is this the right problem, framed coherently?) than on plans (does this design hold together, and does it contradict its own scope?). Skipping either application is a different failure mode:

- Skipping post-brainstorm doc-review: you plan the wrong thing.
- Skipping post-plan doc-review: you implement a plan with internal contradictions.

Multiple doc-review personas routinely catch architectural contradictions — a unit that adds a schema field the plan's own scope boundary forbade, a feature whose framing undermines its stated goal. These are cheap catches at plan time, expensive in implementation, and nearly unfixable in PR review.

### 3. Treat "trust the agent" UX options as rubber-stamp vectors

Any feature that offers a single-keystroke commit-a-lot action is a rubber-stamping risk, regardless of how well it is labeled. If the redesign's goal is *reducing* rubber-stamping, any such action needs a visible plan the user can inspect before executing.

The pattern:

- Compact preview grouped by action class (Applying / Filing / Skipping).
- Proceed / Cancel gate before execution.
- Preview is cheap to render and hard to misuse.

This is the right surface for *reviewing a pre-computed plan*. It is explicitly the wrong surface for *per-item decisions* — a numbered list with per-item options looks efficient at low volume and collapses working memory at high volume.

### 4. Distinguish bulk-preview ergonomics from per-item walk-through ergonomics

Two different review modalities with different affordances:

| Modality | Good for | Bad for |
|---|---|---|
| Bulk preview grouped by action | Reviewing a pre-computed plan | Making per-item decisions |
| Per-item walk-through | Making per-item decisions | Reviewing dozens of items at once |

Mixing the two — a numbered list with per-row options — feels dense and efficient until volume hits. Then it breaks. Decide which modality each surface is, and commit.

### 5. Treat tool/platform caps as structural constraints

Cross-platform tool limits (e.g., the 4-option cap on `AskUserQuestion`) are not annoyances to route around. They force design decisions. Collapsing a 5-option set into 4 + a follow-up question is architecturally different from a 5-option set. Accept the cap early and design for it; do not fight it in implementation and pay for it later.

### 6. Never conflate two semantic meanings in one flag

Flag names that read sensibly in one callsite can be silently wrong in another. The symptom is a flag whose definition ("is X available?") is consistent, but whose *use* answers two different questions ("can we invoke X?" vs. "should we offer X as an option?"). One flag cannot answer both correctly.

When a flag's meaning depends on the caller, split it (see Example 2 below).

This pattern recurs in the codebase. Prior instances surfaced during the `batch_confirm` collapse in document-review (session history) — a three-tier routing was collapsed to two because the middle tier conflated "high confidence in the fix" with "needs user judgment." And in the signal-word tightening for plan deepening, where "strengthen" / "confidence gaps" as standalone trigger words conflated targeted-edit intent with holistic-deepening intent, producing false positives until tightened to require "deepen" explicitly.

### 7. Contract tests assert structure, not prose

A contract test that pins exact wording becomes a tax on future copy improvements. Every wording refinement breaks the test even though the contract is intact. The philosophy is "regression guard, not authoring ossification."

Assert: file existence, required section headings, required tokens, regex on distinguishing words. Do not assert: sentence-level wording, punctuation, or phrasing that copy editors will legitimately touch. This parallels the structural-evaluation practice used in skill-creator evals, where assertion names map to concrete fields in the output JSON (`overlap_detected`, `update_not_create`) rather than subjective prose judgments.

### 8. Don't cite external plugins or tools in durable artifacts

External references may be useful *in dialogue* during brainstorming — "plugin X's review flow does Y, what if we did Z?" — but should not appear in requirements docs, plan docs, PR descriptions, or commit messages. Artifacts need to stand on their own.

- Dialogue: "X's design is interesting because..."
- Artifact: re-frame the same insight in self-contained terms that do not depend on the reader knowing X.

The cost of violating this is low-visibility: the artifact reads fine today, but a future reader (or re-user of the pattern) hits an unexplained proper noun with no resolution path.

### 9. Skill bodies are product code — author them accordingly

Skills are the instruction substrate for future dispatch. Violations in a skill being shipped propagate into every future invocation. The authoring rules that apply to agent definitions apply equally to skill bodies:

- Third-person agent voice ("What should the agent do?", not "What should I do?").
- Front-load distinguishing words so truncated labels remain differentiable.
- Rationale discipline: conditional and late-sequence blocks must explain *why*, not just *what*, because agents landing mid-skill need the reasoning to route correctly.

### 10. Each pipeline stage catches a different class of issue

Don't skip stages because "the previous one looked fine." The value distribution across stages:

| Stage | Catches | Relative cost to fix |
|---|---|---|
| Brainstorm | Wrong problem, wrong framing | Cheapest |
| Doc-review (requirements) | Incoherent requirements, missing constraints | Cheap |
| Plan | Wrong design | Medium |
| Doc-review (plan) | Self-contradicting plan, scope violations | Medium |
| Work | Execution bugs | Expensive |
| ce:review | Scope drift in implementation | Expensive |
| PR review | Subtle semantic conflations (flags, schema, contracts) | Most expensive |

The stages are not redundant. Each catches things the others structurally cannot.

---

## Why This Matters

- **Cheaper stages eliminate expensive bugs.** The `sink_available` conflation (Example 2) was caught in PR review; had it shipped, it would have been a user-visible bug in an interactive flow. A hypothetical new "Stage 5b synthesis-time rewrite pass" would have added a persistent stage and per-finding model dispatch to the pipeline had it not been caught at plan time by sampling real artifacts instead of accepting a research claim.
- **Document-review finds contradictions authors miss.** The plan draft contained a unit that added a new field to merged findings — a schema change that contradicted the plan's own "no changes to the findings schema" scope boundary. The authors did not see this; multiple doc-review personas did. (session history: this same pattern appears across testing-addressed-gate, universal-planning, and the deepen-plan work — adversarial and scope-guardian reviewers consistently catch scope contradictions.)
- **Rubber-stamping risk is invisible without a preview gate.** A compact preview is cheap to implement and hard to misuse. Its absence is invisible until an interactive flow has been rubber-stamped in production. This was the exact failure mode in an earlier LFG-autopilot session where 6 of 7 reviewers scored just below the 80 threshold on legitimately fixable issues and were auto-suppressed.
- **Contract tests that ossify prose become a hidden tax on iteration.** Every future wording improvement triggers a false-positive test break, which trains contributors to either skip wording improvements or mechanically update tests without thinking. Neither is the intended outcome.
- **Pipelines compound only if run in full.** Running brainstorm-then-work is not compound engineering. It is ad-hoc engineering with extra syntax. The compounding effect comes from stages catching each other's misses.

---

## When to Apply

- Running `ce:brainstorm` → `ce:plan` → `ce:work` → `ce:review` on any non-trivial feature (more than ~1 unit of implementation work).
- Any feature that introduces a new user-facing flow, especially one with bulk actions, routing decisions, or single-keystroke commitments.
- Any time a research agent or sub-agent returns a confident architectural recommendation that would add a stage, a schema field, or a module.
- Any PR whose scope boundary is explicitly stated ("no changes to X schema", "no new stages") — doc-review both the requirements and the plan before implementation starts.
- Any contract test or snapshot test being written against generated documentation.
- Any flag whose name could plausibly answer more than one question.
- Any skill body being authored or revised.

---

## Examples

### Example 1: Sampling-over-assumption (Stage 5b → shared-template upgrade)

**Before** — a research agent asserted "personas will not reliably produce R22-R25 framing." The plan drafted a new Stage 5b synthesis-time rewrite pass to enforce framing post-hoc via a new per-finding model dispatch.

**Intervention** — user pushback: "are you sure?" Sampled 15+ real review artifacts across 5 personas.

**Sampled finding** — the research was directionally correct but mechanistically wrong. The actual issues were:

- Null `why_it_matters` fields in `adversarial` and `api-contract` personas.
- Code-structure-first framing (vs. impact-first) in `correctness` and `maintainability` personas.

**After** — intervention changed from "new per-finding model-dispatch stage" to "one-file shared-template upgrade" (`references/subagent-template.md`). Smaller surface area, cheaper to implement, targets the actual failure modes. No new stage, no recurring per-review model cost.

This mirrors a prior pattern (session history): in the `feat/plan-review-personas` work, a model-tiering assumption ("Codex probably ignores the `sonnet` param") was challenged with "are you sure other platforms ignore it?" Checking the converter code revealed `model: sonnet` was already propagated to all targets, flipping the design from Claude-Code-only to universal.

### Example 2: The `sink_available` split

**Before** — one flag, used in two places with two different meanings:

```
# Detection output
{ tracker_name, confidence, sink_available }

# sink_available definition: "the detected tracker can be invoked"

# Callsite A — label logic
if confidence == "high" and sink_available:
    label = f"File a {tracker_name} ticket..."
else:
    label = "File a ticket..."   # generic

# Callsite B — no-sink suppression (subtly wrong)
if not sink_available:
    omit_option_C()
    # Question really being answered: "should we offer Defer at all?"
    # which is NOT the same as "can we invoke the named tracker?"
```

The bug: when `sink_available = false` for the named tracker but GitHub Issues via `gh` or the harness task primitive *would* work, Callsite B silently drops Defer even though a fallback sink is available.

**After** — two flags, one meaning each:

```
# Detection output
{ tracker_name, confidence, named_sink_available, any_sink_available }

# named_sink_available — the specifically-named tracker is invokable
# any_sink_available  — any tier in the fallback chain works

# Callsite A — label logic uses the narrow flag
if confidence == "high" and named_sink_available:
    label = f"File a {tracker_name} ticket..."
elif any_sink_available:
    label = "File a ticket..."   # generic, fallback works
# else: option omitted

# Callsite B — suppression uses the broad flag
if not any_sink_available:
    omit_option_C()
```

The two callsites now answer their respective questions correctly. A repo with no documented tracker but working `gh` correctly offers Defer with a generic label instead of silently suppressing.

### Example 3: Structural-vs-prose contract test assertion

**Before:**

```
def test_release_notes_contract():
    doc = (root / "RELEASE_NOTES.md").read_text()
    assert "only when one or more fixes landed" in doc
    assert "applied during the review" in doc
```

Every rephrase of either sentence breaks the test, even when the contract is intact.

**After:**

```
def test_release_notes_contract():
    doc_path = root / "RELEASE_NOTES.md"
    assert doc_path.exists(), "release notes file must be generated"

    doc = doc_path.read_text()

    # Required sections (structural landmarks)
    assert "## Fixes applied" in doc
    assert "## Findings deferred" in doc

    # Required distinguishing tokens
    assert re.search(r"\bfix(es)?\b.*\bland", doc, re.I), \
        "must describe fixes landing"
    assert re.search(r"\bdefer(red)?\b", doc, re.I), \
        "must describe deferrals"
```

Structural landmarks (file exists, section exists, token present) are the contract. Sentence-level wording is not. This matches the structural-evaluation style used in skill-creator evals, where assertion names map to concrete fields in output JSON (`overlap_detected`, `update_not_create`).

### Example 4: Preview gate for bulk "trust the agent" action

**Before** — an LFG-style routing option executes the full bulk plan on one keystroke. Looks efficient; is a rubber-stamp vector.

**After** — LFG presents a compact preview grouped by action class, then gates execution behind explicit Proceed/Cancel:

```
Review plan:

Applying (3):
  - src/auth.ts:44  fix stale session on logout
  - src/auth.ts:112 null-check refresh token
  - src/api.ts:87   handle 429 retry-after

Filing (2):
  - src/ui/modal.tsx:23  a11y focus trap (defer)
  - src/db/migrate.ts:9  idempotency audit (defer)

Skipping (1):
  - docs/README.md:4  prose nit

[Proceed]  [Cancel]
```

The plan is visible. Rubber-stamping is now an explicit, informed act rather than a side effect of UI design.

### Example 5: External plugin references stay in dialogue

**Dialogue (acceptable):** "Plugin X's review flow groups findings by file, which works well for their navigation-driven use case. What if we grouped by action class instead, since our Interactive mode is decision-driven?"

**Artifact (acceptable):** "Findings are grouped by action class (Applying / Filing / Skipping) because Interactive mode is decision-driven: the user's question at this surface is 'what is about to happen?', not 'where in the tree am I?'."

**Artifact (not acceptable):** "Findings are grouped by action class, similar to plugin X's review flow but adapted for our decision-driven Interactive mode."

The artifact version stands on its own without the external reference. A future reader does not need to know X to understand the design. *(auto memory [claude]: this rule was applied throughout the ce:review redesign session — the requirements doc, plan, and PR description all re-framed externally-inspired patterns in self-contained terms.)*

---

## Related

- [research-agent-pipeline-separation-2026-04-05.md](../skill-design/research-agent-pipeline-separation-2026-04-05.md) — Establishes the brainstorm / plan / work stage separation. This learning extends downstream to doc-review, ce:review, and resolve-pr-feedback, and focuses on what issues surface at each stage rather than what research dispatches.
- [compound-refresh-skill-improvements.md](../skill-design/compound-refresh-skill-improvements.md) — The 6-item skill review checklist is a natural companion for review-time prevention rules, particularly around cross-phase consistency and blind-user-question avoidance.
- [beta-promotion-orchestration-contract.md](../skill-design/beta-promotion-orchestration-contract.md) — Contract-tests-enforce-orchestration-assumptions pattern for the ce:review surface; direct prior art for structural assertion philosophy.
- [git-workflow-skills-need-explicit-state-machines-2026-03-27.md](../skill-design/git-workflow-skills-need-explicit-state-machines-2026-03-27.md) — Methodologically aligned ("state machine over prose" ≈ "structural assertions over prose"), different domain.
- [pass-paths-not-content-to-subagents-2026-03-26.md](../skill-design/pass-paths-not-content-to-subagents-2026-03-26.md) — Companion for any subagent-template changes, particularly around instruction phrasing.
- [codex-delegation-best-practices-2026-04-01.md](codex-delegation-best-practices-2026-04-01.md) — Canonical example of sampling-evidence-over-assumption at depth (6 evaluation iterations, empirical token measurement).
