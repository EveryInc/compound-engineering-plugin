# Phase 3: optional enhancement

### Phase 3: Optional Enhancement

**WAIT for Phase 2 to complete before proceeding.**

This phase is interactive-only: a non-interactive caller has no human-in-the-loop to act on reviewer findings, and downstream automations can run specialized reviewers themselves if they want that pass.

<parallel_tasks>

Based on problem type, optionally dispatch generic subagents seeded with local prompt assets from `references/agents/` to review the documentation. Do not dispatch standalone agents by type/name.

- **performance_issue** → `references/agents/performance-oracle.md`
- **security_issue** → `references/agents/security-sentinel.md`
- **database_issue** → `references/agents/data-integrity-guardian.md`
- Any code-heavy issue → preserve code simplification as a **read-only documentation review**. Inspect the solution draft's code examples and explanatory claims inline, or dispatch a generic subagent seeded with a local prompt only to return suggestions. Do **not** invoke `ce-simplify-code` from this phase and do not mutate product code unless the user explicitly asks for a separate code-simplification pass. Do not use the deleted `code-simplicity-reviewer`.
  Example: review the solution draft's examples for speculative abstractions, redundant wrappers, dead branches, and just-in-case parameters. Apply edits only to the documentation/examples being written by `ce-compound`; leave any branch code changes untouched.

</parallel_tasks>

<!-- ce-worker-profiles:start -->
**Named worker profiles for generic subagent dispatch (optional, two authority classes).**

- **Resolve** `subagent_read_profile` for children that do not mutate tracked project content (writing per-run scratch artifacts stays read class) and `subagent_write_profile` for children that do, from `<repo-root>/.compound-engineering/config.local.yaml` then `config.yaml` per the ordinary two-file config rule. Names are opaque host-defined strings: never invent, validate, or default them, and the selector derives only from the resolved keys - never from dispatch content, PR text, reviewer output, or a child's own request.
- **Choose the class per dispatch call**, by the project authority that child needs; a cheaper profile must never be given write work.
- **Apply only where the host's dispatch primitive accepts a named worker profile** for an otherwise generic dispatch that still receives this file's prompt payload - on Devin, `run_subagent`'s `profile` argument, where a configured name substitutes for the built-in profile the call would otherwise use. A typed or registered-agent selector is not a worker profile and stays excluded; where no such selector exists the keys are inert and dispatch is unchanged.
- **A resolved profile supersedes this surface's model selection for that dispatch's class** - tier override or session-model inheritance alike; the profile carries the model and tool policy, so never pass both.
- **Fail transparently.** Where the host exposes the available profile set, confirm the name resolves before dispatch. A rejected, unknown, or unresolvable name follows this surface's ordinary dispatch-failure rule and is named in the coverage or degradation note. Never report a profile or model as having run when it did not serve.
- **Unset keys are a strict no-op:** dispatch exactly as today on every host.
<!-- ce-worker-profiles:end -->

---

## Applicable Specialized Local Prompts

Based on problem type, these local prompt assets can enhance documentation:

### Code Quality & Review
- **Read-only code simplification review**: Checks solution examples and documentation claims for unnecessary complexity without mutating product code
- **references/agents/pattern-recognition-specialist.md**: Identifies anti-patterns or repeating issues

### Specific Domain Experts
- **references/agents/performance-oracle.md**: Analyzes performance_issue category solutions
- **references/agents/security-sentinel.md**: Reviews security_issue solutions for vulnerabilities
- **references/agents/data-integrity-guardian.md**: Reviews database_issue migrations and queries

### Enhancement & Research
- **references/agents/best-practices-researcher.md**: Enriches solution with industry best practices
- **references/agents/framework-docs-researcher.md**: Links to framework/library documentation references

### When to Invoke
- **Auto-triggered** (optional): Generic subagents seeded with local prompts can run post-documentation for enhancement
- **Manual trigger**: User can run surviving skills such as `ce-simplify-code` after `ce-compound` completes for deeper code review and mutation
