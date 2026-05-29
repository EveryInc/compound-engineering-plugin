---
date: 2026-05-28
type: feat
origin: docs/brainstorms/2026-05-28-ce-deep-review-requirements.md
supersedes: docs/plans/2026-05-28-003-feat-ce-deep-review-skill-plan.md
status: active
title: ce-deep-review — residual plan after Phase 0/1 landed; OD-4 resolved (dogfood #2) (v4)
---

# feat: ce-deep-review skill (v4 — reconciled to committed reality)

> **v4 note.** Supersedes `2026-05-28-003-...-skill-plan.md`. v3 was written as a forward-looking
> 13-unit/5-phase plan, but **Phase 0 (U1, U2) and Phase 1 (U3–U6) have since landed on this
> branch** (commits `6072ec54`, `e1226eda`, `006b7090`, `aa558334`). v3 still describes that work
> as pending, so an implementer reading it would re-derive settled decisions or build a divergent
> second copy. This v4 reconciles the plan to the committed state, records the **first real dogfood
> run** (this document was reviewed *by* the skill on 2026-05-28), and folds in the findings that
> run surfaced. It is a **residual** plan: only Phases 2–4 remain, and one of them is now in
> question.
>
> **What changed from v3:**
> 1. **`## Current State` added** — what is actually committed, with the as-built facts that differ
>    from the v3 unit specs (env-detect detects codex+gemini, not grok/agy/stub; arms.py already has
>    the agy arm; the drift *test* exists but the CI *step* does not).
> 2. **OD-4 (egress classifier) — RAISED in dogfood #1, RESOLVED in dogfood #2.** Dogfood #1 was
>    hard-blocked: Claude Code's auto-mode classifier rejected the `panel-critique.sh` dispatch as
>    Data Exfiltration because the in-skill gate's bare option labels were not legible as egress
>    authorization; it only ran via `!`. The fix — verb-carrying consent labels (`Send the plan to
>    <vendor>`) — shipped in `766c730c`. **Dogfood #2 (2026-05-29, on this v4 doc) confirmed it: the
>    in-skill gate cleared the classifier with NO `!`-handoff.** The turnkey premise holds for the
>    interactive path. See OD-4 for the residual caveats (single data point; headless/settings path
>    still untested).
> 3. **macOS-only agy floor folded into U8** — `arms.py agy_sandbox_prefix()` returns `([], None)`
>    off-darwin, so R5's read-only floor is unenforced for non-macOS teammates; the dispatcher must
>    platform-gate agy off macOS.
> 4. **U1–U6 collapsed into Current State** (done); residual units renumbered RU1–RU6, each mapping
>    to its v3 ancestor.
> 5. **grok decoupled from the dogfood gate** — U1 already ran; grok is DEFERRED pending a version
>    bump that fixes the 0.2.8 headless relay-auth bug, not pending the dogfood proceed-decision.
>
> Unchanged v3 content (Actors, Key Flows F1–F5, full Alternatives, Scope Boundaries) remains valid
> — see v3 for that detail rather than re-reading it here; v4 carries only what moved. **Naming
> caveat:** v3 refers to the skill as `ce-deep-review`; the committed artifact is
> `ce-deep-review-beta` — substitute it throughout when reading v3's flows.

## Summary

`ce-deep-review-beta` orchestrates the 3-pass high-stakes-plan review recipe: `ce-doc-review`
headless (pass 1, Claude panel) → a single consent gate → a bundled cross-model harness (pass 2) →
[Phase 3] per-finding verification → a reconciled sidecar. **The thin slice (pass 1 + consent +
raw unverified records) is shipped and has been dogfooded twice.** Dogfood #1 surfaced an egress-
classifier block (OD-4); the legibility fix shipped and **dogfood #2 (2026-05-29) confirmed the
in-skill gate now clears the classifier with no `!`-handoff** — the "removes the terminal hop"
premise holds for the interactive path. Residual: the durable `permissions.allow`/headless path is
still untested, and the verification layer (Phases 3–4) remains to build.

---

## Current State (committed on this branch as of 2026-05-28)

**Phase 0 — Validation (DONE).**
- **U1 grok posture** (`docs/solutions/skill-design/2026-05-28-grok-arm-posture-validation.md`):
  grok **DEFERRED from v1**. grok 0.2.8's CLI surface + `read-only` seatbelt profile are ideal, but
  headless `-p` fails on a worker/relay-auth bug (`AuthorizationRequired`) that `grok login` /
  `--reauth` do not clear. Re-test on a version bump via `validation/grok-smoke.sh`. Vendor feedback
  filed.
- **U2 agy posture** (`docs/solutions/skill-design/2026-05-28-agy-arm-posture-validation.md`): agy
  **1.0.3 is viable** (clean JSON findings; the 1.0.2 empty-output blocker is gone). agy has **no
  flag** that delivers R5's read-only floor (`--sandbox` only restricts terminal exec; FS read+write
  tools are live; no `--disable-web-search`). Floor enforced at the **OS layer** via a macOS seatbelt
  **deny-write denylist** (`validation/agy-readonly.sb.tmpl`); a deny-all-write or any deny-read
  profile **hangs agy**, so reads are NOT denied → secret-read-exfil is a documented residual for
  untrusted docs (out of v1 scope). **Auth = OAuth at `~/.gemini/oauth_creds.json` + non-empty
  `refresh_token`; do NOT gate on `expiry_date` (agy auto-refreshes).** Vendor feedback filed.

