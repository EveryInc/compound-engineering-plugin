### Stage 5: Merge findings

Convert multiple reviewer compact JSON returns into one deduplicated, confidence-gated finding set. Use `scripts/findings-mechanics.py` from this skill's directory for schema/value validation, exact-fingerprint deduplication, conservative route merging, quote/confidence gates, deterministic sorting, and stable numbering. These are mechanics, not model judgment.

Write the compact reviewer returns as a JSON array, then run the command below exactly. Do not inspect the helper source or run its `--help`; its contract is this reference and its JSON output.

Input is one JSON array of reviewer-return objects. Output is one object with `findings`, `pre_existing_findings`, `suppressed_findings`, `suppressed_by_confidence`, `malformed_findings`, and `malformed_returns`; use those fields directly and do not inspect implementation to infer additional behavior.

```bash
SKILL_DIR="<absolute path of the directory containing the SKILL.md you just read>";
python3 "$SKILL_DIR/scripts/findings-mechanics.py" < "$RUN_DIR/raw-returns.json" > "$RUN_DIR/mechanical-findings.json"
```

Before the first helper run, load every available per-reviewer artifact and build a source-detail map keyed by reviewer plus the helper fingerprint: normalized `file`, string `line`, and whitespace-normalized lowercase `title`. The map owns each source finding's `why_it_matters` and `evidence`; compact returns are merge inputs, not final report objects.

Inspect the helper's `findings`, `pre_existing_findings`, and `suppressed_findings` for semantic duplicates that use different wording or nearby anchors, for the direct-dependency exception, and for settlement conflicts below. Merge only when candidates describe the same defect and fix path. If semantic reconciliation, direct-dependency reclassification, or settlement stamping changed the set, serialize every reconciled candidate from all three partitions as one valid synthetic reviewer return and run the helper again to restore deterministic gates, partitions, sort order, and numbering. Never ask the helper to decide semantic equivalence or settlement conflicts. When reconciling a semantic duplicate, carry its original source-map keys alongside the candidate in working memory so detail hydration does not depend on the rewritten title. The helper's deterministic `suppressed_findings` partition is not primary review output; after settlement reconciliation, inspect it for the soft-bucket route below, then discard the remainder while preserving `suppressed_by_confidence` counts.

Then apply only the judgment the helper cannot own:

1. **Semantic reconciliation.** Merge differently worded findings only when they describe the same defect and fix path. Keep disagreements visible. Union the mechanics-produced `reviewers` and `independent_reviewers` lists from the merged candidates; never add an identity to `independent_reviewers` merely because it appears in `reviewers`. A pre-existing gap stays primary only when the new change directly depends on it for correctness; mark that reconciled candidate `pre_existing: false` before the final helper pass. Nearby cleanup remains pre-existing.
2. **Settled decisions.** Inspect both surviving `findings` and `suppressed_findings`. If a finding merely prefers an alternative to a `session-settled:` KTD, stamp `settled_conflict`, route it advisory/human, and include it in the synthetic rerun so the helper preserves it in the primary report. Never apply it. Do not demote a real defect or evidence that the settled approach cannot work. Honor inferred-plan settlements only when the match is unambiguous.
3. **Restore mechanics.** After semantic reconciliation, direct-dependency reclassification, or settlement stamping, rerun the helper with every reconciled candidate, including unchanged primary and pre-existing candidates plus stamped and unstamped suppressed candidates. It enforces the quote-the-line gate, discrete confidence anchors, exact dedup, independent-agreement promotion, conservative routing, pre-existing partition, confidence gate, deterministic sort, and stable `#` numbering. `fast-pass` never promotes confidence; an `adversarial-<provider>` peer promotes only when `independence_verified: true`. Peer findings never carry apply authority.
4. **Soft-bucket demotion before validation.** After the final helper pass, inspect both surviving `findings` and the remaining `suppressed_findings`. Keep every `settled_conflict`-stamped finding primary as required by Stage 5 step 2.
   - A current P0/P1 remains primary unless it is a semantic duplicate, validated false, preference-only settled conflict, or genuinely pre-existing. Never move it to `residual_risks` or `testing_gaps` merely because only one reviewer found it. Findings with different failure modes or fix paths are not duplicates even when they touch the same lines (for example, awaiting a ledger append does not solve a later publish-failure retry that appends twice).
   - For testing-only absence-of-coverage findings, keep at most one umbrella primary finding per changed subsystem when the lack of tests is itself material; move narrower case-by-case coverage findings to `testing_gaps` regardless of their persona severity.
   - Move a single-reviewer P2/P3 advisory from `testing` to `testing_gaps`, and from `maintainability`, `reliability`, or an adversarial reviewer to `residual_risks`, unless it quotes an explicit violated contract or proves a current user-facing defect.
   - Do not widen a repository contract with an assumed deployment topology or process lifetime. A claim that requires unproven restarts, multiple instances, or infrastructure behavior is a residual risk unless the changed code or repository evidence establishes that operating condition and its violated guarantee.
   - Suppressed candidates routed here remain absent from primary `findings`; discard all other `suppressed_findings` after this step. Record the mode-aware demotion count. Only the remaining primary set enters Stage 5b.

