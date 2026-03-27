---
name: proofread
description: "Proofread and copy-edit documents against a configurable style guide. Use when the user asks to proofread, copy-edit, review writing, check grammar, fix style issues, edit for publication, clean up prose, ensure writing consistency, or review any written content. Supports direct inline editing and Proof document comments. Works with any style guide -- defaults to Every's editorial guide when no custom guide is configured. Triggers on 'proofread this', 'edit my writing', 'check the style', 'copy edit', 'review this draft', 'clean up this post', 'fix the grammar', 'check for style guide violations', or any request to review written content for quality."
---

# Proofread

Copy-edit documents against a style guide. Works with any guide -- ships with Every's editorial guide as the default, and supports custom guides via project configuration.

---

## Step 1: Load the Style Guide

Check for a configured style guide in this order:

1. **Project config**: Read `.claude/compound-engineering.local.md` and look for a `style_guide` key in the YAML frontmatter
2. **Project docs**: Check if AGENTS.md or CLAUDE.md specifies a style guide path (search for "style guide" or "style_guide")
3. **Default**: Use the bundled Every editorial guide at `references/every-editorial.md`

The `style_guide` config can be:
- A file path to a markdown style guide in the repo (e.g., `docs/style-guide.md`)
- `every-editorial` -- the bundled Every editorial guide (this is the default)

If a configured path doesn't resolve, tell the user and fall back to the default.

**Example config** (`.claude/compound-engineering.local.md`):
```yaml
---
style_guide: docs/our-company-style-guide.md
---
```

Read the style guide thoroughly before starting. Internalize its voice and rules -- the guide shapes how to edit, not a checklist to verify against mechanically.

---

## Step 2: Classify the Document

Identify the document type to calibrate the review:

| Type | Signals | Focus |
|------|---------|-------|
| Editorial / blog | Byline, narrative, conversational tone | Voice, flow, readability, full style guide compliance |
| Newsletter | Greeting, sign-off, article links | Tone, brevity, link formatting, first-name references |
| Technical docs | Code blocks, API references, steps | Clarity, accuracy, consistent terminology, scannability |
| Social / marketing | Short form, CTAs, promotional | Punch, brevity, brand voice |
| Knowledge base | How-to, FAQ format | Plain language, completeness, parallel structure |

If ambiguous, ask the user what kind of document this is -- it changes how strictly certain rules apply (e.g., technical docs tolerate passive voice more than editorial pieces).

---

## Step 3: Choose Output Mode

Ask the user how they want edits delivered. Present these options using the platform's question tool (e.g., `AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini) or present numbered options and wait for a reply:

**1. Direct edit** -- Apply corrections inline to the file. Best for quick turnaround when the author trusts the edits. This is the default for files in the repo.

**2. Proof comments** -- Upload the document to Proof and add inline comments and suggestions the author can accept or reject one by one. Best when changes need review before acceptance. To use this mode, load the `proof` skill for integration details, then:
  - Create a Proof document with the content
  - Add `suggestion.add` ops for concrete text replacements (grammar, punctuation, mechanics)
  - Add `comment.add` ops for judgment calls that need discussion (restructuring, tone, cuts)
  - Share the Proof URL with the user

**3. Summary only** -- Don't change anything; just list what you'd fix and why. Best for when the author wants to make changes themselves.

If the user doesn't specify and the content was pasted (no file path), default to summary only.

---

## Step 4: Perform the Review

### Read first, edit second

Read the full piece before making any changes. Understand the author's intent, argument structure, and voice. A proofreader who doesn't understand the piece will make edits that technically follow the rules but damage the writing.

### Make corrections

Work through the document addressing:

- **Grammar and mechanics** -- punctuation, capitalization, spelling, subject-verb agreement
- **Style guide compliance** -- specific rules from the loaded guide (the guide is authoritative; apply its rules even when they conflict with general conventions)
- **Clarity** -- awkward phrasing, ambiguity, unnecessarily complex sentences, passive voice where active would be stronger
- **Consistency** -- terminology, formatting, and tone applied uniformly throughout

### Preserve the author's voice

The goal is to polish, not rewrite. Fix errors and tighten prose without flattening personality. When a sentence has character but also has a grammar issue, fix the grammar and keep the character. The model's default voice is nobody's voice -- resist the pull toward generic smoothness.

### Explain non-obvious changes

Straightforward grammar fixes need no explanation. Style judgment calls do -- restructuring a paragraph, cutting a phrase, changing word choice. Add a brief note for any change the author might question.

### What NOT to do

- Don't add content, expand the piece, or introduce new arguments
- Don't restructure unless something is genuinely unclear or illogical
- Don't impose preferences that aren't in the style guide
- Don't flag intentional stylistic choices as errors (sentence fragments for emphasis, unconventional punctuation for voice, etc.)
- Don't soften direct language or add hedges

---

## Step 5: Present Results

### Direct edit mode

After editing the file, provide a brief summary:
- Number of changes made, grouped by category (e.g., "14 punctuation fixes, 3 style guide corrections, 2 clarity improvements")
- Any judgment calls worth noting -- where the style guide was ambiguous or the author might prefer the original
- Recurring patterns worth mentioning (e.g., "You tend to overuse em dashes -- I fixed a few but left some where they work well")

### Proof comments mode

After posting to Proof:
- Share the Proof URL
- Brief summary: "Added N suggestions and M comments. Key themes: [list]"
- Note: suggestions are concrete fixes (accept/reject), comments are discussion points

### Summary only mode

Present findings grouped by severity:
- **Errors** -- clear violations of grammar or style guide rules
- **Suggestions** -- improvements that would strengthen the piece but aren't wrong per se
- **Notes** -- patterns or choices worth the author's awareness

For each finding, quote the original text, provide the correction or suggestion, and cite the relevant style guide rule when one applies.