**Phase 1 — Thin slice (DONE).** `plugins/compound-engineering/skills/ce-deep-review-beta/`:
- `SKILL.md`; references `consent-gate.md`, `arm-invocation.md`, `pass-1-headless-envelope.md`,
  `ship-state-machine.md` (verification-protocol.md / reconciliation.md correctly absent — Phase 3).
- `scripts/`: `env-detect.sh`, `gitleaks-scan.sh`, `panel-critique.sh` (with the `--models` guard),
  `arms.py`, `bundle-harness.sh`, `validation/agy-readonly.sb.tmpl`.
- Tests: `tests/skills/ce-deep-review-beta-bundle-drift.test.ts` (normalized equality vs canonical),
  `…-contract.test.ts`. Discoverability: rows in `plugins/compound-engineering/README.md` +
  `docs/skills/README.md`, user doc `docs/skills/ce-deep-review.md`.

**As-built facts that differ from the v3 unit specs (v3 is wrong here; the code is right):**
- `env-detect.sh` detects **codex + gemini only** (the thin-slice arm set). It does **not** detect
  grok (deferred) or agy (joins in RU2/U8) and carries **no agy TODO stub**. v3 U3's "grok + agy +
  stub" spec and its `~/.grok/auth.json` fixture test do not match and should be discarded.
- `arms.py` **already implements the agy arm end-to-end** (`AGY_INSTRUCTION`, the `agy` branch of
  `build_invocation`, `agy_sandbox_prefix()` seatbelt wrapper, `agy` in argparse choices). v3 U8's
  "add agy to arms.py" is **done**; only the panel-loop swap + env-detect wiring + platform-gate
  remain (RU2).
- The bundled `panel-critique.sh` **already has the `--models` subset guard** (filters arms before
  the run). v3 U5's "land a minimal `--models` guard" is **done**; the deferred "guard vs
  arms.py-per-cell" question is resolved (guard chosen).
