#!/usr/bin/env node
// Scripted ACP agent: newline-delimited JSON-RPC over stdio, no dependencies.
// Mode comes from argv[2], else ACP_STUB_MODE, else "end_turn":
//   end_turn    reply with ACP_STUB_TEXT (default "stub reply") and end the turn
//   permission  request permission for one edit, then reply and end the turn
//   error       answer session/prompt with a JSON-RPC error
//   hang        never answer session/prompt
//   cancel      wait for session/cancel, then answer with stopReason "cancelled"
//   models      advertise stub-model-a/stub-model-b, then behave like end_turn
import { createInterface } from "node:readline"

const mode = process.argv[2] || process.env.ACP_STUB_MODE || "end_turn"
const text = process.env.ACP_STUB_TEXT || "stub reply"
const SESSION_ID = "stub-session-1"

let nextId = 1000
const waiting = new Map()
let pendingPrompt = null

function send(message) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`)
}
function request(method, params) {
  const id = nextId++
  send({ id, method, params })
  return new Promise((resolve) => waiting.set(id, resolve))
}
function say(chunk) {
  send({
    method: "session/update",
    params: { sessionId: SESSION_ID, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: chunk } } },
  })
}

async function prompt(id) {
  if (mode === "error") {
    send({ id, error: { code: -32603, message: "stub agent failure" } })
    return
  }
  if (mode === "hang") return
  if (mode === "cancel") {
    pendingPrompt = id
    return
  }
  if (mode === "permission") {
    await request("session/request_permission", {
      sessionId: SESSION_ID,
      toolCall: { toolCallId: "stub-tool-1", title: "Edit stub.txt", kind: "edit", status: "pending" },
      options: [
        { optionId: "allow", name: "Allow", kind: "allow_once" },
        { optionId: "reject", name: "Reject", kind: "reject_once" },
      ],
    })
  }
  say(text)
  send({ id, result: { stopReason: "end_turn" } })
}

const models = {
  currentModelId: "stub-model-a",
  availableModels: [
    { modelId: "stub-model-a", name: "Stub Model A" },
    { modelId: "stub-model-b", name: "Stub Model B" },
  ],
}

createInterface({ input: process.stdin }).on("line", (line) => {
  if (!line.trim()) return
  const message = JSON.parse(line)
  if (message.method === undefined) {
    waiting.get(message.id)?.(message)
    waiting.delete(message.id)
    return
  }
  switch (message.method) {
    case "initialize":
      send({
        id: message.id,
        result: { protocolVersion: 1, agentCapabilities: { loadSession: false }, authMethods: [] },
      })
      break
    case "session/new":
      send({ id: message.id, result: { sessionId: SESSION_ID, ...(mode === "models" ? { models } : {}) } })
      break
    case "session/set_model":
    case "session/set_config_option":
      send({ id: message.id, result: {} })
      break
    case "session/prompt":
      void prompt(message.id)
      break
    case "session/cancel":
      if (pendingPrompt !== null) {
        send({ id: pendingPrompt, result: { stopReason: "cancelled" } })
        pendingPrompt = null
      }
      break
    default:
      if (message.id !== undefined) send({ id: message.id, error: { code: -32601, message: `stub: no ${message.method}` } })
  }
})
