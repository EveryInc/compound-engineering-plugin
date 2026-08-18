# Scope selection and triage

Find all `.md` files under `<root>/solutions/`, excluding `README.md` files and anything under `_archived/` (if `_archived/` exists, flag it in the report as legacy to clean up). READMEs are excluded as review *candidates* only: whenever an action deletes, renames, moves, consolidates, or replaces a doc a catalog README lists, update that README's rows mechanically as part of the action's cleanup.

If a scope argument was provided, narrow with the first strategy that produces results: subdirectory name → frontmatter (`module`/`component`/`tags`) → filename → content keyword. No matches: ask the user to clarify (interactive) or report the miss and exit (non-interactive).

If the store is empty, report:

```text
No candidate docs found in <root>/solutions/.
Run /ce-compound after solving problems to start building your knowledge base.
```

For a broad sweep (9+ docs), triage before deep investigation: read all frontmatter, cluster by module/category, spot-check whether primary referenced files still exist, and start with the highest-impact cluster (interactive: confirm the starting area with the user; non-interactive: process all clusters in impact order). Review individual learning docs before the pattern docs that depend on them — stale learnings make a pattern look more valid than it is. If the user named a pattern doc, you may start there, but inspect its supporting learnings before changing it.

Render that last line for the active harness: `/ce-compound` by default, `$ce-compound` on Codex or another host documenting dollar-prefixed skill invocation. Print one form only.
