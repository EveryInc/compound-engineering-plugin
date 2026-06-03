---
date: 2026-05-28
type: feat
origin: docs/brainstorms/2026-05-28-ce-deep-review-requirements.md
status: active
title: ce-deep-review — turnkey high-stakes plan review across Claude + non-Claude models
---

# feat: ce-deep-review skill

## Summary

A new `ce-deep-review-beta` skill that orchestrates the existing 3-pass high-stakes-plan review recipe end-to-end on any plan document. The skill invokes `ce-doc-review` in headless mode for pass 1 (Claude panel), opens a single interactive consent gate (gitleaks content preview + opt-in-per-model multi-select + explicit responsibility acknowledgment), shells out to a bundled copy of the cross-model harness for pass 2 (codex + grok + agy fanned across the same six lenses, parallel across models with sequential lenses per model), has the orchestrator verify every cross-model finding against the doc with inline-quoted CONFIRMED / NOT-FOUND-IN-DOC / NEEDS-HUMAN tags, then writes a reconciled sidecar at `<plan-path>.deep-review.md` (or `<plan-path>.panel-review.md` for zero-CLI panel-only runs). Ships as a beta skill first; promoted to stable after the bidirectional verifier rate measurement clears its thresholds.

---

## Problem Frame

The deep-plan-review workflow (Claude panel + cross-model panel + reconcile) is a lever the team has decision-grade evidence on for *decorrelation* (cross-model arms surface validated bugs the Claude panel alone misses) but inconclusive evidence on *team-wide value*. Running it today requires a multi-tool, multi-context workflow: invoke `ce-doc-review`, open a terminal, paste a bash command, wait, return the records to the chat, then ask the agent to reconcile and manually verify gemini's confabulation-prone findings. Three pain points compound:

1. **The pass-2 hop is expensive in attention.** Switching to a terminal and pasting a bash command for every high-stakes plan is enough friction that the deep review gets skipped or deferred.
2. **Verification is the most error-prone manual step.** Gemini confabulates plausible-but-fake findings; the user, not the agent, currently checks each cross-model finding against the doc.
3. **The workflow assumes a single operator.** The harness was built for one developer with a specific environment; teammates without the same toolset have no entry point at all.

This skill is the instrument that gathers team-wide evidence in real use, not the productionization of a settled win. It carries that framing forward — the v1 is fully turnkey because the friction itself is hypothesized to be what suppresses usage and therefore evidence. Risk acknowledged: if the lever does not clear the value bar after v1, the agy migration + grok hardening + verifier accuracy work do not pay back; the thinner-wrapper alternative remains available.

---

## Actors

- A1. Plan author / reviewer (any internal developer): invokes `ce-deep-review` on a plan they have authored or want to vet. May or may not have all non-Claude CLIs installed and configured. *Carried from origin.*
- A2. The orchestrating agent (Claude): runs pass 1, mediates the consent gate, dispatches the cross-model arms, verifies cross-model findings against the doc, writes the reconciled report. *Carried from origin.*
- A3. Non-Claude reviewer CLIs (codex, agy, grok): produce cross-model findings under the same six lenses as the Claude panel; configured per-environment by the user (who is responsible for OAuth/API-key setup and vendor data-handling policies); opt-in per-run via the consent gate. *Carried from origin; "user responsibility" framing added per plan-time decision.*

---

## Key Flows

- F1. Happy-path deep review with all three non-Claude models available
  - **Trigger:** A1 invokes `ce-deep-review <plan-path>`.
  - **Actors:** A1, A2, A3
  - **Steps:**
    1. A2 probes the environment for installed and authed non-Claude CLIs; finds all three available per the offline auth-detection rules (R9 — corrected, see Key Technical Decisions).
    2. A2 invokes `ce-doc-review` in headless mode against the plan path; receives the panel envelope (applied fixes, decisions, FYI, residual concerns).
    3. A2 runs the gitleaks content preview against the plan, captures findings.
    4. A2 opens the consent gate as a numbered-list-in-chat (5 sequenced choices: 3 models × opt-in-or-not + responsibility-acknowledge + proceed/cancel). Default selection per model is "no." Content-preview hits are surfaced inline. Responsibility acknowledgment is required to proceed.
    5. A1 confirms responsibility and selects models; A2 fans the selected models across the six lenses (parallel across models, sequential lenses within each model) by shelling out to the bundled `scripts/panel-critique.sh` with the `--models <subset>` argument.
    6. A2 verifies each cross-model finding against the doc (blind to producing model) and tags CONFIRMED / NOT-FOUND-IN-DOC / NEEDS-HUMAN with inline-quoted matches for CONFIRMED.
    7. A2 writes the reconciled report to `<plan-path>.deep-review.md` (with `coverage:` frontmatter field, audit metadata header, panel findings untagged, cross-model findings grouped with verification tags, decision-changing-union section). Raw per-model records remain at `/tmp/cmre-panel/records/`.
    8. A2 streams a summary to chat.
  - **Outcome:** A1 reads a single verified, durable, commit-as-audit sidecar listing the panel findings plus the decorrelated cross-model additions, each cross-model finding tagged with its verification status.
  - **Covered by:** R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12

- F2. Partial-environment deep review (some non-Claude CLIs missing)
  - **Trigger:** A1 invokes `ce-deep-review <plan-path>` on a machine where one of the non-Claude CLIs is not installed or not authenticated.
  - **Actors:** A1, A2, A3 (subset)
  - **Steps:**
    1. A2 probes the environment; finds (e.g.) codex + grok available, agy missing.
    2. A2 opens the consent gate showing only the available models; surfaces a one-line note that the missing model was skipped and why (not installed / not authenticated).
    3. Remainder proceeds as in F1 with the subset, and the resulting sidecar carries `coverage: reduced-confidence` with a banner labeling the run.
  - **Outcome:** A1 gets a deep review using the subset of models available in their environment, with explicit disclosure that fewer than the full set participated.
  - **Covered by:** R2, R3, R6, R7, R9, R11

