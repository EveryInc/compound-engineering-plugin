# Decision Menu After Documentation

After successful documentation, present options and WAIT for user response:

```
✓ Solution documented

File created:
- docs/solutions/[category]/[filename].md

What's next?
1. Continue workflow (recommended)
2. Add to Required Reading
3. Link related issues
4. Add to existing skill
5. Create new skill
6. View documentation
7. Other
```

## Option Handlers

### Option 1: Continue Workflow
Return to calling skill/workflow. Documentation is complete.

### Option 2: Add to Required Reading
Use when:
- System made this mistake multiple times
- Solution is non-obvious but must be followed every time
- Foundational requirement

Action:
1. Extract pattern from documentation
2. Format as ❌ WRONG vs ✅ CORRECT with code examples
3. Add to `docs/solutions/patterns/cora-critical-patterns.md`
4. Use [critical-pattern-template.md](../assets/critical-pattern-template.md)
5. Confirm: "✓ Added to Required Reading"

### Option 3: Link Related Issues
1. Prompt: "Which doc to link?"
2. Search docs/solutions/
3. Add cross-reference to both docs
4. Confirm: "✓ Cross-reference added"

### Option 4: Add to Existing Skill
Use when solution relates to an existing learning skill.

1. Prompt: "Which skill?"
2. Determine which reference file to update
3. Add link and brief description
4. Confirm: "✓ Added to [skill-name]"

### Option 5: Create New Skill
Use when solution represents start of new learning domain.

1. Prompt: "What should the new skill be called?"
2. Run skill creator script
3. Create initial reference with this solution
4. Confirm: "✓ Created new [skill-name] skill"

### Option 6: View Documentation
Display created documentation, then show menu again.

### Option 7: Other
Ask what they'd like to do.
