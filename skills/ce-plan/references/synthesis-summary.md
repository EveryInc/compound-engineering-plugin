# Scoping Synthesis

**Scoping synthesis ≠ plan doc.** The scoping synthesis is the scope/decisions checkpoint that plan-write (Phase 5.2) consumes as input. It surfaces decisions the agent CAN make at synthesis time: scope-level (does this plan cover the full brainstorm or narrow to a subset?), posture (extend existing pattern vs. introduce new abstraction), test approach. It does NOT surface decisions plan-write produces: PR count, commit/branch sequencing, effort or time estimates, Implementation Unit lists, exact file paths, test command recipes. If the synthesis claims any of those, it has leaked plan-write thinking and must be re-cut to scope-decisions only. Even when the agent has formed plan-write opinions earlier in the session, the synthesis stays at scope altitude — the user is being asked to affirm scope, not to rubber-stamp implementation.

**Two-stage shape: internal draft, then chat-time synthesis.** The synthesis is composed in two stages. Stage 1 is an internal three-bucket draft (Stated / Inferred / Out of scope) the agent uses to think comprehensively about scope. Stage 2 is the compressed chat-time output: a tier-shaped summary plus "Call outs" (zero or more, capped by plan depth — see the cap table under "How many call-outs are right?") — the specific forks where the user might redirect. The user only sees stage 2. The internal draft still informs the plan body via the doc-shape routing below; it just doesn't reach the user verbatim. This split exists because the comprehensive audit shape produced too much detail for the user to weigh in on, even when the granularity rules were followed.

**Three-bucket structure is the internal draft, not the user-facing artifact.** It does its scope-thinking job during stage 1 and dissolves when Phase 5.2 writes the plan: Stated content informs the Product Contract's Requirements, Inferred content informs Key Technical Decisions / Implementation Units (normal interactive mode) or the Planning Contract's `### Assumptions` (non-interactive mode, or an interactive `SKIP_SCOPING_CONFIRM` skip run), Out-of-scope content informs the Product Contract's Scope Boundaries. The plan has no parallel `## Synthesis` section — only the stage-2 summary embeds, under the Product Contract's `### Summary`. See "Doc shape after confirmation" below for the exact routing and section nesting.

This content is loaded when a synthesis-summary phase fires in ce-plan. There are two variants — they share structure but differ in timing and content focus:

- **Solo variant** (Phase 0.7): fires after Phase 0.4 bootstrap and Phase 0.6 depth classification, before Phase 1 research begins. Catches scope misinterpretation before sub-agent dispatch is spent. Full breadth — problem frame, intended behavior, success criteria, in/out scope.
- **Brainstorm-sourced variant** (Phase 5.1.5): fires after Phase 1 research, before Phase 5.2 plan-write. Focuses on plan-time decisions (which files/modules to touch, which patterns extended vs. introduced new, test scope, refactor scope). Brainstorm-validated WHAT is assumed and not re-stated.

Both variants share the two-stage shape, the keep test for call-outs, soft-cut behavior, and the doc-shape routing. In non-interactive (headless) mode, both compose the internal draft and skip stage 2 — the user-facing compression is moot when there is no synchronous user. The internal draft dissolves into the plan body the same way, with Inferred bets routing to a `## Assumptions` section. See "Headless mode (shared)" below for the full routing.

---

## Stage 1: internal three-bucket draft (shared)

The internal draft is structured in three labeled buckets. Items may appear in two buckets when meaningfully both — flag the inclusion-then-exclusion as Inferred so the reasoning is captured.

- **Stated** — what the user said directly (in the original prompt, prior conversation, dialogue answers, or the upstream brainstorm doc when present). Items here have explicit user-language anchors.
- **Inferred** — what the agent assumed to fill gaps. Scope boundaries the user never explicitly named, success criteria extrapolated from intent, technical assumptions made because the brief interview didn't probe them. The Inferred list is the most actionable bucket — items here are the agent's bets that the user can correct.
- **Out of scope** — deliberately excluded items. Adjacent work the agent considered but decided not to include, refactors, nice-to-haves, future-work items.

This draft is internal. Do not paste it verbatim into chat. Compose it as a thinking step, then derive stage 2 from it.

---

## Stage 2: chat-time scoping synthesis

Stage 2 is what the user actually sees. The shape differs between variants because they serve different purposes — brainstorm-sourced plans inherit a validated WHAT and surface plan-specific HOW; solo plans have no upstream and the synthesis is the WHAT.

