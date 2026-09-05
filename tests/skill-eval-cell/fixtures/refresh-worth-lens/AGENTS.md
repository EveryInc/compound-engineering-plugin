# Widget service

## Layout

```
src/             service code
tests/           bun tests
docs/solutions/  documented solutions to past problems, by category, with YAML frontmatter (module, tags, problem_type)
```

## Working agreement

- Run `bun test` before opening a PR.
- Retry a lock acquisition at most once: the lock holder is always this same process, so a second retry can never succeed.
