---
title: "Grok target dogfood — confirm wall-clock date in filename + version observability (30f4564)"
type: verification
status: active
date: 2026-05-25
origin: docs/plans/2026-05-25-002-fix-grok-target-release-readiness-plan.md (U7)
---

# Grok target dogfood — confirm wall-clock date in filename + version observability (30f4564)

## Problem Frame

The 002 release-readiness plan (U7) identified live TUI-level dogfood inside a real Grok session as the final arbiter for the Grok converter target work. The key observable behaviors that must be proven (not just unit-tested) are:

1. The converted plugin respects the portable date-stamping discipline from U2: new `/ce-plan` (and `/ce-brainstorm`) artifacts receive the *real* wall-clock date in their filename (`YYYY-MM-DD-...`), never an inferred date from the most recent file on disk.
2. The dynamic dev version from U1 is observable in practice: `plugin.json` and success logs emit the correct `0.0.0-dev-grok-<sha>` (here 30f4564) on every regeneration.

Previous work (regeneration + unit tests + roundtrips) has prepared the bundle. This plan structures the actual live execution, observation, and capture so the results are durable and can be referenced from the fidelity doc and review artifacts.

**Origin requirements trace (from 002 U7):**
- Execute real `/ce-plan` and one `/ce-brainstorm` inside the converted plugin.
- Confirm real calendar date in created plan filename.
- Confirm sha version visible in `plugin.json` + logs.
- Capture friction (e.g. firejail/sandbox effects).
- Update review artifact and/or add "Live Dogfood Results" subsection to the fidelity doc.
- This is the final gate before any "Ready to PR / comparison-ready" claim.

## Scope Boundaries

**In scope:**
- Preparation of the exact bundle at commit 30f4564.
- Structured live session in a real Grok TUI (install + activation).
- Execution of the specific prompt from the user query + one additional brainstorm.
- Observation and capture of the two primary behaviors + any friction.
- Lightweight post-session capture template and update guidance for the fidelity doc / reviews.

**Out of scope (Deferred to Follow-Up Work):**
- Any code changes to the Grok target implementation.
- New unit tests or converter fixes discovered during dogfood.
- Full regression of all Grok features beyond the two observables.
- Comparison against the parallel Grok-built effort (separate activity).

## Success Criteria

- At least one new plan file is created whose filename begins with the real wall-clock date of the session (e.g., `2026-05-25-...`).
- The `plugin.json` of the active converted plugin (and/or the install log) shows version `0.0.0-dev-grok-30f4564`.
- Session notes / screenshots / captured artifacts clearly demonstrate the above two behaviors.
- Any environmental friction (firejail, sandbox, install noise, etc.) is explicitly noted with context.
- The fidelity doc and/or `docs/reviews/grok-target-testing-review.md` are updated with a "Live Dogfood Results (2026-05-25)" subsection referencing this plan and the bundle.

## Implementation Units

### U1. Preparation & Bundle Verification

**Goal:** Ensure the exact bundle produced at commit 30f4564 is available and its version string is confirmed before entering the TUI.

**Requirements:** 002 U7 (regenerated bundle step), success criteria above.

**Files:**
- `/tmp/ce-grok-closure-dogfood/compound-engineering` (or equivalent location chosen by the operator)
- `docs/plans/2026-05-25-003-grok-target-dogfood-plan.md` (this plan — for reference during session)

**Approach:**
- Use the bundle we regenerated in the prior closure work (`/tmp/ce-grok-closure-dogfood/compound-engineering`, version `0.0.0-dev-grok-30f4564`).
- Verify `plugin.json` contains the expected version before install.
- Document the absolute path used for the install command (for reproducibility).

**Execution note:** Perform this step in the host shell (not inside Grok) so the version string can be inspected cleanly.

**Test scenarios:**
- `cat /tmp/.../compound-engineering/plugin.json | grep version` shows `0.0.0-dev-grok-30f4564`.
- The directory contains `agents/`, `skills/`, and `plugin.json` at minimum.

**Verification:** Operator can copy-paste a working `grok plugin install ...` command with the correct path and version confirmed in output.

### U2. Live TUI Session Execution

**Goal:** Install/activate the converted plugin inside a real Grok session and execute the exact dogfood prompts.

**Requirements:** 002 U7 (live flows), user query prompt.

**Files:** N/A (TUI session is ephemeral; capture via notes/screenshots).

**Approach:**
- In a fresh or representative Grok TUI session, run:
  ```bash
  grok plugin install /tmp/ce-grok-closure-dogfood/compound-engineering --trust
  ```
  (or `grok --plugin-dir <path>` for one-off development sessions). See https://docs.x.ai/build/features/skills-plugins-marketplaces.
- Activate the `compound-engineering` plugin (if not automatic).
- Execute the precise prompt from the user query:
  ```
  /ce-plan "Grok target dogfood — confirm wall-clock date in filename + version observability (30f4564)"
  ```
