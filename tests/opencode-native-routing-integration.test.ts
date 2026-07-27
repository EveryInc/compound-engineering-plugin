import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises"
import os from "os"
import path from "path"
import { pathToFileURL } from "url"
import { describe, expect, test } from "bun:test"

const repoRoot = path.join(import.meta.dir, "..")
const role = "ce-work.implementation-worker"

async function loadNativePackage() {
  const manifest = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"))
  expect(manifest.main).toBe(".opencode/plugins/compound-engineering.js")
  return import(pathToFileURL(path.join(repoRoot, manifest.main)).href)
}

function fakeSdk() {
  const calls = {
    creates: [] as Record<string, any>[],
    prompts: [] as Record<string, any>[],
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
      create: async (input: Record<string, any>) => {
        calls.creates.push(structuredClone(input))
        return { data: { id: "child-session" } }
      },
      prompt: async (input: Record<string, any>) => {
        calls.prompts.push(structuredClone(input))
        return {
          data: {
            info: { role: "assistant", providerID: "openai", modelID: "routed-model", variant: "high" },
            parts: [{ type: "text", text: "routed worker output" }],
          },
        }
      },
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
      const routed = await configuredPlugin.tool.ce_task.execute({
        role,
        description: "implement the unit",
        prompt,
      }, {
        sessionID: "configured-session",
        directory: project,
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
    } finally {
      if (originalHome === undefined) delete process.env.COMPOUND_ENGINEERING_HOME
      else process.env.COMPOUND_ENGINEERING_HOME = originalHome
      await rm(root, { recursive: true, force: true })
    }
  })
})
