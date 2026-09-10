# Pre-ship quality tail (LFG steps 3–6)

These are the quality steps that run after implementation and before shipping. `ce-code-review` is review-only. LFG applies eligible fixes itself, then commits.

## The shipping precondition, in these steps

When the repo has no remote, the run finishes locally. That is a final state, not an error: never retry a push or hunt for a remote. Step 5 still makes every commit it calls for; only the pushes and the records that would live on the PR are dropped. With no PR to hold the unapplied findings, step 6 files them as tracker tickets and the DONE report states the rest. Never write them to a committed file nobody will read.

## Step 3 — simplify before review

Simplification runs before review so the code-review in step 4 covers the simplified code. Let `ce-simplify-code` resolve the branch-diff scope itself; it preserves behavior and runs the test suite. Pass the plan path from step 1 as context about structure the simplification must keep, not as the simplification scope (the branch diff remains the scope). Add a one-line constraint: KTDs labeled `session-settled:` describe structure the simplification must preserve, so deliberate duplication stays duplicated.

Do not commit in this step. `ce-simplify-code` leaves its changes in the working tree; step 4's review scopes the working tree (uncommitted changes included), and step 8's `ce-commit-push-pr` commits whatever remains. Committing here would sweep any still-uncommitted `ce-work` edits into a misleading `refactor` commit and could stall on a tree that never goes clean.

## Step 4 — invoke `ce-code-review`

Load `ce-code-review` from the host catalog's listed path. A host skill named `review` is not this step; do not invent `skills/review/SKILL.md` under this plugin.

```
ce-code-review mode:agent plan:<plan-path-from-step-1>
```

Read the **Actionable Findings** summary and artifact path. Do not pass `mode:autofix`.

Pass the plan file path from step 1 so `ce-code-review` can verify requirements completeness. Also read any findings stamped `settled_conflict` (each names the conflicting KTD). Stamped findings that are matters of preference do not stop the pipeline (they are report-only), but they must reach step 6's record of unapplied findings.

`mode:agent` is report-only **by design**: it reports findings but never edits the tree, and LFG applies the eligible ones in step 5. When narrating progress to the user, frame this as "review found X -> applied X in step 5," not as "code review did not auto-fix." A report-only review followed by an LFG-applied fix is the intended contract, not a gap.

Capture parsed JSON (`status`, `actionable_findings`, `findings`, `artifact_path`, `run_id`) or the markdown Actionable Findings section. If `status` is `failed`, stop and report `reason`.

## Step 5 — apply and persist review fixes

### What to apply

Apply a finding in the working tree only when **all** of the following hold:

1. **`suggested_fix` is present** — concrete change shape from the reviewer.
2. **`confidence` is `100`, or `75` with cross-persona agreement noted in the report** — do not apply anchor-50 findings.
3. **The fix is mechanical** — one coherent change; no change to a contract, permission, or security stance; no new public API shape; no behavior change that needs product sign-off.
4. **Evidence still matches the code** at the cited `file:line` before editing.

Do not treat `autofix_class` as permission to auto-apply.

### What not to apply

- `autofix_class: manual` without a clear mechanical `suggested_fix`
- `autofix_class: advisory` — report-only
- `gated_auto` findings that change behavior, contracts, auth, or permissions
- Anything that needs a design conversation

### Execution

1. Filter `actionable_findings` (or markdown Actionable Findings) with the bar above.
2. Apply eligible fixes in the working tree in severity order (`#` stable from the review).
3. Run targeted tests when `requires_verification: true` on any applied finding.
4. If `git status --short` shows changes, stage only review-driven files and commit `fix(review): apply review findings`. Then push before step 6 **when a remote is configured** (per LFG's shipping precondition). To push: if an upstream exists, run `git push`. If no upstream exists but a remote is configured (common on a fresh feature branch), pick a writable remote at run time: prefer `origin` when present, otherwise run `git remote` and choose the first configured remote. Then run `git push --set-upstream <remote> HEAD`. If there is no remote at all, do not push; the local commit suffices. If no eligible fixes were applied, say so explicitly and skip the commit.

## Step 6 — residual handoff

Residuals are the findings left over: actionable findings **not** applied in step 5. They are not leftovers from an autofix inside `ce-code-review`. Use the Actionable Findings summary / artifact from step 4.

Two further triggers also require step 6, both outside the apply path: step 4 emitted any `settled_conflict`-stamped findings, or step 2's return carried proceeded-and-flagged `settled_decision_conflicts` entries. These are the findings where the work diverged from a settled decision, and this step is where they get written down somewhere that lasts.

A residual at this point is undecided, not accepted debt. Step 5 declined it because it needs judgment, and the pipeline never merges, so the human reviewing the PR supplies that judgment: fix it in this branch, dismiss it, or file it to carry past merge. The record therefore goes where that reviewer already looks, the PR body. The pipeline files no tickets for these; one ticket per finding, decided by nobody, is how a run of small nits floods a tracker.

**When a PR will exist (a remote is configured):** compose a `## Unapplied review findings` section, one checkbox bullet per item so a human ticks it when they close it:

- For each unapplied actionable finding: `- [ ] <severity> — <file:line> — <title>`, plus the reviewer's `suggested_fix` on the next line when present.
- For each `settled_conflict`-stamped finding from step 4: the same bullet plus the conflicting KTD the stamp names — included even though the finding is report-only.
- For each proceeded-and-flagged `settled_decision_conflicts` entry from step 2: a bullet with the KTD, the evidence, and how it was routed.

Close the section with the review run context (`run_id`, `artifact_path`). Hand the section to step 8 as PR-description context; `references/shipping-tail.md` says where step 8 passes it into `ce-commit-push-pr`. Step 8 writes the body, so nothing here edits the PR directly, and nothing posts a PR comment for these.

**When no PR will exist (no remote):** load `references/tracker-defer.md` in **non-interactive mode** with the same items, collect `{ filed: [...], failed: [...], no_sink: [...] }`, and state every `failed` and `no_sink` item verbatim in the DONE report. The report is the only record those get.
