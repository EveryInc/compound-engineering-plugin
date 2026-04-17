# Installing Compound Engineering for Codex

Enable compound-engineering skills in Codex via native skill discovery. Clone the repo and symlink the plugin skills directory.

## Prerequisites

- Git

## Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/EveryInc/compound-engineering-plugin.git ~/.codex/compound-engineering-plugin
   ```

2. **Create the skills symlink:**
   ```bash
   mkdir -p ~/.agents/skills/compound-engineering-plugin
   ln -s ~/.codex/compound-engineering-plugin/plugins/compound-engineering/skills ~/.agents/skills/compound-engineering-plugin/compound-engineering
   ```

   **Windows (PowerShell):**
   ```powershell
   New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.agents\skills\compound-engineering-plugin"
   cmd /c mklink /J "$env:USERPROFILE\.agents\skills\compound-engineering-plugin\compound-engineering" "$env:USERPROFILE\.codex\compound-engineering-plugin\plugins\compound-engineering\skills"
   ```

3. **Restart Codex** (quit and relaunch the CLI) to discover the skills.

## Migrating from copied skill installs

If you previously installed CE skills by copying into `~/.codex/skills`, run the cleanup script to derive exact Codex copy targets from current `skills/*/SKILL.md` metadata (`name` + `ce_platforms`) and remove only those copied CE skill directories:

```bash
python3 scripts/cleanup-codex-copied-skills.py
```

If you previously mapped to `~/.agents/skills/compound-engineering`, remove that legacy symlink:

```bash
rm ~/.agents/skills/compound-engineering
```

Then restart Codex.

## Verify

```bash
ls -la ~/.agents/skills/compound-engineering-plugin/compound-engineering
```

You should see a symlink (or junction on Windows) pointing to:

```text
~/.codex/compound-engineering-plugin/plugins/compound-engineering/skills
```

## Updating

```bash
cd ~/.codex/compound-engineering-plugin && git pull
```

Skills update through the symlink after pull. Restart Codex if the current session still shows stale skill metadata.

## Uninstalling

```bash
rm ~/.agents/skills/compound-engineering-plugin/compound-engineering
rmdir ~/.agents/skills/compound-engineering-plugin 2>/dev/null || true
```

Optionally delete the clone: `rm -rf ~/.codex/compound-engineering-plugin`.
