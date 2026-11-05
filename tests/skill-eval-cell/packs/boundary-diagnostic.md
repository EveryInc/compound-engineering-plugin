# Release-Before-Payment Boundary Diagnostic

Use this evaluator-owned pack to find the pipeline stage where a "released before paid" defect stops being caught: planning, persona selection, the reviewer's own finding, or synthesis. It is diagnostic. It does not test a skill change, and it is not a runtime reference to inject into the agent under test.

**This is a reconstruction.** It was built from the description in issue #1999 (a Zoom link and passcode emailed to guests before they pay), not from that run's transcript. Whether it explains the original run is unresolved.

## Fixture

`fixtures/boundary-release-before-paid/` is a small paid-event registration app. `registerGuest` creates a `pending_payment` registration and sends the confirmation email straight away. The confirmation carries a payment link. `handlePaymentWebhook` marks the registration paid later and sends a receipt; a failed payment leaves it pending. Putting the Zoom link and passcode in the confirmation therefore gives meeting access to anyone who registers, whether or not they pay.

`.compound-engineering/config.yaml` sets `cross_model_review_mode: off`, so every run is same-model only.

| Path | Used by | Content |
|---|---|---|
| `docs/plans/...-1000-feat-zoom-details-confirmation-plan.md` | `boundary-named-plan` | Adds the Zoom fields to the confirmation and states in its Summary that the email goes out while the registration is `pending_payment` |
| `docs/plans/...-1100-feat-confirmation-email-zoom-fields-plan.md` | `boundary-unnamed-plan` | The same change, with payment and timing never mentioned |
| `docs/plans/...-1200-feat-receipt-event-start-plan.md` | `boundary-routine-plan` | Control: adds the event start time to the receipt |
| `patches/zoom-in-confirmation.patch` | `boundary-framed`, `boundary-neutral` | The boundary diff, with tests |
| `patches/receipt-start-time.patch` | `boundary-routine` | Control diff |

Scenarios hide what they do not use through `fixture_omit`. Code-review scenarios commit their patch on a branch through `git_change`, with `origin/main` at the seed commit, so the review sees one commit and no plan file.

## Scenarios

| Id | Stage | What varies |
|---|---|---|
| `ce-plan/boundary-fresh-plan` | Planning, then the plan review it hands off to | Fresh `ce-plan` in pipeline mode on "Add a Zoom link and passcode to guest confirmation emails." |
| `ce-doc-review/boundary-named-plan` | Plan review | Plan states the ordering |
| `ce-doc-review/boundary-unnamed-plan` | Plan review | Plan never names it, while the change crosses it |
| `ce-doc-review/boundary-routine-plan` | Plan review | Control |
| `ce-code-review/boundary-framed` | Code review | Commit message frames the intent ("so they have everything they need to join") on branch `feat/zoom-in-confirmation` |
| `ce-code-review/boundary-neutral` | Code review | Same diff, message `update emails.js`, branch `update-emails` |
| `ce-code-review/boundary-routine` | Code review | Control |

Every task asks the agent to save each reviewer's raw return (`.eval-raw/` for plans, a copy of the review run directory under `.eval-run/` for code), so a finding that synthesis dropped can be told apart from one never raised. The catalog grades only check that this evidence was collected; detection is read by hand with the rubric below.

## Method

Run each scenario once per host per trial, with a fresh output directory each time:

```bash
bun run test:skill-eval-pack -- --id ce-code-review/boundary-framed --arm post --hosts codex --out "$OUT/framed/codex-t1"
```

For each cell, record:

1. **Plan stage:** does the final plan name the ordering (confirmation sent before payment, so unpaid guests get access)?
2. **Selection:** the `TEAM:` line, or `reviewers` in `review.json`.
3. **Finding:** which raw returns name the ordering.
4. **Synthesis:** does it survive into the result: a Deferred / Open Questions entry written into the plan, or a finding in `review.json`? When it is dropped, record the reason synthesis gives (`rejected_candidates` in `synthesized-findings.json` for code review).
5. **Control:** no finding names the ordering.

