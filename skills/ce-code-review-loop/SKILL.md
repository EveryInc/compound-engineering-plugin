---
name: ce-code-review-loop
description: Use when a clean current local branch needs bounded review-and-repair cycles before a merge decision, especially when fresh canonical review evidence is required after fixes.
argument-hint: "[base:<ref>] [plan:<path>] [max-work-units:N]"
---

# Code Review Loop

Converge the current local branch through canonical review waves and narrowly authorized, verified remediation commits.

**Result:** a committed final HEAD whose fresh canonical full review says `Ready to merge` with no actionable findings, followed by passing project verification. **Next consumer:** the user or caller deciding whether to push or open a PR. **Done:** the complete success envelope, or a fully populated `Non-converged` envelope naming the blocker and next bounded cycle.

**REQUIRED SUB-SKILL:** Invoke `ce-code-review` through the host's callable skill mechanism for every global review wave. It is the sole review engine. Do not copy, paraphrase, reconstruct, or partially imitate its reviewer selection, dispatch, cross-model routing, synthesis, confidence gates, validation, severity, grouping, or action routing.

## Setup

Run this once at the start of this invocation, before any sub-skill or subagent dispatch, and follow the directives it prints except where they conflict with this skill's fail-closed interaction rules. Run the fence exactly as written as its own command: do not pipe, filter, truncate, or bundle it. Its output opens with `=== skill context` and ends with `CE_CONTEXT_END`; if exactly one marker is present, rerun the fence verbatim once. Otherwise never rerun it in the same invocation.

```bash
SKILL_DIR="<absolute path of the directory containing the SKILL.md you just read>";
NODE="$(for c in node nodejs; do command -v "$c" >/dev/null 2>&1 && "$c" -e '' >/dev/null 2>&1 && { echo "$c"; break; }; done)";
if [ -n "$NODE" ]; then
"$NODE" "$SKILL_DIR/scripts/context.mjs" || echo "context script failed; continue with the skill's normal behavior";
else
echo "no Node runtime; continue with the skill's normal behavior";
fi
```

## Input and Preflight

- Operate only on the **current local branch** and its current working tree. Accept optional `base:<ref>`, optional `plan:<path>`, and optional `max-work-units:N`.
- Reject a PR number, PR URL, branch target, or any other request to review or mutate a different checkout. Reject detached HEAD. Never switch scope to make an invocation work.
- Require a clean entry state: no staged, unstaged, or untracked changes. A dirty entry returns `Non-converged` before the first review and before mutation.
- Resolve `base:<ref>` once to a commit, then compute the diff merge base between the starting `HEAD` and that resolved commit. If omitted, first choose the repository's normal comparison ref. Freeze the helper's returned concrete merge-base SHA for the entire invocation; a supplied branch tip or direct SHA is an input to merge-base resolution, not itself the frozen diff base.
- Record the branch, frozen merge-base SHA, and **immutable starting HEAD**; never overwrite the starting HEAD in run state. Any later branch drift, unexpected HEAD drift, or tree change outside the active loop-owned remediation cycle is concurrent user work: preserve it and stop.
- `plan:<path>` must be readable when supplied and is forwarded unchanged to every canonical wave.
- `max-work-units:N` is optional. Default: `8`. It must be an integer from 2 through 10. Invalid or conflicting input fails before the first wave with a populated `Non-converged` envelope.

Use the bundled deterministic helper for the Git mechanics it owns; do not improvise them:

```bash
"$NODE" "$SKILL_DIR/scripts/loop-state.mjs" preflight --repo <path> --base <ref>
"$NODE" "$SKILL_DIR/scripts/loop-state.mjs" validate-review --repo <path> --expected <json-file> --review <json-file>
"$NODE" "$SKILL_DIR/scripts/loop-state.mjs" validate-final --repo <path> --expected <json-file> --review <json-file>
"$NODE" "$SKILL_DIR/scripts/loop-state.mjs" cycle-checkpoint --repo <path> --state <json-file> --paths-json <json-file> --verification-json <json-file>
"$NODE" "$SKILL_DIR/scripts/loop-state.mjs" cycle-restore --repo <path> --state <json-file>
"$NODE" "$SKILL_DIR/scripts/loop-state.mjs" cycle-commit --repo <path> --state <json-file> --message <message>
```

