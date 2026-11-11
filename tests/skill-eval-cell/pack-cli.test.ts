import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import path from "node:path"

const PACK = path.join(import.meta.dir, "pack.ts")

function pack(...args: string[]) {
  return spawnSync("bun", [PACK, ...args], { encoding: "utf8", timeout: 20000 })
}

// Every case here must return before a cell is spawned: a cell is a billed host CLI run.
describe("skill-eval pack CLI", () => {
  test("--help prints usage and runs nothing", () => {
    const r = pack("--help")
    expect(r.status).toBe(0)
    expect(r.stdout).toContain("usage: bun run test:skill-eval-pack")
    expect(r.stdout).not.toContain("running ")
  })

  test("an unknown flag is refused instead of selecting the whole catalog", () => {
    const r = pack("--hlep")
    expect(r.status).toBe(2)
    expect(r.stderr).toContain("unknown argument: --hlep")
  })

  test("a value flag with no value is refused instead of taking its default", () => {
    for (const args of [["--all", "--arm"], ["--all", "--hosts", "--arm", "post"]]) {
      const r = pack(...args)
      expect(r.status, args.join(" ")).toBe(2)
      expect(r.stderr).toContain("needs a value")
      expect(r.stdout).not.toContain("running ")
    }
  })

  test("no selector is refused; the whole catalog needs --all", () => {
    const r = pack("--arm", "post")
    expect(r.status).toBe(2)
    expect(r.stderr).toContain("pass --all")
  })
})
