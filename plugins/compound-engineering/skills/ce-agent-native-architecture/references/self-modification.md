<overview>
Self-modification is the advanced tier of agent-native engineering: agents that can evolve their own code, prompts, and behavior. The logical extension of "whatever the developer can do, the agent can do."
</overview>

<why_self_modification>
## Why Self-Modification?

Self-modifying agents can:
- **Fix their own bugs** — See an error, patch the code, restart
- **Add new capabilities** — User asks for something new, agent implements it
- **Evolve behavior** — Learn from feedback and adjust prompts
- **Deploy themselves** — Push code, trigger builds, restart
</why_self_modification>

<capabilities>
## What Self-Modification Enables

**Code modification:** Read source files, write fixes and new features, commit/push, trigger builds and verify they pass.

**Prompt evolution:** Edit the system prompt based on feedback, add new feature sections, refine judgment criteria.

**Infrastructure control:** Pull latest code, merge branches, restart after changes, roll back if something breaks.

**Site/output generation:** Generate and maintain websites, documentation, dashboards.
</capabilities>

<guardrails>
## Required Guardrails

**Approval gates for code changes:**
```typescript
tool("write_file", async ({ path, content }) => {
  if (isCodeFile(path)) {
    pendingChanges.set(path, content);
    const diff = generateDiff(path, content);
    return { text: `Requires approval:\n\n${diff}\n\nReply "yes" to apply.` };
  }
  writeFileSync(path, content);
  return { text: `Wrote ${path}` };
});
```

**Auto-commit before changes:**
```typescript
tool("self_deploy", async () => {
  runGit("stash");
  runGit("fetch origin");
  runGit("merge origin/main --no-edit");
  runCommand("npm run build");
  scheduleRestart();
});
```

**Build verification:**
```typescript
try {
  runCommand("npm run build", { timeout: 120000 });
} catch (error) {
  runGit("merge --abort");
  return { text: "Build failed, aborting deploy", isError: true };
}
```

**Health checks after restart:**
```typescript
tool("health_check", async () => {
  return {
    text: JSON.stringify({
      status: "healthy",
      uptime: `${Math.floor(process.uptime() / 60)}m`,
      build: existsSync("dist/index.js") ? "valid" : "missing",
      git: !runGit("status --porcelain") ? "clean" : "uncommitted changes",
    }, null, 2),
  };
});
```
</guardrails>

<git_architecture>
## Git-Based Self-Modification

Git provides version history, branching, merge, and push/pull — the full safety net for self-modification.

**Essential git tools:**
```typescript
tool("status", "Show git status", {}, ...);
tool("diff", "Show file changes", { path: z.string().optional() }, ...);
tool("log", "Show commit history", { count: z.number() }, ...);
tool("commit_code", "Commit code changes", { message: z.string() }, ...);
tool("git_push", "Push to GitHub", { branch: z.string().optional() }, ...);
tool("pull", "Pull from GitHub", { source: z.enum(["main", "instance"]) }, ...);
tool("rollback", "Revert recent commits", { commits: z.number() }, ...);
```

**Multi-instance architecture:**
```
main                      # Shared code
├── instance/bot-a       # Instance A's branch
├── instance/bot-b       # Instance B's branch
└── instance/bot-c       # Instance C's branch
```

Each instance can pull from main, push improvements back (via PR), sync from other instances, and maintain instance-specific config.
</git_architecture>

<prompt_evolution>
## Self-Modifying Prompts

The system prompt is a file the agent can read and write (with approval).

**System prompt as living document:**
```markdown
## Feedback Processing

When someone shares feedback:
1. Acknowledge warmly
2. Rate importance 1-5
3. Store using feedback tools

<!-- Note to self: Video walkthroughs should always be 4-5,
     learned this from Dan's feedback on 2024-12-07 -->
```

The agent can add notes, refine judgment criteria, add new feature sections, and document learned edge cases.
</prompt_evolution>

<when_to_use>
## When to Implement Self-Modification

**Good candidates:**
- Long-running autonomous agents
- Agents that need to adapt to feedback
- Systems where behavior evolution is valuable
- Internal tools where rapid iteration matters

**Not necessary for:**
- Simple single-task agents
- Highly regulated or auditable environments
- One-off or short-lived agents

Start with a non-self-modifying prompt-native agent. Add self-modification when you need it.
</when_to_use>

<checklist>
## Self-Modification Checklist

Before enabling:
- [ ] Git-based version control set up
- [ ] Approval gates for code changes
- [ ] Build verification before restart
- [ ] Rollback mechanism available
- [ ] Health check endpoint
- [ ] Instance identity configured

When implementing:
- [ ] Agent can read all project files
- [ ] Agent can write files (with appropriate approval)
- [ ] Agent can commit and push
- [ ] Agent can pull updates
- [ ] Agent can restart itself
- [ ] Agent can roll back if needed
</checklist>