### Brainstorm-sourced shape (Phase 5.1.5)

Two content sections plus call-outs:

1. **Brainstorm-scope restatement** (1-2 sentences, prose). Restates the brainstorm's scope as orientation. The user wrote this content, but the synthesis may be read days later or in parallel with other plans — the restatement is the topic anchor that says "this is the artifact we're planning against." Stay in the brainstorm's own vocabulary. Do NOT enumerate Implementation Units, restate constraints back at the user, or list acceptance examples.

2. **Plan-specific scoping decisions** (prose, or bullets when multi-faceted). Scope-level commitments the agent made that the brainstorm did not: does this plan cover the full brainstorm scope or narrow to a subset; are adjacent refactors pulled in or held out; what test scope at scenario level (which sites, which acceptance examples). Each item must pass the **affirmability test** — the user can affirm or redirect it without reading code. This section is scope claims at affirm-or-redirect level, NOT a description of where the implementation reaches, NOT PR count or commit sequencing, NOT Implementation Unit lists, NOT exact file paths or test commands — those are all plan-write outputs the synthesis cannot honestly claim. If the plan covers the full brainstorm scope with no narrowing, expansions, or adjacent work, this section stays short ("This plan covers the full brainstorm scope; test scope is X").

3. **Call outs** (zero or more, capped by plan depth — see "How many call-outs are right?" below). Each a real fork where the user's input materially changes the plan. Omit the "Call outs:" header entirely when zero forks survived the keep test.

### Solo shape (Phase 0.7)

No upstream document; the synthesis itself is the scope claim:

1. **Scope claim** (prose, or bullets when multi-faceted). What the agent is planning to build, at affirm-or-redirect level — names what's in and what's out. NOT an enumeration of Implementation Units the plan will contain.

2. **Call outs** (zero or more, capped by plan depth). Same as brainstorm-sourced.

### Shape budgets

Tier-aware budgets are **ceilings, not targets**. Less is correct when there isn't more to say — filling the budget produces noise.

| Plan depth | Restatement (brainstorm-sourced) | Plan-specific scoping (brainstorm-sourced) / Scope claim (solo) |
|---|---|---|
| Lightweight | 1 sentence | 1-3 lines prose |
| Standard | 1-2 sentences | up to 3-5 lines or 2-4 bullets |
| Deep | 1-2 sentences | up to 4-6 lines or 3-6 bullets |

Form within each section (prose, bullets, mix) follows whatever communicates best.

### Shared rules

- **No "Stated" bucket in chat** (the orientation or scope-claim covers it).
- **No "Out of scope" bucket as a separate list** — fold a non-obvious exclusion into a call-out when it survives the keep test, otherwise drop it.
- **Source-document vocabulary.** When a brainstorm exists, use its terms. Don't invent agent-coded shorthand (e.g., "skill-instruction shape", "hooks engine selection at Step 2a entry"). When referencing acceptance examples, requirements, or flows, name them in plain terms ("the install-prompt acceptance case") — never use bare IDs.

- **Pre-emit mechanical checks.** Before emitting the synthesis, scan the output:
  - **Bare ID references** (`AE\d+`, `R\d+`, `F\d+`, `A\d+`, `U\d+`) → replace with plain names. Mixed forms (case named AND ID cited) still violate the rule because the ID adds noise without information.
  - **File paths** (`path/like.md`, `path/like.py`, `internal/cli/...`, `skills/.../...`, etc.) → cut unless the path IS the topic of an explicit fork in the call-outs. Allowed: "cleanup hook in the existing archive step vs. a new dedicated phase" (where the path is implicit in the decision). Forbidden: paths listed to demonstrate completeness, preview Implementation Units, or describe where the implementation reaches. The synthesis names *what* the plan targets, not *where* the code lives.

### The keep test for each call-out

Before keeping a candidate call-out from the internal draft, run the **affirmability test**: would the user need to look at code to evaluate this? If yes, it is plan-body content — cut. If no, apply the keep test — one of the following must be true:

