<overview>
Agent execution patterns for building robust agent loops. Covers completion signals, partial completion tracking, model tier selection, and context limit design.
</overview>

<completion_signals>
## Completion Signals

Use an explicit `complete_task` tool—not heuristic detection (consecutive iterations without tool calls, expected output files, timeouts). Heuristics break in edge cases.

```typescript
tool("complete_task", {
  summary: z.string().describe("Summary of what was accomplished"),
  status: z.enum(["success", "partial", "blocked"]).optional(),
}, async ({ summary, status = "success" }) => {
  return { text: summary, shouldContinue: false };
});
```

### The ToolResult Pattern

Structure tool results to separate success from continuation:

```swift
struct ToolResult {
    let success: Bool
    let output: String
    let shouldContinue: Bool
}

extension ToolResult {
    static func success(_ output: String) -> ToolResult {
        ToolResult(success: true, output: output, shouldContinue: true)
    }
    static func error(_ message: String) -> ToolResult {
        ToolResult(success: false, output: message, shouldContinue: true)
    }
    static func complete(_ summary: String) -> ToolResult {
        ToolResult(success: true, output: summary, shouldContinue: false)
    }
}
```

A tool can **succeed** AND signal **stop** (task complete), or **fail** AND signal **continue** (recoverable, try something else).

System prompt guidance:
```markdown
## Completing Tasks
When you've accomplished the user's request:
1. Verify your work (read back files you created, check results)
2. Call `complete_task` with a summary of what you did
3. Don't keep working after the goal is achieved

If blocked: Call `complete_task` with status "blocked" and explain why.
```
</completion_signals>

<partial_completion>
## Partial Completion

For multi-step tasks, track progress at the task level for resume capability.

```swift
enum TaskStatus { case pending, inProgress, completed, failed, skipped }

struct AgentTask {
    let id: String
    let description: String
    var status: TaskStatus
    var notes: String?
}

struct AgentSession {
    var tasks: [AgentTask]
    var isComplete: Bool { tasks.allSatisfy { $0.status == .completed || $0.status == .skipped } }
    var progress: (completed: Int, total: Int) {
        (tasks.filter { $0.status == .completed }.count, tasks.count)
    }
}
```

Progress display:
```
Progress: 3/5 tasks complete (60%)
✅ [1] Find source materials
✅ [2] Download full text
✅ [3] Extract key passages
❌ [4] Generate summary - Error: context limit exceeded
⏳ [5] Create outline - Pending
```

Checkpoint structure for resume:
```swift
struct AgentCheckpoint: Codable {
    let sessionId: String
    let agentType: String
    let messages: [Message]
    let iterationCount: Int
    let tasks: [AgentTask]
    let customState: [String: Any]
    let timestamp: Date

    var isValid: Bool { Date().timeIntervalSince(timestamp) < 3600 }
}
```

Resume flow: scan for valid checkpoints on launch → offer "Resume?" → restore messages and task states → continue the loop where it left off.
</partial_completion>

<model_tier_selection>
## Model Tier Selection

Use the cheapest model that achieves the outcome.

| Agent Type | Recommended Tier | Reasoning |
|------------|-----------------|-----------|
| Chat/Conversation | Balanced (Sonnet) | Fast responses, good reasoning |
| Research | Balanced (Sonnet) | Tool loops, not ultra-complex synthesis |
| Content Generation | Balanced (Sonnet) | Creative but not synthesis-heavy |
| Complex Analysis | Powerful (Opus) | Multi-document synthesis, nuanced judgment |
| Profile Generation | Powerful (Opus) | Photo analysis, complex pattern recognition |
| Quick Queries | Fast (Haiku) | Simple lookups, quick transformations |

Cost strategies: start with balanced, upgrade only if quality insufficient; fast tier for tool-heavy loops where each turn is simple; powerful tier reserved for synthesis.
</model_tier_selection>

<context_limits>
## Context Limits

Design for bounded context from the start.

Tools should support iterative refinement:
```typescript
tool("read_file", {
  path: z.string(),
  preview: z.boolean().default(true),   // First 1000 chars by default
  full: z.boolean().default(false),
}, ...);
```

Provide a consolidation tool:
```typescript
tool("summarize_and_continue", {
  keyPoints: z.array(z.string()),
  nextSteps: z.array(z.string()),
}, async ({ keyPoints, nextSteps }) => {
  await saveSessionSummary({ keyPoints, nextSteps });
  return { text: "Summary saved. Continuing with focus on: " + nextSteps.join(", ") };
});
```

Design for truncation: important context belongs in the system prompt (always present), in files (can be re-read), or in `context.md`.

```swift
class AgentOrchestrator {
    let maxContextTokens = 100_000
    let targetContextTokens = 80_000

    func truncateIfNeeded() {
        if estimateTokens(messages) > targetContextTokens {
            messages = [systemMessage] + summarizeOldMessages() + recentMessages
        }
    }
}
```
</context_limits>

<orchestrator_pattern>
## Unified Agent Orchestrator

One execution engine, many agent types. All agents share the same orchestrator (message loop, tool dispatch, checkpoint/resume, error handling) but with different configs (tools, system prompt, model tier).

Benefits: consistent lifecycle management, automatic checkpoint/resume, shared tool protocol, easy to add new agent types, centralized error handling.
</orchestrator_pattern>

<checklist>
## Agent Execution Checklist

- [ ] `complete_task` tool provided (explicit completion, not heuristic)
- [ ] Tool results include `shouldContinue` flag
- [ ] System prompt guides when to complete
- [ ] Tasks tracked with status for partial completion
- [ ] Checkpoints saved for resume
- [ ] Model tier selected by task complexity
- [ ] Tools support iterative refinement (preview vs full)
- [ ] Consolidation mechanism available
- [ ] Important context persisted to files
</checklist>
