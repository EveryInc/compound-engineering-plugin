# Deepening Workflow

This file contains the confidence-check execution path (5.3.3-5.3.7). Load it only when the deepening gate at 5.3.2 determines that deepening is warranted.

## 5.3.3 Pick the Sections to Strengthen

Read the plan and pick the 2-5 weakest sections — the ones a reader could not act on as written. Prefer sections not already strengthened when the plan carries a `deepened:` date.

These gaps are specific to this artifact and easy to miss on a read-through, so check for them explicitly:

- Existing U-IDs were renumbered after a unit was reordered, split, or deleted (U-IDs are stable: never renumber existing IDs; gaps from deletions are preserved; new units take the next unused number)
- A feature-bearing unit has blank or missing test scenarios (the `Test expectation: none` annotation is only valid for non-feature-bearing units)
- `Context & Research` or `Sources & References` cites a pattern, learning, or risk that never affects a decision, unit, or verification step
- An origin R/F/AE that affects implementation is referenced nowhere — or a unit realizing an origin Key Flow / enforcing an Acceptance Example does not cite the F-ID / AE-ID when origin supplies them

## 5.3.4 Report and Dispatch Targeted Research

Before dispatching, report what sections are being strengthened and why:

```text
Strengthening [section names] — [brief reason for each, e.g., "decision rationale is thin", "cross-boundary effects aren't mapped"]
```

Dispatch **one focused lens per selected section**, in parallel where the platform supports it; run them sequentially otherwise. A lens is a generic subagent seeded with a short plan summary, the exact section text, why the section was selected, the plan's risk profile, and the lens question below. Instruct it to return only findings that would change the plan — no implementation code, no shell commands. Do not stack multiple lenses on one section because several sound relevant. Omit the `mode` parameter when dispatching so the user's configured permission settings apply.

| Section | Lens | The question the lens answers |
|---|---|---|
| Requirements / Open Questions | flow completeness | which user flow, state transition, or handoff is unspecified, and what breaks if it stays that way (`references/agents/spec-flow-analyzer.md`) |
| Context & Research / Sources | institutional memory | what has this team already learned or decided about this, and which cited source is doing no work (`references/agents/learnings-researcher.md`) |
| Context & Research / Sources | external grounding | what do the official docs or current practice say that the plan gets wrong (`references/agents/framework-docs-researcher.md`, `references/agents/best-practices-researcher.md`, or `references/agents/web-researcher.md` for an unsettled external option set the recommendations depend on) |
| Key Technical Decisions | architectural integrity | which boundary, coupling, or seam does this decision damage, and what would have to be true for the rejected alternative to win |
| Key Technical Decisions / HTD / Units | agent-native | which user-facing capability gains no agent-accessible equivalent here (`references/agents/agent-native-planning-strategist.md`) |
| High-Level Technical Design | design fidelity | does the sketch match the decisions and units, in the right medium, without implementation code |
| Implementation Units / Verification | repo reality | which named file, pattern, or sequencing assumption does the codebase contradict (`references/agents/repo-research-analyst.md`, Scope: `patterns`) |
| Implementation Units | consistency | which existing pattern is this duplicating or diverging from without a reason |
| System-Wide Impact | data integrity | which invariant breaks mid-deploy, and what read-only query proves it didn't |
| System-Wide Impact / Risks | security | which credible threat path does the proposed surface open, and what mitigation or test closes it |
| Risks & Dependencies / Operational | scale and rollout | at what data volume or load does this stop working, and which rollout, monitoring, or rollback step is missing |
| Risks / Key Technical Decisions | historical rationale | why did the code get this way, and which prior attempt failed (only when the plan turns on history) |

Where the table names a `references/agents/*.md` prompt asset, read that file and seed the subagent with it. Those are skill-local prompt assets, not standalone agent types — do not use `subagent_type`, typed `Agent` names, or platform-level CE agent registration. For a lens with no file, the lens question plus the section text is the prompt.

**Data-integrity lens — migration failures worth naming, because they pass tests and fail in production:** swapped or inverted ID/enum mappings; a new `NOT NULL` column with no backfill; a rename or drop inside the deploy window, before all code paths stop reading the old name; a dual-write that leaves the new or old column NULL so rollback loses data; an index added to a hot table without concurrent/online creation; silent truncation or precision loss from a type change (`text` -> `varchar(n)`, float -> integer). For each risk it raises, the lens names the invariant, the failure path, and the read-only query or rollback that protects it.

**Historical-rationale lens:** the current year is 2026 — use that when interpreting commit dates. Files in `<root>/plans/` and `<root>/solutions/` are intentional, permanent artifacts; never recommend removing them or call them unnecessary because a workflow generated them.

## 5.3.5 Run Targeted Research

Prefer local repo and institutional evidence first. Use external research only when the gap cannot be closed responsibly from repo context or already-cited sources. If a selected section can be improved by reading the origin document more carefully, do that before dispatching anything.

Each lens returns its findings directly to the parent. Keep the return payload focused: strongest findings only, the evidence or sources that matter, the concrete planning improvement implied by each finding.

If agent outputs conflict:
- Prefer repo-grounded and origin-grounded evidence over generic advice
- Prefer official framework documentation over secondary best-practice summaries when the conflict is about library behavior
- If a real tradeoff remains, record it explicitly in the plan

