---
description: Create a new Notion page, optionally under a specific parent, using the Notion Workspace Skill and Notion MCP server.
argument-hint: "Title of page [optional parent name or ID]"
---

You are creating a new Notion page for the user.

Use the Notion Workspace Skill and `notion` MCP server to:

1. Parse `$ARGUMENTS` into:
   - Page title
   - Optional parent page/database (if the user mentions a parent)
2. If the parent is ambiguous, ask a brief clarification question before creating the page.
3. Create the page with a sensible default structure based on the title:
   - For "Meeting notes", include sections like Attendees, Agenda, Notes, Action items.
   - For "Project" pages, include sections for Overview, Goals, Timeline, Tasks, Risks.
4. Confirm creation back to the user with:
   - Page title
   - Parent location
   - Link or identifier.

Be careful not to overwrite existing pages. If a page with the exact same name exists in the same parent, confirm with the user whether to reuse it or create a new one.