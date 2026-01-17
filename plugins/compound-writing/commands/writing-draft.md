---
name: writing:draft
description: Transform an outline into prose following style preferences
argument-hint: "[path to outline.md] or [refine draft-ID]"
---

# Writing Draft Command

Execute an outline into prose, following style preferences and voice profiles.

## Input

<outline_path> #$ARGUMENTS </outline_path>

**Input Types:**
- `drafts/[slug]/outline.md` → EXPLORATION mode (create 3 drafts)
- `refine draft-2` → REFINEMENT mode (improve specific draft)
- `drafts/[slug]/` → Find outline in that directory

---

## Skills to Load

Before starting, load these skills:

```
Skill: writing-orchestration
  - 10 baseline strategies (always apply)
  - 20+ situational strategies (select 3-4)
  - Quality checkpoints

Skill: scratchpad
  - Session preference memory
  - Recency weighting for feedback

Skill: context-notes
  - Read handoff from /writing:plan
  - Output handoff for /writing:review

Skill: [voice skill] - Load based on context:
  - pragmatic-writing (technical content)
  - dhh-writing (opinionated takes)
  - every-style-editor (Every house style)
  - [custom voice profile]
```

---

## Step 1: Determine Mode

| Input | Mode | Output |
|-------|------|--------|
| Outline path | EXPLORATION | 3 draft variations |
| "refine draft-X" | REFINEMENT | 1 improved draft |

---

## Step 2: Load Context Notes

Read handoff from `/writing:plan`:

```
If <context_notes> available:
  Extract:
  - Research summary
  - Material available (examples, data, quotes)
  - Message clarity (thesis, audience, action)
  - Voice configuration
  - Mode
```

---

## Step 3: Load Scratchpad Preferences

Check `drafts/.scratchpad.md`:

```
If scratchpad exists:
  1. Load preference profile
  2. Extract "What Works ✓" patterns
  3. Extract "What Doesn't ✗" anti-patterns
  4. Apply recency weighting (newer feedback > older)
  5. Note any conflicts to address
```

---

## Step 4: Load Outline and Research

```
Read:
- drafts/[slug]/outline.md
- drafts/[slug]/research.md
- drafts/[slug]/sources.md
- drafts/[slug]/brief.md (if exists)

Extract:
- Hook (opening text)
- Section structure
- Source requirements per section
- Target word count
```

---

## Step 5: Select Voice (BRAINSTORM if needed)

**If voice profile specified in context notes:** Load it.

**If NO voice profile found:**

```
Use AskUserQuestion:

Question: "Which voice/style should I use for this piece?"

Options:
1. **Pragmatic** - Clear, technical, Hunt/Thomas style
2. **DHH** - Direct, opinionated, punchy
3. **Every** - Professional, warm, insight-forward
4. **Conversational** - Friendly, accessible, uses "you"
5. **Infer from outline** - Match the tone of the outline
```

---

## Step 6: Select Situational Strategies (BRAINSTORM)

Load baseline strategies (always apply all 10).

Then select situational strategies:

```
Use AskUserQuestion:

Question: "Which techniques should I emphasize? (Select 2-3)"

Options (multiSelect: true):
1. **Strong hooks** - Counterintuitive openings, tension builders
2. **Concrete examples** - Show don't tell, sensory details
3. **Data-driven** - Statistics, research citations
4. **Story elements** - Narrative arc, dialogue, scenes
5. **Persuasion** - Social proof, objection handling
```

Map selections to strategies:
- Strong hooks → `hook-effectiveness`, `tension-builder`, `pattern-twist`
- Concrete examples → `ladder-abstraction`, `show-and-tell`, `name-of-dog`
- Data-driven → `source-integration`, `stat-framing`
- Story elements → `narrate-scenes`, `dialogue-compression`, `reveal-traits`
- Persuasion → `objection-bridge`, `social-proof`, `build-to-ask`

---

## Step 7: Pre-Draft Checklist

Before writing any prose, verify:

- [ ] **Opening is concrete** - Story or example first, not theory
- [ ] **Each section has clear purpose** - Know what each must accomplish
- [ ] **Sources are sufficient** - Every claim can be supported
- [ ] **Voice is defined** - Know the style to match
- [ ] **Scratchpad preferences loaded** - Will honor feedback

**If any fail:**

```
Use AskUserQuestion:

Question: "Pre-flight check failed: [issue]. What should we do?"

Options:
1. "Return to /writing:plan" - Address the gap
2. "Proceed anyway" - Note the issue and continue
3. "Clarify now" - Answer inline
```

---

## Step 8: Section-by-Section Drafting

### The Producer-Critic Loop

For each section in the outline:

```
Loop for each section:
  1. Draft the section following:
     - Outline beats and key points
     - Selected strategies
     - Voice profile rules
     - Scratchpad preferences

  2. Run voice-guardian check:
     Task voice-guardian: "Check this section against voice profile:
     Section: [section text]
     Voice: [profile name]
     Scratchpad: [key preferences]
     Return: Score (0-100) and specific fixes."

  3. If score < 85:
     - Apply suggested fixes
     - Re-check until score ≥ 85

  4. If score ≥ 85:
     - Move to next section
```

### Apply Baseline Strategies

For ALL content:

| Strategy | Check |
|----------|-------|
| `reader-zero-context` | Unfamiliar terms have 3-6 word orienting phrases |
| `subject-verb` | Subject + verb in first 5 words |
| `activate-verbs` | Precise verbs, minimal is/was/has |
| `watch-adverbs` | Strong verbs carry the load |
| `limit-ings` | Simple tense over continuous |
| `prefer-simple` | Everyday language unless technical |
| `cut-big-small` | Edit hierarchically |
| `ban-empty-hypophora` | No self-answered questions |
| `present-active-tense` | Direct, immediate language |
| `one-idea-per-sentence` | Single clear point per sentence |

