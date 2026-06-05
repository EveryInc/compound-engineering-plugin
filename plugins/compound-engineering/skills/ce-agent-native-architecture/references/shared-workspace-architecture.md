<overview>
Agents and users should work in the same data space, not separate sandboxes. When the agent writes a file, the user can see it. When the user edits something, the agent can read the changes. This creates transparency, enables collaboration, and eliminates the need for sync layers.

**Core principle:** The agent operates in the same filesystem as the user, not a walled garden.
</overview>

<why_shared_workspace>
## Why Shared Workspace?

### The Sandbox Anti-Pattern

```
┌─────────────────┐     ┌─────────────────┐
│   User Space    │     │   Agent Space   │
├─────────────────┤     ├─────────────────┤
│ Documents/      │  ←→ │ agent_output/   │
│ user_files/     │sync │ cache/          │
└─────────────────┘     └─────────────────┘
```

Problems: needs a sync layer, user can't inspect agent work, duplication of state.

### The Shared Workspace Pattern

```
┌─────────────────────────────────────────┐
│           Shared Workspace              │
├─────────────────────────────────────────┤
│ Documents/                              │
│ ├── Research/                           │
│ │   └── {bookId}/        ← Agent writes │
│ │       ├── introduction.md  ← User can edit │
│ │       └── sources/                    │
│ ├── Chats/               ← Both read/write │
│ └── profile.md           ← Agent generates, user refines │
└─────────────────────────────────────────┘
         ↑                    ↑
       User                 Agent
       (UI)               (Tools)
```

Benefits: users can inspect/edit agent work, agents can build on user contributions, no sync layer, single source of truth.
</why_shared_workspace>

<directory_structure>
## Designing Your Shared Workspace

Organize by what the data represents, not who created it:

```
Documents/
├── Research/
│   └── {bookId}/
│       ├── full_text.txt        # Agent downloads
│       ├── introduction.md      # Agent generates, user can edit
│       ├── notes.md             # User adds, agent can read
│       └── sources/
├── Chats/
│   └── {conversationId}.json    # Both read/write
├── Exports/
│   └── {date}/                  # Agent generates for user
└── profile.md                   # Agent generates from photos
```

Don't structure by actor (`user_created/` vs `agent_created/`) — it creates artificial boundaries.

Use YAML frontmatter to track who created/modified when needed:

```markdown
---
created_by: agent
last_modified_by: user
---
```
</directory_structure>

<file_tools>
## File Tools for Shared Workspace

Give the agent the same file primitives the app uses: `read_file`, `write_file`, `list_files`, `search_text`. Scope paths relative to the Documents root — never accept absolute paths that can escape the workspace.

**Security:** Validate that resolved paths start with the documents root. Log all agent file operations.
</file_tools>

<ui_integration>
## UI Integration with Shared Workspace

**Pattern 1: File-Based Reactivity** — Use a `DirectoryWatcher` that triggers UI reload when the agent writes files.

**Pattern 2: Shared Data Store** — Agent tool calls write through the same singleton service the UI's `@StateObject` is bound to.

**Pattern 3: Hybrid (Files + Index)** — Use files for content, database for indexing. Agent writes the file and updates the index; UI queries the index and reads files.
</ui_integration>

<collaboration_patterns>
## Agent-User Collaboration Patterns

**Agent Drafts, User Refines:** Agent generates a file, user edits it, agent reads the updated version on next access. System prompt should say: "Always read existing files before modifying them—the user may have made improvements to preserve."

**User Seeds, Agent Expands:** User creates a notes file, asks agent to research further, agent adds to or creates related files.

**Append-Only Collaboration:** For activity streams where both parties log entries to the same file without overwriting.
</collaboration_patterns>

<security_considerations>
## Security in Shared Workspace

- Scope to workspace root — reject paths that traverse outside it
- Protect sensitive paths (`.env`, `credentials.json`, `secrets/`)
- Log all agent file access (action, path, agentId)
</security_considerations>

<checklist>
## Shared Workspace Checklist

Architecture:
- [ ] Single shared directory for agent and user data
- [ ] Organized by domain, not by actor
- [ ] File tools scoped to workspace (no escape)
- [ ] Protected paths for sensitive files

Tools:
- [ ] `read_file` - Read any file in workspace
- [ ] `write_file` - Write any file in workspace
- [ ] `list_files` - Browse directory structure

UI Integration:
- [ ] UI observes same files agent writes
- [ ] Changes reflect immediately (file watching or shared store)
- [ ] User can edit agent-created files
- [ ] Agent reads user modifications before overwriting

Collaboration:
- [ ] System prompt acknowledges user may edit files
- [ ] Agent checks for user modifications before overwriting

Multi-Device (iOS):
- [ ] Use iCloud Documents for shared workspace (free sync)
- [ ] Fallback to local Documents if iCloud unavailable
- [ ] Handle `.icloud` placeholder files (trigger download)
- [ ] Use NSFileCoordinator for conflict-safe writes
</checklist>
