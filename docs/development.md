# Development

How to load a local checkout of Compound Engineering into each supported harness, and the repository's own build and validation commands. For contribution process — what to do before opening a PR — see [CONTRIBUTING.md](../CONTRIBUTING.md).

---

## Repository commands

```bash
bun install
bun test                  # full suite; also runs in CI
bun run release:validate  # plugin/marketplace consistency
bun run plugin:validate   # Claude marketplace + plugin schema
```

## From your local checkout

For active development, load this checkout directly in the harness you want to test.

**Claude Code**

```bash
claude --plugin-dir "$PWD"
```

**Cursor Agent CLI**

```bash
cursor-agent --plugin-dir "$PWD"
```

**Codex**

For the normal production-like plugin installation, use the [Codex App](../README.md#codex-app) or [Codex CLI](../README.md#codex-cli) instructions in the README. The workflow below is only for contributors who need Codex to load unreleased files from an exact checkout or linked worktree.

<details>
<summary><strong>Advanced: test this exact checkout in Codex</strong></summary>

Select the current worktree as the active Codex development source:

```bash
bun run codex:dev -- local
```

This creates one collection symlink at `$CODEX_HOME/skills/compound-engineering-local` (default `~/.codex/skills/compound-engineering-local`) pointing to this worktree's `skills/` directory. It removes installed Compound Engineering plugin variants through the Codex CLI so a cached marketplace plugin cannot shadow or duplicate the local skills. It does not copy skills, change the checkout, pull Git, or touch unrelated entries under `$CODEX_HOME/skills`.

The link exposes exactly what is in the selected worktree, including modified and untracked skills. Ordinary edits therefore need no reinstall, and current Codex versions detect direct skill changes automatically. Start a new session after switching between local and remote installation modes; if an ordinary skill edit does not appear, restart Codex.

Use these commands to inspect and switch modes:

```bash
bun run codex:dev -- status
bun run codex:dev -- refresh
bun run codex:dev -- remote
bun run codex:dev -- remove
```

- `status` reports local, remote, mixed, drifted, or absent state plus the linked checkout, worktree kind, branch, commit SHA, and dirty counts.
- `refresh` is an idempotent alias for `local`; use it to reconcile accidental plugin installs. The live link already reflects file changes.
- `remote` refreshes the official Git marketplace, installs and verifies `compound-engineering@compound-engineering-plugin`, then removes the local link. Use it to simulate the released user experience.
- `remove` removes Compound Engineering plugin variants and the managed link, leaving the checkout and unrelated user skills intact.

The script derives the repository path, so it works from checkouts in any location, including paths with spaces. It inherits the active `CODEX_HOME`; set `CODEX_HOME` on the command when testing an isolated profile. Run every mode against the same `CODEX_HOME` you use to launch Codex.

Do not use `codex plugin marketplace add "$PWD"` for live local development. It installs a cached copy of this checkout, so later edits are not reflected until the plugin is installed again; a matching manifest version also does not prove the cache matches the worktree. The `codex:dev` workflow instead keeps Codex linked to the current skill files.

</details>

**Kimi Code CLI**

Inside Kimi Code CLI:

```text
/plugins install /path/to/compound-engineering-plugin
```

To test the local marketplace catalog instead, pass the catalog path:

```text
/plugins marketplace /path/to/compound-engineering-plugin/.kimi-plugin/marketplace.json
```

**Cline**

```bash
/path/to/compound-engineering-plugin/.cline/scripts/install-skills.sh --global
```

Enable **Settings -> Features -> Enable Skills** in the Cline extension, then start a new task.

**Devin CLI**

```bash
devin plugins install /path/to/compound-engineering-plugin
```

Local installs are linked to the checkout rather than copied, so skill edits apply on the next Devin session without reinstalling.

**OpenCode**

```json
{
  "plugin": ["/path/to/compound-engineering-plugin"]
}
```

Restart OpenCode after changing `opencode.json`.

**Pi**

```bash
pi -e "$PWD"
```

**oh-my-pi (omp)**

```bash
omp plugin link "$PWD"
```

**Antigravity CLI (`agy`)**

```bash
agy plugin install "$PWD"
agy plugin validate "$PWD"
```

Or install the bundled `.agy/` entry point:

```bash
agy plugin install "$PWD/.agy"
```

See [`.agy/INSTALL.md`](../.agy/INSTALL.md) for remote install and pinning examples.
