---
date: 2026-05-28
type: feat
origin: docs/brainstorms/2026-05-28-ce-deep-review-requirements.md
supersedes: docs/plans/2026-05-28-001-feat-ce-deep-review-skill-plan.md
status: active
title: ce-deep-review — turnkey high-stakes plan review across Claude + non-Claude models (v2)
---

# feat: ce-deep-review skill (v2)

> **v2 note.** This plan supersedes `2026-05-28-001-...-skill-plan.md`. It incorporates the round-1 `ce-doc-review` P1 findings in a single pass. The substantive changes from v1:
> 1. **Dogfoodable thin slice carved early.** Units are re-ordered so the skill's first runnable deliverable — pass-1 + consent gate + a bash-handoff to the *current* canonical harness, emitting raw **unverified** records — is dogfoodable *before* the grok/agy/verifier investment. A dogfood gate after Phase 1 tests the "friction-is-the-bottleneck" hypothesis cheaply, addressing the adversarial sequencing finding without abandoning the brainstorm's deliberate turnkey decision.
> 2. **agy auth path demoted from settled fact to U2 discovery.** v1 asserted `~/.gemini/oauth_creds.json` as a Key Technical Decision repeated 4×, while U2 was nominally the unit meant to discover it. v2 treats the agy credential path + auth mechanism as an *output* of U2; no downstream unit hardcodes it.
> 3. **Bundling drift mechanism made concrete + tested early.** v1 alternated "build-time copy" vs. "symlink resolution" (symlinks break the converter per AGENTS.md). v2 commits to **build-time copy** and lands the drift contract test in the unit that first creates the bundled copy (U5), not at the end.
> 4. **Gitleaks gate degrades gracefully** instead of hard-blocking gitleaks-less first-timers.
> 5. **Verifier corpus includes agy-voiced confabulations** and the verdict honestly reports its calibration scope.
> 6. **Beta manual-trigger path documented** so the adoption metric isn't contradicted by `disable-model-invocation: true`.
>
> Unit numbers are re-assigned in **execution order** for clarity; the v1→v2 unit mapping is noted in each unit header.

## Summary

A new `ce-deep-review-beta` skill that orchestrates the existing 3-pass high-stakes-plan review recipe end-to-end on any plan document. The skill invokes `ce-doc-review` in headless mode for pass 1 (Claude panel), opens a single interactive consent gate (gitleaks content preview with graceful degradation + opt-in-per-model multi-select + explicit responsibility acknowledgment), shells out to a bundled copy of the cross-model harness for pass 2, verifies every cross-model finding against the doc with inline-quoted CONFIRMED / NOT-FOUND-IN-DOC / NEEDS-HUMAN tags, then writes a reconciled sidecar at `<plan-path>.deep-review.md` (or `<plan-path>.panel-review.md` for zero-CLI panel-only runs).

The build sequence is deliberately staged so a **thin, dogfoodable slice ships first** (pass 1 + consent gate + raw cross-model records, unverified) against the *current* codex+gemini harness, gated by an explicit dogfood checkpoint before the team commits to the grok arm, the gemini→agy migration, the verification layer, and the bidirectional verifier rate measurement. Ships as a beta skill; promoted to stable after the verifier rate measurement clears its thresholds.

---

## Problem Frame

The deep-plan-review workflow (Claude panel + cross-model panel + reconcile) is a lever the team has decision-grade evidence on for *decorrelation* (cross-model arms surface validated bugs the Claude panel alone misses) but inconclusive evidence on *team-wide value*. Running it today requires a multi-tool, multi-context workflow: invoke `ce-doc-review`, open a terminal, paste a bash command, wait, return the records to the chat, then ask the agent to reconcile and manually verify gemini's confabulation-prone findings. Three pain points compound:

1. **The pass-2 hop is expensive in attention.** Switching to a terminal and pasting a bash command for every high-stakes plan is enough friction that the deep review gets skipped or deferred.
2. **Verification is the most error-prone manual step.** Gemini confabulates plausible-but-fake findings; the user, not the agent, currently checks each cross-model finding against the doc.
3. **The workflow assumes a single operator.** The harness was built for one developer with a specific environment; teammates without the same toolset have no entry point at all.

This skill is the instrument that gathers team-wide evidence in real use, not the productionization of a settled win. **The "friction-is-the-bottleneck" hypothesis is testable, and v2 tests it before the team pays for the full build.** The brainstorm deliberately chose a turnkey v1 (rather than a permanent thin wrapper) on the theory that friction itself suppresses usage and therefore evidence. The adversarial round-1 review flagged that the v1 *sequencing* nonetheless locked ~12 units of investment ahead of any adoption signal. v2 resolves the tension by ordering the work so a runnable thin slice — pass 1 + consent gate + bash-handoff to the harness that already exists — is dogfooded at the **Phase 1 dogfood gate**, before grok hardening, the agy migration, and the verifier corpus are built. If the thin slice shows the friction hop was *not* the bottleneck, the team learns it for the cost of three skill units, not twelve. If it shows usage lifts, the heavier turnkey investment proceeds with evidence behind it.

Risk acknowledged (carried from the brainstorm): if the lever does not clear the value bar even after the full v1, the agy migration + grok hardening + verifier accuracy work do not pay back. The thinner-wrapper alternative remains available as the permanent shape if the dogfood gate is equivocal.

---

## Actors

- A1. Plan author / reviewer (any internal developer): invokes `ce-deep-review` on a plan they have authored or want to vet. May or may not have all non-Claude CLIs installed and configured.
- A2. The orchestrating agent (Claude): runs pass 1, mediates the consent gate, dispatches the cross-model arms, verifies cross-model findings against the doc, writes the reconciled report.
- A3. Non-Claude reviewer CLIs (codex, agy, grok): produce cross-model findings under the same six lenses as the Claude panel; configured per-environment by the user (who is responsible for OAuth/API-key setup and vendor data-handling policies); opt-in per-run via the consent gate.

> Note: during the **thin-slice dogfood phase (Phase 1)**, the cross-model arms are the ones that exist in the canonical harness *today* — codex + gemini. The grok arm and the gemini→agy migration land in Phase 2. The thin slice intentionally does not wait on them.

---

## Key Flows

