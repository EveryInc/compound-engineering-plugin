# Every Marketplace - Claude Code Plugin Marketplace

This repository is a Claude Code plugin marketplace that distributes the `compound-engineering` plugin to developers building with AI-powered tools.

## Repository Structure

```
every-marketplace/
├── .claude-plugin/
│   └── marketplace.json          # Marketplace catalog (lists available plugins)
├── docs/                         # Documentation site (GitHub Pages)
│   ├── index.html                # Landing page
│   ├── css/                      # Stylesheets
│   ├── js/                       # JavaScript
│   └── pages/                    # Reference pages
└── plugins/
    └── compound-engineering/   # The actual plugin
        ├── .claude-plugin/
        │   └── plugin.json        # Plugin metadata
        ├── agents/                # 24 specialized AI agents
        ├── commands/              # 13 slash commands
        ├── skills/                # 11 skills
        ├── mcp-servers/           # 2 MCP servers (playwright, context7)
        ├── README.md              # Plugin documentation
        └── CHANGELOG.md           # Version history
```

## Philosophy: Compounding Engineering

**Each unit of engineering work should make subsequent units of work easier—not harder.**

When working on this repository, follow the compounding engineering process:

1. **Plan** → Understand the change needed and its impact
2. **Delegate** → Use AI tools to help with implementation
3. **Assess** → Verify changes work as expected
4. **Codify** → Update this CLAUDE.md with learnings

## Working with This Repository

### Adding a New Plugin

1. Create plugin directory: `plugins/new-plugin-name/`
2. Add plugin structure:
   ```
   plugins/new-plugin-name/
   ├── .claude-plugin/plugin.json
   ├── agents/
   ├── commands/
   └── README.md
   ```
3. Update `.claude-plugin/marketplace.json` to include the new plugin
4. Test locally before committing

### Updating the Compounding Engineering Plugin

When agents, commands, or skills are added/removed, follow this checklist:

#### 1. Count all components accurately

```bash
# Count agents
ls plugins/compound-engineering/agents/*.md | wc -l

# Count commands
ls plugins/compound-engineering/commands/*.md | wc -l

# Count skills
ls -d plugins/compound-engineering/skills/*/ 2>/dev/null | wc -l
```

#### 2. Update ALL description strings with correct counts

The description appears in multiple places and must match everywhere:

- [ ] `plugins/compound-engineering/.claude-plugin/plugin.json` → `description` field
- [ ] `.claude-plugin/marketplace.json` → plugin `description` field
- [ ] `plugins/compound-engineering/README.md` → intro paragraph

Format: `"Includes X specialized agents, Y commands, and Z skill(s)."`

#### 3. Update version numbers

When adding new functionality, bump the version in:

- [ ] `plugins/compound-engineering/.claude-plugin/plugin.json` → `version`
- [ ] `.claude-plugin/marketplace.json` → plugin `version`

#### 4. Update documentation

- [ ] `plugins/compound-engineering/README.md` → list all components
- [ ] `plugins/compound-engineering/CHANGELOG.md` → document changes
- [ ] `CLAUDE.md` → update structure diagram if needed

#### 5. Rebuild documentation site

Run the release-docs command to update all documentation pages:

```bash
claude /release-docs
```

This will:
- Update stats on the landing page
- Regenerate reference pages (agents, commands, skills, MCP servers)
- Update the changelog page
- Validate all counts match actual files

#### 6. Validate JSON files

```bash
cat .claude-plugin/marketplace.json | jq .
cat plugins/compound-engineering/.claude-plugin/plugin.json | jq .
```

#### 6. Verify before committing

```bash
# Ensure counts in descriptions match actual files
grep -o "Includes [0-9]* specialized agents" plugins/compound-engineering/.claude-plugin/plugin.json
ls plugins/compound-engineering/agents/*.md | wc -l
```

### Marketplace.json Structure

The marketplace.json follows the official Claude Code spec:

```json
{
  "name": "marketplace-identifier",
  "owner": {
    "name": "Owner Name",
    "url": "https://github.com/owner"
  },
  "metadata": {
    "description": "Marketplace description",
    "version": "1.0.0"
  },
  "plugins": [
    {
      "name": "plugin-name",
      "description": "Plugin description",
      "version": "1.0.0",
      "author": { ... },
      "homepage": "https://...",
      "tags": ["tag1", "tag2"],
      "source": "./plugins/plugin-name"
    }
  ]
}
```

**Only include fields that are in the official spec.** Do not add custom fields like:

- `downloads`, `stars`, `rating` (display-only)
- `categories`, `featured_plugins`, `trending` (not in spec)
- `type`, `verified`, `featured` (not in spec)

### Plugin.json Structure

Each plugin has its own plugin.json with detailed metadata:

```json
{
  "name": "plugin-name",
  "version": "1.0.0",
  "description": "Plugin description",
  "author": { ... },
  "keywords": ["keyword1", "keyword2"],
  "components": {
    "agents": 15,
    "commands": 6,
    "hooks": 2
  },
  "agents": {
    "category": [
      {
        "name": "agent-name",
        "description": "Agent description",
        "use_cases": ["use-case-1", "use-case-2"]
      }
    ]
  },
  "commands": {
    "category": ["command1", "command2"]
  }
}
```

## Documentation Site

