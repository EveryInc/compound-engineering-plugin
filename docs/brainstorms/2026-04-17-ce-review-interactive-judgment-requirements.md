---
date: 2026-04-17
topic: ce-review-interactive-judgment
---

# ce:review Interactive Judgment Loop

## Problem Frame

`ce:review`'s Interactive mode produces a report, auto-applies `safe_auto` fixes, and then asks a single bucket-level policy question covering every remaining `gated_auto` and `manual` finding as a group. The findings themselves are presented as a pipe-delimited table grouped by severity.

Two problems surface repeatedly:

1. **Judgment calls are hard to make.** When a finding needs human judgment, the table row rarely gives enough context to decide confidently. The user is asked to approve or defer a bucket of findings they haven't individually understood.
2. **High-volume feedback is unreason-able.** A review producing 8-12 findings turns into a scrolling table the user can't engage with. There's no way to respond to individual items meaningfully — the only choice is "approve the whole bucket" or "defer the whole bucket."

The result is that Interactive mode mostly degrades into rubber-stamping or wholesale deferral. The "judgment" in `gated_auto` / `manual` routing is never actually exercised per-finding.

## Requirements

**Routing after `safe_auto` fixes**

- R1. After `safe_auto` fixes are applied, if any `gated_auto` or `manual` findings remain, Interactive mode presents a four-option routing question that replaces today's bucket-level policy question.
- R2. When zero `gated_auto` / `manual` findings remain after `safe_auto`, the routing question is skipped. Interactive mode shows a brief completion summary (e.g., "All findings resolved — N `safe_auto` fixes applied.") before handing off to the final-next-steps flow.
- R3. The routing question names the detected tracker inline (e.g., "File a Linear ticket per finding") only when detection is high-confidence — the tracker is explicitly named in `CLAUDE.md` / `AGENTS.md` or equivalent project documentation. When detection is lower-confidence, the label uses a generic form (e.g., "File an issue per finding") and the agent confirms the tracker with the user before executing any ticket creation.
- R4. The four routing options are:
  - (A) `Review each finding one by one — accept the recommendation or choose another action`
  - (B) `LFG. Apply the agent's best-judgment action per finding`
  - (C) `File a [TRACKER] ticket per finding without applying fixes`
  - (D) `Report only — take no further action`
- R5. Routing option C is a batch-defer shortcut: it files tickets for every pending `gated_auto` / `manual` finding without per-finding confirmation. The walk-through's own Defer option is per-finding; C skips that interactivity.

**Per-finding walk-through (routing option: Review)**

- R6. When the user picks the walk-through, findings are presented one at a time in severity order (P0 first). Each per-finding question opens with a position indicator (e.g., "Finding 3 of 8 (P1):") so the user can judge how many decisions remain.
- R7. Each per-finding question includes: plain-English statement of what the bug does, severity, confidence, the proposed fix (diff or concrete action), and a short reasoning for why the fix is right (grounded in codebase patterns when available).
- R8. Per-finding options:
  - `Apply the proposed fix`
  - `Defer — file a [TRACKER] ticket`
  - `Skip — don't apply, don't track`
  - `LFG the rest — apply the agent's best judgment to this and remaining findings`
- R9. For findings with no concrete fix to apply (advisory-only), option A becomes `Acknowledge — mark as reviewed`. Defer, Skip, and LFG the rest remain unchanged.
- R10. "Override" on a per-finding question means picking a different preset action (Defer or Skip in place of Apply); no inline freeform custom fix authoring. A user who wants a custom fix picks Skip and hand-edits outside the flow.

When exactly one `gated_auto` / `manual` finding remains, the walk-through's wording adapts for N=1 (e.g., "Review the finding" rather than "Review each finding one by one"), and `LFG the rest` is suppressed because no subsequent findings exist to bulk-handle.

**LFG path (routing option: LFG)**

