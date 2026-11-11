# Who chooses document-review fixes

## Change and permissions

Doc review now chooses how to implement or verify an agreed outcome within existing permission. Several workable fixes, or a finding raised only by another model, no longer automatically require a separate user decision. Before asking the user, the lead agent must identify the missing choice or information and explain how it would change the result.

Choosing a fix does not give permission to edit. Changes to meaning still need approval together. Only a mechanical correction with one right answer and confidence 100 may apply silently. A finding raised only by another model cannot apply silently; the lead agent's investigation does not count as another independent review. Changes to the agreed outcome, its constraints, or a choice the user reserved remain with the user.

Every retained item, including FYI, needs a current reason to matter. An earlier label is not evidence. Asking for more explicit wording is not a defect when an existing rule already covers the case.

## Why the earlier rules changed

Commit `421a33781` required separate user decisions when fixes had alternatives or only another model raised the issue. Those rules protected choices reserved for the user. The U14 record in `2026-08-12-003-fix-doc-review-decision-clustering-plan.md` showed that allowing silent edits to meaning caused agents to make product decisions for the user. Approval for those edits remains required. The new rule asks who can choose the fix, separately from who can approve the edit.

Sections 3.6/3.7, reviewer instructions, schema, walk-through, and tests now use the same rule. It replaces repeated lists of qualifying cases. The rules still protect mechanical corrections, changes to meaning, intentional visual aids, and findings raised only by another model. The reasons for the old rules were checked before replacing them. Unrelated intake, display, reviewer execution, and interaction instructions were left alone.

The shared authoring standard explains why choosing a fix and approving an edit are separate. That standard and this report preserve the reasoning, so a separate learning document is unnecessary.

## Scenarios and method

- `ce-doc-review/ownership-transcript`: the real basketstar review rendered on 2026-09-07 and its pre-review plan, frozen as a fixture. The review is a rendered transcript, not raw reviewer returns. Repository claims unavailable in this isolated fixture must not be described as freshly verified.
- `ce-doc-review/ownership-boundary`: an isolated helper-reuse proposal raised only by another model with two behavior-equivalent remedies, paired with mandatory automatic deletion whose retention period remains unapproved. The first is an agent-owned remedy; the second requires user input even with independent agreement supported by evidence.

The before version is `1caa4d73`, the previously pushed change. The after version uses working-tree skills loaded into fresh Claude and Codex CLI sessions. No model override was supplied, so these results do not establish how a specific model tier performs. Runs were read-only and stopped after deciding which findings to keep and how to handle them. The actual decisions were reviewed; keyword checks alone do not determine success.

The catalog now uses main-branch commit `153e605e1622154a0d7da095fceed13edcb68bf7` for future baseline runs. The rebase left `1caa4d73` outside the history available to fresh checkouts, and a replacement on this feature branch could disappear after a squash merge. Future comparisons therefore measure the full PR against its main-branch baseline, not just the later ownership change. The historical results below still describe runs against `1caa4d73`; they are not results for the replacement baseline.

Raw artifacts: `/var/folders/yr/rc1_m71d72zcl3zxwsdd75400000gn/T/ce-doc-ownership-eval-sOGtOx/`.

## Iterations and exclusions

The first boundary attempt reused a fixture containing unrelated reviewer returns, which Claude folded into the answer. The `boundary-pre` and `boundary-post` directories are excluded. The final catalog uses a separate fixture with only the required plan and source evidence.

The first post-change transcript replay on Claude retained seven user decisions, down from ten, but still called a validation-method correction a user commitment and retained all five FYIs. This was insufficient. The ownership condition was restated around the agreed outcome and constraints, and every retained finding now needs a current justification. `transcript-post` is an intermediate result, not final evidence. `boundary-isolated/pre` supplies the clean boundary baseline; final results use `transcript-final` and `boundary-final`.

## Behavioral results

Independent review of the actual decisions found the focused ownership change effective on both hosts. In each baseline, E1 became a user decision because it was raised only by another model and had a viable alternative. In each final run, E1 became a grouped proposal while E2 remained a user decision. Both hosts preserved the restriction against silently applying findings raised only by another model and made no edits or dispatches.

| Scenario | Host | Baseline | Final |
|---|---|---|---|
| Ownership boundary | Claude | E1 failed, E2 passed | Both passed |
| Ownership boundary | Codex | E1 failed, E2 passed | Both passed |
| Real transcript | Claude | Failed: 10 user decisions, all 5 FYIs retained | Failed, improved: 4 decisions, 3 FYIs retained |
| Real transcript | Codex | Failed overall: 2 user decisions; resolves eval method and drops all FYIs | Ownership routing improved: 0 decisions; overall failed checks for unnecessary findings |

The final Claude replay remains over-prescriptive: it invents a numeric density threshold, retains unsupported FYIs, and still treats verification of existing goals as user-owned. It describes 11 grouped items but closes with a count of six. These are failures, not successful autonomy because the question count fell. The baseline Codex replay also wrongly reports the historical U6 correction as present in the pre-review snapshot.

