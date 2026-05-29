---
name: ce-deep-review-beta
description: "[BETA] Deep cross-model review of a high-stakes plan: runs the Claude ce-doc-review panel, then (with consent) fans the plan across non-Claude reviewer CLIs and returns their decorrelated findings. Thin slice — findings are unverified at this stage."
disable-model-invocation: true
argument-hint: "[path/to/plan.md]"
allowed-tools: Bash(bash *env-detect.sh), Bash(bash *gitleaks-scan.sh), Bash(bash *panel-critique.sh)
---

# Deep Review (beta — thin slice)

Run a high-stakes plan through the Claude `ce-doc-review` panel, then — after one consent gate —
fan it across the available non-Claude reviewer CLIs for decorrelated findings the panel may have
missed. This is the **thin slice**: cross-model findings are presented **raw and unverified**
(confabulation-checking is still manual). Verification + a reconciled sidecar arrive in a later
phase; the thin slice exists to test whether removing the terminal-hop friction changes whether the
deep review actually gets run.

This skill is invoked **explicitly** (typed slash command or an explicit skill call). It does not
auto-trigger (`disable-model-invocation: true`).

## Interaction tool preload

The consent gate uses the platform's blocking question tool. In Claude Code, `AskUserQuestion` is a
deferred tool — at the **start of this skill**, call `ToolSearch` with `select:AskUserQuestion` to
load its schema before the gate fires. On Codex/Gemini/Pi this preload is not required (use
`request_user_input` / `ask_user`). If no blocking tool exists, fall back to a numbered list and
wait for the reply — never skip the gate.

## Phase 0: Resolve the plan + detect available arms

1. **Plan path.** Use the argument as the plan path. If absent, ask which plan to review (or find
   the most recent under `docs/plans/`). The plan need not live in this repo.
2. **Detect arms.** Run the env probe via the Bash tool (it emits ONLY a JSON status record and
   never prints credential values):

   ```bash
   bash "${CLAUDE_SKILL_DIR}/scripts/env-detect.sh"
   ```

   Parse `{"codex":"ok|unauthed|missing","gemini":...}`. An arm is **available** only when `ok`
   (installed + an offline auth signal). Thin-slice arms are **codex + gemini** (the arms the
   bundled `panel-critique.sh` runs). grok is deferred (0.2.8 relay-auth bug); agy is validated +
   sandbox-wired but joins the panel runner in a later phase.
3. **Branch on availability:**
   - **≥1 arm available** → continue to Phase 1.
   - **zero arms available** → run Phase 1 (panel) only, then write a **panel-only** sidecar at
     `<plan>.panel-review.md` (`coverage: panel-only`) whose header + chat banner read
     `Panel-only deep review (no cross-model arm)` and name each missing/unauthed CLI with its
     install/auth command. Do not open the consent gate. (Refuses to be quiet, not to run.)

## Phase 1: Claude panel (no egress)

Invoke `ce-doc-review` in headless mode and parse its envelope. Read
`references/pass-1-headless-envelope.md` for the invocation + envelope shape + the parsing rules.

- Claude Code: `Skill("ce-doc-review", "mode:headless <plan-path>")`.
- Capture the panel findings (applied fixes, proposed fixes, decisions, FYI, residual, deferred) —
  these are the **trusted Claude panel findings**, carried into the output untagged.
- **Failure UX (load-bearing):** if the invocation errors, times out, or returns no `Review
  complete` terminal line, STOP and report: *"Pass 1 failed: <reason> — cannot open the consent
  gate without panel results. Re-invoke, or run ce-doc-review directly to diagnose."* **Do not open
  the consent gate or egress anything.**

## Phase 2: Consent gate (single interaction)

The gate fires only after Phase 1 returns successfully. It does three things at once: previews
content sensitivity, takes per-model opt-in, and captures egress responsibility. Read
`references/consent-gate.md` for the **canonical** preview-unavailable notice and acknowledgment
copy (do not paraphrase them).

1. **Content preview.** Run gitleaks via the Bash tool:

   ```bash
   bash "${CLAUDE_SKILL_DIR}/scripts/gitleaks-scan.sh" "<plan-path>"
   ```

   - If it returns hits → render them as `Line N (rule-id): <redacted preview>` in the gate stem.
   - If it signals **unavailable** (gitleaks not installed) → show the canonical preview-unavailable
     notice and **escalate** the acknowledgment (see step 2). Do NOT block. Record
     `content_preview: unavailable` for the sidecar header (else `content_preview: ran`).