- R11. LFG applies the per-finding action the agent would have recommended in the walk-through — Apply, Defer, or Skip. There is no separate confidence threshold; confidence already shapes what the agent recommends. The top-level LFG option scopes to every `gated_auto` / `manual` finding; the walk-through's `LFG the rest` (R8) scopes to the current finding and everything not yet decided. Both share the same per-finding mechanic and the same bulk preview (R13-R14).
- R12. LFG (and `LFG the rest`) produces a single completion report after execution that must include, at minimum:
  - per-finding entries with: title, severity, action taken (Applied / Deferred / Skipped / Acknowledged), the tracker URL or in-session task reference for Deferred entries, and a one-line reason for Skipped entries grounded in the finding's confidence or content
  - summary counts by action
  - any failures called out explicitly (fix application failed, ticket creation failed)
  - the existing end-of-review verdict

**Bulk action preview**

- R13. Before executing any bulk action — top-level LFG (routing option B), top-level File tickets (routing option C), or walk-through `LFG the rest` (R8) — Interactive mode presents a compact plan preview and asks the user to confirm with `Proceed` or back out with `Cancel`. Two options. No per-item decisions in the preview; per-item decisioning is the walk-through's role.
- R14. The preview content groups findings by the action the agent intends to take (e.g., `Applying (N):`, `Filing [TRACKER] tickets (N):`, `Skipping (N):`, `Acknowledging (N):`). Each finding gets one line under its bucket, written as a compressed form of the framing-quality bar (R22-R25) — observable behavior over code structure, no function or variable names unless needed to locate the issue. For walk-through `LFG the rest`, the preview scopes to remaining findings only and notes how many are already decided (e.g., "LFG plan — 5 remaining findings (3 already decided)").

**Recommendation tie-breaking**

- R15. When merged findings carry conflicting recommendations across contributing reviewers (e.g., one reviewer says Apply, another says Defer), synthesis picks the most conservative action using the order `Skip > Defer > Apply` so that LFG and walk-through behavior are deterministic and auditable post-hoc.

**Defer behavior and tracker detection**

- R16. Defer actions (from the walk-through, from the LFG path, or from routing option C) file a ticket in the project's tracker.
- R17. The SKILL.md instruction for tracker detection is minimal: the agent determines the project's tracker from whatever documentation is obvious (primarily `CLAUDE.md` / `AGENTS.md`), without an enumerated checklist of files to read.
- R18. When tracker detection is uncertain, the agent prefers durable external trackers over in-session-only primitives and communicates both the fallback behavior and the durability trade-off to the user before executing any Defer action.
- R19. If a Defer action fails at ticket-creation time (API error, auth expiry, rate limit, malformed body), the agent surfaces the failure inline and offers: retry, fall back to the next available sink, or convert the finding to Skip with the error recorded in the completion report. Silent failure is not acceptable.
- R20. When no external tracker is detectable and no harness task-tracking primitive is available on the current platform (e.g., CI contexts, converted targets without task binding), Defer is not offered as a menu option. The routing question and walk-through omit Defer paths and the agent tells the user why.
- R21. The internal `.context/compound-engineering/todos/` system is **not** part of the fallback chain. It is on a deprecation path and must not be extended by this work.

**Framing quality (cross-cutting)**

- R22. Every user-facing surface that describes a finding — per-finding walk-through questions, LFG completion reports, and ticket bodies filed by Defer actions — explains the problem and fix in plain English that a reader can understand without opening the file.
- R23. The framing leads with the *observable behavior* of the bug (what a user, attacker, or operator sees), not the code structure. Function and variable names appear only when the reader needs them to locate the issue.
- R24. The framing explains *why the fix works*, not just what it changes. When a similar pattern exists elsewhere in the codebase, reference it so the recommendation is grounded.
- R25. The framing is tight: approximately two to four sentences plus the minimum code needed to ground it. Longer framings are a regression.

*Illustrative pair — weak vs. strong framing for the same finding:*

> **Weak (code-citation style):**
> *orders_controller.rb:42 — missing authorization check. Add `current_user.owns?(account)` guard before query.*
>
> **Strong (framed for a human):**
> *Any signed-in user can read another user's orders by pasting the target account ID into the URL. The controller looks up the account and returns its orders without verifying the current user owns it. Adding a one-line ownership guard before the lookup matches the pattern already used in the shipments controller for the same attack.*

- R26. R22-R25 depend on reviewer personas producing framing-suitable `why_it_matters` and `evidence` fields. If the planning-phase sample shows existing persona outputs do not meet this bar, persona prompt upgrades (or a synthesis-time rewrite pass) land with or before this work.

