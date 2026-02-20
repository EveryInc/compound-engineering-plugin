# Decision Log: OpenCode Commands as .md Files

## Decision: ADR-001 - Store Commands as Individual .md Files

**Date:** 2026-02-20  
**Status:** Adopted

## Context

The original design stored commands configurations inline in `opencode.json` under `config.command`. This tightly couples command metadata with config, making it harder to version-control commands separately and share command files.

## Decision

Store commands definitions as individual `.md` files in `.opencode/commands/` directory, with YAML frontmatter for metadata and markdown body for the command prompt.

**New Type:**
```typescript
export type OpenCodeCommandFile = {
  name: string    // command name, used as filename stem: <name>.md
  content: string // full file content: YAML frontmatter + body
}
```

**Bundle Structure:**
```typescript
export type OpenCodeBundle = {
  config: OpenCodeConfig
  agents: OpenCodeAgentFile[]
  commandFiles: OpenCodeCommandFile[]  // NEW
  plugins: OpenCodePluginFile[]
  skillDirs: { sourceDir: string; name: string }[]
}
```

## Consequences

- **Positive:** Commands can be versioned, shared, and edited independently
- **Negative:** Requires updating converter, writer, and all consumers
- **Migration:** Phase 1-4 will implement the full migration

## Alternatives Considered

1. Keep inline in config - Rejected: limits flexibility
2. Use separate JSON files - Rejected: YAML frontmatter is more idiomatic for commands