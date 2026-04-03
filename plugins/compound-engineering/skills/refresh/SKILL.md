---
name: ce:refresh
description: "Sync reviewer personas and orchestrator definitions from external Git repos into the local plugin. Use when setting up the plugin for the first time, after updating your repos, or to pull in new reviewers or orchestrators."
---

# Refresh Reviewers & Orchestrators

Syncs reviewer persona files and orchestrator definitions from external Git repositories into the plugin.

## Step 1: Locate plugin

Find the plugin's install location in the Claude plugin cache:

```bash
PLUGIN_DIR=$(find "$HOME/.claude" "$HOME/.claude-"* -path "*/compound-engineering/*/agents/review" -type d 2>/dev/null | head -1 | sed 's|/agents/review$||')
```

Fall back to relative path if not found (e.g., running from source repo):

```bash
PLUGIN_DIR="${PLUGIN_DIR:-plugins/compound-engineering}"
```

Ensure the orchestrators directory exists:

```bash
mkdir -p "$PLUGIN_DIR/orchestrators"
```

## Step 2: Interactive source configuration

Read the user's reviewer source config at `~/.config/compound-engineering/reviewer-sources.yaml`. If it doesn't exist, the sync script will create it on first run — skip this step and go directly to Step 3.

If the file exists, parse it and present the current sources to the user like this:

List the current sources, then present three options using AskUserQuestion:

```
Current reviewer sources:
  - jsl-reviewers (JumpstartLab/ce-reviewers-jsl@main, path: reviewers)
  - ce-default (JumpstartLab/ce-reviewers@main, path: reviewers)

Current orchestrator sources:
  - jsl-orchestrators (JumpstartLab/ce-reviewers-jsl@main, path: orchestrators)

1. Sync now
2. Edit config files
3. Or type a request (e.g., "add owner/repo", "remove ce-default")
```

Handle the response:
- **1 / Sync now** — proceed to Step 3.
- **2 / Edit config files** — open both config files in editor. After editing, re-read and present the menu again.
- **Anything else** — interpret as a natural language request to modify one or both configs. Edit accordingly, then present the menu again.

## Step 3: Sync reviewers

Run the sync script for reviewers:

```bash
bash "$PLUGIN_DIR/skills/refresh/sync-reviewers.sh" \
  "$PLUGIN_DIR/skills/ce-review/references/reviewer-registry.yaml" \
  "$PLUGIN_DIR/agents/review"
```

## Step 4: Sync orchestrators

Run the same sync script for orchestrators, using the orchestrator registry and output directory:

```bash
bash "$PLUGIN_DIR/skills/refresh/sync-reviewers.sh" \
  "$PLUGIN_DIR/skills/ce-run/references/orchestrator-registry.yaml" \
  "$PLUGIN_DIR/orchestrators" \
  orchestrator
```

**Note:** The sync script's third argument tells it which user config to use (`orchestrator-sources.yaml` instead of `reviewer-sources.yaml`). It fetches `.md` files from configured sources regardless of content type.

## Step 5: Generate agent shims

Run the shim generation script. This scans synced reviewers and orchestrators for `agent-shim: true` in their frontmatter and generates `_shim-*.md` files in `agents/review/`:

```bash
bash "$PLUGIN_DIR/skills/refresh/generate-shims.sh" "$PLUGIN_DIR"
```

Show the script's output to the user — it lists which shims were generated.

## Step 6: Show results

The sync script writes summaries to `~/.config/compound-engineering/`:
- `last-reviewer-refresh-summary.md` — reviewer sync results
- `last-orchestrator-refresh-summary.md` — orchestrator sync results

Read all summary files that exist and **output their contents to the user exactly as written**. The summaries are already formatted as markdown — do not summarize, paraphrase, or reformat them.

## Source YAML Format

Both reviewer and orchestrator source configs use the same format:

```yaml
sources:
  - name: my-source
    repo: username/repo-name
    branch: main
    path: reviewers

  - name: another-source
    repo: SomeOrg/ce-reviewers
    path: orchestrators
    except:
      - name-to-skip
```

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `name` | yes | — | Label for this source |
| `repo` | yes | — | GitHub owner/repo |
| `branch` | no | `main` | Branch to fetch from |
| `path` | no | `.` | Directory in the repo containing .md files |
| `except` | no | `[]` | Filenames (without .md) to skip |

## Conflict Resolution

Sources listed first have higher priority. If two sources have a file with the same name, the first source's version is kept.

## Requirements

- `gh` CLI (preferred) or `git` for fetching
- `python3` for YAML parsing
