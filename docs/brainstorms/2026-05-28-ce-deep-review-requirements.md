---
date: 2026-05-28
topic: ce-deep-review
---

# ce-deep-review: turnkey high-stakes plan review across Claude + non-Claude models

## Summary

A new `ce-deep-review` skill that orchestrates the existing three-pass high-stakes-plan review recipe end-to-end on any plan document. It runs the Claude 6-persona panel, opens an interactive consent gate that both authorizes egress and lets the user pick which auto-detected non-Claude models participate (codex, gemini, grok), fans the selected models out across the same six lenses, has the agent verify every cross-model finding against the doc, and writes a reconciled report as a sidecar file next to the plan. Adds Grok Build CLI as a third model in the underlying cross-model harness.

---

## Problem Frame

The deep-plan-review workflow (Claude panel + cross-model panel + reconcile) is a lever the team is still gathering evidence on. The cross-model eval established that the workflow decorrelates on validated bugs — it surfaces environment, credential, and sequencing failures the Claude panel alone misses — but the decision-grade run's verdict on whether the team-wide value clears the friction-and-egress cost is inconclusive / underpowered. This skill is the instrument that gathers that evidence in real use, not the productionization of a settled win. Running it today is a multi-tool, multi-context workflow:

1. The agent runs `ce-doc-review` (pass 1 — no egress).
2. The user opens a terminal, pastes `bash scripts/eval/cross_model_review/panel-critique.sh <plan>`, waits, and returns the records to the chat (pass 2 — egress, deliberately user-driven because the agent is hard-blocked from egressing proprietary content).
3. The agent reconciles, surfacing the decision-changing union — with a known confabulation risk on gemini findings the user is then asked to verify manually.

Three pain points compound:

- **The pass-2 hop is expensive in attention.** Switching to a terminal and running a bash command for every high-stakes plan is enough friction that the deep review gets skipped or deferred when it should not be.
- **Verification is the most error-prone step and is currently manual.** Gemini confabulates plausible-but-fake findings; the user, not the agent, currently checks each cross-model finding against the doc.
- **The workflow assumes a specific operator.** The harness was built for one developer who has codex + gemini + (now) grok installed and authenticated. Other internal developers will not have the same environment, and the current shape gives them no way to run the workflow at all if any one of those tools is missing.

Without a turnkey entry point that handles egress, verifies findings, and adapts to each developer's installed toolset, the deep review remains a power-user workflow rather than a team-available one.

---

## Actors

- A1. Plan author / reviewer (any internal developer): invokes `ce-deep-review` on a plan they have authored or want to vet. May or may not have all non-Claude CLIs installed.
- A2. The orchestrating agent (Claude): runs pass 1, mediates the consent gate, dispatches the cross-model arms, verifies cross-model findings against the doc, writes the reconciled report.
- A3. Non-Claude reviewer CLIs (codex, gemini, grok): produce cross-model findings under the same six lenses as the Claude panel; configured per-environment, opt-in per-run via the consent gate.

---

## Key Flows

- F1. Happy-path deep review with all three non-Claude models available
  - **Trigger:** A1 invokes `ce-deep-review <plan-path>`.
  - **Actors:** A1, A2, A3
  - **Steps:**
    1. A2 runs the Claude 6-persona panel (no egress).
    2. A2 probes the environment for installed-and-authed non-Claude CLIs; finds all three.
    3. A2 opens the consent gate: shows the three models as a multi-select (all unchecked by default — opt-in per model), previews the resolved plan path / byte count / any detected credential- or PII-shape pattern hits, and confirms permission to egress.
    4. A1 confirms; A2 fans the selected models out across the six lenses.
    5. A2 verifies each cross-model finding against the doc, tagging CONFIRMED / NOT-FOUND-IN-DOC / NEEDS-HUMAN.
    6. A2 writes the reconciled report to `<plan-path>.deep-review.md` and surfaces a summary in chat.
  - **Outcome:** A1 reads a single verified report listing the panel findings plus the decorrelated cross-model additions, each cross-model finding tagged with its verification status. Raw per-model records remain on disk under the existing `/tmp/cmre-panel/records/` path for audit.
  - **Covered by:** R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12

