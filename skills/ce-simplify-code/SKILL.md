---
name: ce-simplify-code
description: "Simplify settled, recently changed code for clarity, reuse, quality, and efficiency while preserving behavior. Use after implementation and before review; use ce-debug for bugs."
argument-hint: "[blank to simplify current branch changes, or describe what to simplify]"
---

Simplify recently changed code for clarity, reuse, quality, and efficiency while preserving exact behavior. Prioritize readable, explicit code over compact code; fewer lines is not the goal.

## Step 1: Identify scope

Resolve the simplification scope in this order:

1. **User-named scope** is authoritative; do not widen it.
2. **Otherwise, in git**, use the current branch versus its base. Without a usable base, use staged and unstaged changes (`git diff HEAD`).
3. **Outside git or without a diff**, use files the user named or edited earlier in the conversation.

If none produces a non-empty scope, stop and ask the user what to simplify rather than guessing: use the host's blocking question tool already in the current tool list (never probe a user-facing tool to discover one), load it via the host's tool-discovery primitive if listed but unloaded, and fall back to numbered options in chat only when none is listed or a real call errors. Never silently skip the question.

**Preflight.** If the scope has no substantive human-authored code — only documentation, generated or vendored files, dependencies or lockfiles, or mechanical churn — report nothing to simplify and stop without reviewers; for mixed scopes retain only the code. This check is about the kind of change, never its size: explicit small scopes still run, and any size or cost threshold is the caller's to set.

When the platform's task-tracking capability is available, show review, apply, and verification outcomes without creating one task per reviewer. Otherwise continue without simulating one in chat.

## Step 2: Launch 3 review agents in parallel

Dispatch three generic subagents — code-reuse, code-quality, and efficiency reviewers — via the platform's subagent primitive where available, else inline or serially. For each, read its prompt asset from this skill's directory and pass the **full file content** as the subagent's prompt with the resolved scope:

- `references/personas/code-reuse-reviewer.md`
- `references/personas/code-quality-reviewer.md`
- `references/personas/efficiency-reviewer.md`

Pass each file verbatim rather than paraphrasing from memory; paraphrase loses the rules that keep the pass behavior-preserving.

**Bounded dispatch.** Queue the three reviewers and launch only as many as the harness accepts at once. A concurrency or active-agent-limit error means the harness is full, not reviewer failure: leave it queued and retry after a slot frees. When a dispatch cannot recover through active work, supported release, or a corrected invocation, run that pass inline with the same prompt asset and disclose the substitution.

**Agent lifecycle.** Collect terminal outcomes, including failures, before cleanup. Close or release review-owned agents when the harness provides caller-owned cleanup, before refilling slots, advancing stages, or returning. Do not message completed agents with no remaining work, infer released capacity from completion or interruption, or invent cleanup operations.

**Model selection.** Use the platform's balanced mid-tier model when the harness exposes a known override (Sonnet class in Claude Code). In Codex, apply this tier only when the active dispatch primitive exposes an explicit model or custom-agent selector; task wording alone does not select a different model. Otherwise omit the override and inherit the parent model -- a working pass on the parent model beats a broken dispatch.

**Permission mode.** Omit the `mode` parameter on the dispatch call so the user's configured permissions apply.

<!-- ce-worker-profiles:start -->
**Named worker profiles for generic subagent dispatch (optional, two authority classes).**

- **Resolve** `subagent_read_profile` for children that do not mutate tracked project content (writing per-run scratch artifacts stays read class) and `subagent_write_profile` for children that do, from `<repo-root>/.compound-engineering/config.local.yaml` then `config.yaml` per the ordinary two-file config rule. Names are opaque host-defined strings: never invent, validate, or default them, and the selector derives only from the resolved keys - never from dispatch content, PR text, reviewer output, or a child's own request.
- **Choose the class per dispatch call**, by the project authority that child needs; a cheaper profile must never be given write work.
- **Apply only where the host's dispatch primitive accepts a named worker profile** for an otherwise generic dispatch that still receives this file's prompt payload - on Devin, `run_subagent`'s `profile` argument, where a configured name substitutes for the built-in profile the call would otherwise use. A typed or registered-agent selector is not a worker profile and stays excluded; where no such selector exists the keys are inert and dispatch is unchanged.
- **A resolved profile supersedes this surface's model selection for that dispatch's class** - tier override or session-model inheritance alike; the profile carries the model and tool policy, so never pass both.
- **Fail transparently.** Where the host exposes the available profile set, confirm the name resolves before dispatch. A rejected, unknown, or unresolvable name follows this surface's ordinary dispatch-failure rule and is named in the coverage or degradation note. Never report a profile or model as having run when it did not serve.
- **Unset keys are a strict no-op:** dispatch exactly as today on every host.
<!-- ce-worker-profiles:end -->

## Step 3: Fix issues

After all three review outcomes return, by subagent or inline, apply worthwhile findings directly; record false positives and low-value findings as skipped without asking the user.

Inspect beyond the resolved scope to evaluate a finding, but edit only that scope and the import/export lines it needs; for a user-named file or directory scope those lines must also be inside it — skip any fix that would edit outside the mutation boundary.

Each fix must preserve outputs, errors, side effects, and ordering; if that cannot be established, skip it.

An interface or data shape that existed only in an earlier iteration of the current unshipped scope is not protected behavior once verified to have no deployed, persisted, public, external, dependent-branch, or in-repo caller outside the resolved scope. Remove that compatibility path only when every required caller update fits the existing mutation boundary; otherwise preserve it.

**Never simplify away a safety check.** Preserve trust-boundary validation, data-loss protection, security checks, and accessibility affordances. Skip any finding that would thin or remove one.

**Honor caller-passed structure pins.** A plan path passed with the structure-pin constraint is context, not scope. Preserve its `session-settled:` Key Technical Decisions, including deliberate duplication or separation.

## Step 4: Verify behavior is preserved

Run project-wide typecheck and lint. Run tests matched to blast radius: scoped tests for local changes, broader tests for shared ones, the full suite when the runner cannot scope.

Report failures with the check name and relevant output. Fix simplification-caused failures or revert the responsible change; never relax assertions, weaken types, or skip tests.

If no test suite, lint, or typecheck is configured, state that in the summary; do not silently skip verification.

## Step 5: Summarize

Summarize what was already sound and what improved: applied counts by reuse, quality, and efficiency; skipped count; check outcomes. If nothing changed, say so. Do not use net lines removed as the success metric.