2. **Gate question.** Present ONE blocking question whose **stem carries the responsibility
   acknowledgment** (selecting any model confirms it) plus the content preview/notice. **Each
   option label must carry the egress verb and name the vendor** — `Send the plan to gemini
   (Google)`, never bare `gemini (Google)`. This is load-bearing: the harness egress classifier in
   Phase 3 reads the recorded selection (not this stem) and only treats a verb-carrying choice as
   authorization to send the plan out — see `references/consent-gate.md` → "Egress-gate
   legibility":
   - **≥2 arms available:** a multi-select over the available models, default none. Label each
     option with the egress verb + vendor: `Send the plan to codex (OpenAI)` and
     `Send the plan to gemini (Google)`. Submitting with ≥1 selected = consent + acknowledgment for
     that subset. Submitting with none, or choosing the free-text/Other escape to cancel → see
     routing below.
   - **exactly 1 arm available:** a single-select with two options — `Send the plan to <model>
     (<Vendor>)` and `Cancel — panel-only, no egress` (AskUserQuestion needs ≥2 options; a lone
     toggle can't be multi-select).
   - Acknowledgment copy is in `consent-gate.md`; when `content_preview: unavailable`, use the
     **escalated** variant that states no automated scan ran and the user is the sole filter.

3. **Routing (inline — load-bearing):**
   - **≥1 model selected** → consent granted; pass the comma-separated subset to Phase 3.
   - **zero models selected** (multi-select submitted empty) → **re-present the gate once** with
     the note *"Select at least one model to proceed, or Cancel for panel-only output."* If still
     none → treat as Cancel.
   - **Cancel / decline** → output the Claude panel findings to chat as the deliverable; **do NOT**
     write `<plan>.deep-review.md` or `<plan>.deep-review-draft.md` (the deep-review filename is
     reserved). Stop here.

## Phase 3: Cross-model dispatch (egress = consent)

Send the plan to **only the selected models** by shelling out to the bundled harness with the
chosen subset (the `--models` guard ensures a deselected vendor never receives the plan — never
filter records post-hoc). Read `references/arm-invocation.md` for record parsing and the
progress/timeout streaming format, and `references/ship-state-machine.md` for the run-state model.

```bash
bash "${CLAUDE_SKILL_DIR}/scripts/panel-critique.sh" --models <subset> "<plan-path>"
```

- **If the harness blocks this call** (auto-mode egress classifier; note `allowed-tools` is not sufficient
  on its own), do NOT work around it silently. Restate which vendors the user consented
  to and retry once; if still blocked, fall back to the `!`-handoff or the onboarding settings rule.
  See `references/arm-invocation.md` → "If the dispatch is blocked".
- Stream the per-(model, lens) progress lines to chat as they arrive (R15 — no silent multi-minute
  runs). Surface each arm's outcome (`ok` / `timeout` / `missing` / `auth_fail` / `empty` /
  `malformed`).
- After completion, parse `${CMRE_OUT_DIR:-/tmp/cmre-panel}/records/<cli>__<lens>.json` for each
  selected (model, lens) into a structured finding set. Raw records remain on disk for audit.
- If an arm reports a non-`ok` outcome, note it; coverage degrades to `reduced-confidence`.

## Phase 4: Thin-slice output (raw, unverified)

Present the parsed cross-model findings to chat AND write a sidecar at
`<plan-path>.deep-review-draft.md` (NOT `.deep-review.md` — that filename is reserved for verified
output). Frontmatter + banner:

- Frontmatter: `skill_phase: thin-slice`, `verification: none`, `coverage: full|reduced-confidence`,
  `plan`, `models`, `timestamp`, `user` (`git config user.name`), `content_preview: ran|unavailable`.
- Prominent banner at the top: **"Cross-model findings below are UNVERIFIED — confabulation-checking
  is still manual at this stage (thin slice)."**
- Include the Claude panel findings (untagged, trusted) and the raw cross-model findings grouped by
  lens. No verification tags yet — those arrive when the verification phase lands.

Then stream a short summary to chat (which arms ran, finding counts, the sidecar path, and that the
output is unverified).

> **Scope (thin slice):** this beta covers the friction test only — pass 1 + consent + raw
> cross-model findings. Per-finding verification (CONFIRMED / NOT-FOUND-IN-DOC / NEEDS-HUMAN) and
> the reconciled `<plan>.deep-review.md` sidecar are added in a later phase; until then the draft
> sidecar is explicitly unverified.
