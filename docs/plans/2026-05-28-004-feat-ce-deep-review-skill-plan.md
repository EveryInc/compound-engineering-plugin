---
date: 2026-05-28
type: feat
origin: docs/brainstorms/2026-05-28-ce-deep-review-requirements.md
supersedes: docs/plans/2026-05-28-003-feat-ce-deep-review-skill-plan.md
status: active
title: ce-deep-review — residual plan after Phase 0/1 landed + first dogfood run (v4)
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
> 2. **NEW P0 (OD-4) — the turnkey premise is broken under default auto-mode.** The first dogfood
>    run was hard-blocked: Claude Code's auto-mode permission classifier rejected the
>    `panel-critique.sh` dispatch as Data Exfiltration **even after the in-skill consent gate
>    granted consent**. The run only completed because the user ran the command manually via `!`.
>    U5's "turnkey, removes the terminal hop" mechanism does not hold under the default harness
>    posture — the binding friction is the harness egress gate, not the terminal hop. This is the
>    most important finding and gates how (and whether) the rest proceeds. See OD-4.
> 3. **macOS-only agy floor folded into U8** — `arms.py agy_sandbox_prefix()` returns `([], None)`
>    off-darwin, so R5's read-only floor is unenforced for non-macOS teammates; the dispatcher must
>    platform-gate agy off macOS.
> 4. **U1–U6 collapsed into Current State** (done); residual units renumbered RU1–RU6, each mapping
>    to its v3 ancestor.
> 5. **grok decoupled from the dogfood gate** — U1 already ran; grok is DEFERRED pending a version
>    bump that fixes the 0.2.8 headless relay-auth bug, not pending the dogfood proceed-decision.
>
> Unchanged v3 content (Actors, Key Flows F1–F5, full Alternatives, Scope Boundaries) remains valid
> — see v3 for that detail rather than re-reading it here; v4 carries only what moved.

## Summary

`ce-deep-review-beta` orchestrates the 3-pass high-stakes-plan review recipe: `ce-doc-review`
headless (pass 1, Claude panel) → a single consent gate → a bundled cross-model harness (pass 2) →
[Phase 3] per-finding verification → a reconciled sidecar. **The thin slice (pass 1 + consent +
raw unverified records) is shipped and was dogfooded once.** That run revealed that the turnkey
dispatch is blocked by the harness's egress classifier under default auto-mode — so before building
the verification layer (Phases 3–4) the plan must resolve **how** the cross-model dispatch is
allowed to run (OD-4), or the "removes the terminal hop" premise the whole investment rests on does
not hold.

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

**First dogfood run (2026-05-28).** This plan (v3) was reviewed by the skill. Pass 1 (7-persona
Claude panel) + Pass 2 (codex + gemini, 6 lenses, all `ok`, coverage full). Draft sidecar:
`docs/plans/2026-05-28-003-…-skill-plan.md.deep-review-draft.md`. **The dispatch was hard-blocked by
the auto-mode classifier and only ran when the user invoked it via `!`** (see OD-4).

---

## Open Decisions (resolve before Phase 3 build)

### OD-4 — The turnkey dispatch is blocked by the harness egress classifier. **OPEN — load-bearing.**

The dogfood run proved the failure mode: with consent granted at the in-skill gate, the orchestrating
agent's `bash …/panel-critique.sh --models codex,gemini <plan>` call was **denied by Claude Code's
auto-mode permission classifier** as "Data Exfiltration … not cleared by the consent-gate
authorization," regardless of the `allowed-tools: Bash(bash *panel-critique.sh)` declaration. The
run completed only because the user re-issued the command via the `!` prefix (an explicit human
action the classifier permits).

Consequence: the skill's central premise — *remove the terminal hop so the deep review actually gets
run* — does **not** hold under the default harness posture. The user is back to running a bash
command in the terminal; the skill saved the typing, not the hop. OD-1's friction signal is
confounded by this: a non-adopter in the dogfood window may be blocked by the egress gate, not by
the friction the gate was meant to test.

Options (pick before investing in Phases 3–4):
- **(a)** Document the requirement: the skill needs a pre-approved Bash permission rule
  (`Bash(bash *panel-critique.sh)`) in the user's settings, OR the user runs the dispatch via `!`.
  Re-frame the value prop as "one-time permission grant, then turnkey" rather than "turnkey for
  free." Cheapest; honest; but weakens the friction claim.
- **(b)** Investigate whether an explicit user `allow` rule for the exact resolved command bypasses
  the auto-mode *classifier* (distinct from `allowed-tools`, which the run showed is insufficient).
  If a settings `permissions.allow` entry clears it, the onboarding doc ships that rule and the hop
  is genuinely removed after setup. **Test this before deciding.**
