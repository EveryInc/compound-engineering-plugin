# Bulk Action Preview

This reference defines the compact plan preview that Interactive mode shows before every bulk action — LFG (routing option B), File tickets per finding (routing option C), and the walk-through's `LFG the rest` (option D of the per-finding question). The preview gives the user a single-screen view of what the agent is about to do, with exactly two options to Proceed or Cancel.

Interactive mode only.

---

## When the preview fires

Three call sites:

1. **Routing option B (top-level LFG)** — after the user picks `LFG. Apply the agent's best-judgment action per finding` from the routing question, but before any action executes. Scope: every pending `gated_auto` / `manual` finding.
2. **Routing option C (top-level File tickets)** — after the user picks `File a [TRACKER] ticket per finding without applying fixes` but before any ticket is filed. Scope: every pending `gated_auto` / `manual` finding. Every finding appears under `Filing [TRACKER] tickets (N):` regardless of the agent's natural recommendation, because option C is batch-defer.
3. **Walk-through `LFG the rest`** — after the user picks `LFG the rest — apply the agent's best judgment to this and remaining findings` from a per-finding question, but before the remaining findings are resolved. Scope: the current finding and everything not yet decided. Already-decided findings from the walk-through are not included in the preview.

In all three cases the user confirms with `Proceed` or backs out with `Cancel`. No per-item decisions inside the preview — per-item decisioning is the walk-through's role.

---

## Preview structure

The preview is grouped by the action the agent intends to take. Bucket headers appear only when their bucket is non-empty.

```
<Path label> — <scope summary>[ (tracker: <name>)]:

Applying (N):
  [P0] <file>:<line> — <one-line plain-English summary>
  [P1] <file>:<line> — <one-line plain-English summary>

Filing [TRACKER] tickets (N):
  [P2] <file>:<line> — <one-line plain-English summary>

Skipping (N):
  [P2] <file>:<line> — <one-line plain-English summary>

Acknowledging (N):
  [P3] <file>:<line> — <one-line plain-English summary>
```

Worked example, for routing option B (top-level LFG):

```
LFG plan — 8 findings (tracker: Linear):

Applying (4):
  [P0] orders_controller.rb:42 — Add ownership guard before order lookup
  [P1] webhook_handler.rb:120 — Raise on unhandled error instead of swallowing
  [P2] user_serializer.rb:14 — Drop internal_id from serialized response
  [P3] string_utils.rb:8 — Rename ambiguous helper for clarity

Filing Linear tickets (2):
  [P2] billing_service.rb:230 — N+1 on refund batch (no concrete fix)
  [P2] session_helper.rb:12 — Session reset behavior needs discussion

Skipping (2):
  [P2] report_worker.rb:55 — Recommendation is speculative; low confidence
  [P3] readme.md:14 — Style preference, subjective
```

---

## Scope summary wording by path

- **Routing option B (top-level LFG):** header reads `LFG plan — N findings[ (tracker: <name>)]:`.
- **Routing option C (top-level File tickets):** header reads `File plan — N findings as [TRACKER] tickets:`. Every finding lands in the `Filing [TRACKER] tickets (N):` bucket.
- **Walk-through LFG the rest:** header reads `LFG plan — N remaining findings (K already decided)[ (tracker: <name>)]:`. Already-decided findings from the walk-through are **not** included in the preview or in the bucket counts. The `K already decided` counter communicates that the walk-through was partially completed.

When the detected tracker is low-confidence or generic (see `tracker-defer.md`), the `(tracker: <name>)` annotation is omitted from the header and the `Filing [TRACKER] tickets` bucket header uses the generic form (`Filing tickets (N):`).

---

## Per-finding line format

Each line uses the compressed form of the framing-quality bar from the plan (R22-R25 — observable-behavior-first, no function / variable names unless needed to locate). The one-line summary is drawn from the persona-produced `why_it_matters` by taking the first sentence (and, when the first sentence is too long for the preview width, paraphrasing it tightly to fit).

- **Shape:** `[<severity>] <file>:<line> — <one-line summary>`
- **Width target:** keep lines near 80 columns so the preview renders cleanly in narrow terminals. Truncate with ellipsis when necessary.
- **No function / variable names inline** unless the reader needs them to locate the issue.
- **Advisory bucket phrasing:** the `Acknowledging (N):` bucket describes the advisory content in one line. No "fix" phrase — advisory findings have no concrete fix.

