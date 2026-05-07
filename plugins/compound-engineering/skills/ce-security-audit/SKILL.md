---
name: ce-security-audit
description: "Run an on-demand security audit using OWASP Top 10 and STRIDE threat modeling. Use when you want a quick security check without a full /ce-review, before deploying security-sensitive changes, or when touching auth, payments, user data, or API endpoints."
argument-hint: "[directory path, 'pr', 'diff', or 'full' for full codebase scan]"
---

# Security Audit

Run a focused security audit on the specified scope. This skill dispatches CE's existing security review agents (`ce-security-reviewer` and `ce-security-sentinel`) in parallel and combines their findings into a single report.

Unlike `/ce-review` (which runs 17+ reviewers across all concerns), this skill runs **only** the security agents — faster and more focused.

## Input

<input_scope> #$ARGUMENTS </input_scope>

## Determine Scope

Based on the input:

| Input | Scope | How to gather files |
|-------|-------|-------------------|
| Directory path (e.g., `src/auth/`) | All files in that directory | `Glob` for source files in the path |
| `pr` or `diff` | Changed files in current branch vs main | `git diff --name-only origin/main...HEAD` |
| `full` | Entire codebase | All source files (exclude node_modules, dist, vendor) |
| Empty/no input | Default to `diff` (current branch changes) | Same as `pr` |

## Execution

1. **Gather the file list** based on scope above
2. **Read the changed/target files** to build the review context
3. **Dispatch two agents in parallel:**

   **Agent 1: `ce-security-reviewer`**
   - Attacker-mindset review
   - Focus: injection vectors, auth bypass, secrets in code, SSRF, path traversal

   **Agent 2: `ce-security-sentinel`**
   - Checklist-driven audit
   - Focus: OWASP Top 10 compliance + STRIDE threat modeling (Spoofing, Tampering, Repudiation, Information Disclosure, DoS, Elevation of Privilege)

   Provide each agent with:
   - The file contents or diff
   - The scope description (what area of the codebase this covers)
   - Any relevant context from CLAUDE.md about the project's auth, payment, or data handling patterns

4. **Wait for both agents to complete**
5. **Automated vulnerability scan (optional):**
   If ruflo-security-audit MCP tools are available (check for `mcp__claude-flow__security_scan` in available tools):
   - Run `mcp__claude-flow__security_scan` with `--depth full` on the scoped files
   - This adds CVE detection, shell injection scanning, and secrets-at-rest checks that the prompt-based agents above cannot perform
   - Merge ruflo findings with CE agent findings. Deduplicate: same file:line from both sources → keep the more detailed finding
   - If ruflo is not installed, skip this step — CE agents provide sufficient coverage for threat modeling and OWASP
6. **Combine findings** into a single report

## Output Format

Present a combined security report:

### Summary
- Total findings by severity (Critical / High / Medium / Low)
- Overall risk assessment (one sentence)

### Findings
For each finding (sorted by severity, then by category):

| # | Severity | Category | File:Line | Description | Remediation |
|---|----------|----------|-----------|-------------|-------------|
| 1 | Critical | OWASP A01 | `src/auth/login.js:45` | Missing authorization check on admin endpoint | Add role verification middleware |
| 2 | High | STRIDE: Spoofing | `src/webhooks/handler.js:12` | Webhook signature not verified | Validate HMAC signature before processing |

### Clean Areas
Note areas that were reviewed and found clean — this provides confidence, not just a list of problems.

## Error Handling

- If one agent fails to dispatch, report findings from the other and note the failure
- If no files match the scope, report "No files found for the specified scope" and suggest alternatives
- If the scope is very large (>100 files), warn about token cost and ask whether to proceed or narrow the scope

## When to Use This Skill

- Before deploying changes that touch auth, payments, user data, or API endpoints
- When adding new endpoints or modifying access control
- After a security incident to audit related code
- As a quick check during development — faster than a full `/ce-review`
- When onboarding to unfamiliar code that handles sensitive operations

## What This Skill Does NOT Do

- Does not replace static analysis tools (Snyk, SonarQube, npm audit) — though ruflo-security-audit adds partial CVE coverage when available
- Does not run penetration tests or active exploitation
- Does not modify code — report only
