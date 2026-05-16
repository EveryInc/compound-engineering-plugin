---
description: Quickly find pages or databases in Notion by title keywords.
argument-hint: query terms
---

Use the Notion Workspace Skill and `notion` MCP server to quickly locate pages or databases whose titles
match `$ARGUMENTS`.

Behavior:

- Treat `$ARGUMENTS` as fuzzy search terms for titles (e.g. "Q1 plan", "Claude marketplace spec").
- Search both:
  - Individual pages
  - Databases
- Return a short list of the best matches with:
  - Title
  - Type (page or database)
  - Location / parent (if available)
- Prefer precision over recall: better to show 5–10 very relevant results than 50 noisy ones.

If nothing is found, say so clearly and suggest alternate search terms.