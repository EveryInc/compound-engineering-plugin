# Contributing to Compound Engineering

Contributions are welcome — issues, bug reports, and pull requests all help, and bug reports especially.

Compound Engineering is opinionated by design. It's maintained by [@kieranklaassen](https://github.com/kieranklaassen) and [@tmchow](https://github.com/tmchow), and its direction reflects a specific point of view about how AI-assisted engineering should work. We can't promise to accept every change — some proposals won't fit that vision even when they're good ideas on their own. We'd rather say that upfront than waste your time.

## Before you open a PR

- **File an issue first.** If you are not a maintainer, open an issue describing the problem or proposal and reference it from your PR.
- **New skills need approval before you build them.** Adding a skill is a bigger commitment than it looks — it ships to every supported host and has to be maintained across all of them. Raise it in an issue and get explicit maintainer sign-off *before* starting the work, rather than arriving with a finished PR we may have to turn down.
- **Everything goes through a pull request.** Direct pushes and direct merges to `main` are not allowed; branch protection enforces it.

## Getting set up

```bash
bun install
bun run test              # full suite, --parallel, exactly as CI runs it
bun run release:validate  # plugin/marketplace consistency
bun run plugin:validate   # Claude marketplace + plugin schema (needs `claude` on PATH)
```

`plugin:validate` shells out to the Claude Code CLI, so it needs `claude` on your `PATH`. If you work in Codex, Cursor, or another host, either install that CLI or let PR CI run this check for you — the other three commands are host-independent.

To load your working checkout into a harness for testing, see **[docs/development.md](docs/development.md)**.

## What CI checks

Pull-request CI runs, in order: PR-title lint, `bun run release:validate`, `bun run plugin:validate`, and `bun run test`. All four must pass before a PR can merge.

Use conventional commit prefixes (`feat:`, `fix:`, `docs:`, `refactor:`, and so on) classified by *intent*, not by file type — files under `skills/` are product code even though they are Markdown. Include a narrow component scope, for example `fix(ce-plan):` or `feat(cli):`.

Do not hand-bump versions in plugin or marketplace manifests, and do not hand-write `CHANGELOG.md` entries. Release automation owns both.

## Working on skills

Skills live in `skills/<name>/SKILL.md` and are authored once, then distributed to every supported host. That makes them different from ordinary code: a skill is a set of goals, not a state machine, and it has to work on harnesses with different capabilities. Read `AGENTS.md` before changing anything under `skills/`.

When you add a user-facing skill, document it: add a `docs/skills/<skill-name>.md` page and a catalog row in `docs/skills/README.md`, and bump the skill count in `tests/release-metadata.test.ts`.

## Reporting security issues

Please don't file security problems as public issues. See [SECURITY.md](SECURITY.md).
