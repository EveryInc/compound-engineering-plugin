---
date: 2026-05-28
type: feat
origin: docs/brainstorms/2026-05-28-ce-deep-review-requirements.md
supersedes: docs/plans/2026-05-28-002-feat-ce-deep-review-skill-plan.md
status: active
title: ce-deep-review — turnkey high-stakes plan review across Claude + non-Claude models (v3)
---

# feat: ce-deep-review skill (v3)

> **v3 note.** Supersedes `2026-05-28-002-...-skill-plan.md`. v2 successfully fixed the round-1 P1 findings (verifier calibration, build-time-copy bundling, gitleaks graceful degradation, agy-auth-as-discovery, calendar fallback — all confirmed clear by the round-2 panel). But the v2 **thin-slice restructure** introduced new issues, which this v3 resolves. Changes from v2:
>
> **Mechanical / clear-fix (applied directly in this draft):**
> 1. **P0 egress fix.** The thin slice no longer relies on post-hoc record filtering (which egressed to deselected models because the current harness has no `--models` flag). U5 now pulls a **minimal `--models` subset guard** onto the thin-slice critical path so egress equals consent from the first runnable slice. (U9 later adds parallelism + full semantics.)
> 2. **Reserved-filename collision fixed.** The thin slice writes `<plan>.deep-review-draft.md`, not the R14-reserved `.deep-review.md`. The verified filename is reclaimed when verification lands (U11).
> 3. **Consent gate is a single `AskUserQuestion` multi-select** (models as toggles, default none; ack carried in the stem), NOT a numbered-list overflow — the "needs 5+ options" claim conflated per-model toggles with separate ack/cancel items. Resolves the layout, the ack mechanism, and the zero-model state together.
> 4. **agy "no offline auth signal" branch added** to U2 + the Phase 0 gate (R9 forbids live calls; if agy exposes no offline-detectable signal, it is unavailable → Option (c)).
> 5. **Drift test no longer a manual CI footgun** — `bundle-harness.sh` runs in CI and fails only if the working tree changes; equality is normalized (whitespace/line-endings); the eval-workflow-shares-these-files caveat is documented.
> 6. **bundle-harness scope corrected** — copies only `panel-critique.sh` + `arms.py` (the six lens rubrics are inline heredocs, not standalone files).
> 7. **env-detect must not log/print credential values** (U3 requirement + test).
> 8. **agy detection rule actually lands into `env-detect.sh`** post-U2 (U8 step + Files).
> 9. **Discoverability carved into Phase 1** (new U6): README beta row + onboarding doc + minimal contract tests, so the dogfood window has a findable skill — the rest of the contract/doc work stays in Phase 4 (U13).
> 10. **Metric maturity separated** — thin-slice runs count only toward the dogfood signal; the ≥5-run adoption metric counts verified (post-Phase-3) runs. Sidecars carry a `skill_phase` field.
> 11. **agy-voiced corpus min-sample + fallback defined** (U12).
> 12. **"thin slice becomes shipped shape" reconciled** with the brainstorm's verification decision — any shipped wrapper includes verification; the unverified dump never ships.
> 13. F5 notice copy pinned canonical; banner precedence defined; pass-1 failure UX specified; env-detect parallel-independence framing corrected; beta doc/test naming pinned; gitleaks-absent ack escalated; committed-sidecar leak reminder added.
> 14. Carries forward v2's two safe_auto fixes (F1 covers R15; brainstorm corrections target R5 + Dependencies/Assumptions, not the mislabeled "R5/R9").
>
> **Design forks (NOT silently resolved — see `## Open Decisions (resolve before Phase 1)`):** the dogfood-gate measurement design, and whether the unverified thin slice is the right probe vs. an even-thinner one.
>
> Unit numbers are re-assigned in execution order (now **13 units / 5 phases**); each unit header maps to its v2 ancestor.

## Summary

A new `ce-deep-review-beta` skill that orchestrates the existing 3-pass high-stakes-plan review recipe end-to-end on any plan document: `ce-doc-review` headless (pass 1, Claude panel) → a single consent gate (gitleaks preview with graceful degradation + per-model opt-in multi-select + responsibility acknowledgment) → a bundled cross-model harness (pass 2, egress equals consent) → per-finding verification against the doc with inline-quoted CONFIRMED / NOT-FOUND-IN-DOC / NEEDS-HUMAN tags → a reconciled sidecar at `<plan>.deep-review.md`.

The build is staged so a **thin, egress-safe, dogfoodable slice ships first** (pass 1 + consent gate + raw *unverified* records), gated by an explicit dogfood checkpoint before the team commits to the grok arm, the gemini→agy migration, the verification layer, and the verifier rate measurement. Ships as beta; promoted to stable after the verifier rate measurement clears (with adequate agy representation).

---

## Decisions (resolved pre-Phase-1, 2026-05-28)

The three forks left open after round 2 are now decided; the OD-* identifiers are kept as stable references from the units below. Phase 1 may proceed.

### OD-1 — Dogfood-gate measurement. **DECIDED: adopt the full design below; it is the gate's spec, not a suggestion.**

The dogfood gate is the plan's load-bearing risk control — it decides whether the team builds ~8 more units. Round 2 (product + adversarial, P1) flagged that the v2 signal had no baseline and no population (false-stop / false-proceed risk) and conflated "the hop didn't matter" with "the *unverified output* wasn't worth re-running for." The adopted design:
- **Baseline:** before Phase 1, count how many high-stakes plans in the prior ~4 weeks got the full deep review vs. were skipped/deferred. This is the denominator. (If the deep review was barely used before — the friction premise — the baseline is near-zero and a sustained uptick by ≥2 devs is effectively the bar.)
- **Falsifiable proceed threshold:** deep review run on a materially higher share of high-stakes plans authored during the window than baseline, by **≥2 distinct devs** — not an absolute count of one author's opportunistic runs.
- **Debrief instrumentation:** when a plan was *not* re-reviewed, record *why* — (a) the hop friction, or (b) the unverified output wasn't trustworthy enough to act on. A predominance of (b) routes to **"proceed to verification (Phase 3)"**, NOT "stop — friction wasn't the bottleneck." The three-way tree must distinguish these.
- **Arm-config caveat:** if the window runs codex-only (post-gemini-cutoff), the signal is single-arm and **provisional** — multi-arm friction (wall-time, output volume, confab noise) was not tested; the Phase 2 proceed-decision must say so.

### OD-2 — Probe shape. **DECIDED: keep the U5 egress-safe thin slice.**

The agent runs the cross-model arms turnkey (unverified output) — the faithful friction test (the hop is genuinely removed, not just pre-typed) — and builds the bundling/state-machine infrastructure needed eventually. The even-thinner pre-filled-command probe (panel + consent + a pre-filled bash command in chat) was considered and **rejected**: the user still executes the command, so it tests a weaker "hop removed." OD-1's measurement design is adopted, so the infrastructure is not spent on a gate that can't read its own result.

### OD-3 — grok `-p` data-retention. **DECIDED: confirmed acceptable for internal Blueprint plan content; grok stays in the consent gate.**

The brainstorm's Dependencies line recording this as an "unverified assumption" is stale; the Key Decisions "confirmed in scope" framing is authoritative. U13 corrects the brainstorm Dependencies wording to match so the two no longer contradict.

---

## Problem Frame

The deep-plan-review workflow (Claude panel + cross-model panel + reconcile) is a lever the team has decision-grade evidence on for *decorrelation* (cross-model arms surface validated bugs the Claude panel alone misses) but inconclusive evidence on *team-wide value*. Running it today requires a multi-tool, multi-context workflow: invoke `ce-doc-review`, open a terminal, paste a bash command, wait, return the records to chat, then ask the agent to reconcile and manually verify gemini's confabulation-prone findings. Three pain points compound:

1. **The pass-2 hop is expensive in attention.** Switching to a terminal for every high-stakes plan is enough friction that the deep review gets skipped or deferred.
2. **Verification is the most error-prone manual step.** Gemini confabulates plausible-but-fake findings; the user, not the agent, currently checks each cross-model finding against the doc.
3. **The workflow assumes a single operator.** The harness was built for one developer with a specific environment; teammates without the toolset have no entry point.

