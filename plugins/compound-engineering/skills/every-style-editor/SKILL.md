---
name: every-style-editor
description: This skill should be used when reviewing or editing copy to ensure adherence to Every's style guide. Triggers on "edit for style", "review article", "check grammar", "Every style guide", "proofread", "copy edit", or requests to check written content for grammar, punctuation, mechanics, and style compliance.
license: MIT
allowed-tools:
  - Read
  - Edit
  - Write
metadata:
  version: "1.1.0"
  category: editing
  tags: [style-guide, editing, copy, grammar, proofreading]
---

# Every Style Editor

## Contents

- [Overview](#overview)
- [4-Phase Review Process](#4-phase-review-process)
- [Output Format](#output-format)
- [Style Guide Quick Reference](#style-guide-quick-reference)
- [Key Principles](#key-principles)
- [References](#references)

## Overview

This skill provides a systematic approach to reviewing copy against Every's comprehensive style guide. It transforms Claude into a meticulous line editor specializing in grammar, mechanics, and style guide compliance.

**Use when:**
- Reviewing articles, blog posts, newsletters, or any written content
- Ensuring copy follows Every's specific style conventions
- Providing feedback on grammar, punctuation, and mechanics
- Preparing clean copy for human editorial review

## 4-Phase Review Process

| Phase | Focus | Actions |
|-------|-------|---------|
| 1. Initial Assessment | Context | Understand document type, audience, tone |
| 2. Detailed Line Edit | Content | Check grammar, punctuation, word choice, style rules |
| 3. Mechanical Review | Formatting | Verify spacing, formatting, numbers, links |
| 4. Recommendations | Actionable | Provide improvement suggestions |

### Phase 2: Detailed Line Edit Checklist

- [ ] Sentence structure and grammar correctness
- [ ] Punctuation usage (commas, semicolons, em dashes)
- [ ] Capitalization rules (job titles, headlines)
- [ ] Word choice (overused words, passive voice)
- [ ] Adherence to [EVERY_WRITE_STYLE.md](./references/EVERY_WRITE_STYLE.md)

### Phase 3: Mechanical Review Checklist

- [ ] Spacing and formatting consistency
- [ ] Style choices applied uniformly
- [ ] Special elements (lists, quotes, citations)
- [ ] Number formatting (numerals vs. spelled out)
- [ ] Link formatting and descriptions

## Output Format

Present findings using this structure:

```
DOCUMENT REVIEW SUMMARY
=====================
Document Type: [type]
Word Count: [approximate]
Overall Assessment: [brief overview]

ERRORS FOUND: [total number]

DETAILED CORRECTIONS
===================

**Location**: [Paragraph #, Sentence #]
**Issue Type**: [Grammar/Punctuation/Mechanics/Style Guide]
**Original**: "[exact text with error]"
**Correction**: "[corrected text]"
**Rule Reference**: [Specific style guide rule violated]

---

RECURRING ISSUES
===============
[Patterns of errors appearing multiple times]

STYLE GUIDE COMPLIANCE CHECKLIST
==============================
✓ [Rule followed correctly]
✗ [Rule violated - with count]

FINAL RECOMMENDATIONS
===================
[2-3 actionable suggestions]
```

## Style Guide Quick Reference

| Category | Rule |
|----------|------|
| Headlines | Title case for headlines, sentence case elsewhere |
| Tone | Active voice, avoid overused words (actually, very, just) |
| Numbers | Spell out one-nine; numerals for 10+ |
| Punctuation | Oxford commas, em dashes without spaces |
| Capitalization | Lowercase job titles, "it" for company, "they" for teams |
| Emphasis | Italics only (no bold for emphasis) |
| Links | 2-4 words, never "click here" |

**Full style guide:** [EVERY_WRITE_STYLE.md](./references/EVERY_WRITE_STYLE.md)

## Key Principles

- **Be specific**: Quote exact text with errors
- **Reference rules**: Cite specific style guide rule for each correction
- **Maintain voice**: Preserve author's voice while correcting
- **Prioritize clarity**: Focus on changes improving readability
- **Be constructive**: Frame feedback to help writers improve

## Common Focus Areas

Based on Every's style guide:
- Punctuation (commas, semicolons, quotation marks)
- Capitalization (proper nouns, titles)
- Passive voice → active voice
- Parallel structure in lists
- Compound adjective hyphenation
- Company singular ("it") vs. teams plural ("they")

## Quality Checklist

Before delivering edited copy:

- [ ] 4-phase review process completed
- [ ] All errors documented with specific rule references
- [ ] Recurring issues identified and noted
- [ ] Author's voice preserved in corrections
- [ ] Actionable recommendations provided

## References

| File | Purpose |
|------|---------|
| [EVERY_WRITE_STYLE.md](./references/EVERY_WRITE_STYLE.md) | Complete Every style guide (29KB) |
