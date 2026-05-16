# Notion Workspace

Notion plugin for Claude Code that bundles the Notion MCP server, a knowledge-capture skill, and three slash commands for working with Notion pages and databases.

## Install

```
/plugin marketplace add EveryInc/compound-engineering-plugin
/plugin install notion-workspace
```

The plugin connects to Notion's hosted MCP server at `https://mcp.notion.com/mcp` over OAuth — no API key configuration required, but you must complete the OAuth flow on first use.

## Commands

| Command | Description |
|---------|-------------|
| `/Notion:find` | Quick title-based search for pages or databases |
| `/Notion:create-page` | Create a new page, optionally under a specific parent |
| `/Notion:database-query` | Query a database by name or ID with optional filters |

## Skills

- **Knowledge Capture** (`notion-knowledge-capture`) — Transforms conversations into structured documentation pages in Notion (FAQs, decision logs, how-to guides, wiki entries). Includes reference templates for common database types and worked examples.

## MCP Server

| Server | Endpoint | Transport |
|--------|----------|-----------|
| `notion` | `https://mcp.notion.com/mcp` | HTTP / OAuth |

## Scope

This is a minimal initial release focused on knowledge-capture workflows. Additional skills (meeting intelligence, research documentation, spec-to-implementation) and commands (task management, page updates) can follow in subsequent contributions if there's appetite.

## Credit

Underlying skill content adapted from [makenotion/claude-code-notion-plugin](https://github.com/makenotion/claude-code-notion-plugin) (Notion Labs).
