# Codify Learning

Capture and persist learnings from the current session to make future work easier. This completes the compounding engineering loop: Plan → Work → Review → **Codify**.

## Learning to Codify

<learning_context> #$ARGUMENTS </learning_context>

## Workflow

### Step 1: Gather Context

<thinking>
First, understand what was learned and where it should be captured.
If no arguments provided, review recent conversation for learnings.
</thinking>

**If arguments provided:**
- Use the provided description as the learning context
- Skip to Step 2

**If no arguments:**
- Review the conversation history
- Identify key discoveries, mistakes avoided, or patterns recognized
- Summarize the potential learning
- Ask user to confirm or refine

### Step 2: Classify the Learning

Present classification options to the user:

```
What type of learning is this?

1. 📁 **Project Learning** → Update CLAUDE.md "Key Learnings" section
   Examples: Project-specific gotchas, deployment quirks, team conventions

2. 🔍 **Review Pattern** → Update a reviewer agent
   Examples: Code smell to catch, security pattern, Rails/Python/TS convention

3. ⚙️ **Process Improvement** → Update a command or create new one
   Examples: Better workflow step, missing verification, useful tool combination

4. 🎯 **Agent Enhancement** → Update an analysis agent
   Examples: New research technique, better analysis approach, useful prompt pattern

Which type? (1/2/3/4)
```

### Step 3: Determine Target File

Based on classification:

**1. Project Learning:**
- Target: `CLAUDE.md` in current project root
- Section: "Key Learnings" (create if doesn't exist)

**2. Review Pattern:**
Ask which reviewer to update:
```
Which reviewer should capture this pattern?

- kieran-rails-reviewer (Rails conventions, patterns)
- kieran-python-reviewer (Python conventions, patterns)
- kieran-typescript-reviewer (TypeScript conventions, patterns)
- dhh-rails-reviewer (Rails philosophy, anti-patterns)
- code-simplicity-reviewer (Simplification patterns)
- security-sentinel (Security patterns)
- Other: [specify]
```

**3. Process Improvement:**
```
Which command or workflow needs updating?

- /plan (issue creation)
- /work (execution workflow)
- /review (code review process)
- /triage (finding management)
- New command needed
```

**4. Agent Enhancement:**
```
Which agent should be enhanced?

- pattern-recognition-specialist
- architecture-strategist
- performance-oracle
- data-integrity-guardian
- repo-research-analyst
- framework-docs-researcher
- best-practices-researcher
- git-history-analyzer
- Other: [specify]
```

### Step 4: Format the Learning

**For CLAUDE.md (Project Learning):**

```markdown
### {date}: {Brief Title}

**Context:** {What was being worked on}

**Learning:** {The key insight or discovery}

**Why it matters:** {Impact on future work}

**Example:**
```{language}
{Code example if applicable}
```
```

**For Reviewer Agents:**

```markdown
### {Pattern Name}

**Trigger:** {When to check for this}

**Issue:** {What's wrong when this pattern is violated}

**Correct approach:**
```{language}
{Good example}
```

**Incorrect approach:**
```{language}
{Bad example}
```

**Why:** {Explanation of the reasoning}
```

**For Commands/Workflow:**

```markdown
### {Step or Section Name}

{Description of the improvement}

**Before:** {How it was done}

**After:** {How it should be done}

**Rationale:** {Why this is better}
```

### Step 5: Preview and Confirm

Present the formatted learning:

```
---
📝 Learning Preview

**Target file:** {file_path}
**Section:** {section_name}
**Type:** {classification}

{formatted_content}

---
Options:
1. ✅ Apply - Add this learning to the target file
2. ✏️ Edit - Modify before applying
3. 🔄 Reclassify - Choose different target
4. ❌ Cancel - Don't save this learning
```

### Step 6: Apply the Learning

**When user says "Apply":**

1. Read the target file
2. Find the appropriate section (or create it)
3. Append the formatted learning
4. Show the diff of changes

```bash
# For CLAUDE.md
Read CLAUDE.md → Find "Key Learnings" section → Append → Write

# For agent files
Read agents/{agent-name}.md → Find appropriate section → Append → Write
```

**Confirm success:**
```
✅ Learning codified!

File: {file_path}
Section: {section_name}

This learning will now:
- {benefit_1}
- {benefit_2}

The compounding engineering loop is complete. 🔄
```

### Step 7: Suggest Related Actions

After codifying:

```
Related actions you might want to take:

1. 🧪 Test the updated agent/command
2. 📝 Commit the change: git add {file} && git commit -m "codify: {brief description}"
3. 🔍 Review other recent learnings
4. 📚 Update README if this is a significant addition
```

## Quick Mode

If user provides clear context, skip interactive steps:

```
/codify "Always run migrations with --dry-run first in production"
```

→ Auto-detect as Project Learning
→ Format and preview
→ Ask only for confirmation

## Examples

### Example 1: Project Learning
```
User: /codify
Claude: What learning would you like to capture?
User: We discovered that the Stripe webhook needs idempotency keys
Claude: [Classifies as Project Learning]
Claude: [Formats and adds to CLAUDE.md Key Learnings]
```

### Example 2: Review Pattern
```
User: /codify "N+1 queries in Rails controllers should use includes()"
Claude: [Classifies as Review Pattern]
Claude: Which reviewer?
User: kieran-rails-reviewer
Claude: [Formats and adds to kieran-rails-reviewer.md]
```

### Example 3: Process Improvement
```
User: /codify "The /work command should verify tests pass before creating PR"
Claude: [Classifies as Process Improvement]
Claude: [Updates work.md with verification step]
```

## Success Criteria

- [ ] Learning is captured in the correct file
- [ ] Format is consistent with existing entries
- [ ] Learning is actionable and specific
- [ ] Related context is preserved
- [ ] Change is ready to commit
