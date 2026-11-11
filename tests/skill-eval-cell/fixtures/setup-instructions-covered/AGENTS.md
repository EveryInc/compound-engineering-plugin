# Widget service

## Layout

```
src/            service code
tests/          bun tests
docs/solutions/ documented solutions to past problems, by category, with YAML frontmatter (module, tags, problem_type); relevant when working in a documented area
```

## Working agreement

- Run `bun test` before opening a PR.
- After a solved, verified problem, automatically invoke the `ce-compound` skill with `mode:non-interactive` at the completion checkpoint when the work corrected a wrong belief about how something behaves: an approach that failed, a review finding that exposed a real defect, or an assumption, document, or first diagnosis that turned out wrong. A naming, style, or preference change does not count. Work that went as first planned does not need it. Do not judge whether the lesson deserves a document: `ce-compound` decides whether it qualifies and what holds it (a test, a lint rule, a coding standard, or a learning), and writes nothing when nothing qualifies. Capture at the checkpoint so what it writes can ship in the PR that produced it, and only where the repository treats captured learnings as tracked, committed knowledge.
