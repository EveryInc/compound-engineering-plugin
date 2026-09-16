---
name: ce-code-review
description: "Review a named diff or PR for bugs, regressions, tests, and standards. Use when asked to review code or when a shipping skill needs a review receipt. Use when asked to apply this review's findings locally. Use ce-resolve-pr-feedback for feedback already left on a PR."
argument-hint: "[mode:agent] [apply:local] [blank to review current branch, or provide PR link]"
---

# Code Review

Help the caller deliver a correct change within the agreed scope: find defects whose consequences justify action, judged against intended behaviour and project requirements rather than a preferred rewrite. An adequate change needs no findings.

**Done when:** required review and validation are complete, retained findings are supported by the source, and the caller has a clear result with any remaining coverage limits.

## Execution spine

Follow these steps in order; the references supply the detail but never change the order. Read each reference when you enter the step it governs; a read made earlier does not satisfy it, and a reference you only hand to a leaf is not one you read.

1. Read `references/modes-and-output.md` first. It settles arguments, conflicts, the quick-review short-circuit, the Review depth gate, and what this invocation returns.
2. **Stage 1.** Read `references/scope.md`, resolve the reviewed diff, scope mode, and deterministic scope signals, then apply that Review depth gate before Stage 2. Lite ends the run without the later spine references; lite and focused each run from this context by `references/depth-paths.md`.
3. **Stage 2.** Read `references/intent-and-plan.md`, write the intent summary every reviewer receives, and discover the plan Stage 6 verifies requirements against.
4. **Stage 3.** Read `references/persona-catalog.md` and `references/select-and-route.md`, then select the reviewers the change's risks call for, find the applicable standards files, and decide how the adversarial review will run.
5. **Stage 3d.** When adversarial is selected for a local reviewed tree, start and persist the sanctioned cross-model job `references/cross-model-review.md` defines, **before any local persona dispatch**. Invoking this skill authorizes its configured or allowlisted peer route once the required disclosure of recipient and exfiltrated code is made; do not ask twice or skip the peer because the user did not repeat it. An explicit user prohibition on external review overrides it, as does `cross_model_review_mode: off` with no live opt-in. A started peer replaces the local adversarial persona at this stage; only a real failure to scope, allowlist, reach, authenticate, or start it leaves the local fallback in the roster, and a later stage may restore it under the conditions that reference states.
6. **Stage 4.** Read `references/dispatch-reviewers.md`. Dispatch the selected local reviewers as one concurrent batch collected in this turn, sized to the host's active-agent cap. Every successful launch is collected only when its terminal outcome is in hand: a valid compact return is consumed, a tool error or malformed output is recorded as a failed reviewer, and a launch acknowledgement alone is not a result. Use the host's blocking collection capability for asynchronous receipts within the bound that reference states, after which an uncollected reviewer is a failed reviewer; a terminal outcome may arrive as the call's return, a blocking wait's return, or a host-delivered terminal message that names the launch and carries its payload; a progress update is not one. If launched work cannot be collected reliably, stop it; for any persisted peer (the cross-model job) run the cleanup its reference describes before returning the failure result. Never end the turn on progress to await it. Detaching local review into a polled background job is forbidden; the cross-model peer is the only detached work and may overlap this batch.
7. **Stages 5 and 6.** Once every reviewer result is in, write the finish input `references/finish-input.md` defines and stay in that reference: it owns the validator launch and the run-artifact list. Dispatch in sequence the two leaf subagents it names, each seeded with `references/finish-review.md`, which the leaves read from disk and you do not open: a merge leaf that folds in the peer's findings once and merges from the run dir, then, after you launch and collect the validator it selected, a report leaf that renders the report. Neither leaf launches a subagent; you launch every one. Emit the report leaf's return verbatim as this skill's response. Never synthesize directly from raw reviewer artifacts, and never merge or render in the dispatch context; emit only this skill's report rather than also invoking a harness-native findings tool, which belongs to the quick-review short-circuit alone.

<!-- ce-worker-profiles:start -->
**Named worker profiles for generic subagent dispatch (optional, two authority classes).**

- **Resolve** `subagent_read_profile` for children that do not mutate tracked project content (writing per-run scratch artifacts stays read class) and `subagent_write_profile` for children that do, from `<repo-root>/.compound-engineering/config.local.yaml` then `config.yaml` per the ordinary two-file config rule. Names are opaque host-defined strings: never invent, validate, or default them, and the selector derives only from the resolved keys - never from dispatch content, PR text, reviewer output, or a child's own request.
- **Choose the class per dispatch call**, by the project authority that child needs; a cheaper profile must never be given write work.
- **Apply only where the host's dispatch primitive accepts a named worker profile** for an otherwise generic dispatch that still receives this file's prompt payload - on Devin, `run_subagent`'s `profile` argument, where a configured name substitutes for the built-in profile the call would otherwise use. A typed or registered-agent selector is not a worker profile and stays excluded; where no such selector exists the keys are inert and dispatch is unchanged.
- **A resolved profile supersedes this surface's model selection for that dispatch's class** - tier override or session-model inheritance alike; the profile carries the model and tool policy, so never pass both.
- **Fail transparently.** Where the host exposes the available profile set, confirm the name resolves before dispatch. A rejected, unknown, or unresolvable name follows this surface's ordinary dispatch-failure rule and is named in the coverage or degradation note. Never report a profile or model as having run when it did not serve.
- **Unset keys are a strict no-op:** dispatch exactly as today on every host.
<!-- ce-worker-profiles:end -->

## Operating principles

- **Report-only by default; never push.** `mode:agent` never mutates the tree, even nested in a workflow that later applies findings. Entering the apply stage requires `apply:local` or an explicit user request to apply or fix this review's findings. Never push, open PRs, or file tickets in any mode.
- **No blocking prompts.** Never use `AskUserQuestion` or other blocking question tools; note uncertainty in Coverage or the verdict rather than stopping to ask.
- **Explicit mutations only.** Never run `gh pr checkout`, `git checkout`, `git switch`, or similar branch-switch commands; a PR number or branch name selects review scope, not tree authority.
- **Report outcomes, not machinery.** Show the coverage, findings, and the independent cross-model pass; dispatch bookkeeping stays out of user-facing text. Never claim more about the peer than its receipt attests.
