---
name: writing:skill
description: Create new writing skills (voice, domain, format) with automatic research
argument-hint: "create [voice|domain|format] \"name\" [samples or description]"
---

# Writing Skill Command

Create new writing skills with automatic research, pattern matching, and documentation.

## Input

<skill_input> #$ARGUMENTS </skill_input>

**Usage:**
- `create voice "kieran-blog" ~/writing/posts/*.md` → Create voice from your writing samples
- `create voice "founder-voice" "direct, vulnerable, builds in public"` → Create voice from description
- `create domain "persuasion" "Cialdini, rhetoric, behavioral economics"` → Create writing expertise skill
- `create format "twitter-thread"` → Create platform-specific writing format

---

## Step 1: Parse Input

```
Extract:
- action: "create" (only action for now)
- type: "voice" | "domain" | "format"
- name: Skill name (kebab-case)
- source: File paths OR description text
```

---

## Step 2: Load Existing Patterns

Before creating, read existing skills as templates:

```
For voice skills:
  Read: skills/voice/pragmatic-writing/SKILL.md
  Read: skills/voice/dhh-writing/SKILL.md
  Read: skills/voice/every-essay-guide/SKILL.md
  Extract: Common structure, sections, frontmatter

For domain skills:
  Read: docs/WRITING-ARCHITECTURE.md (10 Books Expert pattern)
  Extract: Core texts, secondary texts, frameworks, reasoning patterns

For format skills:
  Read: docs/WRITING-ARCHITECTURE.md (Format Skills section)
  Extract: Platform constraints, key elements
```

---

## Step 3: Research Phase (Parallel Sub-Agents)

### For Voice Skills

```
If source is file paths:
  Load skill: voice-capture

  Task voice-analyzer: "Analyze these writing samples to extract voice patterns.
  Samples: [file contents]
  Return:
  - Vocabulary patterns (technical level, formality, distinctive words)
  - Sentence rhythm (avg length, patterns, constructions)
  - Tone markers (emotional register, personality, direct address)
  - Anti-patterns (what this voice avoids)
  - Example excerpts that exemplify the voice"

If source is description:
  Task voice-researcher: "Research and expand this voice description into a full profile.
  Description: [user description]

  Use WebSearch to find:
  - Writers with similar styles
  - Techniques that match this voice
  - Examples of this voice in action

  Return: Full voice profile with traits, patterns, examples"
```

### For Domain Skills

```
Task domain-researcher: "Research this domain to create a '10 Books Expert' skill.
Domain: [domain name]
Context: [user description if provided]

Research:
1. Identify 5 foundational books/sources for this domain
2. Identify 5 secondary/supporting sources
3. Extract key frameworks and mental models
4. Find common reasoning patterns
5. Identify domain-specific vocabulary
6. Find example applications

Use WebSearch and Context7 for:
- Authoritative sources
- Key thought leaders
- Standard frameworks
- Best practices

Return: Complete domain expertise profile"
```

### For Format Skills

```
Task format-researcher: "Research platform-specific writing constraints and best practices.
Platform: [platform name]

Research:
1. Character/word limits
2. Formatting constraints (headers, lists, links)
3. Optimal structure patterns
4. Engagement best practices
5. Example high-performing content
6. Common mistakes to avoid

Use WebSearch for:
- Platform documentation
- Creator guides
- Performance studies
- Expert recommendations

Return: Complete format constraints and templates"
```

**Wait for all research to complete.**

---

## Step 4: Review Research (BRAINSTORM)

```
Use AskUserQuestion:

Question: "Research complete for [type] skill '[name]'. Here's what I found:

[Summary of key findings]

Does this look right?"

Options:
1. **Looks good** - Proceed with skill creation
2. **Add more** - Include additional elements
3. **Adjust focus** - Change emphasis
4. **Research more** - Dig deeper on specific areas
```

---

## Step 5: Generate Skill Files

### Voice Skill Structure

Create `skills/voice/[name]/`:

