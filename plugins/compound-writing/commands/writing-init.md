---
name: writing:init
description: Initialize compound-writing for this project with interactive setup
argument-hint: "[--minimal | --full]"
---

# Writing Init Command

Set up compound-writing for this project with an interactive wizard.

## Input

<init_args> #$ARGUMENTS </init_args>

**Modes:**
- `--minimal` → Skip questions, create basic structure only
- `--full` → Full interactive setup with all options
- (no args) → Smart defaults with key questions

---

## Step 1: Welcome & Mode Detection

```markdown
# Compound Writing Setup

Setting up your writing environment. This will create:
- Local knowledge directories for voice profiles and patterns
- Project CLAUDE.md with writing preferences
- Draft workspace with scratchpad

Let's customize your setup.
```

Check for existing setup:
```
If .claude/writing-knowledge/ exists:
  Ask: "Existing setup found. Overwrite / Merge / Cancel?"
```

---

## Step 2: Interactive Configuration (BRAINSTORM)

```
Use AskUserQuestion:

Question: "What type of writing will you do in this project?"
Header: "Content Type"
Options:
1. **Technical/Engineering** - Documentation, tutorials, dev blogs
2. **Business/Marketing** - Landing pages, emails, social
3. **Editorial/Essays** - Long-form articles, newsletters
4. **Mixed** - Multiple content types
```

```
Use AskUserQuestion:

Question: "Do you have existing writing samples to extract your voice from?"
Header: "Voice Setup"
Options:
1. **Yes, I have samples** - Will analyze files to create voice profile
2. **No, describe my style** - I'll describe my voice preferences
3. **Use a preset voice** - Start with pragmatic/DHH/Every style
4. **Skip for now** - Set up voice later
```

```
Use AskUserQuestion:

Question: "Which style guide should be your default?"
Header: "Style Guide"
Options:
1. **Every Style** - Every publication standards
2. **Pragmatic** - Hunt/Thomas/Spolsky style
3. **DHH Style** - Direct, opinionated prose
4. **Custom** - I'll configure my own
5. **None** - No default style guide
```

```
Use AskUserQuestion:

Question: "Where should drafts be stored?"
Header: "Draft Location"
Options:
1. **drafts/** - Standard drafts directory (recommended)
2. **content/** - Content directory
3. **docs/** - Documentation directory
4. **Custom** - Specify custom path
```

---

## Step 3: Create Directory Structure

Based on selections, create:

```bash
# Core knowledge directories
mkdir -p .claude/writing-knowledge/voice-profiles
mkdir -p .claude/writing-knowledge/patterns/hooks
mkdir -p .claude/writing-knowledge/patterns/structures
mkdir -p .claude/writing-knowledge/patterns/transitions
mkdir -p .claude/writing-knowledge/references

# Draft workspace (based on selection)
mkdir -p drafts

# Create empty tracking files
touch drafts/.scratchpad.md
touch drafts/.context.md
```

### Initialize Scratchpad

```markdown
# Writing Scratchpad

> Session-specific preferences and feedback. Reset between projects.

## What Works ✓

_Add preferences as you draft: `/writing:feedback draft-2 love the opening`_

## What Doesn't ✗

_Mark what to avoid: `/writing:feedback draft-1 too formal`_

## Voice Notes

_General style preferences discovered during this session_

---

Last updated: [timestamp]
```

### Initialize Context

```markdown
# Writing Context

> Persistent context that carries between sessions.

## Project Overview

_Describe the writing project_

## Target Audience

_Who are you writing for?_

## Voice Configuration

- **Primary voice**: [selected voice or "not configured"]
- **Style guide**: [selected guide or "none"]
- **Channel**: [blog/newsletter/social/docs]

## Active Drafts

_Tracked automatically by /writing:plan and /writing:draft_

---

Last updated: [timestamp]
```

---

## Step 4: Create Project CLAUDE.md

If no `.claude/CLAUDE.md` exists, create one. If it exists, append writing section.

### New CLAUDE.md Template

```markdown
# Project Writing Guide

## Writing System

This project uses the compound-writing plugin for AI-assisted writing.

### Quick Commands

| Command | Purpose |
|---------|---------|
| `/writing:plan [topic]` | Research and outline a piece |
| `/writing:draft [outline]` | Turn outline into prose |
| `/writing:review [draft]` | Multi-agent editorial review |
| `/writing:feedback [draft] [note]` | Capture preferences |
| `/writing:compound [piece]` | Extract patterns from success |

### Voice Configuration

**Primary Voice**: [from selection]
**Style Guide**: [from selection]
**Content Type**: [from selection]

### Writing Preferences

_Add your preferences here as you discover them_

#### Do
- [preference 1]
- [preference 2]

#### Don't
- [anti-preference 1]
- [anti-preference 2]

### Draft Location

All drafts are stored in: `[selected path]/`

Structure:
```
[drafts]/
├── .scratchpad.md      # Session feedback
├── .context.md         # Persistent context
└── [slug]/             # Per-piece directories
    ├── outline.md
    ├── sources.md
    └── draft-v*.md
```

## Voice Profile

_Generated from samples or configured manually_

```yaml
voice:
  name: "[project-name]-voice"
  traits: []
  register: informal
  prohibited: []
  channels:
    default: "standard prose"
```

---

🤖 Generated with [Claude Code](https://claude.com/claude-code) compound-writing plugin
```

### Append to Existing CLAUDE.md

If CLAUDE.md exists, append:

```markdown

---

## Writing System

This project uses the compound-writing plugin.

### Configuration
- **Voice**: [selection]
- **Style Guide**: [selection]
- **Draft Location**: [selection]

### Commands
- `/writing:plan` → Research & outline
- `/writing:draft` → Execute outline
- `/writing:review` → Editorial review
- `/writing:feedback` → Capture preferences
```