**Mode boundaries**

- R27. Only Interactive mode changes behavior. Autofix, Report-only, and Headless modes are unchanged.
- R28. The existing post-review "final next steps" flow (push fixes / create PR / exit) runs only when one or more fixes were applied to the working tree. It is skipped after routing option C (File tickets per finding) and option D (Report only), and skipped when LFG or the walk-through completes without any Apply action.

## Success Criteria

- A user facing a review with one high-stakes finding can decide confidently about the fix without rereading the file.
- A user facing a review with 8+ findings has a clear path to either engage per-item or trust the agent's judgment in one keystroke.
- A user who starts the walk-through but runs out of attention can bail mid-flow into a bulk action without losing the findings still ahead of them.
- Deferred findings land in the team's actual tracker (not a `.context/` file that gets forgotten).
- LFG runs feel honest: the completion report makes clear what was applied and why, so a user can audit the agent's judgment post-hoc.
- For reviews with three or more `gated_auto` / `manual` findings, Review is picked at a meaningful share of the time — LFG alone is not disproportionately the default, so the intervention actually shifts engagement upward rather than renaming the rubber-stamp.
- A first-time user of Interactive mode understands which routing options cause external side effects (fixes applied to the working tree, tickets filed in an external tracker) before choosing, without needing external docs.

## Scope Boundaries

- No new `ce:fix` skill. All changes live inside `ce:review`.
- No changes to the findings schema, persona agents, merge/dedup pipeline, or autofix-mode residual-todo creation in this work.
- No inline freeform fix authoring in the walk-through. The walk-through is a decision loop, not a pair-programming surface.
- The "approve the fix's intent but write a variant" case is explicitly unsupported in v1. Users in that situation pick Skip and hand-edit outside the flow; if they want the variant tracked, they file a ticket manually.
- No changes to Autofix, Report-only, or Headless mode behavior.
- The pre-menu findings table format (pipe-delimited, severity-grouped) is intentionally unchanged. The walk-through is the engagement surface for high-volume feedback; the table only needs to be scannable enough to reach the routing menu. Restructuring the table format is a separate follow-up if it proves necessary.
- Phasing out the internal `.context/compound-engineering/todos/` system and the `/todo-create`, `/todo-triage`, `/todo-resolve` skills is acknowledged as the long-term direction but is not scoped into this redesign. A separate follow-up covers that cleanup.
- The current bucket-level policy question wording (`Review and approve specific gated fixes` / `Leave as residual work` / `Report only`) is removed and replaced by the four-option routing question. No backward-compatibility shim.

## Key Decisions

- **Expand Interactive mode, no new skill.** Review and fix stay colocated; the review artifact, routing metadata, and fixer subagent are already wired up. A separate `ce:fix` skill would split state and add reintegration cost without clear benefit.
- **Four-option routing upfront, not an escape hatch buried inside the walk-through.** LFG and tracker-deferral are legitimate primary intents for many reviews, not fallbacks. Offering them as peers to the walk-through is honest about how users actually want to engage.
- **LFG = auto-accept recommendations, not a separate confidence policy.** Keeps the mental model simple. Confidence is already baked into whether the agent recommends Apply, Defer, or Skip for a given finding.
- **Tracker detection is reasoning-based, not rote.** Agents are smart enough to read the obvious documentation. An enumerated checklist of files in SKILL.md is pure rationale-discipline tax and caps the agent at the sources we happened to list.
- **Harness task tracking is the last-resort fallback, not internal todos.** Aligns with the deprecation direction for the internal todo system. Honest about the fact that in-session tasks don't survive past the session.
- **Override in the walk-through = pick a different preset action.** No freeform custom fixes. Keeps the interaction a decision loop and avoids turning it into a pair-programming transcript. Users who want custom fixes Skip and hand-edit.
- **Internal-todos deprecation ships a durability regression for some users.** A subset of users today treat `.context/compound-engineering/todos/` as persistent defer storage; removing it from the fallback chain means those users lose cross-session durability for Defer actions until they either document a tracker in `CLAUDE.md` / `AGENTS.md` or the broader phase-out lands. The trade is acknowledged and deliberate, not a silent regression; the mitigation is the separate phase-out cleanup referenced in Scope Boundaries.