- **Drift is caught by the bun equality test** (`…-bundle-drift.test.ts`), which fails if the
  bundle ≠ canonical. The separate **CI step** v3 described ("CI runs `bundle-harness.sh` and fails
  on a working-tree change") was **never added** — there is no `.github/` workflow referencing it.
  The bun test makes that CI step largely redundant (drift → red `bun test`), but v3's rollout note
  and risk-table mitigation overstate it. **Correction, not new work:** treat the bun test as the
  drift gate; drop the phantom CI-step claim (or add the step if a stronger gate is wanted — RU6).

**Dogfood run #1 (2026-05-28).** This plan's predecessor (v3) was reviewed by the skill. Pass 1
(7-persona Claude panel) + Pass 2 (codex + gemini, 6 lenses, all `ok`, coverage full). Draft sidecar:
`docs/plans/2026-05-28-003-…-skill-plan.md.deep-review-draft.md`. **The dispatch was hard-blocked by
the auto-mode classifier and only ran when the user invoked it via `!`** (see OD-4).

**Dogfood run #2 (2026-05-29).** This v4 plan was reviewed by the skill in a fresh session after the
`766c730c` legibility fix. Pass 1 (6-persona panel) + Pass 2 (codex + gemini, 6 lenses, all `ok`,
coverage full). Draft sidecar: `docs/plans/2026-05-28-004-…-skill-plan.md.deep-review-draft.md`.
**The dispatch cleared the auto-mode classifier with NO `!`-handoff** — first end-to-end in-skill
confirmation of the OD-4 fix. The panel's headline: this plan was itself stale (OD-4/RU1 written as
open though `766c730c` had already shipped them); this v4 revision folds that in.

---

## Open Decisions (resolve before Phase 3 build)

### OD-4 — Egress-classifier block. **RESOLVED (dogfood #2, 2026-05-29).**

Dogfood #1 proved the failure mode: with consent granted at the in-skill gate, the orchestrating
agent's `bash …/panel-critique.sh --models codex,gemini <plan>` call was **denied by Claude Code's
auto-mode permission classifier** as "Data Exfiltration … not cleared by the consent-gate
authorization," regardless of the `allowed-tools: Bash(bash *panel-critique.sh)` declaration. That
run completed only because the user re-issued the command via the `!` prefix (an explicit human
action the classifier permits).

**Root cause (dogfood #1):** the in-skill gate's bare option labels (`codex (OpenAI)`) returned to
the classifier as a model *selection*, not as authorization to egress — so the classifier saw no
in-conversation consent to send plan content out. **Fix (`766c730c`):** option labels now carry the
egress verb + vendor (`Send the plan to codex (OpenAI)`), making the recorded consent legible.
**Dogfood #2 confirmed it:** the in-skill gate cleared the classifier and ran Pass 2 (codex+gemini,
12/12 cells `ok`) with no `!`-handoff. The "remove the terminal hop" premise holds for the
interactive path.

Chosen path (the b-legible mechanism, shipped in `766c730c`): make the in-conversation consent
legible to the classifier via verb-carrying labels. The v3 options (a) `!`/permission-rule and (c)
emit-command survive only as the documented fallback ladder when the gate is blocked.

Residual sub-questions (do NOT block Phases 3–4):
- **Headless/unattended path untested.** Dogfood #2 confirmed the *interactive* gate only. Whether a
  durable `permissions.allow` rule clears the classifier for headless runs (no interactive consent
  turn) is still open — onboarding flags that rule as UNTESTED for headless.
- **Single data point.** The mechanism (verb-carrying labels vs this session's permission posture)
  was not fully isolated; a second independent fresh-session run would harden the conclusion.
- **Defense-in-depth tradeoff (security-lens).** If the headless `permissions.allow` path is adopted
  it is session-permanent, making the in-skill consent gate the *sole* egress boundary — the
  onboarding rule must require the gate stay non-suppressible.

OD-1 impact: with the egress block resolved on the interactive path, the dogfood debrief's three-way
attribution (terminal-hop friction / unverified-output distrust / egress-gate block) no longer has a
live egress-block confound there — but the debrief should still record egress-block as a possible
cause for headless users until that path is tested.

### OD-1, OD-2, OD-3 — carried from v3 (unchanged).

Gate-measurement design, thin-slice probe shape, and grok `-p` retention remain as decided in v3.
**Caveat:** the dogfood data is single-author and n=2 — dogfood #1 was egress-blocked (now
resolved), dogfood #2 cleared. OD-1's friction signal still needs ≥2 distinct devs and a clean run
before it counts, but the egress-block confound is removed for the interactive path.