- **(c)** Accept the harness boundary and adopt the v3-rejected "emit the exact command for the user
  to run" probe as the *actual* shape — the agent prepares and the human executes. This is the
  honest turnkey ceiling under default auto-mode and makes the human-in-the-egress-loop a feature,
  not a regression (security-lens + gemini-adversarial both argued the human-in-loop boundary was
  undervalued).

This decision also feeds OD-1: the dogfood debrief must now distinguish *three* causes of non-use —
terminal-hop friction, unverified-output distrust, **and the egress-gate block** — or it will
misattribute (b)-style blocks as friction.

### OD-1, OD-2, OD-3 — carried from v3 (unchanged).

Gate-measurement design, thin-slice probe shape, and grok `-p` retention remain as decided in v3.
**Caveat added:** the first dogfood data point (this run) is single-author and was egress-blocked,
so it counts toward OD-1's signal only with the OD-4 confound noted.

---

## Residual Implementation Units (Phases 2–4)

Renumbered RU1–RU6; each maps to its v3 ancestor. grok work (v3 U1/U7) is out of the sequence —
gated on a grok version bump, not the dogfood gate.

### RU1. Resolve OD-4 + harden the dispatch path  *(NEW — from the dogfood run)*
- **Goal:** Decide OD-4 (a/b/c) and make the cross-model dispatch actually runnable as documented.
- **Dependencies:** none (do first — it gates whether Phases 3–4 pay back).
- **Approach:** Test option (b) empirically — add a `permissions.allow` rule for the exact resolved
  `panel-critique.sh` invocation and confirm whether the auto-mode classifier still blocks. Record
  the result. Update `SKILL.md` Phase 3 + `arm-invocation.md` + the onboarding doc with the chosen
  path (permission rule, `!`-handoff, or emit-command). Add a `references` note on the egress-gate
  behavior so future implementers don't assume `allowed-tools` is sufficient.
- **Files:** `SKILL.md` (modify), `references/arm-invocation.md` (modify),
  `docs/skills/ce-deep-review-onboarding.md` (new/modify), contract test (assert the documented path).
- **Verification:** a fresh run reaches Pass 2 dispatch without manual `!` (option b), or the
  documented handoff is exercised (a/c). The dogfood debrief template separates egress-block from
  friction.

