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
