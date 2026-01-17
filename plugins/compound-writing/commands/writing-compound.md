---
name: writing:compound
description: Capture learnings from successful writing to improve future work
argument-hint: "[path to published piece] or [draft-ID] or 'latest'"
---

# Writing Compound Command

Turn this piece's successes into permanent improvements for future writing.

## Input

<piece_path> #$ARGUMENTS </piece_path>

**Input Types:**
- `drafts/[slug]/draft-final.md` → Analyze specific piece
- `draft-2` → Find draft with that ID
- `latest` → Find most recent approved/published piece

---

## Skills to Load

Before starting, load these skills:

```
Skill: voice-capture
  - Extract voice patterns from successful writing
  - Build/update voice profiles

Skill: scratchpad
  - Read session feedback history
  - Promote recurring preferences to patterns

Skill: context-notes
  - Read review learnings
  - Document patterns for future commands
```

---

## The Compound Philosophy

> Each piece of writing should make the next piece easier to write.

This command extracts what worked and encodes it for reuse:
- Hook formulas that grabbed attention
- Structure patterns that flowed well
- Voice elements that landed
- Transitions that felt invisible
- Anti-patterns that were edited out

---

## Step 1: Load the Piece and History

```
Gather all artifacts:
1. Final/published version
2. All draft versions (v1, v2, etc.)
3. Review reports
4. Scratchpad (drafts/.scratchpad.md)
5. Original brief and outline
```

Build timeline:
```
Brief → Outline → Draft 1 → Feedback → Draft 2 → Review → Draft 3 → Final
                     ↓           ↓          ↓
              [Changes made] [Preferences] [Fixes applied]
```

---

## Step 2: Identify Success Factors (BRAINSTORM)

```
Use AskUserQuestion:

Question: "What made this piece successful? (Select all that apply)"

Options (multiSelect: true):
1. **The hook grabbed attention** - Opening was compelling
2. **The structure was clear** - Easy to follow, well-paced
3. **The voice was consistent** - Tone matched throughout
4. **The examples were concrete** - Showed, didn't just tell
5. **The argument was persuasive** - Made a strong case
6. **Something else** - Describe what worked
```

---

## Step 3: Analyze Hook

### Extract Opening

```markdown
## Hook Extraction

**Opening text** (first 50-100 words):
> [Actual opening text]

**Hook type**: [Story/Stat/Tension/Question/Surprise]

**Why it worked**:
- [Specific reason 1]
- [Specific reason 2]
```

### Abstract the Formula (BRAINSTORM)

```
Use AskUserQuestion:

Question: "What made this hook work? How would you describe the formula?"

Options:
1. **[Auto-generated formula based on pattern]**
2. **[Alternative formula interpretation]**
3. **Custom** - Describe the formula in your own words
```

### Document Pattern

```markdown
## Pattern: hook-[type]-[topic]

**Formula**:
"[Generalized pattern with placeholders]"

**Example from this piece**:
> [Actual opening]

**When to use**:
- [Topic type 1]
- [Topic type 2]

**Variations**:
- [Variation 1]
- [Variation 2]

**Extracted from**: [piece path]
**Date**: [timestamp]
```

---

## Step 4: Analyze Structure

### Map the Skeleton

```markdown
## Structure Extraction

**Pattern used**: [Problem-Solution/Journey/Listicle/Story/Custom]

**Section breakdown**:
| Section | Purpose | Word Count | Key Element |
|---------|---------|------------|-------------|
| Hook | Grab attention | 50 | Surprising stat |
| Section 1 | Establish problem | 300 | Concrete example |
| Section 2 | Present solution | 400 | Step-by-step |
| Section 3 | Prove it works | 350 | Case study |
| Conclusion | Call to action | 150 | Clear CTA |

**What made this structure work**:
- [Insight 1]
- [Insight 2]

**Pacing notes**:
- [Where it sped up/slowed down and why]
```

### Create Template (BRAINSTORM if novel)