- F2. Partial-environment deep review (some non-Claude CLIs missing)
  - **Trigger:** A1 invokes `ce-deep-review <plan-path>` on a machine where one of the non-Claude CLIs is not installed or not authenticated.
  - **Actors:** A1, A2, A3 (subset)
  - **Steps:**
    1. A2 runs the Claude panel.
    2. A2 probes the environment; finds (e.g.) codex + grok installed, gemini missing.
    3. A2 opens the consent gate showing only the available models, with a brief note that the missing model was skipped and why (not installed / not authenticated).
    4. A1 confirms with the available subset.
    5. Remainder proceeds as in F1.
  - **Outcome:** A1 gets a deep review using the subset of models available in their environment, without manual configuration.
  - **Covered by:** R2, R3, R6, R7, R9

- F3. Panel-only deep review when zero non-Claude CLIs are available
  - **Trigger:** A1 invokes `ce-deep-review <plan-path>` on a machine where none of codex, gemini, grok is installed or authenticated.
  - **Actors:** A1, A2
  - **Steps:**
    1. A2 probes the environment; finds zero usable non-Claude CLIs.
    2. A2 runs the Claude panel.
    3. A2 writes a sidecar at `<plan-path>.panel-review.md` (distinct filename — `.deep-review.md` is reserved per R14 for verified cross-model output) whose frontmatter sets `coverage: panel-only` and whose header and chat banner state prominently `Panel-only deep review (no cross-model arm)` and name each missing CLI with its install/auth command (e.g., `grok login`, the codex install command, the agy install command).
  - **Outcome:** A1 gets the Claude panel work they implicitly asked for AND explicit visibility into what's missing — no silent degrade, no bounce. The header is what defeats silent failure, not refusal to run.
  - **Covered by:** R2, R13

- F4. User declines egress at the consent gate
  - **Trigger:** During F1 step 3, A1 cancels at the consent gate.
  - **Actors:** A1, A2
  - **Steps:**
    1. A2 surfaces the Claude panel findings as the deliverable.
    2. A2 does not write a `.deep-review.md` sidecar (the report is panel-only, equivalent to `ce-doc-review` output — no need to duplicate that artifact under a deep-review filename).
  - **Outcome:** A1 gets the panel findings without egress. The deep-review filename remains reserved for the verified cross-model report.
  - **Covered by:** R2, R14

---

## Requirements

**Skill surface and orchestration**

- R1. Provide a new `ce-deep-review` skill under `plugins/compound-engineering/skills/ce-deep-review/`, separate from `ce-doc-review`. `ce-doc-review` remains the no-egress single-panel review and is unchanged in behavior.
- R2. The skill accepts a single argument: a path to a plan document (markdown). It does not depend on the document being inside this repo.
- R3. Before any of the three-pass recipe runs, the skill probes the environment for available non-Claude CLIs (see R9 and R13). If at least one is available, the skill runs the three-pass recipe end-to-end in a single invocation: Claude panel → consent gate → cross-model panel → cross-model verification → reconciled report. If zero non-Claude CLIs are available, behavior is governed by R13 (panel-only run with explicit header).

**Cross-model harness extension**

- R4. Add a `grok` arm to the existing cross-model harness (`scripts/eval/cross_model_review/arms.py` and downstream callers), supporting the Grok Build CLI (`grok` binary).
- R5. Every non-Claude arm (codex, grok, and the agy replacement for gemini) runs in a read-only, no-web-search, no-tools posture — minimum floor is symmetry with the most restrictive of the existing arms (codex's `-s read-only` and gemini's `--approval-mode plan`). The grok arm uses `--permission-mode plan`, `--disable-web-search`, single-turn `-p` invocation, and any `--sandbox` profile validated to deliver that posture. The agy arm posture must be validated separately — `agy --help` exposes no `--approval-mode`/`--permission-mode`/plan-mode equivalent (only `--dangerously-skip-permissions` and a boolean `--sandbox`), so the migration must determine whether `--sandbox` (alone or combined with other agy flags) delivers the same floor; if no combination achieves it, the agy arm is treated as unavailable until it can. Every arm runs from a clean working directory, has no ambient repo access, and produces a JSON array of findings parseable by the existing `parse_findings` logic. Every non-Claude arm is prompted with the same six per-lens rubrics the existing harness uses, so findings are structurally comparable across models. Before R4 is shippable, the grok arm is behaviorally smoke-tested with a unique sentinel prompt to confirm it does not attempt web search, read files outside the working directory, or make follow-up tool calls — `--help` flag presence does not transfer the codex/gemini eval baseline to grok. If the floor cannot be validated for grok, the grok arm is treated as unavailable until it can.

  > **[Phase 0 validation, 2026-05-28 — supersedes the posture assumptions above]** Empirically validated on the original dev machine (see `docs/solutions/skill-design/2026-05-28-{grok,agy}-arm-posture-validation.md`): (1) **agy 1.0.3 has NO flag that delivers this floor** — `--sandbox` restricts terminal execution but NOT filesystem read/write (agy read an out-of-workspace sentinel and wrote a canary under `--sandbox`), and there is no web-search-disable flag. The floor is therefore enforced **externally via a macOS `sandbox-exec` (seatbelt) profile** wrapping the arm, not via agy flags. (2) **grok 0.2.8 is deferred** — its headless `-p` worker fails at the WebSocket-relay auth layer (`Transport channel closed / AuthorizationRequired`), unfixable by `grok login`/`grok agent --reauth`; its sandbox posture (`--sandbox read-only`) is otherwise ideal and ready to land on a grok version that fixes the relay. v1 cross-model arms are therefore **codex + (OS-sandboxed) agy**.
