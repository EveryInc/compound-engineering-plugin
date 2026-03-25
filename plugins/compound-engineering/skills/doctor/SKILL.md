---
name: doctor
description: Diagnose Compound Engineering plugin environment health. Checks CLI dependencies, MCP servers, env vars, plugin version, and .gitignore. Use when troubleshooting missing tools, verifying setup, or before onboarding.
disable-model-invocation: true
---

# Compound Engineering Doctor

Diagnose the health of the current environment for compound-engineering. Report what is installed, what is missing, and provide guidance links. This skill is informational only -- it never installs anything.

## Step 1: Determine Plugin Version

Before running the check script, determine the installed compound-engineering plugin version. This is platform-specific -- use whatever mechanism is available:

- Read the plugin metadata or manifest if accessible
- Check the plugin cache or installation directory
- If the version cannot be determined, skip this step

If a version is found, pass it to the script via `--version`. Otherwise omit the flag.

## Step 2: Run the Health Check Script

Run the bundled check script. Do not perform manual dependency checks -- the script handles all CLI tools, environment variables, .gitignore, and project checks in one pass.

```bash
bash scripts/check-health --version VERSION
```

Or without version if Step 1 could not determine it:

```bash
bash scripts/check-health
```

Script reference: [scripts/check-health](scripts/check-health)

Display the script's output to the user.

## Step 3: Check MCP Server Availability

The script cannot detect MCP servers (that requires agent-level introspection). After running the script, check for these MCP services:

1. **context7** -- Check whether `resolve-library-id` or `get-library-docs` tools from the context7 MCP server are available in the current session. If available, note "context7 MCP server loaded" alongside the CLI result from the script.

2. **Figma MCP** -- Check whether any Figma MCP tools are available. Report as informational only.

3. **XcodeBuildMCP** -- Check whether any XcodeBuildMCP tools are available. Report as informational only.

Append MCP results after the script output using the same emoji format:

```
 MCP Servers
  🟢  context7 (MCP server loaded -- ctx7 CLI not required)
  ➖  Figma MCP (not detected, optional)
  ➖  XcodeBuildMCP (not detected, optional)
```

For context7: if MCP is available, note that the ctx7 CLI is not required. If neither MCP nor CLI is available, highlight this as a gap.

## Step 4: Summary

After presenting the combined report (script output + MCP results), display:

```
Run /setup to install missing dependencies and configure environment variables.
Run /doctor anytime to re-check.
```

Registry reference for additional context: [references/dependency-registry.md](./references/dependency-registry.md)
