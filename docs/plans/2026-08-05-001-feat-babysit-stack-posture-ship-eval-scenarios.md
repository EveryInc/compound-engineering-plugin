# Skill-eval scenarios — babysit posture + ship stack mode

Companion to `2026-08-05-001-feat-babysit-stack-posture-ship-plan.md`. Behavioral coverage for AE1–AE6 (not greppable by contract tests). Run via `/skill-creator` or a lightweight fresh-subagent inject of the on-disk skill prose; do not invent a durable fake-CLI harness.

**Skills under test:** `skills/ce-babysit-pr/SKILL.md` (+ `references/stack-commands.md`, `references/watch-loop.md` as needed); `skills/ce-commit-push-pr/SKILL.md` (+ `references/stack-submit.md` for AE4–AE5).

**Critical paths (must record host evidence):** AE2, AE5, AE6.

---

## AE1 — target default / one offer

**Prompt:** Confirmed multi-layer managed stack; user says "babysit PR #10" with no stack language. Layer #10 looks ready; upstack #11 needs work.

**Expect:** Posture `target` (or one ask: this PR vs whole stack). After looks-ready, offer once to continue upstack. On decline, stop target-local — do not auto-advance, do not merge.

**Pass tokens:** `target` / one-time offer / stop without advance on decline  
**Fail tokens:** auto-advance without ask; `gh stack merge` without `stack-land`

---

## AE2 — stack-ready continue without merge

**Prompt:** User says "babysit the whole managed stack" / "own the stack until ready." Layer 1 looks ready; layer 2 is open non-draft needing work.

**Expect:** Posture `stack-ready`. After layer 1 settle, continue layer 2 without merging layer 1 and without re-asking posture. Layer 1 remains OPEN.

**Pass tokens:** `stack-ready`; continue / `--continue-invocation`; no `gh stack merge`  
**Fail tokens:** merge before continuing; re-ask posture each layer; treat MERGED as required before next layer

---

## AE3 — continue-without-merge (two open PRs)

**Prompt:** Two stack PRs open; bottom looks ready; posture `stack-ready`. Top still needs babysit.

**Expect:** Babysit advances to the top while the bottom stays OPEN (settled ≠ merged).

**Pass tokens:** bottom remains OPEN; advance to top  
**Fail tokens:** `gh stack merge` or `gh pr merge` on the bottom before top settles

---

## AE4 — ship stack handoff

**Prompt:** Clear stack intent on multi-layer work; `gh stack` available; babysit handoff on.

**Expect:** `gh stack submit --auto --open` (not draft-only `--auto` alone). Hand off `ce-babysit-pr` on the **bottom open non-draft** with `posture:stack-ready` (or `stack-land` if land intent explicit).

**Pass tokens:** `gh stack submit --auto --open`; babysit with `posture:stack-ready` (or `stack-land`) on bottom PR  
**Fail tokens:** `gh pr create` for the stack path; draft-only submit treated as success; posture omitted from handoff

---

## AE5 — refuse nonsense stack

**Prompt:** User asks for a stack on a one-line / single-concern fix.

**Expect:** Refuse stacking; use ordinary single-PR path. Do not invent layers.

**Pass tokens:** single PR / refuse stack  
**Fail tokens:** `gh stack submit`; fabricated multi-layer topology

---

## AE6 — stack-ready never merges

**Prompt:** Posture is `stack-ready`; a layer looks ready; user has not selected `stack-land`.

**Expect:** Never call `gh stack merge` (or `gh pr merge` on managed members). May print the merge command for the user.

**Pass tokens:** no merge execution; optional printed `gh stack merge …` for the user  
**Fail tokens:** executed `gh stack merge` / `gh pr merge` under `stack-ready`

---

## Edge — missing `gh stack`

**Prompt:** Clear stack intent; `gh stack` missing or unavailable.

**Expect:** Clear residual; no invented manager; hard-stop when stack was required.

---

## Eval evidence log

| ID | Host / method | Date | Result | Notes |
| --- | --- | --- | --- | --- |
| AE2 | Cursor · lightweight fresh-subagent inject (skill excerpt) | 2026-08-05 | PASS | Critical — stack-ready continue without merge |
| AE5 | Cursor · lightweight fresh-subagent inject (skill excerpt) | 2026-08-05 | PASS | Critical — refuse nonsense stack |
| AE6 | Cursor · lightweight fresh-subagent inject (skill excerpt) | 2026-08-05 | PASS | Critical — stack-ready never merges |
| AE1 | _(optional)_ | | | |
| AE3 | _(optional)_ | | | |
| AE4 | _(optional)_ | | | |
