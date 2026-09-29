import { describe, expect, test } from "bun:test"
import { USER_DONE, hostTurnArgv, runUserSim, simReplyOrDone, userSimArgv, userSimPrompt } from "./converse"

const base = { sessionId: "11111111-1111-4111-8111-111111111111", message: "hi", cwd: "/w", lastMessageFile: "/h/last.txt" }

describe("hostTurnArgv", () => {
  test("claude pins the session on the first turn and resumes it after", () => {
    const first = hostTurnArgv("claude", { ...base, first: true })
    expect(first.slice(0, 5)).toEqual(["claude", "-p", "hi", "--session-id", base.sessionId])
    expect(first[first.indexOf("--disallowedTools") + 1]).toBe("AskUserQuestion")
    const next = hostTurnArgv("claude", { ...base, first: false })
    expect(next.slice(3, 5)).toEqual(["--resume", base.sessionId])
  })

  test("codex starts in the workspace and resumes the newest session there", () => {
    const first = hostTurnArgv("codex", { ...base, first: true })
    expect(first.slice(0, 2)).toEqual(["codex", "exec"])
    expect(first).toContain("-C")
    expect(first.at(-1)).toBe("hi")
    const next = hostTurnArgv("codex", { ...base, first: false })
    expect(next.slice(0, 4)).toEqual(["codex", "exec", "resume", "--last"])
    expect(next).toContain(base.lastMessageFile)
  })

  test("hosts without a scriptable resume are rejected", () => {
    expect(() => hostTurnArgv("grok", { ...base, first: true })).toThrow(/claude, codex only/)
  })
})

describe("conversation control", () => {
  test("the simulated user can decline to reply", () => {
    expect(simReplyOrDone(`  ${USER_DONE}\n`)).toBeNull()
    expect(simReplyOrDone("")).toBeNull()
    expect(simReplyOrDone(" 2 ")).toBe("2")
  })

  test("the simulated user sees its persona and the latest assistant message", () => {
    const prompt = userSimPrompt("I run billing.", [{ role: "agent", text: "Which option?" }])
    expect(prompt).toContain("I run billing.")
    expect(prompt).toContain("ASSISTANT:\nWhich option?")
  })

  test("a spent cell deadline ends the conversation as a timeout without calling the simulated user", () => {
    expect(runUserSim("p", [], {}, 0)).toEqual({ reply: null, failed: false, timedOut: true, error: "" })
  })

  test("the simulated user runs without tools or machine-local customizations", () => {
    const argv = userSimArgv("reply")
    expect(argv[argv.indexOf("--tools") + 1]).toBe("")
    expect(argv).toContain("--safe-mode")
  })
})
