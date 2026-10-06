import { afterAll, describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const BUNFIG = path.join(__dirname, "../bunfig.toml")
const roots: string[] = []
afterAll(() => roots.forEach((dir) => rmSync(dir, { recursive: true, force: true })))

function layout(withBunfig: boolean): string {
  const dir = mkdtempSync(path.join(tmpdir(), "bunfig-fixture-exclusion-"))
  roots.push(dir)
  mkdirSync(path.join(dir, "tests/skill-eval-cell/fixtures/x"), { recursive: true })
  writeFileSync(path.join(dir, "tests/pass.test.ts"), `import { test, expect } from "bun:test"\ntest("ok", () => expect(1).toBe(1))\n`)
  writeFileSync(
    path.join(dir, "tests/skill-eval-cell/fixtures/x/fail.test.ts"),
    `import { test } from "bun:test"\ntest("fixture ran", () => { throw new Error("fixture ran") })\n`,
  )
  if (withBunfig) copyFileSync(BUNFIG, path.join(dir, "bunfig.toml"))
  return dir
}

function bunTest(dir: string, args: string[] = []) {
  return spawnSync(process.execPath, ["test", ...args], { cwd: dir, encoding: "utf8", timeout: 60_000 })
}

describe("bunfig.toml excludes skill-eval-cell fixtures from test discovery", () => {
  for (const args of [[], ["--parallel"]]) {
    test(`skips the fixture test with the repo bunfig (${args.join(" ") || "serial"})`, () => {
      const r = bunTest(layout(true), args)
      const out = r.stdout + r.stderr
      expect(r.status).toBe(0)
      expect(out).not.toContain("fixture ran")
      expect(out).toContain("1 pass")
    }, 90_000)
  }

  test("the same layout fails without the bunfig", () => {
    const r = bunTest(layout(false))
    expect(r.status).not.toBe(0)
    expect(r.stdout + r.stderr).toContain("fixture ran")
  }, 90_000)
})
