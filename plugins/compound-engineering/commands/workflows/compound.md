---
name: workflows:compound
description: Document a recently solved problem to compound your team's knowledge
argument-hint: "[optional: brief context about the fix]"
---

# /compound

Coordinate multiple subagents working in parallel to document a recently solved problem.

## Purpose

Captures problem solutions while context is fresh, creating structured documentation in `docs/solutions/` with YAML frontmatter for searchability and future reference. Uses parallel subagents for maximum efficiency.

**Why "compound"?** Each documented solution compounds your team's knowledge. The first time you solve a problem takes research. Document it, and the next occurrence takes minutes. Knowledge compounds.

## Usage

```bash
/workflows:compound                    # Document the most recent fix
/workflows:compound [brief context]    # Provide additional context hint
```

## Execution Strategy: Parallel Subagents

This command launches multiple specialized subagents IN PARALLEL to maximize efficiency:

### 1. **Context Analyzer** (Parallel)
   - Extracts conversation history
   - Identifies problem type, component, symptoms
   - Validates against documentation schema
   - Determines optimal `docs/solutions/` category
   - Suggests filename based on slug
   - Returns: YAML frontmatter skeleton + final path

### 2. **Solution Extractor** (Parallel)
   - Analyzes all investigation steps
   - Identifies root cause
   - Extracts working solution with code examples
   - Returns: Solution content block

### 3. **Documentation Writer** (Parallel)
   - Assembles complete markdown file
   - Validates YAML frontmatter
   - Formats content for readability

### 4. **Optional: Specialized Agent Invocation** (Post-Documentation)
   Based on problem type detected, automatically invoke applicable agents:
   - **performance_issue** → `performance-oracle`
   - **security_issue** → `security-sentinel`
   - **database_issue** → `data-integrity-guardian`
   - Any code-heavy issue → `code-simplicity-reviewer`

## What It Captures

- **Problem symptom**: Exact error messages, observable behavior
- **Investigation steps tried**: What didn't work and why
- **Root cause analysis**: Technical explanation
- **Working solution**: Step-by-step fix with code examples
- **Prevention strategies**: How to avoid in future
- **Cross-references**: Links to related issues and docs

## Preconditions

<preconditions enforcement="advisory">
  <check condition="problem_solved">
    Problem has been solved (not in-progress)
  </check>
  <check condition="solution_verified">
    Solution has been verified working
  </check>
  <check condition="non_trivial">
    Non-trivial problem (not simple typo or obvious error)
  </check>
</preconditions>

## What It Creates

**Organized documentation:**

- File: `docs/solutions/[category]/[filename].md`

**Categories auto-detected from problem:**

- build-errors/
- test-failures/
- runtime-errors/
- performance-issues/
- database-issues/
- security-issues/
- ui-bugs/
- integration-issues/
- logic-errors/

## Success Output

```
✓ Parallel documentation generation complete

Primary Subagent Results:
  ✓ Context Analyzer: Identified performance_issue → docs/solutions/performance-issues/
  ✓ Solution Extractor: Extracted 3 code fixes
  ✓ Documentation Writer: Created complete markdown

Specialized Agent Reviews (Auto-Triggered):
  ✓ performance-oracle: Validated query optimization approach
  ✓ code-simplicity-reviewer: Solution is appropriately minimal

File created:
- docs/solutions/performance-issues/n-plus-one-brief-generation.md

This documentation will be searchable for future reference when similar
issues occur.

What's next?
1. Continue workflow (recommended)
2. View documentation
3. Other
```

## The Compounding Philosophy

This creates a compounding knowledge system:

1. First time you solve "N+1 query in brief generation" → Research (30 min)
2. Document the solution → docs/solutions/performance-issues/n-plus-one-briefs.md (5 min)
3. Next time similar issue occurs → Quick lookup (2 min)
4. Knowledge compounds → Team gets smarter

The feedback loop:

```
Build → Test → Find Issue → Research → Improve → Document → Validate → Deploy
    ↑                                                                      ↓
    └──────────────────────────────────────────────────────────────────────┘
```

**Each unit of engineering work should make subsequent units of work easier—not harder.**

## Auto-Invoke

<auto_invoke> <trigger_phrases> - "that worked" - "it's fixed" - "working now" - "problem solved" </trigger_phrases>

<manual_override> Use /workflows:compound [context] to document immediately without waiting for auto-detection. </manual_override> </auto_invoke>

## Routes To

`compound-docs` skill

## Applicable Specialized Agents

Based on problem type, these agents can enhance documentation:

### Code Quality & Review
- **code-simplicity-reviewer**: Ensures solution code is minimal and clear
- **pattern-recognition-specialist**: Identifies anti-patterns or repeating issues

### Specific Domain Experts
- **performance-oracle**: Analyzes performance_issue category solutions
- **security-sentinel**: Reviews security_issue solutions for vulnerabilities
- **data-integrity-guardian**: Reviews database_issue migrations and queries

### Enhancement & Documentation
- **best-practices-researcher**: Enriches solution with industry best practices
- **framework-docs-researcher**: Links to framework documentation references

### When to Invoke
- **Auto-triggered** (optional): Agents can run post-documentation for enhancement
- **Manual trigger**: User can invoke agents after /workflows:compound completes for deeper review

## Related Commands

- `/research [topic]` - Deep investigation (searches docs/solutions/ for patterns)
- `/workflows:plan` - Planning workflow (references documented solutions)

## Auto-Spawn: Skill Learning

After documenting the solution, automatically spawn an autoskill subagent **in parallel** to analyze the session for skill update opportunities:

```bash
Task general-purpose (run_in_background: true): "Use the autoskill skill.

1. Read the skill: cat plugins/compound-engineering/skills/autoskill/SKILL.md
2. Scan this conversation for skill improvement opportunities:
   - **Skill usage gaps**: A skill was invoked but didn't produce ideal results
     - User had to make corrections or adjustments
     - Better skill documentation could have prevented the issue
   - **Corrections**: User said 'use X instead of Y', 'don't do X'
   - **Repeated patterns**: Same feedback given multiple times
3. Apply quality filter: repeated, generalizable, actionable, new
4. If NO qualified signals → return silently (no output)
5. If qualified signals found → propose updates with evidence and await approval

Focus on cases where skill documentation improvements would prevent future adjustments.
Skip general best practices already covered."
```

**When to activate:**
- A skill was used but needed manual corrections afterward
- User provided feedback that should be baked into a skill
- Patterns emerged that better skill structure could capture

The autoskill:
- Runs in parallel with documentation completion
- Only surfaces if it finds qualified signals
- Requires explicit approval before editing any files

