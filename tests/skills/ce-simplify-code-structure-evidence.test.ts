import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

setDefaultTimeout(20_000)

const SCRIPT = path.join(import.meta.dir, "..", "..", "skills", "ce-simplify-code", "scripts", "structure-evidence.py")
const ENV = {
  PATH: process.env.PATH ?? "",
  HOME: os.tmpdir(),
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
}

let repo: string

function write(rel: string, text: string) {
  fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true })
  fs.writeFileSync(path.join(repo, rel), text)
}

function git(args: string[]) {
  const r = spawnSync("git", args, { cwd: repo, encoding: "utf8", env: ENV })
  if (r.status !== 0) throw new Error(r.stderr)
}

function commit(message: string, files: Record<string, string>) {
  for (const [rel, text] of Object.entries(files)) write(rel, text)
  git(["add", "-A"])
  git(["commit", "-qm", message])
}

function evidence(...scope: string[]) {
  const r = spawnSync("python3", [SCRIPT, ...scope], { cwd: repo, encoding: "utf8", env: ENV })
  expect(r.stderr).toBe("")
  expect(r.status).toBe(0)
  return JSON.parse(r.stdout)
}

type CoChange = { files: string[]; cross_directory: boolean }
const pair = (files: string[]) => files.join(" + ")
const pairNames = (out: { co_change: CoChange[] }) => out.co_change.map((p) => pair(p.files))

beforeAll(() => {
  repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ce-simplify-evidence-")))
  for (const args of [
    ["init", "-q", "-b", "main"],
    ["config", "user.name", "test"],
    ["config", "user.email", "test@example.test"],
    ["config", "commit.gpgsign", "false"],
  ]) git(args)

  commit("seed", {
    "tsconfig.json": '{\n  // comment\n  "compilerOptions": { "paths": { "@/*": ["./src/*"] }, },\n}\n',
    "src/core/limits.ts": 'import { PROMO } from "@/campaigns/promo"\nexport const MAX = PROMO\n',
    "src/campaigns/promo.ts": "export const PROMO = 1\n",
    "src/campaigns/promo.test.ts": 'import { PROMO } from "./promo"\n',
    "src/ui/banner.ts": 'import { PROMO } from "../campaigns/promo.js"\n',
    "worker/pkg/__init__.py": "",
    "worker/pkg/a.py": "from . import b\n",
    "worker/pkg/c.py": "from .b import thing\nfrom pkg import (  # names\n    a,\n)\n",
    "worker/pkg/b.py": "thing = 1\n",
    "worker/run.sh": "echo hi\n",
  })
  for (let i = 2; i <= 4; i++) {
    commit(`promo ${i}`, {
      "src/campaigns/promo.ts": `export const PROMO = ${i}\n`,
      "src/campaigns/promo.test.ts": `import { PROMO } from "./promo"\n// ${i}\n`,
      "src/ui/banner.ts": `import { PROMO } from "../campaigns/promo.js"\n// ${i}\n`,
    })
  }
  for (let i = 2; i <= 4; i++) commit(`b ${i}`, { "worker/pkg/b.py": `thing = ${i}\n` })
  for (let i = 1; i <= 3; i++) {
    commit(`service ${i}`, { "native/service.c": `int v = ${i};\n`, "native/service.h": `// ${i}\n` })
  }
  const bulk: Record<string, string> = {}
  for (let i = 0; i < 30; i++) bulk[`src/gen/f${i}.ts`] = "export {}\n"
  bulk["src/lone/x.ts"] = "export {}\n"
  bulk["src/lone/y.ts"] = "export {}\n"
  bulk["src/ui/banner.ts"] = 'import { PROMO } from "../campaigns/promo.js"\n// bulk\n'
  commit("bulk format", bulk)
  commit("bulk format again", Object.fromEntries(Object.keys(bulk).map((k) => [k, bulk[k] + "// again\n"])))
})

afterAll(() => {
  fs.rmSync(repo, { recursive: true, force: true })
})

describe("structure-evidence.py", () => {
  test("reports files that change together across directories, but not a file with its own test", () => {
    const out = evidence("src")
    const pairs = pairNames(out)
    expect(pairs).toContain(pair(["src/campaigns/promo.ts", "src/ui/banner.ts"]))
    expect(out.co_change.find((p: CoChange) => p.files.includes("src/ui/banner.ts")).cross_directory).toBe(true)
    expect(pairs).not.toContain(pair(["src/campaigns/promo.test.ts", "src/campaigns/promo.ts"]))
  })

  test("leaves bulk commits out of co-change pairs while still counting their changes", () => {
    const out = evidence("src")
    expect(out.bulk_commits_skipped_for_pairs).toBe(2)
    const pairs = pairNames(out)
    expect(pairs).not.toContain(pair(["src/gen/f0.ts", "src/ui/banner.ts"]))
    expect(out.most_changed.find((m: { file: string }) => m.file === "src/ui/banner.ts").changes).toBe(6)
  })

  test("treats a commit as bulk by every file it touched, not only those in the scope", () => {
    const out = evidence("src/lone")
    expect(out.bulk_commits_skipped_for_pairs).toBe(2)
    expect(out.co_change).toEqual([])
  })

  test("resolves tsconfig path aliases and reports a stable file importing a more-changed one", () => {
    const out = evidence("src")
    expect(out.imports_toward_more_changed).toContainEqual({
      importer: "src/core/limits.ts",
      imported: "src/campaigns/promo.ts",
      changes: [1, 4],
    })
  })

  test("parses Python relative imports and counts files it cannot parse", () => {
    const out = evidence("worker")
    expect(out.import_edges).toBe(3)
    expect(out.imports_not_parsed).toEqual({ ".sh": 1 })
    expect(out.files_in_scope).toBe(5)
  })

  test("resolves a submodule named in a Python from-import to its own file", () => {
    expect(evidence("worker").imports_toward_more_changed).toContainEqual({
      importer: "worker/pkg/a.py",
      imported: "worker/pkg/b.py",
      changes: [1, 4],
    })
  })

  test("counts changes to an imported file outside the scope", () => {
    expect(evidence("src/core").imports_toward_more_changed).toContainEqual({
      importer: "src/core/limits.ts",
      imported: "src/campaigns/promo.ts",
      changes: [1, 4],
    })
  })

  test("limits files to the scope", () => {
    const out = evidence("worker")
    expect(out.most_changed.every((m: { file: string }) => m.file.startsWith("worker/"))).toBe(true)
  })

  test("keeps same-stem source files apart when neither is a test", () => {
    expect(pairNames(evidence("native"))).toContain(pair(["native/service.c", "native/service.h"]))
  })

  test("reads an absolute scope path the same as a repository-relative one", () => {
    expect(evidence(path.join(repo, "worker"))).toEqual(evidence("worker"))
  })
})
