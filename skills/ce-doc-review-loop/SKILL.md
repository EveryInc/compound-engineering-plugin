---
name: ce-doc-review-loop
description: Converge a document through bounded, evidence-gated review waves. Use for multi-contract documents, repeated review rounds that produce adjacent findings, or stale zero-finding evidence. Use `ce-doc-review` directly for a first review of a single-contract document unless findings reveal cross-contract impact.
argument-hint: "[mode:non-interactive] [max-work-units:N] <path/to/document.md>"
---

# Document Review Loop

Converge cross-cutting documents faster by preparing coverage once, remediating findings by contract family, and reserving whole-document review for stable evidence gates.

**Result:** the product document at a fingerprint whose fresh full-document `ce-doc-review` gate returns zero material findings and zero document-changing fixes, plus one convergence envelope. **Next consumer:** the user or the caller that requested the review. **Done:** the success envelope, or `Non-converged` with every envelope field populated, including the blocking reason.

**REQUIRED SUB-SKILL:** Invoke `ce-doc-review` through the host's normal skill-invocation mechanism for every review wave. Do not copy, paraphrase, or reimplement its persona selection, dispatch, synthesis, classifications, auto-fix rules, interaction model, or cross-model behavior.

## Setup

Run this once at the start of this invocation, before any subagent or sub-skill dispatch, and follow the directives it prints — except where one conflicts with this skill's own rules on asking the user questions, including `mode:non-interactive`, in which case this skill's rules win and no blocking question is asked. Run the fence exactly as written as its own command: do not pipe, filter, truncate, redirect, chain, or wrap it in command substitution. Its output opens with `=== skill context` and ends with `CE_CONTEXT_END`; if exactly one marker is present, rerun the fence verbatim once. Otherwise never rerun it in the same invocation.

```bash
SKILL_DIR="<absolute path of the directory containing the SKILL.md you just read>";
NODE="$(for c in node nodejs; do command -v "$c" >/dev/null 2>&1 && "$c" -e '' >/dev/null 2>&1 && { echo "$c"; break; }; done)";
if [ -n "$NODE" ]; then
"$NODE" "$SKILL_DIR/scripts/context.mjs" || echo "context script failed; continue with the skill's normal behavior";
else
echo "no Node runtime; continue with the skill's normal behavior";
fi
```

## Input and Mode

- Require one readable document path. Missing path: ask in interactive mode; in non-interactive mode return the `Non-converged` envelope with `input: missing_document_path`, `loop_protocol: not_run`, and `ce-doc-review: not_run`.
- `mode:non-interactive` suppresses all loop-owned questions without lowering evidence or coverage standards. A decision that requires user judgment remains a blocker and produces `Non-converged`; non-interactive mode does not promise convergence for decision-bearing documents.
- Optional `max-work-units:N` sets a circuit breaker. Default: `16`. `N` must be an integer of 2 or greater, with no upper bound; invalid values fail clearly before Wave 0 and return the `Non-converged` envelope with `input: invalid_max_work_units`, `loop_protocol: not_run`, and `ce-doc-review: not_run`.
- Strip `max-work-units:N` and the caller's document path before invoking `ce-doc-review`; always pass `mode:non-interactive` and the disposable snapshot path.
- Review markdown documents only. For HTML or another format, return the `Non-converged` envelope with `input: unsupported_document_format`, `loop_protocol: not_run`, and `ce-doc-review: not_run`.

## Workflow

Resolve `references/loop-protocol.md` and `scripts/loop-state.mjs` relative to the directory containing this `SKILL.md`, then read and execute the protocol in order. Use the bundled helper for every fingerprint, run initialization, physical-target resolution, and product commit; invoke one argv command per operation and interpret its JSON result outside the command. If the protocol or helper is missing or unreadable, return the `Non-converged` envelope with `loop_protocol: unavailable` and the observed reason. Load the canonical `ce-doc-review` through the host's callable skill mechanism; a generic task, agent, inline persona pass, or reconstructed review is not a substitute. If the named skill cannot start, return the `Non-converged` envelope with `ce-doc-review: skill_unreachable`, the observed reason, and the copyable user-runnable handoff the protocol's Pass 1 step 3 defines.