Resolve the helper only through the loaded `SKILL_DIR` anchor. `preflight` must resolve `<ref>^{commit}`, compute `git merge-base HEAD <resolved-ref>`, and return one JSON object with `{status,input,branch,base_sha,head_sha,clean}` before any review or mutation. A missing commit or missing merge base is fail-closed `invalid_base`. Freeze the valid branch and returned merge-base SHA, and preserve the returned starting HEAD as immutable run history. Before **every** canonical wave, generate a per-wave expected JSON from the current clean checkpoint HEAD; never reuse the starting-HEAD expected JSON after a remediation commit.

## Workflow

Resolve `references/loop-protocol.md` relative to this `SKILL.md`, read it only when entering the workflow, and execute it in order. If it is unavailable, return `Non-converged` with the observed reason. This skill may reference only assets inside its own directory; invoke the named canonical skill through the host's **callable skill mechanism**, not by reading or reaching into another skill's files.

1. Perform the protocol's secure run-state setup. Invoke `"$NODE" "$SKILL_DIR/scripts/loop-state.mjs" preflight --repo <path> --base <ref>` and freeze the returned concrete merge-base SHA, branch, and immutable starting HEAD only when `status: "ok"`, `input: "valid"`, and `clean: true`.
2. Before every canonical wave, checkpoint the clean branch and current HEAD, then write a new per-wave expected JSON containing the frozen branch/base SHA and that **current checkpoint HEAD**. Spend one work unit and invoke exactly `ce-code-review mode:agent depth:full grouping:auto base:<resolved-base-sha>` through the callable skill mechanism, appending `plan:<path>` only when supplied. A generic task, reviewer agent, built-in review, inline pass, or reconstructed pipeline is **not a substitute**.
3. Persist the exact canonical payload, then invoke `"$NODE" "$SKILL_DIR/scripts/loop-state.mjs" validate-review --repo <path> --expected <json-file> --review <json-file>`. Discard `malformed`, `coverage_gap`, `failed_review`, or `concurrent_change` results as convergence evidence. Ordinary valid waves require matching canonical `complete` status and full required-reviewer coverage, but may return any canonical verdict so `Ready with fixes` and `Not ready` remain usable for remediation.
4. Revalidate the exact `actionable_findings` against current HEAD, requiring every actionable object to remain canonically deep-equal to its source full finding, then partition them into independent mechanical defect families and decision-bearing blockers. Never treat triage organization as mutation authority.
5. Within the remaining scope and work-unit budget, remediate all independent mechanical families allowed by the bounded invocation, one family per cycle. Intended paths may include safe missing leaf files with existing repository parents. Invoke `cycle-checkpoint` before edits, run the outer skill's chosen verification, write its exact JSON outcome, invoke `cycle-restore` on failure so existing-before bytes/modes are restored and loop-created missing-before files are deleted, and invoke `cycle-commit` only on success with an exact intended diff path set. `cycle-commit` must compare the committed tree to its verified staged snapshot; a `commit_integrity_failure` preserves any created commit and all observed bytes, then stops the protocol `Non-converged`. Do not manually substitute Git transaction recipes.
6. After those bounded mechanical families, if any decision blocker remains, stop and return `Non-converged`; never guess or converge through it. A blocker does not erase already verified independent mechanical commits.
7. **Any remediation commit invalidates every prior convergence claim. The next review unit must be a fresh canonical full review of the new HEAD with a newly generated per-wave expected JSON.** Reduced counts, lower severity, and passing checks are progress only.
8. Stop on `commit_integrity_failure`, other integrity failure, concurrent change, verification/commit failure, oscillation, or circuit-breaker exhaustion. Never amend or reset a created commit after an integrity mismatch. Otherwise repeat until the unchanged final HEAD's canonical payload passes `validate-final --repo <path> --expected <json-file> --review <json-file>`, then run final project verification.

If the canonical skill is unreachable, do not imitate it. Return `ce-code-review: skill_unreachable` and include one copyable user-facing invocation in the active harness form using `mode:agent depth:full grouping:auto base:<resolved-base-sha>` and the optional plan.

## Authority and Interaction