### RU2. Migrate gemini→agy in the panel runner + wire agy detection + platform-gate  *(v3 U8 — re-scoped: arms.py agy arm is already done)*
- **Goal:** Make agy the default non-codex arm and enforce its floor only where it exists.
- **Dependencies:** RU1 (a runnable dispatch).
- **Approach:** In `scripts/eval/cross_model_review/panel-critique.sh`, swap `gemini`→`agy` in the
  default model loop (keep gemini selectable until the 2026-06-18 cutoff). Wire agy detection into
  the skill's `env-detect.sh` using the U2 constant (`~/.gemini/oauth_creds.json` + non-empty
  `refresh_token`; do NOT gate on expiry). **Platform-gate:** on non-darwin, `env-detect.sh` reports
  agy `unavailable` and the gate must not offer it (the seatbelt floor is macOS-only;
  `agy_sandbox_prefix()` returns `([], None)` off-mac, so offering agy there violates R5). When agy
  joins the skill dispatch, pass the plan's real repo root for the deny-write floor (`git -C
  <plan-dir> rev-parse --show-toplevel`), NOT arms.py's own location (see `arm-invocation.md`
  Phase-2 TODO). Re-bundle (`bundle-harness.sh`); the drift test must stay green.
- **Files:** `scripts/eval/cross_model_review/panel-critique.sh`, skill `scripts/env-detect.sh`,
  skill `scripts/arms.py` (REPO_DIR plumbing for the installed-skill case), `tests/cross-model-review-driver.test.ts`.
- **Verification:** `env-detect.sh` reports agy on macOS-authed, `unavailable` off-mac; a 1-model
  agy run produces records; deny-write floor blocks a repo write; drift green; gemini still
  selectable pre-cutoff.

### RU3. Full `--models` semantics + parallel-across-models  *(v3 U9 — unchanged; minimal guard already shipped)*
- As v3 U9. Default = all available; fork per-model subshells running six lenses; preserve per-(model,
  lens) progress (R15). Re-bundle; drift green.

### RU4. Verification step — ground each cross-model finding  *(v3 U10 — unchanged)*
- As v3 U10. Per-finding CONFIRMED (inline quote) / NOT-FOUND-IN-DOC / NEEDS-HUMAN, blind to producing
  model, synchronous quote-grep backstop. Replaces the thin-slice `verification: none` state.

### RU5. Reconciliation + sidecar writer — reclaim `.deep-review.md`  *(v3 U11 — unchanged)*
- As v3 U11. Reconciled sidecar, coverage/skill_phase/content_preview frontmatter, banner precedence,
  rotation (keep 5), committed-leak reminder when `content_preview: unavailable`. Do NOT modify
  `.gitignore`.

### RU6. Verifier rate measurement + full contract test + docs + drift-gate cleanup  *(v3 U12 + U13 — re-scoped)*
- v3 U12 (bidirectional verifier rates, agy-voiced corpus + min-sample/synthetic-fallback,
  `calibration_scope`) + U13 (full contract test, finalized docs, README counts, brainstorm
  corrections) **plus** the OD-4 path assertion and the **drift-gate cleanup**: either delete v3's
  phantom "CI step" claim from the rollout notes (the bun test is the gate) or add a real
  `.github/` step running `bundle-harness.sh` + failing on a tree change if a stronger gate is wanted.
- Brainstorm corrections from U2 are confirmed available: agy auth = `~/.gemini/oauth_creds.json` +
  `refresh_token` (not `AV_API_KEY`); grok retention per OD-3.

---

## Risk Analysis (delta from v3)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Turnkey dispatch blocked by harness egress classifier (auto-mode)** | **Confirmed (this run)** | **High** | **OD-4** — test the permission-rule bypass (b); else document the `!`/permission requirement (a) or adopt emit-command (c). The "removes the hop" premise depends on this. |
| agy floor unenforced off macOS | High (any non-mac dev) | High | RU2 platform-gates agy to `unavailable` off-darwin; the gate never offers an unfloored arm. |
| Dogfood signal confounded by the egress block | Medium | Medium | Debrief separates egress-block from friction + unverified-output toil (RU1). |
| Bundled harness drift | Low | Low | Caught by the committed bun equality test. (v3's CI-step claim was phantom — RU6 cleans it up; the test already protects.) |
| grok unavailable for v1 | Confirmed | Low | Dropped per U1; re-test on a version bump via `grok-smoke.sh`. v1 ships codex + agy. |
| Gemini HTTP-410 cutoff 2026-06-18 | High | Medium | RU2 keeps gemini selectable until cutoff; agy is the post-cutoff default. Calendar fallback unchanged. |
| Verifier rate measurement exceeds 5% | Medium | Medium | v3 fallback tags (beta stays beta; usable with NEEDS-HUMAN default). |

Carried-forward v3 risks (consent-gate divergence, env-detect credential leak, committed-sidecar
leak, naming drift) are mitigated by shipped Phase-1 code + tests; see v3 for detail.

---

## Phased Delivery (residual)

- **Phase 0, Phase 1 — DONE** (see Current State).
- **Phase 2a — OD-4 + dispatch hardening (RU1).** PR: decision record + dispatch path + onboarding +
  contract assertion. **Gate: a deep review reaches Pass 2 without a manual `!` (option b), or the
  documented handoff is exercised.** This precedes the dogfood gate's *interpretation* — without it,
  the friction signal is confounded.
- **Phase 2b — Harness extension (RU2, RU3).** PR: gemini→agy swap + env-detect wiring + platform-gate
  + full `--models`/parallelism. Gate: `bun test cross-model-review-*` + drift green; agy live smoke
  on macOS; agy `unavailable` off-mac.
- **Phase 3 — Verification & reconciliation (RU4, RU5).** Gate: manual end-to-end over F1, F2, F3,
  F4, F4-zero, F5; verified sidecar reclaims `.deep-review.md`.
- **Phase 4 — Validation & promotion (RU6).** Gate: verifier rates ≤5% each + adequate agy
  representation; full contract test; README counts; drift-gate note corrected; brainstorm corrected.

**Dogfood gate (OD-1) still applies** between Phase 2a and the Phase 3 build — but it must now be read
through OD-4 (the first data point was egress-blocked). Do not greenlight Phase 3 on a signal that
was actually measuring the egress gate.

---

## Outstanding Questions

### Resolve before Phase 3 build
- **OD-4** — how the cross-model dispatch is permitted to run under the harness (test option b first).

### Deferred to implementation (carried from v3, still open)
- agy `-p` arg-length cap on ≥200 KB plans (moot for stdin path; verify for `--add-dir`).
- RU2 REPO_DIR plumbing for the installed-skill case (plan's repo, not arms.py's location).
- Group cross-model findings by lens vs arm (recommend by-lens).
- U12 corpus construction; agy-voiced sampling + synthetic fallback; min-sample = 5 agy items.