1. **Wave 0:** initialize a secure fresh run with the helper, freeze the raw Markdown bytes, and record the helper's SHA-256 plus resolved physical target identity (`realpath`, `dev`, and `ino`). Inventory normative statements and cross-references, classify the document as single-contract only when all items share one authority, lifecycle, and proof boundary, and otherwise classify it as multi-contract. Always prepare the Contract Matrix, mapping every normative statement, explicit requirement, contract, cross-reference, and proof obligation to a cell; unmapped items are blockers. Treat the canonical `ce-doc-review` caller receipt's selected in-process roster as the authoritative selection output; do not reconstruct or reimplement persona selection. For a multi-contract document, also prepare the Change-Impact Graph, stable vertical slices, and proof obligations. For a single-contract document, add those structures only when inventory or findings reveal cross-contract edges, adjacent transitions, runtime proof needs, or connected remediation.
2. **Pass 1:** materialize the frozen raw bytes in the helper-returned disposable snapshot directory and invoke `ce-doc-review mode:non-interactive <snapshot-path>`. Define `reviewed_fingerprint` as SHA-256 of the frozen bytes supplied to the sub-skill and `result_fingerprint` as SHA-256 after all sub-skill-applied fixes. The receipt must include those fingerprints, selected and completed reviewers, failed/timed-out/malformed reviewers, document-changing fix count, and terminal status. Treat each `Applied N fixes` entry (`section`, change description, reviewer attribution) as the mandatory fix identity record. The loop caller derives the exact frozen-to-result diff from the two snapshots, attributes every changed hunk to those entries by section, and records the mapping in run state; `ce-doc-review` need not emit byte diffs. Reject missing receipts as entry failures; discard integrity-failed waves. Commit validated changes only through the helper using the frozen digest and target identity. A helper `concurrent_change` result discards the snapshot without product mutation. Count every started canonical wave as one work unit.
3. **Pass 2:** group only findings whose quoted evidence and section/title identity still match the validated result snapshot; stale pre-fix findings must be revalidated before remediation. For each defect family, stage evidence-supported mechanical changes in the disposable snapshot directory, record the complete before/after diff, and commit only with the helper's atomic compare-and-replace command using the latest expected fingerprint, realpath, device, and inode. A `concurrent_change` result is a failed cycle: delete staged bytes, preserve the product unchanged, and never retry from a stale expectation. Commit only after the staged result accounts for every byte change and preserves product behavior, scope, priority, and settled decisions. Any diff that touches behavior, scope, priority, product shape, or a settled decision requires explicit user resolution. Observe `ce-doc-review` fixes through the validated disposable snapshot, caller envelope's applied-fix list, and exact diff; never apply them a second time. Close the changed Remediation Neighborhood before the next global wave. Count each defect-family remediation cycle as one work unit.
4. **Subsequent waves:** use focused evidence checks to close affected slices and graph-connected neighbors, then invoke the canonical full-document `ce-doc-review` gate on a new disposable snapshot; the canonical sub-skill has no slice-scoped invocation contract, so never claim a partial invocation was a canonical wave.
5. **Final gate:** run the Final Convergence Gate in `references/loop-protocol.md`. It normally needs a fresh full-document disposable-snapshot review; a Pass 1 wave that applied no fixes already examined the final bytes and may serve as the gate itself. Any result fingerprint other than the unchanged final fingerprint starts a remediation cycle and requires another final review.

## Interaction Rules

- Observe and record `safe_auto` changes already applied by `ce-doc-review`; never apply them a second time.
- Interactive loop: use the platform's blocking-question capability for unresolved `gated_auto`, `manual`, or product decisions. If unavailable, present bounded numbered choices in chat and wait. If the runtime cannot pause for input, preserve the decision as a blocker and return `Non-converged`.
- Non-interactive loop: do not guess. Keep unresolved decisions as blockers and return `Non-converged`.
- A user may explicitly accept a bounded residual only when it names the affected contract or proof, impact boundary, owner, expiry or review trigger, and fail-closed behavior. Record it durably in the Contract Matrix and run ledger, bind it to the current fingerprint, and state which specific matrix cell, graph edge, or proof obligation it satisfies. Required in-process reviewer failures, timeouts, malformed returns, and missing caller-receipt fields are non-waivable coverage blockers. Optional cross-model peer failures remain report-only unless `ce-doc-review` explicitly classifies the peer as required.

## Circuit Breaker

Do not optimize for a round number. The work-unit limit prevents an accidental infinite loop; it does not turn incomplete evidence into success. One work unit is either one global `ce-doc-review` wave or one defect-family remediation cycle. A wave or cycle discarded on validation mismatch still consumes its unit. Check the remaining budget before starting either unit. A final gate that completes successfully as the last permitted unit may emit the success envelope; exhaustion produces `Non-converged` only when no successful final gate has completed.

When `max-work-units` is exhausted without a successful final gate, stop and report:

```text
Non-converged
Document: <path or none-supplied>
Input: <valid, missing_document_path, invalid_max_work_units, or unsupported_document_format>
Final reviewed fingerprint: <fingerprint, unavailable when no hashing command could run, or not_reached when the run ended before any fingerprint was taken>
Completed work units: <N global waves + remediation cycles>
Open contract cells: <list>
Unreviewed remediation neighborhoods: <list>
Reviewer coverage gaps: <list>
loop_protocol: <available, unavailable + reason, or not_run>
ce-doc-review: <complete, integrity_failure, skill_unreachable, or not_run>
Unresolved decisions: <list>
Next bounded wave: <slice + graph-connected neighbors + required ce-doc-review gate; the copyable ce-doc-review handoff when the skill is unreachable; or the corrected invocation when Input is not valid or loop_protocol is not available>
```

## Completion Output

On success:

```text
Review loop converged
Document: <path>
Review waves: <N>
Defect families remediated: <N>
Final snapshot: unchanged after review
Final ce-doc-review: zero material findings, zero document-changing fixes
Coverage: complete for applicable reviewers and proof obligations
Accepted residuals: <none or list>
```

On failure, use the `Non-converged` envelope. Never describe a timed-out reviewer, post-review edit, open matrix cell, or unresolved manual decision as convergence.

## Common Mistakes

| Mistake | Correct response |
|---|---|
| Keep running whole-document review after every small edit | Close the changed Remediation Neighborhood first |
| Treat one zero-finding pass as completion | Verify it reviewed the final unchanged snapshot with complete reviewer coverage |
| Copy `ce-doc-review` internals into this skill | Invoke the canonical sub-skill |
| Apply manual/security/product decisions automatically for speed | Ask interactively or remain non-converged |
| Treat `max-work-units` as a quality threshold | Use it only as a circuit breaker |
| Count fixes or declining severity as evidence | Close matrix cells, graph edges, proof obligations, and final-snapshot coverage |

## Red Flags

- “One more global review should be enough.”
- “The document changed only a little after the zero-finding pass.”
- “The failed reviewer probably would have agreed.”
- “The plan is detailed, so preparation is redundant.”
- “We hit the work-unit limit, so call it done.”

All mean: stop, inspect the contract coverage and snapshot validity, and return `Non-converged` unless the final gate actually passes.