**Detail hydration gate (before validation and rendering).** Hydrate every retained primary and pre-existing finding from its source-detail map entries. For exact merges, union and deduplicate the contributing `evidence` arrays and keep the most specific source `why_it_matters`; for semantic merges, use the carried original source-map keys. `actionable_findings` later reuses these hydrated objects rather than rebuilding a compact subset. Every retained finding must have a non-empty `why_it_matters` string and non-empty `evidence` array. If an artifact is unavailable or malformed, re-read the cited changed line and use `first_evidence` when present to reconstruct only directly verified detail. Never invent impact from the title alone. If the required fields still cannot be established, drop the candidate as malformed before Stage 5b and record it in Coverage; never emit a partial finding in markdown, `mode:agent`, or `review.json`.

5. **Partition work.** The actionable queue is `gated_auto` or `manual` plus owner `downstream-resolver`; advisory and human/release-owned findings are report-only. Reuse the helper's stable `#` everywhere.
   A concrete current P0/P1 with a specific code or test response belongs to `downstream-resolver` even when the subsystem is financially or operationally sensitive; the downstream caller still reviews, applies, and verifies it. Use owner `human` only when the next step genuinely requires a product/design decision, unavailable authority, external coordination, or release action. Reviewer caution and `requires_verification:true` do not by themselves remove a fixable defect from the caller's actionable queue.
   Before rendering, normalize every concrete P0/P1 to `downstream-resolver` unless its report entry names the specific product/design choice, unavailable authority, external dependency, or release decision that blocks implementation. A broad redesign, several related edits, or sensitive code is not such a blocker. The Actionable Findings section contains only the resulting `downstream-resolver` queue; human/release-owned items appear as decision gates outside it.
6. **Build thematic triage groups.** Group related findings so the reader can triage themes instead of items. This is distinct from deduplication: groups never merge findings or change severity, confidence, route, owner, or stable `#`. Groups span the full primary set.
   - **`grouping:off`:** skip this step.
   - **`grouping:auto` (default):** build groups when findings span distinct concerns — the trigger is distinct concerns, not item count (mirroring how plan Requirements group by capability). Skip only when all findings are genuinely about the same thing; prefer no groups over decorative single-item groups.
   - **`grouping:always`:** always build groups; use single-finding groups only when no meaningful multi-finding grouping exists.
   - **Grouping signals:** shared root cause, affected subsystem, user-facing failure mode, overlapping fix path, dependency ordering, or repeated symptoms of one design choice.
   - **Group shape:** short title, the included stable finding `#`s, one-line context, preferred resolution, and why — when one fix path resolves several findings, name it and say which finding to handle first.
   - **Ordering:** order groups by the highest-severity finding they contain, then by lowest stable `#`. A finding appears in at most one group; leave genuinely unrelated findings ungrouped.
7. **Collect coverage and advisory assets.** Keep helper drop/suppression counts, union residual risks and testing gaps, and preserve any selected learnings, agent-native, and deployment-verification outputs. Schema drift from `data-migration` is already in the merged finding set.

### Stage 5b: Validation pass (optional quality gate)

