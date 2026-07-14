# ce-debug — pipeline mode (non-interactive)

Loaded when `ce-debug` is invoked with `mode:pipeline` by an orchestrator (`ce-babysit-pr`, `lfg`). The skill runs to completion without ever asking the user and returns a structured result the caller composes. The investigation rigor is unchanged — only the interaction and the fix-authority boundary change.

## Authority: you act under the orchestrator's inherited scope

Being invoked by an orchestrator is **not** itself authorization. You mutate under the **inherited** scope the orchestrator holds from the user: **actions** = fix / commit / push on the current branch; **exclusions** = merge, rebase, force-push, approve a gated CI run. That envelope is fixed — you may *narrow* it (defer a fix, return `needs-human`) but never *broaden* it. If the only way to make CI green is an excluded action (a rebase or force-push to untangle history, or approving a gated run), that is out of envelope: **defer as `needs-human`** with a `decision_context`, do not perform it. This is a mutation-mechanism boundary and sits alongside the convergent/divergent *content* boundary below — a fix can be convergent in content yet still out of envelope in mechanism.

## Non-interactive overrides (per phase)

- **Phase 0 (triage):** If an issue fetch fails, do not ask the user to paste content — proceed with the input you have and note the gap in the return. Do not ask "what have you tried"; infer prior attempts from the input.
- **Phase 2 (root cause + fix gate):** There is no "Fix it now / Diagnosis only" question. The caller invoked this skill to fix, so **fix by default — but only convergent fixes** (see the boundary below). A divergent fix is deferred, not applied.
- **Phase 3 (workspace/branch):** Operate on the current branch — the orchestrator owns branch context; never prompt to create a branch, never prompt about uncommitted work. Commit the fix (`fix(ci): <summary>` for a CI failure, else `fix: <summary>`) and push. Never weaken, skip, or mock a failing assertion to make it pass — repair the real issue or defer.
- **Phase 4 (handoff):** No prompt. Emit the structured return below. Skip the compound offer.
- **Quality tail (simplify/review):** Skip in pipeline to bound cost and nesting depth; the orchestrator scopes review at its own level. Keep the Phase 3 tests.

## The fix-authority boundary: convergent vs divergent

Apply a fix only when it **converges to intended behavior** — it repairs the real defect so the code meets its planned/tested intent (a genuine bug: null deref, off-by-one, a broken call, a regression against a test that encodes intended behavior).

**Defer** (do not apply) any fix that would **diverge from intended behavior**: it would change a deliberate contract, API shape, default, or product/UX decision rather than repair a bug; or the "failure" is a test asserting a deliberate behavior that the fix would reverse; or making CI green would require a product/design call. This mirrors the `ce-resolve-pr-feedback` intent-conflict tripwire — evidence-gated and rare, never a reason to dodge a real fix. When genuinely unsure whether a failure is a bug or a deliberate-behavior conflict, prefer deferring with a crisp `decision_context` over guessing.

### Emergent trade-offs (when the caller passes a `trajectory`)

Some divergence isn't visible in one pass — it emerges across rounds as **ping-pong**: your fix for A surfaces B, the fix for B brings A back. When the orchestrator seeds you with a `trajectory` (`recurring_checks`, `check_recur_max`, `heads_since_progress`), reason over it before fixing again — and hold the anti-cry-wolf line:

- **Progressive failure migration** — A fixed, B appears *once*, you fix B, done — is ordinary multi-step repair. **Keep fixing.** Do not park it.
- **Oscillation** — the *same* check/invariant returns after a fix aimed at it, defects cycle, or each fix trades one failure for another — means A and B can't both hold without a larger change. That larger change is a **product/design decision**, so **defer**: apply nothing this round and return `needs-human`, with a `decision_context` that names the two failures in tension, why they can't be reconciled without a divergent change, the options, and your lean.
- **Moving-target guard:** if the recurrence traces to an external cause (a base-branch merge, a dep bump, flaky infra) rather than your fixes fighting each other, it is *not* an emergent trade-off — keep fixing, and note the external cause. Recurrence is only meaningful when your own fixes are what oscillate.

To defer, name the invariant the fix would need to satisfy and why no bounded convergent change satisfies it. If unsure it's genuine oscillation vs one more real bug, prefer one more convergent attempt over a premature park.

## Surfacing a deferred (divergent / needs-human) item

Never write a PR-body section. Never block. Surface it so the human sees it after the run:

- If it maps to an **open review thread**, leave that thread open (and attach the `decision_context` as a reply when a thread reply is in scope).
- Otherwise, **return it in the `residuals` list** for the caller to place in its single run-report comment. For a bare `ce-debug` invocation with no orchestrator and no PR, fall back to a committed `docs/residual-review-findings/<branch-or-sha>.md` file (staged with any fix).

`decision_context` uses the shape ce-debug already produces: what the failure is, what you found, why it needs a human decision, options + tradeoffs, and your lean.

## Structured return

The skill's final output in pipeline mode is machine-readable (the caller parses it):

```json
{
  "status": "fixed-and-pushed | diagnosed-no-fix | flaky-infra | needs-human",
  "summary": "<one line: what happened>",
  "root_cause": "<causal chain, brief>",
  "changed_files": ["..."],
  "head_sha": "<sha after push, when fixed-and-pushed>",
  "residuals": [ { "title": "...", "decision_context": "...", "thread": "<url|null>" } ]
}
```

- `fixed-and-pushed` — a convergent fix was applied, tests pass, committed and pushed.
- `flaky-infra` — a flake or infrastructure failure, not a code defect (the caller may retry).
- `needs-human` — the failure requires a divergent/product decision; nothing applied; see `residuals`.
- `diagnosed-no-fix` — root cause found but no safe convergent fix available this run; see `residuals`.
