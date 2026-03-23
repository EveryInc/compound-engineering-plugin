export const PI_COMPAT_EXTENSION_SOURCE = `import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent"
import { Type } from "@sinclair/typebox"

const MAX_BYTES = 50 * 1024
const DEFAULT_SUBAGENT_TIMEOUT_MS = 10 * 60 * 1000
const MAX_PARALLEL_SUBAGENTS = 8

type SubagentTask = {
  agent: string
  task: string
  cwd?: string
}

type SubagentResult = {
  agent: string
  task: string
  cwd: string
  exitCode: number
  output: string
  stderr: string
}

function truncate(value: string): string {
  const input = value ?? ""
  if (Buffer.byteLength(input, "utf8") <= MAX_BYTES) return input
  const head = input.slice(0, MAX_BYTES)
  return head + "\\n\\n[Output truncated to 50KB]"
}

function shellEscape(value: string): string {
  return "'" + value.replace(/'/g, "'\\"'\\"'") + "'"
}

function normalizeName(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function resolveBundledMcporterConfigPath(): string | undefined {
  try {
    const extensionDir = path.dirname(fileURLToPath(import.meta.url))
    const candidates = [
      path.join(extensionDir, "..", "pi-resources", "compound-engineering", "mcporter.json"),
      path.join(extensionDir, "..", "compound-engineering", "mcporter.json"),
    ]

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate
    }
  } catch {
    // noop: bundled path is best-effort fallback
  }

  return undefined
}

function resolveMcporterConfigPath(cwd: string, explicit?: string): string | undefined {
  if (explicit && explicit.trim()) {
    return path.resolve(explicit)
  }

  const projectPath = path.join(cwd, ".pi", "compound-engineering", "mcporter.json")
  if (fs.existsSync(projectPath)) return projectPath

  const globalPath = path.join(os.homedir(), ".pi", "agent", "compound-engineering", "mcporter.json")
  if (fs.existsSync(globalPath)) return globalPath

  return resolveBundledMcporterConfigPath()
}

function resolveTaskCwd(baseCwd: string, taskCwd?: string): string {
  if (!taskCwd || !taskCwd.trim()) return baseCwd
  const expanded = taskCwd === "~"
    ? os.homedir()
    : taskCwd.startsWith("~" + path.sep)
      ? path.join(os.homedir(), taskCwd.slice(2))
      : taskCwd
  return path.resolve(baseCwd, expanded)
}

async function runSingleSubagent(
  pi: ExtensionAPI,
  baseCwd: string,
  task: SubagentTask,
  signal?: AbortSignal,
  timeoutMs = DEFAULT_SUBAGENT_TIMEOUT_MS,
): Promise<SubagentResult> {
  const agent = normalizeName(task.agent)
  if (!agent) {
    throw new Error("Subagent task is missing a valid agent name")
  }

  const taskText = String(task.task ?? "").trim()
  if (!taskText) {
    throw new Error("Subagent task for " + agent + " is empty")
  }

  const cwd = resolveTaskCwd(baseCwd, task.cwd)
  const prompt = "/skill:" + agent + " " + taskText
  const script = "cd " + shellEscape(cwd) + " && pi --no-session -p " + shellEscape(prompt)
  const result = await pi.exec("bash", ["-lc", script], { signal, timeout: timeoutMs })

  return {
    agent,
    task: taskText,
    cwd,
    exitCode: result.code,
    output: truncate(result.stdout || ""),
    stderr: truncate(result.stderr || ""),
  }
}

async function runParallelSubagents(
  pi: ExtensionAPI,
  baseCwd: string,
  tasks: SubagentTask[],
  signal?: AbortSignal,
  timeoutMs = DEFAULT_SUBAGENT_TIMEOUT_MS,
  maxConcurrency = 4,
  onProgress?: (completed: number, total: number) => void,
): Promise<SubagentResult[]> {
  const safeConcurrency = Math.max(1, Math.min(maxConcurrency, MAX_PARALLEL_SUBAGENTS, tasks.length))
  const results: SubagentResult[] = new Array(tasks.length)

  let nextIndex = 0
  let completed = 0

  const workers = Array.from({ length: safeConcurrency }, async () => {
    while (true) {
      const current = nextIndex
      nextIndex += 1
      if (current >= tasks.length) return

      results[current] = await runSingleSubagent(pi, baseCwd, tasks[current], signal, timeoutMs)
      completed += 1
      onProgress?.(completed, tasks.length)
    }
  })

  await Promise.all(workers)
  return results
}

function formatSubagentSummary(results: SubagentResult[]): string {
  if (results.length === 0) return "No subagent work was executed."

  const success = results.filter((result) => result.exitCode === 0).length
  const failed = results.length - success
  const header = failed === 0
    ? "Subagent run completed: " + success + "/" + results.length + " succeeded."
    : "Subagent run completed: " + success + "/" + results.length + " succeeded, " + failed + " failed."

  const lines = results.map((result) => {
    const status = result.exitCode === 0 ? "ok" : "error"
    const body = result.output || result.stderr || "(no output)"
    const preview = body.split("\\n").slice(0, 6).join("\\n")
    return "\\n[" + status + "] " + result.agent + "\\n" + preview
  })

  return header + lines.join("\\n")
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "ask_user_question",
    label: "Ask User Question",
    description: "Ask the user a question with optional choices.",
    parameters: Type.Object({
      question: Type.String({ description: "Question shown to the user" }),
      options: Type.Optional(Type.Array(Type.String(), { description: "Selectable options" })),
      allowCustom: Type.Optional(Type.Boolean({ default: true })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!ctx.hasUI) {
        return {
          isError: true,
          content: [{ type: "text", text: "UI is unavailable in this mode." }],
          details: {},
        }
      }

      const options = params.options ?? []
      const allowCustom = params.allowCustom ?? true

      if (options.length === 0) {
        const answer = await ctx.ui.input(params.question)
        if (!answer) {
          return {
            content: [{ type: "text", text: "User cancelled." }],
            details: { answer: null },
          }
        }

        return {
          content: [{ type: "text", text: "User answered: " + answer }],
          details: { answer, mode: "input" },
        }
      }

      const customLabel = "Other (type custom answer)"
      const selectable = allowCustom ? [...options, customLabel] : options
      const selected = await ctx.ui.select(params.question, selectable)

      if (!selected) {
        return {
          content: [{ type: "text", text: "User cancelled." }],
          details: { answer: null },
        }
      }

      if (selected === customLabel) {
        const custom = await ctx.ui.input("Your answer")
        if (!custom) {
          return {
            content: [{ type: "text", text: "User cancelled." }],
            details: { answer: null },
          }
        }

        return {
          content: [{ type: "text", text: "User answered: " + custom }],
          details: { answer: custom, mode: "custom" },
        }
      }

      return {
        content: [{ type: "text", text: "User selected: " + selected }],
        details: { answer: selected, mode: "select" },
      }
    },
  })

  const subagentTaskSchema = Type.Object({
    agent: Type.String({ description: "Skill/agent name to invoke" }),
    task: Type.String({ description: "Task instructions for that skill" }),
    cwd: Type.Optional(Type.String({ description: "Optional working directory for this task" })),
  })

  pi.registerTool({
    name: "ce_subagent",
    label: "Compound Engineering Subagent",
    description: "Run one or more Compound Engineering skill-based subagent tasks. Supports single, parallel, and chained execution.",
    parameters: Type.Object({
      agent: Type.Optional(Type.String({ description: "Single subagent name" })),
      task: Type.Optional(Type.String({ description: "Single subagent task" })),
      cwd: Type.Optional(Type.String({ description: "Working directory for single mode" })),
      tasks: Type.Optional(Type.Array(subagentTaskSchema, { description: "Parallel subagent tasks" })),
      chain: Type.Optional(Type.Array(subagentTaskSchema, { description: "Sequential tasks; supports {previous} placeholder" })),
      maxConcurrency: Type.Optional(Type.Number({ default: 4 })),
      timeoutMs: Type.Optional(Type.Number({ default: DEFAULT_SUBAGENT_TIMEOUT_MS })),
    }),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const hasSingle = Boolean(params.agent && params.task)
      const hasTasks = Boolean(params.tasks && params.tasks.length > 0)
      const hasChain = Boolean(params.chain && params.chain.length > 0)
      const modeCount = Number(hasSingle) + Number(hasTasks) + Number(hasChain)

      if (modeCount !== 1) {
        return {
          isError: true,
          content: [{ type: "text", text: "Provide exactly one mode: single (agent+task), tasks, or chain." }],
          details: {},
        }
      }

      const timeoutMs = Number(params.timeoutMs || DEFAULT_SUBAGENT_TIMEOUT_MS)

      try {
        if (hasSingle) {
          const result = await runSingleSubagent(
            pi,
            ctx.cwd,
            { agent: params.agent!, task: params.task!, cwd: params.cwd },
            signal,
            timeoutMs,
          )

          const body = formatSubagentSummary([result])
          return {
            isError: result.exitCode !== 0,
            content: [{ type: "text", text: body }],
            details: { mode: "single", results: [result] },
          }
        }

        if (hasTasks) {
          const tasks = params.tasks as SubagentTask[]
          const maxConcurrency = Number(params.maxConcurrency || 4)

          const results = await runParallelSubagents(
            pi,
            ctx.cwd,
            tasks,
            signal,
            timeoutMs,
            maxConcurrency,
            (completed, total) => {
              onUpdate?.({
                content: [{ type: "text", text: "Subagent progress: " + completed + "/" + total }],
                details: { mode: "parallel", completed, total },
              })
            },
          )

          const body = formatSubagentSummary(results)
          const hasFailure = results.some((result) => result.exitCode !== 0)

          return {
            isError: hasFailure,
            content: [{ type: "text", text: body }],
            details: { mode: "parallel", results },
          }
        }

        const chain = params.chain as SubagentTask[]
        const results: SubagentResult[] = []
        let previous = ""

        for (const step of chain) {
          const resolvedTask = step.task.replace(/\\{previous\\}/g, previous)
          const result = await runSingleSubagent(
            pi,
            ctx.cwd,
            { agent: step.agent, task: resolvedTask, cwd: step.cwd },
            signal,
            timeoutMs,
          )
          results.push(result)
          previous = result.output || result.stderr

          onUpdate?.({
            content: [{ type: "text", text: "Subagent chain progress: " + results.length + "/" + chain.length }],
            details: { mode: "chain", completed: results.length, total: chain.length },
          })

          if (result.exitCode !== 0) break
        }

        const body = formatSubagentSummary(results)
        const hasFailure = results.some((result) => result.exitCode !== 0)

        return {
          isError: hasFailure,
          content: [{ type: "text", text: body }],
          details: { mode: "chain", results },
        }
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
          details: {},
        }
      }
    },
  })

  pi.registerTool({
    name: "mcporter_list",
    label: "MCPorter List",
    description: "List tools on an MCP server through MCPorter.",
    parameters: Type.Object({
      server: Type.String({ description: "Configured MCP server name" }),
      allParameters: Type.Optional(Type.Boolean({ default: false })),
      json: Type.Optional(Type.Boolean({ default: true })),
      configPath: Type.Optional(Type.String({ description: "Optional mcporter config path" })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const args = ["list", params.server]
      if (params.allParameters) args.push("--all-parameters")
      if (params.json ?? true) args.push("--json")

      const configPath = resolveMcporterConfigPath(ctx.cwd, params.configPath)
      if (configPath) {
        args.push("--config", configPath)
      }

      const result = await pi.exec("mcporter", args, { signal })
      const output = truncate(result.stdout || result.stderr || "")

      return {
        isError: result.code !== 0,
        content: [{ type: "text", text: output || "(no output)" }],
        details: {
          exitCode: result.code,
          command: "mcporter " + args.join(" "),
          configPath,
        },
      }
    },
  })

  pi.registerTool({
    name: "mcporter_call",
    label: "MCPorter Call",
    description: "Call a specific MCP tool through MCPorter.",
    parameters: Type.Object({
      call: Type.Optional(Type.String({ description: "Function-style call, e.g. linear.list_issues(limit: 5)" })),
      server: Type.Optional(Type.String({ description: "Server name (if call is omitted)" })),
      tool: Type.Optional(Type.String({ description: "Tool name (if call is omitted)" })),
      args: Type.Optional(Type.Record(Type.String(), Type.Any(), { description: "JSON arguments object" })),
      configPath: Type.Optional(Type.String({ description: "Optional mcporter config path" })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const args = ["call"]

      if (params.call && params.call.trim()) {
        args.push(params.call.trim())
      } else {
        if (!params.server || !params.tool) {
          return {
            isError: true,
            content: [{ type: "text", text: "Provide either call, or server + tool." }],
            details: {},
          }
        }
        args.push(params.server + "." + params.tool)
        if (params.args) {
          args.push("--args", JSON.stringify(params.args))
        }
      }

      args.push("--output", "json")

      const configPath = resolveMcporterConfigPath(ctx.cwd, params.configPath)
      if (configPath) {
        args.push("--config", configPath)
      }

      const result = await pi.exec("mcporter", args, { signal })
      const output = truncate(result.stdout || result.stderr || "")

      return {
        isError: result.code !== 0,
        content: [{ type: "text", text: output || "(no output)" }],
        details: {
          exitCode: result.code,
          command: "mcporter " + args.join(" "),
          configPath,
        },
      }
    },
  })
}
`