Independent verification remains required for findings that lack cross-model corroboration. Do not spend another model call re-verifying evidence already established independently across serving families.

1. Skip a validator only when the finding has `first_evidence` and both an ordinary reviewer plus an `adversarial-<provider>` reviewer whose artifact records `independence_verified:true`. Same-model corroboration never licenses this shortcut. Record the skip count in Coverage.
2. Select every remaining P0/P1 and every remaining actionable finding, except preference-grade `settled_conflict` items. Single-source P0s are always selected. P2/P3 advisory items should already have moved to the soft buckets; do not validate them merely to keep them primary.
3. Put the selected set into **one** deterministic validator batch, ordered by severity and stable `#`, using `references/validator-batch-template.md`. Eight findings is the normal cap. When more than eight P0/P1 survive, expand that same batch past the normal cap to include every surviving P0/P1 rather than silently omitting a blocker; never split the work into another batch. The validator returns one independent verdict per finding. Cost, elapsed time, confidence, or a finding appearing mechanically obvious never licenses an additional skip; when the required validator cannot run, keep P0/P1 as validation-degraded and say so.
4. Run the validator batch foreground with background execution off. A foreground Agent call is the wait. Never use shell no-ops (`echo waiting`, `noop`, `yield turn`, `end turn`, `true`, or sleeps), scheduled wakeups, status/list calls, or narrated "still waiting" turns.
5. A valid `validated:false` drops that finding and records the reason. On malformed output or validator infrastructure failure, drop affected P2/P3 findings; keep affected P0/P1 as validation-degraded. Prune triage groups after drops and record the batch, per-finding verdicts, failures, and degraded blockers in Coverage.

### Stage 5c: Act on findings (explicit local apply only)

**Skip unless local apply was explicitly authorized.** A bare `ce-code-review` invocation is report-only and does not apply findings. Authorization exists only when `apply:local` was passed or the invoking user prompt explicitly asked this review to apply/fix its findings. Do not infer authority from `autofix_class`, a clean tree, an actionable finding, or the fact that another workflow may apply later. `mode:agent` does not apply fixes and conflicts with `apply:local`; the pipeline caller owns any later mutation.

`apply:local` is authority, not an output mode: presentation remains markdown and reviewer selection is unchanged.

**Act policy (bias to act).** Default to applying every finding that is a clear improvement and a reversible edit, regardless of severity. The work is a tracked, visible diff that can be reverted — so leaving a clean fix unapplied "to be safe" is the failure mode, not the safe choice. Decide by judgment, not a safety checklist:

- **Apply** clear improvements — the common case (test hardening, dead-code removal, a localized fix with a concrete `suggested_fix`).
- **Push back** — do not apply — when the reviewer is wrong; keep the finding and state the disagreement with reasoning.
- **Skip with judgment** taste calls and conflicting suggestions, but surface what was skipped and why. Never silently drop.

Severity, confidence, and cross-reviewer agreement tell you what to do first and what to flag loudly — they do not gate the decision. There is no deny-list: downside is controlled after the fact (revert + visible diff + the commit checkpoint), not by a precondition.

One exception: `settled_conflict`-stamped preference findings (Stage 5 step 2) stay report-only even when local apply is authorized — the bias-to-act rule does not apply to them. The user already chose against that alternative; reversing it is not this review's improvement to make.

**Scope invariant.** Apply only when the working tree *is* what was reviewed — `local-aligned` or standalone. In `pr-remote` / `branch-remote` the working tree is not the reviewed head; do not apply — report instead.

**Verify, then keep.** After applying, run the affected tests and lint (targeted by default; broaden when fixes span files). If they fail, revert that fix and report it as a finding instead — an unverified fix is not finished. Never leave the tree red.

**Review the autofix diff before finishing.** Before committing or reporting applied fixes, diff only the changes introduced during Stage 5c against the pre-apply checkpoint. Run one self-review pass over that diff:
- If the same helper, policy, or guard was added to multiple parallel surfaces, extract it or explain in the Applied section why duplication is intentional.
- If an exported/shared function now accepts a broader input shape, update the nearby docs, types, or tests that define the contract so future callers understand it.
- If a reviewer item is pure information (no defect, no code contract change, no test gap), classify it as advisory/non-actionable in Coverage or residual risks; do not patch it or describe it as a missed defect.
If this self-review changes files, rerun the affected tests or lint for those follow-up edits before committing or reporting; the earlier validation only covers the original autofix diff.

