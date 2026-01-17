---
name: writing:review
description: Exhaustive parallel editorial review of written content
argument-hint: "[path to draft.md] or [draft-ID] or 'latest'"
---

# Writing Review Command

Multi-agent editorial review that examines content from every angle.

## Input

<draft_path> #$ARGUMENTS </draft_path>

**Input Types:**
- `drafts/[slug]/draft-1.md` → Review specific file
- `draft-2` → Find and review draft with that ID
- `latest` → Find most recent draft in `drafts/`

---

## Skills to Load

Before starting, load these skills:

```
Skill: writing-orchestration
  - Quality checkpoints
  - Strategy verification

Skill: scratchpad
  - Read session preferences
  - Update with review learnings

Skill: context-notes
  - Read handoff from /writing:draft
  - Output handoff for revision

Skill: [style guide] - Based on draft metadata:
  - every-style-editor (Every content)
  - pragmatic-writing (technical content)
  - dhh-writing (opinionated content)
```

---

## Step 1: Locate Draft

```
If input is file path:
  Load that file

If input is draft ID (e.g., "draft-2"):
  Search drafts/ for matching draft_id in frontmatter

If input is "latest":
  Find most recently modified .md in drafts/
```

---

## Step 2: Load Draft Context

Extract from draft file:

```
From frontmatter:
- draft_id
- title
- version
- style/voice used
- voice_score (current)
- word_count
- strategies_applied

From content:
- Full draft text
- Section structure
```

---

## Step 3: Load Context Notes

If context notes from `/writing:draft` available:

```
Extract:
- Strategies that were applied
- Known issues already identified
- Scratchpad preferences used
```

---

## Step 4: Load Scratchpad

Check `drafts/.scratchpad.md`:

```
If scratchpad exists:
  1. Load preference profile
  2. "What Works ✓" → Validate draft alignment
  3. "What Doesn't ✗" → Flag violations as issues
```

---

## Step 5: Load Review Context

```
Load for agents:
- Voice profile (if specified)
- Style guide rules
- Sources.md (for fact-checking)
- Research.md (for completeness checking)
```

---

## Step 6: Select Review Depth (BRAINSTORM)

```
Use AskUserQuestion:

Question: "How thorough should this review be?"

Options:
1. **Quick pass** - Voice + clarity only (fastest)
2. **Standard review** - Voice + clarity + facts + structure
3. **Deep review** - All agents + publishing optimization
4. **Custom** - Select specific agents
```

If "Custom" selected:

```
Use AskUserQuestion:

Question: "Which review agents should I run? (Select all that apply)"

Options (multiSelect: true):
1. **Voice Guardian** - Voice consistency and drift
2. **Clarity Editor** - Clarity, concision, jargon
3. **Fact Checker** - Verify claims against sources
4. **Structure Architect** - Flow and organization
5. **Publishing Optimizer** - SEO and social hooks
6. **Style Guide** - [Detected style] compliance
```

---

## Step 7: Launch Parallel Review Agents

Run selected agents simultaneously:

### Core Reviews

```
Task voice-guardian: "Check voice consistency in this draft.
Voice profile: [profile or 'infer']
Draft: [draft content]
Scratchpad preferences: [key preferences]
Return:
- Voice score (0-100)
- Drift areas with line numbers
- Specific fixes with before/after"

Task clarity-editor: "Review for clarity, concision, and accessibility.
Draft: [draft content]
Check for:
- Passive voice instances
- Unnecessary jargon
- Redundant phrases
- Unclear sentences
Return: Prioritized issues with before/after fixes."

Task fact-checker: "Verify all claims against sources.
Draft: [draft content]
Sources: [sources.md content]
Return:
- Verified claims ✓
- Unverified claims ?
- Incorrect claims ✗
- Suggestions for each"

Task structure-architect: "Analyze flow and structure.
Draft: [draft content]
Outline: [original outline if available]
Return:
- Flow analysis
- Gap identification
- Pacing assessment
- Structure score"
```

### Style Reviews (Based on Context)

```
If using Every style:
  Task every-style-editor: "Check against Every's style guide.
  Draft: [draft content]
  Return: Violations with line numbers and fixes."

If technical content:
  Skill: pragmatic-writing
  Apply pragmatic principles, report issues.

If opinion/persuasive:
  Skill: dhh-writing
  Apply DHH style checks, report issues.
```

### Publishing Reviews (If Requested)

```
Task publishing-optimizer: "Analyze for discoverability and engagement.
Draft: [draft content]
Return:
- SEO recommendations
- Social media hooks (3-5 options)
- Headline alternatives (5 options)
- Newsletter subject lines (3 options)"
```

**Wait for all agents to complete.**

---

## Step 8: Collect and Prioritize Findings

### Categorize Issues

```markdown
## Review Summary

### 🔴 Critical (Must Fix)
Issues that significantly harm the piece:
- Factual errors
- Unsupported claims
- Major clarity problems
- Structural gaps

### 🟡 Important (Should Fix)
Issues that noticeably weaken the piece:
- Voice drift
- Passive voice
- Unnecessary jargon
- Flow problems

### 🟢 Polish (Nice to Fix)
Minor improvements:
- Word choice refinements
- Rhythm adjustments
- Style guide details
```

### Deduplicate

If multiple agents flag the same issue, combine and note agreement:

```
"Passive voice in paragraph 3" - flagged by: clarity-editor, voice-guardian
(Higher confidence when multiple agents agree)
```

---

## Step 9: Interactive Triage (BRAINSTORM)

Present issues one by one:

### For Critical Issues

