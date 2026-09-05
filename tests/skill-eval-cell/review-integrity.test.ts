import { test } from "bun:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { valueHash } from "./provenance"

// Exercise collection and fresh-process reassessment, not a second hash allowlist.
// The fake executable is first on PATH; no real provider or credentials are used.
function fixture(work: (ctx: ReturnType<typeof setup>) => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ce-review-integrity-"))
  try { work(setup(root)) } finally { fs.rmSync(root, { recursive: true, force: true }) }
}
function setup(root: string) {
  const repo = path.join(root, "repo"), dir = path.join(repo, "tests/skill-eval-cell")
  const bin = path.join(root, "bin"), out = path.join(root, "pack")
  fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(bin)
  for (const file of ["run.ts", "pack.ts", "regrade.ts", "provenance.ts", "grade.ts", "hosts.ts", "extract.ts", "cli.ts", "path-shim.ts"]) {
    fs.copyFileSync(path.join(import.meta.dir, file), path.join(dir, file))
  }
  fs.mkdirSync(path.join(repo, "skills/fixture"), { recursive: true })
  fs.writeFileSync(path.join(repo, "skills/fixture/SKILL.md"), "fixture skill")
  fs.mkdirSync(path.join(repo, "fixture"))
  fs.writeFileSync(path.join(repo, "fixture/context.txt"), "original")
  const scenario = {
    id: "fixture/pass", skill: "fixture", cohort: "untouched", key_behavior: "judgment",
    read_only: true, task: "task", fixture: "fixture", grade: { must_include: ["proof"], actions: "none" },
  }
  const catalog = path.join(dir, "catalog.ts")
  const setCatalog = (rows: unknown[]) => fs.writeFileSync(catalog, `
export const POST_SWEEP_REF = "WORKTREE";
export const PRE_SWEEP_REF = "HEAD";
export const rows = ${JSON.stringify(rows)};
export const scenariosMatching = () => rows;
export const scenarioById = id => rows.find(row => row.id === id);
`)
  setCatalog([scenario])
  fs.writeFileSync(path.join(bin, "codex"), `#!/bin/sh
if [ "$1" = "--version" ]; then echo fixture-codex; exit 0; fi
printf 'proof\\nFILES_READ: SKILL.md\\nACTIONS: none\\nDELEGATES_DISPATCHED: none\\n'
`, { mode: 0o755 })
  const call = (script: string, args: string[]) => spawnSync(process.execPath, [path.join(dir, script), ...args], {
    cwd: repo, encoding: "utf8", timeout: 20_000,
    env: { ...process.env, PATH: `${bin}${path.delimiter}${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ""}` },
  })
  const collect = () => call("pack.ts", ["--hosts", "codex", "--arm", "post", "--out", out])
  const source = path.join(out, "pack.json")
  const readPack = () => JSON.parse(fs.readFileSync(source, "utf8"))
  const savePack = (pack: unknown) => fs.writeFileSync(source, JSON.stringify(pack))
  const regrade = (mode: "current" | "original" = "current") => call("regrade.ts", [source, "--mode", mode])
  const reports = () => fs.readdirSync(out).filter(name => name.includes(".regrade-"))
  return { repo, dir, out, scenario, setCatalog, collect, source, readPack, savePack, regrade, reports }
}
function originalGrade(info: any) { return { grades: info.grades, ok: info.ok, pointer_ok: info.pointer_ok } }
function collected(ctx: ReturnType<typeof setup>) {
  const result = ctx.collect()
  assert.equal(result.status, 0, result.stderr)
  return ctx.readPack().scenarios["fixture/pass"].arms.post
}

