# Phase 4: wrap-up

Read this at wrap-up. The SKILL.md body states the post-completion options the user chooses from. This file carries what each one needs: the deferred-hypothesis presentation, the results summary, what is preserved and what is not, the mechanical-apply bar for review findings, and the cleanup rules.

## Phase 4: Wrap-Up

### 4.1 Present Deferred Hypotheses

If any hypotheses were deferred due to unapproved dependencies:
1. List them with their dependency requirements
2. Ask the user whether to approve, skip, or save for a future run
3. If approved: add to backlog and offer to re-enter Phase 3 for one more round

### 4.2 Summarize Results

Report from the persisted forecasts and measurements, with the final state confirmed using the configured measurement protocol. If confirmation is unavailable, label the final values unconfirmed and state why. A legacy log remains reportable: missing forecasts, comparison baselines, or uncertainty stay unrecorded rather than being reconstructed from the final result.

The summary must contain:

- **Overall result:** original baseline -> final for every required objective (the primary when no objectives are declared), with units, absolute change, target status, and percentage change where meaningful. A zero baseline has no defined percentage change; an ordinal judge score is reported in score points, not as a percentage improvement.
- **Opportunity -> result:** each retained change's original expected benefit beside its measured before/after result, the comparison identity and workload, and whether the evidence supports the estimate. Identify standalone versus integrated results. If the forecast and result use different baselines or workloads, label them non-comparable instead of declaring that the forecast was met or missed.
- **Evidence quality:** measurement uncertainty and confirmation status, correctness checks and their results, and any unverified constraints. Report measured incremental contributions only when the corresponding reference measurements exist. Do not add percentages from successive changes or count a standalone runner-up gain as its integrated contribution; the overall gain comes from original-to-final measurement.
- **Remaining opportunity:** what still costs time or resources, with current evidence and whether further work appears worthwhile. Without fresh evidence, label remaining estimates stale or unknown; do not claim a new bottleneck from the old profile alone.
- **Run accounting:** stopping reason, duration, outcome counts, judge cost when applicable, and the log path. Preserve the existing outcome distinctions, including `Not selected: <count>`, inconclusive, censored, deferred, errors, and timeouts. Short reports may omit individual rejected experiments, but retain required-objective results and evidence limitations.

### 4.3 Preserve and Offer Next Steps

The optimization branch (`optimize/<spec-name>`) is preserved with all commits from kept experiments.
The experiment log and strategy digest remain in local `.context/...` scratch space for resume and audit on this machine only; they do not travel with the branch because `.context/` is gitignored.

Present these options after the summary:

1. **Run `ce-code-review`** on the cumulative diff (baseline to final), on the optimization branch. Do not commit or push from this step.
2. **Run `ce-compound`** to document the winning strategy as an institutional learning.
3. **Create PR** from the optimization branch to the default branch.
4. **Continue**: re-enter Phase 3, state re-read first.
5. **Done**: leave the branch for manual review.

For option 1, load `ce-code-review` on the optimization branch, interactive or `mode:agent`, and land eligible fixes under the bar below before moving to the next option.

**Mechanical-apply bar:** apply any finding with a concrete `suggested_fix` that is a clear, reversible improvement. Push back (keep, don't apply) when the reviewer is wrong, noting why. Defer anything whose right fix needs a design or product decision (architecture direction, contract shape, behavior change needing sign-off) and any finding with no concrete fix to act on. Tell the user what was deferred. Confirm evidence still matches at `file:line` before editing. After applying, run tests (at least targeted tests for what changed; broader suite for multi-file edits). Do not commit or push from this step. Leave the diff on the optimization branch for the Create PR option.
Option 4 (continue) re-enters Phase 3 with the current state, state re-read from disk first.

### 4.4 Cleanup

Clean up scratch space:
```bash
# Keep the experiment log for local resume/audit on this machine
# Remove temporary batch artifacts
rm -f .context/compound-engineering/ce-optimize/<spec-name>/strategy-digest.md
```

Do NOT delete the experiment log if the user may resume locally or wants a local audit trail. If they need a durable shared artifact, summarize or export the results into a tracked path before cleanup.
Do NOT delete experiment worktrees that are still being referenced.
