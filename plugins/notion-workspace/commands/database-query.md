---
description: Query a Notion database by name or ID and return structured, readable results.
argument-hint: 'database name or ID; filters (optional)'
---

You are querying a Notion database on the user's behalf.

Use the Notion Workspace Skill and `notion` MCP server to:

1. Interpret `$ARGUMENTS` as:
   - Target database (by name or ID)
   - Optional filter(s) or sort(s) the user describes.
2. If multiple databases match the name, ask the user to choose the correct one.
3. Perform a query that:
   - Applies the requested filters (e.g. status = Active, owner = Alice, due date this week).
   - Limits to a reasonable number of rows (e.g. 20–50) unless the user explicitly asks for more.
4. Present the results in a compact table-like format with:
   - Key properties (e.g. Name, Status, Owner, Due).
   - A short summary if the database has rich text content.
5. If no rows match, say so clearly and suggest alternative filters.

Avoid dumping raw JSON. Focus on readability and decision-making value for the user.