if (process.platform !== "win32") {
  test("collection seals exactly the original grade object", () => fixture(ctx => {
    const info = collected(ctx)
    assert.equal(info.grade_result_sha256, valueHash(originalGrade(info)))
  }), 30_000)

  for (const file of ["regrade.ts", "provenance.ts", "extract.ts"]) {
    test(`original mode rejects drift in ${file}; current assessment labels it`, () => fixture(ctx => {
      collected(ctx)
      const before = fs.readFileSync(ctx.source)
      fs.appendFileSync(path.join(ctx.dir, file), "\n// independent runtime drift probe\n")
      const original = ctx.regrade("original")
      assert.equal(original.status, 2, original.stderr)
      assert.match(original.stderr, /grader changed/)
      assert.deepEqual(ctx.reports(), [])
      const current = ctx.regrade()
      assert.equal(current.status, 0, current.stderr)
      assert.equal(JSON.parse(fs.readFileSync(current.stdout.trim(), "utf8")).grader_changed, true)
      assert.deepEqual(fs.readFileSync(ctx.source), before)
    }), 30_000)
  }

  for (const field of ["grades", "ok", "pointer_ok", "grade_result_sha256"]) {
    test(`both modes reject corrupted or missing original ${field}`, () => fixture(ctx => {
      collected(ctx)
      const pack = ctx.readPack(), info = pack.scenarios["fixture/pass"].arms.post
      if (field === "grades") info.grades[0].reasons.push("edited historical reason")
      else if (field === "grade_result_sha256") delete info.grade_result_sha256
      else info[field] = !info[field]
      ctx.savePack(pack)
      const before = fs.readFileSync(ctx.source)
      for (const mode of ["current", "original"] as const) {
        const result = ctx.regrade(mode)
        assert.equal(result.status, 2, result.stderr)
        assert.match(result.stderr, /original grade missing or changed/)
      }
      assert.deepEqual(ctx.reports(), [])
      assert.deepEqual(fs.readFileSync(ctx.source), before)
    }), 30_000)
  }

  for (const reason of ["removed", "task", "controls", "fixture", "observations"]) {
    for (const passing of [true, false]) {
      test(`unassessable ${reason} retains original ${passing ? "pass" : "failure"}`, () => fixture(ctx => {
        const scenario = { ...ctx.scenario, grade: { ...ctx.scenario.grade, must_include: [passing ? "proof" : "absent"] } }
        ctx.setCatalog([scenario])
        const result = ctx.collect()
        assert.equal(result.status, passing ? 0 : 1, result.stderr)
        const info = ctx.readPack().scenarios[scenario.id].arms.post
        const before = fs.readFileSync(ctx.source)
        if (reason === "removed") ctx.setCatalog([])
        if (reason === "task") ctx.setCatalog([{ ...scenario, task: "different" }])
        if (reason === "controls") ctx.setCatalog([{ ...scenario, read_only: false }])
        if (reason === "fixture") fs.writeFileSync(path.join(ctx.repo, "fixture/context.txt"), "changed")
        if (reason === "observations") ctx.setCatalog([{ ...scenario, grade: { ...scenario.grade, git: "clean" } }])
        const current = ctx.regrade()
        assert.equal(current.status, 1, current.stderr)
        const arm = JSON.parse(fs.readFileSync(current.stdout.trim(), "utf8")).scenarios[scenario.id].arms.post
        assert.equal(arm.status, "not-assessable")
        assert.deepEqual(arm.original_grade, originalGrade(info))
        assert.equal(arm.original_grade_sha256, info.grade_result_sha256)
        assert.equal(ctx.regrade("original").status, passing ? 0 : 1)
        assert.deepEqual(fs.readFileSync(ctx.source), before)
      }), 30_000)
    }
  }

  test("a rubric-only edit remains assessable and never replaces the historical grade", () => fixture(ctx => {
    const info = collected(ctx), before = fs.readFileSync(ctx.source)
    ctx.setCatalog([{ ...ctx.scenario, grade: { must_include: ["not in output"] } }])
    const current = ctx.regrade()
    assert.equal(current.status, 1, current.stderr)
    const report = JSON.parse(fs.readFileSync(current.stdout.trim(), "utf8"))
    assert.equal(report.grader_changed, false)
    assert.deepEqual(report.scenarios[ctx.scenario.id].arms.post.original_grade, originalGrade(info))
    assert.equal(ctx.regrade("original").status, 0)
    assert.deepEqual(fs.readFileSync(ctx.source), before)
  }), 30_000)

  test("a collection failure does not fabricate an original grade", () => fixture(ctx => {
    ctx.setCatalog([{ ...ctx.scenario, skill: "missing" }])
    assert.equal(ctx.collect().status, 1)
    const result = ctx.regrade()
    assert.equal(result.status, 1, result.stderr)
    const arm = JSON.parse(fs.readFileSync(result.stdout.trim(), "utf8")).scenarios[ctx.scenario.id].arms.post
    assert.equal(arm.status, "not-regraded")
    assert.equal(Object.hasOwn(arm, "original_grade"), false)
  }), 30_000)
}
