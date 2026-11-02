# Orders service

## Layout

```
src/              service code
scripts/lint.mjs  the repo's linter; bundled rules live here
lint.config.json  which bundled rules run, at what severity, and on which paths
docs/solutions/   documented solutions to past problems, by category, with YAML frontmatter (module, tags, problem_type)
```

## Working agreement

- CI runs `bun run lint`. Run it before opening a PR.
