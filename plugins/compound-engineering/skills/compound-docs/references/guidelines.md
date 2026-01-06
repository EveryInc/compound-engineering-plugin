# Documentation Guidelines

## Error Handling

| Situation | Action |
|-----------|--------|
| Missing context | Ask user, don't proceed until provided |
| YAML validation failure | Show errors, retry with corrected values, BLOCK until valid |
| Similar issue ambiguity | Present matches, let user choose |
| Module not in module list | Warn but don't block, suggest adding module |

## Execution Rules

**MUST do:**
- Validate YAML frontmatter (BLOCK if invalid)
- Extract exact error messages from conversation
- Include code examples in solution section
- Create directories before writing files (`mkdir -p`)
- Ask user and WAIT if critical context missing

**MUST NOT do:**
- Skip YAML validation
- Use vague descriptions (not searchable)
- Omit code examples or cross-references

## Quality Checklist

**Good documentation has:**
- [ ] Exact error messages (copy-paste from output)
- [ ] Specific file:line references
- [ ] Observable symptoms (what you saw, not interpretations)
- [ ] Failed attempts documented (helps avoid wrong paths)
- [ ] Technical explanation (not just "what" but "why")
- [ ] Code examples (before/after if applicable)
- [ ] Prevention guidance (how to catch early)
- [ ] Cross-references (related issues)

**Avoid:**
- Vague descriptions ("something was wrong")
- Missing technical details ("fixed the code")
- No context (which version? which file?)
- Just code dumps (explain why it works)
- No prevention guidance
- No cross-references

## Success Criteria

Documentation is complete when:
- YAML frontmatter validated (all required fields, correct formats)
- File created in `docs/solutions/[category]/[filename].md`
- Enum values match schema exactly
- Code examples included
- Cross-references added if related issues found
- User presented with decision menu