The final Codex replay resolves all surviving remedies without individual user decisions and preserves grouped confirmation. It nevertheless adds an explicit density-threshold proposal and retains the already-deferred regrowth risk as FYI. Its baseline dropped both, so those are observed regressions in rejecting unnecessary findings in this single comparison. Zero questions is not a pass when unnecessary proposals remain.

The focused authority distinction is validated; full calibration of the historical review is not. The fixture remains in the catalog to expose that gap. These results do not justify silently applying more fixes or reporting the real example as solved.

## Mechanical and static validation

- Full suite: 3,756 passed, zero failed.
- After the final prose restatement: 76 pipeline-contract and catalog tests passed.
- Release metadata and strict plugin validation passed.
- Fresh-reader review found no material ambiguity or contradiction in the rewritten rules for choosing fixes and keeping findings.
- `ce-simplify-code`: no changes applied. Reuse and efficiency reviewers found no issues. Two quality suggestions were skipped: extracting two equal baseline literals offered no material benefit; adding more keywords to the grading checks would not establish correct decisions about how to handle findings. Independent review of the actual decisions covers both control findings. Fixture duplication is intentional and keeps each copied workspace self-contained. No lint or typecheck scripts are configured.

## Limits

These tests, run once per scenario and host, measure which findings are kept and how they are handled. They do not measure reviewer generation, live cross-model dispatch, end-to-end confirmation or mutation, or equivalence to other autonomous workflows. Counts indicate reader burden only when the retained items are justified and authority is preserved; fewer questions alone is not the pass criterion.

## Plain-language pass, 2026-09-08

Reviewed the branch's added prose across guides, skill instructions, and evaluation reports. Replaced terms such as “adjudicate claims” and “missing framing” with explanations of what the agent should check and what context it needs. Kept machine-readable fields and historical transcript fixtures intact. The displayed POV result now says `Blocked — missing context`; its test was updated to match.

The full suite passed: 3,921 tests, zero failures. Release metadata and strict plugin validation also passed. A fresh reader checked the rewritten instructions for ambiguity and reviewed outputs from fresh Claude and Codex sessions using the current files.

Both hosts passed the five smaller scenarios covering document-review ownership, missing POV context, required and optional work decisions, and unsupported code-review findings. The larger transcript replay produced different results:

| Host | Result |
|---|---|
| Claude | Still fails calibration: four user decisions and four FYIs, including weak concerns and an invented numeric threshold. It claims 12 proposals but lists 11. |
| Codex | Passes the targeted transcript checks in this run: ten grouped proposals, no separate user decisions or FYIs, and no unsupported numeric threshold. |

Both preserved the no-edit boundary. Explanations were readable, but some narration still used terms such as “nonblocking residual” and “invocation-parity contract.” These runs do not establish jargon-free ordinary chat or fully solved review calibration. Only the current version was rerun here; the earlier comparisons above remain separate evidence.

Raw artifacts: `/var/folders/yr/rc1_m71d72zcl3zxwsdd75400000gn/T/ce-plain-language-7fv5xE/`.

## Shared writing guidance follow-up, 2026-09-08

Aligned the authoring standard, `ce-skill-work`, `ce-noslop`, and the nearby document-review, code-review, and POV output instructions. Necessary technical terms and exact identifiers remain protected; internal workflow jargon should become the action or consequence it means. The document-review summary now distinguishes completed changes, pending approval, and questions requiring judgment. Its previous presentation wording conflicted with the existing approval rules. Required fields, identifier limits, and approval gates remain in place. Tests record those contracts; their incidental wording was updated where needed.

The new terminology guidance lives in `ce-noslop/references/terminology.md`, explicitly loaded from the kernel, to respect its existing 4,096-byte limit without compressing the prose. Both fresh hosts read that reference and passed the jargon scenario while preserving technical settings, uncertainty, and the required status token. A separate protected-content check on the initial inline version preserved quotes, code, and links on both hosts.

The summary scenario passed on Codex. Claude distinguished one applied fix, two proposed fixes awaiting approval, and no judgment decisions, but invented dependency-installation details and requested confirmation despite the test's restriction. That run fails source fidelity and instruction following; correct approval wording alone is not a pass. A fresh reader found no source-guidance defect and caught one stale location reference after the terminology paragraph moved; it now points to `SKILL.md`.

Fresh-run artifacts under the OS temporary directory:

- `ce-skill-eval-pack-2026-09-08T23-04-20-807Z-gddmXz`: final terminology guidance.
- `ce-skill-eval-pack-2026-09-08T23-02-24-715Z-kn5LV6`: approval versus judgment summary.
- `ce-skill-eval-pack-2026-09-08T23-03-06-311Z-Yp3J7I`: protected content on the inline version.

This remains a bounded writing-guidance change, not a full skill sweep. Broader presentation rules and unrelated skill instructions were left for separate work. No implementation logic changed; the added evaluation rows are declarative test data, so code simplification was not applicable. The shared standard and this report preserve the reasoning without a separate learning document.

Final mechanical validation: 3,922 tests passed, zero failed. Release metadata, strict plugin validation, and `git diff --check` passed. The only edit after the full suite was the terminology reference’s location clarification and this validation record.