- Automatic repair authority covers **mechanical** findings only: repository evidence already establishes both the defect and required behavior, and verification can prove the fix without choosing new semantics.
- Product or design choices, public compatibility decisions, migration or rollout policy, unavailable external authority, and behavior not provable from repository evidence are decision-bearing blockers; do not guess through them. Return `Non-converged` with bounded decision context.
- Independent mechanical families may be committed before stopping for a decision blocker, but their completion never waives that blocker.
- Mutation is limited to the active defect family and its necessary callers, tests, fixtures, types, and contract documentation. Create exactly one **local commit** per verified family, normally `fix(review): <root cause>` or the repository's nearest valid convention.
- Never push, rebase, create a worktree, check out another branch, amend, squash, open a PR, file a ticket, or rewrite remediation commits.
- Do not ask the user to bless incomplete reviewer coverage, stale evidence, malformed receipts, or a dirty/concurrently changed tree. Those are non-waivable failures.
- A decision-bearing finding is never resolved inside this invocation. Return `Non-converged` with bounded decision context so the user can make the decision outside this invocation, then rerun the loop. This invocation never turns a decision-bearing item or later user reply into automatic repair authority.

## Circuit Breaker

`max-work-units:N` prevents runaway repair; it is not a quality threshold. One **global review wave** consumes one unit and one **defect-family remediation cycle** consumes one unit, including a failed or discarded unit. Check budget before starting either. A successful final gate may consume the last unit; exhaustion without that gate is `Non-converged`, never success.

## Success and Failure Envelopes

On success, emit exactly this populated shape:

```text
Code review loop converged
Branch: <branch>
Base: <sha>
Final HEAD: <sha>
Review waves: <N>
Remediation commits: <N>
Final ce-code-review: Ready to merge, no actionable findings
Verification: <checks and outcomes>
Residual advisories: <none or residual_risks, testing_gaps, and advisory outputs>
```

On every failure, emit exactly this populated shape; use `none`, `unavailable`, or `not_reached` rather than omitting fields:

```text
Non-converged
Branch: <branch or unavailable>
Base: <sha or unavailable>
Starting HEAD: <sha or unavailable>
Last reviewed HEAD: <sha or not_reached>
Completed work units: <N global waves + remediation cycles>
Open actionable findings: <stable IDs and summaries or none>
Decision blockers: <list or none>
Reviewer coverage gaps: <list or none>
Verification failures: <list or none>
Concurrent change: <none or observed branch/HEAD/path change>
ce-code-review: <complete, degraded, failed, skill_unreachable, malformed, or not_run>
Next bounded cycle: <exact canonical invocation, defect family, or user decision>
```

## Completion Rules

Converge only after `validate-final --repo <path> --expected <json-file> --review <json-file>` accepts a valid canonical `mode:agent depth:full` wave that reviews the final unchanged HEAD, returns `status: complete`, `verdict: Ready to merge`, an empty `actionable_findings` queue, complete required-reviewer coverage, and no decision blockers; the branch and clean working tree must still match the receipt, and final project verification must pass on that HEAD. Report residual advisories without mutating them. Never push.

## Common Mistakes

| Mistake | Correct response |
|---|---|
| Review human Markdown or reconstruct reviewer logic | Invoke canonical `ce-code-review` through the callable mechanism |
| Start from a dirty tree | Fail closed before review or mutation |
| Treat triage groups as the apply queue | Intersect stable finding numbers with `actionable_findings` |
| Apply a product decision as a straightforward fix | Preserve it as a decision-bearing blocker |
| Commit several unrelated families together | Verify and create one local commit per root cause |
| Call a reduced finding count or passing tests success | Run a fresh full canonical wave and final gate |
| Continue after branch, HEAD, tree drift, or `commit_integrity_failure` | Preserve the created commit and all bytes; stop `Non-converged` |
| Treat work-unit exhaustion as completion | Return `Non-converged` with the next bounded cycle |

## Red Flags

- “The reviewer names tell me which ones were required.”
- “The quoted line is close enough.”
- “The plan probably intended this behavior.”
- “The tree changed, but my files are still fine.”
- “Tests pass, so another full review is wasteful.”
- “Only advisories remain, so the verdict does not matter.”
- “The limit was reached; report the best state as done.”

All mean: stop, preserve evidence and user work, and return `Non-converged` unless the protocol's final gate actually passes.
