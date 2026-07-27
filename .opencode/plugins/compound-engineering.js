import path from "path"
import fs from "fs"
import { randomUUID } from "crypto"
import { fileURLToPath } from "url"
import { tool } from "@opencode-ai/plugin"
import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import {
  createOpenCodeIntentStore,
  createOpenCodeResolver,
  createOpenCodeRoutingAdapter,
  createOpenCodeSdkHost,
} from "./ce-routing-adapter.js"

const pluginDir = path.dirname(fileURLToPath(import.meta.url))
const skillsDir = path.resolve(pluginDir, "../../skills")

function loadRoutingCatalog() {
  try {
    const catalog = JSON.parse(fs.readFileSync(path.join(skillsDir, "ce-work", "references", "dispatch-roles.json"), "utf8"))
    return { roles: Object.keys(catalog.roles ?? {}), classes: catalog.classes ?? [] }
  } catch {
    return { roles: [], classes: [] }
  }
}

function unquote(value) {
  if (value.length < 2) return value
  const quote = value[0]
  if ((quote !== '"' && quote !== "'") || value[value.length - 1] !== quote) return value
  const inner = value.slice(1, -1)
  return quote === '"' ? inner.replace(/\\(["\\])/g, "$1") : inner.replace(/''/g, "'")
}

// Scoped to the leading `---` block so a `name:`/`description:` line inside a
// fenced YAML example in the skill body cannot register a bogus command.
function parseFrontmatter(content) {
  const block = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!block) return null
  const fields = {}
  for (const line of block[1].split(/\r?\n/)) {
    const pair = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/)
    if (pair) fields[pair[1]] = unquote(pair[2].trim())
  }
  return fields
}

function loadSkills() {
  const commands = {}
  let entries
  try {
    entries = fs.readdirSync(skillsDir)
  } catch {
    return commands
  }
  for (const entry of entries) {
    let content
    try {
      content = fs.readFileSync(path.join(skillsDir, entry, "SKILL.md"), "utf8")
    } catch {
      continue
    }
    const fields = parseFrontmatter(content)
    if (!fields || !fields.name) continue
    if (fields["user-invocable"] === "false") continue
    const command = {
      template: `Load and execute the \`${fields.name}\` skill.\n\n$ARGUMENTS`,
    }
    if (fields.description) command.description = fields.description
    commands[fields.name] = command
  }
  return commands
}

const skillCommands = loadSkills()

async function compoundEngineeringPlugin(input = {}, createClient) {
  const hooks = {
    config: async (config) => {
      config.skills = config.skills || {}
      config.skills.paths = config.skills.paths || []
      if (!config.skills.paths.includes(skillsDir)) {
        config.skills.paths.push(skillsDir)
      }
      config.command = config.command || {}
      for (const [name, cmd] of Object.entries(skillCommands)) {
        if (!(name in config.command)) {
          config.command[name] = cmd
        }
      }
    },
  }
  if (!input.serverUrl) return hooks

  const client = createClient({ baseUrl: input.serverUrl.href, directory: input.directory })
  const intents = createOpenCodeIntentStore(loadRoutingCatalog())
  const host = createOpenCodeSdkHost(client)
  const adapter = createOpenCodeRoutingAdapter({
    host,
    intents,
    resolver: createOpenCodeResolver({}),
  })

  hooks["chat.message"] = async ({ sessionID, messageID }, output) => {
    const part = output.parts.find((candidate) => candidate.type === "text")
    if (!part || typeof part.text !== "string") return
    const session = await host.getSession({ sessionID, directory: input.directory })
    const captured = intents.capture({
      sessionID,
      messageID: messageID ?? output.message.id,
      text: part.text,
      direct: !session.parentID,
      synthetic: part.synthetic === true,
      parentID: session.parentID,
      origin: "message",
    })
    part.text = captured.text
  }
  hooks["command.execute.before"] = async ({ command, sessionID, arguments: rawArguments }, output) => {
    const session = await host.getSession({ sessionID, directory: input.directory })
    const captured = intents.capture({
      sessionID,
      messageID: `command:${command}`,
      text: rawArguments,
      direct: !session.parentID,
      synthetic: false,
      parentID: session.parentID,
      origin: "command",
    })
    if (captured.text === rawArguments) return
    for (const part of output.parts) {
      if (part.type === "text" && typeof part.text === "string") {
        part.text = part.text.replace(rawArguments, captured.text)
      }
    }
    const commandText = output.parts.find((part) => part.type === "text" && typeof part.text === "string")
    if (commandText) intents.armCommand(sessionID, commandText.text)
  }
  hooks.event = async ({ event }) => {
    const sessionID = event.properties?.info?.id ?? event.properties?.sessionID
    if (typeof sessionID !== "string") return
    if (event.type === "session.deleted") {
      adapter.noteSessionDeleted(sessionID)
      await adapter.releaseDeletedSession(sessionID)
    }
    if (event.type === "session.idle") await adapter.releaseCompletedSession(sessionID)
  }
  hooks.tool = {
    ce_task_prepare: tool({
      description: "Freeze one already-selected Compound Engineering OpenCode worker wave and return an opaque host handle.",
      args: {
        role: tool.schema.string().describe("Stable CE dispatch role shared by the selected wave"),
        instances: tool.schema.array(tool.schema.string()).min(1).describe("Stable selected worker instance IDs"),
      },
      async execute(args, context) {
        const prepared = await adapter.prepare({
          sessionID: context.sessionID,
          directory: context.directory,
          role: args.role,
          instances: args.instances,
          signal: context.abort,
        })
        return {
          title: `CE prepared wave: ${args.role}`,
          output: JSON.stringify({
            kind: prepared.kind,
            routing_handle: prepared.handle,
            instances: prepared.instances,
            ...(prepared.comparison ? { external_comparison: prepared.comparison } : {}),
          }),
          metadata: {
            kind: prepared.kind,
            routing_handle: prepared.handle,
            instances: prepared.instances,
            ...(prepared.comparison ? { external_comparison: prepared.comparison } : {}),
          },
        }
      },
    }),
    ce_task: tool({
      description: "Run one already-selected Compound Engineering generic subagent through the OpenCode routing boundary.",
      args: {
        role: tool.schema.string().describe("Stable CE dispatch role"),
        instance: tool.schema.string().optional().describe("Stable selected worker instance ID"),
        routing_handle: tool.schema.string().optional().describe("Opaque handle returned by ce_task_prepare"),
        description: tool.schema.string().describe("Existing task description"),
        prompt: tool.schema.string().describe("Unchanged CE worker prompt"),
      },
      async execute(args, context) {
        const result = await adapter.execute({
          sessionID: context.sessionID,
          callID: randomUUID(),
          instanceID: args.instance,
          routingHandle: args.routing_handle,
          requirePreparation: true,
          directory: context.directory,
          role: args.role,
          description: args.description,
          prompt: args.prompt,
          signal: context.abort,
          authorizeTask: () => context.ask({
            permission: "task",
            patterns: ["general"],
            always: ["*"],
            metadata: {
              description: args.description,
              subagent_type: "general",
            },
          }),
        })
        if (result.kind === "native") {
          return {
            title: "CE native task required",
            output: "Use the native Task tool with the exact built-in arguments; no routed OpenCode worker was started.",
            metadata: { kind: result.kind, receipt: result.receipt },
          }
        }
        if (result.kind === "mixed_adapter_blocked") {
          return {
            title: "CE mixed-adapter continuation blocked",
            output: result.message,
            metadata: { kind: result.kind, code: result.code },
          }
        }
        return {
          title: `CE routed task: ${args.role}`,
          output: result.output,
          metadata: { receipt: result.receipt },
        }
      },
    }),
  }
  return hooks
}

export function createCompoundEngineeringPlugin({ createClient = createOpencodeClient } = {}) {
  return (input) => compoundEngineeringPlugin(input, createClient)
}

export const CompoundEngineeringPlugin = createCompoundEngineeringPlugin()

export default CompoundEngineeringPlugin