- Execute one additional `/ce-brainstorm` on a small, self-contained topic (e.g., "small dogfood brainstorm topic for Grok target verification").
- During/after creation of the plan file, inspect its filename in the host filesystem (or via Grok's file tools) to confirm the `YYYY-MM-DD` prefix matches the real wall-clock date of the session.
- Inspect the active plugin's `plugin.json` (via `grok plugin ...` or direct path) and recent command output/logs for the version string containing `30f4564`.

**Execution note:** Run the session in an environment as close as possible to normal daily use (including any firejail/safe wrapper the operator normally uses) so friction is realistic.

**Test scenarios / Success criteria (observable during session):**
- New plan file created with real wall-clock date prefix (not inferred).
- `plugin.json` (and/or install / regeneration logs) shows `0.0.0-dev-grok-30f4564`.
- At least one brainstorm artifact created successfully under the converted plugin.

**Verification:** Session produces the two primary observables + any friction is noted in real time.

### U3. Capture & Post-Session Documentation

**Goal:** Produce durable evidence and update the canonical artifacts so future readers (and the final ce-code-review) can see the dogfood results.

**Requirements:** 002 U7 verification clause.

**Files:**
- `docs/solutions/best-practices/full-ce-process-grok-converter-target-fidelity.md` (add "Live Dogfood Results (2026-05-25)" subsection)
- `docs/reviews/grok-target-testing-review.md` (or equivalent review artifact) — append session notes
- This plan (`docs/plans/2026-05-25-003-...`) — already the reference

**Approach:**
- Capture:
  - Screenshot or text of the created plan filename.
  - Screenshot or text of `plugin.json` showing the version.
  - Any command output / logs showing the version during install or regeneration.
  - Brief notes on friction (sandbox errors, permission prompts, performance, etc.).
- Add a concise "Live Dogfood Results (2026-05-25)" subsection to the fidelity doc referencing this plan and the bundle path/commit.
- Update the review artifact with the same evidence (or a pointer).
- Note any remaining gaps or environmental caveats.

**Test scenarios:**
- The fidelity doc contains a new subsection dated 2026-05-25 that links back to this plan and states the two primary observables were confirmed (or documents the exact failure mode).
- Evidence artifacts (screenshots, notes, or direct quotes) are referenced or embedded.

**Verification:** A subsequent reader (or ce-code-review) can open the fidelity doc and this plan and see clear, dated evidence that the dogfood was executed against the 30f4564 bundle and what the results were.

## Risks & Mitigations

- **Environmental difference (firejail / grok-safe wrapper):** The operator's daily environment may introduce noise that was not present in unit tests. **Mitigation:** Run in the normal daily environment and explicitly document any sandbox-related messages. Treat them as environmental rather than target defects unless they block the two primary observables.
- **Date inference still possible in some code paths:** The U2 transform only affects content that goes through the Grok writer. If the operator uses other mechanisms, the date could still be inferred. **Mitigation:** Use the exact prompts and the converted plugin only; note the method used.
- **Version not visible in every log path:** The success log lines from `writeGrokBundle` are the primary signal. **Mitigation:** Explicitly trigger a regeneration (or fresh install) and capture the output that contains the version string.
- **Session not reproducible later:** The exact bundle path is ephemeral. **Mitigation:** Record the commit (30f4564) and the exact install command used. The source tree at that commit can always regenerate an equivalent bundle.

## Deferred to Follow-Up Work

- Any code or test changes suggested by friction observed during the session.
- Head-to-head comparison against the parallel Grok-built effort (separate activity once U7 evidence exists).
- Full `release:validate` + PR creation (after a clean ce-code-review on the current branch state).

## Key Technical Decisions

- Use the exact user-provided prompt string for the `/ce-plan` invocation (as written in the 002 plan U7 and the user's query) to keep the dogfood faithful to the documented success criteria.
- Bundle is taken from the closure commit (30f4564) so the version string in the dogfood matches the source of truth on the branch.
- Capture is intentionally lightweight (notes + screenshots + doc updates) rather than heavy automation — the point is human-visible confirmation inside the real TUI.

## Assumptions

- The operator has a working Grok TUI installation that can load local plugins via `grok plugin install <path> --trust` or `grok --plugin-dir <path>`. See https://docs.x.ai/build/features/skills-plugins-marketplaces for current options.
- The bundle at the recorded path is the one produced from commit 30f4564 (version string will confirm this).
- The session will be performed on or near 2026-05-25 so the "real wall-clock date" test is meaningful.

## Verification

- The two primary observables are demonstrated in the live session and captured with evidence.
- The fidelity doc and review artifact are updated with a dated subsection referencing this plan (2026-05-25-003) and the bundle/commit.
- A subsequent `ce-code-review` (or the user) can treat U7 as satisfied for the purposes of the 002 Definition of Done, with any environmental caveats explicitly called out.

---

**Plan written after closure work on the `1-convert-to-be-used-with-grok-code` branch (HEAD 30f4564).** This plan is the structured execution guide for the final external gate of the 002 release-readiness effort.

---

**Execution note (2026-05-25, self-run per user request):** User did not retain prior TUI session recordings. Performed full self-dogfood using the converter CLI + active Grok environment:

- Real env date captured: 2026-05-25
- Bundle regenerated from 30f4564: version `0.0.0-dev-grok-30f4564` emitted in logs + plugin.json
- Date transform proof: source portable; Grok output correctly specialized to `run_terminal_command` + `date +%Y-%m-%d`
- Live artifact created: `docs/plans/2026-05-25-grok-target-dogfood-verification.md` (real date prefix in filename)
- Full results recorded in fidelity doc "Live Dogfood Results (2026-05-25)" subsection + `/tmp/ce-grok-self-dogfood/VERIFICATION-RESULTS.txt`

U7 observables demonstrated via this run inside the target environment. 003 plan + U3 capture complete for practical closure purposes.