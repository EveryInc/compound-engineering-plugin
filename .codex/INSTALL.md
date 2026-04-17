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
   mkdir -p ~/.agents/skills
   ln -s ~/.codex/compound-engineering-plugin/plugins/compound-engineering/skills ~/.agents/skills/compound-engineering
   ```

   **Windows (PowerShell):**
   ```powershell
   New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.agents\skills"
   cmd /c mklink /J "$env:USERPROFILE\.agents\skills\compound-engineering" "$env:USERPROFILE\.codex\compound-engineering-plugin\plugins\compound-engineering\skills"
   ```

3. **Restart Codex** (quit and relaunch the CLI) to discover the skills.

## Migrating from copied skill installs

If you previously installed CE skills by copying into `~/.codex/skills`, remove copied CE directories by deriving the exact Codex copy targets from the plugin's current `skills/*/SKILL.md` metadata (`name` + `ce_platforms`):

```bash
python3 - <<'PY'
from pathlib import Path
import os
import re
import shutil

codex_home = Path(os.environ.get("CODEX_HOME", str(Path.home() / ".codex")))
repo_root = codex_home / "compound-engineering-plugin"
source_skills_root = repo_root / "plugins" / "compound-engineering" / "skills"
target_skills_root = codex_home / "skills"

if not source_skills_root.exists():
    raise SystemExit(f"Source skills directory not found: {source_skills_root}")

def parse_frontmatter(skill_md: Path) -> dict[str, str]:
    text = skill_md.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        return {}
    end = text.find("\n---", 4)
    if end == -1:
        return {}
    frontmatter = text[4:end + 1]
    parsed: dict[str, str] = {}
    for line in frontmatter.splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        parsed[key.strip()] = value.strip()
    return parsed

removed = 0
for skill_dir in sorted(p for p in source_skills_root.iterdir() if p.is_dir()):
    skill_md = skill_dir / "SKILL.md"
    if not skill_md.exists():
        continue

    fm = parse_frontmatter(skill_md)
    platforms = fm.get("ce_platforms")
    if platforms:
        values = [v.strip().strip("'\"") for v in platforms.strip("[]").split(",") if v.strip()]
        if "codex" not in values:
            continue

    name = fm.get("name", skill_dir.name).strip().strip("'\"")
    copied_dir_name = re.sub(r":", "-", name)
    target = target_skills_root / copied_dir_name

    if target.is_symlink() or target.is_file():
        target.unlink()
        removed += 1
        print(f"removed {target}")
    elif target.is_dir():
        shutil.rmtree(target)
        removed += 1
        print(f"removed {target}")

print(f"done: removed {removed} copied CE skill directories")
PY
```

Then restart Codex.

## Verify

```bash
ls -la ~/.agents/skills/compound-engineering
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
rm ~/.agents/skills/compound-engineering
```

Optionally delete the clone: `rm -rf ~/.codex/compound-engineering-plugin`.