```markdown
# SKILL.md
---
name: [name]
description: [When to use this voice - be specific about triggers]
---

# [Name] Voice

[One paragraph describing this voice's essence]

## When to Use This Skill

Use this skill when:
- [Trigger 1]
- [Trigger 2]
- [Trigger 3]

## Voice Profile

### Core Traits
- **Tone**: [warm/neutral/intense/etc.]
- **Formality**: [casual/professional/academic]
- **Personality**: [high/medium/low]
- **Technical Level**: [accessible/moderate/expert]

### Vocabulary Patterns

**Distinctive words/phrases:**
- [word/phrase 1]
- [word/phrase 2]

**Prohibited words:**
- [word 1] - because: [reason]
- [word 2] - because: [reason]

### Sentence Rhythm

- **Average length**: [X] words
- **Pattern**: [description]
- **Constructions**: [distinctive patterns]

### Signature Techniques

1. **[Technique 1]**: [Description]
2. **[Technique 2]**: [Description]

## Writing Rules

1. [Rule 1]
2. [Rule 2]
3. [Rule 3]

## Anti-Patterns

| Avoid | Because | Instead |
|-------|---------|---------|
| "I think that..." | Weakens authority | State directly |
| Passive voice in openings | Buries the action | Lead with subject + verb |
| Corporate jargon | Alienates readers | Use plain language |

## Examples

### Before (Generic)
> It is believed by many experts that the implementation of AI tools can potentially lead to significant productivity improvements in various workplace settings.

### After ([Name] Voice)
> AI tools double your output. I've seen it happen—first in my own work, then across our entire team.

## Integration

Works well with:
- `[other voice]` for [reason]
- `[editing skill]` for [reason]
```

Create supporting files if needed:
- `references/examples.md` - Extended examples
- `references/techniques.md` - Deep dive on techniques

### Domain Skill Structure

Create `skills/domain/[name]/`:

```markdown
# SKILL.md
---
name: domain-[name]
description: Deep expertise in [domain] - the "10 Books Expert" for writing about [topic]
---

# [Domain] Writing Expertise

[One paragraph on what this domain covers and how it improves your writing]

## When to Use This Skill

Use this skill when writing about:
- [Topic 1]
- [Topic 2]
- [Topic 3]

## Core Knowledge Base

### Foundational Works (The 5 Core Books)

1. **[Book/Source 1]** by [Author]
   - Key insight: [insight]
   - Use when writing: [context]

2. **[Book/Source 2]** by [Author]
   - Key insight: [insight]
   - Use when writing: [context]

[... 3-5 total]

### Supporting Works (5 Secondary Sources)

1. **[Source 1]**: [What it adds to your writing]
2. **[Source 2]**: [What it adds to your writing]

[... 3-5 total]

## Writing Frameworks

### [Framework 1 Name]
[How to structure arguments using this framework]

### [Framework 2 Name]
[How to build narratives using this framework]

## Domain Vocabulary

| Term | Plain English | Use in Writing |
|------|---------------|----------------|
| [jargon] | [simple definition] | "[example sentence]" |

## Reasoning Patterns for Writing

When writing about [domain], structure your thinking:

1. **[Pattern 1]**: Start with [X], then show [Y]
2. **[Pattern 2]**: Use [framework] to build the argument

## Common Writing Mistakes

| Mistake | Why Readers Lose Interest | Better Approach |
|---------|---------------------------|-----------------|
| Starting with definitions | Feels like a textbook | Open with a story or stake |
| Too much jargon | Alienates non-experts | Translate, then use sparingly |

## Example Paragraphs

### Topic: [Example Topic 1]
**Hook**: [Opening sentence that grabs attention]
**Structure**: [How to build the argument]
**Key phrases**: "[memorable line]", "[quotable insight]"
```

### Format Skill Structure

Create `skills/format/[name]/`:

```markdown
# SKILL.md
---
name: format-[name]
description: Write for [platform] - constraints, templates, and hooks that work
---

# Writing for [Platform]

[One paragraph on this platform's unique writing requirements]

## When to Use This Skill

Use when:
- Adapting an essay for [platform]
- Writing native [platform] content
- Repurposing long-form into [platform] format

## Writing Constraints

| Element | Constraint |
|---------|-----------|
| Character limit | [X chars] |
| Optimal length | [range] |
| Paragraph length | [X sentences max] |
| Links | [how they affect reach] |
| Formatting | [what's available] |

## Writing Templates

### Template 1: The Thread Opener
```
[Hook that stops the scroll]