**Commit when the pre-review tree was clean.** Before applying, note whether the working tree already had uncommitted changes (`git status --porcelain`). The permanence gate is the **push**, not the commit — a local commit is private and reversible (`git reset --soft HEAD~1`).

- **Clean before the review:** after applying and verifying, commit the fixes as one isolated, review-labeled fix commit — `fix(review): <summary>`, or the repo's nearest convention if `review` isn't an allowed scope. Labeled and reversible, returning the tree to a known state.
- **Dirty before the review:** apply but do **not** commit — the fixes interleave with the user's in-flight work and ride along with the commit they were already going to make. The Applied section lists what changed.
- **Never push, open a PR, or file tickets** — that's the outward-facing step the user owns.

**Surface green-but-unverifiable edits.** When an applied fix touches auth/authz, a public or cross-service contract/schema, or concurrency/ordering, a passing test does not prove safety — flag it prominently in the Applied section so the diff reviewer's attention goes there.

**Re-partition triage groups after apply.** Triage groups describe the *remaining* work. After Stage 5c, prune applied findings out of `triage_groups` before Stage 6 rendering — a group must never tell the user to handle a finding that was already applied. When an applied fix resolved part of a theme, note that in the group's context line instead of keeping the applied `#` in the group. Re-apply the Stage 5 step 6 grouping rule (drop sub-two-finding groups under `grouping:auto`).

### Stage 6: Synthesize and present