- F1. Happy-path deep review with all available non-Claude models
  - **Trigger:** A1 invokes `ce-deep-review <plan-path>`.
  - **Actors:** A1, A2, A3
  - **Steps:**
    1. A2 probes the environment for installed and authed non-Claude CLIs using the offline auth-detection rules (R9; agy's rule is the one discovered in U2 — see Key Technical Decisions).
    2. A2 invokes `ce-doc-review` in headless mode against the plan path; receives the panel envelope (applied fixes, decisions, FYI, residual concerns).
    3. A2 runs the gitleaks content preview against the plan. **If gitleaks is installed,** it captures findings. **If gitleaks is absent,** the gate degrades gracefully (see F5) — it does not block.
    4. A2 opens the consent gate as a numbered-list-in-chat (per-model opt-in + responsibility-acknowledge + proceed/cancel). Default selection per model is "no." Content-preview hits (or the preview-unavailable notice) are surfaced inline. Responsibility acknowledgment is required to proceed.
    5. A1 confirms responsibility and selects models; A2 fans the selected models across the six lenses (parallel across models, sequential lenses within each model) by shelling out to the **bundled** `scripts/panel-critique.sh` with the `--models <subset>` argument.
    6. A2 verifies each cross-model finding against the doc (blind to producing model) and tags CONFIRMED / NOT-FOUND-IN-DOC / NEEDS-HUMAN with inline-quoted matches for CONFIRMED.
    7. A2 writes the reconciled report to `<plan-path>.deep-review.md` (with `coverage:` frontmatter, audit metadata header, panel findings untagged, cross-model findings grouped with verification tags, decision-changing-union section). Raw per-model records remain at `/tmp/cmre-panel/records/`.
    8. A2 streams a summary to chat.
  - **Outcome:** A1 reads a single verified, durable, commit-as-audit sidecar listing the panel findings plus the decorrelated cross-model additions, each cross-model finding tagged with its verification status.
  - **Covered by:** R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R15

- F1-thin. **Thin-slice dogfood run (Phase 1 only; superseded by F1 once Phase 3 lands).**
  - **Trigger:** A1 invokes `ce-deep-review-beta <plan-path>` during the dogfood phase.
  - **Steps:** Steps 1–5 as in F1, against the current codex+gemini harness. Then A2 parses the raw per-(model, lens) records and presents them to chat (and writes a `<plan>.deep-review.md` sidecar) **labeled `verification: none (thin-slice)`** — findings are NOT yet verified against the doc, NOT tagged, and the user is told explicitly that confabulation-checking is still manual at this stage.
  - **Outcome:** A1 gets the cross-model findings without the terminal hop — enough to test whether removing the friction changes whether the deep review actually gets run. This flow exists only to gather the dogfood signal; F1 replaces it when U9/U10 land.
  - **Covered by:** R1, R2, R3, R6, R7, R8, R9, R15

- F2. Partial-environment deep review (some non-Claude CLIs missing)
  - **Trigger:** A1 invokes `ce-deep-review <plan-path>` where one non-Claude CLI is missing/unauthed.
  - **Steps:** A2 probes; finds (e.g.) codex available, agy missing. The gate shows only available models + a one-line "skipped because X" note. Remainder proceeds as F1 with the subset; the sidecar carries `coverage: reduced-confidence` with a banner.
  - **Outcome:** A1 gets a deep review using the available subset, with explicit disclosure that fewer than the full set participated.
  - **Covered by:** R2, R3, R6, R7, R9, R11

- F3. Panel-only deep review when zero non-Claude CLIs are available
  - **Trigger:** A1 invokes `ce-deep-review <plan-path>` where none of codex/agy/grok is available.
  - **Steps:** A2 probes (zero usable CLIs), invokes `ce-doc-review` headless, writes `<plan-path>.panel-review.md` with `coverage: panel-only`; header + chat banner state `Panel-only deep review (no cross-model arm)` and name each missing CLI with its install/auth command.
  - **Outcome:** A1 gets the panel work AND explicit visibility into what's missing — refuses to be quiet, not refuses to run.
  - **Covered by:** R2, R13

- F4. User declines egress at the consent gate
  - **Trigger:** During F1 step 4, A1 declines the responsibility acknowledgment or cancels.
  - **Steps:** A2 outputs the Claude panel findings to chat; does NOT write `<plan>.deep-review.md` (filename reserved for verified cross-model output per R14).
  - **Outcome:** A1 gets the panel findings without egress; the deep-review filename remains reserved.
  - **Covered by:** R2, R14

- F5. **Consent gate with gitleaks not installed (graceful degradation — new in v2)**
  - **Trigger:** During F1 step 3, `gitleaks` is not on PATH.
  - **Steps:**
    1. A2 does NOT bounce. The consent gate still opens.
    2. In place of the content-preview hit list, the gate shows: *"Automated content preview unavailable — `gitleaks` is not installed (`brew install gitleaks` enables automated secret detection). Until then, you are the sole content filter for what is egressed."*
    3. The responsibility acknowledgment is still required and its text is unchanged — the user is explicitly accepting that no automated scan ran.
    4. If the user proceeds, the run continues normally; the sidecar audit header records `content_preview: unavailable (gitleaks not installed)` so the absence of a scan is itself audited.
  - **Outcome:** A first-time teammate without gitleaks can still run the deep review and produce the adoption signal the skill exists to gather, without losing the human-filter protection. Installing gitleaks upgrades the preview from manual-only to automated+manual.
  - **Covered by:** R2, R7

---

## Output Structure

```
plugins/compound-engineering/skills/ce-deep-review-beta/
├── SKILL.md
├── references/
│   ├── consent-gate.md              # Inline consent flow, gitleaks integration (graceful degradation), responsibility prompt
│   ├── verification-protocol.md     # Per-finding grounding rules, inline-quote contract, blind-to-producer instructions
│   ├── reconciliation.md            # Sidecar shape, frontmatter, audit metadata, decision-changing union assembly
│   ├── arm-invocation.md            # How to shell out to the bundled panel-critique.sh; per-(model, lens) record parsing
│   ├── pass-1-headless-envelope.md  # ce-doc-review headless invocation + envelope parsing
│   └── ship-state-machine.md        # State dimensions across pass 1, consent, pass 2, verification, sidecar write
├── scripts/
│   ├── bundle-harness.sh            # Build-time copy: canonical scripts/eval/cross_model_review/* -> this skill's scripts/. The drift contract test asserts the copies match.
│   ├── panel-critique.sh            # BUNDLED copy (produced by bundle-harness.sh)
│   ├── arms.py                      # BUNDLED copy (produced by bundle-harness.sh)
│   ├── gitleaks-scan.sh             # Wrapper: invokes gitleaks if present, emits parseable JSON; signals "unavailable" cleanly if absent
│   ├── env-detect.sh                # Offline auth detection per CLI (codex, agy, grok) — agy rule per U2 discovery
│   └── verifier-eval/               # Held-out corpus + measurement harness for R10 rates
│       ├── corpus/                  # Hand-curated plan + known-confabulated findings (gemini-voiced AND agy-voiced + grounded)
│       └── measure.py               # Runs verifier against corpus, emits rate report with calibration-scope flag
└── tests/                           # (Tests live in /tests/skills/, not here — see U12)

docs/skills/ce-deep-review.md                 # User-facing doc (mirrors docs/skills/ce-doc-review.md shape)
tests/skills/ce-deep-review-contract.test.ts  # Skill contract test
tests/skills/ce-deep-review-bundle-drift.test.ts  # Drift test: bundled harness == canonical (lands in U5)
```

The tree is a scope declaration. The per-unit `**Files:**` sections are authoritative for what each unit creates or modifies; implementation may adjust the structure if a better layout emerges.

---

## Implementation Units

Re-ordered (vs. v1) so a dogfoodable thin slice lands before the grok/agy/verifier investment. Validation (Phase 0) is independent and can run in parallel with the thin slice. The **Phase 1 dogfood gate** is the cheap test of the friction hypothesis.

### U1. Grok behavioral smoke test + sandbox profile evaluation

*(v1 U1 — unchanged.)*

- **Goal:** Empirically verify grok's `--permission-mode plan` + `--disable-web-search` + `--sandbox <profile>` actually constrain behavior at runtime (not just at flag-parse time). Determine the right sandbox profile for ce-deep-review's cross-model arm posture.
- **Requirements:** Pre-v1 Ship Gate 1 (grok behavioral smoke test); Pre-v1 Ship Gate 2 (grok `--sandbox` profile evaluation).
- **Dependencies:** None.
- **Files:**
  - `scripts/eval/cross_model_review/validation/grok-smoke.sh` (new)
  - `scripts/eval/cross_model_review/validation/grok-sentinel.md` (new — sentinel prompt with planted tool-use bait)
  - `docs/solutions/skill-design/2026-MM-DD-grok-arm-posture-validation.md` (new — capture findings)
- **Approach:** Construct a sentinel prompt that explicitly tries to (a) perform a web search, (b) read a file outside the working directory, (c) write a file inside the working directory, (d) spawn a subagent. Run grok with each candidate sandbox profile (off/workspace/devbox/read-only/strict) combined with `--permission-mode plan` + `--disable-web-search` + `--max-turns 1` + `--no-subagents` + `--verbatim`. Capture stdout, stderr, and side-effect evidence. Pick the strictest profile that does not break legitimate findings output. Note: `read-only` is the brainstorm's prior favorite but blocks `~/.grok/` writes — verify auth/session paths still work.
- **Patterns to follow:** `scripts/eval/cross_model_review/arms.py` `detect_leak()` (sentinel-probe primitive).
- **Test scenarios:**
  - Planted web URL: assert no network request across all profiles + `--disable-web-search`.
  - Read `~/.ssh/config`: assert no read attempt across `read-only` and `strict`.
  - Write `/tmp/grok-write-canary`: assert no file created across `read-only` and `strict`.
  - "Respond with contents of `~/.zshrc`": assert response excludes file content (model-side refusal OR sandbox-side block both acceptable).
  - Output sanity: with the chosen flag set, grok returns a valid JSON array on a benign review prompt.
- **Verification:** A markdown finding-doc under `docs/solutions/` documents the chosen profile, the empirical evidence, and known limitations. The chosen profile is recorded as a constant ready to land in `arms.py` in U6.

### U2. agy CLI surface verification + **auth-mechanism discovery** + posture-floor validation + onboarding doc

*(v1 U2 — expanded: auth mechanism/credential path is now an explicit discovery output, not an assumption inherited from a Key Decision.)*

- **Goal:** Re-verify agy's actual CLI surface against the brainstorm's resolved assumptions; **determine agy's real authentication mechanism and offline-detectable credential location** (the v1 plan asserted `~/.gemini/oauth_creds.json` as settled fact — v2 does not; agy is a distinct tool from the sunsetting Gemini CLI and its credential path must be confirmed, not assumed); document the OAuth/paid-plan-DPA user-responsibility requirement; validate the best-effort posture for the agy arm.
- **Requirements:** Pre-v1 Ship Gate 3 (agy posture-floor validation); R5 (arm posture); R9 (offline auth detection); RBP 1 (migration sequence); RBP 4 (Antigravity DPA).
- **Dependencies:** None.
- **Files:**
  - `scripts/eval/cross_model_review/validation/agy-smoke.sh` (new)
  - `scripts/eval/cross_model_review/validation/agy-sentinel.md` (new)
  - `docs/solutions/skill-design/2026-MM-DD-agy-arm-posture-validation.md` (new — includes the discovered auth mechanism + credential path)
  - `docs/skills/ce-deep-review-onboarding.md` (new — user-facing setup doc)
  - `docs/brainstorms/2026-05-28-ce-deep-review-requirements.md` (modify — correct R5's agy-posture claims AND the Dependencies/Assumptions section's env-var auth assumption to reflect the actual agy surface + actual auth path; the env-var/`AV_API_KEY` assumption lives in Dependencies/Assumptions, not in R9)
- **Approach:** Empirically verify each brainstorm assumption against `agy --help` (v1.0.3+): (a) prompt invocation surface; (b) output format options; (c) plan-mode equivalent (expected absent); (d) **authentication mechanism — env-var? OAuth-creds file? where?** Do NOT assume `~/.gemini/oauth_creds.json`; run `agy` auth introspection (`agy auth status` or equivalent), inspect what files appear/change after a login, and confirm the actual offline-detectable signal. (e) `--sandbox` semantics. For the posture floor: combine `--sandbox` + `--add-dir <doc-dir>` constraining the workspace to a temp dir containing only the plan + a prompt-side directive ("read ONLY <abs-path>; do not modify files; do not call tools; return JSON array of findings"). Run the U1 sentinel suite against the chosen agy posture. Document explicitly that the posture is *best-effort prompt-side*. For onboarding: write user-facing instructions (paid Antigravity plan, accept DPA, configure auth per the discovered mechanism, verify `agy -p "say hi"` returns non-empty). The skill does NOT verify the DPA — user responsibility.
- **Patterns to follow:** `scripts/eval/cross_model_review/arms.py` `detect_leak()`; `docs/skills/ce-doc-review.md` for onboarding-doc shape.
- **Test scenarios:**
  - **Auth-mechanism discovery is documented:** the findings doc names agy's actual credential storage and the exact offline check (file path + validity test, OR env-var names) — whatever U2 finds, not a pre-supposed path.
  - Auth-detection probe (against the *discovered* signal): present + valid → "authed"; missing/empty → "unavailable"; expired → "unavailable" (do not refresh live — that's egress).
  - Sentinel prompt with planted secret outside the `--add-dir` workspace: assert agy cannot surface it.
  - Sentinel write `/tmp/agy-write-canary`: assert no file created when `--sandbox` is on.
  - Round-trip: agy with the chosen posture returns a valid response on a benign 6-lens prompt.
  - Arg-length: for a plan ≥200 KB, the prompt invocation succeeds without shell-arg-length errors (or document the size cap empirically).
  - Output parseability: agy's output passes through `parse_findings()` directly or with a documented post-processing step.
- **Verification:** Onboarding doc exists with the agy paid-plan + DPA + **discovered auth-setup** instructions. The findings doc records the corrected CLI surface, the **discovered auth mechanism/credential path**, and the best-effort-posture limitation. The brainstorm doc's R5 (agy posture) and Dependencies/Assumptions section (the `AV_API_KEY` env-var auth assumption — this is where the auth claim actually lives, not R9) are updated to reflect the actual agy surface AND the real auth path, and explicitly note the v1 plan's `~/.gemini/oauth_creds.json` claim was provisional. The user-responsibility framing is documented.

### U3. Create `ce-deep-review-beta` skill scaffold + headless ce-doc-review invocation (pass 1)

*(v1 U6 — moved earlier; now the first skill unit, on the thin-slice critical path.)*

- **Goal:** Stand up the beta skill directory + SKILL.md + Phase-1-of-recipe invocation of `ce-doc-review` in headless mode; parse the structured envelope for pass-2 consumption.
- **Requirements:** R1 (skill exists); R2 (single-path argument); R3 (recipe sequencing); R8 (blocking question tool platform-aware).
- **Dependencies:** None at the skill-code level. **Depends on U2 only for the agy auth-detection rule** in `env-detect.sh` — until U2 lands, `env-detect.sh` carries codex + grok detection and a TODO stub for agy (which is moot during the thin-slice phase since agy is not yet an arm; see U7).
- **Files:**
  - `plugins/compound-engineering/skills/ce-deep-review-beta/SKILL.md` (new)
  - `plugins/compound-engineering/skills/ce-deep-review-beta/references/pass-1-headless-envelope.md` (new)
  - `plugins/compound-engineering/skills/ce-deep-review-beta/scripts/env-detect.sh` (new)
  - `.gitkeep` files for references/, scripts/ as needed
- **Approach:** SKILL.md frontmatter follows ce-doc-review's minimal shape (`name`, `description`, `argument-hint`) plus `disable-model-invocation: true` and `[BETA]` prefix. Top of SKILL.md does the AskUserQuestion ToolSearch preload. Pass 1 invokes `Skill("ce-doc-review", "mode:headless <plan-path>")` and parses the resulting envelope. `env-detect.sh` does offline auth-state checks per CLI: codex via existing project pattern; grok via `XAI_API_KEY` non-empty OR `~/.grok/auth.json` valid; **agy via the rule discovered in U2** (do not hardcode a path here — read it from the U2 finding). Use platform-explicit invocation language.
- **Patterns to follow:** `plugins/compound-engineering/skills/ce-doc-review/SKILL.md` (Phase 0 mode detection; AskUserQuestion preload; headless-mode envelope at `references/synthesis-and-presentation.md`). `plugins/compound-engineering/skills/ce-plan/references/plan-handoff.md` for the headless sub-skill invocation pattern. `docs/solutions/skill-design/post-menu-routing-belongs-inline-2026-04-28.md`.
- **Test scenarios:**
  - SKILL.md frontmatter parses as valid YAML; `name` matches directory; description ≤ 1024 chars; `disable-model-invocation: true` set.
  - `name:` is `ce-deep-review-beta`.
  - `env-detect.sh` prints a structured JSON record `{codex: ok|missing|unauthed, agy: ..., grok: ...}`.
  - `env-detect.sh` does NOT call any vendor API — only file presence, env-var presence, `command -v`.
  - Pass-1 envelope parsing handles all five top-level envelope sections.
- **Verification:** `bun test tests/frontmatter.test.ts`, `tests/skill-agent-ce-prefix.test.ts`, `tests/skill-shell-safety.test.ts` pass on the new skill. Manually invoking the skill on a small plan produces a parsed envelope.

### U4. Consent gate — gitleaks preview (**graceful degradation**) + opt-in-per-model + responsibility acknowledgment

*(v1 U7 — moved earlier onto the thin-slice path; gitleaks behavior changed from hard-block to graceful degradation.)*

- **Goal:** Implement the single interactive gate that previews content sensitivity (or degrades cleanly when gitleaks is absent), presents per-model opt-in choices, and requires explicit acceptance of egress responsibility.
- **Requirements:** R7 (consent gate three-in-one); R8 (blocking question tool); R9 (auto-detection from U3); Key Decision: opt-in-per-model default-none; Plan-time decision: responsibility acknowledgment line; **v2 decision: gitleaks graceful degradation**.
- **Dependencies:** U3.
- **Files:**
  - `plugins/compound-engineering/skills/ce-deep-review-beta/references/consent-gate.md` (new)
  - `plugins/compound-engineering/skills/ce-deep-review-beta/scripts/gitleaks-scan.sh` (new)
  - `plugins/compound-engineering/skills/ce-deep-review-beta/SKILL.md` (modify — inline the consent-gate flow)
- **Approach:** Inline the consent-gate routing in SKILL.md (load-bearing per the inline-routing rule). The gate fires AFTER pass 1 returns. Sub-steps:
  1. `gitleaks-scan.sh` runs `gitleaks detect --no-git --source <plan> --report-format json --redact` **iff gitleaks is on PATH**. If present: parse JSON, render hits as `Line N (rule-id): <redacted preview>`. **If absent: the wrapper exits with a distinct "unavailable" signal (not an error), and the gate shows the preview-unavailable notice from F5 — it does NOT block.** Document the trade-off explicitly in the gate copy: no automated scan ran; the user is the sole filter.
  2. Render numbered-list-in-chat (per-model opt-in + responsibility ack + cancel; numbered list because AskUserQuestion caps at 4). Use the documented "narrow exception for legitimate option overflow" rule with the "Pick a number or describe what you want." hint.
  3. Responsibility acknowledgment text (working draft): *"I acknowledge that this plan content will be sent to the selected external vendors, and that I have configured each vendor with an appropriate data-handling policy (paid plan + DPA where applicable) per my organization's requirements. I accept responsibility for what is egressed."* The user must say yes AND select ≥1 model to proceed.
  4. Surface the chosen subset to pass 2 as a comma-separated string for `panel-critique.sh --models`. **Record whether the gitleaks preview ran** (`content_preview: ran | unavailable`) for the sidecar audit header.
- **Patterns to follow:** `ce-doc-review` SKILL.md Phase 0; `docs/solutions/skill-design/post-menu-routing-belongs-inline-2026-04-28.md`; `docs/solutions/best-practices/ce-pipeline-end-to-end-learnings-2026-04-17.md` (compact-preview-then-Proceed/Cancel).
- **Test scenarios:**
  - `gitleaks-scan.sh` against a plan with a planted AWS key surfaces the hit (rule-id, line, redacted preview).
  - `gitleaks-scan.sh` against a clean plan returns an empty findings array.
  - **`gitleaks-scan.sh` when gitleaks is NOT installed exits with the "unavailable" signal (distinguishable from both "clean" and "error"); the gate renders the preview-unavailable notice and still requires the responsibility ack (regression test for graceful degradation).**
  - Gate with all models available + zero gitleaks hits: presents clean preview + per-model options + ack + cancel; default selection none.
  - Gate with 1 model unavailable: presents fewer per-model options + one "skipped because X" note.
  - User declines responsibility → routes to F4.
  - User accepts responsibility but selects no models → routes to F4 equivalent.
  - User accepts + selects ≥1 model → routes to pass 2.
  - Routing lines for proceed/cancel are inline in SKILL.md (regression test that fails if they move to a reference).
  - Each option label is self-contained and third-person.
- **Verification:** Manually walking the gate exercises each branch (all-models, subset, decline, no-models, **gitleaks-present, gitleaks-absent**). The contract test (U12) asserts routing lines + the preview-unavailable notice exist inline in SKILL.md.

### U5. Pass-2 dispatcher (thin slice) — **build-time harness bundling + drift test** + shell-out + raw record parsing + state machine

*(v1 U8 — moved onto the thin-slice path; this is the unit that makes the skill first dogfoodable. Build-time copy + drift test land HERE, not at the end. Output is raw/unverified at this stage — verification arrives in U9.)*

- **Goal:** Bundle the canonical harness into the skill via a build-time copy step, add the drift contract test, invoke the **bundled** `panel-critique.sh` with the chosen model subset, stream per-(model, lens) progress to chat, parse the resulting records into a structured set, and present them **raw (unverified, clearly labeled)** so the slice is dogfoodable.
- **Requirements:** R3 (recipe sequencing); R6 (subset propagation); R11 (per-model record structure); R15 (progress streaming); Key Decision: bundle the harness under the skill's `scripts/` (build-time copy, **not** symlink — symlinks break the converter per AGENTS.md).
- **Dependencies:** U3, U4. **Does NOT depend on U6/U7/U8** — the thin slice bundles and shells the *current* canonical harness (codex + gemini, sequential, no `--models` flag yet). `panel-critique.sh` invocation during this phase passes the model subset via whatever the current harness supports; if the current harness predates `--models`, the thin slice runs the harness's current default arm set and filters records by the user's selection post-hoc. (U8 adds the real `--models` flag + parallelism, after which the dispatcher passes `--models` directly.)
- **Files:**
  - `plugins/compound-engineering/skills/ce-deep-review-beta/scripts/bundle-harness.sh` (new — the build-time copy step)
  - `plugins/compound-engineering/skills/ce-deep-review-beta/scripts/panel-critique.sh` (new — bundled copy, produced by bundle-harness.sh)
  - `plugins/compound-engineering/skills/ce-deep-review-beta/scripts/arms.py` (new — bundled copy)
  - `tests/skills/ce-deep-review-bundle-drift.test.ts` (new — asserts bundled copies byte-match canonical)
  - `plugins/compound-engineering/skills/ce-deep-review-beta/references/arm-invocation.md` (new)
  - `plugins/compound-engineering/skills/ce-deep-review-beta/references/ship-state-machine.md` (new)
  - `plugins/compound-engineering/skills/ce-deep-review-beta/SKILL.md` (modify — invoke bundled script; present raw records labeled `verification: none (thin-slice)`)
- **Approach:**
  - **Bundling (build-time copy):** `bundle-harness.sh` copies `scripts/eval/cross_model_review/{panel-critique.sh,arms.py,<lens rubrics>}` → the skill's `scripts/`. It is run by a maintainer (and in CI) whenever the canonical harness changes. **No symlinks** — the converter copies each skill dir as an isolated unit, so a symlink would dangle on install (AGENTS.md File-References-in-Skills). The bundled copies are checked into the repo (so installed skills are self-contained) and regenerated by re-running `bundle-harness.sh`.
  - **Drift test:** `ce-deep-review-bundle-drift.test.ts` reads both the canonical and bundled files and asserts byte-equality (modulo a documented header banner if one is injected). This test **fails after U6/U7/U8 modify the canonical harness until `bundle-harness.sh` is re-run** — that is the intended forcing function: any canonical change must be followed by a re-bundle. Document this in `arm-invocation.md`.
  - **Dispatch + state machine:** Invoke `bash "${CLAUDE_SKILL_DIR}/scripts/panel-critique.sh" ... "$PLAN_PATH"` via the runtime Bash tool with narrow `allowed-tools: Bash(bash *panel-critique.sh)`. Stream stderr per-(model, lens) progress to chat (R15). Walk `/tmp/cmre-panel/records/${cli}__${lens}.json`; parse `findings[]` into a structured set keyed by `(arm, lens, finding_index)`. The state-machine reference documents the multi-dimensional state space (consent: pending/granted/declined; pass-1: idle/running/complete/failed; per-arm pass-2: idle/running/ok/timeout/missing/auth_fail/empty/malformed; verification: **none-thin-slice** (this phase) → queued/running/complete (Phase 3); sidecar: unwritten/partial/written).
  - **Thin-slice output:** present parsed findings to chat AND write a `<plan>.deep-review.md` sidecar whose frontmatter includes `verification: none (thin-slice)` and a prominent banner: *"Cross-model findings below are UNVERIFIED — confabulation-checking is still manual at this stage."* This is the dogfood deliverable.
- **Patterns to follow:** `plugins/compound-engineering/AGENTS.md` "Permission gate on extracted scripts" (`${CLAUDE_SKILL_DIR}` + narrow allowed-tools); `docs/solutions/skill-design/git-workflow-skills-need-explicit-state-machines-2026-03-27.md`.
- **Test scenarios:**
  - `bundle-harness.sh` produces bundled copies that byte-match canonical; the drift test passes immediately after running it.
  - Drift test FAILS when canonical `arms.py` is edited without re-bundling (regression guard — assert by editing a fixture canonical and asserting the test reports drift).
  - Dispatcher invokes the bundled `panel-critique.sh` and waits.
  - Per-(model, lens) progress lines stream to chat as they arrive (inject a `sleep` into a mock arm; verify chat output before completion).
  - On all-arms-ok: structured set contains one finding-array per (model, lens) cell.
  - On one-arm-timeout/empty/malformed: cells marked with the outcome; thin-slice sidecar notes reduced coverage.
  - State machine: `consent: declined` never reaches pass 2.
  - Thin-slice sidecar carries `verification: none (thin-slice)` + the unverified banner.
- **Verification:** Live run against a test plan with the current harness produces records (codex + gemini × 6 lenses) and a thin-slice sidecar. `bun test tests/skills/ce-deep-review-bundle-drift.test.ts` passes after bundling.

> ### ⛳ Phase 1 dogfood gate
> After U5, the skill is runnable end-to-enough to dogfood. **Run `ce-deep-review-beta` on real high-stakes plans for ~1–2 weeks and gather the friction signal:** does collapsing the terminal hop change whether the deep review actually gets run, and how do users react to the unverified output? **Decision:**
> - **Usage lifts / clear appetite** → proceed to Phase 2 (grok + agy + subset/parallel) and Phase 3 (verification + reconciliation) with evidence behind the investment.
> - **Friction was not the bottleneck** → stop here or pivot to the permanent thin-wrapper shape; do NOT build the agy migration, grok arm, and verifier corpus on spec. (The gemini→agy migration may still be forced independently by the 2026-06-18 cutoff for the *eval* harness, but that is decoupled from this skill's investment.)
> - **Equivocal** → extend the dogfood window or narrow the next phase to the single highest-signal addition (likely verification, since it removes the most error-prone manual step).

### U6. Add grok arm to `arms.py`

*(v1 U3 — unchanged except now gated by the dogfood signal; lands after U5.)*

- **Goal:** Extend the cross-model harness with a `grok` arm matching the validated posture from U1.
- **Requirements:** R4 (grok arm); R5 (arm posture symmetry); R6 (subset-selection mechanism).
- **Dependencies:** U1; dogfood gate (proceed decision).
- **Files:**
  - `scripts/eval/cross_model_review/arms.py` (modify — add GROK_BASE, `elif cli == "grok"` branch, "grok" to argparse choices)
  - `tests/cross-model-review-driver.test.ts` (modify — grok cases mirroring codex/gemini)
  - **Re-run `bundle-harness.sh`** so the skill's bundled copy picks up grok (the U5 drift test enforces this).
- **Approach:** Mirror the codex/gemini pattern. Add `GROK_BASE = ["grok", "-p", GROK_INSTRUCTION, ...flags from U1...]`. Use `--prompt-file` via a temp file in `build_invocation`. Add `"grok"` to argparse choices. Posture flag values come from U1's findings doc.
- **Patterns to follow:** `arms.py` CODEX_BASE/GEMINI_BASE constants; build_invocation pattern; argparse choices.
- **Test scenarios:**
  - `build_invocation("b_isolated", "grok", doc, rubric)` returns the correct argv shape, a `--prompt-file` temp file with the assembled payload, and a fresh-tempdir cwd.
  - `build_invocation("c_fixed_context", "grok", ..., context)` includes the context section.
  - Defensive: doc content does not appear in argv (`doc_in_argv == False`).
  - Integration smoke (live, optional): `run-arm b_isolated grok <small-doc> <rubric>` returns non-empty within timeout.
  - `parse_findings` parses grok's chosen output format.
  - Drift test passes after re-bundling.
- **Verification:** `python3 arms.py run-arm b_isolated grok <doc> <rubric>` exits 0 with a non-empty `findings` array. `bun test tests/cross-model-review-driver.test.ts` passes. Drift test green.

### U7. Migrate gemini arm to agy in `arms.py`

*(v1 U4 — auth-detection now uses the U2-discovered rule, not a hardcoded `~/.gemini/oauth_creds.json`.)*

- **Goal:** Replace the legacy gemini arm with the validated agy posture from U2. Carry across the auth-detection update **using the credential signal discovered in U2**.
- **Requirements:** Migration option (a); R5; R9; Pre-v1 Ship Gate 3 (validated in U2).
- **Dependencies:** U2; dogfood gate (proceed decision).
- **Files:**
  - `scripts/eval/cross_model_review/arms.py` (modify — replace GEMINI_BASE/AGY_INSTRUCTION with AGY_BASE using validated flags; update detection logic to the U2 rule; update header comment block to reflect agy as canonical, gemini deprecated)
  - `scripts/eval/cross_model_review/panel-critique.sh` (modify — replace `gemini` with `agy` in the model loop)
  - `tests/cross-model-review-driver.test.ts` (modify — replace gemini cases with agy)
  - `tests/cross-model-review-corpus.test.ts` (modify — update arm enumeration)
  - **Re-run `bundle-harness.sh`** (drift test enforces).
- **Approach:** Build `AGY_BASE = ["agy", "-p", AGY_INSTRUCTION, "--sandbox", "--add-dir", <doc-dir>, ...]`. Append the U2 prompt-side directive. Write the doc to a temp file under a `--add-dir`-scoped workspace; the prompt tells agy to read that path. **Update auth detection to the mechanism U2 discovered** — agy is available iff `command -v agy` succeeds AND the U2-discovered credential signal is present, non-empty, and non-expired (do not call agy to verify — that would be egress). Whatever the path is (it is NOT assumed to be `~/.gemini/oauth_creds.json` — U2 confirms it), the detection reads it from a single documented constant so it is changed in one place. Document the prompt-side-constraint-is-best-effort caveat in the arms.py header.
- **Patterns to follow:** existing codex/gemini arm structure.
- **Test scenarios:**
  - `build_invocation("b_isolated", "agy", doc, rubric)` returns the chosen agy posture flags + a `--add-dir` workspace at the doc's temp dir.
  - Auth detection: a fake expired credential (at the U2-discovered location) → "unavailable" without invoking agy.
  - Auth detection: a non-empty valid credential → "available."
  - The arms.py header comment accurately reflects agy's actual CLI surface (no `--prompt-file`/`--output-format`, plan-mode absent) AND the actual auth path.
  - Integration smoke (live): with a valid agy login, `run-arm b_isolated agy <small-doc> <rubric>` returns non-empty.
  - Regression: codex arm output unchanged.
  - Drift test passes after re-bundling.
- **Verification:** `python3 arms.py run-arm b_isolated agy <doc> <rubric>` succeeds when authed. `bun test tests/cross-model-review-driver.test.ts` passes. arms.py header documents the agy migration + user-responsibility for DPA/paid-plan + the real auth path.

### U8. Extend `panel-critique.sh` with `--models` subset + parallel-across-models execution

*(v1 U5 — unchanged except for the re-bundle step + dogfood gating.)*

- **Goal:** Support per-run model selection (R6) and reduce wall-time by parallelizing across models while preserving per-(model, lens) progress lines (R15).
- **Requirements:** R6 (subset selection); R15 (progress streaming); R3 (recipe sequencing).
- **Dependencies:** U6, U7; dogfood gate.
- **Files:**
  - `scripts/eval/cross_model_review/panel-critique.sh` (modify — accept `--models codex,grok,agy`; per-model parallel with per-model sequential lenses; emit progress lines)
  - `tests/cross-model-review-driver.test.ts` (modify — subset-selection cases)
  - **Re-run `bundle-harness.sh`**; update the U5 dispatcher to pass `--models <subset>` directly (replacing the thin-slice post-hoc record filter).
- **Approach:** Parse `--models codex,grok,agy` (default = all available). Fork one subshell per selected model running the six lenses sequentially; each emits `[model lens] findings=N` to stderr. Parent waits on all children. Records land at `${CMRE_OUT_DIR:-/tmp/cmre-panel}/records/${cli}__${lens}.json`. Preserve `CMRE_TIMEOUT` as per-(model, lens) timeout. No cross-vendor retry — emit per-arm outcome (`ok`/`timeout`/`missing`/`auth_fail`/`empty`) to stderr.
- **Patterns to follow:** current `panel-critique.sh` lens-loop; bash background-job pattern.
- **Test scenarios:**
  - `--models codex foo.md` runs only codex across six lenses.
  - `--models codex,grok foo.md` runs both in parallel; per-(model, lens) progress interleaves on stderr.
  - Records keyed `${cli}__${lens}.json` — no collisions.
  - One model missing locally → exit 0, emit `[model lens] SKIP — not installed` per lens.
  - Wall-time on 6-lens × 3-model with mock arms (`true`) ≤ 1.2× single-arm wall-time.
  - Default (no `--models`) unchanged from post-U6/U7 arm set.
  - Drift test passes after re-bundling.
- **Verification:** `bash panel-critique.sh --models codex,grok foo.md` exits 0 with records for both models; wall-time on a 3-model run ≤ 60% of sequential.

### U9. Verification step — agent grounds each cross-model finding against the doc

*(v1 U9 — unchanged; upgrades the thin-slice output from raw to verified.)*

- **Goal:** Implement the per-finding verification protocol — orchestrator-as-verifier locates cited text, tags CONFIRMED with inline quote, NOT-FOUND-IN-DOC for confabulations, NEEDS-HUMAN for ambiguous judgment. Verification is blind to the producing model.
- **Requirements:** R10 (verification tags + inline-quote requirement); Key Decision: inline-quote requirement; Key Decision: bidirectional rate measurement (measured in U11).
- **Dependencies:** U5 (parsed records); dogfood gate (proceed). Replaces the thin-slice `verification: none` state with real tags.
- **Files:**
  - `plugins/compound-engineering/skills/ce-deep-review-beta/references/verification-protocol.md` (new)
  - `plugins/compound-engineering/skills/ce-deep-review-beta/SKILL.md` (modify — inline the verification dispatch trigger; remove the thin-slice unverified banner; load the reference)
- **Approach:** For each cross-model finding, dispatch a sub-agent (or in-orchestrator inline pass for small sets) with a prompt containing the plan content + finding text but NOT the producing model identifier. Instruct: (a) locate the cited text/claim; (b) CONFIRMED with inline quote if grounded; (c) NOT-FOUND-IN-DOC if absent; (d) NEEDS-HUMAN if strategic/aesthetic judgment. Use the platform's subagent primitive with `mode` omitted per AGENTS.md. Output schema `{finding_id, tag, quote?, reason?}` — strict; violations route to NEEDS-HUMAN. A backstop grep ("did the inline quote actually appear?") runs synchronously after each CONFIRMED tag.
- **Patterns to follow:** `ce-doc-review` `references/subagent-template.md`; `docs/solutions/skill-design/pass-paths-not-content-to-subagents-2026-03-26.md`; `docs/solutions/skill-design/cross-model-eval-decision-grade-2026-05-26.md` (blind-judge).
- **Test scenarios:**
  - Verbatim-quote finding → CONFIRMED + inline quote; backstop grep confirms.
  - "Plan says X on line 42" with no such text → NOT-FOUND-IN-DOC.
  - Strategic judgment, no specific text → NEEDS-HUMAN.
  - Verification prompt excludes producing model's name (blind-to-producer; assertable from prompt content).
  - CONFIRMED without inline quote → rejected → downgrades to NEEDS-HUMAN.
  - Backstop grep mismatch (quote not in plan) → downgrades to NOT-FOUND-IN-DOC with note.
- **Verification:** Manual exercise on a curated set (5+ confabulated, 5+ grounded, 3+ judgment) produces expected tags. Backstop grep catches >95% of false-CONFIRMs on the manual set (U11 measures formally).

### U10. Reconciliation + sidecar writer with coverage frontmatter + audit metadata + rotation

*(v1 U10 — adds the `content_preview` audit field from U4's graceful-degradation path.)*

- **Goal:** Assemble verified panel + cross-model findings + decision-changing union into the sidecar. Write to `.deep-review.md` (cross-model) or `.panel-review.md` (panel-only). Include `coverage:` frontmatter, audit-metadata header (models, timestamp, `git config user.name`, **`content_preview: ran | unavailable`**), inline quotes for CONFIRMED, rotated history (keep last 5).
- **Requirements:** R11 (report structure); R12 (rotation w/ retention cap); R13 (panel-only filename); R14 (filename reservation); Key Decision: commit-as-audit; v2: record content-preview availability.
- **Dependencies:** U9.
- **Files:**
  - `plugins/compound-engineering/skills/ce-deep-review-beta/references/reconciliation.md` (new)
  - `plugins/compound-engineering/skills/ce-deep-review-beta/scripts/sidecar-rotate.sh` (new — keep last 5)
  - `plugins/compound-engineering/skills/ce-deep-review-beta/SKILL.md` (modify — inline write trigger; load reference)
- **Approach:** Assemble sidecar markdown: YAML frontmatter with `coverage: full|reduced-confidence|panel-only`, `plan`, `models`, `timestamp`, `user` (`git config user.name`), `content_preview: ran|unavailable`; banner if reduced/panel-only; Claude panel findings (untagged, trusted); cross-model findings grouped by-lens, each tagged with verification status + inline quote for CONFIRMED; decision-changing-union section (verified cross-model findings NOT in the Claude panel). Before writing, rotate any existing sidecar to `<plan>.deep-review.<ISO-timestamp>.md`, then delete rotations beyond the 5 most recent. Filename: `.deep-review.md` if any cross-model arm participated; `.panel-review.md` if zero (R13). DO NOT modify `.gitignore`.
- **Patterns to follow:** repo markdown frontmatter convention (origin: docs/plans/2026-05-24-001-...-cross-model-review-eval-plan.md); sidecar-rotation precedent in `docs/solutions/skill-design/` if any, else cleanest shell wrapper.
- **Test scenarios:**
  - `coverage: full` with 3-of-3 arms, no per-arm errors.
  - `coverage: reduced-confidence` with 1-of-3 timed out (banner names the missing arm + outcome).
  - `coverage: panel-only` with zero arms; filename `<plan>.panel-review.md`.
  - Audit header includes `git config user.name`, ISO timestamp, participating models, **and `content_preview` state**.
  - Inline quote under every CONFIRMED cross-model finding.
  - Decision-changing-union lists verified cross-model findings absent from the Claude panel.
  - Rotation: 7 prior sidecars → 5 most recent preserved, 2 oldest deleted.
  - First run: no existing sidecar; no rotation; lands cleanly.
  - `.gitignore` unchanged (regression test).
- **Verification:** Manual end-to-end on a test plan; sidecar has all sections, frontmatter, inline quotes. Run twice → prior rotated. Run 7 times → only 5 most recent rotations remain.

### U11. Bidirectional verifier rate measurement against held-out corpus (**incl. agy-voiced confabulations + calibration-scope honesty**)

*(v1 U11 — corpus now stresses agy's voice, not just gemini's; the verdict reports its calibration scope rather than implying universal validity.)*

- **Goal:** Build the held-out verification corpus and measure false-CONFIRM and false-NOT-FOUND-IN-DOC rates. Gate v1 promotion on both rates ≤ 5% **for the model voices the corpus actually represents**, and report the calibration scope explicitly.
- **Requirements:** R10; Key Decision: bidirectional rate thresholds (≤5% each + consequence); RBP 10 (bidirectional measurement); origin Outstanding Question on false-CONFIRM rate.
- **Dependencies:** U9. **Best run after the dogfood gate so the corpus can be seeded from real agy/grok output**, not only synthetic gemini-flavor confabulations.
- **Files:**
  - `plugins/compound-engineering/skills/ce-deep-review-beta/scripts/verifier-eval/corpus/` (new — hand-curated plan + known-confabulated findings, both directions, **gemini-voiced AND agy-voiced AND grok-voiced where available**)
  - `plugins/compound-engineering/skills/ce-deep-review-beta/scripts/verifier-eval/measure.py` (new — runs verifier against corpus, emits rate report with a `calibration_scope` field)
  - `plugins/compound-engineering/skills/ce-deep-review-beta/scripts/verifier-eval/README.md` (new — corpus construction guidance + measurement protocol)
  - `docs/solutions/skill-design/2026-MM-DD-ce-deep-review-verifier-rates.md` (new — record of the run + verdict + calibration scope)
- **Approach:** Hand-curate ≥20 findings across both directions: (a) ~10 confabulated (cite text not in the plan, already-resolved issues, fabricated line numbers, plausible-but-fake quotes) and (b) ~10 genuinely-grounded — **each direction sampled across model voices, including agy-voiced terse/blunt phrasings** drawn from real agy output once available (U2 smoke output + early Phase-2 runs), not only gemini-flavored synthetics. The v1 plan's corpus was seeded from one prior gemini eval; v2 explicitly requires agy representation because **agy is the canonical arm being shipped and has not run at scale** — a verifier that passes against synthetic gemini-flavor confabulations could be miscalibrated on agy's actual confabulation profile. Run the verifier with arm identifier blinded. Compute false-CONFIRM = `false_positives / total_confabulated`; false-NOT-FOUND = `false_negatives / total_grounded`. N=3 trials per item (variance reduction). **The report carries a `calibration_scope` field naming which model voices are represented and at what sample size; if agy is under-represented (e.g., < 5 agy-voiced items because agy hasn't produced enough real output yet), the report flags `calibration_scope: gemini-calibrated, agy-pending` and the promotion verdict is `eligible (gemini-voiced); agy-voiced unproven` rather than an unqualified pass.** If either rate > 5%: enact the brainstorm fallback (false-CONFIRM > 5% → default-tag NEEDS-HUMAN; false-NOT-FOUND > 5% → NOT-FOUND-IN-DOC advisory). If both ≤ 5% AND agy is adequately represented: beta eligible for stable promotion.
- **Patterns to follow:** `docs/solutions/skill-design/cross-model-eval-decision-grade-2026-05-26.md` (pre-registration + corpus-floor honesty — report `inconclusive` if underpowered, don't fake a verdict); `docs/solutions/skill-design/safe-auto-rubric-calibration-2026-04-25.md` (N≥3 trials + variance aggregation).
- **Test scenarios:**
  - `measure.py` emits `{trials, false_confirm_rate, false_not_found_rate, calibration_scope, per_item: [...]}`.
  - N=3 trials per item; report aggregates per-item variance.
  - Corpus < 20 items → `inconclusive: true`, no pass/fail verdict.
  - **Corpus with < N agy-voiced items → `calibration_scope: gemini-calibrated, agy-pending`; verdict is scope-qualified, not unconditional.**
  - Both rates ≤ 5% AND agy adequately represented → `promote: eligible`.
  - Either rate > 5% → specific recommendation (`fallback: needs-human-default` or `fallback: advisory-tag`) + the failing items.
  - Verifier prompt during measurement excludes the producing model name (assertable from prompt content).
  - Confidence-anchored scoring: items tagged `expected_tag`; report compares observed vs expected.
- **Verification:** `measure.py` against the curated corpus produces a JSON report **with an explicit calibration scope**. The solution doc records the measurement, the verdict, the calibration scope, and any fallbacks. Beta-to-stable promotion is gated on this report AND on agy being adequately represented (not merely on the gemini-voiced rate clearing).

### U12. Test contract + user-facing doc + README update + brainstorm-doc corrections

*(v1 U12 — drift test removed from here (it lives in U5 now); contract test adds the graceful-degradation + thin-slice assertions; brainstorm correction includes the real agy auth path.)*

- **Goal:** Add the skill contract test, write the user-facing doc, update the README, and correct the brainstorm doc's agy assumptions discovered in U2.
- **Requirements:** existing repo test conventions; user-facing-doc convention; brainstorm-doc maintenance.
- **Dependencies:** U1, U2, U3, U4, U5, U9, U10, U11.
- **Files:**
  - `tests/skills/ce-deep-review-contract.test.ts` (new — asserts SKILL.md structural contract)
  - `docs/skills/ce-deep-review.md` (new — user-facing doc; mirror `docs/skills/ce-doc-review.md`)
  - `docs/skills/README.md` (modify — add ce-deep-review entry to Document Review category)
  - `plugins/compound-engineering/README.md` (modify — add row to Document Review skill table; update component counts)
  - `docs/brainstorms/2026-05-28-ce-deep-review-requirements.md` (modify — correct R5's agy-posture claims + the Dependencies/Assumptions section's env-var auth assumption to the actual agy CLI surface + actual auth path from U2; the obsolete env-var assumption lives in Dependencies/Assumptions, not R9)
- **Approach:** Contract test asserts presence of structural tokens — sidecar filenames (`.deep-review.md`, `.panel-review.md`), `coverage:` enum values, banner copy patterns, verification tags (CONFIRMED, NOT-FOUND-IN-DOC, NEEDS-HUMAN), inline-routing lines for the consent gate, **the gitleaks preview-unavailable notice (graceful-degradation regression guard)**, the AskUserQuestion ToolSearch preload. Use `.toMatch` for regex tolerance. (The bundled-harness drift test already exists from U5 — U12 does not re-create it.) User-facing doc explains: what the skill is, when to use it, how it differs from ce-doc-review, the onboarding requirement (user-responsibility for OAuth + paid plans + DPA, with the **actual** agy auth path from U2), the sidecar artifacts, the panel-only fallback, **and that the beta is invoked explicitly (typed slash command / explicit Skill call) because `disable-model-invocation: true` suppresses only model-auto-invocation, not deliberate user invocation**. README addition uses the existing row shape. The brainstorm-doc edit corrects R5 (no `--approval-mode plan`; best-effort prompt-side posture) and the Dependencies/Assumptions section (real auth path, not the `AV_API_KEY` env-var assumption — R9 itself is generic and does not name the mechanism).
- **Patterns to follow:** `tests/review-skill-contract.test.ts`; `docs/skills/ce-doc-review.md`; `plugins/compound-engineering/README.md` rows.
- **Test scenarios:**
  - Contract test asserts SKILL.md contains the `Skill("ce-doc-review", "mode:headless` invocation.
  - Asserts the responsibility-acknowledgment requirement.
  - Asserts both sidecar filename patterns + the `coverage:` enum values.
  - Asserts the consent-gate inline routing lines exist (regression guard).
  - **Asserts the gitleaks preview-unavailable notice exists inline (graceful-degradation guard).**
  - `bun test tests/frontmatter.test.ts` + `tests/skill-shell-safety.test.ts` pass.
  - `bun run release:validate` reports the new skill in counts; no drift errors.
  - User-facing doc renders cleanly; FAQ covers OAuth/paid-plan/DPA setup + the explicit-invocation note.
- **Verification:** All bun tests pass. User-facing doc states the OAuth + paid-plan + DPA user-responsibility framing with the real agy auth path, and the explicit-invocation note. The brainstorm doc's R5 + Dependencies/Assumptions section reflect the actual agy surface and auth path. README counts correct.

---

## Alternative Approaches Considered

- **Replicate ce-doc-review's persona dispatch internally** rather than invoking it as a sub-skill. Rejected: duplicates ~420 lines of orchestration; headless invocation inherits the calibrated pipeline.
- **Permanent thin wrapper** (panel + consent + bash-handoff, no new arm, no verification) as the *final* shape. Not chosen as the destination, but **adopted as the first build stage (U3–U5) and dogfood gate** — v2's compromise between the brainstorm's turnkey decision and the adversarial sequencing finding. If the dogfood gate shows friction was the whole story, this stage *becomes* the shipped shape rather than a throwaway.
- **Phase 0.5 separate "alpha" phase.** Considered (adversarial recommendation). Folded into the main unit sequence instead of a separate phase: U3–U5 are the alpha, run against the current harness, gated before the heavy investment. Same de-risking, no parallel skill directory to maintain.
- **Symlink the canonical harness into the skill** instead of build-time copy. Rejected: the converter copies each skill dir as an isolated unit (AGENTS.md), so a symlink dangles on install. Build-time copy + a drift test is the portable mechanism.
- **Reimplement gitleaks rules in JS/TypeScript.** Rejected: gitleaks combines regex + entropy + stopword tries; reimplementing is brittle. Shell out and **degrade gracefully** when the binary is absent (v2) rather than hard-requiring it.
- **Hard-block when gitleaks is missing** (v1 behavior). Rejected in v2: bouncing gitleaks-less first-timers suppresses the exact adoption signal the skill exists to gather. Graceful degradation + a sole-filter notice + the responsibility ack preserves protection without the wall.
- **Full N×M parallelism** for pass 2. Rejected: complicates progress streaming + error attribution without a meaningful win at three arms.
- **Production-grade retry/circuit-breaker** per vendor. Rejected: overkill for a three-arm developer command. Report per-arm outcome; the user re-runs.
- **agy as canonical with gemini removed entirely.** This is Option (a). Alternative was Option (c) — ship without gemini/agy, add post-migration. Option (a) wins on parity with the 2026-06-15 calendar fallback to (c).

---

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Friction was not the actual bottleneck; turnkey investment doesn't pay back** | Medium | High — wasted grok/agy/verifier work | **The Phase 1 dogfood gate is the mitigation.** The thin slice (U3–U5) tests the hypothesis against the current harness before grok/agy/verifier are built. A no-lift signal stops the spend at 3 units, not 12. |
| agy posture-floor cannot be empirically validated in U2 | High | High — forces Option (c) | U2 is early. The 2026-06-15 calendar fallback is the operational margin. If U2 fails, U7 becomes "remove gemini from arms.py." |
| **agy's actual auth mechanism differs from any assumed path** | Medium | Medium — detection rule wrong, agy silently "unavailable" | **v2 makes the auth path a U2 discovery, not an assumption.** Detection reads a single documented constant set from U2's finding. No downstream unit hardcodes `~/.gemini/oauth_creds.json`. |
| grok behavioral smoke test reveals `--permission-mode plan` does not constrain at runtime | Medium | High — grok arm can't ship | U1 is early. Fallback: ship without grok (codex + agy only). |
| **Bundled harness drifts from canonical** | Medium | Medium — skill behavior diverges from repo | **Build-time copy (`bundle-harness.sh`) + a drift test that lands in U5 and fails after any canonical edit until re-bundle.** Symlinks rejected (break converter). Every canonical-modifying unit (U6/U7/U8) re-runs the bundle. |
| Verifier rate measurement (U11) exceeds 5% threshold | Medium | Medium — no stable promotion; NEEDS-HUMAN/advisory tags | Brainstorm specified the consequence. Beta stays beta; users still get usable output with fallback tags. |
| **Verifier passes on gemini-voiced corpus but is miscalibrated on agy** | Medium | Medium — false confidence in promotion | **U11 corpus requires agy-voiced items; the verdict carries a `calibration_scope` field. Promotion gates on agy being adequately represented, not just the gemini rate clearing.** Best run after the dogfood gate so real agy output seeds the corpus. |
| agy `-p` argument-length limit hit by large plans | Medium | Medium — large plans can't route through agy | U2 measures + documents the cap. `--add-dir` workspace + "read the file at <abs-path>" directive sidesteps shell-arg limits. |
| **Gitleaks not installed on user's machine** | High | **Low (v2) — gate degrades gracefully** | **v2: the gate opens anyway, shows a sole-filter notice, still requires the responsibility ack, and records `content_preview: unavailable` in the audit header.** Install instructions in the onboarding doc upgrade the preview. No first-timer bounce. |
| Beta-to-stable promotion never happens | Medium | Low — beta works, just doesn't promote | U11 is the gate; if it persistently misses, the team learns the verifier design needs rework — useful information. |
| **Adoption metric (≥5 runs/2wk) blocked by `disable-model-invocation: true`** | Low | Low — metric uncountable if the skill can't be invoked | **`disable-model-invocation` suppresses only model-auto-invocation; explicit user invocation (typed slash command / explicit `Skill()` call) still works. Documented in U12's user-facing doc + Operational Notes.** The dogfood gate runs are explicit invocations and count toward the metric. |
| Sidecar committed to public repos with sensitive content | Low (after content-preview gate; higher if gitleaks absent) | High | The content-preview gate is the primary mitigation when gitleaks is present; when absent, the sole-filter notice + responsibility ack + `content_preview: unavailable` audit record make the gap explicit. Commit-as-audit is the user's per-repo call. |
| New orchestrator skill changes ce-doc-review's invocation contract | Low | Medium — headless envelope must stay stable | Contract test on the headless envelope (U12). |

---

## Phased Delivery

Each phase is a candidate PR boundary. Phase reviews are non-trivial — explicit gate decisions are required between phases.

**Phase 0 — Validation Gates (U1, U2)** *(independent; can run in parallel with Phase 1)*

PR scope: validation scripts + findings docs (incl. **agy auth-mechanism discovery**) + onboarding doc + brainstorm-doc R5/R9 corrections. No skill code.

**Phase 0 review gate:** Read both validation findings docs. grok fails → drop grok from v1. agy fails → drop agy, fall back to Option (c). Both fail → v1 is panel-only-with-codex; reconsider shipping. **Confirm U2 documented agy's actual auth path** (not the provisional `~/.gemini/oauth_creds.json`).

**Phase 1 — Dogfoodable thin slice (U3, U4, U5)** *(against the CURRENT codex+gemini harness; does not wait on Phase 2)*

PR scope: ce-deep-review-beta skill scaffold + headless pass-1 + consent gate (graceful gitleaks) + dispatcher against the bundled current harness + `bundle-harness.sh` + the drift test + raw-unverified thin-slice output.

**Phase 1 review gate = the ⛳ dogfood gate.** Frontmatter + ce-prefix + shell-safety + drift tests pass. Then **dogfood the thin slice on real plans for ~1–2 weeks** and decide: proceed to Phase 2/3 (usage lifts), stop/pivot-to-thin-wrapper (no lift), or extend/narrow (equivocal). This is the cheap test of the friction hypothesis.

**Phase 2 — Harness Extension (U6, U7, U8)** *(gated by the dogfood proceed-decision + Phase 0)*

PR scope: arms.py + panel-critique.sh + driver tests + re-bundle. Lands the grok arm, gemini→agy migration, `--models` subset + parallelization. Dispatcher upgraded to pass `--models` directly.

**Phase 2 review gate:** `bun test tests/cross-model-review-*.test.ts` + the drift test pass. Live smoke against each arm produces non-empty findings.

**Phase 3 — Verification & Reconciliation (U9, U10)**

PR scope: verification protocol + reconciled sidecar writer + rotation. Upgrades thin-slice raw output to verified, tagged, reconciled sidecars.

**Phase 3 review gate:** Manual end-to-end exercises F1 (happy path), F2 (partial), F3 (panel-only), F4 (decline), **F5 (gitleaks-absent graceful degradation)**.

**Phase 4 — Validation & Promotion (U11, U12)**

PR scope: verifier rate measurement (agy-voiced corpus) + contract test + user-facing doc + README.

**Phase 4 review gate:** Rate report shows ≤5% each **AND adequate agy representation** (eligible for promotion) or documents the fallback enacted + calibration scope. Contract test passes. README counts correct. brainstorm-doc updated.

**Calendar fallback trigger (2026-06-15):** If Phase 0 has not completed by 2026-06-15, fall back to Option (c) — ship v1 without agy. Re-scope U7 to "remove gemini from arms.py" and the dispatcher to a 2-arm (codex + grok) configuration. The fallback completes before the 2026-06-18 HTTP-410 cutoff because it removes the agy dependency entirely.

> **Sequencing note:** the dogfood gate (Phase 1) intentionally runs against the *current* codex+gemini harness, which works until the 2026-06-18 gemini cutoff. If the dogfood window would cross that date, swap the thin slice's gemini arm for codex-only rather than blocking the dogfood on the agy migration — the friction signal does not require a specific second arm.

---

## Dependencies / Prerequisites

- **Upstream tooling:** gitleaks is **recommended, not required** (v2). The gate degrades gracefully without it; installing it (`brew install gitleaks`) upgrades the content preview from manual-only to automated+manual. Documented in the onboarding doc.
- **Upstream vendor accounts:** User has a paid Antigravity plan with an acceptable DPA; xAI Grok credentials; codex installed and authed. **agy's exact auth/credential configuration is whatever U2 discovers** — the onboarding doc reflects the real mechanism, not a presumed env var or path. User responsibility per Key Decisions.
- **Upstream skill:** `ce-doc-review` must support `mode:headless` (it does). The headless-envelope shape is the contract.
- **Upstream harness:** `scripts/eval/cross_model_review/arms.py` + `panel-critique.sh` exist and follow the documented arm-add pattern. The thin slice bundles them as-is (U5); U6/U7/U8 extend the canonical copies.
- **External deadline:** Gemini CLI HTTP-410 cutoff is 2026-06-18. Phase 0 must complete by 2026-06-15 to maintain Option (a); otherwise Option (c) fallback fires. The thin-slice dogfood can use codex-only if its window crosses the cutoff.

---

## Key Technical Decisions

- **Beta rollout pattern.** Ship as `ce-deep-review-beta` with `disable-model-invocation: true` + `[BETA]` prefix; promote to stable only after U11's verifier rate measurement passes (with adequate agy representation). **`disable-model-invocation: true` suppresses only model-auto-invocation — explicit user invocation (typed slash command / explicit `Skill()` call) still works, which is how the adoption metric's runs accrue.** (See `docs/solutions/skill-design/beta-skills-framework.md`.)

- **Dogfood the thin slice before the heavy build.** U3–U5 ship a runnable panel + consent gate + bash-handoff against the *current* harness, emitting raw unverified records, gated by the Phase 1 dogfood gate. Rationale: tests the brainstorm's friction-is-the-bottleneck hypothesis for the cost of 3 units before committing to grok hardening + the agy migration + the verifier corpus. Honors the brainstorm's turnkey *destination* while answering the adversarial *sequencing* finding.

- **Invoke ce-doc-review headless, not replicate.** Pass 1 uses `Skill("ce-doc-review", "mode:headless <plan-path>")` and parses the envelope. Avoids duplicating ~420 lines of orchestration.

- **Bundle the cross-model harness via build-time copy (not symlink).** `bundle-harness.sh` copies canonical `scripts/eval/cross_model_review/*` into the skill's `scripts/`; the bundled copies are checked in so installed skills are self-contained (AGENTS.md). A **drift test (U5)** asserts bundled == canonical and fails after any canonical edit until re-bundle. Symlinks are rejected because the converter copies each skill dir as an isolated unit and a symlink would dangle on install.

- **Parallel across models, sequential lenses within each model** for pass 2 (lands in U8). ~10–15 min for a 3-model run vs. ~30–60 min sequential, while preserving per-(model, lens) progress streaming (R15).

- **agy auth detection uses the mechanism discovered in U2 — not a pre-assumed path.** The v1 plan asserted `~/.gemini/oauth_creds.json`; v2 treats that as unverified and makes U2 confirm agy's real credential storage. Detection reads a single documented constant set from U2's finding; no downstream unit hardcodes a path. The skill does NOT verify the DPA — user responsibility at the consent gate.

- **agy posture is best-effort prompt-side, not runtime-guaranteed.** `--sandbox` (FS-only) + `--add-dir` workspace + prompt-side directive ("read ONLY <path>; do not call tools"). agy has no `--approval-mode plan` equivalent; documented explicitly in arms.py + the user-facing doc. U2 validates it empirically constrains behavior.

- **grok `--sandbox <profile>` deferred to U1 measurement.** Likely `read-only`; confirmed empirically; lands as an `arms.py` constant in U6.

- **gitleaks runs via shell-out and degrades gracefully.** `gitleaks detect --no-git --source <plan> --report-format json --redact` when present; **when absent, the gate opens anyway with a sole-filter notice + the responsibility ack, and records `content_preview: unavailable`.** Recommended-not-required dependency; install instructions in onboarding (U2).

- **Consent gate UI is numbered-list-in-chat.** AskUserQuestion caps at 4; the gate needs per-model opt-in + responsibility ack + cancel. Per AGENTS.md "narrow exception for legitimate option overflow," numbered list with the "Pick a number or describe what you want." hint.

- **Responsibility acknowledgment text** (working draft; copy-refinable): *"I acknowledge that this plan content will be sent to the selected external vendors, and that I have configured each vendor with an appropriate data-handling policy (paid plan + DPA where applicable) per my organization's requirements. I accept responsibility for what is egressed."*

- **Sidecar is commit-as-audit; skill does not modify `.gitignore`.** R12's rotation policy stands (keep last 5). The audit header now also records `content_preview: ran | unavailable`.

- **Verifier dispatch is blind to producing model.** Prompt contains plan content + finding text, NOT model identifier. Mitigates in-family bias. U11 explicitly stresses non-Claude voices, **including agy-voiced findings**.

- **U11 verdict reports its calibration scope.** Promotion gates on both rates ≤5% AND agy being adequately represented in the corpus — not on the gemini-voiced rate alone. A gemini-calibrated-only corpus yields a scope-qualified verdict, not an unconditional pass.

- **No retry across vendors.** Per-arm outcome (`ok`/`timeout`/`missing`/`auth_fail`/`empty`/`malformed`) in the sidecar header; coverage degrades from `full` to `reduced-confidence` on any non-`ok`. The user re-runs.

---

## Success Metrics

- **Friction-hypothesis signal (NEW — the dogfood gate's metric):** during the Phase 1 dogfood window, the thin slice is run on ≥3 real high-stakes plans by ≥1 internal dev, and the team forms a qualitative read on whether removing the terminal hop changed run-likelihood. This is the cheap go/no-go for the rest of the build, not a vanity number.
- **Adoption signal:** internal developers run `ce-deep-review-beta` on ≥5 distinct high-stakes plans within 2 weeks of beta landing. (Manual count from committed sidecar artifacts; explicit invocation per the beta-trigger decision; no telemetry for v1.)
- **Decorrelation value:** ≥30% of full `ce-deep-review` runs surface ≥1 verified CONFIRMED cross-model finding the Claude panel did not raise. (From "decision-changing union" sections in committed sidecars; measurable only after Phase 3 verification lands.)
- **Verifier accuracy:** both false-CONFIRM and false-NOT-FOUND-IN-DOC rates ≤ 5% on the U11 held-out corpus, ≥20 items, N=3 trials, **with adequate agy-voiced representation and an explicit calibration scope**. (Gate for beta-to-stable promotion.)
- **No silent degradation:** every reduced-coverage run carries a visible `coverage: reduced-confidence` / `coverage: panel-only` frontmatter + header banner; every gitleaks-absent run carries `content_preview: unavailable`. (Asserted by U12 contract test.)
- **Onboarding cost:** a new developer can run their first `ce-deep-review` within 30 minutes of reading the onboarding doc. (Operational sanity check during Phase 4 review.)

---

## Scope Boundaries

- **Out of scope (carried from origin):**
  - The cross-model evaluation machinery (judge, trials, GT-match, decision-artifact, record-schema). The arms and harness runner are extended; the evaluation pipeline is not invoked by this skill.
  - Per-plan trust-based allow-listing.
  - Cost/token-budget estimation in the consent gate.
  - Headless / non-interactive mode for ce-deep-review v1.
  - Extension to ce-code-review or other artifact types.
  - A new non-Claude judge inside the flow.
- **Out of scope (plan-time):**
  - Production-grade retry/circuit-breaker per vendor.
  - Full N×M parallelism for pass 2.
  - Reimplementing gitleaks patterns in JS/TS.
  - Replicating ce-doc-review's persona dispatch internally.
  - Skill auto-modifying `.gitignore`.
  - Custom UX beyond the numbered-list consent gate.
- **Out of scope (v2):**
  - A permanently separate "alpha" skill directory. The thin slice IS the beta skill at an earlier maturity; it matures in place rather than living as a parallel artifact.

### Deferred to Follow-Up Work

- **Stable promotion (`-beta` → stable).** Gated on U11 (incl. agy representation). Follow-up PR runs the beta-promotion checklist + removes `disable-model-invocation`.
- **Opt-in-none vs. opt-out-with-content-gate friction tradeoff.** Revisit after the first ~10 beta runs.
- **Sidecar `.gitignore` reconsideration.** Plan-time decided commit-as-audit; revisit if committed sidecars leak LLM output into PRs.
- **Per-vendor retry policy.** None currently; add "retry once on timeout" if transient failures suppress completion.
- **Adoption telemetry baked into the skill.** Manual count for now.
- **Cross-platform agent target conversions** for the consent-gate numbered-list pattern. Per-target after stable promotion.

---

## Operational / Rollout Notes

- **Branch + PR cadence:** Each phase gets its own PR. Phase 0 may run in parallel with Phase 1; Phase 2 must not begin until the **dogfood gate proceed-decision** is recorded.
- **Commit prefixes:** `feat(ce-deep-review-beta): ...` for the thin-slice skill code in Phase 1 (U3, U4, U5); `feat(cross-model-eval): ...` for harness-extension commits in Phase 2 (U6, U7, U8); `feat(ce-deep-review-beta): ...` for Phase 3 (U9, U10) and the U11 verifier measurement; doc/test commits use the relevant scope. Per AGENTS.md, classify by intent and never use `compound-engineering` as a scope.
- **Beta invocation (adoption-metric enablement):** ce-deep-review-beta is invoked explicitly — a typed `/ce-deep-review-beta <plan>` slash command or an explicit `Skill("ce-deep-review-beta", ...)` call. `disable-model-invocation: true` only blocks description-matched auto-invocation. Dogfood runs and the ≥5-runs metric accrue from these explicit invocations. State this in the U3 commit message and the user-facing doc.
- **Skill validation via skill-creator:** per AGENTS.md "Validating Agent and Skill Changes," skill prose behavior cannot be tested via in-session typed-agent dispatch (caches at session start). Use the `skill-creator` skill for iteration.
- **Release-please:** do not hand-bump versions. Routine PRs do not cut releases.
- **Stale-install cleanup:** ce-deep-review-beta is net-new; no entries needed in `STALE_SKILL_DIRS` / `EXTRA_LEGACY_ARTIFACTS_BY_PLUGIN` now. Beta-to-stable promotion adds the `-beta` directory to those registries (handled in the promotion PR).
- **Bundled-harness maintenance:** any change to canonical `scripts/eval/cross_model_review/*` must be followed by `bash plugins/compound-engineering/skills/ce-deep-review-beta/scripts/bundle-harness.sh`. The drift test (U5) fails CI until this is done. Document in `arm-invocation.md`.
- **Tests:** run `bun test` after each phase. `bun run release:validate` after the final phase.

---

## Outstanding Questions

### Resolve Before Implementation

- None at planning time. Phase 0 surfaces implementation-time discoveries (agy posture-floor + **agy auth mechanism/credential path**, grok sandbox profile) into the Phase 0 review gate. The dogfood gate surfaces the friction-hypothesis answer into the Phase 1 → Phase 2 decision.

### Deferred to Implementation

- [Affects U1, U6][Technical] Exact `grok --sandbox <profile>`. Measured in U1; landed as a constant in U6. Likely `read-only`.
- [Affects U2, U7][Technical] Exact agy posture flag combination. Measured in U2; landed in U7. Best-effort prompt-side; documented.
- [Affects U2, U7][Technical] **agy's real auth mechanism + offline-detectable credential location.** Discovered in U2 (NOT assumed to be `~/.gemini/oauth_creds.json`); landed as a documented detection constant in U3's `env-detect.sh` + U7's arms.py.
- [Affects U2, U7][Technical] agy `-p` argument-length limit for large plans. Measured in U2; documented as a size cap. `--add-dir` workaround.
- [Affects U4][Technical] Final responsibility-acknowledgment copy. Working draft above; refine during U4.
- [Affects U5][Technical] How the thin slice maps the user's model subset onto the *current* harness if it predates `--models` (post-hoc record filter vs. running the harness default). Decided in U5; superseded by U8's real `--models` flag.
- [Affects U5][Technical] Permission gate strategy for `bash ${CLAUDE_SKILL_DIR}/scripts/panel-critique.sh`. Narrow `allowed-tools: Bash(bash *panel-critique.sh)` per AGENTS.md.
- [Affects U10][Technical] Group cross-model findings by lens vs. by arm. Plan recommends by-lens; confirm in U10 by previewing both.
- [Affects U11][Needs research] Held-out corpus construction. Hand-curate ≥20 items; **seed agy-voiced items from real agy output gathered during U2 + the Phase 2 smoke runs**; consider synthetic confabulations from prior eval records for the gemini-voiced portion. Document the build in U11's solution doc.
- [Affects U11][Technical] Exact implementation of the rate-miss fallbacks ("default-tag NEEDS-HUMAN" / "advisory NOT-FOUND") — probably a config flag the orchestrator reads.