---

## Step 5: Voice Setup (If Selected)

### Option A: Extract from Samples

```
Use AskUserQuestion:

Question: "Provide paths to your writing samples (glob patterns supported)"
Header: "Samples"
Options:
1. **Blog posts** - posts/*.md or content/blog/*.md
2. **Documentation** - docs/*.md or README files
3. **Custom path** - Specify your own pattern
```

Then run voice extraction:
```
Load skill: voice-capture

Task voice-analyzer: "Analyze these writing samples to extract voice patterns.
Samples: [glob pattern results]
Return: Voice profile YAML"
```

Save to `.claude/writing-knowledge/voice-profiles/[project-name].yaml`

### Option B: Describe Style

```
Use AskUserQuestion:

Question: "Describe your writing style in a few words"
Header: "Style"
Options:
1. **Direct & punchy** - Short sentences, no fluff
2. **Conversational** - Friendly, like talking to a friend
3. **Technical but clear** - Precise without jargon
4. **Storytelling** - Narrative-driven, uses examples
```

Create voice profile from selection.

### Option C: Use Preset

Copy selected voice profile to local:
```bash
cp skills/voice/[selected]/references/voice-profile.yaml \
   .claude/writing-knowledge/voice-profiles/default.yaml
```

---

## Step 6: Create Pattern Templates

Initialize empty pattern files for future capture:

### hooks/README.md
```markdown
# Hook Patterns

Captured opening hooks that work well.

## Usage

Run `/writing:compound` after publishing to extract hooks.

## Pattern Template

```yaml
---
name: hook-name
type: hook
effectiveness: high/medium
use_when: "description"
---

[Hook example]

**Why it works**: [explanation]
```
```

### structures/README.md
```markdown
# Structure Patterns

Captured article structures that work.

## Pattern Template

```yaml
---
name: structure-name
type: structure
word_count: 1000-2000
use_when: "description"
---

1. **Opening**: [description]
2. **Section 1**: [description]
3. **Section 2**: [description]
4. **Closing**: [description]
```
```

---

## Step 7: Git Configuration (Optional)

```
Use AskUserQuestion:

Question: "Add writing files to .gitignore?"
Header: "Git"
Options:
1. **Yes, ignore drafts** - Keep drafts local only
2. **Yes, ignore scratchpad only** - Track drafts, not session data
3. **No, track everything** - Commit all writing files
4. **Skip** - Don't modify .gitignore
```

If selected, append to .gitignore:
```
# Compound Writing (session files)
drafts/.scratchpad.md
drafts/.context.md

# Optional: ignore all drafts
# drafts/
```

---

## Step 8: Confirmation Summary

```markdown
# Setup Complete ✓

## Created Directories
- `.claude/writing-knowledge/voice-profiles/`
- `.claude/writing-knowledge/patterns/hooks/`
- `.claude/writing-knowledge/patterns/structures/`
- `.claude/writing-knowledge/patterns/transitions/`
- `.claude/writing-knowledge/references/`
- `[draft-location]/`

## Created Files
- `[draft-location]/.scratchpad.md` - Session feedback
- `[draft-location]/.context.md` - Persistent context
- `.claude/CLAUDE.md` - Project writing guide (created/updated)
- `.claude/writing-knowledge/voice-profiles/[name].yaml` - Voice profile (if configured)

## Configuration
- **Voice**: [selection or "not configured"]
- **Style Guide**: [selection]
- **Draft Location**: [path]
- **Content Type**: [selection]

## Next Steps

1. **Start writing**: `/writing:plan "your topic"`
2. **Configure voice**: `/writing:knowledge add voice-profile`
3. **Add patterns**: `/writing:compound` after publishing

Run `/writing:knowledge status` to see your setup anytime.
```

---

## Step 9: Post-Init Options (BRAINSTORM)

**MANDATORY: Use the AskUserQuestion tool here. Do NOT output options as plain text.**

```yaml
tool: AskUserQuestion
question: "Setup complete! What would you like to do next?"
header: "Next"
options:
  - label: "View setup"
    description: "Show created files and directories"
  - label: "Start a draft"
    description: "Run /writing:plan with a topic"
  - label: "Configure voice"
    description: "Set up voice profile from samples"
  - label: "Done"
    description: "Exit setup"
```

Based on selection:
- **View setup** → Run `ls -la` on created directories and show file contents
- **Start a draft** → Ask for topic, then call `/writing:plan [topic]`
- **Configure voice** → Call `/writing:knowledge add voice-profile` workflow
- **Done** → Exit, setup is complete
- **Other** (automatically provided) → Accept free text for custom action

---

## Minimal Mode (--minimal)

Skip all questions, use smart defaults:

```bash
# Create all directories
mkdir -p .claude/writing-knowledge/voice-profiles
mkdir -p .claude/writing-knowledge/patterns/{hooks,structures,transitions}
mkdir -p .claude/writing-knowledge/references
mkdir -p drafts

# Create tracking files
touch drafts/.scratchpad.md
touch drafts/.context.md

# Create minimal CLAUDE.md section
# Append writing config to existing or create new
```

Output:
```
✓ Created compound-writing structure in .claude/writing-knowledge/
✓ Created draft workspace in drafts/
✓ Updated .claude/CLAUDE.md

Run /writing:plan to start writing!
```

---

## Quality Checklist

Before completing init:
- [ ] All directories created successfully
- [ ] Scratchpad initialized with template
- [ ] Context file initialized with template
- [ ] CLAUDE.md created or updated
- [ ] Voice profile saved (if configured)
- [ ] .gitignore updated (if selected)
- [ ] Summary shown to user
- [ ] Next steps provided
