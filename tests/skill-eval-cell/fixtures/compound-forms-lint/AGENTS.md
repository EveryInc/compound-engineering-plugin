# Orders service

## Layout

```
src/                service code
tests/              bun tests
scripts/lint.mjs    the repo's linter; bundled rules live here
lint.config.json    which bundled rules run, at what severity, and on which paths
lint-rules/         custom rules, one module per rule, listed under customRules
lint-baseline.json  existing violations the linter tolerates
docs/solutions/     documented solutions to past problems, by category, with YAML frontmatter (module, tags, problem_type)
```

## Working agreement

- CI runs `bun run lint` and `bun test`. Run both before opening a PR.
- A custom rule gets a case in `tests/lint-rules.test.js`.
