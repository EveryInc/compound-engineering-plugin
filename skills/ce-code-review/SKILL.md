---
name: ce-code-review
description: "Structured code review for bugs, regressions, tests, and standards. Use before PRs or when asked to review code. Use when the user asks to apply this review's findings locally. Not for resolving feedback already left on a PR; that is ce-resolve-pr-feedback."
argument-hint: "[mode:agent] [apply:local] [blank to review current branch, or provide PR link]"
---

# Code Review


## Artifact Root

<!-- ce-docs-root:start -->
**Resolve the CE artifact root `<root>` before composing any artifact path.**

- **Read** `docs_root` from `<repo-root>/.compound-engineering/config.yaml` only (`<repo-root>` = `git rev-parse --show-toplevel`). Do not read it from `config.local.yaml`. Unset -> `<root>` is `docs`, exactly as before.
- **Validate** a set value: a repo-relative directory whose real, symlink-resolved path stays inside the repo and is neither the repo root nor under `.git/`. Otherwise stop with an error naming `docs_root` and the value -- never fall back to `docs`.
- **Use** `<root>` as the sole artifact location: create it if absent, compose each path as `<root>/<subdir>` with this skill's own subdirectory, and never also read `docs`.
<!-- ce-docs-root:end -->

## Execution spine

Follow these steps in order; the references supply the detail but never change the order. Each reference named below is a required read for its step: load it before doing that step's work.

1. Read `references/modes-and-output.md` first. It settles what the arguments mean, which argument conflicts stop the run before any reviewer is dispatched, whether the quick-review short-circuit applies, and what this invocation returns.
2. **Stage 1.** Read `references/scope.md` and resolve the reviewed diff, the scope mode, and the deterministic scope signals.
3. **Stage 2.** Read `references/intent-and-plan.md`, write the intent summary every reviewer receives, and discover the plan Stage 6 verifies requirements against.
4. **Stage 3.** Read `references/persona-catalog.md` and `references/select-and-route.md`, then select the risk-driven reviewer roster, discover applicable standards paths, and bind the adversarial route.
5. **Stage 3d.** When adversarial is selected for a local reviewed tree, start and persist the sanctioned cross-model job that `references/cross-model-review.md` defines, **before any local persona dispatch**. Invoking this skill is itself the authorization for its configured or allowlisted peer route, once you have made the required disclosure of the recipient and of the code that leaves the machine. Do not ask the user to confirm a second time, and do not skip the peer because the user did not repeat that authorization. An explicit user prohibition on external review overrides it, as does a checkout that sets `cross_model_review_mode: off` with no live opt-in; both are resolved before you bind a route. This pass's skip and target-selection keys are `cross_model_review_mode` and `cross_model_peer`. Missing files or unset keys take the default auto route; they are not a skip. Another skill's engine preference is not this gate. Model and effort overrides stay with the bound target as the reference states. A started peer replaces the local adversarial persona at this stage, and only a real failure to scope, allowlist, reach, authenticate, or start it leaves the local fallback in the roster; a later stage may still restore the local reviewer under the conditions that reference states.
6. **Stage 4.** Read `references/dispatch-reviewers.md`. Dispatch the materialized local roster as one foreground concurrent batch sized to the host's active-agent cap. Every successful launch is collected when its terminal outcome is in hand: consume valid compact returns, classify a terminal tool error or malformed output as a failed reviewer, and keep launch receipts uncollected. Use the host's blocking collection capability for asynchronous receipts, and do not synthesize until every successful launch is collected. If launched work cannot be collected reliably, stop it, discharge any persisted peer through its owning cleanup before returning the failure result, and never emit progress or wait for a notification. Detaching local review into a polled background job is forbidden. The cross-model peer is the only detached work, and it may overlap this batch.
7. **Stages 5 and 6.** Once the reviewer returns are ready, read `references/finish-review.md`. Fold in the peer once, run the documented findings mechanics, and run every validator the reference selects; only then return the report. Never synthesize directly from raw reviewer artifacts. In the multi-agent path, emit only this skill's report: do not also invoke a harness-native findings or reporting tool, which belongs to the quick-review short-circuit alone.

## Operating principles

- **Report-only by default; never push.** A bare `ce-code-review` invocation produces findings and does not apply them. Entering the apply stage requires `apply:local`, or an explicit user request in the invoking prompt to apply or fix this review's findings; a deprecated `mode:autofix` token is neither. `mode:agent` never mutates the tree, even when nested inside a workflow that later applies findings. Never push, open PRs, or file tickets in any mode.
- **No blocking prompts.** Never use `AskUserQuestion`, `request_user_input`, `ask_user`, or other blocking question tools. Infer intent, plan, and scope from explicit tokens, git state, PR metadata, and conversation. Note uncertainty in Coverage or the verdict — do not stop to ask.
- **Explicit mutations only.** Never run `gh pr checkout`, `git checkout`, `git switch`, or similar branch-switch commands. Passing a PR number, URL, or branch name selects **review scope**, not permission to mutate the working tree. Uncommitted work can only be reviewed from the checkout that holds it, so to review it on a feature branch, stay on that branch (or check it out yourself) and pass `base:` or no target.
- **Report outcomes, not machinery.** What you show the user is about the review: what is being examined, which coverage is included and the one-line reason for each conditional lens, the independent cross-model pass, and the findings. Name what the user would recognize — a PR number, a reviewer's concern, a peer model — rather than this skill's plumbing, whose internal labels, dispatch bookkeeping, and setup narration stay out of user-facing text. Never claim more about the peer than its receipt attests. This governs *what* you surface and suppress, not the wording; use your own voice.

## Task Visibility

For the multi-agent path, once the review scope is resolved, use the platform's task-tracking capability when available to show a short user-facing view derived from the execution spine. Track review outcomes, not individual personas, setup mechanics, or tool calls; add conditional work only when its gate fires, and update the view at meaningful transitions. If no task-tracking capability is available, continue with the normal progress and final report without simulating a task list in chat.