```
Use AskUserQuestion:

Question: "This structure worked well. Should I save it as a reusable template?"

Options:
1. **Yes, save as template** - Create new structure pattern
2. **Update existing** - Enhance an existing structure template
3. **Skip** - Structure isn't novel enough to save
```

If saving:

```markdown
# Template: [Template Name]

**Best for**: [Topic types this works for]
**Word count target**: [range]

## Structure

### Hook (0-50 words)
[Formula with guidance]
- Include: [required elements]
- Avoid: [anti-patterns]

### Section 1: [Purpose] (~X words)
[Guidance]

### Section 2: [Purpose] (~X words)
[Guidance]

### Conclusion (~X words)
[Closing formula]

**Key elements**: [list]
**Extracted from**: [piece]
```

---

## Step 5: Analyze Voice

### Extract Voice Patterns

```markdown
## Voice Extraction

**Consistent elements identified**:

### Vocabulary patterns
- Words/phrases used repeatedly: [list]
- Technical level: [accessible/moderate/expert]
- Formality: [casual/professional/academic]

### Sentence rhythm
- Average sentence length: [X] words
- Pattern: [e.g., "short-short-long", "varied"]
- Distinctive constructions: [list]

### Tone markers
- Emotional register: [warm/neutral/intense]
- Personality level: [high/medium/low]
- Direct address: [uses "you" / avoids "you"]
```

### Update Voice Profile (BRAINSTORM)

```
Use AskUserQuestion:

Question: "Found these voice elements. How should I update your voice profile?"

Options:
1. **Add as exemplar** - Reference this piece as an example
2. **Extract traits** - Add specific patterns to profile
3. **Both** - Add exemplar and extract traits
4. **Skip** - Voice isn't distinctive enough
```

If updating:

```yaml
# Add to .claude/writing-knowledge/voice-profiles/[name].yaml

exemplars:
  - path: "[piece path]"
    why: "[specific voice element demonstrated]"

traits:
  vocabulary: [updated patterns]
  rhythm: [updated patterns]
  tone: [updated markers]

# If anti-patterns found during editing:
prohibited:
  - "[word/phrase]"  # because: [reason]
```

---

## Step 6: Analyze Transitions

### Extract Smooth Transitions

```markdown
## Transitions Extraction

**Notable transitions found**:

### Between [Section X] and [Section Y]
> "[Actual transition text]"

**Type**: [causal/contrast/continuation/callback]
**Why it worked**: [reason]
**Formula**: "[Generalized pattern]"
```

### Add to Transition Library

```markdown
# Append to docs/patterns/transitions/common-transitions.md

## [Transition Type]: [Name]

**Formula**: "[Pattern with placeholders]"
**Example**: "[From this piece]"
**Use when**: [context]
**Extracted from**: [piece] - [date]
```

---

## Step 7: Log Anti-Patterns

### Review What Was Edited Out

Analyze draft history to find:
- Phrases consistently cut
- Structures reorganized
- Claims that needed rework
- Voice drift that was corrected

```markdown
## Anti-Patterns Identified

### Phrases to Avoid
| Phrase | Why Cut | Better Alternative |
|--------|---------|-------------------|
| "[phrase]" | [reason] | "[alternative]" |

### Structural Issues
| Issue | How Fixed |
|-------|-----------|
| [issue] | [solution] |

### Claims That Failed Fact-Check
| Claim Type | Always Verify |
|------------|---------------|
| "[type]" | [specific check] |
```

---

## Step 8: Promote Scratchpad to Patterns

Read `drafts/.scratchpad.md` and identify recurring preferences:

```
For each preference that appeared 3+ times:
  1. Extract to pattern library
  2. Add to voice profile
  3. Mark as promoted in scratchpad
```

### Promotion Summary (BRAINSTORM)

```
Use AskUserQuestion:

Question: "Found [N] recurring preferences in scratchpad. Promote to permanent patterns?"

Options:
1. **Promote all** - Add all recurring preferences to patterns
2. **Review each** - Let me decide one by one
3. **Skip** - Keep in scratchpad for now
```