This skill is the instrument that gathers team-wide evidence in real use, not the productionization of a settled win. v3 tests the "friction-is-the-bottleneck" hypothesis **before** the heavy build via the Phase 1 dogfood gate (see OD-1 for how the gate's verdict is made falsifiable). If the thin slice shows friction was *not* the bottleneck, the team learns it for a few units, not twelve. Risk acknowledged: if the lever does not clear the value bar even after the full v1, the agy migration + grok hardening + verifier work do not pay back; the thinner-wrapper alternative remains available as the permanent shape (and, per the brainstorm, any such permanent wrapper still includes verification — see Alternatives).

---

## Actors

- A1. Plan author / reviewer (any internal developer): invokes `ce-deep-review` on a plan. May or may not have all non-Claude CLIs installed/configured.
- A2. The orchestrating agent (Claude): runs pass 1, mediates the consent gate, dispatches the cross-model arms (only the selected ones), verifies cross-model findings, writes the report.
- A3. Non-Claude reviewer CLIs (codex, agy, grok): produce cross-model findings under the same six lenses; configured per-environment by the user (responsible for OAuth/API-key setup + vendor data-handling policies); opt-in per-run.

> During the **thin-slice dogfood phase (Phase 1)** the arms are the ones in the canonical harness *today* — codex + gemini. grok and the gemini→agy migration land in Phase 2.

---

## Key Flows

- F1. Happy-path deep review with all available non-Claude models
  - **Trigger:** A1 invokes `ce-deep-review <plan-path>`.
  - **Steps:**
    1. A2 probes the environment for installed+authed non-Claude CLIs via the offline auth-detection rules (R9; agy's rule from U2).
    2. A2 invokes `ce-doc-review` headless; receives the panel envelope. **On pass-1 failure/timeout, A2 surfaces the failure and does NOT open the consent gate** (no egress without panel results).
    3. A2 runs the gitleaks content preview. **If gitleaks is installed,** capture findings. **If absent,** the gate degrades gracefully (F5) — it does not block.
    4. A2 opens the consent gate as a single multi-select question (per-model toggles, default none; responsibility acknowledgment in the stem; content-preview hits or the preview-unavailable notice inline; a Cancel path). Submitting with ≥1 model selected *is* the acknowledgment.
    5. A2 fans **only the selected models** across the six lenses (parallel across models, sequential lenses per model) via the bundled `panel-critique.sh --models <subset>`. Egress equals consent.
    6. A2 verifies each cross-model finding against the doc (blind to producing model); tags CONFIRMED / NOT-FOUND-IN-DOC / NEEDS-HUMAN with inline quotes for CONFIRMED.
    7. A2 writes the reconciled report to `<plan>.deep-review.md` (coverage frontmatter, audit header, panel findings untagged, cross-model findings grouped + tagged, decision-changing-union). Raw records remain at `/tmp/cmre-panel/records/`.
    8. A2 streams a summary to chat.
  - **Outcome:** a single verified, durable, commit-as-audit sidecar.
  - **Covered by:** R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R15

- F1-thin. **Thin-slice dogfood run (Phase 1 only; superseded by F1 once verification lands).**
  - **Steps:** F1 steps 1–5 against the current codex+gemini harness, **egress-safe** (only selected arms receive the plan — see U5). Then A2 parses the raw per-(model, lens) records, presents them to chat, and writes a `<plan>.deep-review-draft.md` sidecar (NOT `.deep-review.md` — R14 reserves that for verified output) with `skill_phase: thin-slice` + `verification: none` frontmatter and a prominent banner: findings are UNVERIFIED, confabulation-checking is still manual.
  - **Outcome:** cross-model findings without the terminal hop, for the dogfood signal. Replaced by F1 when verification (U10/U11) lands.
  - **Covered by:** R1, R2, R3, R6, R7, R8, R9, R15

- F2. Partial-environment deep review (some non-Claude CLIs missing)
  - A2 probes; gate shows only available models + a "skipped because X" note. Proceeds with the subset; sidecar carries `coverage: reduced-confidence` + banner.
  - **Covered by:** R2, R3, R6, R7, R9, R11

- F3. Panel-only deep review when zero non-Claude CLIs are available
  - A2 probes (zero usable), runs `ce-doc-review` headless, writes `<plan>.panel-review.md` with `coverage: panel-only`; header + chat banner state `Panel-only deep review (no cross-model arm)` and name each missing CLI with its install/auth command.
  - **Covered by:** R2, R13

- F4. User declines egress at the consent gate (explicit Cancel)
  - A2 outputs the Claude panel findings to chat; does NOT write `<plan>.deep-review.md` or `<plan>.deep-review-draft.md`.
  - **Covered by:** R2, R14

- F4-zero. **User submits the gate with no models selected (distinct from explicit Cancel).**
  - A2 re-presents the gate once with an inline notice: "Select at least one model to proceed, or choose Cancel for panel-only output." If the user again selects none, treat as F4 (Cancel). This distinguishes the forgot-to-select error from a deliberate decline so the user isn't silently dropped to panel-only.
  - **Covered by:** R7, R14

- F5. **Consent gate with gitleaks not installed (graceful degradation)**
  - The gate does NOT bounce. It opens; in place of the content-preview hit list it shows the canonical preview-unavailable notice (pinned in `consent-gate.md`). The responsibility acknowledgment is **escalated** to state that no automated scan ran (see U4). The sidecar audit header records `content_preview: unavailable (gitleaks not installed)`.
  - **Covered by:** R2, R7

---

## Output Structure

```
plugins/compound-engineering/skills/ce-deep-review-beta/
├── SKILL.md
├── references/
│   ├── consent-gate.md              # multi-select gate flow, canonical gitleaks-absent notice, escalated responsibility prompt
│   ├── verification-protocol.md     # per-finding grounding, inline-quote contract, blind-to-producer
│   ├── reconciliation.md            # sidecar shape, frontmatter (coverage, skill_phase, content_preview), banner precedence, union assembly
│   ├── arm-invocation.md            # how to shell to the bundled panel-critique.sh; per-(model,lens) record parsing; progress/timeout streaming format
│   ├── pass-1-headless-envelope.md  # ce-doc-review headless invocation, envelope parsing, FAILURE/timeout UX
│   └── ship-state-machine.md        # state dimensions across pass 1, consent, pass 2, verification, sidecar
├── scripts/
│   ├── bundle-harness.sh            # build-time copy: canonical panel-critique.sh + arms.py -> this skill's scripts/ (NO separate rubric files — rubrics are inline heredocs)
│   ├── panel-critique.sh            # BUNDLED copy
│   ├── arms.py                      # BUNDLED copy
│   ├── gitleaks-scan.sh             # invokes gitleaks if present; emits parseable JSON; signals "unavailable" cleanly if absent
│   ├── env-detect.sh                # offline auth detection (codex, grok, agy [agy rule from U2]); emits ONLY a JSON status record, never credential values
│   └── verifier-eval/               # held-out corpus + measurement harness (U12)
│       ├── corpus/                  # gemini-voiced AND agy-voiced AND grok-voiced (where available) + grounded
│       └── measure.py               # rate report with calibration_scope field
└── (tests live in /tests/skills/, not here)

docs/skills/ce-deep-review.md                       # User-facing doc (feature-named, stable across promotion — NOT -beta)
docs/skills/ce-deep-review-onboarding.md            # Setup doc (agy paid plan + DPA + discovered auth, grok login, codex, gitleaks)
tests/skills/ce-deep-review-beta-contract.test.ts   # Contract test (matches the -beta skill dir; renamed at promotion)
tests/skills/ce-deep-review-beta-bundle-drift.test.ts  # Drift test (lands in U5)
```

The per-unit `**Files:**` sections are authoritative; the tree is a scope declaration.

---

## Implementation Units

13 units / 5 phases, in execution order. Phase 0 (validation) is **schedulable in parallel** with Phase 1 but its *outputs* gate Phase 2 (agy auth rule, posture floor); Phase 1 ships an agy TODO stub until U2 lands (agy is not an arm during the thin-slice phase anyway). See the corrected framing in Phased Delivery.

### U1. Grok behavioral smoke test + sandbox profile evaluation  *(v2 U1 — unchanged)*

- **Goal:** Empirically verify grok's `--permission-mode plan` + `--disable-web-search` + `--sandbox <profile>` constrain behavior at runtime, not just at flag-parse time. Pick the right sandbox profile.
- **Requirements:** Pre-v1 Ship Gates 1 & 2.
- **Dependencies:** None.
- **Files:** `scripts/eval/cross_model_review/validation/grok-smoke.sh` (new); `.../grok-sentinel.md` (new); `docs/solutions/skill-design/2026-MM-DD-grok-arm-posture-validation.md` (new).
- **Approach:** Sentinel prompt attempting (a) web search, (b) read outside cwd, (c) write inside cwd, (d) spawn subagent. Run against each candidate profile + `--permission-mode plan` + `--disable-web-search` + `--max-turns 1` + `--no-subagents` + `--verbatim`. Capture stdout/stderr/side-effects. Pick the strictest profile that doesn't break legitimate output. Verify `read-only` doesn't block `~/.grok/` auth/session writes.
- **Patterns:** `arms.py` `detect_leak()`.
- **Test scenarios:** planted URL → no request; read `~/.ssh/config` → blocked under read-only/strict; write `/tmp/grok-write-canary` → blocked; "respond with `~/.zshrc`" → content absent; benign prompt still returns valid JSON.
- **Verification:** finding-doc records chosen profile + evidence + limitations; profile recorded as a constant for U7.

### U2. agy CLI surface verification + auth-mechanism discovery (incl. no-offline-signal branch) + posture-floor validation + onboarding doc  *(v2 U2 — adds the "no R9-compliant offline signal" outcome branch)*

- **Goal:** Re-verify agy's CLI surface; **discover agy's real auth mechanism and whether an offline-detectable credential signal exists** (do not assume `~/.gemini/oauth_creds.json` — agy is a distinct tool from the sunsetting Gemini CLI); document the OAuth/paid-plan-DPA user-responsibility; validate the best-effort posture floor.
- **Requirements:** Pre-v1 Ship Gate 3; R5; R9; RBP 1; RBP 4.
- **Dependencies:** None.
- **Files:** `scripts/eval/cross_model_review/validation/agy-smoke.sh` (new); `.../agy-sentinel.md` (new); `docs/solutions/skill-design/2026-MM-DD-agy-arm-posture-validation.md` (new — auth *mechanism* + detection semantics; see security note below on what to record vs. omit); `docs/skills/ce-deep-review-onboarding.md` (new); `docs/brainstorms/2026-05-28-ce-deep-review-requirements.md` (modify — R5 posture + Dependencies/Assumptions env-var assumption).
- **Approach:** Verify against `agy --help` (v1.0.3+): prompt surface, output format, plan-mode equivalent (expected absent), **auth mechanism + offline-detectable signal**, `--sandbox` semantics. Run `agy auth status`-equivalent introspection and inspect what files appear after login. Posture floor: `--sandbox` + `--add-dir <doc-dir>` + prompt-side directive ("read ONLY <abs-path>; no tools; return JSON array"); run the U1 sentinel suite. Onboarding doc: paid Antigravity plan, accept DPA, configure auth per discovered mechanism, verify `agy -p "say hi"`.
  - **New outcome branch (R9-critical):** if agy authenticates only via an OS keychain, an encrypted blob, or a *live* `agy auth status` network call — i.e., **no file-presence / env-var / token-expiry signal checkable offline** — then under R9 (no live calls before consent) agy is **unavailable**, the same as a missing binary. Record this as a distinct Phase-0-gate outcome (separate from "posture floor fails") with the same consequence: fall back to Option (c). The skill does not probe agy live to work around a missing offline signal.
  - **Security note (record vs. omit):** the solutions doc records the *detection mechanism and result semantics* (e.g., "file-based OAuth token at a documented path; check presence + non-expired"), and names the path; it does NOT dump the credential JSON structure or token contents. Keep "what to look for" in the doc; the exact path also lives as a code constant in `env-detect.sh`/`arms.py`.
- **Test scenarios:** auth-mechanism + offline-signal-existence documented (whatever U2 finds); detection probe returns authed/unavailable/expired off the discovered signal without invoking agy; sentinel secret outside `--add-dir` not surfaced; write-canary blocked; round-trip valid; `-p` arg-length cap for ≥200 KB plans measured; output parseable by `parse_findings()`.
- **Verification:** onboarding doc exists with discovered auth setup; findings doc records corrected surface + auth mechanism + the offline-signal-existence verdict + best-effort-posture limitation; brainstorm R5 + Dependencies/Assumptions corrected (the env-var/`AV_API_KEY` assumption lives in Dependencies/Assumptions, not R9).

### U3. `ce-deep-review-beta` scaffold + headless pass-1 (with failure UX) + env-detect (no credential leakage)  *(v2 U3 — adds pass-1 failure UX + env-detect no-log requirement)*

- **Goal:** Stand up the beta skill + SKILL.md + headless `ce-doc-review` invocation with explicit failure handling; offline auth detection that never leaks credential material.
- **Requirements:** R1, R2, R3, R8.
- **Dependencies:** Skill-code-level none. Depends on U2 **only for the agy detection rule**; until U2 lands, `env-detect.sh` carries codex + grok detection and an agy TODO stub (moot during the thin-slice phase — agy is not yet an arm). The agy rule is wired in by U8, not left as a permanent stub (see U8 Files).
- **Files:** `SKILL.md` (new); `references/pass-1-headless-envelope.md` (new); `scripts/env-detect.sh` (new).
- **Approach:** Frontmatter: `name: ce-deep-review-beta`, `description` (`[BETA]` prefix), `argument-hint`, `disable-model-invocation: true`. Top-of-file AskUserQuestion ToolSearch preload. Pass 1: `Skill("ce-doc-review", "mode:headless <plan-path>")`; parse the five envelope sections. **Failure UX:** on parse failure or timeout (define the timeout), emit "Pass 1 failed: [reason] — cannot open the consent gate without panel results. Re-invoke, or run ce-doc-review directly to diagnose." and stop; the gate does not open. `env-detect.sh`: codex (existing pattern), grok (`XAI_API_KEY` non-empty OR `~/.grok/auth.json` valid), agy (the U2 rule). **Hard requirement: `env-detect.sh` outputs ONLY the structured JSON status record to stdout and MUST NOT write credential values, token strings, file contents, or key material to stdout/stderr/logs.**
- **Patterns:** `ce-doc-review/SKILL.md` (Phase 0 mode detection; preload; headless envelope); `ce-plan/references/plan-handoff.md`; `docs/solutions/skill-design/post-menu-routing-belongs-inline-2026-04-28.md`.
- **Test scenarios:** frontmatter valid YAML, name matches dir, `disable-model-invocation: true`; `env-detect.sh` prints `{codex,agy,grok: ok|missing|unauthed}`; **`env-detect.sh` with a populated `~/.grok/auth.json` fixture: the token value does not appear in any output stream**; no vendor API call (file/env/`command -v` only); envelope parsing handles all five sections; **pass-1 failure emits the failure message and does not open the gate.**
- **Verification:** `bun test tests/frontmatter.test.ts`, `skill-agent-ce-prefix.test.ts`, `skill-shell-safety.test.ts` pass; manual invocation on a small plan parses an envelope; manual pass-1-failure path shows the failure UX.

### U4. Consent gate — single multi-select + graceful gitleaks + escalated responsibility ack  *(v2 U4 — gate is now a multi-select AskUserQuestion, not a numbered-list overflow; ack escalates when gitleaks absent; F5 copy pinned canonical)*

- **Goal:** Implement the single interactive gate: content preview (or graceful degradation), per-model opt-in, explicit egress responsibility — within the platform blocking-question tool.
- **Requirements:** R7, R8, R9 (detection from U3); Key Decision opt-in-per-model default-none; responsibility acknowledgment; v3 graceful gitleaks.
- **Dependencies:** U3.
- **Files:** `references/consent-gate.md` (new — pins the canonical gitleaks-absent notice and the ack text, both labeled "CANONICAL — do not paraphrase"); `scripts/gitleaks-scan.sh` (new); `SKILL.md` (modify — inline the gate flow).
- **Approach:** The gate fires after pass 1 returns successfully. **It is a single `AskUserQuestion` (or platform equivalent) with `multiSelect: true`**, listing the available models as toggle options (default none) plus a Cancel option. With ≤4 models this fits the 4-option cap — no numbered-list overflow is needed (v2's "needs 5+ options" conflated per-model toggles with separate ack/cancel items). The **responsibility acknowledgment is carried in the question stem** (the teaching surface), with explicit framing that *selecting any egress option below confirms the acknowledgment*. Sub-steps:
  1. `gitleaks-scan.sh` runs `gitleaks detect --no-git --source <plan> --report-format json --redact` **iff gitleaks is on PATH**. Present: render hits as `Line N (rule-id): <redacted preview>` in the stem. **Absent:** the wrapper exits with a distinct "unavailable" signal (not an error); the stem shows the CANONICAL preview-unavailable notice and the ack escalates (next bullet). It does NOT block.
  2. **Ack text (CANONICAL; copy-refinable once):** base — *"This plan content will be sent to the external vendors you select below. You are responsible for having configured each vendor with an appropriate data-handling policy (paid plan + DPA where applicable). Selecting any model confirms you accept this."* **When gitleaks is absent, append:** *"No automated content scan ran (gitleaks not installed) — you are the sole filter; confirm you have manually checked this plan for secrets/PII before egressing."*
  3. **Outcomes:** ≥1 model selected → consent granted with that subset → pass 2. Zero selected on submit → **F4-zero** (re-prompt once, then Cancel). Cancel → **F4** (panel-only chat, no sidecar).
  4. Surface the subset to pass 2 as a comma-separated string for `panel-critique.sh --models`. Record `content_preview: ran | unavailable` for the sidecar audit header.
- **Patterns:** `ce-doc-review` SKILL.md Phase 0; the multi-select question shape; `docs/solutions/best-practices/ce-pipeline-end-to-end-learnings-2026-04-17.md`.
- **Test scenarios:** all 3 models available + zero hits → multi-select with 3 toggles (default none) + Cancel + ack-in-stem; 1 model unavailable → 2 toggles + "skipped because X"; gitleaks absent → preview-unavailable notice + escalated ack (regression test for graceful degradation); ≥1 selected → pass 2; zero selected → F4-zero re-prompt, then Cancel→F4; Cancel → F4 (no sidecar); each toggle label self-contained + third-person.
- **Verification:** manually walking the gate exercises all branches (all-models, subset, gitleaks-present, gitleaks-absent, zero-selected, Cancel). The U13 contract test asserts the gate uses multi-select, the ack-in-stem, and the canonical preview-unavailable notice exist inline in SKILL.md.

### U5. Pass-2 dispatcher (thin slice) — egress-safe `--models` + build-time bundling + CI-enforced drift test + state machine  *(v2 U5 — P0 egress fix; draft filename; CI-automated drift; bundle scope corrected)*

- **Goal:** Bundle the canonical harness via a build-time copy, add a CI-enforced drift test, invoke the bundled `panel-critique.sh` for **only the selected models**, stream per-(model, lens) progress (incl. timeout/error states), parse records, and present them **raw/unverified (clearly labeled)** to a `.deep-review-draft.md` sidecar.
- **Requirements:** R3, R6, R7 (egress equals consent), R11 (record structure), R15 (progress + timeout streaming); Key Decision build-time copy (not symlink).
- **Dependencies:** U3, U4. Does NOT depend on Phase 2.
- **Files:** `scripts/bundle-harness.sh` (new); `scripts/panel-critique.sh` (new — bundled); `scripts/arms.py` (new — bundled); `tests/skills/ce-deep-review-beta-bundle-drift.test.ts` (new); `references/arm-invocation.md` (new); `references/ship-state-machine.md` (new); `SKILL.md` (modify); **`scripts/eval/cross_model_review/panel-critique.sh` (modify — add a minimal `--models <subset>` guard; see below)**; CI config (modify — add the re-bundle verification step).
- **Approach:**
  - **Egress-safe dispatch (P0 fix).** The thin slice must send the plan to *only* the consented models. The current canonical `panel-critique.sh` hardcodes `run codex` + `run gemini` with no selection. v3 lands a **minimal `--models` subset guard** in `panel-critique.sh` as part of U5 (a small change to the per-lens loop: skip arms not in the subset). This is the only canonical change U5 makes, and it is what U9 later builds full semantics + parallelism on top of. **Do NOT use post-hoc record filtering** — egress happens inside the harness, so filtering after the fact would still have sent the plan to a deselected vendor. (Alternative if a `panel-critique.sh` change is undesirable: invoke `python3 arms.py run-arm <lens> <selected-cli>` per consented cell directly. Pick one in implementation; both guarantee egress == consent.)
  - **Bundling (build-time copy).** `bundle-harness.sh` copies **only** `scripts/eval/cross_model_review/panel-critique.sh` and `arms.py` into the skill's `scripts/`. The six lens rubrics are **inline heredocs inside `panel-critique.sh`** — there are no standalone rubric files to copy or drift-test (v2 erroneously listed `<lens rubrics>`). Bundled copies are checked in (installed skills must be self-contained per AGENTS.md); symlinks are rejected (the converter copies each skill dir as an isolated unit, so a symlink dangles on install).
  - **Drift test (CI-enforced, not a manual footgun).** `ce-deep-review-beta-bundle-drift.test.ts` asserts the bundled copies equal canonical **modulo normalization** (trim trailing whitespace, normalize line endings, ignore a documented injected header banner if any) — raw byte-equality is too brittle. **CI runs `bundle-harness.sh` then fails only if the working tree changed** — so the fix is mechanical (re-run produces the diff), not a remembered manual step. **Document that the canonical files are shared with the live cross-model *eval* workflow**, so an eval-only commit to `arms.py`/`panel-critique.sh` will also require a re-bundle; the CI step makes that automatic rather than a surprise red build for an unrelated author.
  - **Dispatch + state machine.** Invoke `bash "${CLAUDE_SKILL_DIR}/scripts/panel-critique.sh" --models <subset> "$PLAN_PATH"` via the runtime Bash tool with narrow `allowed-tools: Bash(bash *panel-critique.sh)`. Stream per-(model, lens) progress to chat. `arm-invocation.md` defines the **streaming format for every outcome**: `[model lens] findings=N` on ok; `[model lens] approaching timeout…` near `CMRE_TIMEOUT`; `[model lens] TIMED OUT — omitting` on timeout; analogous lines for `missing`/`auth_fail`/`empty`/`malformed`. `ship-state-machine.md` documents the state space (consent: pending/granted/declined; pass-1: idle/running/complete/failed; per-arm pass-2: idle/running/ok/timeout/missing/auth_fail/empty/malformed; verification: none-thin-slice (this phase) → queued/running/complete (Phase 3); sidecar: unwritten/partial/written).
  - **Thin-slice output.** Write `<plan>.deep-review-draft.md` (NOT `.deep-review.md`) with frontmatter `skill_phase: thin-slice`, `verification: none`, `content_preview: ran|unavailable`, and a banner: *"Cross-model findings below are UNVERIFIED — confabulation-checking is still manual at this stage."*
- **Patterns:** AGENTS.md "Permission gate on extracted scripts"; `docs/solutions/skill-design/git-workflow-skills-need-explicit-state-machines-2026-03-27.md`.
- **Test scenarios:** **`panel-critique.sh --models codex foo.md` runs ONLY codex (no egress to gemini) — regression test for the P0**; `bundle-harness.sh` output equals canonical under normalization; drift test FAILS when canonical `arms.py` is edited without re-bundle, PASSES after; per-(model,lens) progress + timeout lines stream (inject a `sleep` mock); all-ok → one array per cell; one-arm-timeout/empty/malformed marked; `consent: declined` never reaches pass 2; draft sidecar carries `skill_phase: thin-slice` + unverified banner; **draft sidecar filename is `.deep-review-draft.md`, never `.deep-review.md`.**
- **Verification:** live run against a test plan with one model deselected confirms the deselected vendor received nothing (inspect `/tmp/cmre-panel/records/` — no file for the deselected arm); drift test green after bundling; CI re-bundle step passes on a clean tree.

### U6. Phase-1 discoverability slice — README beta row + onboarding link + minimal contract tests  *(NEW — addresses "discoverability blocked until Phase 4")*

- **Goal:** Make the beta findable and minimally guarded during the dogfood window, without waiting for the full Phase-4 doc/test work.
- **Requirements:** dogfood-window discoverability; existing repo test conventions.
- **Dependencies:** U3, U4, U5.
- **Files:** `plugins/compound-engineering/README.md` (modify — add a `[BETA]` Document Review row; note counts are reconciled by release automation); `docs/skills/README.md` (modify — add ce-deep-review under Document Review, marked beta); `docs/skills/ce-deep-review.md` (new — minimal user-facing doc: what it is, that it is beta + explicitly invoked, the thin-slice/unverified caveat, link to the onboarding doc); `tests/skills/ce-deep-review-beta-contract.test.ts` (new — **minimal** assertions only: SKILL.md frontmatter, `ce-` prefix, `disable-model-invocation: true`, multi-select gate present, draft-vs-final filename tokens. Full assertions land in U13).
- **Approach:** A reader of the README must be able to discover the beta in the dogfood window; a developer must be able to find the onboarding doc. Keep the doc thin (it grows in U13). The contract test asserts only what exists after U3–U5; U13 extends it once verification/reconciliation land.
- **Patterns:** `tests/review-skill-contract.test.ts`; `docs/skills/ce-doc-review.md`; existing README rows.
- **Test scenarios:** README beta row renders; doc links the onboarding doc; minimal contract test passes on the U3–U5 skill; `bun run release:validate` does not error on the new beta entry (counts reconciled by release automation).
- **Verification:** the beta is discoverable from `plugins/compound-engineering/README.md` and `docs/skills/README.md` during Phase 1; minimal contract test green.

> ### ⛳ Phase 1 dogfood gate
> After U6 the skill is discoverable and runnable. **Apply OD-1's measurement design**, then dogfood for ~1–2 weeks. **Decision:**
> - **Usage lifts vs. baseline (≥2 devs)** → proceed to Phase 2 + Phase 3 with evidence.
> - **No lift AND debrief attributes it to the hop (not unverified-output toil)** → stop, or pivot to the permanent thin-wrapper shape (which still includes verification — see Alternatives).
> - **No lift but debrief attributes it to unverified-output toil** → proceed specifically to verification (Phase 3 ahead of full Phase 2 fan-out).
> - **Equivocal / single-arm (codex-only post-cutoff)** → signal is provisional; extend the window or narrow the next step; do not greenlight the full 3-arm build on a 1-arm read.

### U7. Add grok arm to `arms.py`  *(v2 U6 — unchanged except re-bundle is CI-enforced)*

- **Goal:** Extend the harness with a `grok` arm matching U1's validated posture.
- **Requirements:** R4, R5, R6.
- **Dependencies:** U1; dogfood gate (proceed).
- **Files:** `scripts/eval/cross_model_review/arms.py` (modify); `tests/cross-model-review-driver.test.ts` (modify); re-bundle is automatic via the U5 CI step.
- **Approach:** Mirror codex/gemini. `GROK_BASE = ["grok", "-p", GROK_INSTRUCTION, ...U1 flags...]`; `--prompt-file` temp file; add `"grok"` to argparse choices.
- **Test scenarios:** `build_invocation` shapes correct; context section included; `doc_in_argv == False`; optional live smoke; `parse_findings` parses grok output; drift test green after CI re-bundle.
- **Verification:** `python3 arms.py run-arm b_isolated grok <doc> <rubric>` exits 0 with non-empty findings; driver test passes.

### U8. Migrate gemini arm to agy in `arms.py` + wire the agy rule into `env-detect.sh`  *(v2 U7 — adds the env-detect.sh agy-rule landing step the panel found missing)*

- **Goal:** Replace gemini with the validated agy posture; land the U2-discovered auth-detection rule into BOTH `arms.py` and the skill's `env-detect.sh` (removing the U3 TODO stub).
- **Requirements:** Migration Option (a); R5; R9; Pre-v1 Ship Gate 3.
- **Dependencies:** U2; dogfood gate (proceed).
- **Files:** `scripts/eval/cross_model_review/arms.py` (modify); `scripts/eval/cross_model_review/panel-critique.sh` (modify — `gemini` → `agy` in the model loop); **`plugins/compound-engineering/skills/ce-deep-review-beta/scripts/env-detect.sh` (modify — replace the agy TODO stub with the U2-discovered detection constant)**; `tests/cross-model-review-driver.test.ts` (modify); `tests/cross-model-review-corpus.test.ts` (modify); re-bundle via the U5 CI step.
- **Approach:** `AGY_BASE = ["agy", "-p", AGY_INSTRUCTION, "--sandbox", "--add-dir", <doc-dir>, ...]` + the U2 prompt-side directive. Auth detection reads the U2-discovered signal from a single documented constant (used by both `arms.py` and `env-detect.sh`; not hardcoded in two places). If U2's outcome was "no offline signal exists," agy stays unavailable and this unit reduces to removing gemini (Option (c)).
- **Test scenarios:** `build_invocation("agy", ...)` posture flags + `--add-dir`; auth detection authed/unavailable/expired off the discovered signal without invoking agy; arms.py header reflects real surface + auth path; live smoke when authed; codex regression unchanged; **`env-detect.sh` now returns a real agy status (no TODO stub)**; drift test green.
- **Verification:** `python3 arms.py run-arm b_isolated agy <doc> <rubric>` succeeds when authed; driver test passes; `env-detect.sh` reports agy correctly.

### U9. Extend `panel-critique.sh` — full `--models` semantics + parallel-across-models  *(v2 U8 — minimal `--models` already landed in U5; this finalizes semantics + adds parallelism)*

- **Goal:** Build full per-run model selection (default = all available) and parallelize across models while preserving per-(model, lens) progress (R15). Replaces U5's minimal guard.
- **Requirements:** R6, R15, R3.
- **Dependencies:** U7, U8; dogfood gate.
- **Files:** `scripts/eval/cross_model_review/panel-critique.sh` (modify); `tests/cross-model-review-driver.test.ts` (modify); re-bundle via CI; update the U5 dispatcher to pass `--models` against the full semantics (the minimal guard is subsumed).
- **Approach:** Full `--models codex,grok,agy` parsing; fork one subshell per selected model running six lenses sequentially; each emits `[model lens] findings=N` to stderr; parent waits. Records at `${CMRE_OUT_DIR:-/tmp/cmre-panel}/records/${cli}__${lens}.json`. `CMRE_TIMEOUT` per (model, lens). No cross-vendor retry; emit per-arm outcome.
- **Test scenarios:** `--models codex` runs only codex; `--models codex,grok` parallel; record keys no collisions; missing model → exit 0 + SKIP lines; wall-time ≤ 1.2× single-arm with mock arms; default (no flag) = post-U7/U8 arm set; drift green.
- **Verification:** `--models codex,grok foo.md` exits 0 with both models' records; 3-model wall-time ≤ 60% of sequential.

### U10. Verification step — agent grounds each cross-model finding against the doc  *(v2 U9 — unchanged)*

- **Goal:** Per-finding verification: locate cited text, tag CONFIRMED with inline quote / NOT-FOUND-IN-DOC / NEEDS-HUMAN; blind to the producing model.
- **Requirements:** R10; inline-quote requirement; bidirectional rate measurement (U12).
- **Dependencies:** U5 (parsed records); dogfood gate. Replaces the thin-slice `verification: none` state with real tags.
- **Files:** `references/verification-protocol.md` (new); `SKILL.md` (modify — inline the verification trigger; remove the thin-slice unverified banner; flip `skill_phase` to `verified`).
- **Approach:** Per finding, dispatch a sub-agent (or in-orchestrator inline pass for small sets) with plan content + finding text but NOT the producing model. Tag per the protocol. Use the platform's subagent primitive with `mode` omitted. Strict output schema `{finding_id, tag, quote?, reason?}`; violations → NEEDS-HUMAN. A synchronous backstop grep ("did the inline quote appear?") runs after each CONFIRMED.
- **Patterns:** `ce-doc-review/references/subagent-template.md`; `docs/solutions/skill-design/pass-paths-not-content-to-subagents-2026-03-26.md`; `.../cross-model-eval-decision-grade-2026-05-26.md`.
- **Test scenarios:** verbatim-quote → CONFIRMED + grep confirms; fabricated line → NOT-FOUND-IN-DOC; strategic judgment → NEEDS-HUMAN; prompt excludes producing model; CONFIRMED without quote → NEEDS-HUMAN; backstop mismatch → NOT-FOUND-IN-DOC.
- **Verification:** manual exercise on a curated set (5+ confab, 5+ grounded, 3+ judgment) yields expected tags; backstop catches >95% of false-CONFIRMs (U12 measures formally).

### U11. Reconciliation + sidecar writer — reclaim `.deep-review.md`, banner precedence, audit fields, rotation  *(v2 U10 — reclaims the verified filename, adds banner-precedence + skill_phase + committed-leak reminder)*

- **Goal:** Assemble verified panel + cross-model findings + decision-changing union into the sidecar. Write the verified output to `<plan>.deep-review.md` (reclaiming it from the thin-slice draft), with coverage + skill_phase + content_preview frontmatter, audit header, inline quotes, rotation (keep last 5), and a defined banner precedence.
- **Requirements:** R11, R12, R13, R14; commit-as-audit; banner precedence; metric-maturity.
- **Dependencies:** U10.
- **Files:** `references/reconciliation.md` (new); `scripts/sidecar-rotate.sh` (new); `SKILL.md` (modify).
- **Approach:** Frontmatter: `coverage: full|reduced-confidence|panel-only`, `skill_phase: verified`, `plan`, `models`, `timestamp`, `user` (`git config user.name`), `content_preview: ran|unavailable`. **Filename reclaim:** verified output writes to `<plan>.deep-review.md`; on first verified run, any existing `<plan>.deep-review-draft.md` from the thin-slice window is left in place (so the dogfood artifact survives) but the verified file is the canonical one going forward. **Banner precedence (in `reconciliation.md`):** coverage and verification are orthogonal, rendered as separate labeled lines; during thin-slice the UNVERIFIED banner is top; post-verification only the coverage banner shows (no verification banner needed). Cross-model findings grouped by-lens, tagged, inline quote for CONFIRMED; decision-changing-union section. Rotate existing `.deep-review.md` to `<plan>.deep-review.<ISO>.md`, delete beyond 5 most recent. `skill_phase` persists in rotated copies so a rotated thin-slice draft is identifiable by frontmatter, not just timestamp. **Committed-leak reminder:** when `content_preview: unavailable`, the chat summary reminds the user the sidecar (which quotes plan content) is about to be written/committed without an automated scan. DO NOT modify `.gitignore`.
- **Patterns:** repo markdown frontmatter convention; sidecar-rotation precedent if any.
- **Test scenarios:** `coverage: full` (3/3); `reduced-confidence` (1/3 timeout, banner names arm); `panel-only` → `.panel-review.md`; audit header includes user/timestamp/models/`content_preview`; inline quote under each CONFIRMED; union section correct; rotation 7→5; first run no rotation; `.gitignore` unchanged; **verified output writes `.deep-review.md`, not `-draft.md`**; `skill_phase` present + persists in rotations; gitleaks-absent run shows the committed-leak reminder.
- **Verification:** manual end-to-end produces a verified sidecar with all sections; reclaim from a pre-existing draft works; rotation caps at 5.

### U12. Bidirectional verifier rate measurement — agy-voiced corpus, min-sample + fallback, calibration scope  *(v2 U11 — adds a concrete min-sample + synthetic-fallback so the promotion gate can actually clear)*

- **Goal:** Build the held-out corpus and measure false-CONFIRM and false-NOT-FOUND-IN-DOC rates; gate v1 promotion on both ≤ 5% **for the represented model voices**, with an explicit calibration scope and a defined path to "adequate agy representation."
- **Requirements:** R10; bidirectional thresholds + consequences; RBP 10.
- **Dependencies:** U10. Best run after the dogfood gate so real agy/grok output can seed the corpus.
- **Files:** `scripts/verifier-eval/corpus/` (new); `scripts/verifier-eval/measure.py` (new — emits `calibration_scope`); `scripts/verifier-eval/README.md` (new); `docs/solutions/skill-design/2026-MM-DD-ce-deep-review-verifier-rates.md` (new).
- **Approach:** Hand-curate ≥20 findings across both directions (~10 confabulated, ~10 grounded), sampled across voices including **agy-voiced** items from real agy output (U2 smoke + Phase-2 runs). **Define "adequate agy representation" = ≥5 agy-voiced items.** **Fallback if Phase-2 produces < 5 real agy-voiced items by the measurement date:** synthetic agy-voiced items (modeled on the U2 smoke output's phrasing) are acceptable to reach the floor, but the report flags `calibration_scope: agy-synthetic` and the verdict is `eligible (gemini-voiced + agy-synthetic); agy-real pending` — promotion proceeds but the solutions doc records the synthetic caveat and a re-measure trigger once real agy volume accrues. Run blinded; N=3 trials per item. If either rate > 5%: enact the brainstorm fallback (false-CONFIRM > 5% → default-tag NEEDS-HUMAN; false-NOT-FOUND > 5% → NOT-FOUND-IN-DOC advisory). If both ≤ 5% AND agy adequately represented (real or synthetic-flagged): eligible.
- **Patterns:** `docs/solutions/skill-design/cross-model-eval-decision-grade-2026-05-26.md` (pre-registration + corpus-floor honesty); `.../safe-auto-rubric-calibration-2026-04-25.md` (N≥3 + variance).
- **Test scenarios:** `measure.py` emits `{trials, false_confirm_rate, false_not_found_rate, calibration_scope, per_item}`; N=3; corpus < 20 → `inconclusive`; < 5 agy items and no synthetic fallback → `calibration_scope: gemini-calibrated, agy-pending`; synthetic fallback used → `calibration_scope: agy-synthetic` + re-measure trigger recorded; both ≤5% + adequate agy → `promote: eligible`; rate miss → specific fallback recommendation; prompt excludes producing model.
- **Verification:** `measure.py` produces a report with an explicit calibration scope; solutions doc records measurement + verdict + scope + any synthetic caveat + re-measure trigger. Promotion gates on this report AND adequate agy representation.

### U13. Full contract test + finalize docs + README counts + brainstorm corrections  *(v2 U12 — minus the discoverability bits moved to U6; minus the drift test which lives in U5)*

- **Goal:** Extend the contract test to full coverage, finalize the user-facing doc, finalize README counts, correct the brainstorm assumptions discovered in U2.
- **Requirements:** existing repo test/doc conventions; brainstorm maintenance.
- **Dependencies:** U2, U4, U5, U6, U10, U11, U12.
- **Files:** `tests/skills/ce-deep-review-beta-contract.test.ts` (modify — extend the U6 minimal test); `docs/skills/ce-deep-review.md` (modify — finalize); `docs/skills/README.md` (modify); `plugins/compound-engineering/README.md` (modify — final counts); `docs/brainstorms/2026-05-28-ce-deep-review-requirements.md` (modify — R5 posture + Dependencies/Assumptions env-var assumption [env-var/`AV_API_KEY` is in Dependencies/Assumptions, not R9] + the xAI grok `-p` retention line [correct the stale "unverified assumption" to "confirmed" per OD-3]).
- **Approach:** Contract test asserts the full structural set: sidecar filenames (`.deep-review.md`, `.deep-review-draft.md`, `.panel-review.md`), `coverage:`/`skill_phase:`/`content_preview:` enum tokens, banner copy patterns, verification tags, the multi-select gate + ack-in-stem, the canonical gitleaks-absent notice, the AskUserQuestion ToolSearch preload, the `Skill("ce-doc-review", "mode:headless` invocation. `.toMatch` for tolerance. Finalize the user-facing doc: what it is, when to use it, how it differs from ce-doc-review, the onboarding requirement (user-responsibility for OAuth + paid plans + DPA, with the **actual** agy auth path from U2), the sidecar artifacts (draft vs verified), the panel-only fallback, **and that the beta is invoked explicitly — `disable-model-invocation: true` blocks only model-auto-invocation, not deliberate user invocation.** **Naming:** the skill dir + `name` + contract-test filename carry `-beta`; the user-facing doc is feature-named (`ce-deep-review.md`, stable across promotion). The promotion PR renames the skill dir + contract test (and adds them to the stale-artifact registries), not the doc.
- **Patterns:** `tests/review-skill-contract.test.ts`; `docs/skills/ce-doc-review.md`; README rows.
- **Test scenarios:** contract asserts the headless invocation + ack requirement + all three sidecar filename patterns + the enum tokens + the gate multi-select + the canonical gitleaks-absent notice + the explicit-invocation note in the doc; `bun test tests/frontmatter.test.ts` + `skill-shell-safety.test.ts` pass; `bun run release:validate` reports the skill, no drift.
- **Verification:** all bun tests pass; doc states the user-responsibility framing + real agy auth path + explicit-invocation note; brainstorm R5 + Dependencies/Assumptions corrected; README counts correct.

---

## Alternative Approaches Considered

- **Replicate ce-doc-review's persona dispatch internally.** Rejected: duplicates ~420 lines; headless inherits the calibrated pipeline.
- **Permanent thin wrapper as the final shape.** Not the destination, but U3–U6 are its first stage + dogfood gate. **If the dogfood gate selects the permanent-thin-wrapper outcome, the shipped wrapper STILL includes verification** (panel + consent + *verified* cross-model output) — never the unverified thin-slice dump. This preserves the brainstorm's categorical "full verification, not emit-and-flag" Key Decision; choosing the thin-wrapper destination does not reopen that decision, it only drops the grok arm / parallelism / scale work. (Round-2 adversarial flagged that "thin slice becomes the shipped shape" otherwise contradicts the brainstorm — this reconciliation closes it.)
- **Even-thinner friction probe** (panel + consent + a pre-filled bash command in chat, no bundling/state-machine). Considered and **rejected** (see OD-2): the user still executes the command, so it tests a weaker "hop removed" than the turnkey thin slice, and the bundling/state-machine infra is needed eventually regardless.
- **Phase 0.5 separate "alpha" phase.** Folded into the main sequence (U3–U6 are the alpha, gated before the heavy investment) rather than a parallel skill dir.
- **Symlink the canonical harness into the skill.** Rejected: the converter copies each skill dir as an isolated unit; a symlink dangles on install. Build-time copy + a CI-enforced drift test is the portable mechanism.
- **Post-hoc record filtering for the thin slice (v2's approach).** Rejected in v3: egress happens inside the harness, so filtering after the run still sent the plan to deselected vendors — a P0 consent violation. v3 gates egress with a `--models` subset before the run.
- **Reimplement gitleaks rules in JS/TS.** Rejected: brittle. Shell out; degrade gracefully when absent.
- **Hard-block when gitleaks is missing (v1).** Rejected: bounces first-timers, suppressing the adoption signal. Graceful degradation + escalated ack + `content_preview: unavailable` audit.
- **Full N×M parallelism for pass 2.** Rejected: over-complex for three arms.
- **Production-grade retry/circuit-breaker.** Rejected: report per-arm outcome; the user re-runs.

---

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Friction was not the bottleneck; turnkey investment doesn't pay back** | Medium | High | Phase 1 dogfood gate (U3–U6) tests the hypothesis before grok/agy/verifier spend. **OD-1 makes the verdict falsifiable** (baseline + threshold + debrief that separates friction from unverified-output toil) so the gate doesn't false-stop. |
| **Thin slice egresses to a deselected vendor** | ~~High (v2)~~ Eliminated | High | **v3 P0 fix:** the thin slice gates egress with a minimal `--models` subset (U5), not post-hoc filtering. Regression test asserts a deselected vendor receives nothing. |
| agy posture-floor cannot be validated in U2 | High | High | U2 is early; 2026-06-15 calendar fallback to Option (c). |
| **agy authenticates but exposes no R9-compliant offline signal** | Medium | High | **v3:** U2 has an explicit outcome branch + Phase 0 gate outcome → agy unavailable → Option (c). The skill never probes agy live to compensate. |
| grok `--permission-mode plan` doesn't constrain at runtime | Medium | High | U1 early; fallback codex + agy only. |
| **Bundled harness drifts from canonical / CI footgun** | Medium | ~~Medium~~ Low | Build-time copy + **CI runs `bundle-harness.sh` and fails only on a working-tree change** (mechanical fix). Normalized equality (not raw bytes). Documented that eval-only edits to the shared files also trigger a re-bundle, handled automatically by CI. |
| **Dogfood gate signal can't discriminate** | Medium | High | **OD-1 (adopted):** baseline, falsifiable threshold, ≥2 devs, debrief routing, single-arm caveat. |
| Verifier rate measurement exceeds 5% | Medium | Medium | Brainstorm consequence; beta stays beta; usable output with fallback tags. |
| **Verifier miscalibrated on agy (gemini-only corpus)** | Medium | Medium | U12 requires ≥5 agy-voiced items; `calibration_scope` field; synthetic-fallback flagged + re-measure trigger so the gate can clear honestly. |
| agy `-p` arg-length limit on large plans | Medium | Medium | U2 measures the cap; `--add-dir` workaround. |
| **Gitleaks not installed** | High | Low | v3 graceful degradation: gate opens, **ack escalates to state no scan ran**, `content_preview: unavailable` audited. |
| **Committed sidecar leaks plan content from a gitleaks-absent run** | Low–Medium | High | Content-preview gate (when present) + escalated ack + `content_preview: unavailable` audit + **U11 reminder before writing the sidecar when no scan ran**. Commit-as-audit is the user's per-repo call. |
| **`env-detect.sh` leaks credential values** | Low | High | **v3 hard requirement + test:** `env-detect.sh` emits only a JSON status record; token-value fixture test asserts no credential material on any stream. |
| Consent gate UI invented divergently by implementers | ~~Medium~~ Low | Medium | **v3:** single multi-select question (not numbered-list overflow); ack-in-stem; F4-zero handles the no-selection state; `consent-gate.md` pins canonical copy. |
| Beta naming drift (`.deep-review` vs `-beta`) | Low | Low | **v3 pins it:** skill dir + name + contract test carry `-beta`; the doc is feature-named; promotion PR renames dir + test, not the doc. |
| Beta-to-stable promotion never happens | Medium | Low | U12 is the gate; persistent miss is useful information. |
| Adoption metric counts unverified runs as "value delivered" | ~~Medium~~ Low | Low | **v3:** `skill_phase` annotates each sidecar; thin-slice runs count only toward the dogfood signal; the ≥5-run adoption metric counts verified runs. |
| New orchestrator changes ce-doc-review's headless contract | Low | Medium | Contract test on the headless envelope (U13). |

---

## Phased Delivery

Each phase is a candidate PR boundary. **Framing correction (round-2 coherence):** Phase 0 and Phase 1 are *schedulable in parallel*, but Phase 0's *outputs* (agy auth rule, posture floor) gate Phase 2 — they are not output-independent. Phase 1 ships an agy TODO stub in `env-detect.sh` until U2 lands; U8 wires in the real rule. The thin-slice phase uses codex+gemini, so the agy stub is moot during the dogfood window.

**Phase 0 — Validation Gates (U1, U2)** *(schedulable parallel with Phase 1; outputs gate Phase 2)*
PR scope: validation scripts + findings docs (incl. agy auth-mechanism discovery + the no-offline-signal verdict) + onboarding doc + brainstorm corrections.
**Gate:** read both findings docs. grok fails → drop grok. agy posture fails OR agy has no R9-compliant offline signal → drop agy, Option (c). Both fail → panel-only-with-codex; reconsider shipping. Confirm U2 documented agy's actual auth path (not the provisional `~/.gemini/oauth_creds.json`).

**Phase 1 — Dogfoodable thin slice (U3, U4, U5, U6)** *(against the current codex+gemini harness; egress-safe)*
PR scope: scaffold + headless pass-1 (with failure UX) + consent gate (multi-select, graceful gitleaks) + egress-safe dispatcher + bundling + CI-enforced drift test + discoverability slice.
**Gate = the ⛳ dogfood gate.** Tests pass (frontmatter, ce-prefix, shell-safety, drift, minimal contract). **Apply OD-1's measurement design**, dogfood ~1–2 weeks, decide per the four-way tree in the U6 callout.

**Phase 2 — Harness Extension (U7, U8, U9)** *(gated by dogfood proceed + Phase 0 outputs)*
PR scope: grok arm + gemini→agy migration (incl. landing the agy rule into `env-detect.sh`) + full `--models` + parallelism. CI re-bundle keeps the skill in sync.
**Gate:** `bun test tests/cross-model-review-*.test.ts` + drift test pass; live smoke per arm non-empty.

**Phase 3 — Verification & Reconciliation (U10, U11)**
PR scope: verification protocol + reconciled sidecar writer (reclaims `.deep-review.md`) + rotation + banner precedence.
**Gate:** manual end-to-end exercises F1, F2, F3, F4, F4-zero, F5.

**Phase 4 — Validation & Promotion (U12, U13)**
PR scope: verifier rate measurement (agy-voiced corpus + min-sample/fallback) + full contract test + finalized docs + README counts.
**Gate:** rate report ≤5% each AND adequate agy representation (real or synthetic-flagged) → eligible; else documented fallback + calibration scope. Contract test passes. README counts correct. brainstorm corrected.

**Calendar fallback (2026-06-15):** if Phase 0 hasn't completed by 2026-06-15, fall back to Option (c) — ship without agy. Re-scope U8 to "remove gemini from arms.py" and the dispatcher to a 2-arm (codex + grok) config. Completes before the 2026-06-18 HTTP-410 cutoff (removes the agy dependency).

> **Sequencing note:** the dogfood gate runs against codex+gemini, which works until 2026-06-18. If the dogfood window would cross that date, swap the gemini arm for **codex-only** rather than blocking on the agy migration — **but** per OD-1, a codex-only (single-arm) dogfood signal is provisional and must not greenlight the full 3-arm build on its own.

---

## Dependencies / Prerequisites

- **gitleaks:** recommended, not required (v3). The gate degrades gracefully; installing it (`brew install gitleaks`) upgrades the preview. Onboarding doc covers it.
- **Vendor accounts:** paid Antigravity plan + acceptable DPA; xAI Grok credentials; codex installed+authed. **agy's exact auth/credential configuration is whatever U2 discovers** (and U2 may find no offline-detectable signal, in which case agy is unavailable). User responsibility.
- **ce-doc-review** must support `mode:headless` (it does); the headless envelope is the contract.
- **Canonical harness** (`arms.py`, `panel-critique.sh`) exists. The thin slice bundles it + lands a minimal `--models` guard (U5); U7/U8/U9 extend it.
- **External deadline:** Gemini CLI HTTP-410 cutoff 2026-06-18. Phase 0 by 2026-06-15 to keep Option (a). The dogfood can use codex-only if its window crosses the cutoff (provisional signal per OD-1).
- **xAI grok data-retention policy** for `-p` invocations is **confirmed acceptable** for internal Blueprint plan content (user-confirmed 2026-05-28; see OD-3). grok stays in the consent gate. U13 corrects the brainstorm's stale "unverified assumption" Dependencies wording to match the authoritative Key Decisions framing.

---

## Key Technical Decisions

- **Beta rollout.** `ce-deep-review-beta` with `disable-model-invocation: true` + `[BETA]`; promote after U12 clears (with adequate agy representation). The flag blocks only model-auto-invocation — explicit user invocation (typed slash command / explicit `Skill()` call) still works, which is how dogfood + adoption runs accrue.
- **Dogfood the thin slice before the heavy build.** U3–U6 ship a runnable, **egress-safe** panel + consent gate + bash-handoff against the current harness, gated by the dogfood gate. See OD-1 (gate measurement) and OD-2 (probe shape) in the Decisions section — both resolved.
- **Invoke ce-doc-review headless, not replicate.**
- **Egress equals consent.** The dispatcher sends the plan only to the models selected at the gate — enforced by a `--models` subset guard *before* the harness runs (U5), never post-hoc filtering.
- **Consent gate is a single multi-select question, ack in the stem.** Per-model toggles (default none) + Cancel fit the 4-option cap for ≤4 models; selecting ≥1 model is the acknowledgment; zero-selection → F4-zero re-prompt. No numbered-list overflow.
- **Bundle the harness via build-time copy (not symlink); copy only `panel-critique.sh` + `arms.py`** (rubrics are inline heredocs). A **CI-enforced** drift test (runs `bundle-harness.sh`, fails on a working-tree change; normalized equality) keeps the bundle in sync, including after eval-only edits to the shared files.
- **agy auth detection uses the U2-discovered mechanism — and U2 may find none.** No path is pre-assumed; if no offline signal exists, agy is unavailable (Option (c)). Detection reads a single documented constant used by both `arms.py` and `env-detect.sh`.
- **agy posture is best-effort prompt-side** (`--sandbox` + `--add-dir` + directive); documented.
- **gitleaks degrades gracefully**; the responsibility ack **escalates** when no scan ran; `content_preview: unavailable` is audited.
- **`env-detect.sh` never emits credential material** — only a JSON status record (tested).
- **Sidecar filenames encode trust:** `.deep-review.md` = verified cross-model; `.deep-review-draft.md` = thin-slice unverified; `.panel-review.md` = panel-only. `skill_phase` frontmatter persists through rotation. Commit-as-audit; the skill does not modify `.gitignore`.
- **Verifier dispatch is blind to producing model;** U12 stresses non-Claude voices incl. agy and reports a `calibration_scope`.
- **No retry across vendors;** per-arm outcome in the header; coverage degrades to `reduced-confidence` on any non-`ok`.
- **A permanently-thin-wrapper outcome still ships verification** — never the unverified dump (reconciles with the brainstorm's verification Key Decision).

---

## Success Metrics

- **Friction-hypothesis signal (the dogfood gate's metric, per OD-1):** measured against a pre-recorded baseline of deep-review skip/defer rate; proceed requires a materially higher review rate by ≥2 distinct devs during the window, with the debrief distinguishing hop-friction from unverified-output toil. Thin-slice runs count only toward THIS signal.
- **Adoption signal:** internal developers run `ce-deep-review-beta` on ≥5 distinct high-stakes plans within 2 weeks of **verification landing (post-Phase 3)** — i.e., verified runs (`skill_phase: verified`), not thin-slice drafts. (Manual count from committed sidecars; explicit invocation.)
- **Decorrelation value:** ≥30% of full (verified) `ce-deep-review` runs surface ≥1 verified CONFIRMED cross-model finding the panel missed. (From decision-changing-union sections; measurable only after Phase 3. No producing artifact exists before Phase 3 — do not evaluate this metric on thin-slice runs.)
- **Verifier accuracy:** both rates ≤ 5% on the U12 corpus, ≥20 items, N=3, with adequate agy representation + an explicit calibration scope. (Promotion gate.)
- **No silent degradation:** every reduced-coverage run carries a visible `coverage:` banner; every gitleaks-absent run carries `content_preview: unavailable`; every thin-slice run carries `skill_phase: thin-slice` + the UNVERIFIED banner. (U13 contract test.)
- **Onboarding cost:** a new developer runs their first deep review within 30 minutes of the onboarding doc. (Phase 4 sanity check.)

---

## Scope Boundaries

- **Out of scope (carried from origin):** the eval machinery (judge, trials, GT-match, decision-artifact, record-schema); per-plan trust allow-listing; cost/token estimation in the gate; headless/non-interactive ce-deep-review v1; extension to ce-code-review; a new non-Claude judge.
- **Out of scope (plan-time):** production-grade retry/circuit-breaker; full N×M parallelism; reimplementing gitleaks in JS/TS; replicating ce-doc-review internally; skill auto-modifying `.gitignore`; custom gate UX beyond the multi-select.
- **Out of scope (v3):** a permanently separate "alpha" skill dir (the thin slice matures in place); scanning the sidecar itself for secrets (the plan scans the plan; the committed-leak reminder + escalated ack cover the gitleaks-absent residual — sidecar scanning is a deferred follow-up).

### Deferred to Follow-Up Work

- **Stable promotion** (`-beta` → stable). Gated on U12 (incl. agy representation). Renames the skill dir + contract test + adds them to the stale-artifact registries.
- **Opt-in-none vs. opt-out-with-content-gate.** Revisit after the first ~10 beta runs — **define the flip criterion before then** (round-2 scope flagged the absent forcing function): e.g., gate click-through and completion rates captured in sidecar metadata.
- **Sidecar `.gitignore` reconsideration** and **scanning the sidecar itself** — revisit if committed sidecars leak LLM output into PRs.
- **Per-vendor retry policy.**
- **Adoption telemetry baked into the skill.**
- **Cross-platform conversion of the multi-select gate** for non-Claude targets.

---

## Operational / Rollout Notes

- **Branch + PR cadence:** each phase a PR. Phase 2 must not begin until the **dogfood gate proceed-decision** is recorded AND Phase 0 outputs are in.
- **Commit prefixes:** `feat(ce-deep-review-beta): ...` for skill code (U3–U6, U10, U11, U12); `feat(cross-model-eval): ...` for harness commits (U5's `--models` guard, U7, U8, U9); doc/test commits use the relevant scope. Never use `compound-engineering` as a scope.
- **Beta invocation (metric enablement):** explicit — typed `/ce-deep-review-beta <plan>` or explicit `Skill("ce-deep-review-beta", ...)`. Dogfood + adoption runs accrue from these. State this in the U3 commit message + the user-facing doc.
- **Skill validation via skill-creator:** skill prose behavior can't be tested via in-session typed-agent dispatch (caches at session start). Use `skill-creator`.
- **Bundled-harness maintenance:** the CI step (U5) runs `bundle-harness.sh` and fails on a working-tree change, so re-bundle is automatic on any canonical edit — including eval-only edits to the shared `arms.py`/`panel-critique.sh`. Maintainers can run it locally: `bash plugins/compound-engineering/skills/ce-deep-review-beta/scripts/bundle-harness.sh`.
- **Release-please:** do not hand-bump versions.
- **Stale-install cleanup:** net-new; registry entries handled at promotion.
- **Tests:** `bun test` after each phase; `bun run release:validate` after the final.

---

## Outstanding Questions

### Resolve Before Phase 1

- **None.** OD-1 (gate measurement), OD-2 (probe shape), and OD-3 (xAI retention) were resolved 2026-05-28 — see the Decisions section. Phase 1 may proceed.

### Deferred to Implementation

- [U1, U7] grok `--sandbox <profile>` — measured in U1, constant in U7.
- [U2, U8] agy posture flag combination — measured in U2, constant in U8; best-effort prompt-side.
- [U2, U8] **agy's real auth mechanism + whether an offline-detectable signal exists** — discovered in U2; if none exists, agy is unavailable (Option (c)). Landed as a documented constant in `env-detect.sh` + `arms.py`.
- [U2, U8] agy `-p` arg-length cap — measured in U2; `--add-dir` workaround.
- [U4] Final responsibility-ack + gitleaks-absent-notice copy — canonical drafts in `consent-gate.md`; refine once.
- [U5] Whether to land the `--models` guard in `panel-critique.sh` or invoke `arms.py run-arm` per cell — both egress-safe; pick in implementation.
- [U5] Permission gate for `bash ${CLAUDE_SKILL_DIR}/scripts/panel-critique.sh` — narrow `allowed-tools: Bash(bash *panel-critique.sh)`.
- [U11] Group cross-model findings by lens vs. arm — plan recommends by-lens.
- [U12] Held-out corpus construction; agy-voiced sampling + synthetic fallback; min-sample = 5 agy-voiced items.
- [U12] Exact rate-miss fallback implementation (config flag the orchestrator reads).
