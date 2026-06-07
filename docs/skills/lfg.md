# `/lfg`

> Run the full engineering pipeline as a plan-bounded autopilot: plan or resume, execute, review, fix, open a draft PR, follow CI, and stop at human-owned release boundaries.

`/lfg` is the hands-off coordinator for Compound Engineering. It is for moments when the user has explicitly asked the agent to keep going through the known engineering loop instead of pausing after every phase. It does not replace `ce-plan`, `ce-work`, `ce-code-review`, or `ce-commit-push-pr`; it composes them around an approved plan and a durable run ledger.

The core rule is bounded autonomy. `/lfg` may continue through routine implementation, verification, review-fix-review, commits, push, draft PR creation, and CI follow-up when the plan's Autopilot Run Contract allows those actions. It must stop or record a residual when the contract forbids an action or an escalation trigger appears.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Coordinates an approved plan through execution, review loops, draft PR creation, and CI follow-up |
| When to use it | Explicit hands-off/autopilot work with a plan path, a feature request that should first become a plan, or a resume signal |
| What it produces | Scoped commits, a draft PR or updated draft PR, a run ledger, and durable residuals when caps are hit |
| What's next | Human review, ready-for-review decision, merge, release, or follow-up on residuals |
| Boundary | No automatic merge, release, production migration, production write canary, or ready-for-review transition without explicit approval |

---

## The Contract

`/lfg` starts from one of three inputs:

- An existing plan path
- A feature description that should first go through `ce-plan`
- A resume signal for a previously active run

When planning is needed, `/lfg` asks `ce-plan` for a plan with an **Autopilot Run Contract**. That contract names allowed actions, forbidden actions, escalation triggers, retry caps, GitHub write boundaries, resume state, and evidence-research triggers. Normal `ce-plan` output is unchanged unless autopilot is explicit.

During execution, `/lfg` treats routine user messages as context updates unless they conflict with the approved plan or say to pause, stop, hold, or change course. Major architecture, stack, provider, model/API, security-sensitive, destructive, production-impacting, secret-touching, or cost-bearing decisions are escalation triggers unless already approved in the contract.

`/lfg` enforces the contract's GitHub write boundary before commit, push, draft PR creation, PR body updates, and CI-fix commits. If a write is not authorized, `/lfg` records the blocked write as a residual in the ledger instead of crossing the boundary.

For fast-moving technical decisions, `/lfg` follows the contract's evidence-research triggers. It should use current external research when the contract requires it; if research is unavailable or thin, the decision becomes an explicit assumption or residual instead of hidden model-memory certainty.

---

## Run Ledger

Every run writes a ledger before implementation. The ledger records:

- Plan path
- Repo root and remote
- Branch and head SHA
- Current phase and next action
- Retry counters
- Last verification
- Open residuals
- Escalation state

The preferred repo-local location is `.context/compound-engineering/autopilot-runs/<run-id>/` when that path is ignored or explicitly allowed. Otherwise `/lfg` uses the stable Unix-like temp location `<os-temp>/compound-engineering/lfg/<run-id>/`, with `<os-temp>` resolving to `/tmp` under this repo's skill policy. On resume, the next agent first matches the active ledger to the current repo identity and branch, then continues from the recorded safe action unless the new user message conflicts with the run.

---

## Quality Loops

`/lfg` invokes `ce-work autopilot:true implementation-only:true plan:<plan-path> ledger:<ledger-path>` so implementation and verification happen without entering `ce-work`'s own shipping workflow. In this mode `ce-work` must not create incremental, subagent, delegation, or merge commits before returning. Review, residual handoff, commit, push, draft PR update, and CI remain coordinated by `/lfg`.

`/lfg` runs review in `ce-code-review mode:agent plan:<plan-path>`, parses the returned JSON, and loops through significant `actionable_findings`. It proceeds only when `status: "complete"` is present. Malformed JSON or missing `status` stops the pipeline; `status: "failed"`, `"degraded"`, or `"skipped"` is recorded in the ledger without requiring `actionable_findings` and stops before residual handoff, browser tests, commit, push, or PR updates. For complete review JSON, `actionable_findings` and full `findings` must both be arrays. It applies fixes, verifies them, and re-runs review until `status: "complete"` returns with an empty `actionable_findings` array, no significant residuals in full `findings`, and no accumulated residuals from earlier iterations; a finding needs human judgment; or the **3 review iterations** cap is reached. Human-owned, release-owned, advisory, capped, or otherwise unapplied significant findings are accumulated in the ledger immediately, even when the same review also has fixable findings, so they become durable residuals instead of being erased by a later clean rerun. Low-signal, duplicate, stylistic, or speculative findings may be noted but do not keep the loop alive or become durable PR noise.

CI follow-up works the same way: fix failing checks within the run contract, update the ledger, and stop after the configured cap. The default CI cap is **3 fix attempts**. Remaining failures are written as durable residuals in the draft PR body or fallback residual document.

---

## Draft PR Boundary

Shipping through `/lfg` uses `ce-commit-push-pr draft:true autopilot:true plan:<plan-path> ledger:<ledger-path>` only when the GitHub write boundary permits every write that skill may perform. A new PR is opened with `gh pr create --draft`; an existing PR keeps its current draft/ready state. If an existing PR is present but PR-body updates are forbidden, `/lfg` does not invoke the shipping skill because that mode may run `gh pr edit`; it commits and pushes scoped changes directly when allowed, records the blocked body update in the ledger, and leaves the PR body untouched. The explicit autopilot context lets the shipping skill compose from the run context without stopping for optional PR-description or evidence prompts. This gives the user a concrete review surface without letting the agent mark ready, merge, release, or mutate production.

The draft PR should carry the useful context from the run: summary, verification, review status, CI status, skipped optional evidence, and unresolved residuals. Later PR-description refreshes preserve durable `## Residual Review Findings`, `## Known Residuals`, and `## CI Failures Unresolved` sections unless `/lfg` supplies refreshed replacements. If no PR exists when residuals are first made durable, `/lfg` commits the fallback residual document and records the exact section in the ledger so the subsequent new draft PR body includes it too. If GitHub writes are disallowed, `/lfg` records the same residuals in the ledger or fallback document.

---

## When to Reach For It

Reach for `/lfg` when:

- You have an approved plan and want the agent to keep moving through the ordinary engineering loop
- You want routine interruptions to become context, not stop signs
- You want review and CI follow-up to continue until clean or capped
- You are comfortable with commits, pushes, and draft PR creation under the run contract

Skip `/lfg` when:

- You still need to decide the product shape first -> use `/ce-brainstorm` or `/ce-plan`
- You want interactive control at each phase boundary -> use `/ce-work`
- The next step may involve merge, release, production migration, production write canary, or secret rotation without a human at the controls

---

## Reference

| Argument | Effect |
|----------|--------|
| `<plan path>` | Runs or resumes against the existing plan |
| `<feature description>` | Creates a plan first, then runs the bounded autopilot |
| `resume` / continuation signal | Loads the active ledger and continues from the next safe action |

---

## See Also

- [`ce-plan`](./ce-plan.md) - creates the Autopilot Run Contract when hands-off execution is explicit
- [`ce-work`](./ce-work.md) - executes the plan's units and enforces contract escalation rules
- [`ce-code-review`](./ce-code-review.md) - supplies the machine-readable review loop
- [`ce-commit-push-pr`](./ce-commit-push-pr.md) - opens the draft PR through `draft:true` plus explicit autopilot context