## Results (2026-11-04)

Skills from main at `799ac9a`. Claude Code 2.1.318, Codex CLI 0.166.0. Three trials per host per scenario, 42 cells. Rates are cells where the stage held the finding, out of three.

| Scenario | Host | Plan names it | Raised by a reviewer | Survives synthesis | Reviewers that raised it |
|---|---|---|---|---|---|
| fresh-plan | Claude | 3/3 | 3/3 | 3/3 (the plan's own open question) | adversarial 3/3, security-lens 2/3 |
| fresh-plan | Codex | 3/3 | 0/3 | 3/3 (the plan's own assumption or open question) | none: the plan already records the ordering as an assumption to confirm |
| named-plan | Claude | given | 3/3 | 3/3 | adversarial and scope-guardian 3/3, security-lens 1/3 |
| named-plan | Codex | given | 3/3 | **2/3** | security-lens only, 3/3 |
| unnamed-plan | Claude | no | 3/3 | 3/3 | adversarial 3/3, feasibility 2/3, security-lens 2/3 |
| unnamed-plan | Codex | no | 3/3 | 3/3 | security-lens only, 3/3 |
| routine-plan | both | n/a | 0/6 (correct) | n/a | none |
| framed | Claude | n/a | 3/3 | 3/3 (P1) | security, adversarial, correctness 3/3 |
| framed | Codex | n/a | 3/3 | **2/3** | security 3/3, adversarial 2/3, correctness 1/3 |
| neutral | Claude | n/a | 3/3 | 3/3 (P1, one P0) | security, adversarial, correctness 3/3 |
| neutral | Codex | n/a | 3/3 | 3/3 (P1) | security and adversarial 3/3, correctness 1/3 |
| routine | both | n/a | 0/6 (correct) | n/a | correctness only in 5/6; correctness and adversarial in 1/6 |

Every plan-review team included coherence, feasibility, scope-guardian and adversarial. Security-lens was selected in 6 of 9 Claude boundary-plan cells (fresh 3/3, named 1/3, unnamed 2/3) and 9 of 9 Codex ones; on the routine control, 0/3 Claude and 1/3 Codex. Codex fresh-plan trial 1 also added product-lens.

### Where detection was lost

- **Claude:** not reproduced at any stage, 0 of 21 cells.
- **Codex:** lost at synthesis twice, in 2 of 21 cells. The reviewer raised it both times, so persona selection and the finding itself held.
  - `named-plan` trial 2: security-lens returned a P1 at confidence 75 ("Unpaid registrants receive the event's joining credentials"). Synthesis reported "no open items; plan unchanged" and recorded no reason.
  - `framed` trial 1: adversarial and security merged it into one P1 at confidence 100 with a reproduction. Admission rejected it because the intended change "explicitly adds Zoom joining details to the registration confirmation" and moving them to the receipt "would instead introduce an unsupported product restriction". The verdict was "Ready to merge".
- **Common stage:** none, since Claude lost nothing. The Codex losses share a pattern: the plan or the commit message states the behavior as intended, and synthesis read that as settled. Both happened once in three, so the rates cannot separate the framed arm (2/3) from the neutral arm (3/3).
- **Codex plan review depends on one persona.** Only security-lens raised it on Codex, in all six boundary plan cells, so a run that did not select security-lens would have had nothing to keep. Claude raised it from two or three personas in every cell.

## Limits

- No PR body arm: both code-review arms are a local branch with a commit, so the framing comes only from the commit message and branch name.
- The fixture covers "released before paid" only; a separate "visible before authorized" case was not built.
- Three trials per host per cell, which can show a loss but cannot measure a small rate.
- The 42 recorded packs predate the `fixture_source` fingerprint, so `regrade.ts` reports them as not assessable.
