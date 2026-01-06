# Agent-Native Architecture Skill

Build AI agents using prompt-native architecture where features are defined in prompts, not code.

## What This Skill Does

This skill provides comprehensive guidance for building prompt-native agents:

- **Prompt-native philosophy** - Features as prompts, not code workflows
- **MCP tool design** - Primitive tools that enable capability, not encode behavior
- **System prompts** - Define outcomes, trust the agent's intelligence
- **Self-modification** - Enable agents to safely evolve themselves
- **Action parity** - Ensure agents can do everything users can do
- **Context injection** - Inject runtime app state into agent prompts

## Common Workflows

### 1. Design Primitive Tools
Create tools that enable capability, not encode workflows.

```typescript
// RIGHT - primitives that enable capability
const tools = [
  tool("read_file", "Read any file", { path: z.string() }, ...),
  tool("write_file", "Write any file", { path: z.string(), content: z.string() }, ...),
  tool("list_files", "List directory", { path: z.string() }, ...),
];

// WRONG - workflow encoded in tool
tool("process_feedback", async ({ message }) => {
  const category = categorize(message);     // Your code
  const priority = calculatePriority(message); // Your code
  await store(message, category, priority);   // Your code
});
```

### 2. Write Behavior in System Prompt
Define outcomes, let the agent figure out HOW.

```markdown
## Your Responsibilities
When asked to organize content, you should:
1. Read existing files to understand the structure
2. Analyze what organization makes sense
3. Create appropriate pages using write_file
4. Use your judgment about layout and formatting

You decide the structure. Make it good.
```

### 3. Ensure Action Parity
Every UI action has a corresponding agent tool.

```markdown
- [ ] Every UI action has a corresponding agent tool
- [ ] If UI can edit or delete, agent can too
- [ ] The "write something to [app location]" test passes
```

### 4. Inject Dynamic Context
Include available resources and capabilities in system prompt.

```markdown
## Available Resources
- Feed entries: 47 items
- Draft insights: 3 items
- Recent activity: Updated 2 hours ago

## What You Can Do
- write_to_feed: Publish content to the main feed
- create_insight: Save a new insight draft
```

### 5. Add Self-Modification (Advanced)
Enable agents to safely evolve their own code.

```markdown
Requirements:
- Approval gates for code changes
- Auto-commit before modifications (rollback capability)
- Health checks after changes
- Build verification before restart
```

## Agent Skill Standard

This skill follows the [Agent Skill Standard](https://agentskills.io/), an open standard for portable AI coding agent skills. This means it works across 14+ AI coding agents including:

- Claude Code
- OpenAI Codex
- OpenCode
- Cursor
- Gemini CLI
- GitHub Copilot CLI
- Windsurf
- And more...

## Installing with Skilz (Universal Installer)

The recommended way to install this skill across different AI coding agents is using the **skilz** universal installer.

### Install Skilz

```bash
pip install skilz
```

### Installation Options

#### Option 1: Install for Claude Code

```bash
skilz install agent-native-architecture --agent claude-code
```

#### Option 2: Install for OpenCode

```bash
skilz install agent-native-architecture --agent opencode
```

#### Option 3: Install for Gemini CLI

```bash
skilz install agent-native-architecture --agent gemini
```

#### Option 4: Install for OpenAI Codex

```bash
skilz install agent-native-architecture --agent codex
```

### Install from SkillzWave Marketplace

Visit [SkillzWave.ai](https://skillzwave.ai) to browse and install skills with one click.

## License

MIT
