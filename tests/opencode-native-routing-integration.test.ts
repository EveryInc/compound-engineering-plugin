import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises"
import os from "os"
import path from "path"
import { pathToFileURL } from "url"
import { describe, expect, test } from "bun:test"

const repoRoot = path.join(import.meta.dir, "..")
const role = "ce-work.implementation-worker"

function carrier(value: Record<string, unknown>): string {
  return `[[ce-routing-intent/v1 ${Buffer.from(JSON.stringify(value)).toString("base64url")}]]`
}

async function loadNativePackage() {
  const manifest = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"))
  expect(manifest.main).toBe(".opencode/plugins/compound-engineering.js")
  return import(pathToFileURL(path.join(repoRoot, manifest.main)).href)
}

function fakeSdk() {
  const calls = {
    creates: [] as Record<string, any>[],
    createOptions: [] as Record<string, any>[],
    prompts: [] as Record<string, any>[],
    promptOptions: [] as Record<string, any>[],
    asks: [] as Record<string, any>[],
  }
  const permission = [
    { permission: "read", pattern: "*", action: "allow" },
    { permission: "bash", pattern: "rm *", action: "deny" },
    { permission: "external_directory", pattern: "*", action: "ask" },
    { permission: "external_directory", pattern: "/tmp/opencode-*", action: "allow" },
  ]
  const client = {
    session: {
      get: async ({ sessionID }: { sessionID: string }) => ({
        data: { id: sessionID, permission, model: { providerID: "openai", id: "parent-model", variant: "medium" } },
      }),
      create: async (input: Record<string, any>, options: Record<string, any>) => {
        calls.creates.push(structuredClone(input))
        calls.createOptions.push(options)
        return { data: { id: "child-session" } }
      },
      prompt: async (input: Record<string, any>, options: Record<string, any>) => {
        calls.prompts.push(structuredClone(input))
        calls.promptOptions.push(options)
        return {
          data: {
            info: { role: "assistant", providerID: "openai", modelID: "routed-model", variant: "high" },
            parts: [{ type: "text", text: "routed worker output" }],
          },
        }
      },
      abort: async () => ({ data: true }),
      status: async () => ({ data: { "child-session": { type: "idle" } } }),
    },
    model: {
      list: async () => ({
        data: {
          data: [{ providerID: "openai", id: "routed-model", enabled: true, variants: [{ id: "high" }] }],
        },
      }),
    },
    app: {
      agents: async () => ({
        data: [{
          name: "general",
          mode: "subagent",
          permission: [
            { permission: "*", pattern: "*", action: "allow" },
            { permission: "todowrite", pattern: "*", action: "deny" },
          ],
        }],
      }),
    },
    config: {
      get: async () => ({
        data: { subagent_depth: 1, experimental: { primary_tools: ["primary_only", "bash", "task"] } },
      }),
    },
  }
  return { calls, client }
}