---

## Step 9: Update Knowledge Base

Save extracted patterns to:

```
.claude/writing-knowledge/
├── voice-profiles/
│   └── [updated profile].yaml
├── patterns/
│   ├── hooks/
│   │   └── [new hook pattern].md
│   ├── structures/
│   │   └── [new structure template].md
│   └── transitions/
│       └── common-transitions.md  # appended
└── index.md  # updated with new patterns
```

---

## Step 10: Generate Compound Report

Save to `docs/patterns/compound-log/[date]-[piece-slug].md`:

```markdown
# Compound Report: [Piece Title]

**Date**: [timestamp]
**Piece**: [path to original]
**Success factors**: [user-selected factors]

## What Worked

### Hook
**Type**: [hook type]
**Formula**: [pattern]
**Saved to**: [file path]

### Structure
**Pattern**: [structure name]
**Template created**: [yes/no]
**Saved to**: [file path]

### Voice
**Exemplar added**: [yes/no]
**Traits extracted**: [list]
**Updated profile**: [profile name]

### Transitions
**New transitions**: [count]
**Added to**: common-transitions.md

## Anti-Patterns Logged
- [N] phrases added to prohibited list
- [N] structural warnings documented
- [N] fact-check reminders added

## Scratchpad Promotions
- [N] preferences promoted to patterns
- [N] anti-patterns made permanent

## Files Updated
- `patterns/hooks/[file].md`
- `patterns/structures/[file].md`
- `patterns/transitions/common-transitions.md`
- `voice-profiles/[name].yaml`
- `index.md`

## The Compound Effect
This piece adds [N] reusable patterns to your writing system.

**Next similar piece will benefit from**:
- [Specific improvement 1]
- [Specific improvement 2]
- [Specific improvement 3]
```

---

## Step 11: Clear Session Scratchpad

```
After compounding:
1. Archive promoted entries
2. Clear session-specific feedback
3. Reset for next writing session
```

Keep only:
- Unpromoted preferences
- Context notes for next session

---

## Step 12: Post-Compound Options (BRAINSTORM)

**MANDATORY: Use the AskUserQuestion tool here. Do NOT output options as plain text.**

```yaml
tool: AskUserQuestion
question: "Compounding complete. [N] patterns extracted. What next?"
header: "Next"
options:
  - label: "View patterns"
    description: "Open the extracted pattern files in editor"
  - label: "Review pattern library"
    description: "See all accumulated patterns"
  - label: "Start new piece"
    description: "/writing:plan with new patterns available"
  - label: "Done"
    description: "Finished for now"
```

Based on selection:
- **View patterns** → Run `open` on each extracted pattern file
- **Review pattern library** → Display contents of `.claude/writing-knowledge/patterns/`
- **Start new piece** → Call `/writing:plan` to begin new content with accumulated patterns
- **Done** → Exit, patterns are saved for future use
- **Other** (automatically provided) → Accept free text for custom action

---

## The Compound Loop

```
Write → Feedback → Review → Edit → Compound →
                                      ↓
               Scratchpad captures session preferences
                                      ↓
               Compound extracts permanent patterns
                                      ↓
               Knowledge base grows with each piece
                                      ↓
Write (faster) → Review (fewer issues) → Edit (lighter) → Compound →
                                      ↓
                    Each cycle gets easier
```

---

## Quality Checklist

Before completing:
- [ ] All draft versions analyzed
- [ ] Scratchpad history reviewed
- [ ] Success factors identified with user
- [ ] Hook pattern extracted (if novel)
- [ ] Structure template created (if novel)
- [ ] Voice profile updated
- [ ] Transitions documented
- [ ] Anti-patterns logged
- [ ] Recurring scratchpad preferences promoted
- [ ] Knowledge base files updated
- [ ] Compound report saved
- [ ] Scratchpad cleared for next session