## Dependencies / Assumptions

- The cross-platform blocking question tool (`AskUserQuestion` / `request_user_input` / `ask_user`) caps at 4 options. All menu designs respect this.
- Option labels across every menu in the flow (routing question, per-finding question, Stop-asking follow-up) must be self-contained, use third-person voice for the agent, and front-load a distinguishing word so they survive truncation in harnesses that hide description text.
- The walk-through writes per-finding decisions to the run artifact (e.g., `.context/compound-engineering/ce-review/<run-id>/walkthrough-state.json`) after each decision, so partial progress is inspectable post-hoc. Formal cross-session resumption is out of scope.
- Findings already carry enough detail (title, severity, confidence, file, line, autofix_class, suggested_fix, why_it_matters, evidence) to support the framing requirements. If some reviewers don't reliably produce plain-English `why_it_matters`, the framing quality bar may require prompt upgrades to those personas — flagged below as a question for planning.
- The existing per-run artifact directory (`.context/compound-engineering/ce-review/<run-id>/`) and the fixer subagent flow remain the underlying mechanics for applying fixes.
- The merged finding set produced by the existing Stage 5 merge pipeline carries only merge-tier fields; detail-tier fields (`why_it_matters`, `evidence`) live in the per-agent artifact files on disk. The per-finding walk-through enriches each merged finding by reading the contributing reviewer's artifact file at `.context/compound-engineering/ce-review/<run-id>/{reviewer}.json`, using the same `file + line_bucket(line, +/-3) + normalize(title)` matching that headless mode already uses. When no artifact match exists (merge-synthesized finding, or failed artifact write), the walk-through degrades to title plus `suggested_fix` and notes the gap.
- The four-option routing design is built to the cross-platform question tool's 4-option cap. A future fifth primary routing intent would require replacing an existing option, chaining a follow-up question, or pressuring the platform cap — the design does not provide pressure relief for this case.
- Autofix mode continues to write residual actionable work to `.context/compound-engineering/todos/` in this redesign, while Interactive-LFG and Defer actions route to external trackers per R16-R21. This temporary divergence is acknowledged — aligning autofix mode's residual sink with the new tracker routing is separate cleanup work tracked in the follow-up referenced in Scope Boundaries.

## Outstanding Questions

### Resolve Before Planning

None. All product decisions are made.

### Deferred to Planning

- [Affects Problem Frame][Needs research] Sample recent `.context/compound-engineering/ce-review/<run-id>/` run artifacts to confirm the rubber-stamping / wholesale-deferral failure mode the Problem Frame asserts. If the dominant failure is something else (users disengage before the bucket question, report itself is unreadable), the four-option routing may not be the right intervention.
- [Affects R22-R26][Technical] Do reviewer personas reliably produce plain-English `why_it_matters` today, or does the framing bar require prompt upgrades and/or a synthesis-time rewrite pass? Planning should inspect a sample of recent review artifacts to decide before committing to R22-R25 as achievable without persona changes.
- [Affects R18][Technical] The concrete sequencing of the fallback chain on each target platform (e.g., GitHub Issues via `gh` vs harness task tracking, how to detect `gh` availability cheaply) is intentionally left out of the requirements so detection stays principle-based. Planning resolves the specific sequencing and detection heuristics per target environment.
- [Affects R18][Technical] If no documented tracker is found and `gh` is unavailable on the current platform, should the fallback to harness task tracking happen silently or should the agent confirm once per session? Default expectation: confirm once so users are not surprised by in-session-only behavior.
- [Affects R6][Technical] Whether the walk-through presents findings strictly in severity order (current default) or groups them by file first and then severity within each file. File-grouping may feel more coherent when many findings touch the same file, but it interacts with `Stop asking` semantics (a file-grouped bulk-accept applies to different findings than a severity-first bulk-accept).
- [Affects R7][Needs validation] Whether surfacing reviewer persona names in each per-finding question (e.g., `julik-frontend-races-reviewer`) helps user judgment or is noise. If validation shows noise, omit reviewer attribution from R7's required content or replace with a short category label.

## Next Steps

`-> /ce:plan` for structured implementation planning