- R6. The harness exposes a way to run a subset of models per invocation (not all-or-nothing). The exact mechanism — argv flag, environment variable, or per-call argument — is a planning decision; what's required at the requirements level is that `ce-deep-review` can select N of the three available models for a given run. Whatever mechanism is chosen must be expressible by the orchestrating agent after the consent gate interaction completes, so the user's per-run model selection from the gate maps directly to the harness invocation.

**Consent gate and model selection**

- R7. Before any non-Claude egress, the skill opens a single interactive gate that does three things in one interaction: (a) asks permission to egress, (b) lets the user pick which of the auto-detected available models will participate, (c) previews what is about to be sent — the resolved plan path, byte count, and any detected credential- or PII-shape pattern hits using the `gitleaks` canonical pattern set (or equivalent battle-tested ruleset) as the source of truth, with explicit gate copy noting the preview is best-effort and the user is the final filter. Default selection is none — the user opts in per model rather than opts out, so every model that receives the plan was an explicit per-run choice. When only one non-Claude model is available the gate still asks for explicit egress consent — there's no "single-model fast path" that skips the prompt.
- R8. The gate uses the platform's blocking question tool (e.g. `AskUserQuestion` in Claude Code, with the documented cross-platform fallbacks per the plugin's interaction rules).
- R9. The skill auto-detects which non-Claude CLIs are installed and authenticated before opening the gate, so the gate never lists a model the user cannot actually use. Detection covers both "binary present" and "auth/credentials usable for a non-interactive run" — a CLI that's installed but not logged in is treated as unavailable, the same as a missing binary. The detection probe must not make authenticated API calls to vendor endpoints (an authenticated call would itself be egress before the consent gate fires) — probes use credential-file presence checks, token-expiry inspection, or local CLI dry-run flags that do not contact the vendor's servers. If no offline check exists for a given CLI, that CLI is treated as unavailable rather than probed live.

**Cross-model verification and reconciliation**

- R10. After cross-model findings return, the agent verifies each finding against the plan document by locating the cited text or claim, and tags the finding as:
  - **CONFIRMED** — the finding is grounded in the doc. The verifier MUST include the quoted matched text inline alongside the tag (a CONFIRMED finding without an inline quote is a validation failure) so the user can audit any verification claim at a glance.
  - **NOT-FOUND-IN-DOC** — the finding cites or implies content the doc does not contain (likely confabulation).
  - **NEEDS-HUMAN** — the finding is too ambiguous to verify mechanically (e.g., a strategic / aesthetic judgment with no specific text to check against).
  Verification applies to every cross-model finding, including ones that overlap with the Claude panel.
- R11. The reconciled report includes: YAML frontmatter with a `coverage:` field (enum: `full` when all available non-Claude arms participated, `reduced-confidence` when a subset participated, `panel-only` when zero non-Claude arms participated) so downstream tooling can distinguish coverage states without parsing prose; a header section identifying the plan, the models that participated, the timestamp, and the invoking user identity (`git config user.name` — not `user.email`, to reduce PII exposure when the sidecar is committed) so the sidecar itself is the durable audit artifact when committed alongside the plan (`/tmp/cmre-panel/records/` raw records are session-scoped and not the system of record); the Claude panel findings (untagged — trusted); the cross-model findings grouped per lens or per source (whichever planning chooses), each with its verification tag and (for CONFIRMED) the inline quoted match plus a pointer into the doc; and a "decision-changing union" section highlighting verified cross-model findings the Claude panel did not surface. When fewer than the full set of non-Claude models participated (single-model run, or zero-CLI panel-only run per R13), the header AND the chat banner explicitly label the run as `Reduced-confidence deep review (N of M non-Claude models)` or `Panel-only deep review (no cross-model arm)` so users can tell at a glance that this is not a full-fan-out review.