---

## Step 9: Create Draft Variations (EXPLORATION mode)

If EXPLORATION mode, create 3 distinct drafts:

```
Draft 1 (draft-[N]): [Angle 1 - e.g., story-forward]
Draft 2 (draft-[N+1]): [Angle 2 - e.g., data-forward]
Draft 3 (draft-[N+2]): [Angle 3 - e.g., contrarian]
```

Each draft should:
- Follow the same outline structure
- Use the same sources
- Vary the APPROACH, not just words:
  - Different opening hooks
  - Different example emphasis
  - Different tonal register

---

## Step 10: Quality Checkpoints

Before saving, verify each draft:

- [ ] Opening hooks within first 50 words
- [ ] No paragraph over 4 sentences
- [ ] Concrete example in each major section
- [ ] All claims have sources cited
- [ ] Clear CTA at end
- [ ] Overall voice score ≥ 85
- [ ] Scratchpad preferences honored

---

## Step 11: Save Drafts

For EXPLORATION mode:

```
drafts/[slug]/
├── draft-[N].md      # Draft 1
├── draft-[N+1].md    # Draft 2
└── draft-[N+2].md    # Draft 3
```

For REFINEMENT mode:

```
drafts/[slug]/
└── draft-[ID].md     # Updated (keeps same ID)
```

**Draft metadata:**

```markdown
---
draft_id: "draft-[N]"
title: "[Title]"
version: 1
angle: "[Angle description]"
style: "[style used]"
voice_score: [final score]
word_count: [count]
reading_time: "[X] minutes"
created: [timestamp]
strategies_applied:
  baseline: "all 10"
  situational: ["strategy-1", "strategy-2", "strategy-3"]
---

[Draft content]

---

## Draft Notes
- Sources used: [list]
- Scratchpad preferences applied: [list]
- Known weaknesses: [any identified issues]
```

---

## Step 12: Draft ID Management

```
Session tracking:
- First exploration: draft-1, draft-2, draft-3
- Second exploration: draft-4, draft-5, draft-6
- Refinement of draft-2: draft-2 (keeps ID, version increments)
```

Rules:
- IDs persist across the session
- NEVER reuse IDs
- Refinements keep original draft ID
- New explorations always increment

---

## Step 13: Output Context Notes

Generate handoff for `/writing:review`:

```markdown
<context_notes>
## Draft Status
- Drafts created: draft-[N], draft-[N+1], draft-[N+2]
- Word counts: [X], [Y], [Z]
- Voice scores: [X], [Y], [Z] (target: 85)

## Strategies Applied
- Baseline: All 10 applied
- Situational: [strategy-1], [strategy-2], [strategy-3]

## Known Issues
- [Any identified weaknesses per draft]

## Scratchpad Summary
- ✓ Applied: [preferences honored]
- ✗ Avoided: [anti-patterns avoided]

## Mode
EXPLORATION

## Recommended Next
User should review drafts and provide feedback via /writing:feedback
</context_notes>
```

---

## Step 14: Present Options (BRAINSTORM)

```
Use AskUserQuestion:

Question: "3 drafts ready. Which resonates most?"

Options:
1. **draft-[N]**: [Angle 1 summary] - [word count] words
2. **draft-[N+1]**: [Angle 2 summary] - [word count] words
3. **draft-[N+2]**: [Angle 3 summary] - [word count] words
4. **Show all** - Display all 3 for comparison
5. **None** - Try different angles
```

After selection, **MANDATORY: Use the AskUserQuestion tool here. Do NOT output options as plain text.**

```yaml
tool: AskUserQuestion
question: "What next with [selected draft]?"
header: "Next"
options:
  - label: "Open draft"
    description: "View the draft in editor for review"
  - label: "Run editorial review"
    description: "/writing:review [draft-ID]"
  - label: "Quick feedback"
    description: "Mark what works/doesn't"
  - label: "Refine this draft"
    description: "Make specific improvements"
```

Based on selection:
- **Open draft** → Run `open drafts/[slug]/draft-v[N].md` to open in default editor
- **Run editorial review** → Call `/writing:review [draft-ID]`
- **Quick feedback** → Call `/writing:feedback [draft-ID]` with user's note
- **Refine this draft** → Ask what to improve, then iterate on the draft
- **Other** (automatically provided) → Accept free text for custom action

---

## Common Issues

### Voice Score Won't Reach 85

```
Use AskUserQuestion:

Question: "Voice score stuck at [X]. The profile may be too strict. What should we do?"

Options:
1. "Lower the bar" - Accept 75+ for this piece
2. "Identify blockers" - Show what's causing drift
3. "Switch voice" - Try a different profile
```

### Scratchpad Conflicts

```
Use AskUserQuestion:

Question: "Conflicting preferences in scratchpad: [conflict]. Which takes priority?"

Options:
1. "[Preference A]" - Recent feedback
2. "[Preference B]" - Earlier feedback
3. "Find middle ground" - Balance both
```

---

## Quality Checklist

Before completing:
- [ ] Mode correctly identified (EXPLORATION vs REFINEMENT)
- [ ] Voice profile loaded and applied
- [ ] Scratchpad preferences honored
- [ ] All 10 baseline strategies applied
- [ ] 3-4 situational strategies visible
- [ ] Each draft has unique angle (not just word changes)
- [ ] Draft IDs assigned and tracked
- [ ] Context notes ready for handoff