---

## Residual Implementation Units (Phases 2–4)

Renumbered RU1–RU6; each maps to its v3 ancestor. grok work (v3 U1/U7) is out of the sequence —
gated on a grok version bump, not the dogfood gate.

### RU1. Resolve OD-4 + harden the dispatch path  *(DONE — `766c730c`; gate met by dogfood #2)*
- **Goal:** Make the cross-model dispatch runnable as documented under default auto-mode. ✔
- **What landed (`766c730c`):** verb-carrying consent labels (`Send the plan to <vendor>`) + an
  "Egress-gate legibility" section in `consent-gate.md`; the "If the dispatch is blocked" fallback
  ladder in `SKILL.md` Phase 3 + `arm-invocation.md`; the onboarding doc's "Egress permission"
  section (headless `permissions.allow` flagged UNTESTED); the contract-test assertions; decision
  record `docs/solutions/skill-design/2026-05-28-od4-egress-classifier-consent-scope.md`.
- **Verification:** ✔ **met by dogfood #2 (2026-05-29)** — a fresh-session `/ce-deep-review-beta`
  reached Pass 2 (codex + gemini, 12/12 cells `ok`) with no manual `!`.
- **Residual (small, non-blocking):** confirm the durable `permissions.allow`/headless path clears
  the classifier for unattended runs; keep the dogfood debrief logging egress-block for the headless
  case.

### RU2. Migrate gemini→agy in the panel runner + wire agy detection + platform-gate  *(DONE 2026-05-29)*
- **Goal:** Make agy the default non-codex arm and enforce its floor only where it exists. ✔
- **Status (DONE):** Arm set is now **codex + agy**. gemini was initially retained as a selectable
  fallback, then **fully removed from the skill** (decision 2026-05-29 — it 410s on 2026-06-18, so
  shipping it as a fallback that dies in June added no durable value; the shared `arms.py` gemini
  arm stays for the cross-model eval). Landed: `panel-critique.sh` default + `CMRE_REPO_DIR` export;
  `arms.py` `_repo_root()` honors `CMRE_REPO_DIR` + off-darwin/empty-prefix agy refusal;
  `env-detect.sh` agy detection + macOS platform-gate (`unavailable` off-darwin); SKILL.md +
  consent-gate.md + arm-invocation.md (agy in the gate as `Send the plan to agy (Antigravity)`);
  user-doc arm table; re-bundled (drift green); new `tests/skills/ce-deep-review-beta-arms-ru2.test.ts`.