- **Real fork**: another reasonable agent might choose differently on this dimension (extend pattern X vs. introduce abstraction Y; scan source A vs. source B; etc.)
- **Non-obvious behavioral choice**: a default the agent picked that the user would not see by reading the summary alone, but that materially affects what the plan does (e.g., "scans the working-dir snapshot before the copy step" — the user would not infer the scan target from a description of the gate's purpose)
- **Non-obvious exclusion**: an item was deliberately excluded that the user might want to add back in
- **Cheap-now-expensive-later correction**: a bet the user is well-placed to redirect now that would be expensive to undo after research or plan-write

Cut anything else, including:

- Mechanical items where there is no real alternative (e.g., "no new dependencies" when the work clearly does not need any)
- Implementation choices that will be settled during the work (e.g., regex precision tuned during impl)
- Items already implied by the summary

### The detail test (per call-out and per summary bullet)

After the keep test, every surviving item runs the **detail test**: 1-2 lines max, conversational not documentary. A call-out or summary bullet that runs to 4+ lines of dense prose is naming an implementation consequence rather than a decision — re-cut at higher abstraction.

The keep test addresses *which* items survive. The detail test addresses *how much* each surviving item says. Without it, the count cap is gameable: an agent can hit "3 call-outs" while each call-out is a 6-line paragraph, and the synthesis reads as a doc preview instead of a checkpoint.

### How many call-outs are right?

The cap is heuristic, not law. The real discipline is the keep test on each candidate. Typical bounds by plan depth:

| Plan depth | Typical | Cap |
|---|---|---|
| Lightweight | 0-2 | 3 |
| Standard | 1-3 | 4 |
| Deep | 2-5 | 6 |

**If the stage-2 pass exceeds the tier cap, OR any call-out or summary bullet runs to 4+ lines of dense prose, the synthesis is misshapen — do not raise the cap or accept the bloat, re-cut at a higher level of abstraction.** Almost always, 2-3 of those call-outs are sub-decisions of one larger fork (file path, flag name, JSON key behavior, and dependency choice are usually four facets of one "how to extend the existing scaffold" decision, not four independent forks). Collapse related call-outs into a single decision named at the level the user actually weighs in on. The user's job is to redirect forks, not to validate every implementation consequence of a fork they have already implicitly agreed to by accepting the higher-level decision.

A useful test: read the call-outs aloud. If two or more sound like "and also" extensions of the same idea, they belong as one.

### Anti-patterns in call-outs

Each anti-pattern below produces a call-out that fails the affirmability test. If a candidate call-out matches one of these, it is plan-body content — cut, do not rephrase.

- Names a file path or module name (`internal/artifacts/pii.go`)
- Names a flag, env var, or exact env value (`--accept-redaction-list=<finding-id,...>`)
- Specifies a JSON shape, response format, or exact data structure
- Names HTTP status codes, event names, or exact error wording
- Describes implementation flow ("first X, then Y, then Z")
- Names exact method signatures, call graphs, or SQL syntax
- States a mechanical choice with no real alternative ("uses stdlib regexp")

The line-number, signature, and code-spec rules are not new — they have always been forbidden in Inferred bullets. They apply equally to call-outs, which are now the user-facing surface.

---

## When to skip the blocking confirmation

The auto-proceed path (announce without waiting for user confirmation) fires only when **plan depth is Lightweight AND zero call-outs survive the keep test**. For Standard or Deep plans, always fire the confirmation gate even when zero call-outs survive — substance earns the checkpoint, not interaction history. A Deep plan with rich silent decisions and a 1-3 line summary is exactly the case where rubber-stamping is most likely; the explicit confirmation request gives the user a real chance to push back before research or plan-write proceeds.

When auto-proceed applies (Lightweight + zero call-outs), emit a one-line announcement and continue:

```
Planning: [1-3 line summary]

No open decisions to weigh in on — proceeding to [research / plan-write]. Interrupt if I have the scope wrong.
```

The announcement is mandatory when skipping — silent proceeding is not allowed. The "why" (no forks worth flagging) must be visible.

For Standard/Deep with zero call-outs, the confirmation template still fires; the "Call outs:" header is simply omitted. The user gets the summary plus the explicit confirmation request.

There is a third skip condition: the **opt-in `SKIP_SCOPING_CONFIRM` setting** (Phase 0.0 — `confirm:auto` token or the `plan_skip_scoping_confirm` config key). When it resolves to skip, the gate auto-proceeds for *any* tier or call-out count — the user has pre-authorized it. The announcement is still mandatory (it names that confirmation is off and that inferred scope landed in `## Assumptions`), and the skip is scoped to this confirmation only: genuine blocking questions and the Phase 5.4 menu still fire. This differs from headless mode only in that announcement — headless has no synchronous user to announce to.

When the opt-in skip applies, emit this announcement — **not** the auto-proceed template above. The opt-in skip fires for *any* tier and call-out count, so claiming "No open decisions to weigh in on" would be false whenever call-outs survived; the announcement instead names that confirmation is off and that inferred scope is recorded under `## Assumptions`:

```
Planning: [1-3 line scope claim]

Scoping confirmation is off, so I'm proceeding to [research / plan-write] without waiting. Inferred scope is recorded under Assumptions in the plan — interrupt if I have it wrong.
```

---

## Synthesis structural discipline (shared)

Both variants share these structural rules. They address failure modes where the synthesis becomes a Phase 5.2 (plan-write) preview instead of a scope checkpoint.

**Summary leads, call-outs follow** — not the reverse, and no separate framing block above. Putting extensive content ABOVE the synthesis (an approach pitch, files-touched bullets, rationale block) inverts the structure: the synthesis becomes a footnote to the proposal instead of the proposal being a tier-budgeted summary the call-outs depend on.

**Anti-pattern: synthesis as plan-pitch.** Plan-body content — file paths, code shapes, sentinel strings, exact error messages, "Recommendation" / "Behavior when X" / "Why this shape" rationale — does not belong in chat output regardless of where it appears: not in a block above the call-outs, not inside the summary, and not nested in a call-out's commentary or sub-bullets. The position rule and the content rule are independent: a structurally-legal placement (inside a call-out bullet) does not legitimize plan-body content. If you find yourself writing it anywhere, stop. That content is Phase 5.2 (plan-write) territory — it belongs in the plan body the next phase will write, not in the synthesis presentation. The synthesis is a scope/decisions checkpoint: a tier-budgeted summary plus call-outs bounded by the tiered cap (see "How many call-outs are right?"). Implementation detail leaking into the synthesis (anywhere) is a sign Phases 1-4 (research and structuring) and Phase 5.2 (plan-write) have collapsed into the synthesis-confirmation step.

**Anti-pattern: numerical attestation.** "All nine requirements covered," "all three flows in scope," "five acceptance examples addressed," counts of files or test scenarios. These are the agent showing its work or attesting completeness, not naming scope decisions. "Covers the full brainstorm scope" already conveys the claim; the count adds nothing the user can affirm or redirect. Cut the numbers; keep the scope claim.

**A revision is not a confirmation.** After any user revision (even a trivially-understood swap), integrate the change, re-present the revised stage 2 with the change reflected, and wait for explicit confirmation before writing the plan. The loop is:

1. Present stage 2 → user responds
2. User confirms → write the plan
3. User revises → integrate, re-present revised stage 2, return to step 1

Plan-write (Phase 5.2) fires only on explicit confirm or after the soft-cut blocking question's "proceed" option. Never write immediately after a revision, even when the revision is small enough that the agent feels it understood — the confirmation step is what makes the synthesis **confirmed** rather than "agent's last proposal."

---

## Granularity: name the decision; don't expand it (shared)

Each call-out should be affirmable or rejectable by the user **without reading code**. Name the decision at the granularity that lets the user say "yes" or "I want X instead." Anything more specific is plan-body content — Phase 5.2's job, not synthesis's.

**Allowed** (when these ARE the decisions being made):
- File / module names — "skip filter in the matcher" when "where to put it" is the choice
- Pattern names — "extends the existing event-skip pattern" when "extend vs. introduce" is the choice
- Column / table names — "user-TZ" or "destination-calendar TZ" when "which source" is the choice
- Approach posture — "DB-side query with Google-side fallback" when "which strategy" is the choice

**Not allowed** (always plan-body, regardless of variant):
- Line numbers (`route.ts:249-255`)
- Exact method signatures, call graphs, or implementation flow ("at the top, before include/exclude evaluation, returning ...")
- Exact JSON / response shapes (`{pause, cleanup: {eventsDeleted, eventsFailed, errors}}`)
- HTTP status codes (`409`, `404`, `403`)
- Exact event / activity-log / type names (`userPauseSet/userPauseEdited/...`)
- Exact wording of error messages or UI labels
- SQL syntax or query bodies

The line is drawn slightly differently per variant. **Solo (Phase 0.7)** stays at the higher level — brainstorm's WHAT hasn't been validated yet, so file/module names are usually too specific; talk in terms of "the rule entity," not "syncRules table." **Brainstorm-sourced (Phase 5.1.5)** allows the file / module / pattern / column level when those ARE plan-time decisions, but not implementation flow specifics.

### Bad-vs-good examples

| Plan-body in call-out (wrong) | Decision-level (right) |
|---|---|
| Timezone source: `users.timezone` (IANA), fallback to destination calendar TZ if null. Research found `useTimezoneSync` and `ProtectionStatsCalculator` establish the pattern. | Timezone source: user-TZ (reverses brainstorm's tentative lean — research found established infra and pattern precedent) |
| Skip filter goes in `RuleMatcher.eventMatchesRule` at the top, before include/exclude evaluation, using the existing `filteredReason` mechanism. | Skip filter extends the existing event-skip pattern in the matcher (vs. introducing a new mechanism) |
| Reactivation guard: explicit safety in `[ruleId]/route.ts` PATCH — when `isActive: false → true`, the existing handler clears `status/pausedAt/pausedReason`. | Reactivation guard: pause window state preserved through the isActive toggle's existing system-pause-clearing path |
| Partial cleanup failure response: `{pause, cleanup: {eventsDeleted, eventsFailed, errors}}`; pause window persists regardless of cleanup outcome. | Partial cleanup failure: pause window persists; partial-failure response mirrors the existing rule-edit precedent |

The test: a scanner reading a call-out should affirm or reject it without needing to read code. If they would have to look up a column name, method name, or call graph to evaluate the call-out, the granularity is wrong — that's plan-body content.

### Worked example: compression from internal draft to call-outs

For a PII redaction gate proposal where the internal draft had 4 Stated items, 7 Inferred items, and 3 Out-of-scope items, the compressed stage 2 looks like:

```
Planning a mechanical PII redaction gate before promote (the unguarded leak path from the amazon-orders retro) and alongside the existing vendor-prefix scanner at publish. Phase-1 detectors are shape-only — card last-4, postal address, JSON person names. Default halts; per-finding ack via flag.

**Call outs:**
- Person-name filter works by JSON key (allowlist of attribution keys: `printer`, `printer_name`, `owner_name`, `author`), not by name value.
- Promote scans the working-dir snapshot before the copy step, not the staged copy.
- Publish combines PII + vendor-prefix findings into one report, not fail-fast on first.

Confirm and I'll proceed to research, drawing on this scope.
```

What got cut from the internal draft and why:

- "Module name: `internal/artifacts/pii.go`" — plan-body content (file path), fails affirmability test
- "Flag name: `--accept-redaction-list=<finding-id,...>`" — plan-body content (exact flag string), fails affirmability test
- "No new dependencies — stdlib regexp + filepath.WalkDir only" — mechanical, no real alternative
- "Detector regex precision tuned during implementation" — deferred-impl, not a plan-time fork
- All three Out-of-scope items — either restated in prose ("defer to #960") or implicitly excluded by scope

What survived: three real forks where another reasonable agent might choose differently and the user can correct cheaply now. Each is affirmable in one sentence without reading code.

---

## Solo variant (Phase 0.7)

Fires only when:
- Phase 0.2 found no upstream brainstorm doc
- AND Phase 0.4 stayed in ce-plan (did not route to ce-debug, ce-work, or universal-planning)
- AND Phase 0.5 cleared (no unresolved blockers)
- AND not on Phase 0.1 fast paths (resume normal, deepen-intent)

Each guard is an explicit conditional in SKILL.md, not implicit. R2 solo does NOT fire on resume/deepen, route-out, or brainstorm-sourced paths.

**Content focus**: full-breadth internal draft. Phase 0.4 bootstrap is brief by design ("ask one or two clarifying questions"), so the agent has made substantial inferences before Phase 0.7 fires. The Inferred bucket in the internal draft is especially load-bearing here — the agent's bets are widest. Stage 2 compression still applies: most of those inferences will not survive the keep test, and that is correct — the user should only see the forks they can meaningfully redirect.

**Counter-warning for rich-context invocations.** When the inference source is *not* just Phase 0.4 bootstrap — e.g., a prior in-conversation validation agent, completed sibling work units earlier in the same session, or a planning artifact already in the conversation — the temptation is to dump that material into call-outs verbatim. The granularity rules tighten in this case, not loosen: the agent has more material to compress, not more material to expose. A bet that's already been validated upstream is **Stated** (internal), not Inferred (internal); a bet whose specifics belong in plan-body is named at decision-level in the call-out regardless of how much detail upstream context provided. If recent turns produced detailed code, file paths, or research artifacts, expect the internal draft to over-share and compress proactively before stage 2.

**Why pre-research, not pre-write**: research effort would be wasted if scope is wrong. Catching scope errors before sub-agent dispatch (Phase 1.1's repo-research-analyst, learnings-researcher, etc.) saves token and time cost.

### Stage 2 template (solo)

**Summary discipline (required):** describe **what scope the plan will target**, forward-looking (what *will* be planned), not retrospective. The summary's job is to help the user pattern-match against intent before reading call-outs — solo invocation has minimal pre-write dialogue, so the summary is especially load-bearing here. Form (prose, bullets, mix) and length follow the tier budget in "Stage 2: chat-time scoping synthesis" above; detail test applies per bullet.

**Anti-fluff guidance:** lead with the actual thing being planned in plain words. No qualifiers ("comprehensive," "thoughtful," "substantive"). No re-stating the user's prompt. If the scope cannot be said within the tier budget without filler, the synthesis isn't ready yet.

**Confirmation template (fires for Standard/Deep regardless of call-out count, or for any tier with one or more call-outs surviving):**

The opener defaults to "Based on your request" — add "and our brief discussion" only when the Phase 0.4 bootstrap actually involved back-and-forth clarifying questions. Solo invocations often proceed with no dialogue, and claiming a discussion the user didn't have reads as off.

```
Based on your request, here's the scope I'm proposing to plan against:

[scope claim — what the plan will target, what it will not; affirm-or-redirect level; NOT an enumeration of Implementation Units]

**Call outs:** (omit this header when zero forks survived the keep test)
- [decision-level fork in 1-2 lines: name the choice and optional one-clause trade-off in parens. NO multi-sentence rationale, NO "my default is X" pitch — those belong in Key Technical Decisions in the plan body, not the synthesis]

Confirm and I'll proceed to research, drawing on this scope. (You can also redirect to /ce-brainstorm if this is bigger than you initially thought — I'll stop here and load it for you.)
```

**Auto-proceed template (fires only for Lightweight with zero call-outs):**

```
Planning: [1-3 line scope claim]

No open decisions to weigh in on — proceeding to research. Interrupt if I have the scope wrong.
```

Then continue to Phase 1 without waiting. Use prose for any user response that does arrive (no `AskUserQuestion` menu). Justification is Interaction Rule 5(a) in SKILL.md.

---

## Brainstorm-sourced variant (Phase 5.1.5)

Fires only when:
- Phase 0.2 found upstream brainstorm doc (brainstorm-sourced invocation)
- AND not on Phase 0.1 fast paths

**Content focus**: plan-time decisions only. The brainstorm + R1 synthesis already validated WHAT to build; the internal draft and stage 2 surface HOW the plan will execute that work — decisions the brainstorm did not make.

Items to surface in the internal draft:
- **Files/modules to touch (and not touch)** — what the implementation reaches into
- **Patterns extended vs. introduced new** — architectural decisions the agent made within confirmed scope (R2's content focus, not bias toward either direction)
- **Test scope** — which existing-but-untested code is in/out of test scope for this work
- **Refactor scope** — adjacent cleanup, if any, going to deferred items vs. active diff
- **Cross-cutting impact** — auth, migrations, shared types when they're touched

Most of these will not survive the keep test as separate call-outs. Surface only the forks where another reasonable agent might choose differently and the user can correct cheaply now.

**Reads from the Product Contract, not a synthesis section**: the upstream artifact is a requirements-only unified plan (`product_contract_source: ce-brainstorm`), not a separate brainstorm doc, and it has no `## Synthesis` section (the synthesis is a chat-time artifact in ce-brainstorm; only the prose summary embeds, under the Product Contract). Phase 5.1.5 derives plan-time decisions from the Product Contract's sections — Summary, Problem Frame, Requirements, Key Flows, Scope Boundaries — plus Phase 1 research. Legacy standalone requirements docs (`origin: docs/brainstorms/...`) and older brainstorms that may carry a legacy `## Synthesis` section still work; that content is treated as supplementary, not authoritative, with the Product Contract / body sections taking precedence.

**Why pre-write, not pre-research**: brainstorm doc + R1 synthesis already validated WHAT, so research is well-targeted. Plan-time decisions emerge during research and structuring (Phases 1-4), so pre-write catches them at the latest cheap moment — before Phase 5.2 commits the plan to disk.

### Stage 2 template (brainstorm-sourced)

**Summary discipline (required):** describe **how the implementation approaches the work** at a high level — files/modules touched, patterns extended vs. introduced, scope boundaries the plan honors. Forward-looking (what *will* be in the plan), not retrospective. Brainstorm-validated WHAT is assumed; the summary covers HOW. Form (prose, bullets, mix) and length follow the tier budget in "Stage 2: chat-time scoping synthesis" above; detail test applies per bullet.

**Anti-fluff guidance:** lead with the actual implementation shape in plain words. No qualifiers, no re-stating the brainstorm's WHAT. If the summary just restates the brainstorm's Problem Frame, rewrite it to focus on plan-time decisions.

**Confirmation template (fires for Standard/Deep regardless of call-out count, or for any tier with one or more call-outs surviving):**

```
The brainstorm scopes [1-2 sentence restatement of the brainstorm's scope as orientation; in the brainstorm's own vocabulary; NOT an enumeration of Implementation Units, constraints, or acceptance examples].

This plan [plan-specific scoping: what's covered vs. deferred vs. expanded relative to the brainstorm; test scope; any adjacent refactors pulled in or held out. Prose or bullets per substance].

**Call outs:** (omit this header when zero forks survived the keep test)
- [plan-time fork in 1-2 lines: name the choice and optional one-clause trade-off in parens. NO multi-sentence rationale, NO "my default is X" pitch — those belong in Key Technical Decisions in the plan body, not the synthesis]

Confirm and I'll write the plan next, drawing on the brainstorm, research, and this synthesis.
```

**Auto-proceed template (fires only for Lightweight with zero call-outs):**

```
Planning [brief brainstorm-scope restatement] — [plan-specific shape in one clause].

No open decisions to weigh in on — proceeding to plan-write. Interrupt if I have the scope wrong.
```

Then continue to Phase 5.2 without waiting. Use prose for any user response that does arrive. Justification is Interaction Rule 5(a).

---

## Soft-cut on circularity (shared)

Track which call-outs the user touched per round. The soft-cut blocking question fires **only when the same call-out is revised twice** (or a third-round revision targets a call-out already revised in round two). New-call-out revisions across rounds proceed without limit.

**Identity across rounds is by decision dimension, not surface wording.** A revision may cause stage 2 to re-derive — the same underlying fork can come back rephrased, merged with another call-out, or split into two. "Same call-out" means the same decision being made (e.g., "where does the scan run" stays one decision whether it's worded as "promote scans the working-dir snapshot" or "scan target: pre-copy working dir"). When a re-cut collapses multiple prior call-outs into one, the new combined call-out inherits the "touched" status of any of its constituents — soft-cut fires if any of those underlying decisions was already revised once before.

When the soft-cut fires, use the platform's blocking question tool with two options:

- `Proceed and continue to [research / plan-write]`
- `Hold off — keep discussing before continuing`

Fall back to numbered list in chat only when no blocking tool exists or the call errors. Never silently skip.

---

## Headless mode (shared)

When the skill is invoked from an automated workflow such as LFG or any `disable-model-invocation` context, the skill runs in non-interactive mode (no synchronous user). The artifact is read by downstream skills (ce-doc-review, ce-work) and human reviewers (PR review).

**Stage 2 is moot in headless mode.** Compose the internal draft (stage 1) as usual, but skip the chat-time compression — there is no synchronous user to confirm to, no call-outs to derive, no auto-proceed announcement. Route the internal draft directly into the plan body via the doc-shape table below.

**Per-variant behavior** (the timing matters for which phases follow):

- **Solo variant (Phase 0.7)**: fires *before* research. Compose the internal draft and continue to Phase 1 research as normal. Inferred content is held until plan-write (Phase 5.2), where it routes to `## Assumptions`.
- **Brainstorm-sourced variant (Phase 5.1.5)**: fires *after* research, before plan-write. Compose the internal draft and proceed to Phase 5.2 plan-write. Inferred content routes to `## Assumptions`.

**Shared behavior across both variants:**

- **No user prompt; no stage 2; no auto-proceed announcement.** All three are moot.
- **Route internal-draft content with mode-aware shape** (nested under Product Contract / Planning Contract in a `ce-unified-plan/v1` artifact; top-level `##` headings in a legacy standalone plan):
  - **Stated** content → Product Contract `### Requirements` (user-stated constraints, traced to origin's R-IDs when present)
  - **Out-of-scope** content → Product Contract `### Scope Boundaries`
  - **Inferred** content → Planning Contract `### Assumptions` — explicitly labeled as un-validated agent bets. Do NOT route Inferred items into Key Technical Decisions or Implementation Units; that would make un-validated bets indistinguishable from user-confirmed decisions.

The `### Assumptions` section appears in non-interactive plans and in interactive plans where the user opted into `SKIP_SCOPING_CONFIRM` — both cases proceed without confirming Inferred bets, so those bets must stay visibly labeled. A normal interactive plan doesn't need it (Inferred bets either get user-corrected via call-outs and become Key Technical Decisions, are revised away, or were judged not-fork material by the keep test and dissolved into Implementation Units silently).

This restores the audit visibility the original design intended (un-validated bets must not propagate as authoritative content), but surfaces them under their own label rather than hiding them. Downstream review (ce-doc-review, ce-work, human PR review) can scrutinize Assumptions specifically.

---

## Self-redirect (shared)

If the user response indicates they're in the wrong skill or want a different workflow:

- **Solo variant**: common redirects include "this is bigger than I thought — let me brainstorm first" (suggest `/ce-brainstorm`), "this is just a fix, no plan needed" (suggest `/ce-work`), or "I need to investigate first" (suggest `/ce-debug`).
- **Brainstorm-sourced variant**: less common, but possible — "actually this scope is wrong, take it back to brainstorm" (suggest `/ce-brainstorm` to revise the upstream doc).

In either case: stop ce-plan, suggest the alternative skill, offer to load it in-session. Don't push back or argue — the user's redirect signal is the deliberate choice.

---

## Doc shape after confirmation

After user confirmation (or after the soft-cut decision proceeds), Phase 5.2 writes the plan doc. The internal draft does NOT carry into the plan as a `## Synthesis` section. Only the stage-2 summary embeds, under the Product Contract's `### Summary`. Internal-draft content dissolves into the unified plan's sections. In a `ce-unified-plan/v1` artifact these destinations are nested — Summary, Problem Frame, Requirements, and Scope Boundaries live under `## Product Contract`; Key Technical Decisions and Assumptions live under `## Planning Contract`; Implementation Units is its own top-level section. (Legacy standalone plans without `artifact_contract` keep these as top-level `##` headings.)

| Internal-draft element | Where it goes in the unified plan |
|---|---|
| Summary (stage 2) | Product Contract `### Summary` (1-3 lines prose, forward-looking) — rewrite to plan convention if the chat-time summary used bullets. Solo variant: scope being targeted. Brainstorm-sourced: implementation approach |
| Stated bullets | Product Contract `### Requirements` (R-IDs) and where relevant `### Problem Frame` for narrative context |
| Inferred bullets | Planning Contract `### Key Technical Decisions` (with rationale) and Implementation Units when the bet drives a structural choice. In non-interactive mode **or an interactive `SKIP_SCOPING_CONFIRM` skip run**, route to Planning Contract `### Assumptions` instead — both proceed without confirming the bets, so they must stay labeled; see Headless mode above. |
| Out-of-scope bullets | Product Contract `### Scope Boundaries` — including the `#### Deferred to Follow-Up Work` subsection when relevant |

No italic capture-context note (e.g., "Captured at Phase 0.7..."). It would leak engineering process into an artifact whose readers do not need that signal.

The Product Contract's `### Summary` and `### Problem Frame` must serve distinct purposes: Summary answers "what is this plan proposing?" (forward-looking, 1-3 lines); Problem Frame answers "why does this proposal exist?" (backward-looking, paragraphs). Don't restate the proposal in Problem Frame; don't pad Summary with situational context.

---

## What does NOT belong in the synthesis

- Implementation code (no imports, exact method signatures, framework-specific syntax, JSON shapes, exact error message wording) — in chat output OR in the internal draft
- Re-statement of the entire brainstorm doc — the synthesis is plan-perspective, not a copy
- Defensive what-ifs and hedges — if a concern is real, state it as Inferred (internal); if speculation, drop it
- The internal three-bucket draft pasted into chat as a verbatim user-facing artifact — that was the old shape and the volume problem it produced is why stage 2 exists. Compose internally, derive call-outs, present compressed
- Open questions surfaced outside the buckets/call-outs — by synthesis time, every scope-shaping question must be in **Stated** (internal — asked and answered earlier), **Inferred** (internal — agent's bet for correction, surfaces as a call-out if it survives the keep test), or **Out** (internal — deliberately excluded). There is no fourth status
- Floating questions adjacent to stage 2 — if a question genuinely cannot be defaulted, pause synthesis and resolve it before presenting. Pick the question shape that matches: a blocking multiple-choice tool when options are bounded and meaningfully distinct, prose when option sets would bias the answer per Interaction Rule 5(a). Integrate the answer, then present stage 2. Never present stage 2 with adjacent floating questions — that gives the user no clear resolution path