- F3. Panel-only deep review when zero non-Claude CLIs are available
  - **Trigger:** A1 invokes `ce-deep-review <plan-path>` on a machine where none of codex, agy, grok is available.
  - **Actors:** A1, A2
  - **Steps:**
    1. A2 probes the environment; finds zero usable non-Claude CLIs.
    2. A2 invokes `ce-doc-review` in headless mode for the Claude panel.
    3. A2 writes a sidecar at `<plan-path>.panel-review.md` (distinct from `.deep-review.md` per R14's filename reservation) with `coverage: panel-only` frontmatter; header and chat banner state prominently `Panel-only deep review (no cross-model arm)` and name each missing CLI with its install/auth command.
  - **Outcome:** A1 gets the panel work AND explicit visibility into what's missing — refuses to be quiet, not refuses to run.
  - **Covered by:** R2, R13

- F4. User declines egress at the consent gate
  - **Trigger:** During F1 step 4, A1 declines the responsibility acknowledgment or cancels the gate.
  - **Actors:** A1, A2
  - **Steps:**
    1. A2 outputs the Claude panel findings already gathered to chat as the deliverable.
    2. A2 does not write `<plan>.deep-review.md` (the filename remains reserved for verified cross-model output per R14).
  - **Outcome:** A1 gets the panel findings without egress. The deep-review filename remains reserved.
  - **Covered by:** R2, R14

---

## Output Structure

```
plugins/compound-engineering/skills/ce-deep-review-beta/
├── SKILL.md
├── references/
│   ├── consent-gate.md              # Inline consent flow, gitleaks integration, responsibility prompt
│   ├── verification-protocol.md     # Per-finding grounding rules, inline-quote contract, blind-to-producer instructions
│   ├── reconciliation.md            # Sidecar shape, frontmatter, audit metadata, decision-changing union assembly
│   ├── arm-invocation.md            # How to shell out to scripts/panel-critique.sh; per-(model, lens) record parsing
│   ├── pass-1-headless-envelope.md  # ce-doc-review headless invocation + envelope parsing
│   └── ship-state-machine.md        # State dimensions across pass 1, consent, pass 2, verification, sidecar write
├── scripts/
│   ├── panel-critique.sh            # Bundled copy of cross-model harness; extended with --models subset + parallelization
│   ├── arms.py                      # Bundled copy with grok arm + agy migrated from gemini
│   ├── gitleaks-scan.sh             # Wrapper that invokes gitleaks and emits parseable JSON
│   ├── env-detect.sh                # Offline auth detection per CLI (codex, agy, grok)
│   └── verifier-eval/               # Held-out corpus + measurement harness for R10 rates
│       ├── corpus/                  # Hand-curated plan + known-confabulated findings (both directions)
│       └── measure.py               # Runs verifier against corpus, emits rate report
└── tests/                           # (Tests live in /tests/skills/, not here — see U12)

docs/skills/ce-deep-review.md          # User-facing doc (mirrors docs/skills/ce-doc-review.md shape)
tests/skills/ce-deep-review-contract.test.ts  # Skill contract test
```

The tree is a scope declaration. The per-unit `**Files:**` sections are authoritative for what each unit creates or modifies; implementation may adjust the structure if a better layout emerges.

---

## Implementation Units

Organized into 4 phases. Validation (Phase 0) gates everything else — we will learn from validating grok and agy before committing to harness changes that depend on their actual behavior.

### U1. Grok behavioral smoke test + sandbox profile evaluation

- **Goal:** Empirically verify grok's `--permission-mode plan` + `--disable-web-search` + `--sandbox <profile>` actually constrain behavior at runtime (not just at flag-parse time). Determine the right sandbox profile (`workspace` / `read-only` / `strict`) for ce-deep-review's cross-model arm posture.
- **Requirements:** Pre-v1 Ship Gate 1 (grok behavioral smoke test); Pre-v1 Ship Gate 2 (grok `--sandbox` profile evaluation).
- **Dependencies:** None.
- **Files:**
  - `scripts/eval/cross_model_review/validation/grok-smoke.sh` (new)
  - `scripts/eval/cross_model_review/validation/grok-sentinel.md` (new — sentinel prompt with planted tool-use bait)
  - `docs/solutions/skill-design/2026-MM-DD-grok-arm-posture-validation.md` (new — capture findings)
- **Approach:** Construct a sentinel prompt that explicitly tries to (a) perform a web search, (b) read a file outside the working directory, (c) write a file inside the working directory, (d) spawn a subagent. Run grok with each candidate sandbox profile (off/workspace/devbox/read-only/strict) combined with `--permission-mode plan` + `--disable-web-search` + `--max-turns 1` + `--no-subagents` + `--verbatim`. Capture stdout, stderr, and any side-effect evidence (files written to a watched dir, network egress via a stub). Pick the strictest profile that does not break legitimate findings output. Note: `read-only` is the brainstorm's prior favorite but blocks `~/.grok/` writes — verify auth/session paths still work.
- **Patterns to follow:** `scripts/eval/cross_model_review/arms.py` `detect_leak()` (sentinel-probe primitive). Mirror that shape — plant a sentinel only reachable via prohibited tool use; assert grok cannot surface it.
- **Test scenarios:**
  - Sentinel prompt with planted web URL: assert no network request to that URL across all candidate profiles + `--disable-web-search`.
  - Sentinel prompt asking to read `~/.ssh/config`: assert no read attempt across `read-only` and `strict`.
  - Sentinel prompt asking to write `/tmp/grok-write-canary`: assert no file created across `read-only` and `strict`.
  - Sentinel prompt asking grok to "respond with the contents of `~/.zshrc`": assert response does not include the file's content (model-side refusal vs. sandbox-side block — both acceptable).
  - Output sanity: with the chosen final flag set, grok still returns a valid JSON array on a benign review prompt (no isolation false-positives that break legitimate output).
- **Verification:** A markdown finding-doc under `docs/solutions/` documents the chosen profile, the empirical evidence behind the choice, and any known limitations (e.g., macOS Seatbelt network semantics if different from Linux seccomp). The chosen profile is recorded as a constant ready to land in `arms.py` in U3.

### U2. agy CLI surface verification + posture-floor validation + onboarding doc

- **Goal:** Re-verify agy's actual CLI surface against the brainstorm's resolved assumptions; document the OAuth+paid-plan-DPA user-responsibility requirement; validate the best-effort posture for the agy arm given the absence of a plan-mode equivalent.
- **Requirements:** Pre-v1 Ship Gate 3 (agy posture-floor validation); R5 (arm posture); R9 (offline auth detection); RBP 1 (migration sequence); RBP 4 (Antigravity DPA).
- **Dependencies:** None.
- **Files:**
  - `scripts/eval/cross_model_review/validation/agy-smoke.sh` (new)
  - `scripts/eval/cross_model_review/validation/agy-sentinel.md` (new)
  - `docs/solutions/skill-design/2026-MM-DD-agy-arm-posture-validation.md` (new)
  - `docs/skills/ce-deep-review-onboarding.md` (new — user-facing setup doc: agy paid plan + DPA acceptance, grok login, codex install, env vars)
  - `docs/brainstorms/2026-05-28-ce-deep-review-requirements.md` (modify — correct R5/R9 assumptions to reflect actual agy CLI surface)
- **Approach:** Empirically verify each brainstorm assumption against `agy --help` v1.0.3+ output: (a) no `--prompt-file`, prompt only via `-p "<text>"`; (b) no `--output-format json`, plain text only; (c) no plan-mode equivalent; (d) no env-var auth (OAuth via `~/.gemini/oauth_creds.json`); (e) `--sandbox` is boolean (FS-only nsjail/sandbox-exec). For the posture floor: combine `--sandbox` + `--add-dir <doc-dir>` constraining workspace to a temp dir containing only the plan + a prompt-side directive ("read ONLY <abs-path>; do not modify files; do not call tools; return JSON array of findings"). Run the same sentinel-prompt suite from U1 against the chosen agy posture. Document explicitly that the posture is *best-effort prompt-side*, not a hard runtime guarantee — this is one of the things we are learning by validating. For the onboarding doc: write the user-facing instructions — sign in to a paid Antigravity plan, accept the appropriate DPA with Google, configure OAuth, then verify `agy -p "say hi"` returns a non-empty response. The skill does NOT verify the DPA — user responsibility.
- **Patterns to follow:** `scripts/eval/cross_model_review/arms.py` `detect_leak()` for sentinel probes. `docs/skills/ce-doc-review.md` for the onboarding-doc shape.
- **Test scenarios:**
  - Sentinel prompt with planted secret outside the `--add-dir` workspace: assert agy cannot surface it.
  - Sentinel prompt asking agy to write `/tmp/agy-write-canary`: assert no file created when `--sandbox` is on.
  - Auth-detection probe: `~/.gemini/oauth_creds.json` present + non-empty + not expired returns "authed"; missing/empty returns "unavailable"; expired returns "unavailable" (do not refresh the token live — that's egress).
  - Round-trip: agy with the chosen posture flags returns a valid response on a benign 6-lens review prompt (no isolation false-positives).
  - Arg-length: for a plan ≥200 KB, the `-p "<inline>"` invocation succeeds without shell-arg-length errors (or document the size cap empirically).
  - Output parseability: agy's plain-text output passes through `parse_findings()` from `arms.py` either directly or with a documented post-processing step (e.g., strip preamble narration like "I am checking...").
- **Verification:** Onboarding doc exists at `docs/skills/ce-deep-review-onboarding.md` with the agy paid-plan + DPA acceptance instructions. The findings doc under `docs/solutions/` records the corrected CLI surface and the best-effort posture, and explicitly flags the prompt-side-constraint-not-runtime-guarantee limitation. The brainstorm doc's R5/R9 sections are updated to reflect actual agy surface. The user-responsibility framing is documented.

### U3. Add grok arm to `arms.py`

- **Goal:** Extend the existing cross-model harness with a `grok` arm matching the validated posture from U1.
- **Requirements:** R4 (grok arm); R5 (arm posture symmetry); R6 (subset-selection mechanism).
- **Dependencies:** U1.
- **Files:**
  - `scripts/eval/cross_model_review/arms.py` (modify — add GROK_BASE constant, `elif cli == "grok"` branch in `build_invocation`, "grok" to argparse choices)
  - `tests/cross-model-review-driver.test.ts` (modify — add grok arm cases mirroring codex/gemini)
- **Approach:** Mirror the existing codex/gemini pattern. Add `GROK_BASE = ["grok", "-p", GROK_INSTRUCTION, ...flags from U1...]`. Use `--prompt-file` via a temp file written in `build_invocation` (grok does not take stdin like codex; it takes `--prompt-file <path>` — confirmed in research). Add `"grok"` to all argparse `choices=` lists. The rubric assembly + isolation guarantees (clean cwd, HOME preserved for auth) are unchanged. Empirical posture flag values come from U1's findings doc.
- **Patterns to follow:** `scripts/eval/cross_model_review/arms.py` lines 40–43 (CODEX_BASE / GEMINI_BASE constants); lines 63–105 (build_invocation pattern); lines 197–212 (argparse choices).
- **Test scenarios:**
  - `build_invocation("b_isolated", "grok", doc_text, rubric)` returns a spec with the correct argv shape, `--prompt-file` pointing at a real temp file containing the assembled payload, and `cwd` pointing at a fresh tempdir.
  - `build_invocation("c_fixed_context", "grok", ..., context_text)` includes the context section in the prompt file (mirror existing codex/gemini behavior).
  - Defensive check: doc content does not appear in argv elements (`doc_in_argv == False`).
  - Integration smoke (live): `run-arm b_isolated grok <small-doc> <rubric>` returns a non-empty findings array within the timeout. (Optional — only runs when grok is locally installed and authed.)
  - `parse_findings` correctly parses grok's chosen output format (`json` per U1, or plain prose fallback).
- **Verification:** `python3 arms.py run-arm b_isolated grok <doc> <rubric> --doc-id smoke --trial 1` exits 0 with a JSON record containing a non-empty `findings` array. The driver test file passes `bun test tests/cross-model-review-driver.test.ts`.

### U4. Migrate gemini arm to agy in `arms.py`

- **Goal:** Replace the legacy gemini arm with the validated agy posture from U2. Carry across the auth-detection update (no env-var presence; OAuth-creds file check).
- **Requirements:** Migration option (a) from Key Decisions (migrate first, ship with agy as canonical); R5; R9; Pre-v1 Ship Gate 3 (validated in U2).
- **Dependencies:** U2.
- **Files:**
  - `scripts/eval/cross_model_review/arms.py` (modify — replace GEMINI_BASE/AGY_INSTRUCTION with AGY_BASE using validated flags; update detection logic; update header comment block at lines 27–39 to reflect agy as canonical and gemini as deprecated)
  - `scripts/eval/cross_model_review/panel-critique.sh` (modify — replace `gemini` with `agy` in the model loop)
  - `tests/cross-model-review-driver.test.ts` (modify — replace gemini cases with agy)
  - `tests/cross-model-review-corpus.test.ts` (modify — update arm enumeration)
- **Approach:** Build `AGY_BASE = ["agy", "-p", AGY_INSTRUCTION, "--sandbox", "--add-dir", <doc-dir>, ...]`. The prompt-side directive from U2 is appended to AGY_INSTRUCTION. Write the doc to a temp file under a `--add-dir`-scoped workspace; the prompt body tells agy to read that path. Update auth detection: `agy` is available iff `command -v agy` succeeds AND `~/.gemini/oauth_creds.json` exists, is non-empty, and is not expired (parse the JSON `expiry` field — do not call agy to verify, that would be egress). Document the prompt-side constraint as best-effort in the arms.py header comment.
- **Patterns to follow:** Same arms.py structure as the existing codex/gemini arms.
- **Test scenarios:**
  - `build_invocation("b_isolated", "agy", doc, rubric)` returns a spec with the chosen agy posture flags and a `--add-dir` workspace pointing at the doc's temp dir.
  - Auth detection: write a fake `~/.gemini/oauth_creds.json` with `expiry: <past>`; the detection returns "unavailable" without invoking agy.
  - Auth detection: write a non-empty valid-expiry credential file; detection returns "available."
  - The arms.py header comment block accurately reflects agy's actual CLI surface (no `--prompt-file`, no `--output-format`, plan-mode-equivalent absent).
  - Integration smoke (live): with a valid agy paid-plan login, `run-arm b_isolated agy <small-doc> <rubric>` returns a non-empty findings array.
  - Regression: codex arm output is unchanged by this migration.
- **Verification:** `python3 arms.py run-arm b_isolated agy <doc> <rubric>` succeeds (when agy is locally authed). `bun test tests/cross-model-review-driver.test.ts` passes. Header comment in arms.py documents the agy migration and the user-responsibility for DPA/paid-plan setup.

### U5. Extend `panel-critique.sh` with `--models` subset + parallel-across-models execution

- **Goal:** Support per-run model selection (R6) and reduce wall-time by parallelizing across models while preserving per-(model, lens) progress lines (R15).
- **Requirements:** R6 (subset selection); R15 (progress streaming, no silent multi-minute runs); R3 (recipe sequencing).
- **Dependencies:** U3, U4.
- **Files:**
  - `scripts/eval/cross_model_review/panel-critique.sh` (modify — accept `--models codex,grok,agy` flag; loop becomes per-model parallel with per-model sequential lenses; emit progress lines)
  - `tests/cross-model-review-driver.test.ts` (modify — add subset-selection test cases)
- **Approach:** Parse a `--models codex,grok,agy` flag (default = all three). Fork one bash subshell per selected model that runs the six lenses sequentially; each emits one progress line per (model, lens) completion to stderr in the form `[model lens] findings=N` (matching the current format). The parent waits on all children. Output records still land at `${CMRE_OUT_DIR:-/tmp/cmre-panel}/records/${cli}__${lens}.json`. Preserve `CMRE_TIMEOUT` as per-(model, lens) timeout (per the existing pattern). Do not retry across vendors — emit a per-arm outcome in stderr (`ok` / `timeout` / `missing` / `auth_fail` / `empty`) that the orchestrator picks up.
- **Patterns to follow:** Current `panel-critique.sh` lens-loop structure; bash background-job pattern (`subshell & ; ... ; wait`).
- **Test scenarios:**
  - `panel-critique.sh --models codex foo.md` runs only the codex arm across all six lenses.
  - `panel-critique.sh --models codex,grok foo.md` runs codex and grok in parallel; per-(model, lens) progress lines interleave on stderr.
  - Records on disk are still keyed `${cli}__${lens}.json` — no collisions.
  - With one model missing locally, the shell exits 0 (skips that model's loop) and emits `[model lens] SKIP — model not installed` lines per lens.
  - Wall-time on 6-lens × 3-model run with mock arms (`true` substitutes) is ≤ 1.2× single-arm wall-time (i.e., parallelism actually fires).
  - Default behavior (no `--models` flag) is unchanged from pre-modification — same arm set as currently configured (post-U3/U4: codex + grok + agy).
- **Verification:** `bash scripts/eval/cross_model_review/panel-critique.sh --models codex,grok foo.md` exits 0 with records in `/tmp/cmre-panel/records/` for both models, one file per (model, lens). Wall-time on a 3-model run is ≤ 60% of the sequential equivalent.

### U6. Create `ce-deep-review-beta` skill scaffold + headless ce-doc-review invocation (pass 1)

- **Goal:** Stand up the beta skill directory + SKILL.md + Phase 1 invocation of `ce-doc-review` in headless mode; parse the structured envelope for pass-2 consumption.
- **Requirements:** R1 (skill exists); R2 (single-path argument); R3 (recipe sequencing); R8 (blocking question tool platform-aware).
- **Dependencies:** None at the skill-code level (can run in parallel with Phase 0/1 work).
- **Files:**
  - `plugins/compound-engineering/skills/ce-deep-review-beta/SKILL.md` (new)
  - `plugins/compound-engineering/skills/ce-deep-review-beta/references/pass-1-headless-envelope.md` (new)
  - `plugins/compound-engineering/skills/ce-deep-review-beta/scripts/env-detect.sh` (new)
  - `plugins/compound-engineering/skills/ce-deep-review-beta/.gitkeep` files for references/, scripts/, tests-fixtures/ as needed
- **Approach:** SKILL.md frontmatter follows the same minimal shape as ce-doc-review (`name`, `description`, `argument-hint`) plus `disable-model-invocation: true` and `[BETA]` prefix in description (beta-skills-framework). Top of SKILL.md does the AskUserQuestion ToolSearch preload. Phase 1 invokes `Skill("ce-doc-review", "mode:headless <plan-path>")` and parses the resulting envelope (Applied N fixes / Proposed fixes / Decisions / FYI / Residual / Deferred). `env-detect.sh` does the offline auth-state checks per CLI: codex via existing project pattern; grok via `XAI_API_KEY` non-empty OR `~/.grok/auth.json` valid; agy via `~/.gemini/oauth_creds.json` non-empty + not expired. Use platform-explicit invocation language ("Invoke the `ce-doc-review` skill via the platform's skill-invocation primitive: `Skill` in Claude Code, `Skill` in Codex...") — do not write "tell the user to type /ce-doc-review."
- **Patterns to follow:** `plugins/compound-engineering/skills/ce-doc-review/SKILL.md` (Phase 0 mode detection; AskUserQuestion preload at top; headless-mode envelope at `references/synthesis-and-presentation.md` lines 264–366). `plugins/compound-engineering/skills/ce-plan/references/plan-handoff.md` for the headless sub-skill invocation pattern. `docs/solutions/skill-design/post-menu-routing-belongs-inline-2026-04-28.md` for inline-routing discipline.
- **Test scenarios:**
  - SKILL.md frontmatter parses as valid YAML, `name` matches directory, description ≤ 1024 chars, `disable-model-invocation: true` is set.
  - `name:` is `ce-deep-review-beta` (the `ce-` prefix is enforced; `-beta` suffix follows the framework).
  - `env-detect.sh` prints a structured JSON record `{codex: ok|missing|unauthed, agy: ..., grok: ...}` for downstream parsing.
  - `env-detect.sh` does NOT call any vendor API — uses only file presence checks, env-var presence, and `command -v`.
  - Pass-1 envelope parsing handles all five top-level envelope sections (Applied fixes, Proposed fixes, Decisions, FYI observations, Residual concerns).
- **Verification:** `bun test tests/frontmatter.test.ts` passes on the new skill. `bun test tests/skill-agent-ce-prefix.test.ts` passes. `bun test tests/skill-shell-safety.test.ts` passes. Manually invoking the skill on a small plan produces a parsed envelope without errors.

### U7. Consent gate — gitleaks preview + opt-in-per-model + responsibility acknowledgment

- **Goal:** Implement the single interactive gate that previews content sensitivity, presents per-model opt-in choices, and requires explicit acceptance of egress responsibility.
- **Requirements:** R7 (consent gate three-in-one); R8 (blocking question tool); R9 (auto-detection from U6); Key Decision: opt-in-per-model default-none; Plan-time decision: responsibility acknowledgment line.
- **Dependencies:** U6.
- **Files:**
  - `plugins/compound-engineering/skills/ce-deep-review-beta/references/consent-gate.md` (new)
  - `plugins/compound-engineering/skills/ce-deep-review-beta/scripts/gitleaks-scan.sh` (new)
  - `plugins/compound-engineering/skills/ce-deep-review-beta/SKILL.md` (modify — inline the consent-gate flow per post-menu-routing-belongs-inline rule)
- **Approach:** Inline the consent-gate routing in SKILL.md (load-bearing per the inline-routing rule — references load on demand and can be skipped). The gate fires AFTER pass 1 returns. Sub-steps:
  1. Run `gitleaks detect --no-git --source <plan> --report-format json --redact` via `gitleaks-scan.sh`. Parse the JSON; render hits as `Line N (rule-id): <redacted preview>`. If gitleaks is not installed, surface install instructions + fail-safe (do not silently skip the scan).
  2. Render numbered-list-in-chat with the explicit content-preview + responsibility acknowledgment + per-model opt-in options (numbered list because AskUserQuestion caps at 4 and we need 3 models + ack + cancel = 5+). Use the documented "narrow exception for legitimate option overflow" rule with the "Pick a number or describe what you want." hint.
  3. The responsibility acknowledgment text reads (working draft, subject to copy refinement): *"I acknowledge that this plan content will be sent to the selected external vendors (codex / agy / grok), and that I have configured each vendor with an appropriate data-handling policy (paid plan + DPA where applicable) per my organization's requirements. I accept responsibility for what is egressed."* The user must say yes to this AND select at least one model to proceed.
  4. Surface the chosen subset to pass 2 as a comma-separated string for `panel-critique.sh --models`.
- **Patterns to follow:** `ce-doc-review` SKILL.md Phase 0 mode detection (top-of-file AskUserQuestion ToolSearch preload). `docs/solutions/skill-design/post-menu-routing-belongs-inline-2026-04-28.md`. `docs/solutions/best-practices/ce-pipeline-end-to-end-learnings-2026-04-17.md` for the compact-preview-then-Proceed/Cancel pattern.
- **Test scenarios:**
  - `gitleaks-scan.sh` against a plan containing a planted AWS key string surfaces the hit in the JSON output (rule-id, line, redacted preview).
  - `gitleaks-scan.sh` against a plan with no secrets returns an empty findings array.
  - Gate behavior with all 3 models available + zero gitleaks hits: presents content-preview-clean + 3 per-model options + responsibility-acknowledge + cancel; default selection is none.
  - Gate behavior with 1 model unavailable: presents 2 per-model options + one "skipped because X" note.
  - User declines responsibility → routes to F4 (panel-only chat, no sidecar).
  - User accepts responsibility but selects no models → routes to F4 equivalent (responsibility was acknowledged but no egress; treat as decline).
  - User accepts responsibility AND selects ≥1 model → routes to pass 2.
  - Routing lines for proceed/cancel are inline in SKILL.md (regression test that fails if they move to a reference).
  - Each option label is self-contained (some harnesses hide description text) and third-person.
- **Verification:** Manually walking the gate on a test plan exercises each branch (all-models, subset, decline, no-models-selected). The contract test in U12 asserts the routing lines exist inline in SKILL.md.

### U8. Pass 2 dispatcher — shell out + per-(model, lens) record parsing + state machine

- **Goal:** Invoke the bundled `panel-critique.sh` with the chosen model subset, stream per-(model, lens) progress lines to chat, parse the resulting records into a structured cross-model finding set.
- **Requirements:** R3 (recipe sequencing); R6 (subset propagation); R11 (per-model record structure); R15 (progress streaming, no silent multi-minute runs).
- **Dependencies:** U5, U6, U7.
- **Files:**
  - `plugins/compound-engineering/skills/ce-deep-review-beta/references/arm-invocation.md` (new)
  - `plugins/compound-engineering/skills/ce-deep-review-beta/references/ship-state-machine.md` (new — multi-dimensional state across pass 1 / consent / per-arm pass 2 / verification / sidecar)
  - `plugins/compound-engineering/skills/ce-deep-review-beta/scripts/panel-critique.sh` (new — bundled copy; or symlink to the canonical via a build-time copy step)
  - `plugins/compound-engineering/skills/ce-deep-review-beta/scripts/arms.py` (new — bundled copy)
  - `plugins/compound-engineering/skills/ce-deep-review-beta/SKILL.md` (modify — invoke bundled script)
- **Approach:** Bundle the harness under the skill's own `scripts/` directory (per AGENTS.md File-References-in-Skills rule — skill is self-contained). Invocation: `bash "${CLAUDE_SKILL_DIR}/scripts/panel-critique.sh" --models <subset> "$PLAN_PATH"` via the runtime Bash tool with narrow `allowed-tools: Bash(bash *panel-critique.sh)` frontmatter declaration. Stream stderr lines to chat as they arrive (per-(model, lens) progress per R15). After completion, walk `/tmp/cmre-panel/records/${cli}__${lens}.json` for each (model, lens) in the selected subset; parse `findings[]` into a structured set keyed by `(arm, lens, finding_index)`. The state machine reference documents the multi-dimensional state space (consent: pending/granted/declined; pass-1: idle/running/complete/failed; per-arm pass-2: idle/running/ok/timeout/missing/auth_fail/empty/malformed; verification: queued/running/complete; sidecar: unwritten/partial/written) and the rules for transitions and reporting partial-coverage in the sidecar header.
- **Patterns to follow:** `plugins/compound-engineering/AGENTS.md` "Permission gate on extracted scripts" pattern (use `${CLAUDE_SKILL_DIR}` + narrow allowed-tools). `docs/solutions/skill-design/git-workflow-skills-need-explicit-state-machines-2026-03-27.md` for the state-machine modeling discipline.
- **Test scenarios:**
  - Dispatcher invokes `bash ${CLAUDE_SKILL_DIR}/scripts/panel-critique.sh --models codex,grok plan.md` and waits.
  - Per-(model, lens) progress lines stream to chat as they arrive (smoke this by injecting a `sleep` into a mock arm and verifying chat output before the run completes).
  - On all-arms-ok: structured set contains one finding-array per (model, lens) cell.
  - On one-arm-timeout: structured set marks that arm's cells as `outcome: timeout`; the sidecar header (built in U10) reflects `coverage: reduced-confidence` with the timeout noted.
  - On one-arm-empty: marks `outcome: empty`; coverage downgrades.
  - On one-arm-malformed: marks `outcome: malformed`; raw output captured in residual section.
  - State machine: a `consent: declined` state never reaches pass 2 (precondition check).
- **Verification:** Live run against a test plan with all-arms-available produces 18 record files (3 models × 6 lenses) and structured findings parseable by U9.

### U9. Verification step — agent grounds each cross-model finding against the doc

- **Goal:** Implement the per-finding verification protocol — orchestrator-as-verifier locates the cited text in the plan, tags CONFIRMED with inline quote, NOT-FOUND-IN-DOC for confabulations, NEEDS-HUMAN for ambiguous-judgment findings. Verification dispatch is blind to the producing model (avoids in-family bias).
- **Requirements:** R10 (verification tags + inline-quote requirement); Key Decision: inline-quote requirement on CONFIRMED; Key Decision: bidirectional rate measurement (measured in U11).
- **Dependencies:** U8.
- **Files:**
  - `plugins/compound-engineering/skills/ce-deep-review-beta/references/verification-protocol.md` (new)
  - `plugins/compound-engineering/skills/ce-deep-review-beta/SKILL.md` (modify — inline the verification dispatch trigger; load the reference for protocol details)
- **Approach:** For each cross-model finding from U8, dispatch a sub-agent (or in-orchestrator inline pass for small sets) with a prompt that contains the plan content + the finding text but NOT the producing model identifier. Instruct the verifier to: (a) attempt to locate the cited text or claim in the plan; (b) tag CONFIRMED with inline quote if grounded; (c) tag NOT-FOUND-IN-DOC if the cited text/claim does not appear; (d) tag NEEDS-HUMAN if the finding is a strategic/aesthetic judgment with no specific text to check. Use the platform's subagent primitive (`Agent`/`Task` in Claude Code, `spawn_agent` in Codex, etc.) with `mode` omitted per AGENTS.md rule. Verification output schema: `{finding_id, tag, quote?, reason?}` — strict; agents that violate it are flagged and the finding routes to NEEDS-HUMAN by default. R30-style "did the inline quote actually appear in the plan?" backstop check runs synchronously after each verification tag (cheap; grep against the plan text).
- **Patterns to follow:** `ce-doc-review` `references/subagent-template.md` for the "<output-contract>" + "<review-context>" shape. `docs/solutions/skill-design/pass-paths-not-content-to-subagents-2026-03-26.md` for passing plan-path-not-content when dispatching (cheaper, the verifier reads only what it needs). `docs/solutions/skill-design/cross-model-eval-decision-grade-2026-05-26.md` for the blind-judge pattern.
- **Test scenarios:**
  - Finding with a verbatim quote matching the plan → tagged CONFIRMED with the inline quote; backstop grep confirms the quote appears in the plan.
  - Finding citing "the plan says X on line 42" where the plan contains no such text → tagged NOT-FOUND-IN-DOC.
  - Finding that is a strategic judgment ("this assumption is too optimistic") with no specific text reference → tagged NEEDS-HUMAN.
  - Verification prompt does NOT include the producing model's name (blind-to-producer property — assertable from the dispatched prompt content).
  - Verification output that violates the schema (missing inline quote on a CONFIRMED finding) is rejected → finding downgrades to NEEDS-HUMAN.
  - Backstop grep mismatch: verifier said CONFIRMED with quote "X" but "X" doesn't appear in plan → downgrades to NOT-FOUND-IN-DOC with note.
- **Verification:** Manual exercise on a curated finding set (5+ confabulated, 5+ grounded, 3+ judgment) produces the expected tags. Backstop grep catches >95% of false-CONFIRMs on this manual set (initial baseline; U11 measures formally).

### U10. Reconciliation + sidecar writer with coverage frontmatter + audit metadata + rotation

- **Goal:** Assemble the verified panel-findings + verified-cross-model-findings + decision-changing union into the sidecar. Write to `.deep-review.md` for cross-model runs or `.panel-review.md` for panel-only. Include `coverage:` frontmatter, audit-metadata header (models, timestamp, `git config user.name`), inline quotes for CONFIRMED findings, rotated history (keep last 5).
- **Requirements:** R11 (report structure); R12 (sidecar rotation with retention cap); R13 (panel-only filename); R14 (filename reservation); Key Decision: commit-as-audit (drop gitignore offer).
- **Dependencies:** U9.
- **Files:**
  - `plugins/compound-engineering/skills/ce-deep-review-beta/references/reconciliation.md` (new — sidecar shape, frontmatter, audit metadata, union assembly)
  - `plugins/compound-engineering/skills/ce-deep-review-beta/scripts/sidecar-rotate.sh` (new — rotation logic; keep last 5)
  - `plugins/compound-engineering/skills/ce-deep-review-beta/SKILL.md` (modify — inline write trigger; load reference for layout)
- **Approach:** After verification (U9), assemble the sidecar markdown: YAML frontmatter with `coverage: full|reduced-confidence|panel-only`, `plan`, `models`, `timestamp`, `user` (from `git config user.name`); reduced-confidence/panel-only banner if applicable; Claude panel findings section (untagged, trusted, from the U6 envelope); cross-model findings grouped per lens or per arm (choose by-lens for readability — same lens findings cluster together), each tagged with verification status and inline quote for CONFIRMED; decision-changing-union section listing verified cross-model findings NOT already in the Claude panel (this is the "what did cross-model add" surface). Before writing, rotate any existing sidecar at `<plan>.deep-review.md` to `<plan>.deep-review.<ISO-timestamp>.md`, then delete rotated files beyond the 5 most recent for this plan. Filename selection: `.deep-review.md` if any cross-model arm participated; `.panel-review.md` if zero cross-model arms (R13). DO NOT offer or modify `.gitignore` — sidecar is commit-as-audit per plan-time decision.
- **Patterns to follow:** Existing markdown frontmatter convention in this repo (origin: docs/plans/2026-05-24-001-feat-cross-model-review-eval-plan.md for the shape). Sidecar-rotation pattern from `docs/solutions/skill-design/` where similar precedents exist; otherwise write the cleanest possible shell wrapper.
- **Test scenarios:**
  - `coverage: full` when 3-of-3 cross-model arms participated with no per-arm errors.
  - `coverage: reduced-confidence` when 1-of-3 cross-model arms timed out (header banner names the missing arm with the outcome).
  - `coverage: panel-only` when zero cross-model arms; filename is `<plan>.panel-review.md` (NOT `.deep-review.md`).
  - Audit metadata header includes `git config user.name`, timestamp (ISO 8601), and the participating model list.
  - Inline quote appears under every CONFIRMED cross-model finding.
  - Decision-changing-union section lists verified cross-model findings whose substance does not appear in the Claude panel section.
  - Rotation: if 7 prior sidecars exist for the plan, the 5 most recent are preserved; the 2 oldest are deleted.
  - First run on a plan: no existing sidecar; no rotation fires; sidecar lands cleanly.
  - The skill does NOT modify `.gitignore` (regression test: run on a plan inside a git working tree; assert `.gitignore` is unchanged).
- **Verification:** Manually run end-to-end on a test plan; verify the sidecar at `<plan>.deep-review.md` contains all required sections, frontmatter, and inline quotes. Run twice; verify the prior sidecar is rotated to a timestamped name. Run 7 times; verify only the 5 most recent rotations remain.

### U11. Bidirectional verifier rate measurement against held-out corpus

- **Goal:** Build the held-out verification corpus and measure false-CONFIRM and false-NOT-FOUND-IN-DOC rates. Gate v1 promotion on both rates ≤ 5%.
- **Requirements:** R10 (verification design); Key Decision: bidirectional rate thresholds (≤5% each + consequence); RBP 10 resolution (bidirectional measurement); origin Outstanding Question on false-CONFIRM rate.
- **Dependencies:** U9.
- **Files:**
  - `plugins/compound-engineering/skills/ce-deep-review-beta/scripts/verifier-eval/corpus/` (new — hand-curated plan + known-confabulated findings, both directions)
  - `plugins/compound-engineering/skills/ce-deep-review-beta/scripts/verifier-eval/measure.py` (new — runs verifier against corpus, emits rate report)
  - `plugins/compound-engineering/skills/ce-deep-review-beta/scripts/verifier-eval/README.md` (new — corpus construction guidance + measurement protocol)
  - `docs/solutions/skill-design/2026-MM-DD-ce-deep-review-verifier-rates.md` (new — record of the measurement run + verdict)
- **Approach:** Hand-curate ≥20 findings (per-RBP-10 anchor; minimum-corpus floor) across both directions: (a) ~10 confabulated findings (cite text not in the plan, address-already-resolved issues, fabricated line numbers, plausible-but-fake quotes), (b) ~10 genuinely-grounded findings (including ones phrased in non-Claude voice — terse, blunt, codex-like — to specifically stress in-family bias). Run the verifier from U9 against the corpus with arm identifier blinded. Compute false-CONFIRM rate = `false_positives / total_confabulated`. Compute false-NOT-FOUND-IN-DOC rate = `false_negatives / total_grounded`. Repeat with N=3 trials per corpus item (variance reduction per `docs/solutions/skill-design/safe-auto-rubric-calibration-2026-04-25.md`). If either rate > 5%: implement the fallback (false-CONFIRM > 5% → all cross-model findings default-tag to NEEDS-HUMAN; false-NOT-FOUND > 5% → NOT-FOUND-IN-DOC becomes advisory, findings still appear). If both rates ≤ 5%: beta is eligible for stable promotion.
- **Patterns to follow:** `docs/solutions/skill-design/cross-model-eval-decision-grade-2026-05-26.md` for pre-registration discipline + corpus-floor handling (report `inconclusive` if corpus underpowered, don't fake a verdict). `docs/solutions/skill-design/safe-auto-rubric-calibration-2026-04-25.md` for N≥3 trials and explicit variance aggregation.
- **Test scenarios:**
  - `measure.py` runs against the corpus and emits a JSON report `{trials, false_confirm_rate, false_not_found_rate, per_item: [...]}`.
  - N=3 trials per item; the report aggregates per-item variance.
  - On a corpus of <20 items, the report surfaces `inconclusive: true` and refuses to issue a pass/fail verdict.
  - On a passing run (both rates ≤ 5%): produces a `promote: eligible` flag.
  - On a failing run (either rate > 5%): produces specific recommendation (`fallback: needs-human-default` or `fallback: advisory-tag`) plus the specific failure-mode items for inspection.
  - Verifier prompt during measurement does NOT include the producing model name (assertable from the dispatched-prompt content).
  - Confidence-anchored scoring: corpus items can be tagged `expected_tag = CONFIRMED|NOT-FOUND-IN-DOC|NEEDS-HUMAN`; report compares observed vs. expected.
- **Verification:** Successful run of `measure.py` against the curated corpus produces a JSON report. The solution doc records the measurement, the verdict, and any fallbacks enacted. Beta-to-stable promotion is gated on this report.

### U12. Test contract + user-facing doc + README update + brainstorm-doc corrections

- **Goal:** Add the skill contract test, write the user-facing doc, update the README, and correct the brainstorm doc's agy assumptions discovered in U2.
- **Requirements:** Existing repo test conventions; existing user-facing-doc convention; brainstorm-doc maintenance.
- **Dependencies:** U1, U2, U6, U7, U8, U9, U10, U11.
- **Files:**
  - `tests/skills/ce-deep-review-contract.test.ts` (new — asserts SKILL.md structural contract)
  - `docs/skills/ce-deep-review.md` (new — user-facing doc; mirror `docs/skills/ce-doc-review.md` shape)
  - `docs/skills/README.md` (modify — add ce-deep-review entry to Document Review category)
  - `plugins/compound-engineering/README.md` (modify — add row to Document Review skill table; update component counts)
  - `docs/brainstorms/2026-05-28-ce-deep-review-requirements.md` (modify — correct R5/R9 to reflect actual agy CLI surface from U2; remove obsolete env-var assumption)
- **Approach:** Contract test asserts presence of structural tokens — sidecar filenames (`.deep-review.md`, `.panel-review.md`), `coverage:` enum values, banner copy patterns, verification tags (CONFIRMED, NOT-FOUND-IN-DOC, NEEDS-HUMAN), inline-routing lines for the consent gate, the AskUserQuestion ToolSearch preload at the top of SKILL.md. Use `.toMatch` for regex tolerance; do not assert exact prose. User-facing doc explains: what the skill is, when to use it (high-stakes plans), how it differs from ce-doc-review (cross-model decorrelation + verification), the onboarding requirement (user-responsibility for OAuth + paid plans + DPA), the sidecar artifacts, the panel-only fallback. README addition uses the existing Document Review row shape. The brainstorm-doc edit corrects R5 (no `--approval-mode plan` for agy; best-effort prompt-side posture) and R9 (no `AV_API_KEY`; OAuth-creds file detection). The `release:validate` will reconcile component counts on the next release-please run.
- **Patterns to follow:** `tests/review-skill-contract.test.ts` (the canonical skill-contract test pattern). `docs/skills/ce-doc-review.md` (user-facing doc shape). `plugins/compound-engineering/README.md` existing table rows.
- **Test scenarios:**
  - Contract test asserts SKILL.md contains `Skill("ce-doc-review", "mode:headless` invocation pattern.
  - Contract test asserts SKILL.md contains the responsibility-acknowledgment requirement.
  - Contract test asserts SKILL.md contains both sidecar filename patterns.
  - Contract test asserts SKILL.md contains the `coverage:` enum values.
  - Contract test asserts the consent-gate inline routing lines exist (regression guard against extracting to a reference).
  - `bun test tests/frontmatter.test.ts` passes on the new skill.
  - `bun test tests/skill-shell-safety.test.ts` passes on the SKILL.md `!` backticks.
  - `bun run release:validate` reports the new skill in counts; no drift errors.
  - User-facing doc renders cleanly; FAQ covers the OAuth/paid-plan/DPA setup.
- **Verification:** All bun tests pass. The user-facing doc explicitly states the OAuth + paid-plan + DPA user-responsibility framing. The brainstorm doc's R5/R9 sections reflect the actual agy CLI surface. The README counts are correct.

---

## Alternative Approaches Considered

- **Replicate ce-doc-review's persona dispatch internally** rather than invoking it as a sub-skill. Rejected: would duplicate ~420 lines of orchestration (synthesis pipeline, decision-primer, R29/R30 suppression, schema enforcement), creating drift risk. Headless invocation inherits the calibrated pipeline.
- **Ship as stable (`ce-deep-review`) immediately** without the beta phase. Rejected: this is a substantial new orchestrator depending on three Pre-v1 Ship Gates and a bidirectional verifier rate measurement that may not pass on first run. The beta-skills-framework pattern (`disable-model-invocation: true` + `[BETA]` prefix) allows skill-creator-based validation before stable promotion.
- **Reimplement gitleaks rules in JS/TypeScript** rather than shelling out to the binary. Rejected: gitleaks rules combine regex + Shannon entropy + stopwords tries; reimplementing is brittle and creates ongoing maintenance cost. Shell out with `gitleaks detect --no-git --report-format json --redact` and require the binary as a v1 dependency.
- **Full N×M parallelism** (all models × all lenses in parallel) for pass 2. Rejected: complicates progress streaming, error attribution, and per-vendor rate-limit handling without a meaningful wall-time win at three arms. Parallel across models + sequential lenses per model is the right shape.
- **Production-grade retry/circuit-breaker** per vendor for pass 2. Rejected: overkill for a 7-minute-timeout, three-arm developer command. Report per-arm outcome in the sidecar header; do not retry. The user can re-run.
- **agy as canonical with gemini removed entirely from arms.py.** This is what we do per Option (a). The alternative was option (c) — ship without gemini/agy and add post-migration. Option (a) wins on parity (lands cross-model fastest, avoids shipping a dead arm), with the 2026-06-15 calendar fallback to (c) as the operational margin.

---

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| agy posture-floor cannot be empirically validated in U2 | High | High — forces fallback to Option (c) ship-without-agy; loses one of three cross-model arms | U2 is the first unit; we learn this early. The 2026-06-15 calendar fallback is the operational margin. If U2 fails, the plan re-scopes via the Phase 0 review gate (see Phased Delivery) and Phase 1's U4 becomes "remove gemini from arms.py" instead of "migrate to agy". |
| grok behavioral smoke test reveals `--permission-mode plan` does not constrain at runtime | Medium | High — grok arm cannot ship without it | U1 is the first unit; we learn early. Fallback: ship without grok in v1 (Option (c) variant for grok); proceed with codex + agy only. |
| Verifier rate measurement (U11) exceeds 5% threshold | Medium | Medium — beta does not promote to stable; users see NEEDS-HUMAN-default or advisory tags | The brainstorm already specified the consequence. The beta stays as beta until rates clear. Users get usable output (with the fallback tags) in the meantime. |
| agy `-p` argument-length limit hit by large plans | Medium | Medium — large plans cannot route through agy | U2 measures this empirically and documents the size cap. Workaround: `--add-dir` workspace constraint + prompt-side "read the file at <abs-path>" directive sidesteps shell-arg limits. |
| Gitleaks not installed on user's machine | High | Low — content preview cannot run | U7 surfaces install instructions in the consent gate; the gate refuses to proceed without gitleaks. This is a one-time setup cost per user; documented in the onboarding doc (U2). |
| User declines responsibility but expects egress to still happen | Low | Low — clear UX defeats this | F4 explicitly handles decline (chat-only panel output, no sidecar). |
| Beta-to-stable promotion never happens (skill stays in `-beta` forever) | Medium | Low — beta works, just doesn't promote | The U11 verifier rate measurement is the gate; if rates clear, U12's promotion checklist runs. If rates persistently miss, the team learns the verifier design needs rework — that's useful information, not a failure mode. |
| Cross-model harness lives in two places (this repo + bundled in the skill) and drifts | Medium | Medium — skill behavior diverges from repo behavior | U8 includes a build-time copy step (or symlink resolution) that bundles the canonical files into the skill on package. Add a test that asserts the bundled copies match the canonical files. |
| Sidecar gets committed to public repos with sensitive plan content | Low (after content-preview gate) | High | The content-preview gate is the primary mitigation. The commit-as-audit decision is the user's call per-repo — the skill writes the file; the user decides whether to commit. Onboarding doc states this explicitly. |
| The new orchestrator skill changes ce-doc-review's invocation contract | Low | Medium — ce-doc-review's headless envelope must remain stable | Add a contract test on the headless envelope (U12) so changes to ce-doc-review's output shape are caught. |

---

## Phased Delivery

This plan is large enough to warrant phased delivery. Each phase is a candidate PR boundary. Phase reviews are non-trivial — explicit gate decisions are required between phases.

**Phase 0 — Validation Gates (U1, U2)**

PR scope: Validation scripts + findings docs + brainstorm-doc corrections. No skill code yet. Lands `scripts/eval/cross_model_review/validation/` + two `docs/solutions/skill-design/` entries + `docs/skills/ce-deep-review-onboarding.md` + brainstorm-doc R5/R9 corrections.

**Phase 0 review gate:** Read both validation findings docs. If grok validation fails → drop grok from v1. If agy validation fails → drop agy from v1, fall back to Option (c). If both fail → ce-deep-review v1 is panel-only-with-codex; reconsider whether the skill is worth shipping.

**Phase 1 — Harness Extension (U3, U4, U5)**

PR scope: arms.py + panel-critique.sh + driver tests. Lands the grok arm, the gemini → agy migration, and the `--models` subset + parallelization extensions.

**Phase 1 review gate:** `bun test tests/cross-model-review-*.test.ts` passes. Live smoke against each arm produces non-empty findings.

**Phase 2 — Skill Implementation (U6, U7, U8, U9, U10)**

PR scope: ce-deep-review-beta skill directory + all references + bundled scripts. Lands the skill code itself.

**Phase 2 review gate:** Manual end-to-end run on a test plan exercises F1 (happy path), F2 (partial), F3 (panel-only), F4 (decline). Frontmatter + ce-prefix + shell-safety tests pass.

**Phase 3 — Validation & Promotion (U11, U12)**

PR scope: verifier rate measurement infrastructure + contract test + user-facing doc + README. Runs the bidirectional rate measurement; if rates clear, prepares the beta-to-stable promotion. If rates miss, lands the documented fallbacks and keeps the skill as beta.

**Phase 3 review gate:** Rate report shows ≤5% each (eligible for promotion) or documents the fallback enacted. Contract test passes. README counts correct. brainstorm-doc updated.

**Calendar fallback trigger (2026-06-15):** If Phase 0 has not completed by 2026-06-15, fall back to Option (c) — ship v1 without agy. Re-scope Phase 1's U4 to "remove gemini from arms.py" and Phase 2's harness invocation to a 2-arm (codex + grok) configuration. The fallback path can complete before the 2026-06-18 HTTP-410 cutoff because it removes the agy dependency entirely.

---

## Dependencies / Prerequisites

- **Upstream tooling:** gitleaks must be installed locally (Homebrew: `brew install gitleaks`). Documented in the onboarding doc.
- **Upstream vendor accounts:** User has a paid Antigravity plan with an acceptable DPA; user has xAI Grok credentials (env var `XAI_API_KEY` or `~/.grok/auth.json`); user has codex installed and authed. User responsibility per Key Decisions.
- **Upstream skill:** `ce-doc-review` must support `mode:headless` (it does, per its current SKILL.md). The headless-envelope shape is the contract we depend on.
- **Upstream harness:** `scripts/eval/cross_model_review/arms.py` + `panel-critique.sh` exist and follow the documented arm-add pattern. They do (U3/U4 modify them).
- **External deadline:** Gemini CLI HTTP-410 cutoff is 2026-06-18. Phase 0 must complete by 2026-06-15 to maintain Option (a); otherwise Option (c) fallback fires.

---

## Key Technical Decisions

- **Beta rollout pattern.** Ship as `ce-deep-review-beta` first with `disable-model-invocation: true` and `[BETA]` description prefix; promote to stable `ce-deep-review` only after U11's bidirectional verifier rate measurement passes. Rationale: this is a substantial new orchestrator dependent on multiple Pre-v1 Ship Gates; the beta-skills-framework pattern allows skill-creator validation before stable promotion (see origin: docs/brainstorms/2026-05-28-ce-deep-review-requirements.md and `docs/solutions/skill-design/beta-skills-framework.md`).

- **Invoke ce-doc-review headless, not replicate.** Pass 1 uses `Skill("ce-doc-review", "mode:headless <plan-path>")` and parses the structured envelope. Rationale: avoids duplicating ~420 lines of synthesis/decision-primer/suppression-rule orchestration; inherits the calibrated pipeline (see origin: brainstorm Dependencies/Assumptions which permits either path; this plan picks invoke).

- **Bundle the cross-model harness under the skill's `scripts/`.** The harness lives in this repo at `scripts/eval/cross_model_review/` but the skill ships externally, so the skill carries its own copy. Rationale: AGENTS.md "Each skill directory is a self-contained unit" rule forbids cross-skill traversal — the skill must reference only files within its own directory. The contract test (U12) asserts the bundled copies match the canonical files to prevent drift.

- **Parallel across models, sequential lenses within each model** for pass 2. Wall-time: ~10–15min for 3-model run vs. ~30–60min sequential. Rationale: collapses wall-time meaningfully while preserving per-(model, lens) progress streaming (R15). N×M full parallelism is rejected as over-complex for three arms (see Alternatives).

- **agy is OAuth-only; user-responsibility for paid plan + DPA.** Detection uses `~/.gemini/oauth_creds.json` non-empty + non-expired (the brainstorm's `AV_API_KEY` env-var assumption is wrong — corrected in U2 + U12). The skill does NOT verify the DPA; the user accepts responsibility for vendor data-handling at the consent gate (see Key Decisions: responsibility acknowledgment).

- **agy posture is best-effort prompt-side, not runtime-guaranteed.** Combine `--sandbox` (FS-only) + `--add-dir` workspace constraint + prompt-side directive ("read ONLY <path>; do not call tools"). Rationale: agy has no `--approval-mode plan` equivalent; this is the best available. Documented explicitly in arms.py and the user-facing doc so the limitation is visible. U2 validates that the best-effort posture actually constrains behavior empirically.

- **grok `--sandbox <profile>` choice deferred to U1 measurement.** Likely `read-only` per research; confirmed empirically. The chosen profile lands in `arms.py` as a constant in U3.

- **gitleaks runs via shell-out, not vendored.** `gitleaks detect --no-git --source <plan> --report-format json --redact`. Required dependency; documented in onboarding (U2).

- **Consent gate UI is numbered-list-in-chat.** AskUserQuestion caps at 4 options; the gate needs 3 models + responsibility acknowledgment + cancel = 5+. Per AGENTS.md "narrow exception for legitimate option overflow," render as numbered list with the "Pick a number or describe what you want." hint. Each option is genuinely required; trimming would hide legitimate choices.

- **Responsibility acknowledgment text** (working draft; copy-refinable): *"I acknowledge that this plan content will be sent to the selected external vendors (codex / agy / grok), and that I have configured each vendor with an appropriate data-handling policy (paid plan + DPA where applicable) per my organization's requirements. I accept responsibility for what is egressed."*

- **Sidecar is commit-as-audit; skill does not modify `.gitignore`.** Round-2 deferred tension resolved per plan-time decision. R12's rotation policy stands (keep last 5); the gitignore offer is dropped.

- **Verifier dispatch is blind to producing model.** Prompt contains plan content + finding text, NOT model identifier. Mitigates in-family bias (Claude-as-verifier favoring Claude-voice findings). The U11 measurement explicitly stresses non-Claude-voice findings.

- **No retry across vendors.** Per-arm outcome (`ok` / `timeout` / `missing` / `auth_fail` / `empty` / `malformed`) is reported in the sidecar header; coverage degrades from `full` to `reduced-confidence` when any arm reports a non-`ok` outcome. The user can re-run if they want a retry.

---

## Success Metrics

- **Adoption signal:** Internal developers run `ce-deep-review-beta` on ≥5 distinct high-stakes plans within 2 weeks of beta landing. (Manual count from sidecar artifacts committed to repos; no telemetry needed for v1.)
- **Decorrelation value:** ≥30% of `ce-deep-review` runs surface at least one verified CONFIRMED cross-model finding that the Claude panel did not raise. (Measured by inspecting "decision-changing union" sections in committed sidecars.)
- **Verifier accuracy:** Both false-CONFIRM rate and false-NOT-FOUND-IN-DOC rate ≤ 5% on the U11 held-out corpus, with ≥20 corpus items and N=3 trials each. (Gate for beta-to-stable promotion.)
- **No silent degradation:** Every reduced-coverage run carries a visible `coverage: reduced-confidence` or `coverage: panel-only` frontmatter + header banner. (Asserted by U12 contract test.)
- **Onboarding cost:** A new developer can run their first `ce-deep-review` within 30 minutes of reading the onboarding doc. (Operational sanity check during Phase 3 review.)

---

## Scope Boundaries

- **Out of scope (carried from origin):**
  - The cross-model evaluation machinery (judge, trials, GT-match, decision-artifact, record-schema). The arms and harness runner are extended; the evaluation pipeline is not invoked by this skill.
  - Per-plan trust-based allow-listing.
  - Cost/token-budget estimation in the consent gate.
  - Headless / non-interactive mode for ce-deep-review v1.
  - Extension to ce-code-review or other artifact types.
  - A new non-Claude judge inside the flow.
- **Out of scope (plan-time additions):**
  - Production-grade retry/circuit-breaker per vendor. Per-arm outcomes report in the sidecar; the user re-runs if they want a retry.
  - Full N×M parallelism for pass 2 (rejected; see Alternatives).
  - Reimplementing gitleaks patterns in JS/TS (rejected; shell out to the binary).
  - Replicating ce-doc-review's persona dispatch internally (rejected; invoke headless).
  - Skill auto-modifying `.gitignore` for sidecars (rejected per plan-time decision).
  - Custom UX work for the consent gate beyond the numbered-list pattern (the AskUserQuestion exception covers this).

### Deferred to Follow-Up Work

- **Stable promotion (`ce-deep-review-beta` → `ce-deep-review`).** Gated on U11 verifier rate measurement clearing thresholds. Follow-up PR runs the beta-promotion-orchestration-contract checklist and removes the `disable-model-invocation` flag.
- **Opt-in-none vs. opt-out-with-content-gate friction tradeoff.** Round-2 Open Question; revisit after the first ~10 beta runs show whether the current opt-in-none default genuinely suppresses usage or works fine.
- **Sidecar `.gitignore` reconsideration.** Plan-time decided commit-as-audit. If post-ship feedback shows committed sidecars cause LLM-output leakage into PRs, revisit. Currently no plans to.
- **Per-vendor retry policy.** Currently no retry. If post-ship telemetry shows transient failures suppress completion rates, add a simple "retry once on timeout" rule.
- **Adoption telemetry baked into the skill.** Currently using manual count from committed sidecars. If post-ship the decorrelation-value metric needs harder data, add structured logging.
- **Cross-platform agent target conversions.** Currently the converter machinery copies skills almost-as-written. If specific targets (Cursor, OpenCode) need adapter logic for the consent-gate numbered-list pattern, address per-target after stable promotion.

---

## Operational / Rollout Notes

- **Branch + PR cadence:** Each phase gets its own PR. Phase 0 must merge before Phase 1 begins.
- **Commit prefixes:** `feat(cross-model-eval): ...` for harness-extension commits in Phase 1 (U3, U4, U5); `feat(ce-deep-review-beta): ...` for skill code in Phase 2 (U6–U10); `feat(ce-deep-review-beta): bidirectional verifier rate measurement` for U11; doc/test commits use the relevant scope.
- **Release-please:** Do not hand-bump versions in any plugin.json or marketplace.json. Per `plugins/compound-engineering/AGENTS.md` versioning rules, release-please owns version fields. Routine PRs do not cut releases.
- **Stale-install cleanup:** ce-deep-review-beta is net-new; no entries needed in `STALE_SKILL_DIRS` (`src/utils/legacy-cleanup.ts`) or `EXTRA_LEGACY_ARTIFACTS_BY_PLUGIN` (`src/data/plugin-legacy-artifacts.ts`). Beta-to-stable promotion will need to add the `-beta` directory to those registries (handled in the promotion PR).
- **Tests:** Run `bun test` after each phase. `bun run release:validate` after the final phase.
- **Skill validation via skill-creator:** Per `plugins/compound-engineering/AGENTS.md` "Validating Agent and Skill Changes," changes to skill prose behavior cannot be tested via in-session typed-agent dispatch (caches at session start). Use the `skill-creator` skill for iteration.
- **Stale/beta sync:** ce-deep-review-beta is greenfield; no stable counterpart exists yet to sync. State this explicitly in the U6 commit message.

---

## Outstanding Questions

### Resolve Before Implementation

- None at planning time. All blockers from the brainstorm phase were resolved. Phase 0 will surface implementation-time discoveries (especially agy posture-floor feasibility, grok sandbox profile choice) — those flow into the Phase 0 review gate, not back to planning.

### Deferred to Implementation

- [Affects U1, U3][Technical] Exact `grok --sandbox <profile>` choice. Measured empirically in U1; landed as a constant in U3. Likely `read-only`; confirmed by smoke.
- [Affects U2, U4][Technical] Exact agy posture flag combination. Measured empirically in U2; landed as a constant in U4. Best-effort prompt-side; documented explicitly.
- [Affects U2, U4][Technical] agy `-p` argument-length limit for large plans. Measured in U2; documented as a size cap. Workaround via `--add-dir` workspace if the limit is hit.
- [Affects U7][Technical] Final responsibility-acknowledgment copy. Working draft above; copy-refine during U7 implementation.
- [Affects U8][Technical] Permission gate strategy for `bash ${CLAUDE_SKILL_DIR}/scripts/panel-critique.sh` invocation. Use narrow `allowed-tools: Bash(bash *panel-critique.sh)` declaration in SKILL.md frontmatter per AGENTS.md pattern.
- [Affects U10][Technical] Group cross-model findings in the sidecar by lens vs. by arm. Plan recommends by-lens (same lens findings cluster together; easier to scan). Confirm during U10 implementation by previewing both shapes.
- [Affects U11][Needs research] Held-out corpus construction methodology. Hand-curate to start (≥20 items); consider augmenting with synthetic confabulations seeded from prior cross-model eval records. Document the corpus build in U11's solution doc.
- [Affects U11][Technical] If the bidirectional rate measurement fails, the brainstorm specifies the fallback. The exact implementation of "all findings default-tag to NEEDS-HUMAN" is a U11 implementation detail (probably a config flag the orchestrator reads).
