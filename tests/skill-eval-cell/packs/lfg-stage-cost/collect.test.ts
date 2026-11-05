import { describe, expect, test } from "bun:test"
import { attribute, claudeThread, codexThread, dollars, type Thread } from "./collect"

const HOST = "/cell/hosts/claude"

function claudeAssistant(id: string, usage: Record<string, number>, content: unknown[]) {
  return { type: "assistant", message: { id, model: "claude-opus-5-5", usage, content } }
}
const read = (id: string, file: string) => ({ type: "tool_use", id, name: "Read", input: { file_path: file } })

describe("lfg stage-cost collector", () => {
  test("a Claude message repeated per content block is counted once", () => {
    const usage = { input_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 5 }
    const first = claudeAssistant("msg_1", usage, [read("tu_1", `${HOST}/skill/SKILL.md`)])
    const thread = claudeThread([first, first, claudeAssistant("msg_1", usage, [read("tu_1", `${HOST}/skill/SKILL.md`)])], () => undefined)
    expect(thread.turns).toHaveLength(1)
    expect(thread.turns[0].calls).toHaveLength(1)
    const rows = attribute(thread)
    expect(rows.reduce((s, r) => s + r.usage.input + r.usage.output, 0)).toBe(15)
  })

  test("a Codex subagent's tokens go to the stage that spawned it", () => {
    const usage = (input: number, output: number, id: string) => ({
      type: "token_usage_record",
      payload: { response_id: id, usage: { input_tokens: input, cached_input_tokens: 0, output_tokens: output } },
    })
    const call = (id: string, cmd: string) => ({ type: "response_item", payload: { type: "custom_tool_call", call_id: id, name: "exec", input: cmd } })
    const child = codexThread([{ type: "turn_context", payload: { model: "gpt-x" } }, usage(1000, 100, "c1")], () => undefined)
    const parent = codexThread(
      [
        { type: "turn_context", payload: { model: "gpt-x" } },
        call("a", "cat /cell/hosts/codex/skills/ce-code-review/SKILL.md"),
        usage(50, 5, "r1"),
        { type: "response_item", payload: { type: "function_call", call_id: "s1", name: "spawn_agent", arguments: "{}" } },
        { type: "response_item", payload: { type: "function_call_output", call_id: "s1", output: '{"task_name":"/root/reviewer"}' } },
        usage(60, 6, "r2"),
        usage(60, 6, "r2"),
        call("b", "cat /cell/hosts/codex/skills/ce-compound/SKILL.md"),
        usage(70, 7, "r3"),
      ],
      (name) => (name === "/root/reviewer" ? child : undefined),
    )
    expect(parent.turns).toHaveLength(3)
    const review = attribute(parent).find((r) => r.stage === "code-review")!
    expect(review.agents).toBe(1)
    expect(review.usage.input).toBe(60 + 70 + 1000)
    expect(review.dollars).toBeNull()
  })

  test("a log with no skill boundary is reported under unattributed", () => {
    const thread: Thread = {
      turns: [{ model: "claude-opus-5-5", usage: { input: 1e6, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, output: 0 }, calls: [{ text: '{"command":"ls"}' }] }],
      children: {},
    }
    const rows = attribute(thread)
    expect(rows.map((r) => r.stage)).toEqual(["unattributed"])
    expect(rows[0].dollars).toBeCloseTo(4)
  })

  test("ce-work's own simplify is a sub-row of work, and lfg's step-3 simplify is its own row", () => {
    const u = { input: 1, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, output: 0 }
    const turn = (file?: string) => ({ model: "claude-opus-5-5", usage: { ...u }, calls: file ? [{ text: JSON.stringify({ file_path: file }) }] : [] })
    const s = (name: string, file = "SKILL.md") => `${HOST}/skills/${name}/${file}`
    const thread: Thread = {
      turns: [
        turn(`${HOST}/skill/references/work-return.md`),
        turn(s("ce-work")),
        turn(s("ce-simplify-code")),
        turn(),
        turn(s("ce-work", "references/implementation-loop.md")),
        turn(`${HOST}/skill/references/review-followup.md`),
        turn(s("ce-simplify-code")),
        turn(),
      ],
      children: {},
    }
    const rows = Object.fromEntries(attribute(thread).map((r) => [r.stage, r.usage.input]))
    expect(rows).toEqual({ unattributed: 1, intake: 1, work: 3, "work > ce-simplify-code": 2, simplify: 1 })
  })

  test("Claude cache writes are priced by TTL", () => {
    const usage = { input: 0, cacheWrite5m: 1e6, cacheWrite1h: 1e6, cacheRead: 1e6, output: 0 }
    expect(dollars("claude-opus-5-5", usage)).toBeCloseTo(4 * 1.25 + 4 * 2 + 0.2)
    expect(dollars("gpt-6-astra", usage)).toBeNull()
  })
})