- **Dependencies:** RU1 (a runnable dispatch). ✔
- **Approach:** In `scripts/eval/cross_model_review/panel-critique.sh`, swap `gemini`→`agy` in the
  default model loop (keep gemini selectable until the 2026-06-18 cutoff). Wire agy detection into
  the skill's `env-detect.sh` using the U2 constant (`~/.gemini/oauth_creds.json` + non-empty
  `refresh_token`; do NOT gate on expiry). **Platform-gate:** on non-darwin, `env-detect.sh` reports
  agy `unavailable` and the gate must not offer it (the seatbelt floor is macOS-only;
  `agy_sandbox_prefix()` returns `([], None)` off-mac, so offering agy there violates R5). When agy
  joins the skill dispatch, pass the plan's real repo root for the deny-write floor (`git -C
  <plan-dir> rev-parse --show-toplevel`), NOT arms.py's own location (see `arm-invocation.md`
  Phase-2 TODO). **Defense-in-depth (security panel):** also hard-guard `arms.py` itself to refuse
  the `agy` arm when `sys.platform != "darwin"` (raise, don't silently return no sandbox), so a
  direct `arms.py run-arm … agy` invocation can't bypass the env-detect gate and run unfloored.
  Re-bundle (`bundle-harness.sh`); the drift test must stay green.
- **Files:** `scripts/eval/cross_model_review/{panel-critique.sh,arms.py}` (canonical, re-bundled),
  skill `scripts/env-detect.sh`, `SKILL.md` + `references/{consent-gate,arm-invocation}.md`,
  `docs/skills/ce-deep-review.md`, `tests/skills/ce-deep-review-beta-arms-ru2.test.ts` (new).
  (v3's `tests/cross-model-review-driver.test.ts` was the wrong target — that test covers the eval
  spine, not panel-critique/arms.py.)
- **Verification (✔ all passed 2026-05-29):** `env-detect.sh` reports agy `ok` on macOS-authed,
  `unavailable` on simulated Linux; a live 1-model agy run produced records for all 6 lenses via the
  full skill path; `agy-smoke.sh` floor PASS (repo write blocked) + viable under the seatbelt; the
  arms.py off-mac guard refuses unfloored agy; drift green; full `bun test` 1427 pass; gemini fully
  removed from the skill (env-detect emits codex+agy only; gate/SKILL/docs no longer offer it; the
  eval's gemini arm + tests remain green).

### RU3. Full `--models` semantics + parallel-across-models  *(DONE 2026-05-29)*
- **Status (DONE):** `panel-critique.sh` now forks **one background subshell per model** (each runs
  the six lenses sequentially) and waits on all — parallel across models, bounding concurrency to
  one in-flight request per vendor (the rate-limit/resource mitigation the feasibility lens flagged).
  Per-(model, lens) progress lines stream as each cell completes (R15); they interleave, which is
  fine (each is self-labeled; records key on `${cli}__${lens}.json` so parallel writers never
  collide). **`--models` semantics defined:** default = all available (codex + agy); unavailable /
  off-platform arms **warn-SKIP per cell, never fatal** (missing binary, or agy off-macOS) — the
  rest still run. Re-bundled; drift green.
- **Verification (✔ 2026-05-29):** live `--models codex,agy` run produced all 12 records with
  interleaved progress (proves concurrency); `--models bogusA,bogusB` → exit 0, SKIP lines, no
  records; `--models agy` under a Linux `uname` stub → agy SKIP, no record; 3 new RU3 tests in
  `tests/skills/ce-deep-review-beta-arms-ru2.test.ts`; full `bun test` 1430 pass.

### RU4. Verification step — ground each cross-model finding  *(DONE 2026-05-29)*
- **Status (DONE):** `scripts/verify-findings.py` (skill-only — not bundled; verification is
  skill-specific, not eval-shared) assigns each cross-model finding one verdict: **CONFIRMED** (a
  substantial verbatim quote that exists in the plan), **NOT-FOUND-IN-DOC** (a claimed quote that is
  absent), **NEEDS-HUMAN** (no substantial quote to check). Pure function of (finding text, doc) →
  **blind to the producing model** (the verdict never reads the model label; `verify-records` uses
  it only to label output rows). **Scope decision:** v1 is the deterministic quote-grep backstop as
  the *sole authoritative gate* — no LLM verifier (it would re-introduce the verifier-contamination
  failure mode the panel flagged); a blinded model triage of NEEDS-HUMAN is a possible later add.
  Replaces the thin-slice `verification: none` → `verification: quote-grep-backstop`. Protocol:
  `references/verification-protocol.md`; SKILL.md Phase 3.5 added.
- **Verification (✔ 2026-05-29):** verify-one CONFIRMED/NOT-FOUND/NEEDS-HUMAN cases pass; lone
  identifier quotes don't trivially confirm; smart-quote/whitespace normalization avoids false
  NOT-FOUND; verify-records is model-blind (same text → same verdict under different model labels)
  and tallies counts; 7 new tests in `tests/skills/ce-deep-review-beta-verify.test.ts` + a contract
  test; full `bun test` 1438 pass.

### RU5. Reconciliation + sidecar writer — reclaim `.deep-review.md`  *(DONE 2026-05-29)*
- **Status (DONE):** The skill now writes the **verified `<plan>.deep-review.md`** (the reserved
  name), replacing the thin-slice draft as the terminal output. `scripts/reconcile.py` (skill-only)
  provides two deterministic helpers: `rotate` (rename an existing verified sidecar to
  `.deep-review.<ISO>.md`, keep the **5 newest**, prune older — data-loss-safe: the glob matches
  rotations only, never the base or the `-draft` sidecar, which addresses the feasibility lens's
  rotation data-loss flag) and `render-cross-model` (by-lens, verdict-tagged Markdown with the
  grounding quote on CONFIRMED). Frontmatter `skill_phase: verified` + `verification:
  quote-grep-backstop` + verdict counts + coverage; **banner precedence** = coverage-only (the
  UNVERIFIED banner is gone) with a NEEDS-HUMAN triage note; **decision-changing union** section;
  existing `.deep-review-draft.md` left in place; committed-leak reminder when `content_preview:
  unavailable`; `.gitignore` untouched (still an open decision). Protocol:
  `references/reconciliation.md`; SKILL.md Phase 4 restructured.
- **Verification (✔ 2026-05-29):** rotate keeps the 5 newest by ISO infix, prunes older, never
  touches base/draft, refuses a non-`.deep-review.md` path; render-cross-model groups by lens
  (canonical order) + orders verdicts + shows grounding quotes; 4 new tests in
  `tests/skills/ce-deep-review-beta-reconcile.test.ts` + contract test updated; full `bun test` 1442
  pass.

### RU6. Verifier rate measurement + full contract test + docs + drift-gate cleanup  *(v3 U12 + U13 — re-scoped)*
- v3 U12 (bidirectional verifier rates, agy-voiced corpus + min-sample/synthetic-fallback,
  `calibration_scope`) + U13 (full contract test, finalized docs, README counts, brainstorm
  corrections) **plus** the OD-4 path assertion and the **drift-gate cleanup**: either delete v3's
  phantom "CI step" claim from the rollout notes (the bun test is the gate) or add a real
  `.github/` step running `bundle-harness.sh` + failing on a tree change if a stronger gate is wanted.
- Brainstorm corrections from U2 are confirmed available: agy auth = `~/.gemini/oauth_creds.json` +
  `refresh_token` (not `AV_API_KEY`); grok retention per OD-3.
- **Split recommendation (scope panel):** RU6 bundles items with different prerequisites — the
  doc-only cleanup (drift-gate note, brainstorm corrections, OD-4 path assertion) can ship right
  after RU2, while verifier-rate measurement + final docs gate on RU4 runtime data. Treat as **RU6a**
  (doc cleanup, no RU4 dep) and **RU6b** (verifier rates + full contract test + final docs).

---

## Risk Analysis (delta from v3)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Turnkey dispatch blocked by harness egress classifier (auto-mode) | Resolved (dogfood #2) | High | OD-4 RESOLVED — verb-carrying consent labels (`766c730c`) make egress legible to the classifier; dogfood #2 cleared with no `!`. Residual: headless/`permissions.allow` path untested. |
| agy floor unenforced off macOS | High (any non-mac dev) | High | RU2 platform-gates agy to `unavailable` off-darwin; the gate never offers an unfloored arm. |
| Dogfood signal confounded by the egress block | Low (interactive) | Medium | Egress block resolved (dogfood #2); debrief still separates friction from unverified-output toil (RU1). Confound persists only for headless until that path is tested. |
| Bundled harness drift | Low | Low | Caught by the committed bun equality test. (v3's CI-step claim was phantom — RU6 cleans it up; the test already protects.) |
| grok unavailable for v1 | Confirmed | Low | Dropped per U1; re-test on a version bump via `grok-smoke.sh`. v1 ships **codex + agy** (gemini removed from the skill 2026-05-29). |
| Gemini HTTP-410 cutoff 2026-06-18 | Resolved (skill) | Medium | gemini removed from the skill ahead of the cutoff (RU2 + 2026-05-29 removal); agy is the sole non-codex skill arm. The eval still references gemini and will need its own handling at the cutoff. |
| Verifier rate measurement exceeds 5% | Medium | Medium | v3 fallback tags (beta stays beta; usable with NEEDS-HUMAN default). |

Carried-forward v3 risks (consent-gate divergence, env-detect credential leak, committed-sidecar
leak, naming drift) are mitigated by shipped Phase-1 code + tests; see v3 for detail.

---

## Phased Delivery (residual)

- **Phase 0, Phase 1 — DONE** (see Current State).
- **Phase 2a — OD-4 + dispatch hardening (RU1). DONE** (`766c730c`). **Gate met by dogfood #2:** a
  fresh-session deep review reached Pass 2 with no manual `!`. Residual: confirm the
  headless/`permissions.allow` path.
- **Phase 2b — Harness extension (RU2, RU3).** **RU2 DONE 2026-05-29** (gemini→agy default swap +
  env-detect wiring + macOS platform-gate + off-mac arms.py guard + REPO_DIR plumbing; gemini then
  fully removed from the skill — eval arm retained; agy live smoke on macOS PASS; agy `unavailable`
  off-mac; drift green). **RU3 DONE 2026-05-29** (parallel-across-models — one subshell per model;
  `--models` semantics: default all-available, unavailable arms warn-SKIP not fatal; R15 progress
  preserved). **Phase 2b complete.**
- **Phase 3 — Verification & reconciliation (RU4, RU5). COMPLETE 2026-05-29.** RU4 = deterministic
  quote-grep backstop (CONFIRMED / NOT-FOUND-IN-DOC / NEEDS-HUMAN; model-blind; authoritative — no
  LLM verifier in v1). RU5 = reconciliation + the verified `.deep-review.md` sidecar (rotation
  keep-5; by-lens verdict-tagged render; decision-changing union; banner precedence). Outstanding:
  the **manual end-to-end run** over F1, F2, F3, F4, F4-zero, F5 as a final acceptance check (a real
  human dogfood, distinct from the unit tests) before promotion.
- **Phase 4 — Validation & promotion (RU6).** Gate: verifier rates ≤5% each + adequate agy
  representation; full contract test; README counts; drift-gate note corrected; brainstorm corrected.

**Dogfood gate (OD-1) still applies** between Phase 2a and the Phase 3 build. With OD-4 resolved on
the interactive path, the signal is no longer confounded by the egress block there — but it remains
single-author (n=2) and needs ≥2 distinct devs plus a clean adoption signal before greenlighting
Phase 3.

---

## Outstanding Questions

### Resolve before Phase 3 build
- **OD-4 — RESOLVED** (dogfood #2): the legible in-skill consent gate clears the classifier on the
  interactive path. Open sub-question: does a durable `permissions.allow` rule clear it for
  headless/unattended runs?

### Deferred to implementation (carried from v3, still open)
- agy `-p` arg-length cap on ≥200 KB plans (moot for stdin path; verify for `--add-dir`).
- RU2 REPO_DIR plumbing for the installed-skill case (plan's repo, not arms.py's location).
- Group cross-model findings by lens vs arm (recommend by-lens).
- U12 corpus construction; agy-voiced sampling + synthetic fallback; min-sample = 5 agy items.
- `.gitignore` for sidecars (RU5 currently says "DO NOT modify `.gitignore`"): the security panel
  flagged accidental-commit risk for untracked `*.deep-review-draft.md`. Decide: ignore the draft
  vs. intentional sidecar-sharing.
