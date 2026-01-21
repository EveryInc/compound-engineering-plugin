<overview>
Skills have three structural components: YAML frontmatter (metadata), pure XML body structure (content organization), and progressive disclosure (file organization). This reference defines requirements and best practices for each component.
</overview>

<xml_structure_requirements>
<critical_rule>
**Remove ALL markdown headings (#, ##, ###) from skill body content.** Replace with semantic XML tags. Keep markdown formatting WITHIN content (bold, italic, lists, code blocks, links).
</critical_rule>

<required_tags>
Every skill MUST have these three tags:

- **`<objective>`** - What the skill does and why it matters (1-3 paragraphs)
- **`<quick_start>`** - Immediate, actionable guidance (minimal working example)
- **`<success_criteria>`** or **`<when_successful>`** - How to know it worked
</required_tags>

<conditional_tags>
Add based on skill complexity and domain requirements:

- **`<context>`** - Background/situational information
- **`<workflow>` or `<process>`** - Step-by-step procedures
- **`<advanced_features>`** - Deep-dive topics (progressive disclosure)
- **`<validation>`** - How to verify outputs
- **`<examples>`** - Multi-shot learning
- **`<anti_patterns>`** - Common mistakes to avoid
- **`<security_checklist>`** - Non-negotiable security patterns
- **`<testing>`** - Testing workflows
- **`<common_patterns>`** - Code examples and recipes
- **`<reference_guides>` or `<detailed_references>`** - Links to reference files

See [use-xml-tags.md](use-xml-tags.md) for detailed guidance on each tag.
</conditional_tags>

<tag_selection_intelligence>
**Simple skills** (single domain, straightforward):
- Required tags only
- Example: Text extraction, file format conversion

**Medium skills** (multiple patterns, some complexity):
- Required tags + workflow/examples as needed
- Example: Document processing with steps, API integration

**Complex skills** (multiple domains, security, APIs):
- Required tags + conditional tags as appropriate
- Example: Payment processing, authentication systems, multi-step workflows
</tag_selection_intelligence>

<xml_nesting>
Properly nest XML tags for hierarchical content:

```xml
<examples>
<example number="1">
<input>User input</input>
<output>Expected output</output>
</example>
</examples>
```

Always close tags:
```xml
<objective>
Content here
</objective>
```
</xml_nesting>

<tag_naming_conventions>
Use descriptive, semantic names:
- `<workflow>` not `<steps>`
- `<success_criteria>` not `<done>`
- `<anti_patterns>` not `<dont_do>`

Be consistent within your skill. If you use `<workflow>`, don't also use `<process>` for the same purpose (unless they serve different roles).
</tag_naming_conventions>
</xml_structure_requirements>

<yaml_requirements>
<required_fields>
```yaml
---
name: skill-name-here
description: What it does and when to use it (third person, specific triggers)
---
```
</required_fields>

<name_field>
**Validation rules**:
- Maximum 64 characters
- Lowercase letters, numbers, hyphens only
- No XML tags
- No reserved words: "anthropic", "claude"
- Must match directory name exactly

**Examples**:
- ✅ `process-pdfs`
- ✅ `manage-facebook-ads`
- ✅ `setup-stripe-payments`
- ❌ `PDF_Processor` (uppercase)
- ❌ `helper` (vague)
- ❌ `claude-helper` (reserved word)
</name_field>

<description_field>
**Validation rules**:
- Non-empty, maximum 1024 characters
- No XML tags
- Third person (never first or second person)
- Include what it does AND when to use it

**Critical rule**: Always write in third person.
- ✅ "Processes Excel files and generates reports"
- ❌ "I can help you process Excel files"
- ❌ "You can use this to process Excel files"

**Structure**: Include both capabilities and triggers.

**Effective examples**:
```yaml
description: Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDF files or when the user mentions PDFs, forms, or document extraction.
```

```yaml
description: Analyze Excel spreadsheets, create pivot tables, generate charts. Use when analyzing Excel files, spreadsheets, tabular data, or .xlsx files.
```

```yaml
description: Generate descriptive commit messages by analyzing git diffs. Use when the user asks for help writing commit messages or reviewing staged changes.
```

**Avoid**:
```yaml
description: Helps with documents
```

```yaml
description: Processes data
```
</description_field>
</yaml_requirements>

<naming_conventions>
Use **verb-noun convention** for skill names:

<pattern name="create">
Building/authoring tools

Examples: `create-agent-skills`, `create-hooks`, `create-landing-pages`
</pattern>

<pattern name="manage">
Managing external services or resources

Examples: `manage-facebook-ads`, `manage-zoom`, `manage-stripe`, `manage-supabase`
</pattern>

<pattern name="setup">
Configuration/integration tasks

Examples: `setup-stripe-payments`, `setup-meta-tracking`
</pattern>

<pattern name="generate">
Generation tasks

Examples: `generate-ai-images`
</pattern>

<avoid_patterns>
- Vague: `helper`, `utils`, `tools`
- Generic: `documents`, `data`, `files`
- Reserved words: `anthropic-helper`, `claude-tools`
- Inconsistent: Directory `facebook-ads` but name `facebook-ads-manager`
</avoid_patterns>
</naming_conventions>

<progressive_disclosure>
<principle>
SKILL.md serves as an overview that points to detailed materials as needed. This keeps context window usage efficient.
</principle>

<practical_guidance>
- Keep SKILL.md body under 500 lines
- Split content into separate files when approaching this limit
- Keep references one level deep from SKILL.md
- Add table of contents to reference files over 100 lines
</practical_guidance>

<pattern name="high_level_guide">
Quick start in SKILL.md, details in reference files:

```markdown
---
name: pdf-processing
description: Extracts text and tables from PDF files, fills forms, and merges documents. Use when working with PDF files or when the user mentions PDFs, forms, or document extraction.
---

<objective>
Extract text and tables from PDF files, fill forms, and merge documents using Python libraries.
</objective>

<quick_start>
Extract text with pdfplumber:

```python
import pdfplumber
with pdfplumber.open("file.pdf") as pdf:
    text = pdf.pages[0].extract_text()
```
</quick_start>

<advanced_features>
**Form filling**: See [forms.md](forms.md)
**API reference**: See [reference.md](reference.md)
</advanced_features>
```

Claude loads forms.md or reference.md only when needed.
</pattern>

<pattern name="domain_organization">
For skills with multiple domains, organize by domain to avoid loading irrelevant context:

```
bigquery-skill/
├── SKILL.md (overview and navigation)
└── reference/
    ├── finance.md (revenue, billing metrics)
    ├── sales.md (opportunities, pipeline)
    ├── product.md (API usage, features)
    └── marketing.md (campaigns, attribution)
```

When user asks about revenue, Claude reads only finance.md. Other files stay on filesystem consuming zero tokens.
</pattern>

<pattern name="conditional_details">
Show basic content in SKILL.md, link to advanced in reference files:

```xml
<objective>
Process DOCX files with creation and editing capabilities.
</objective>

<quick_start>
<creating_documents>
Use docx-js for new documents. See [docx-js.md](docx-js.md).
</creating_documents>

<editing_documents>
For simple edits, modify XML directly.

**For tracked changes**: See [redlining.md](redlining.md)
**For OOXML details**: See [ooxml.md](ooxml.md)
</editing_documents>
</quick_start>
```

Claude reads redlining.md or ooxml.md only when the user needs those features.
</pattern>

<critical_rules>
**Keep references one level deep**: All reference files should link directly from SKILL.md. Avoid nested references (SKILL.md → advanced.md → details.md) as Claude may only partially read deeply nested files.

**Add table of contents to long files**: For reference files over 100 lines, include a table of contents at the top.

**Use pure XML in reference files**: Reference files should also use pure XML structure (no markdown headings in body).
</critical_rules>
</progressive_disclosure>

<file_organization>
<filesystem_navigation>
Claude navigates your skill directory using bash commands:

- Use forward slashes: `reference/guide.md` (not `reference\guide.md`)
- Name files descriptively: `form_validation_rules.md` (not `doc2.md`)
- Organize by domain: `reference/finance.md`, `reference/sales.md`
</filesystem_navigation>

<directory_structure>
Typical skill structure:

```
skill-name/
├── SKILL.md (main entry point, pure XML structure)
├── references/ (optional, for progressive disclosure)
│   ├── guide-1.md (pure XML structure)
│   ├── guide-2.md (pure XML structure)
│   └── examples.md (pure XML structure)
└── scripts/ (optional, for utility scripts)
    ├── validate.py
    └── process.py
```
</directory_structure>
</file_organization>

<anti_patterns>
<pitfall name="markdown_headings_in_body">
❌ Do NOT use markdown headings in skill body:

```markdown
# PDF Processing

## Quick start
Extract text...

## Advanced features
Form filling...
```

✅ Use pure XML structure:

```xml
<objective>
PDF processing with text extraction, form filling, and merging.
</objective>

<quick_start>
Extract text...
</quick_start>

<advanced_features>
Form filling...
</advanced_features>
```
</pitfall>

<pitfall name="vague_descriptions">
- ❌ "Helps with documents"
- ✅ "Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDF files or when the user mentions PDFs, forms, or document extraction."
</pitfall>

<pitfall name="inconsistent_pov">
- ❌ "I can help you process Excel files"
- ✅ "Processes Excel files and generates reports"
</pitfall>

<pitfall name="wrong_naming_convention">
- ❌ Directory: `facebook-ads`, Name: `facebook-ads-manager`
- ✅ Directory: `manage-facebook-ads`, Name: `manage-facebook-ads`
- ❌ Directory: `stripe-integration`, Name: `stripe`
- ✅ Directory: `setup-stripe-payments`, Name: `setup-stripe-payments`
</pitfall>

<pitfall name="deeply_nested_references">
Keep references one level deep from SKILL.md. Claude may only partially read nested files (SKILL.md → advanced.md → details.md).
</pitfall>

<pitfall name="windows_paths">
Always use forward slashes: `scripts/helper.py` (not `scripts\helper.py`)
</pitfall>

<pitfall name="missing_required_tags">
Every skill must have: `<objective>`, `<quick_start>`, and `<success_criteria>` (or `<when_successful>`).
</pitfall>
</anti_patterns>

<validation_checklist>
Before finalizing a skill, verify:

- ✅ YAML frontmatter valid (name matches directory, description in third person)
- ✅ No markdown headings in body (pure XML structure)
- ✅ Required tags present: objective, quick_start, success_criteria
- ✅ Conditional tags appropriate for complexity level
- ✅ All XML tags properly closed
- ✅ Progressive disclosure applied (SKILL.md < 500 lines)
- ✅ Reference files use pure XML structure
- ✅ File paths use forward slashes
- ✅ Descriptive file names
</validation_checklist>
