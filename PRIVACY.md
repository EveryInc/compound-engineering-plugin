# Privacy & Data Handling

This repository contains:
- a plugin package (`plugins/compound-engineering`) made of markdown/config content
- a CLI (`@every-env/compound-plugin`) that converts and installs plugin content for different AI coding tools

## Summary

- The plugin package does not include telemetry or analytics code.
- The plugin package does not run a background service that uploads repository/workspace contents automatically.
- Data leaves your machine only when your host/tooling or an explicitly invoked integration performs a network request.

## What May Send Data

1. AI host/model providers

If you run the plugin in tools like Claude Code, Cursor, Gemini CLI, Copilot, Kiro, Windsurf, etc., those tools may send prompts/context/code to their configured model providers. This behavior is controlled by those tools and providers, not by this plugin repository.

2. Optional integrations and tools

The plugin includes optional capabilities that can call external services when explicitly used, for example:
- Context7 MCP (`https://mcp.context7.com/mcp`) for documentation lookup
- Proof (`https://www.proofeditor.ai`) when using share/edit flows
- Other opt-in skills (for example image generation or cloud upload workflows) that call their own external APIs/services

If you do not invoke these integrations, they do not transmit your project data.

3. Package/installer infrastructure

Installing dependencies or packages (for example `npm`, `bunx`) communicates with package registries/CDNs according to your package manager configuration.

## Data Ownership and Retention

This repository does not operate a backend service for collecting or storing your project/workspace data. Data retention and processing for model prompts or optional integrations are governed by the external services you use.

## Security Reporting

If you identify a security issue in this repository, follow the disclosure process in [SECURITY.md](SECURITY.md).
