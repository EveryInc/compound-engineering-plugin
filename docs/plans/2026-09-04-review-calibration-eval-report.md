# Review Calibration - Implementation and Evaluation

Reviewers must now show a practical problem or worthwhile maintenance benefit before reporting a finding. The lead agent resolves disagreements from evidence. Confidence, agreement, and suggested fixes do not establish importance or grant permission to edit. Risks and open questions must meet the same standard.

## Changed contracts

| Skill or section | What changed | What stays required |
|---|---|---|
| `ce-doc-review` review | Reject low-value findings; raise confidence only when combined evidence meets the next level; lead agent chooses the recommendation | Only confidence-100 mechanical `safe_auto` edits apply silently. Changes to meaning need approval; choices reserved for the user stay manual |
| `ce-doc-review` resume | Reuse complete, current evidence for an unchanged document; follow the interaction choice already made; return without asking what to do next | A summary alone cannot support resume; significant changes require a fresh review; required previews and user decisions remain |
| `ce-code-review` | Check findings, remaining risks, and open questions before reporting; do not reintroduce rejected claims | Report-only default, validation, project standards, and earlier decisions |
| `ce-work` | Choose technical fixes from evidence; continue authorized work; stop only when missing evidence or decisions prevent completion | No invented product preferences or permission; explain justified unfinished work |
| `ce-pov` | Research available facts; return missing information to the calling agent without starting an interview | Read-only assessment, required evidence, permission to contact other models, and the four checks before starting another workflow |
| `ce-plan` and `ce-brainstorm` | Keep complete review results for reuse; ask only for decisions that still need the user | Existing planning and product-scope limits |

`ce-work` calls `ce-pov` for important, specific choices that ordinary inspection cannot resolve. It does not call it for every finding or disagreement. A delegated agent can perform the assessment. No new mode or general coordination protocol was added.

## Provenance and review decisions

- The old automatic confidence bump, contradiction-to-user rule, and conservative action vote were policy choices pinned by contract tests. They now yield to the lead agent’s assessment of practical consequences; independent-provider receipt checks and peer apply caps remain.
- The prior experiment with edits that change meaning in `2026-08-12-003-fix-doc-review-decision-clustering-plan.md` (U14, shipped narrowed, target not met) showed false applications of actual product choices. This implementation deliberately preserves that confirmation boundary rather than treating confidence as authority.
- The earlier POV question requirement helped establish what to assess. The replacement returns any missing information needed to identify the question and still researches facts it can find. It returns the result without asking what to do next, and does not start further work without permission.
- The code-followup ban on investigation and mechanical-only fixer instruction conflicted with the calling agent’s judgment. The caller now owns decisions based on evidence; batching and shared-file isolation remain.
- Fresh-reader feedback found a real way for rejected findings to return as remaining risks; synthesis now applies the same standard for keeping a finding to all reported concerns. A proposed stale-decision exception was rejected because R29 already rechecks materially changed evidence. Preserving the decision record does not unconditionally suppress a new concern.
- The shared authoring standard records the calibration rule. No separate learning capture is needed: the reasoning and evidence are retained here and in that standard.

## Evaluation method

Seven decision scenarios are registered in `tests/skill-eval-cell/calibration-scenarios.ts`. Each injects current on-disk skill content into a fresh Claude or Codex CLI session against a throwaway fixture. The baseline is `988eb4008e24e7c5cde2fc4a6141c6baf9e8f560`. Host defaults were used; no claim about a specific served model or reasoning tier is made.

```bash
bun run test:skill-eval-pack -- --id <scenario-id> --arm ab --hosts claude,codex --out <output-directory>
```

Grades check fixture reads and action/delegation trailers. All 14 final tests after the change passed those checks and independent review of the actual decisions. Semantic outcomes were read from transcripts; keyword grades alone are insufficient.

| Scenario | Observed baseline | Result after the change |
|---|---|---|
| `ce-doc-review/calibration-adjudication` | Initial Claude promoted the duplicate wording nit into grouped confirmation; Codex retained it as FYI. Both refuted the false ownership objection | Both rejected F1/F2/F4 and unnecessary remaining concerns; F3 stayed behind grouped confirmation; neither chose retention |
| `ce-doc-review/calibration-resume` | Not rerun on baseline | Both hosts reused complete unchanged evidence without another reviewer pass |
| `ce-pov/calibration-missing-framing` | Claude invented a provisional seven-day default; Codex returned Hold | Both returned essential missing product criteria without choosing retention or interviewing |
| `ce-pov/calibration-grounded-position` | Not rerun on baseline | Both chose the existing ownership helper from verified requirements and source |
| `ce-work/calibration-followup` | Both allowed helper reuse and deferred retention; old residual policy led to an interactive menu | Both allowed helper reuse and kept unapproved retention outside the independent authorized outcome |
| `ce-work/calibration-required-decision` | Not rerun on baseline | Both blocked when automatic deletion became a required outcome but its retention period remained unapproved |
| `ce-code-review/calibration-lead` | Not rerun on baseline | Both rejected the disproven ownership claim and hypothetical class hierarchy, including residual/deferred variants |

Final document-review output differed on the already-recorded retention fork: Claude declined to re-raise it because it did not block this plan; Codex retained one manual Defer item. Both preserved the unresolved choice and made no edit. This is presentation variation, not evidence of identical decision counts.

An intermediate Codex work run passed the keyword grade but incorrectly treated unrelated retention as a shipping blocker. The final residual gate was restated around the required outcome, then tested on both the nonblocking and required-decision cases. Both hosts distinguished those cases in the final runs. The work fixture was also corrected to include an actual duplicated condition in `src/endpoint.js`; the original task could be interpreted as editing plan wording instead of code. The corrected fixture was run on both baseline and post arms.

## Validation and limits

- Full `bun run test`: 3,726 passed, zero failed. The first run caught three contract/catalog mismatches, which were corrected before the passing full run.
- After final residual-gate and schema-description edits: 237 targeted tests passed, zero failed.
- `bun run release:validate`, `bun run plugin:validate`, and `git diff --check` passed.
- `ce-simplify-code`: three independent code reviewers completed. Shared fixture-read checks and parallel test-file reads were adopted; no unnecessary evaluation selector was added. New rows use the existing catalog and completed cohort. No separate lint or typecheck command is configured in package scripts.
- These tests check decisions and routing. They do not test dispatching real reviewers, interactive UI, edits, or shipping. They do not prove end-to-end interruption counts, false-apply rates, or equivalence with other autonomous workflows. No activation behavior changed. Existing LFG-specific apply policy and unrelated legacy reviewer protocols remain outside this change.

Raw local evidence is under `/var/folders/yr/rc1_m71d72zcl3zxwsdd75400000gn/T/ce-calibration-eval-yELaGj/`: `final-doc`, `final-code`, `final-work-residual`, `final-work-blocker`, and the original post POV/resume directories. Intermediate results are retained for audit; final runs supersede them where noted.