When no `why_it_matters` is available for a finding (e.g., Unit 2's template upgrade hasn't fully propagated through the persona run, or the artifact file was unreadable), fall back to the finding's title directly. Note the gap in the completion report's Coverage section if it affects more than a few findings in the same run.

---

## Question and options

After the preview body is rendered, ask the user using the platform's blocking question tool (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini, `ask_user` in Pi (requires the `pi-ask-user` extension)). In Claude Code, the tool should already be loaded from the Interactive-mode pre-load step — if it isn't, call `ToolSearch` with query `select:AskUserQuestion` now. The text fallback below applies only when the harness genuinely lacks a blocking tool — `ToolSearch` returns no match, the tool call explicitly fails, or the runtime mode does not expose it (e.g., Codex edit modes without `request_user_input`). A pending schema load is not a fallback trigger. Never silently skip the question.

Stem (adapted to the path):
- For routing B: `The agent is about to apply the plan above. Proceed?`
- For routing C: `The agent is about to file the tickets above. Proceed?`
- For walk-through `LFG the rest`: `The agent is about to resolve the remaining findings above. Proceed?`

Options (exactly two, in all three cases):
- `Proceed` — execute the plan as shown
- `Cancel` — do nothing, return to the originating question

Only when `ToolSearch` explicitly returns no match or the tool call errors — or on a platform with no blocking question tool — fall back to presenting numbered options and waiting for the user's next reply.

---

## Cancel semantics

- **From routing option B Cancel:** return the user to the routing question (the four-option menu). Do not apply any fixes, file any tickets, or record any state. The session's cached tracker-detection tuple is preserved.
- **From routing option C Cancel:** same — return to the routing question, no side effects.
- **From walk-through `LFG the rest` Cancel:** return the user to the current finding's per-finding question (not to the routing question). The walk-through continues from where it was, with prior decisions intact.

In every case, `Cancel` changes no on-disk or external state.

---

## Proceed semantics

When the user picks `Proceed`:

- **Routing option B (top-level LFG):** for each finding in the plan, execute the recommended action. Apply findings go into the Apply set for a single end-of-batch fixer dispatch (see `walkthrough.md` for the Apply batching rules). Defer findings route through `tracker-defer.md`. Skip / Acknowledge findings are recorded as no-action. After all actions complete, emit the unified completion report (see `walkthrough.md`).
- **Routing option C (top-level File tickets):** every finding routes through `tracker-defer.md` for ticket creation. No fixes are applied. After all tickets have been filed (or failed), emit the unified completion report.
- **Walk-through `LFG the rest`:** same as routing option B, but scoped to the findings the user hadn't decided on. Apply findings join the in-memory Apply set with the ones the user already picked during the walk-through; all dispatch together in the single end-of-walk-through fixer call.

Failure during `Proceed` (e.g., ticket creation fails for one finding during a batch Defer) follows the failure path defined in `tracker-defer.md` — surface the failure inline with Retry / Fallback / Skip, continue with the rest of the plan, and capture the failure in the completion report's failure section.

---

## Edge cases

- **Zero findings in a bucket:** omit the bucket header. A preview with only Apply and Skip does not show an empty `Filing tickets (0):` or `Acknowledging (0):` line.
- **All findings in one bucket:** preview still shows the bucket header; Proceed / Cancel still offered. This is the common case for routing option C (every finding under `Filing tickets`).
- **N=1 preview (only one finding in scope):** the preview still uses the grouped format, just with a single-line bucket. `Proceed` / `Cancel` still apply.
- **No tracker available:** option C is not offered upstream (see `tracker-defer.md` no sink handling). LFG (option B) and walk-through `LFG the rest` can still run — they may contain per-finding Defer recommendations from Stage 5. Before rendering any LFG-shaped preview, downgrade every Defer recommendation to Skip when the session's cached `any_sink_available` is false, and surface the downgrade on the preview itself (e.g., a `Skipping — defer sink unavailable (N):` bucket, or a note in the header: `N Defer recommendations downgraded to Skip — no tracker sink`). This is a preview-time runtime step, not Stage 5 tie-breaking — step 7b only orders conflicting reviewer recommendations (`Skip > Defer > Apply > Acknowledge`, as defined in `SKILL.md` Stage 5 step 7b) and has no knowledge of sink availability.
- **Walk-through `LFG the rest` with zero remaining findings:** the walk-through's own logic suppresses `LFG the rest` as an option when N=1 and otherwise, so the preview should never be invoked with zero remaining findings. If it is, render `LFG plan — 0 remaining findings` and fall through to Proceed with no-op.
