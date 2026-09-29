/**
 * Multi-turn cells: the host asks, a simulated user answers, and the next turn
 * resumes the same host session. Only hosts with a scriptable resume are
 * supported; the simulated user is a separate `claude -p` call that never sees
 * the skill, only its persona and the conversation.
 */
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import type { Host } from "./hosts"

export const CONVERSE_HOSTS: Host[] = ["claude", "codex"]

export type Turn = { role: "agent" | "user"; text: string }

export const USER_DONE = "<<NO_REPLY>>"

export type ConversationEnd = "max-turns" | "timeout" | "host-error" | "user-done" | "user-sim-error"

export function formatTranscript(turns: Turn[], userLabel: string): string {
  return turns.map((t) => `${t.role === "agent" ? "ASSISTANT" : userLabel}:\n${t.text}`).join("\n\n")
}

export function hostTurnArgv(
  host: Host,
  opts: { first: boolean; sessionId: string; message: string; cwd: string; lastMessageFile: string },
): string[] {
  if (host === "claude") {
    // AskUserQuestion cannot reach a person in print mode; removing it makes the
    // skill ask in chat and end its turn, which is the path this mode can answer.
    const session = opts.first ? ["--session-id", opts.sessionId] : ["--resume", opts.sessionId]
    return [
      "claude", "-p", opts.message, ...session,
      "--dangerously-skip-permissions", "--disallowedTools", "AskUserQuestion", "--output-format", "text",
    ]
  }
  if (host === "codex") {
    const common = ["--dangerously-bypass-approvals-and-sandbox", "--skip-git-repo-check", "-o", opts.lastMessageFile]
    // Resume without an id picks the newest session recorded for this cwd; every
    // host runs in its own workspace, so that is this conversation.
    return opts.first
      ? ["codex", "exec", ...common, "-C", opts.cwd, opts.message]
      : ["codex", "exec", "resume", "--last", ...common, opts.message]
  }
  throw new Error(`--persona supports ${CONVERSE_HOSTS.join(", ")} only, not ${host}`)
}

export function userSimPrompt(persona: string, turns: Turn[]): string {
  const transcript = formatTranscript(turns, "YOU")
  return [
    "You are role-playing the user in a conversation with a software assistant. Stay in character.",
    "",
    "Your persona:",
    persona.trim(),
    "",
    "Conversation so far:",
    transcript,
    "",
    "Write only your next reply to the assistant's last message, as this user would type it: short, plain, no role labels.",
    "Answer from your persona. If the persona does not settle a question, answer as this user plausibly would or say it's the assistant's call.",
    "Do not bring up anything your persona says you will not volunteer unless the assistant's message raises that topic.",
    "If the choice is a numbered or lettered list, you may answer with the option's number or letter.",
    "Your part ends once the assistant has delivered what you asked for (a written document, plan, or summary). After that, do not choose a next step such as planning, building, reviewing, or shipping, even if it is offered as a numbered option.",
    `When your part has ended, or the assistant's last message asks you nothing, output exactly ${USER_DONE}`,
  ].join("\n")
}

export function simReplyOrDone(raw: string): string | null {
  const text = raw.trim()
  if (!text || text.includes(USER_DONE)) return null
  return text
}

/** The simulated user gets no tools, extensions, or settings, so its reply rests on the persona and transcript alone. */
export function userSimArgv(prompt: string): string[] {
  return [
    "claude", "-p", prompt, "--model", "sonnet", "--output-format", "text",
    "--tools", "", "--strict-mcp-config", "--setting-sources", "", "--disable-slash-commands", "--no-session-persistence",
  ]
}

/** The simulated user's reply (null when it has nothing to say), bounded by what is left of the cell deadline. */
export function runUserSim(
  persona: string, turns: Turn[], env: NodeJS.ProcessEnv, remainingMs: number,
): { reply: string | null; failed: boolean; timedOut: boolean; error: string } {
  const timeout = Math.min(300_000, remainingMs)
  if (timeout <= 0) return { reply: null, failed: false, timedOut: true, error: "" }
  const [bin, ...args] = userSimArgv(userSimPrompt(persona, turns))
  // An empty scratch directory keeps the cell's skill and workspace out of reach.
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "ce-user-sim-"))
  let sim
  try {
    sim = spawnSync(bin, args, { cwd, env, encoding: "utf8", timeout, maxBuffer: 1 << 20, stdio: ["ignore", "pipe", "pipe"] })
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true })
  }
  if (sim.error && (sim.error as NodeJS.ErrnoException).code === "ETIMEDOUT") {
    return { reply: null, failed: false, timedOut: true, error: "" }
  }
  if (sim.status !== 0) {
    return { reply: null, failed: true, timedOut: false, error: String(sim.error ?? sim.stderr).slice(0, 500) }
  }
  return { reply: simReplyOrDone(sim.stdout), failed: false, timedOut: false, error: "" }
}