## 5.3.6 Interactive Finding Review (Interactive Mode Only)

Skip this step in auto mode — proceed directly to 5.3.7.

In interactive mode, present each agent's findings to the user before integration. For each agent that returned findings:

1. **Summarize the lens and its target section** — e.g., "The architectural-integrity lens reviewed Key Technical Decisions and found:"
2. **Present the findings concisely** — bullet the key points, not the raw agent output. Include enough context for the user to evaluate: what the agent found, what evidence supports it, and what plan change it implies.
3. **Ask the user** using the platform's blocking question tool when available (see Interaction Method):
   - **Accept** — integrate these findings into the plan
   - **Reject** — discard these findings entirely
   - **Discuss** — the user wants to talk through the findings before deciding

If the user chooses "Discuss", engage in brief dialogue about the findings and then re-ask with only accept/reject (no discuss option on the second ask). The user makes a deliberate choice either way.

When presenting findings from multiple agents targeting the same section, present them one agent at a time so the user can make independent decisions. Do not merge findings from different agents before showing them.

Findings against `session-settled:`-labeled KTDs are presented like any other — suppressing them is pipeline/auto-mode behavior only, never interactive. A user-accepted finding that changes a labeled KTD is a new settlement: update the KTD text and relabel it `user-approved`.

After all agents have been reviewed, carry only the accepted findings forward to 5.3.7.

If the user accepted no findings, report "No findings accepted — plan unchanged." Then proceed directly to Phase 5.4 (skip document-review and synthesis — the plan was not modified). This interactive-mode-only skip does not apply in auto mode; auto mode always proceeds through 5.3.7 and 5.3.8.

If findings were accepted and the plan was modified, proceed through 5.3.7 and 5.3.8 as normal — document-review acts as a quality gate on the changes.

## 5.3.7 Synthesize and Update the Plan

Strengthen only the selected sections. Keep the plan coherent and preserve its overall structure.

**In interactive mode:** Only integrate findings the user accepted in 5.3.6. If some findings from different agents touch the same section, reconcile them coherently but do not reintroduce rejected findings.

**Session-settled KTD stability.** Deepening may append rationale or a conflict call-out to a `session-settled:`-labeled Key Technical Decision, but never removes the annotation or inverts the decision. Contradiction evidence routes through the severity ladder: nothing found — proceed silently; suboptimal-but-workable — proceed as settled and attach a conflict call-out to the KTD; invalidating — stop as blocked per the SKILL.md Phase 5.2 pipeline contract.

Deepening may tighten, not only grow. A section can be strengthened by cutting as well as adding — collapse multi-idea sentences, drop hedges, and delete superseded text outright rather than leaving it as strikethrough or stacking a separate "resolutions" layer on top of it. A shorter, contradiction-free section is a stronger one. This is distinct from "rewrite the entire plan from scratch" below, which stays forbidden.

**Strengthen at the owning entry.** A rule owned by an R or KTD gains evidence, rationale, or precision at that entry; a sibling section that needs it cites the owning ID. Never restate an owned rule into a Key Decision, Scope bullet, or unit Approach — deleting an unlinked sibling restatement found in a strengthened section is itself a valid tightening move.

Allowed changes:
- Tighten prose in a strengthened section: cut hedges, split sentences carrying more than one idea, remove superseded text in place (version control holds the history), and replace unlinked restatements with citations of the owning R/KTD
- Clarify or strengthen decision rationale
- Tighten requirements trace or origin fidelity
- Reorder or split implementation units when sequencing is weak — but **never renumber existing U-IDs**. Reordering preserves U-IDs in their new order (e.g., U1, U3, U5 reordered is correct; renumbering to U1, U2, U3 is not). Splitting keeps the original U-ID on the original concept and assigns the next unused number to the new unit. Renumbering breaks ce-work blocker and verification references that were written against the original IDs
- Add missing pattern references, file/test paths, or verification outcomes
- Expand system-wide impact, risks, or rollout treatment where justified
- Reclassify open questions between `Resolved During Planning` and `Deferred to Implementation` when evidence supports the change
- Strengthen, replace, or add a High-Level Technical Design section when the work warrants it and the current representation is weak
- Strengthen or add per-unit technical design fields where the unit's approach is non-obvious
- Add or update `deepened: YYYY-MM-DD` in frontmatter when the plan was substantively improved

Do **not**:
- Add implementation code — no imports, exact method signatures, or framework-specific syntax. Pseudo-code sketches and DSL grammars are allowed
- Add git commands, commit choreography, or exact test command recipes
- Add generic `Research Insights` subsections everywhere
- Rewrite the entire plan from scratch
- Invent new product requirements, scope changes, or success criteria without surfacing them explicitly
- Renumber existing U-IDs as part of reordering, splitting, deletion, or "tidying" the unit list. Deepening is the most likely accidental-renumber vector — preserve U-IDs even when the new order would look cleaner with sequential numbering
- Restate a rule a cited R or KTD already owns into a sibling section — synthesis folds section-isolated findings back per section, which is exactly where duplicate restatements creep in; cite the owning ID instead

If research reveals a product-level ambiguity that should change behavior or scope:
- Do not silently decide it here
- Record it under `Open Questions`
- Recommend `ce-brainstorm` if the gap is truly product-defining