[Promise of value]

[Thread indicator: 🧵 or "A thread:"]
```

### Template 2: The Single Post
```
[Observation or hot take]

[One supporting point]

[Call to engage or share]
```

## Writing Techniques

1. **Front-load value**: Put the insight in the first line
2. **Write for skimmers**: Each line should work alone
3. **End with engagement**: Question, challenge, or call to action

## Hooks That Stop the Scroll

| Hook Type | Example |
|-----------|---------|
| Contrarian | "Unpopular opinion: Most productivity advice makes you less productive" |
| Story start | "Last week I almost quit my job. Here's what happened instead:" |
| Number hook | "I've written 500 blog posts. These 3 lessons took the longest to learn:" |
| Bold claim | "AI won't take your job. But someone using AI will." |

## Common Writing Mistakes

| Mistake | Fix |
|---------|-----|
| Burying the hook | Move your best line to the top |
| Too much context | Assume they know nothing, explain everything |
| Weak endings | End with action, not summary |

## Example: High-Performing Post

```
I've shipped code every day for 10 years.

Here's the one habit that changed everything:

I stop coding at 4pm. No exceptions.

Not because I'm lazy. Because the best ideas
come when I'm NOT at my desk.

Shower thoughts. Walk thoughts. Dinner thoughts.

The code I write at 9am is 10x better because
of the thinking I did after 4pm yesterday.

Productivity isn't about more hours.
It's about better hours.
```

**Why it works:**
- Hook with credibility (10 years)
- Counterintuitive insight (stop at 4pm)
- Specific details (shower, walk, dinner)
- Memorable takeaway (better hours, not more)
```

---

## Step 6: Update Documentation

```
Update plugins/compound-writing/CLAUDE.md:
- Add new skill to appropriate table
- Update skill count

Update plugins/compound-writing/README.md:
- Add new skill to skills list
- Update count in description
```

---

## Step 7: Commit

```bash
git add plugins/compound-writing/skills/[type]/[name]/
git add plugins/compound-writing/CLAUDE.md
git add plugins/compound-writing/README.md

git commit -m "feat(compound-writing): Add [name] [type] skill

[Brief description of the skill]

- [Key feature 1]
- [Key feature 2]
- [Key feature 3]

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Step 8: Confirm Creation

```markdown
✓ Created [type] skill: [name]

**Location**: skills/[type]/[name]/
**Files**:
- SKILL.md (main skill definition)
- references/[files] (supporting materials)

**Research sources used**:
- [source 1]
- [source 2]

**Ready to use**:
- Voice selection in `/writing:plan`
- Layering with other voices

**Next steps**:
1. Review the generated skill
2. Add personal examples if desired
3. Test with `/writing:draft`
```

---

## Step 9: Post-Creation Options (BRAINSTORM)

**MANDATORY: Use the AskUserQuestion tool here. Do NOT output options as plain text.**

```yaml
tool: AskUserQuestion
question: "Skill '[name]' created and committed. What next?"
header: "Next"
options:
  - label: "View skill"
    description: "Open the SKILL.md file in editor"
  - label: "Test it"
    description: "Run /writing:plan with this voice"
  - label: "Refine"
    description: "Edit or expand the skill"
  - label: "Create another"
    description: "Make another skill"
```

Based on selection:
- **View skill** → Run `open skills/[type]/[name]/SKILL.md` to open in default editor
- **Test it** → Ask for a topic, then call `/writing:plan` with the new voice selected
- **Refine** → Ask what to improve, then edit the skill file
- **Create another** → Loop back to Step 1 for a new skill
- **Other** (automatically provided) → Accept free text for custom action

---

## Quality Checklist

Before completing:
- [ ] Input correctly parsed (type, name, source)
- [ ] Existing skills read as patterns
- [ ] Research sub-agents completed
- [ ] User approved research findings
- [ ] Skill files created in correct location
- [ ] SKILL.md has valid frontmatter
- [ ] References files created if needed
- [ ] Documentation updated (CLAUDE.md, README.md)
- [ ] Changes committed with descriptive message
- [ ] User shown confirmation with next steps