Assemble the final report. **Default:** human-readable markdown. **`mode:agent`:** skip markdown and emit JSON (see ### JSON output format) — the structured fields are how a downstream agent consumes the review. Put `---` before the verdict in markdown mode.

**Report completion gate:** do not finish until stable `#` identifiers appear on every primary finding and the report contains `### Actionable Findings`, `### Coverage`, and `### Verdict` (or their exact JSON fields in `mode:agent`). Coverage must name the cross-model outcome and validator shortcut/batch outcome. The Actionable section must include every `downstream-resolver` finding; never silently replace it with a count.

**Before writing, load `references/review-output-template.md` and mirror its section skeleton** — that file is the canonical skeleton for *which sections appear and in what order*; its example shows one good rendering, not the only permitted layout. The direction below is the always-loaded fallback so it survives a long session even if the template was not reloaded.

**Presentation direction — optimize for the reader's next action (goal + considerations, not a fixed layout).** The report is *acted on*: by a human deciding what to fix and whether to merge, or by a downstream agent applying fixes. Shape it so that action is fast and well-founded.

- **Per finding, make four things unambiguous** (in whatever layout reads clearest): *what & where* — one scannable line, the symptom + `file:line`, not the mechanism; *why it matters* — what breaks or who's hit, never a restatement of the code; *what response it needs* — this varies by finding type: a bug states its fix, a **design call** presents the options and the tradeoff without forcing one answer, a coverage gap names the test and precedent to mirror, a residual risk is marked informational, an already-applied item gives what changed and how it was verified; *how sure* — confidence, and whether it was corroborated (cross-reviewer / cross-model agreement is the strongest signal — say so).
- **Let the shape serve the finding type; stay consistent within a section.** A terse table, a short keyed block, or a compact list are all fine — pick what reads clearest for that content. Consistency *within* a section matters; a single global shape does not.
- **Group by the unit of work or decision, not just severity.** Severity orders urgency; it does not tell the actor what *kind* of action a finding needs. Surface the split: **decisions a human must make** (design calls, ambiguous semantics) vs **mechanical work that can just be done** (tests, dedup, concrete fixes) vs **informational** (residual risks) — an agent clears the mechanical work and must stop at decisions. Group findings sharing a root cause or one fix (the Triage Groups) and name the order/dependency ("decide X once -> resolves #1 and #7; do #1 first"); the unit of work is often a group, not a finding.
- **Detail is earned by enabling the next action, not by demonstrating thoroughness.** Cover *every* finding — completeness is non-negotiable — but say each in the least that lets the consumer act. **Do not paste file contents or re-print the diff**; it is already in the repo/PR — cite `file:line` and spend words only on what the diff can't show (why it breaks, the fix, the repro). This governs *expression, never coverage*: never drop a finding or its why/fix to be shorter, and match weight to weight (a nit is one line; a P1 design call earns room).
- **The bottom is the most-read screen — make the closing self-sufficient.** In long output the reader's viewport lands at the end, so the **Verdict and Actionable list must stand alone without scrolling**: the verdict plus the single most important thing to do, then the prioritized actionable list where each item already carries severity, `file:line`, the terse what, and its response-type. The itemized findings above are drill-down evidence, referenced by stable `#`.

**Hard constraints (non-negotiable; everything above is judgment):**
- **ASCII-safe only — no box-drawing or per-item horizontal-rule separators (`────`, `———`), no Unicode arrows or middot (`·`); use `->`.** These break across terminals and violate repo convention. (The single report-level `---` before the verdict is fine.)
- **Stable `#` numbering from Stage 5** — never re-derive per section; reuse the same `#` everywhere a finding appears. A multi-file applied fix is one row with one `#`, never duplicated.
- **If you use a markdown table, escape literal `|` in cells as `\|`** so a pipe inside a title/regex/cache-key example doesn't split the row.
- **The Verdict and Actionable list are present, last, and self-sufficient.** This is satisfied by the closing, not the section skeleton: the Verdict is the final report section, immediately followed by the post-report prioritized Actionable recap (default mode — see *Emit actionable findings summary* below). The in-report `Actionable Findings` section keeps its skeleton position (5) as the detailed table; the recap is the self-sufficient last word the reader sees without scrolling. (If for some layout you cannot emit the recap, move the Actionable list itself to just after the Verdict.)

1. **Header.** Scope, intent, mode, reviewer team with per-conditional justifications.
2. **Applied (explicit local apply only).** When Stage 5c applied fixes, list them first — before the findings — in an Applied section (see review output template); each entry carries `#`, file, the fix, and reviewer (a multi-file fix is one row with one `#`), then a one-line validation outcome (e.g. "pin tests 4 -> 6; suite 94 pass, lint clean") and commit status (committed on a clean tree as `fix(review): …` or the repo's nearest convention, or left uncommitted for the user on a dirty one). Flag green-but-unverifiable edits (auth/contract/concurrency) prominently. Omit this section when local apply was not authorized or nothing was applied. Applied findings appear here, not in the severity tables.
2b. **Triage Groups.** When finalized `triage_groups` exist (post-validation, post-apply — Stage 5b step 5 / Stage 5c), render a `### Triage Groups` section before the findings as a compact table (`| Group | Findings | Context | Preferred Resolution | Why |`) — a table fits this content well. The `Findings` cell lists the stable `#`s it covers; the resolution names the order/dependency. **Mark whether each group is an apply-queue or a decision-gate** (so an automated fixer applies the mechanical groups and stops at the design calls). Every referenced `#` must appear in the findings below; groups supplement the findings, never replace them. Omit the section when `grouping:off` is active or no groups survived. In `mode:agent` this section is carried by the `triage_groups` JSON field instead.
3. **Findings.** Grouped by severity (`### P0 -- Critical`, `### P1 -- High`, `### P2 -- Moderate`, `### P3 -- Low`), rendered per the per-finding direction above and consistent within the section. Surface the decision-vs-mechanical split where it helps the actor (flag the design calls). Omit empty severity levels. Finding numbers come from the stable assignment in Stage 5 -- never re-derive them per severity section or triage group.
4. **Requirements Completeness.** Include only when a plan was found in Stage 2b. For each requirement (R1, R2, etc.) and implementation unit in the plan, report whether corresponding work appears in the diff. Use a simple checklist: met / not addressed / partially addressed. Routing depends on `plan_source`:
   - **`explicit`** (caller-provided or PR body): Flag unaddressed requirements or implementation units as P1 findings with `autofix_class: manual`, `owner: downstream-resolver`. These enter the actionable queue.
   - **`inferred`** (auto-discovered): Flag unaddressed requirements or implementation units as P3 findings with `autofix_class: advisory`, `owner: human`. These stay in the report only — no autonomous follow-up. An inferred plan match is a hint, not a contract.
   Omit this section entirely when no plan was found — do not mention the absence of a plan.
5. **Actionable Findings.** Include when the actionable queue is non-empty — findings the caller should address (`gated_auto` / `manual` with `downstream-resolver`), plus anything Stage 5c chose not to apply. When local apply ran, findings already applied appear in the Applied section, not here.
6. **Pre-existing.** Separate section, does not count toward verdict.
7. **Learnings & Past Solutions.** Surface `learnings-researcher` local-prompt results: if past solutions are relevant, flag them as "Known Pattern" with links to <root>/solutions/ files.
8. **Agent-Native Gaps.** Surface `agent-native-reviewer` local-prompt results. Omit section if no gaps found.
9. **Deployment Notes.** If the `deployment-verification-agent` local prompt ran, surface the key Go/No-Go items: blocking pre-deploy checks, the most important verification queries, rollback caveats, and monitoring focus areas. Keep the checklist actionable rather than dropping it into Coverage. Schema drift appears in the findings tables as `data-migration` P1 rows — do not add a separate Schema Drift section.
10. **Coverage.** Applied count (when Stage 5c ran), suppressed count by anchor (e.g., "N findings suppressed at anchor 50, M at anchor 25"), mode-aware demotion count, validator drop count and reasons (when Stage 5b ran), any P0/P1 with degraded validation (kept on validator infrastructure failure), residual risks, testing gaps, failed/timed-out reviewers, and inferred-intent uncertainty when applicable. When the Stage 3c lite roster ran, state it and the reduced reviewer set (so the narrower coverage is visible). When Stage 5b skipped validators for quote-anchored cross-model-corroborated findings, state how many and name that evidence basis; also state the one-batch result for every remaining selected finding. When the Stage 5 step 3 quote-the-line gate demoted any 75/100 finding for missing `first_evidence`, record that count. When no plan was discovered in Stage 2b (or discovery was ambiguous and skipped), note that settlement suppression was not evaluated. When the plan was `plan_source: inferred` and Stage 5 step 2 fired, note that settlement suppression was honored weakly (advisory-grade), with the settlement-conflict demotion count. **Removable surface (only when deletion-oriented maintainability findings exist):** one line giving the approximate net lines/files those findings would remove if applied (e.g., "Removable surface: ~120 lines / 2 files across findings #4, #7"). This is a dead-weight signal, **not** a reduction target — never lower the bar for a finding or invent deletions to grow the number, and omit the line entirely when no finding proposes a deletion.
11. **Verdict.** Ready to merge / Ready with fixes / Not ready. Fix order if applicable. When an `explicit` plan has unaddressed requirements or implementation units, the verdict must reflect it — a PR that's code-clean but missing planned requirements is "Not ready" unless the omission is intentional. When an `inferred` plan has unaddressed requirements or implementation units, note it in the verdict reasoning but do not block on it alone.

Do not include time estimates.

**Final check before delivering (default only).** Verify the hard constraints, not a layout: no box-drawing / per-item horizontal-rule separators (`────`), no Unicode arrows or middot (`·`) anywhere; stable `#`s consistent across sections; literal `|` escaped (`\|`) in any table cell; and **the closing stands alone** — a reader seeing only the last screen gets the verdict and the prioritized actionable list, each item carrying its severity, `file:line`, terse what, and response-type. Re-render anything that fails. Skip when `mode:agent` is active.

After the final artifact write returns, emit the final response immediately. The artifact write is the last tool call; never use `true`, `echo`, a placeholder transition, or any other tool call to create another turn before the final response.

### JSON output format (`mode:agent` only)

Emit **one raw JSON object** as the primary response — a single bare JSON value, **no markdown code fence**. A leading ```` ```json ```` fence makes the response start with backticks and breaks naive `JSON.parse` consumers, so never wrap it. Also write `review.json` under the resolved `<run-dir>` with the same payload.

`mode:agent` does not apply fixes — the caller does — so there is no `applied_fixes` field; the handoff is `actionable_findings`. Applied work surfaces only in explicitly authorized local-apply markdown runs (Stage 5c/6).

Minimum shape:

```json
{
  "status": "complete",
  "verdict": "Ready to merge | Ready with fixes | Not ready",
  "scope": {
    "base": "<merge-base sha, pr:NNN marker, or base: ref>",
    "branch": "<current branch name>",
    "head_sha": "<git rev-parse HEAD>",
    "pr_url": "<url or null>",
    "files_changed": 0
  },
  "intent": "<2-3 line summary>",
  "intent_confidence": "explicit | inferred | uncertain",
  "reviewers": ["correctness", "security"],
  "findings": [],
  "actionable_findings": [],
  "triage_groups": [],
  "pre_existing_findings": [],
  "requirements_completeness": null,
  "learnings": [],
  "agent_native_gaps": [],
  "deployment_notes": [],
  "residual_risks": [],
  "testing_gaps": [],
  "coverage": {},
  "artifact_path": "<resolved-run-dir>",
  "run_id": "<run-id>"
}
```

Each object in `findings` uses the merged finding fields: `#`, `title`, `severity`, `file`, `line`, `confidence`, `autofix_class`, `owner`, `requires_verification`, `pre_existing`, `suggested_fix`, `first_evidence`, `why_it_matters`, `evidence`, `reviewers`, `independent_reviewers`. The helper derives `independent_reviewers`; synthesis may preserve or union that list but must not infer it from `reviewers`.

Findings stamped by the Stage 5 step 2 settlement-conflict rule additionally carry an optional `settled_conflict` field naming the conflicting `session-settled:`-labeled KTD (its identifier or name). The field is absent on findings with no settlement conflict; consumers that do not recognize it ignore it.

`actionable_findings` lists the `gated_auto` / `manual` + `downstream-resolver` subset with the same fields plus stable `#`.

Each object in `triage_groups` carries `{ "title", "findings": [<stable #s>], "context", "preferred_resolution", "why" }` — the finalized groups from Stage 5 step 6 after Stage 5b step 5 pruning. Every referenced `#` must exist in `findings` (the full set) — **not** necessarily in `actionable_findings`. Groups are a triage **lens over all findings, not an apply queue**: a group (and its `preferred_resolution` ordering) can reference advisory or `human`/`release`-owned findings that the caller must not apply. So a caller batching related fixes by theme must first intersect each group's `findings` with `actionable_findings` and act only on that subset — the apply handoff stays `actionable_findings`, never `triage_groups`. Empty array when `grouping:off` is active or no groups were built.

On failure before review completes, set `"status": "failed"` and `"reason": "<one sentence>"`. When all reviewers fail, use `"status": "degraded"` with a reason. When a PR skip rule fires (closed/merged/trivial), use `"status": "skipped"` with the skip reason. Do not emit markdown tables when `mode:agent` is active.

## Quality Gates

Before delivering the review, verify:

1. **Every finding is actionable.** Re-read each finding. If it says "consider", "might want to", or "could be improved" without a concrete fix, rewrite it with a specific action. Vague findings waste engineering time.
2. **No false positives from skimming.** For each finding, verify the surrounding code was actually read. Check that the "bug" isn't handled elsewhere in the same function, that the "unused import" isn't used in a type annotation, that the "missing null check" isn't guarded by the caller.
3. **Severity is calibrated.** A style nit is never P0. A SQL injection is never P3. Re-check every severity assignment.
4. **Line numbers are accurate.** Verify each cited line number against the file content. A finding pointing to the wrong line is worse than no finding.
5. **Protected artifacts are respected.** Discard any finding that recommends deleting or gitignoring a CE pipeline artifact, per the Protected Artifacts rule in SKILL.md: any file under a `plans/`, `solutions/`, or legacy `brainstorms/` directory whose immediate parent is the artifact root (a directory named `docs`, or the configured `docs_root` when resolved). Categories nest (`solutions/<category>/`); a `references/personas/` skill asset, parented by `references`, is not a protected artifact.
6. **Findings don't duplicate linter output.** Don't flag things the project's linter/formatter would catch (missing semicolons, wrong indentation). Focus on semantic issues.