**Output and environment behavior**

- R12. The reconciled report is written as a sidecar file at `<plan-path>.deep-review.md` (or `<plan-path>.panel-review.md` per R13 when zero non-Claude arms participated). If a previous report exists at that path, the skill rotates the prior file to `<plan-path>.deep-review.<ISO-timestamp>.md` (or `<plan-path>.panel-review.<ISO-timestamp>.md`) before writing the new report (preserves audit chain and hand-edited reviewer annotations without blocking re-runs). The skill keeps the 5 most recent rotated sidecars per plan and deletes older rotations during the rotation step, so the audit chain does not accumulate unboundedly in the working tree. Whether to commit or gitignore the sidecar(s) is currently an Open Question (see Outstanding Questions); v1 does not modify `.gitignore` either way.
- R13. When zero non-Claude CLIs are detected as available, the skill runs the Claude panel and writes a sidecar at `<plan-path>.panel-review.md` (distinct from `.deep-review.md` so the filename itself encodes the no-cross-model-arm property — see R14's reservation) whose frontmatter sets `coverage: panel-only` and whose header and chat banner state prominently `Panel-only deep review (no cross-model arm)` and name each missing CLI with its install or auth command. The skill does not silently degrade — the distinct filename AND prominent header together defeat silent failure. Refuses to be quiet, not refuses to run.
- R14. When the user declines egress at the consent gate, the skill outputs the Claude panel findings to chat and does NOT write the sidecar file. The `.deep-review.md` filename is reserved for verified cross-model output.

**Progress and latency**

- R15. The skill streams per-(model, lens) progress to chat so the user can see the run advancing during the multi-minute pass-2 phase. The exact streaming format (per-call summary, lens-completion ticks, etc.) is a planning detail; at the requirements level the skill must not run silently for minutes.

---

## Acceptance Examples

- AE1. **Covers R7, R9, R12, R14.** Given a plan at `docs/plans/foo.md` and an environment with codex + gemini + grok all installed and authed, when the user runs `ce-deep-review docs/plans/foo.md` and confirms the consent gate with all three models selected, then the skill runs the Claude panel, the three non-Claude models across six lenses each, verifies every cross-model finding against `foo.md`, and writes `docs/plans/foo.md.deep-review.md` containing the panel findings (untagged), verified cross-model findings (each tagged CONFIRMED / NOT-FOUND-IN-DOC / NEEDS-HUMAN), and a decision-changing-union section.
- AE2. **Covers R7, R9.** Given an environment where gemini is installed but not authenticated, when the user invokes the skill, then the consent gate lists only codex + grok, includes a brief one-line note that gemini was skipped because it is not authenticated, and proceeds normally when the user confirms.
- AE3. **Covers R13.** Given an environment where none of codex, gemini, or grok is installed, when the user invokes the skill, then the skill runs the Claude panel and writes `<plan>.panel-review.md` (distinct from the `.deep-review.md` filename reserved for cross-model output) with frontmatter `coverage: panel-only`, whose header reads `Panel-only deep review (no cross-model arm)` and names each missing CLI with its install / auth command; the chat banner restates the same notice.
- AE4. **Covers R10, R11.** Given a cross-model finding from gemini that claims the plan "does not validate user input on line 42" but the plan has no such claim or relevant content, when the agent verifies, then the finding is tagged NOT-FOUND-IN-DOC in the reconciled report. The finding is still included in the report (not silently dropped) so the user can see what the model produced.
- AE5. **Covers R14.** Given a plan, when the user reaches the consent gate and cancels, then the skill prints the Claude panel findings to chat, does NOT write `<plan>.deep-review.md`, and exits cleanly.

---

## Success Criteria

- A high-stakes plan that previously required three separate operator actions (run `ce-doc-review`, run `panel-critique.sh`, ask the agent to reconcile and then manually verify) can be reviewed via a single `ce-deep-review <plan>` invocation, with one consent interaction in the middle and a verified sidecar report at the end.
- The skill works for any internal developer who has at least one of codex / gemini-or-agy / grok installed and authenticated, without per-repo configuration. Developers who have none of them get a panel-only deep review (per R13) with a distinct filename and prominent banner, not a silent fallback. Note: per R9's no-live-API-call constraint, if any of the three non-Claude arms lacks an offline auth check, the team-available set is correspondingly narrower than "installed and authed" alone implies — planning must treat "has an offline auth check" as an arm-acceptance criterion, not an afterthought.
- The verification step catches gemini-style confabulations: a finding citing text not in the doc lands as NOT-FOUND-IN-DOC in the report, so the user does not have to do that check themselves.
- `ce-plan` can implement this from the requirements doc without inventing user-visible behavior, output format, or environment-detection policy.

---

## Scope Boundaries

- The evaluation-specific components of the cross-model harness (judge, trials, GT-match, decision-artifact, record-schema) are not invoked by `ce-deep-review`. The arms and harness runner are extended and reused. The evaluation pipeline exists to *decide whether the cross-model lever is worth building*; this skill is the day-to-day use of the lever. Future eval re-runs continue to use the existing harness directly.
- Per-plan or per-repo trust-based allow-listing (e.g., "this plan never goes to Google regardless of who runs the skill") is out of scope. Model selection at the consent gate covers the common case ("I don't want gemini today") but is not policy enforcement.
- A persistent / per-repo configuration file for default model selection (e.g., "always include grok, never include gemini for this repo") is out of scope. Default is "all auto-detected available models pre-selected," with the user free to deselect at the gate per run.
- Cost or token-budget estimation in the consent gate (e.g., "this will use ~X tokens / cost ~$Y") is out of scope.
- A headless / non-interactive mode is out of scope for v1. Egress without explicit consent for each run is exactly what the consent gate exists to prevent.
- Extending the consent-gate / cross-model pattern to `ce-code-review` (code PRs) or any other artifact type is out of scope. This brainstorm is for plan and requirements documents.
- A new non-Claude judge / arbitration step inside the deep-review flow is out of scope. The Claude agent is the reconciler.

---

## Key Decisions

- **One-click consent gate over full-auto egress.** Collapses the manual bash hop into a single keystroke without removing the human's explicit decision to send plan content to external vendors. Rationale: the original design's prohibition on agent-driven egress was a content-protection choice, not an API-safety choice; collapsing the friction without removing the explicit decision preserves the protection.
- **Full agent-side verification of every cross-model finding over emit-and-flag.** The user reads a verified list, not a raw dump labeled "needs verification." Rationale: gemini's confabulation problem is well-documented in the cross-model eval, and verification is the most error-prone manual step in the current workflow. A turnkey command that leaves verification to the user collapses two of three manual steps but leaves the most error-prone one in place.
- **New `ce-deep-review` skill over a third mode on `ce-doc-review`.** Two clear entry points (no-egress vs. deep) with intent-named slash commands, instead of a single skill with three modes whose interaction logic gets harder to reason about. Rationale: `ce-doc-review` already supports interactive and headless modes; piling on a third mode would muddy the interaction model.
- **Sidecar output (`<plan-path>.deep-review.md`) over chat-only.** Durable, diffable across iterations, commitable if the team chooses. Rationale: high-stakes plans benefit from a durable artifact attached to the plan, not an ephemeral chat output.
- **Auto-detect-and-deselect consent gate over per-provider trust allow-list.** The selection mechanism is driven by availability across developer environments, not by data-handling trust. Rationale: the immediate pain is "other developers don't have everything you have"; trust-based gating is a separate problem worth deferring until a proprietary-plan flow demands it.
- **Refuse to be quiet, not refuse to run, when zero non-Claude CLIs are available.** `ce-deep-review` still runs the Claude panel and writes a sidecar, but the sidecar header and chat banner state prominently that the cross-model arm did not run and name the missing CLIs with install/auth pointers (R13). Rationale: the user-visible property the workflow protects is "the user knows whether the cross-model step happened." Refusing to run delivers that property by bouncing the user; refusing to be quiet delivers the same property without losing the panel work and without bouncing first-time teammates who don't yet have non-Claude CLIs installed. Same pattern extends to single-model runs via R11's reduced-confidence header.
- **One-click consent gate is opt-in per model, not opt-out.** The default model selection at the consent gate is "none checked" — the user opts in per model rather than rubber-stamping a pre-checked list. Rationale: a default-affirmative UI on a multi-vendor egress prompt invites click-through on sensitive content; opt-in per model preserves the explicit-per-vendor decision property the terminal-typing friction used to deliver, without bringing back the bash hop.
- **Inline-quote requirement on CONFIRMED verification tags.** Every CONFIRMED tag carries the matched text quoted inline (R10). Rationale: agent-as-verifier has its own confabulation modes when grounding findings against long documents, and a false-CONFIRMED finding launders confabulation as verified. Inline quoting is the cheapest spot-check surface; pairing it with a planned bidirectional rate measurement (see Outstanding Questions) commits the team to closing the validation gap.
- **v1 is fully turnkey rather than a thinner wrapper.** Rationale: the friction itself is hypothesized to be the main thing suppressing usage and therefore evidence — a thin wrapper (panel + consent gate + bash-handoff to existing harness, no new arm, no verification step) would not test that hypothesis. Risk acknowledged: if the lever does not clear the value bar after v1, the agy migration coordination + grok hardening + verification accuracy work do not pay back. If post-v1 evidence shows the friction was not the bottleneck, the thinner-wrapper alternative remains available.
- **Migration sequence option (a): migrate gemini → agy first; ship v1 with agy as the canonical arm.** Rationale: option (a) lands cross-model parity fastest and avoids shipping a known-dead arm (option b) or losing gemini's eval-validated decorrelation contribution (option c). **Calendar fallback:** if any of the three Pre-v1 Ship Gates (grok smoke test, grok sandbox profile, agy posture-floor) is not green by 2026-06-15, fall back to option (c) — ship v1 without gemini/agy and add the arm post-migration. 3 days of slack before the 2026-06-18 hard cutoff.
- **Antigravity (agy) and xAI (grok) data-handling policies confirmed in scope for internal plan content.** Both vendors' standard policies cover internal Blueprint plan content for `-p`-style API invocations; no further legal confirmation is a blocker for v1.
- **Bidirectional verifier rate thresholds: ≤5% false-CONFIRM AND ≤5% false-NOT-FOUND-IN-DOC on the held-out set.** Both must clear before R10 ships. **Consequence of missing the false-CONFIRM threshold:** all cross-model findings tag as NEEDS-HUMAN by default until the rate drops below threshold. **Consequence of missing the false-NOT-FOUND-IN-DOC threshold:** the verification step's NOT-FOUND-IN-DOC tag is treated as advisory, not authoritative, until the rate drops below threshold (findings remain in the report regardless of tag).

---

## Dependencies / Assumptions

- The cross-model harness in `scripts/eval/cross_model_review/` (`arms.py`, `panel-critique.sh`, the six lens rubrics) is the basis for pass 2 and stays in place. `ce-deep-review` builds on it; this brainstorm does not redesign it.
- Grok Build CLI is installed at `~/.grok/bin/grok` on the original developer's machine and exposes the documented headless-friendly flags (`-p`, `--permission-mode plan`, `--disable-web-search`, `--output-format`, `--prompt-file`, etc.). The `grok login` flow handles authentication; there is no documented env-var-keyed auth path. Verified against `grok --help` on 2026-05-28; rerun the check if a future grok version changes the surface. xAI's data-retention policy for `-p` invocations is not documented here and is recorded as an unverified assumption — Resolve Before Planning includes an item to confirm or reject the policy explicitly before the grok arm enters the team-facing trust boundary.

  > **[OD-3 resolved, 2026-05-28]** The grok `-p` data-retention question is **resolved: CONFIRMED acceptable** for internal Blueprint plan content — grok stays in the consent gate when it re-enters. (Independently, grok is **deferred from v1** on the 0.2.8 headless relay-auth bug — see the R5 Phase-0 note — so retention only re-matters on a grok version that fixes the relay.)
- **Gemini CLI is being sunset; the existing `gemini` arm migrates to Antigravity (`agy`) before 2026-06-18.** The Gemini CLI backend endpoints return HTTP 410 after that date. The harness already has a stub `agy` invocation path (currently marked unreliable from prior eval runs); the migration scope covers: (a) revalidating the `agy` arm against the same eval baseline that established gemini's behavior, (b) updating env vars (`GEMINI_API_KEY` → `AV_API_KEY`, `GEMINI_PROJECT_ID` → `AV_PROJECT_ID`, `GEMINI_REGION` → `AV_REGION`), (c) replacing the `gemini` binary invocation with `agy`, (d) running `agy plugin import gemini` to carry across any extension state, (e) updating MCP config from inline-in-`settings.json` to a dedicated `mcp_config.json`. Until the migration lands, `ce-deep-review` continues to refer to the arm by its current name (`gemini`); references in this document treat `gemini` and "the agy replacement for gemini" as the same arm slot.

  > **[Phase 0 validation, 2026-05-28]** Migration step (b) is corrected: agy uses OAuth (`~/.gemini/oauth_creds.json`), **not** `AV_API_KEY`/`AV_PROJECT_ID`/`AV_REGION` env vars — there is nothing to migrate there. Critically, the "stub agy invocation path currently marked unreliable" reflected agy **1.0.2** (empty output / monologue); **agy 1.0.3 is a viable reviewer** (clean JSON findings, doc via stdin), so the migration is unblocked on viability grounds. The remaining work is the posture floor (OS seatbelt sandbox per the R5 Phase-0 note), not viability.
- The Claude 6-persona panel logic in `ce-doc-review` is reusable from `ce-deep-review`. Whether `ce-deep-review` invokes `ce-doc-review` internally or replicates its panel dispatch is a planning decision; either path satisfies the requirements.
- Raw per-model records continue to write to `/tmp/cmre-panel/records/` (the existing harness output path). This brainstorm does not change that path.
- **Assumption: agy's confabulation profile is similar enough to gemini's for R10's verification design to transfer.** Characterization against the gemini held-out set is not a v1 ship gate; instead, the team monitors R10's bidirectional rate measurements in v1 use and revises the verification strategy if observed behavior diverges materially from gemini's profile.
- **agy offline auth-detection (corrected by Phase 0 validation, 2026-05-28).** The earlier `AV_API_KEY`/`AV_PROJECT_ID` env-var assumption is **wrong** — agy 1.0.3 uses OAuth credentials at `~/.gemini/oauth_creds.json` (no env vars). The R9 offline rule is: "available" iff that file exists, is non-empty JSON, and contains a non-empty `refresh_token`. **Do NOT gate on `expiry_date`** — agy auto-refreshes via the refresh token (observed working with an `expiry_date` ~52h stale), so an expiry check would false-negative. See `docs/solutions/skill-design/2026-05-28-agy-arm-posture-validation.md`.

---

## Outstanding Questions

### Resolve Before Planning

- None — all 10 prior Resolve-Before-Planning items were resolved during the brainstorm's Phase 4 walkthrough. See Pre-v1 Ship Gates and Key Decisions for committed resolutions and the Dependencies / Assumptions section for explicit assumptions.

### Pre-v1 Ship Gates

These three validation tasks gate R4 (or its equivalent arms) shipping. All three must pass before `ce-deep-review` v1 ships. The 2026-06-15 cut-line below (RBP 2 resolution) is the calendar fallback trigger.

- [Affects R4, R5] **Grok behavioral smoke test (pre-v1).** Design and run a sentinel-prompt smoke test that confirms `--permission-mode plan` + `--disable-web-search` + single-turn `-p` deliver the claimed read-only, no-web-search, no-tools posture at runtime — not just at flag-parse time. If grok fails (attempts web search, reads outside the working directory, or makes follow-up tool calls), grok is removed from v1.
- [Affects R5] **Grok `--sandbox` profile evaluation (pre-v1).** Determine the right sandbox profile combination for grok before R4 ships; document the chosen flag set in R5 so the floor is captured before implementation begins.
- [Affects R5, agy migration] **agy posture-floor validation (pre-v1).** Determine whether `agy --sandbox` (alone or combined with other agy flags) delivers a posture symmetric with codex `-s read-only` and grok `--permission-mode plan`. If no combination achieves the floor by 2026-06-15, agy is removed from v1 (reverts the migration sequence to option (c) per the calendar fallback).

### Deferred to Planning

- [Affects R6][Technical] How does the harness expose per-run model selection — a `--models codex,grok` flag on `arms.py` / `panel-critique.sh`, an environment variable, or a separate orchestrator path that the skill drives? Planning should pick whichever requires the smallest change to the existing harness while letting `ce-deep-review` request a subset, subject to R6's orchestrator-expressible constraint.
- [Affects R9][Technical] Offline auth-state probe for codex and grok (agy's offline check is set to env-var-presence per the Dependencies assumption). Each CLI exposes auth differently; planning picks a probe per CLI subject to R9's no-live-call constraint.
- [Affects R3, R15][Technical] Whether to run lenses or models in parallel during pass 2, and how to stream progress to the user. The current `panel-critique.sh` runs them sequentially with a per-(model, lens) log line. Parallelism cuts wall time but complicates progress streaming and error attribution.
- [Affects R10][Technical] Verification strategy implementation — grep for cited strings, semantic match, prompt-the-agent-to-search. Planning chooses based on accuracy under cross-model confabulation patterns; bidirectional rates (per Key Decisions) gate v1 ship.
- [Affects R11, R13][Technical] Header / banner copy. The exact wording of `Reduced-confidence deep review (N of M non-Claude models)` and `Panel-only deep review (no cross-model arm)` banners is a planning decision; what's required at the requirements level is that the labels are unambiguous about which arm did and did not run.
- [Affects R7][Technical] `gitleaks` pattern set maintenance lifecycle (per R2 F13). Planning owns the cadence at which the canonical pattern set is refreshed.
- [Affects R7, Key Decisions][Tradeoff] **Does opt-in-none default survive the friction-suppresses-evidence premise?** Round-1 chose opt-in-none for safety; Round-2 personas argued the multi-click-per-run reintroduces friction in a different place, suppressing the very evidence the skill exists to gather. Revisit at planning: keep opt-in-none, flip to opt-out gated on R7 content-preview hits, or pick a hybrid.
- [Affects R11, R12, Key Decisions][Tradeoff] **Is the sidecar the durable audit artifact (commit it) or an LLM-output side-effect (gitignore by default)?** Round-1 added both audit-metadata (R11) AND a gitignore-offer (R12) — Round-2 personas surfaced that the two framings can't both hold. Resolve at planning by picking a canonical role and dropping the conflicting requirement. (R12 currently states v1 does not modify `.gitignore` either way; the question is whether the sidecar's intended fate is commit-able audit or gitignored output.)
- [Affects R7, R12, R13][Deferred] Whether gemini-or-agy should stay in the default checked set after the confabulation-vs-decorrelation trade-off is re-examined post-migration. The brainstorm Apply pass's mooted gemini-default question lands here once the agy migration determines whether the new arm exhibits the same confabulation profile.

### Deferred to Planning

- [Affects R6][Technical] How does the harness expose per-run model selection — a `--models codex,grok` flag on `arms.py` / `panel-critique.sh`, an environment variable, or a separate orchestrator path that the skill drives? Planning should pick whichever requires the smallest change to the existing harness while letting `ce-deep-review` request a subset, subject to R6's orchestrator-expressible constraint.
- [Affects R9][Technical] What offline auth-state check exists for each CLI (codex / gemini-or-agy / grok)? Each exposes auth differently. Planning picks a probe per CLI subject to R9's no-live-call constraint (credential-file presence, token-expiry inspection, or local CLI dry-run flag that does not contact the vendor). CLIs without an offline check are treated as unavailable.
- [Affects R3, R15][Technical] Whether to run lenses or models in parallel during pass 2, and how to stream progress to the user. The current `panel-critique.sh` runs them sequentially with a per-(model, lens) log line. Parallelism cuts wall time but complicates progress streaming and error attribution.
- [Affects R10][Technical] What strategy does the agent use to verify a finding against the doc — grep for cited strings, semantic match, prompt-the-agent-to-search? Planning chooses based on accuracy under cross-model confabulation patterns specifically (gemini today, whatever agy exhibits post-migration).
- [Affects R11, R13][Technical] Header / banner copy. The exact wording of `Reduced-confidence deep review (N of M non-Claude models)` and `Panel-only deep review (no cross-model arm)` banners is a planning decision; what's required at the requirements level is that the labels are unambiguous about which arm did and did not run.
- [Affects R7, R12][Deferred] Whether gemini-or-agy should stay in the default checked set after the confabulation-vs-decorrelation trade-off is re-examined post-migration. The mooted question from the brainstorm walk-through (`Drop the confabulator alternative`) lands here once the agy migration determines whether the new arm exhibits the same confabulation profile.
