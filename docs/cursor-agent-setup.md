# Cursor setup — agent instructions

**For humans:** Paste this file into Cursor Agent chat (or `@docs/cursor-agent-setup.md`) and ask the agent to run the setup for you.

**For agents:** Execute the steps below end-to-end. Prefer the install script over hand-written symlinks or JSON edits.

---

## Goal

Install Compound Engineering **skills** and **slash commands** (`/ce-brainstorm`, `/ce-plan`, `/ce-work`, etc.) so they work in **any** Cursor workspace — not only when this monorepo is open.

---

## Prerequisites

| Requirement | How to check |
|-------------|--------------|
| Clone of `compound-engineering-plugin` | Directory contains `plugins/compound-engineering/` and `scripts/install-cursor-plugin.sh` |
| Node.js | `node --version` succeeds (used by the install script) |
| Write access to `~/.cursor/` | Script writes plugins and user commands there |

If the user opened a different project in Cursor, ask for the **absolute path** to their clone, or locate it (e.g. `~/ai_experiments/compound-engineering-plugin`).

---

## Steps

### 1. Resolve repository root

Set `REPO_ROOT` to the absolute path of the `compound-engineering-plugin` checkout.

If the current workspace **is** this repo, use its root. Otherwise use the path the user provides.

### 2. Run the install script

From `REPO_ROOT`:

```bash
npm run install:cursor
```

Equivalent:

```bash
bash scripts/install-cursor-plugin.sh
```

The script:

1. Symlinks each plugin with `.cursor-plugin/plugin.json` into `~/.cursor/plugins/local/`
2. Merges those paths into `~/.cursor/plugins/installed.json`
3. Runs `scripts/generate-cursor-commands.mjs` to write command stubs under:
   - `plugins/*/commands/`
   - `.cursor/commands/` (monorepo only)
   - `~/.cursor/commands/` (user-global — this is what makes `/ce-*` appear in other repos)

Set `NO_GLOBAL_CURSOR_COMMANDS=1` only if the user explicitly wants to skip writing `~/.cursor/commands/`.

### 3. Verify

Confirm the script exited 0 and reported linked plugins (at minimum `compound-engineering` and `coding-tutor`).

Spot-check:

```bash
ls ~/.cursor/plugins/local/
ls ~/.cursor/commands/ce-brainstorm.md
```

Optional: confirm `~/.cursor/plugins/installed.json` has a `"local"` object with absolute paths into `REPO_ROOT/plugins/...`.

### 4. Tell the user to restart Cursor

**Required.** Commands and plugins reload on full quit, not on window close alone.

- macOS: **Cmd+Q**, then reopen Cursor
- Windows/Linux: exit the application completely, then reopen

After restart, typing `/` in **any** project should list commands such as `/ce-brainstorm` and `/ce-plan`.

---

## When to re-run

| Situation | Command |
|-----------|---------|
| First-time setup or moved the clone | `npm run install:cursor` |
| Added/renamed skills only | `npm run generate:cursor-commands` |

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `/ce-*` missing in other repos | User commands not generated | Re-run `npm run install:cursor`; confirm `~/.cursor/commands/*.md` exist |
| Commands still missing after install | Cursor not fully restarted | Quit with Cmd+Q (macOS) and reopen |
| Skills missing | Plugin symlinks or `installed.json` | Re-run install script; check `~/.cursor/plugins/local/` and `installed.json` |
| `node: command not found` | Node not installed | Install Node.js, then re-run |

---

## Do not

- Do not manually symlink or edit `installed.json` if the script runs successfully.
- Do not inline long README sections — run `scripts/install-cursor-plugin.sh` instead.
- Do not skip the restart step.

---

## Success criteria

Setup is complete when:

1. Install script finished with exit code 0
2. `~/.cursor/commands/ce-brainstorm.md` exists
3. User has been told to fully restart Cursor
4. User can invoke `/ce-brainstorm` (or similar) from a **non-monorepo** workspace after restart