The documentation site is at `/docs` in the repository root (for GitHub Pages). This site is built with plain HTML/CSS/JS (based on Evil Martians' LaunchKit template) and requires no build step to view.

### Documentation Structure

```
docs/
├── index.html           # Landing page with stats and philosophy
├── css/
│   ├── style.css        # Main styles (LaunchKit-based)
│   └── docs.css         # Documentation-specific styles
├── js/
│   └── main.js          # Interactivity (theme toggle, mobile nav)
└── pages/
    ├── getting-started.html  # Installation and quick start
    ├── agents.html           # All 24 agents reference
    ├── commands.html         # All 13 commands reference
    ├── skills.html           # All 11 skills reference
    ├── mcp-servers.html      # MCP servers reference
    └── changelog.html        # Version history
```

### Keeping Docs Up-to-Date

**IMPORTANT:** After ANY change to agents, commands, skills, or MCP servers, run:

```bash
claude /release-docs
```

This command:
1. Counts all current components
2. Reads all agent/command/skill/MCP files
3. Regenerates all reference pages
4. Updates stats on the landing page
5. Updates the changelog from CHANGELOG.md
6. Validates counts match across all files

### Manual Updates

If you need to update docs manually:

1. **Landing page stats** - Update the numbers in `docs/index.html`:
   ```html
   <span class="stat-number">24</span>  <!-- agents -->
   <span class="stat-number">13</span>  <!-- commands -->
   ```

2. **Reference pages** - Each page in `docs/pages/` documents all components in that category

3. **Changelog** - `docs/pages/changelog.html` mirrors `CHANGELOG.md` in HTML format

### Viewing Docs Locally

Since the docs are static HTML, you can view them directly:

```bash
# Open in browser
open docs/index.html

# Or start a local server
cd docs
python -m http.server 8000
# Then visit http://localhost:8000
```

## Testing Changes

### Test Locally

1. Install the marketplace locally:

   ```bash
   claude /plugin marketplace add /Users/yourusername/every-marketplace
   ```

2. Install the plugin:

   ```bash
   claude /plugin install compound-engineering
   ```

3. Test agents and commands:
   ```bash
   claude /review
   claude agent architecture-strategist "test message"
   ```

### Validate JSON

Before committing, ensure JSON files are valid:

```bash
cat .claude-plugin/marketplace.json | jq .
cat plugins/compound-engineering/.claude-plugin/plugin.json | jq .
```

## Common Tasks

### Adding a New Agent

1. Create `plugins/compound-engineering/agents/new-agent.md`
2. Update plugin.json agent count and agent list
3. Update README.md agent list
4. Test with `claude agent new-agent "test"`

### Adding a New Command

1. Create `plugins/compound-engineering/commands/new-command.md`
2. Update plugin.json command count and command list
3. Update README.md command list
4. Test with `claude /new-command`

### Adding a New Skill

1. Create skill directory: `plugins/compound-engineering/skills/skill-name/`
2. Add skill structure:
   ```
   skills/skill-name/
   ├── SKILL.md           # Skill definition with frontmatter (name, description)
   └── scripts/           # Supporting scripts (optional)
   ```
3. Update plugin.json description with new skill count
4. Update marketplace.json description with new skill count
5. Update README.md with skill documentation
6. Update CHANGELOG.md with the addition
7. Test with `claude skill skill-name`

**Skill file format (SKILL.md):**
```markdown
---
name: skill-name
description: Brief description of what the skill does
---

# Skill Title

Detailed documentation...
```

### Updating Tags/Keywords

Tags should reflect the compounding engineering philosophy:

- Use: `ai-powered`, `compound-engineering`, `workflow-automation`, `knowledge-management`
- Avoid: Framework-specific tags unless the plugin is framework-specific

## Commit Conventions

Follow these patterns for commit messages:

- `Add [agent/command name]` - Adding new functionality
- `Remove [agent/command name]` - Removing functionality
- `Update [file] to [what changed]` - Updating existing files
- `Fix [issue]` - Bug fixes
- `Simplify [component] to [improvement]` - Refactoring

## Resources to search for when needing more information

- [Claude Code Plugin Documentation](https://docs.claude.com/en/docs/claude-code/plugins)
- [Plugin Marketplace Documentation](https://docs.claude.com/en/docs/claude-code/plugin-marketplaces)
- [Plugin Reference](https://docs.claude.com/en/docs/claude-code/plugins-reference)

## Key Learnings

_This section captures important learnings as we work on this repository._

### 2024-11-22: Added gemini-imagegen skill and fixed component counts

Added the first skill to the plugin and discovered the component counts were wrong (said 15 agents, actually had 17). Created a comprehensive checklist for updating the plugin to prevent this in the future.

**Learning:** Always count actual files before updating descriptions. The counts appear in multiple places (plugin.json, marketplace.json, README.md) and must all match. Use the verification commands in the checklist above.

### 2024-10-09: Simplified marketplace.json to match official spec

The initial marketplace.json included many custom fields (downloads, stars, rating, categories, trending) that aren't part of the Claude Code specification. We simplified to only include:

- Required: `name`, `owner`, `plugins`
- Optional: `metadata` (with description and version)
- Plugin entries: `name`, `description`, `version`, `author`, `homepage`, `tags`, `source`

**Learning:** Stick to the official spec. Custom fields may confuse users or break compatibility with future versions.
