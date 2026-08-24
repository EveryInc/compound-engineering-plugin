# Pre-ship quality tail (LFG steps 3–6)

`ce-code-review` is review-only. LFG applies eligible fixes itself, then commits.

## The shipping precondition, in these steps

A missing remote is a terminal local-only state, not an error: never retry a push or hunt for a remote. Steps 5 and 6 still make every commit they call for; only the pushes and the PR-side records drop. With no PR to comment on, the run output is the residual record — state the residuals in the DONE report rather than committing a file nobody will read.

## Step 3 — simplify before review

Simplification runs before review so the code-review in step 4 covers the simplified code. Let `ce-simplify-code` resolve the branch-diff scope itself; it preserves behavior and runs the test suite. Pass the plan path from step 1 as structure-pin context, not as the simplification scope (the branch diff remains the scope), with a one-line constraint: `session-settled:`-labeled KTDs are structure pins the simplification must preserve (deliberate duplication stays duplicated).

Do not commit in this step. `ce-simplify-code` leaves its changes in the working tree; step 4's review scopes the working tree (uncommitted changes included), and step 8's `ce-commit-push-pr` commits whatever remains. Committing here would sweep any still-uncommitted `ce-work` edits into a misleading `refactor` commit and could stall on a tree that never goes clean.

## Step 4 — invoke `ce-code-review`

Load `ce-code-review` from the host catalog's listed path. A host skill named `review` is not this step; do not invent `skills/review/SKILL.md` under this plugin.

```
ce-code-review mode:agent plan:<plan-path-from-step-1>
```

Read the **Actionable Findings** summary and artifact path. Do not pass `mode:autofix`.

Pass the plan file path from step 1 so `ce-code-review` can verify requirements completeness. Also read any findings stamped `settled_conflict` (each names the conflicting KTD). Stamped preference-grade findings proceed (they are report-only) but must flow into step 6's residual record.

`mode:agent` is report-only **by design** — it surfaces findings but never edits the tree; LFG applies the eligible ones in step 5. When narrating progress to the user, frame this as "review found X -> applied X in step 5," not as "code review did not auto-fix." A report-only review followed by an LFG-applied fix is the intended contract, not a gap.

Capture parsed JSON (`status`, `actionable_findings`, `findings`, `artifact_path`, `run_id`) or the markdown Actionable Findings section. If `status` is `failed`, stop and surface `reason`.

## Step 5 — apply and persist review fixes

### What to apply

Apply a finding in the working tree only when **all** of the following hold:

1. **`suggested_fix` is present** — concrete change shape from the reviewer.
2. **`confidence` is `100`, or `75` with cross-persona agreement noted in the report** — do not apply anchor-50 findings.
3. **The fix is mechanical** — one coherent change, no contract/permission/security posture change, no new public API shape, no behavior change that needs product sign-off.
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
4. If `git status --short` shows changes, stage only review-driven files, commit `fix(review): apply review findings`, and push before step 6 **when a remote is configured** (per LFG's shipping precondition). To push: if an upstream exists, run `git push`. If no upstream exists but a remote is configured (common on a fresh feature branch), resolve a writable remote dynamically: prefer `origin` when present, otherwise use `git remote` and choose the first configured remote. Then run `git push --set-upstream <remote> HEAD`. If there is no remote at all, do not push — the local commit suffices. If no eligible fixes were applied, note explicitly and skip commit.

## Step 6 — residual handoff

Residuals are actionable findings **not** applied in step 5 — not leftovers from in-skill autofix. Use the Actionable Findings summary / artifact from step 4.

Two further triggers also require step 6, both outside the apply path: step 4 emitted any `settled_conflict`-stamped findings, or step 2's return carried proceeded-and-flagged `settled_decision_conflicts` entries. They are the divergent class and must be made durable here.

1. Load `references/tracker-defer.md` in **non-interactive mode**. Pass the residual actionable findings from step 4/5 (or the run artifact when the summary was truncated).
2. Collect the structured return: `{ filed: [...], failed: [...], no_sink: [...] }`.
3. Compose a `## Residual Review Findings` markdown section from the structured return (this goes into the run-report PR comment, **not** the PR body):
   - For each item in `filed`: a bullet with severity, file:line, title, and a link to the tracker ticket URL.
   - For each item in `failed`: a bullet with severity, file:line, title, and the failure reason (e.g., `Defer failed: gh returned 401 — tracker unavailable`).
   - For each item in `no_sink`: a bullet with severity, file:line, and title inlined verbatim, since the comment is the only record these get.
   - For each `settled_conflict`-stamped finding from step 4: a bullet with severity, file:line, title, and the conflicting KTD the stamp names — included even though the finding is report-only.
   - For each proceeded-and-flagged `settled_decision_conflicts` entry from step 2: a bullet with the KTD, the evidence, and how it was routed.
4. Never write the `## Residual Review Findings` section into the PR description: it duplicates GitHub's own tracking and goes stale as items resolve. Review residuals have no GitHub thread of their own, so they are made durable by the tracker tickets filed above plus **one run-report comment on the PR** carrying the composed section (ticket links included) and the source run context — the same surface `ce-babysit-pr` already uses for unfixable CI. Post it with `gh pr comment`; a point-in-time comment does not go stale as items resolve, the way a body section or a committed file does.

When no PR exists at all (no remote, per LFG's shipping precondition), the run output is the record: state the residuals in the DONE report rather than committing a file nobody will read.
