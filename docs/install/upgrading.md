# Upgrading an existing install

Per-host instructions for refreshing Compound Engineering when you installed it before the root-native, skills-only layout, plus cleanup for artifacts left behind by older install paths.

For a first-time install, see the [README](../../README.md#install).

---

## Refresh the marketplace, then update the plugin

Compound Engineering moved to a root-native, skills-only layout. An existing marketplace install keeps a **cached** marketplace snapshot that still points at the old `plugins/compound-engineering` path, so updating the plugin on its own reads that stale snapshot and leaves you on the previous version. Refresh the cached marketplace **first**, then update the plugin — order matters.

**Claude Code**

```text
/plugin marketplace update compound-engineering-plugin
/plugin update compound-engineering
```

**Codex CLI**

```bash
codex plugin marketplace upgrade compound-engineering-plugin
codex plugin add compound-engineering@compound-engineering-plugin
```

There is no `codex plugin update`; re-running `add` reinstalls from the refreshed snapshot. For a non-default profile, run both commands against the same `CODEX_HOME`.

**Codex App**

Refresh the marketplace from the **Plugins** panel (remove and re-add the `EveryInc/compound-engineering-plugin` marketplace if there is no refresh control), then reinstall **compound-engineering** and restart Codex.

**Grok Bot**

Reinstall or refresh Compound Engineering on that Cursor account (`/add-plugin compound-engineering` in Cursor Agent chat, or marketplace search). Grok Bot then loads the new snapshot from the shared plugin library. Do not clone this repository onto the Grok Bot computer for a normal update.

If you configured a host with a direct path or sparse path under `plugins/compound-engineering`, edit or reinstall that source so it points at the repository root with no sparse path.

If a previous Bun-installed copy is still shadowing native plugin skills, run the current cleanup command from a checkout of this repository:

```bash
git clone https://github.com/EveryInc/compound-engineering-plugin.git /tmp/compound-engineering-plugin-cleanup
cd /tmp/compound-engineering-plugin-cleanup
bun install
bun run cleanup --target all
```

---

## Remove the legacy Codex tool map (pre-native installs)

If you previously installed Compound Engineering with the Bun `convert` / `install --to codex` CLI (before native Codex plugin support), that path may have inserted a managed block into your **global** Codex instructions file:

`<!-- BEGIN COMPOUND CODEX TOOL MAP -->` … `<!-- END COMPOUND CODEX TOOL MAP -->`

in `$CODEX_HOME/AGENTS.md` (default `~/.codex/AGENTS.md`). That Claude-compat tool map is obsolete — CE skills name Codex tools inline — and one of its lines incorrectly told Codex to collapse subagent dispatch onto the main thread. Native plugin install does **not** add this block.

Paste this into Codex (or any agent with access to your home directory) to remove it:

```text
Remove the obsolete Compound Engineering Codex tool-map block from my Codex home AGENTS.md.

1. Check `$CODEX_HOME/AGENTS.md` if CODEX_HOME is set, otherwise `~/.codex/AGENTS.md`. If I use Codex profiles, also check `~/.codex/profiles/*/AGENTS.md`.
2. Look for the exact sentinels `<!-- BEGIN COMPOUND CODEX TOOL MAP -->` and `<!-- END COMPOUND CODEX TOOL MAP -->`.
3. If both are present, delete only the span from the BEGIN line through the END line (inclusive), leaving any other user content untouched. Do not edit project/repo AGENTS.md unless those exact sentinels are present there.
4. If the file is empty after the removal, delete the file.
5. Show a short before/after summary of what you changed (or say the block was already absent). Do not add a replacement tool map.
```

Re-running the Bun convert/install CLI for Codex also strips the block if it is still present; it no longer inserts it.
