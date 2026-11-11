# Development

The repository's build and validation commands, and how to load a local checkout into the harnesses that have a documented local-load path. For contribution process — what to do before opening a PR — see [CONTRIBUTING.md](../CONTRIBUTING.md).

---

## Repository commands

```bash
bun install
bun run test              # full suite, --parallel, exactly as CI runs it
bun run release:validate  # plugin/marketplace consistency
bun run plugin:validate   # Claude marketplace + plugin schema (needs `claude` on PATH)
```

## Docs site

The public docs at [every.to/compound-engineering](https://every.to/compound-engineering/) are built from `site/` with Jekyll and the `jekyll-vitepress-theme` gem. The site is a build layer, not a second copy: `site/_guides`, `site/assets`, `site/install.md`, and `site/upgrading.md` are symlinks to `docs/guides/`, `assets/`, `README.md`, and `docs/install/upgrading.md`. Never edit a published source to suit the site. Two site-local plugins do the adapting: `site/_plugins/ce_sources.rb` promotes the frontmatter-less sources into Jekyll pages and documents and derives titles, sidebar groups, the homepage data, and last-updated dates from the guides catalog, the README, and git; `site/_plugins/ce_github_markdown.rb` rewrites GitHub alerts, repo-relative links, and asset paths at render time; `site/_plugins/ce_relative_urls.rb` turns the built HTML's base-path URLs into page-relative ones, so one build serves every.to, the github.io origin, and a local server alike.

Prerequisites: Ruby 3.3 or newer and Bundler. Then:

```bash
cd site && bundle install && cd ..
bun run site:build   # builds site/_site with strict front matter
bun run site:serve   # local server with live reload, at http://localhost:4000/compound-engineering/
bun run site:test    # the plugins' minitest suite
bun run site:check   # internal link check over site/_site
```

`.github/workflows/pages.yml` runs the plugin tests, the build, and an internal link check on every pull request, and deploys on pushes to `main`. A guide with a broken relative link fails that check.

### Go-live runbook (done once, outside this repo)

The site is served at `https://every.to/compound-engineering/` by every.to's edge proxy, which forwards that path prefix to the GitHub Pages build. The Jekyll config sets `url: https://every.to` and `baseurl: /compound-engineering`, so every link, asset, sitemap entry, and `llms.txt` entry already carries the prefix. There is no custom domain and no DNS to configure.

1. **Pages source.** Repository Settings -> Pages -> Build and deployment -> Source: "GitHub Actions". The legacy branch build from `main:/docs` must be switched off; it cannot run the site's plugins and currently serves a 404. Leave the custom-domain field empty. The build then lives at `https://everyinc.github.io/compound-engineering-plugin/`.
2. **every.to proxy rule.** Route `https://every.to/compound-engineering/*` to the origin `https://everyinc.github.io/compound-engineering-plugin/*`, replacing the `/compound-engineering` prefix with `/compound-engineering-plugin` on the way to the origin and passing the response through unchanged. The HTML already links with the every.to prefix, so no response rewriting is needed. Forward `/compound-engineering` (no trailing slash) as `/compound-engineering/`.
3. **Branch protection.** Add the `build` job of the "Docs site" workflow to the required status checks on `main`, alongside `test`, so a site-breaking change cannot merge.

Until step 1 is done the `deploy` job fails on `main`; the `build` job still proves every PR. The github.io origin also works on its own: page links and assets are relative, and only the canonical, Open Graph, sitemap, and llms.txt URLs name every.to.

## From your local checkout

For active development, load this checkout directly in the harness you want to test. The harnesses below are the ones with a verified local-load path.

Compound Engineering supports more hosts than are listed here — Grok Build CLI, GitHub Copilot, Factory Droid, and Qwen Code among them. Those install from the marketplace ([install options](../README.md#more-install-options)) but have no documented way to point at an unreleased checkout, so test changes for them against a released version, or add a path here once you have verified one.

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

This creates one collection symlink at `$CODEX_HOME/skills/compound-engineering-local` (default `~/.codex/skills/compound-engineering-local`) pointing to this worktree's `skills/` directory. It removes installed Compound Engineering plugin variants through the Codex CLI so a cached marketplace plugin cannot shadow or duplicate the local skills. It does not copy skills, change the checkout, pull Git, or touch unrelated entries under `$CODEX_HOME/skills`. If a deleted worktree leaves this managed symlink dangling, `local` (or its `refresh` alias) replaces it and reports the stale and new targets. Real files, directories, and valid symlinks to unrelated locations are still protected.

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
