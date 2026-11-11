# Coding standards

- Use ES modules (`import`/`export`), not `require`.
- Keep route handlers thin: put database access in `src/db.js` callers, not inline in handlers.