describe("native OpenCode routing integration", () => {
  test("loads the native package and routes through the real tool and co-located resolver", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ce-opencode-native-"))
    const project = path.join(root, "project")
    const globalHome = path.join(root, "global")
    const projectConfigDir = path.join(project, ".compound-engineering")
    const originalHome = process.env.COMPOUND_ENGINEERING_HOME
    try {
      await mkdir(projectConfigDir, { recursive: true })
      await mkdir(globalHome, { recursive: true, mode: 0o700 })
      await Bun.$`git init -q`.cwd(project)
      await writeFile(path.join(project, ".gitignore"), ".compound-engineering/*.local.yaml\n")
      await writeFile(path.join(globalHome, "config.yaml"), "# empty global config\n", { mode: 0o600 })
      await writeFile(path.join(projectConfigDir, "config.local.yaml"), "# empty project config\n", { mode: 0o600 })
      await chmod(path.join(globalHome, "config.yaml"), 0o600)
      await chmod(path.join(projectConfigDir, "config.local.yaml"), 0o600)
      process.env.COMPOUND_ENGINEERING_HOME = globalHome

      const nativePackage = await loadNativePackage()
      expect(typeof nativePackage.createCompoundEngineeringPlugin).toBe("function")
      const firstSdk = fakeSdk()
      const createPlugin = nativePackage.createCompoundEngineeringPlugin({ createClient: () => firstSdk.client })
      const plugin = await createPlugin({ serverUrl: new URL("http://127.0.0.1:4096"), directory: project })
      expect(plugin.tool?.ce_task).toBeDefined()
      expect(Object.keys(plugin.tool.ce_task_prepare.args).sort()).toEqual(["instances", "role"])
      expect(Object.keys(plugin.tool.ce_task.args).sort()).toEqual([
        "description", "instance", "prompt", "role", "routing_handle",
      ])

      const native = await plugin.tool.ce_task.execute({
        role,
        description: "implement the unit",
        prompt: "native prompt bytes",
      }, {
        sessionID: "native-session",
        directory: project,
        ask: async (input: Record<string, any>) => { firstSdk.calls.asks.push(input) },
      })
      expect(native).toMatchObject({
        title: "CE native task required",
        metadata: { kind: "native" },
      })
      expect(firstSdk.calls.creates).toHaveLength(0)
      expect(firstSdk.calls.prompts).toHaveLength(0)

      await writeFile(path.join(projectConfigDir, "config.local.yaml"), [
        "routing:",
        "  profiles:",
        "    integration:",
        "      candidates:",
        "        - { harness: opencode, model: openai/routed-model, effort: high }",
        "  roles:",
        `    ${role}: { profile: integration, policy: require }`,
        "",
      ].join("\n"), { mode: 0o600 })
      await chmod(path.join(projectConfigDir, "config.local.yaml"), 0o600)

      const routedSdk = fakeSdk()
      const configuredPlugin = await nativePackage.createCompoundEngineeringPlugin({
        createClient: () => routedSdk.client,
      })({ serverUrl: new URL("http://127.0.0.1:4096"), directory: project })
      const prompt = "CE prompt bytes\nremain exactly unchanged."
      const abort = new AbortController()
      const prepared = await configuredPlugin.tool.ce_task_prepare.execute({
        role,
        instances: ["integration-instance"],
      }, {
        sessionID: "configured-session",
        directory: project,
      })
      const routed = await configuredPlugin.tool.ce_task.execute({
        role,
        instance: "integration-instance",
        routing_handle: prepared.metadata.routing_handle,
        description: "implement the unit",
        prompt,
      }, {
        sessionID: "configured-session",
        directory: project,
        abort: abort.signal,
        ask: async (input: Record<string, any>) => { routedSdk.calls.asks.push(structuredClone(input)) },
      })

      expect(routed.output).toBe("routed worker output")
      expect(routed.metadata.receipt).toMatchObject({
        role,
        profile: "integration",
        source_layer: "project-role",
        identity_status: "verified",
        provider_actual: "openai",
        model_actual: "routed-model",
        variant_actual: "high",
        effort_actual: "high",
      })
      expect(routedSdk.calls.asks).toEqual([expect.objectContaining({
        permission: "task",
        patterns: ["general"],
      })])
      expect(routedSdk.calls.creates).toEqual([expect.objectContaining({
        parentID: "configured-session",
        title: "implement the unit (@general subagent)",
        agent: "general",
        model: { providerID: "openai", id: "routed-model", variant: "high" },
        permission: [
          { permission: "bash", pattern: "rm *", action: "deny" },
          { permission: "external_directory", pattern: "*", action: "ask" },
          { permission: "external_directory", pattern: "/tmp/opencode-*", action: "allow" },
          { permission: "task", pattern: "*", action: "deny" },
          { permission: "primary_only", pattern: "*", action: "deny" },
          { permission: "bash", pattern: "*", action: "deny" },
        ],
      })])
      expect(routedSdk.calls.prompts).toEqual([expect.objectContaining({
        sessionID: "child-session",
        agent: "general",
        model: { providerID: "openai", modelID: "routed-model" },
        variant: "high",
        parts: [{ type: "text", text: prompt }],
      })])
      expect(routedSdk.calls.createOptions).toEqual([{ signal: abort.signal }])
      expect(routedSdk.calls.promptOptions).toEqual([{ signal: abort.signal }])

      const rawArguments = `${carrier({ role, binding: "ce-default" })}\ncommand arguments`
      const commandOutput = {
        message: { id: "command-message" },
        parts: [{ type: "text", text: `Load and execute the skill.\n\n${rawArguments}` }],
      }
      await configuredPlugin["command.execute.before"]?.({
        command: "ce-work",
        sessionID: "command-session",
        arguments: rawArguments,
      }, commandOutput)
      expect(commandOutput.parts[0].text).toBe("Load and execute the skill.\n\ncommand arguments")
      await configuredPlugin["chat.message"]?.({
        sessionID: "command-session",
        messageID: "expanded-command-message",
      }, commandOutput)

      const commandPrepared = await configuredPlugin.tool.ce_task_prepare.execute({
        role,
        instances: ["command-instance"],
      }, {
        sessionID: "command-session",
        directory: project,
      })
      const commandResult = await configuredPlugin.tool.ce_task.execute({
        role,
        instance: "command-instance",
        routing_handle: commandPrepared.metadata.routing_handle,
        description: "command worker",
        prompt: "command prompt",
      }, {
        sessionID: "command-session",
        directory: project,
        ask: async (input: Record<string, any>) => { routedSdk.calls.asks.push(structuredClone(input)) },
      })
      expect(commandResult.metadata.kind).toBe("native")
      expect(routedSdk.calls.creates).toHaveLength(1)

      const nextTurn = {
        message: { id: "next-turn" },
        parts: [{ type: "text", text: "ordinary later turn" }],
      }
      await configuredPlugin["chat.message"]?.({ sessionID: "command-session", messageID: "next-turn" }, nextTurn)
      const nextPrepared = await configuredPlugin.tool.ce_task_prepare.execute({
        role,
        instances: ["next-instance"],
      }, {
        sessionID: "command-session",
        directory: project,
      })
      const nextResult = await configuredPlugin.tool.ce_task.execute({
        role,
        instance: "next-instance",
        routing_handle: nextPrepared.metadata.routing_handle,
        description: "next worker",
        prompt: "next prompt",
      }, {
        sessionID: "command-session",
        directory: project,
        ask: async (input: Record<string, any>) => { routedSdk.calls.asks.push(structuredClone(input)) },
      })
      expect(nextResult.output).toBe("routed worker output")
      expect(routedSdk.calls.creates).toHaveLength(2)

      await writeFile(path.join(projectConfigDir, "config.local.yaml"), [
        "routing:",
        "  profiles:",
        "    external:",
        "      candidates:",
        "        - { harness: codex, model: gpt-5.6 }",
        "  roles:",
        `    ${role}: { profile: external, policy: require }`,
        "",
      ].join("\n"), { mode: 0o600 })
      const externalSdk = fakeSdk()
      const externalPlugin = await nativePackage.createCompoundEngineeringPlugin({
        createClient: () => externalSdk.client,
      })({ serverUrl: new URL("http://127.0.0.1:4096"), directory: project })
      const externalPrepared = await externalPlugin.tool.ce_task_prepare.execute({
        role,
        instances: ["external-instance"],
      }, {
        sessionID: "external-session",
        directory: project,
      })
      expect(externalPrepared.metadata).toMatchObject({ kind: "external", instances: 1 })
      expect(externalSdk.calls.creates).toHaveLength(0)

      const directExternal = `${carrier({ role, binding: { policy: "require", candidates: [{ harness: "codex", model: "gpt-5.6" }] } })}\ndirect external`
      const directOutput = { message: { id: "direct-external" }, parts: [{ type: "text", text: directExternal }] }
      await externalPlugin["chat.message"]?.({ sessionID: "direct-external-session", messageID: "direct-external" }, directOutput)
      await expect(externalPlugin.tool.ce_task_prepare.execute({
        role,
        instances: ["direct-external-instance"],
      }, {
        sessionID: "direct-external-session",
        directory: project,
      })).rejects.toThrow(/direct task intent cannot select an external CE Work route/i)
    } finally {
      if (originalHome === undefined) delete process.env.COMPOUND_ENGINEERING_HOME
      else process.env.COMPOUND_ENGINEERING_HOME = originalHome
      await rm(root, { recursive: true, force: true })
    }
  })
})
