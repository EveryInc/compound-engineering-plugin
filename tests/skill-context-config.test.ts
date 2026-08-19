import { execFileSync } from "child_process"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs"
import { tmpdir } from "os"
import path from "path"
import { afterEach, describe, expect, test } from "bun:test"

// F1: context.mjs surfaces active model/engine config keys as a
// `RESOLVED_CE_CONFIG:` line at the top of every skill run. The parity test
// proves the 15 copies are byte-identical; this test proves the reader's
// behavior. Run the script with cwd set to a throwaway fixture repo — never
// this checkout — so the repo's own (absent) config cannot leak in.
const SCRIPT = path.join(process.cwd(), "skills", "ce-plan", "scripts", "context.mjs")

const cleanups: string[] = []
afterEach(() => {
  for (const dir of cleanups.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function makeRepo(files: Record<string, string> = {}): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ce-ctx-cfg-"))
  cleanups.push(dir)
  execFileSync("git", ["init", "-q"], { cwd: dir })
  for (const [rel, contents] of Object.entries(files)) {
    const full = path.join(dir, rel)
    mkdirSync(path.dirname(full), { recursive: true })
    writeFileSync(full, contents)
  }
  return dir
}

function runIn(cwd: string): string {
  return execFileSync(process.execPath, [SCRIPT], { cwd, encoding: "utf8" })
}

function ceConfigLine(out: string): string | undefined {
  return out.split("\n").find((l) => l.startsWith("RESOLVED_CE_CONFIG:"))
}

describe("context.mjs resolved CE config surface", () => {
  test("an active key in config.yaml is surfaced", () => {
    const out = runIn(makeRepo({ ".compound-engineering/config.yaml": "plan_model: fable\n" }))
    expect(ceConfigLine(out)).toBe("RESOLVED_CE_CONFIG: plan_model=fable")
  })

  test("a #-commented key is not surfaced", () => {
    const out = runIn(makeRepo({ ".compound-engineering/config.yaml": "# plan_model: fable\n" }))
    expect(ceConfigLine(out)).toBeUndefined()
  })

  test("config.local.yaml overrides config.yaml", () => {
    const out = runIn(
      makeRepo({
        ".compound-engineering/config.local.yaml": "plan_model: fable\n",
        ".compound-engineering/config.yaml": "plan_model: opus\n",
      }),
    )
    expect(ceConfigLine(out)).toBe("RESOLVED_CE_CONFIG: plan_model=fable")
  })

  test("multiple active keys all appear on the one line", () => {
    const out = runIn(
      makeRepo({
        ".compound-engineering/config.yaml": "plan_model: fable\ncross_model_peer: codex\n",
      }),
    )
    const line = ceConfigLine(out)
    expect(line).toContain("plan_model=fable")
    expect(line).toContain("cross_model_peer=codex")
  })

  test("no .compound-engineering config files -> silent (no line)", () => {
    const out = runIn(makeRepo())
    expect(ceConfigLine(out)).toBeUndefined()
    // The rest of the context still emits normally.
    expect(out).toContain("RESOLVED_CONTEXT:")
    expect(out.trim().endsWith("CE_CONTEXT_END")).toBe(true)
  })

  test("outside any git repo -> silent, no crash", () => {
    // tmpdir() is not under a git repo, so `git rev-parse --show-toplevel` fails.
    const bare = mkdtempSync(path.join(tmpdir(), "ce-ctx-nogit-"))
    cleanups.push(bare)
    const out = runIn(bare)
    expect(ceConfigLine(out)).toBeUndefined()
    expect(out.trim().endsWith("CE_CONTEXT_END")).toBe(true)
  })

  test("a quoted value is unquoted", () => {
    const out = runIn(makeRepo({ ".compound-engineering/config.yaml": 'plan_model: "fable"\n' }))
    expect(ceConfigLine(out)).toBe("RESOLVED_CE_CONFIG: plan_model=fable")
  })

  test("an inline trailing comment is stripped from the value", () => {
    // The [^#\n]+ capture must stop at an inline '#'; a regression that dropped
    // '#' from the exclusion would leak the comment and pass every other case.
    const out = runIn(makeRepo({ ".compound-engineering/config.yaml": "plan_model: fable # note\n" }))
    expect(ceConfigLine(out)).toBe("RESOLVED_CE_CONFIG: plan_model=fable")
  })

  test("an explicitly-empty value is treated as unset (not surfaced)", () => {
    const out = runIn(makeRepo({ ".compound-engineering/config.yaml": 'plan_model: ""\n' }))
    expect(ceConfigLine(out)).toBeUndefined()
  })

  test("a CRLF line ending does not leak into the value", () => {
    // trim() must run before the closing-quote strip, or a Windows checkout's
    // trailing \r survives inside a quoted value.
    const out = runIn(makeRepo({ ".compound-engineering/config.yaml": 'plan_model: "fable"\r\n' }))
    expect(ceConfigLine(out)).toBe("RESOLVED_CE_CONFIG: plan_model=fable")
  })
})