```
Use AskUserQuestion:

Question: "[Critical] Unsupported claim in paragraph 3:
> 'Studies show that 73% of developers prefer...'
No source provided. What should we do?"

Options:
1. **Add citation** - Insert [citation needed] placeholder
2. **Remove claim** - Delete the unsupported statement
3. **Rephrase** - Soften to opinion ("Many developers prefer...")
4. **Skip** - Keep as is (explain why)
```

### For Important Issues

```
Use AskUserQuestion:

Question: "[Important] Passive voice: 4 instances detected.
Lines: 12, 34, 56, 78
Example: 'The code was written' → 'The developer wrote the code'
What should we do?"

Options:
1. **Accept all** - Fix all 4 instances
2. **Review each** - Show me one by one
3. **Skip all** - Intentional stylistic choice
4. **Accept some** - Fix specific lines only
```

### For Polish Issues

```
Use AskUserQuestion:

Question: "[Polish] 3 minor style guide issues found. Review them?"

Options:
1. **Accept all** - Apply all fixes
2. **Review each** - Show me one by one
3. **Skip all** - Good enough
```

---

## Step 10: Track Decisions

Build triage log:

```markdown
## Triage Log

| Issue | Category | Decision | Reason |
|-------|----------|----------|--------|
| Unsupported claim P3 | Critical | Removed | No source available |
| Passive voice ×4 | Important | Fixed 3/4 | Line 56 intentional |
| Oxford comma | Polish | Skipped | Style preference |
```

---

## Step 11: Apply Fixes

### Create New Version

```
After triage:
1. Apply all accepted fixes
2. Create draft-v[N+1].md (increment version)
3. Preserve original (never overwrite)
4. Log all changes in metadata
```

### Re-Run Critical Checks

```
After fixes applied:
1. Voice-guardian quick check on changed sections
2. Fact-check any new claims added
3. Verify no new issues introduced
```

---

## Step 12: Save Review Report

Create `drafts/[slug]/review-v[N].md`:

```markdown
# Editorial Review: [Title]

**Draft reviewed**: draft-[ID] v[version]
**Review date**: [timestamp]
**Review depth**: [quick/standard/deep]

## Summary
- Issues found: [total]
- Critical: [count] → [fixed/remaining]
- Important: [count] → [fixed/remaining]
- Polish: [count] → [fixed/remaining]
- Voice score: [before] → [after]

## Agent Reports

### Voice Guardian
**Score**: [X]/100
**Issues**: [list]
**Fixes applied**: [list]

### Clarity Editor
**Issues**: [list]
**Fixes applied**: [list]

### Fact Checker
**Verified**: [count]
**Flagged**: [count]

### Structure Architect
**Flow score**: [X]/100
**Gaps identified**: [list]

## Triage Decisions
[Full triage log]

## Changes Made
[Diff or change list]

## Remaining Items
- [ ] [Any skipped issues]
- [ ] [Follow-up needed]

## Next Steps
- [ ] Address remaining issues
- [ ] Final proofread
- [ ] Ready for /writing:compound
```

---

## Step 13: Update Scratchpad

If new preferences emerged during triage:

```
Append to drafts/.scratchpad.md:

---
## Review Learnings [timestamp]

**New preference identified**:
- [Preference from triage decision]

**Anti-pattern confirmed**:
- [Issue type to avoid in future]
---
```

---

## Step 14: Output Context Notes

Generate handoff for revision or compound:

```markdown
<context_notes>
## Review Summary
- Critical issues: [count fixed / count remaining]
- Important issues: [count fixed / count remaining]
- Polish issues: [count fixed / count remaining]
- Voice score: [before] → [after]

## Accepted Fixes
1. [Fix 1 description]
2. [Fix 2 description]

## Rejected Fixes
1. [Rejected fix with reason]

## Scratchpad Updates
- New preference: [if applicable]
- Conflict resolved: [if applicable]

## Draft Status
- Version: draft-[ID] v[new version]
- Ready for: [/writing:compound or more revision]

## Mode
REFINEMENT (working on draft-[ID])
</context_notes>
```

---

## Step 15: Post-Review Options (BRAINSTORM)

**MANDATORY: Use the AskUserQuestion tool here. Do NOT output options as plain text.**

```yaml
tool: AskUserQuestion
question: "Review complete. [X] issues found, [Y] fixed. Voice score: [before]→[after]. What next?"
header: "Next"
options:
  - label: "View full report"
    description: "Open review-v[N].md in editor"
  - label: "View diff"
    description: "Show before/after changes"
  - label: "Another review pass"
    description: "Re-run with fresh perspective"
  - label: "Compound"
    description: "/writing:compound draft-[ID] (capture patterns)"
```

Based on selection:
- **View full report** → Run `open drafts/[slug]/review-v[N].md` to open in default editor
- **View diff** → Show side-by-side or unified diff of changes made
- **Another review pass** → Re-run review agents for fresh perspective
- **Compound** → Call `/writing:compound draft-[ID]` to capture winning patterns
- **Other** (automatically provided) → Accept free text for custom action

---

## Quality Gates

Review is complete when:
- [ ] All critical issues addressed
- [ ] Voice score ≥ 85
- [ ] All claims verified or explicitly flagged
- [ ] Flow analysis passed
- [ ] Style guide compliance checked
- [ ] Scratchpad preferences honored
- [ ] Triage decisions logged
- [ ] Context notes ready for handoff

---

## Quality Checklist

Before completing:
- [ ] Draft located and loaded
- [ ] Appropriate agents selected for content type
- [ ] All selected agents completed
- [ ] Issues properly categorized (critical/important/polish)
- [ ] Each issue triaged with user input
- [ ] Fixes applied to new version (original preserved)
- [ ] Review report saved
- [ ] Scratchpad updated with learnings
- [ ] Context notes ready for next command
