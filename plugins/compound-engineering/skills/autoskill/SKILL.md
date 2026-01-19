---
name: autoskill
description: Analyze coding sessions to extract preferences and propose updates to Skills. Use when user says "learn from this session", "update skills", or "remember this pattern".
---

# Autoskill: Learning from Coding Sessions

A meta-learning mechanism that analyzes coding sessions to extract durable preferences and propose targeted updates to active Skills.

## Activation Triggers

This skill activates when:
- User explicitly requests: "learn from this session", "update skills", "remember this pattern", "autoskill"
- After `/workflows:compound` documents a solution
- **A skill was used but didn't produce ideal results** - user had to make corrections or adjustments that better skill documentation could have prevented

**Does NOT activate for:** One-off corrections, declined modifications, or general best practices already well-known.

## Signal Detection

Scan the conversation for four signal types:

### 1. Skill Usage Gaps (Highest Value)
A skill was invoked but needed adjustments:
- Output required manual corrections
- User refined or adjusted skill-generated content
- Better skill documentation would have produced correct output first try
- Example: "Actually, that should have been X format, not Y"

### 2. Corrections (High Value)
Direct contradictions like:
- "use X instead of Y"
- "don't do X, do Y"
- "that's wrong, it should be..."

### 3. Repeated Patterns (High Value)
Feedback given multiple times across files:
- Same correction applied to different files
- Consistent preference expressed repeatedly

### 4. Approvals (Supporting Evidence)
Confirmations that reinforce approaches:
- "yes, that's right"
- "exactly like that"
- "perfect"

## Quality Filter

Before proposing any change, verify the signal satisfies ALL criteria:

| Criterion | Question |
|-----------|----------|
| **Repeated** | Was this correction repeated or stated as general guidance? |
| **Generalizable** | Would it apply beyond this specific task? |
| **Actionable** | Is it specific enough to implement? |
| **New** | Is this genuinely new information? |

## What Qualifies as "New Information"

**Worth capturing:**
- Project-specific conventions
- Custom component locations
- Team preferences differing from defaults
- Stack-specific quirks
- File organization patterns
- Naming conventions

**NOT worth capturing (already known):**
- General best practices
- Language fundamentals
- Standard library usage
- Universal security principles
- Framework defaults

## Workflow

### Step 1: Discover Active Skills

```bash
# Find all available skills
find ~/.claude/skills -name "SKILL.md" 2>/dev/null
find .claude/skills -name "SKILL.md" 2>/dev/null
ls plugins/*/skills/*/SKILL.md 2>/dev/null
```

### Step 2: Scan Conversation for Signals

Review the conversation history for:
- Direct corrections from the user
- Repeated feedback patterns
- Explicit approvals of approaches

### Step 3: Map Signals to Skills

For each qualified signal, identify which skill it relates to:

| Signal Type | Likely Skill |
|-------------|--------------|
| Skill usage gap | The skill that was invoked and needed adjustment |
| Code style preference | `frontend-design`, language-specific skills |
| Architecture pattern | `agent-native-architecture` |
| Documentation format | `compound-docs` |
| Component structure | `frontend-design` |
| Testing approach | testing-related skills |

**For skill usage gaps:** Always target the specific skill that was used. The fix should prevent the same adjustment from being needed in future sessions.

### Step 4: Propose Changes

Present proposed changes grouped by confidence:

```markdown
## Proposed Skill Updates

### HIGH Confidence (repeated/explicit)
1. **Skill:** `frontend-design`
   **Change:** Add "Prefer Zustand over Redux for simple state"
   **Evidence:** User corrected this 3 times in session

### MEDIUM Confidence (single but clear)
2. **Skill:** `compound-docs`
   **Change:** Add "Include error message in symptom list"
   **Evidence:** User explicitly requested this format
```

### Step 5: Await Approval

**CRITICAL:** Do NOT edit any files until user explicitly approves.

```markdown
**Ready to update skills. Please confirm:**
1. [x] Update frontend-design with Zustand preference
2. [ ] Update compound-docs with error message format

Type "approve all" or specify which changes to apply.
```

### Step 6: Apply Changes

After approval:
1. Read the target SKILL.md
2. Find the appropriate section
3. Make minimal, additive edits
4. Preserve existing structure and tone
5. Show the diff before saving

## Output Format

```markdown
## Autoskill Analysis

**Session scanned:** [X messages]
**Signals detected:** [Y corrections, Z patterns, W approvals]
**Qualified signals:** [N]

### Proposed Updates

[List changes with confidence levels]

### Awaiting Approval

[Confirmation prompt]
```

## Key Principles

- **Additive only** - Never remove existing skill content
- **Minimal edits** - Small, focused changes
- **Reversible** - Each change can be individually reverted
- **Explicit approval** - Always wait for user confirmation
- **Evidence-based** - Every proposal cites conversation evidence
