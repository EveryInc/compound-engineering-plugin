# Bulk Action Preview

This reference defines the compact plan preview that Interactive mode shows before every bulk action — best-judgment (routing option B), Append-to-Open-Questions (routing option C), and the walk-through's `Auto-resolve with best judgment on the rest` (option D of the per-finding question). The preview gives the user a single-screen view of what the agent is about to do, with exactly two options to Proceed or Cancel.

Interactive mode only.

---

## When the preview fires

Three call sites, all before anything executes:

1. **Routing option B (top-level best-judgment).** Scope: every pending `gated_auto` or `manual` finding at confidence anchor `75` or `100`.
2. **Routing option C (top-level Append-to-Open-Questions).** Same scope, but every finding appears under `Appending to Open Questions (N):` regardless of its recommendation — option C is batch-defer.
3. **Walk-through `Auto-resolve with best judgment on the rest`.** Scope: the current finding plus everything not yet decided; already-decided findings are excluded from the preview and its counts.

In all three cases the user confirms with `Proceed` or backs out with `Cancel`. No per-item decisions inside the preview — that is the walk-through's role.

---

## Withdrawal revalidation (before composing the plan)

The walk-through's withdrawal rule (`references/walkthrough.md`, "Withdrawing findings the user's earlier answers resolved") applies to every finding this preview is about to act on, not just the one-by-one loop. Before sorting findings into buckets, judge each in-scope finding against what is already settled — earlier walk-through answers on the option-D path, and on any path a finding another Apply in this same plan resolves. Route each such finding to the `Withdrawing (N):` bucket rather than an action bucket, and never drop it silently: the bucket is how the user sees what was retired and can Cancel if the agent misread them. A staged-Apply-triggered withdrawal stays provisional here too — if that Apply later fails at execution, revert the withdrawal.

---

## Preview structure

The preview is grouped by the action the agent intends to take. Bucket headers appear only when their bucket is non-empty.

```
<Path label> — <scope summary>:

Applying (N):
  [P0] <section> — <one-line plain-English summary>
  [P1] <section> — <one-line plain-English summary>

Appending to Open Questions (N):
  [P2] <section> — <one-line plain-English summary>

Skipping (N):
  [P2] <section> — <one-line plain-English summary>

Withdrawing (N):
  [P2] <section> — resolved by <earlier decision>
```

Worked example for routing option B (top-level best-judgment):

```
Auto-resolve plan — 8 findings:

Applying (4):
  [P0] Requirements Trace — Renumber R4 (the auth-token requirement) to match unit reference
  [P1] Unit 3 Files — Add read-fallback for renamed report file
  [P2] Key Technical Decisions — Use framework's Deprecated field rather than hand-rolling
  [P3] Overview — Correct wrong count (says 6, list has 5)

Appending to Open Questions (2):
  [P2] Scope Boundaries — Unit 2/3 merge judgment call
  [P2] Risks — Alias compatibility-theater concern

Skipping (2):
  [P2] Miscellaneous Notes — Low-confidence style preference
  [P3] Abstraction Commentary — Speculative, subjective
```

---

## Scope summary wording by path

- **Routing option B:** `Auto-resolve plan — N findings:`
- **Routing option C:** `Append plan — N findings as Open Questions entries:`
- **Walk-through `Auto-resolve with best judgment on the rest`:** `Auto-resolve plan — N remaining findings (K already decided):`

---

## Per-finding line format

- **Shape:** `[<severity>] <section> — <one-line summary>`, the summary drawn from the persona's `why_it_matters` first sentence (observable-consequence-first, paraphrased tight if long). Add section numbering only when several findings hit the same named section.
- **Self-contained identifiers** — when the summary references a document-defined identifier (a requirement or unit ID such as `R4`, `U3`), pair it at first mention with a short plain-language handle drawn from the document (e.g., `R4 (the auth-token requirement)`) — never a bare identifier as the summary's only description of what it names. Keep the ID itself. Per the self-contained-rendered-lines rule in `references/synthesis-and-presentation.md`.

When a finding has no `why_it_matters` (rare — malformed persona output), fall back to its title, and note the gap in the completion report's Coverage section if it affects more than a few findings.

---

## Question and options

Treat the preview and its confirmation as two ordered user-facing events:

1. **Preview event** — emit the complete preview body as user-visible assistant text in the conversation. Content composed only in hidden thinking or reasoning does not count. Do not place the preview only inside the question interface's input.
2. **Decision event** — after the preview event is visible, invoke the harness's agent-callable blocking-question capability and wait for the answer. Success means the user can see the preview while choosing `Proceed` or `Cancel`, and the workflow does not continue until they answer.

If the preview event has not occurred, do not invoke the blocking-question capability. If the harness exposes no such capability or the call errors, preserve the same interaction as visible chat: put the numbered `Proceed` / `Cancel` options immediately below the visible preview and wait for the user's reply. Never omit the preview or continue silently.

**Non-exhaustive adapters:** `AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_question` in Antigravity CLI (`agy`), and `ask_user` in Pi with the `pi-ask-user` extension. In Claude Code, `AskUserQuestion` should already be loaded from the Interactive-mode pre-load step; if it is not, call `ToolSearch` with query `select:AskUserQuestion` now. A pending schema load is not a fallback trigger.

Stem (adapted to the path):

- For routing B: `The agent is about to apply the plan above. Proceed?`
- For routing C: `The agent is about to append the findings above to the doc's Open Questions section. Proceed?`
- For walk-through `Auto-resolve with best judgment on the rest`: `The agent is about to resolve the remaining findings above. Proceed?`

Options (exactly two, in all three cases):

- `Proceed` — execute the plan as shown
- `Cancel` — do nothing, return to the originating question

---

## Cancel semantics

`Cancel` changes no on-disk or in-memory state. From routing option B or C it returns the user to the routing question; from the walk-through's `Auto-resolve with best judgment on the rest` it returns to the current finding's per-finding question, with prior decisions intact.

---

## Proceed semantics

When the user picks `Proceed`, execute each finding's bucketed action: Apply findings join the in-memory Apply set for the single end-of-batch document-edit pass (see `walkthrough.md`, including the Apply decisions the user already made in a partially-completed walk-through), Defer findings route through `references/open-questions-defer.md`, Skip is recorded as no-action, and each finding in the `Withdrawing` bucket is recorded `withdrawn` with the decision that retired it (no edit, no append; provisional when a staged Apply retired it). Routing option C appends every finding and makes no other document edits. When everything completes or fails, emit the unified completion report.

Failure during `Proceed` (e.g., one Open Questions append fails during a batch Defer) follows the failure path in `references/open-questions-defer.md` — surface it inline with Retry / Fall back / Convert to Skip, continue with the rest of the plan, and capture it in the completion report's failure section.

---

## Edge cases

- **Empty buckets:** omit the bucket header (including `Withdrawing (0):`, the common case). A single-bucket or single-finding preview still uses the grouped format and still offers Proceed / Cancel.
- **Open Questions append unavailable** (read-only document, append flow reports no-go): routing option C is not offered upstream (see `references/open-questions-defer.md`), but option B and the walk-through path still run and may carry Defer recommendations. Before rendering a best-judgment-shaped preview, downgrade every Defer recommendation to Skip when the session's cached append-availability is false, and surface the downgrade on the preview (a `Skipping — append unavailable (N):` bucket, or a header note: `N Defer recommendations downgraded to Skip — document is read-only.`).
- **Zero remaining findings:** the walk-through suppresses `Auto-resolve with best judgment on the rest` in this case, so the preview should not fire. If it does, render `Auto-resolve plan — 0 remaining findings` and Proceed as a no-op.
