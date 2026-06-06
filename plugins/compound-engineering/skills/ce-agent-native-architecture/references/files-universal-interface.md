<overview>
Files are the universal interface for agent-native applications. Agents are naturally fluent with file operations—they already know how to read, write, and organize files.
</overview>

<why_files>
## Why Files

- **Agents already know how** — file operations are the primitives agents are most fluent with
- **Files are inspectable** — users can see, edit, move, delete agent-created content; complete transparency
- **Files are portable** — export and backup are trivial; users own their data
- **App state stays in sync** — with iCloud, all devices share the same file system without building a server
- **Directory structure is information architecture** — `/projects/acme/notes/` is self-documenting in a way that `SELECT * FROM notes WHERE project_id = 123` isn't
</why_files>

<file_organization>
## File Organization Patterns

Design for what agents can reason about. If a human can look at your file structure and understand what's going on, an agent probably can too.

### Entity-Scoped Directories

Organize files around entities, not actors or file types:

```
{entity_type}/{entity_id}/
├── primary content
├── metadata
└── related materials
```

Example: `Research/books/{bookId}/` contains everything about one book — full text, notes, sources, agent logs.

### Naming Conventions

| File Type | Naming Pattern | Example |
|-----------|---------------|---------|
| Entity data | `{entity}.json` | `library.json`, `status.json` |
| Human-readable content | `{content_type}.md` | `introduction.md`, `profile.md` |
| Agent reasoning | `agent_log.md` | Per-entity agent history |
| Primary content | `full_text.txt` | Downloaded/extracted text |
| External sources | `{source_name}.md` | `wikipedia.md`, `sparknotes.md` |
| Checkpoints | `{sessionId}.checkpoint` | UUID-based |

### Ephemeral vs. Durable Separation

```
Documents/
├── AgentCheckpoints/     # Ephemeral (can delete)
├── AgentLogs/            # Ephemeral (debugging)
└── Research/             # Durable (user's work)
    └── books/{bookId}/
```

Markdown for content users might read or edit; JSON for structured data the app queries.
</file_organization>

<context_md_pattern>
## The context.md Pattern

A file the agent reads at the start of each session and updates as it learns:

```markdown
# Context

## Who I Am
Reading assistant for the Every app.

## What I Know About This User
- Interested in military history and Russian literature
- Prefers concise analysis
- Currently reading War and Peace

## What Exists
- 12 notes in /notes
- 3 active projects
- User preferences at /preferences.md

## Recent Activity
- User created "Project kickoff" (2 hours ago)
- Analyzed passage about Austerlitz (yesterday)

## My Guidelines
- Don't spoil books they're reading
- Use their interests to personalize insights
```

How it works:
1. Agent reads `context.md` at session start
2. Agent updates it when learning something important
3. System can also update it (recent activity, new resources)
4. Context persists across sessions — restart agent, knowledge preserved

| Section | Purpose |
|---------|---------|
| Who I Am | Agent identity and role |
| What I Know About This User | Learned preferences, interests |
| What Exists | Available resources, data |
| Recent Activity | Context for continuity |
| My Guidelines | Learned rules and constraints |
</context_md_pattern>

<files_vs_database>
## Files vs. Database

| Use files for... | Use database for... |
|------------------|---------------------|
| Content users should read/edit | High-volume structured data |
| Agent-generated content | Data that needs complex queries |
| Large text content | Ephemeral state (sessions, caches) |
| Anything benefiting from transparency | Data with relationships |

Files for legibility, databases for structure. When in doubt, files.

Hybrid approach: maintain a file-based "source of truth" the agent works with, synced to the database for UI queries:
```text
Files: Research/book_123/introduction.md  (agent workspace)
DB:    research_index: { bookId, path, title, createdAt }  (UI queries)
```
</files_vs_database>

<conflict_model>
## Conflict Model

| Strategy | Pros | Cons |
|----------|------|------|
| **Last write wins** | Simple | Changes can be lost |
| **Agent checks before writing** | Preserves user edits | More complexity |
| **Append-only logs** | Never overwrites | Files grow forever |

For files agents write frequently (logs, status): last-write-wins is fine.
For files users edit (profiles, notes): agent should check modification time before overwriting, or use append-only pattern.

iCloud adds complexity — it creates `{filename} (conflict).md` files. Monitor for these with `NSMetadataQueryDidUpdate`.

System prompt guidance:
```markdown
## Working with User Content
When you create content, the user may edit it afterward. Always read
existing files before modifying them—the user may have made improvements
you should preserve.
```
</conflict_model>

<examples>
## Example: Reading App File Structure

```
Documents/
├── Library/
│   └── library.json
├── Research/
│   └── books/{bookId}/
│       ├── full_text.txt
│       ├── introduction.md      # Agent-generated, user-editable
│       ├── notes.md             # User notes
│       └── sources/
│           ├── wikipedia.md
│           └── reviews.md
├── Chats/
│   └── {conversationId}.json
├── Profile/
│   └── profile.md
└── context.md
```

Flow: user adds book → agent downloads text → agent researches → user edits intro → agent sees changes on next read → agent updates `context.md`.
</examples>

<checklist>
## Files as Universal Interface Checklist

- [ ] Entity-scoped directories (`{type}/{id}/`)
- [ ] Consistent naming conventions
- [ ] Ephemeral vs durable separation
- [ ] Markdown for human content, JSON for structured data
- [ ] Agent reads context.md at session start
- [ ] Agent updates context.md when learning
- [ ] Conflict model defined
- [ ] UI observes file changes (or shared service)
</checklist>
