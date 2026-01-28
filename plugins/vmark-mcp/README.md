# VMark MCP Plugin

AI writing assistant for the VMark markdown editor. This plugin provides skills and workflows for Claude Code to interact with VMark through MCP tools.

## What's Included

### Skills

- **vmark-mcp** — Comprehensive writing assistant skill with workflows for:
  - Continuing/expanding text at cursor
  - Improving and refining sections
  - Reorganizing document structure
  - Find and replace operations
  - Converting notes to prose
  - Multi-document workflows
  - Table and list manipulation

### MCP Server

The plugin includes the VMark MCP server which exposes 76 tools for document manipulation:
- Structure tools (AST, digest, sections)
- Mutation tools (batch edit, find/replace)
- Formatting tools (marks, blocks, lists, tables)
- Workspace tools (windows, tabs, documents)

## Installation

### For Claude Code Users

```bash
# Install the plugin
claude plugins install github:xiaolai/vmark
```

### For VMark Developers

The skill is already available in the vmark repository at `plugins/vmark-mcp/skills/`.

## Usage

Once installed, use the skill via:

```
/vmark-mcp
```

Or let Claude Code auto-detect when you're working with VMark documents.

## Key Workflows

1. **Read before write** — Always understand document structure first
2. **Suggest, don't force** — Use suggestion mode for content changes
3. **Work with structure** — Target nodes by ID, not character positions

See the skill's reference files for detailed workflows and examples.

## Requirements

- VMark editor running with MCP enabled
- Claude Code CLI

## License

Same as VMark (see root LICENSE file).
