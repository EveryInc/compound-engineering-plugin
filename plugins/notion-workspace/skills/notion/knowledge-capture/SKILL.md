---
name: notion-knowledge-capture
description: Transforms conversations and discussions into structured documentation pages in Notion. Captures insights, decisions, and knowledge from chat context, formats appropriately, and saves to wikis or databases with proper organization and linking for easy discovery.
---

# Knowledge Capture

Transforms conversations, discussions, and insights into structured documentation in your Notion workspace. Captures knowledge from chat context, formats it appropriately, and saves it to the right location with proper organization and linking.

## Quick Start

When asked to save information to Notion:

1. **Extract content**: Identify key information from conversation context
2. **Structure information**: Organize into appropriate documentation format
3. **Determine location**: Use `Notion:notion-search` to find appropriate wiki page/database
4. **Create page**: Use `Notion:notion-create-pages` to save content
5. **Make discoverable**: Link from relevant hub pages, add to databases, or update wiki navigation so others can find it

## Knowledge Capture Workflow

### Step 1: Identify content to capture

```
From conversation context, extract:
- Key concepts and definitions
- Decisions made and rationale
- How-to information and procedures
- Important insights or learnings
- Q&A pairs
- Examples and use cases
```

### Step 2: Determine content type

```
Classify the knowledge:
- Concept/Definition
- How-to Guide
- Decision Record
- FAQ Entry
- Meeting Summary
- Learning/Post-mortem
- Reference Documentation
```

### Step 3: Structure the content

```
Format appropriately based on content type:
- Use templates for consistency
- Add clear headings and sections
- Include examples where helpful
- Add relevant metadata
- Link to related pages
```

### Step 4: Determine destination

```
Where to save:
- Wiki page (general knowledge base)
- Specific project page (project-specific knowledge)
- Documentation database (structured docs)
- FAQ database (questions and answers)
- Decision log (architecture/product decisions)
- Team wiki (team-specific knowledge)
```

### Step 5: Create the page

```
Use Notion:notion-create-pages:
- Set appropriate title
- Use structured content from template
- Set properties if in database
- Add tags/categories
- Link to related pages
```

### Step 6: Make content discoverable

```
Link the new page so others can find it:

1. Update hub/index pages:
   - Add link to wiki table of contents page
   - Add link from relevant project page
   - Add link from category/topic page (e.g., "Engineering Docs")

2. If page is in a database:
   - Set appropriate tags/categories
   - Set status (e.g., "Published")
   - Add to relevant views

3. Optionally update parent page:
   - If saved under a project, add to project's "Documentation" section
   - If in team wiki, ensure it's linked from team homepage

Example:
Notion:notion-update-page
page_id: "team-wiki-homepage-id"
command: "insert_content_after"
selection_with_ellipsis: "## How-To Guides..."
new_str: "- <mention-page url='...'>How to Deploy to Production</mention-page>"
```

This step ensures the knowledge doesn't become "orphaned" - it's properly connected to your workspace's navigation structure.

## Content Types

Choose appropriate structure based on content:

**Concept**: Overview → Definition → Characteristics → Examples → Use Cases → Related
**How-To**: Overview → Prerequisites → Steps (numbered) → Verification → Troubleshooting → Related
**Decision**: Context → Decision → Rationale → Options Considered → Consequences → Implementation
**FAQ**: Short Answer → Detailed Explanation → Examples → When to Use → Related Questions
**Learning**: What Happened → What Went Well → What Didn't → Root Causes → Learnings → Actions

## Destination Patterns

**General Wiki**: Standalone page → add to index → tag → link from related pages

**Project Wiki**: Child of project page → link from project overview → tag with project name

**Documentation Database**: Use properties (Title, Type, Category, Tags, Last Updated, Owner)

**Decision Log Database**: Use properties (Decision, Date, Status, Domain, Deciders, Impact)

**FAQ Database**: Use properties (Question, Category, Tags, Last Reviewed, Useful Count)

See [reference/database-best-practices.md](reference/database-best-practices.md) for database selection guide and individual schema files.

## Content Extraction from Conversations

**Chat Discussion**: Key points, conclusions, resources, action items, Q&A

**Problem-Solving**: Problem statement, approaches tried, solution, why it worked, future considerations

**Knowledge Sharing**: Concept explained, examples, best practices, common pitfalls, resources

**Decision Discussion**: Question, options, trade-offs, decision, rationale, next steps

## Formatting Best Practices

**Structure**: Use `#` (title), `##` (sections), `###` (subsections) consistently

**Writing**: Start with overview, use bullets, keep paragraphs short, add examples

**Linking**: Link related pages, mention people, reference resources, create bidirectional links

**Metadata**: Include date, author, tags, status

**Searchability**: Clear titles, natural keywords, common search tags, image alt-text

## Indexing and Organization

**Wiki Index**: Organize by sections (Getting Started, How-To Guides, Reference, FAQs, Decisions) with page links

**Category Pages**: Create landing pages with overview, doc links, and recent updates

**Tagging Strategy**: Use consistent tags for technology/tools, topics, audience, and status

## Update Management

**Create New**: Content is substantive (>2 paragraphs), will be referenced multiple times, part of knowledge base, needs independent discovery

**Update Existing**: Adding to existing topic, correcting info, expanding concept, updating for changes

**Versioning**: Add update history section for significant changes (date, author, what changed, why)

## Best Practices

1. **Capture promptly**: Document while context is fresh
2. **Structure consistently**: Use templates for similar content
3. **Link extensively**: Connect related knowledge
4. **Write for discovery**: Use searchable titles and tags
5. **Include context**: Why this matters, when to use
6. **Add examples**: Concrete examples aid understanding
7. **Maintain**: Review and update periodically
8. **Get feedback**: Ask if documentation is helpful

## Advanced Features

**Documentation databases**: See [reference/database-best-practices.md](reference/database-best-practices.md) for database schema patterns.

## Common Issues

**"Not sure where to save"**: Default to general wiki, can move later
**"Content is fragmentary"**: Group related fragments into cohesive doc
**"Already exists"**: Search first, update existing if appropriate
**"Too informal"**: Clean up language while preserving insights

## Examples

See [examples/](examples/) for complete workflows:

- [examples/conversation-to-faq.md](examples/conversation-to-faq.md) - FAQ from Q&A
- [examples/decision-capture.md](examples/decision-capture.md) - Decision record
- [examples/how-to-guide.md](examples/how-to-guide.md) - How-to from discussion
