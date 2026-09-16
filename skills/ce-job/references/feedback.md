# Feedback and test requests

Use this reference before `capture`, `feedback`, `test`, `pause`, or `resume` changes a ledger or prompts a live worker.

## Durable-first rule

Write the ledger update before any live Herdr prompt. If the live prompt fails, the next worker still sees the instruction. If the ledger write fails, do not send the prompt.

## Classification

Append the note to the narrowest section whose condition matches:

| Note condition | Section |
|---|---|
| user chooses between alternatives, changes scope, or rejects an approach | Decisions |
| adds or changes what must be true at completion | Scope or Done criteria |
| asks for a concrete runtime, browser, server, CLI, or test proof | Test requests |
| reports a command, screenshot, log, artifact path, or observed result | Evidence |
| names a review, reviewer finding, or report path | Reviews |
| says to stop, wait, or not proceed until something happens | Open questions and `status: blocked` or `paused` |
| ordinary progress, context, or unclear note | Work log |

Preserve the user's wording in the bullet. Add a short classification prefix only when it helps later agents act, such as `Decision:`, `Test request:`, or `Blocker:`.

## Test requests

A `test` action creates an evidence requirement. Record:

- what to start or inspect, such as a dev server, browser flow, CLI command, API call, or fixture
- what observation would count as success
- any artifact expected, such as screenshot, log path, or report
- any known credential or environment limit

The next worker must either satisfy the request and add evidence, or record why it is blocked. A test request stays open until `prove` maps it to evidence or the user marks it out of scope.

## Live delivery

After the durable update, live delivery is allowed only when the job has an attachment and `references/herdr-control.md` says control is available. Send the smallest prompt that points the worker at the ledger update; do not paste the whole ledger or transcript.

If the target is blocked, inspect and report the blocked state instead of sending more input. If the target is working, use Herdr's prompt/wait behavior as the live transport permits, then record whether the prompt was accepted, stalled, timed out, or blocked.
