import { expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { gradeArm } from "./grade"
import type { Scenario } from "./catalog"
import { PACK_SCHEMA_VERSION, fingerprint, graderFingerprint, sealEvidence, sha256, valueHash, verifyEvidence, writeJSON } from "./provenance"
import { regradePack } from "./regrade"

function fixture(work: (ctx: ReturnType<typeof make>) => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ce-regrade-test-"))
  try { work(make(root)) } finally { fs.rmSync(root, { recursive: true, force: true }) }
}

function make(root: string) {
  const out = path.join(root, "case", "post")
  const hostDir = path.join(out, "hosts", "codex")
  const skillDir = path.join(out, "extract", "skills", "fixture")
  for (const dir of [skillDir, path.join(out, "workspace"), path.join(hostDir, "workspace")]) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), "fixture skill")
  fs.writeFileSync(path.join(out, "task.md"), "task")
  writeJSON(path.join(out, "summary.json"), { skill: "fixture", hosts_run: ["codex"] })
  writeJSON(path.join(out, "input-manifest.json"), {
    schema_version: 1, task_sha256: sha256("task"),
    skill: fingerprint(skillDir), initial_workspace: fingerprint(path.join(out, "workspace")),
  })
  fs.writeFileSync(path.join(hostDir, "stdout.txt"), "proof\nFILES_READ: SKILL.md\nACTIONS: none\nDELEGATES_DISPATCHED: none\n")
  for (const name of ["stderr.txt", "prompt.md", "git-status.txt", "git-head-files.txt"]) fs.writeFileSync(path.join(hostDir, name), "")
  writeJSON(path.join(hostDir, "argv.json"), ["fake-codex"])
  writeJSON(path.join(hostDir, "exit.json"), { exitCode: 0, timedOut: false })
  const evidence_sha256 = sealEvidence(out)
  const scenario: Scenario = {
    id: "not-in-live-catalog", skill: "fixture", cohort: "untouched", key_behavior: "judgment",
    read_only: true, why: "regression", pre_contract: "proof", task: "task",
    grade: { must_include: ["proof"], actions: "none", delegates: "none" },
  }
  const initialGrade = gradeArm({ out, scenario, arm: "post" })
  const pack = {
    schema_version: PACK_SCHEMA_VERSION, grader: graderFingerprint(),
    scenarios: { [scenario.id]: {
      scenario_snapshot: scenario, scenario_sha256: valueHash(scenario),
      arms: { post: {
        ...initialGrade, status: "graded", grade_result_sha256: valueHash(initialGrade),
        out: "/obsolete/location", out_relative: "case/post", evidence_sha256,
      } },
    } },
  }
  const packPath = path.join(root, "pack.json")
  const save = () => writeJSON(packPath, pack)
  const reseal = () => {
    fs.unlinkSync(path.join(out, "evidence-manifest.json"))
    pack.scenarios[scenario.id].arms.post.evidence_sha256 = sealEvidence(out)
    save()
  }
  save()
  return { root, out, hostDir, pack, scenario, packPath, save, reseal }
}

test("regrade uses archived criteria without a live catalog entry and preserves the source", () => fixture(({ packPath }) => {
  const before = fs.readFileSync(packPath)
  const result = regradePack(packPath, "original")
  expect(result.ok).toBe(true)
  expect(result.reportPath).not.toBe(packPath)
  expect(fs.readFileSync(packPath)).toEqual(before)
  const report = JSON.parse(fs.readFileSync(result.reportPath, "utf8"))
  expect(report.mode).toBe("original")
  expect(report.grader_changed).toBe(false)
  expect(report.source_pack_sha256).toBe(sha256(before))
}))

test("default current mode does not fall back to archived criteria for an absent scenario", () => fixture(({ scenario, packPath }) => {
  const before = fs.readFileSync(packPath)
  const result = regradePack(packPath)
  const report = JSON.parse(fs.readFileSync(result.reportPath, "utf8"))
  expect(result.ok).toBe(false)
  expect(report.mode).toBe("current")
  expect(report.scenarios[scenario.id].used_grade).toBeNull()
  expect(report.scenarios[scenario.id].used_grade_sha256).toBeNull()
  expect(report.scenarios[scenario.id].arms.post).toMatchObject({
    status: "not-assessable", reason: "scenario is absent from the current catalog", ok: false,
  })
  expect(fs.readFileSync(packPath)).toEqual(before)
}))

test("invalid modes are refused without writing an assessment", () => fixture(({ root, packPath }) => {
  const before = fs.readFileSync(packPath)
  // Exercise the runtime boundary used by untyped callers.
  // @ts-expect-error invalid modes must also be rejected at runtime
  expect(() => regradePack(packPath, "unknown")).toThrow(/mode must be current or original/)
  expect(fs.readFileSync(packPath)).toEqual(before)
  expect(fs.readdirSync(root).filter((name) => name.includes(".regrade-"))).toEqual([])
}))

test("successive regrades produce distinct files", () => fixture(({ packPath }) => {
  expect(regradePack(packPath, "original").reportPath).not.toBe(regradePack(packPath, "original").reportPath)
}))

test("changed frozen criteria are rejected", () => fixture(({ pack, scenario, save, packPath }) => {
  pack.scenarios[scenario.id].scenario_snapshot.grade.must_include = ["not present"]
  save()
  expect(() => regradePack(packPath, "original")).toThrow(/scenario/)
}))

test("original grading refuses changed grader bytes", () => fixture(({ root, pack, save, packPath }) => {
  pack.grader.entries[0].sha256 = "a".repeat(64)
  pack.grader.sha256 = valueHash(pack.grader.entries)
  save()
  const before = fs.readFileSync(packPath)
  expect(() => regradePack(packPath, "original")).toThrow(/grader changed/)
  expect(fs.readFileSync(packPath)).toEqual(before)
  expect(fs.readdirSync(root).filter((name) => name.includes(".regrade-"))).toEqual([])
}))

test("changed stdout is detected before grading", () => fixture(({ hostDir, packPath }) => {
  fs.writeFileSync(path.join(hostDir, "stdout.txt"), "changed")
  expect(() => regradePack(packPath, "original")).toThrow(/evidence/)
}))

test("deleted exit evidence is not a vacuous pass", () => fixture(({ hostDir, packPath }) => {
  fs.unlinkSync(path.join(hostDir, "exit.json"))
  expect(() => regradePack(packPath, "original")).toThrow()
}))

test("added workspace files invalidate the evidence", () => fixture(({ hostDir, packPath }) => {
  fs.writeFileSync(path.join(hostDir, "workspace", "unexpected.txt"), "extra")
  expect(() => regradePack(packPath, "original")).toThrow(/evidence/)
}))

test("a relocated whole pack regrades without archived absolute paths", () => fixture(({ root }) => {
  const relocated = fs.mkdtempSync(path.join(os.tmpdir(), "ce-regrade-moved-"))
  try {
    fs.cpSync(root, relocated, { recursive: true })
    expect(regradePack(path.join(relocated, "pack.json"), "original").ok).toBe(true)
  } finally { fs.rmSync(relocated, { recursive: true, force: true }) }
}))

test("a collection error remains ungraded rather than a pass", () => fixture(({ pack, scenario, save, packPath }) => {
  pack.scenarios[scenario.id].arms.post.status = "collection-error"
  save()
  const result = regradePack(packPath, "original")
  expect(result.ok).toBe(false)
  expect(JSON.parse(fs.readFileSync(result.reportPath, "utf8")).scenarios[scenario.id].arms.post.status).toBe("not-regraded")
}))

test("an interrupted arm remains incomplete even without a cell directory", () => fixture(({ out, pack, scenario, save, packPath }) => {
  pack.scenarios[scenario.id].arms.post.status = "collecting"
  save()
  const before = fs.readFileSync(packPath)
  fs.rmSync(out, { recursive: true })
  const result = regradePack(packPath, "original")
  const report = JSON.parse(fs.readFileSync(result.reportPath, "utf8"))
  expect(result.ok).toBe(false)
  expect(report.scenarios[scenario.id].arms.post).toMatchObject({
    status: "not-regraded", original_status: "collecting", ok: false,
  })
  expect(fs.readFileSync(packPath)).toEqual(before)
}))

test("an absent required workspace file fails grading and preserves the original verdict", () => fixture(({ pack, scenario, save, packPath }) => {
  scenario.grade.workspace_contains = [{ path: "missing.txt", needle: "proof" }]
  pack.scenarios[scenario.id].scenario_sha256 = valueHash(scenario)
  save()
  const before = fs.readFileSync(packPath)
  const result = regradePack(packPath, "original")
  const report = JSON.parse(fs.readFileSync(result.reportPath, "utf8"))
  const arm = report.scenarios[scenario.id].arms.post
  expect(result.ok).toBe(false)
  expect(arm.status).toBe("regraded")
  expect(arm.grades[0].reasons).toContain('missing.txt does not contain "proof"')
  expect(arm.original_grade.ok).toBe(true)
  expect(fs.readFileSync(packPath)).toEqual(before)
}))

test("original mode preserves the historical grader's pass on empty Git observations", () => fixture(({ pack, scenario, save, packPath }) => {
  scenario.grade.git = "clean"
  pack.scenarios[scenario.id].scenario_sha256 = valueHash(scenario)
  save()
  const before = fs.readFileSync(packPath)
  const result = regradePack(packPath, "original")
  const arm = JSON.parse(fs.readFileSync(result.reportPath, "utf8")).scenarios[scenario.id].arms.post
  // Reproducing the original grade must preserve its observation gap.
  expect(result.ok).toBe(true)
  expect(arm.status).toBe("regraded")
  expect(arm.grades).toEqual(pack.scenarios[scenario.id].arms.post.grades)
  expect(fs.readFileSync(packPath)).toEqual(before)
}))

for (const configured of [false, true]) {
  test(`original mode preserves the historical pass with no command shim (configured: ${configured})`, () => fixture(({ pack, scenario, save, packPath }) => {
    scenario.shim_git_push = configured ? true : undefined
    scenario.grade.shim_log_must_not = ["git push"]
    pack.scenarios[scenario.id].scenario_sha256 = valueHash(scenario)
    save()
    const before = fs.readFileSync(packPath)
    const result = regradePack(packPath, "original")
    const arm = JSON.parse(fs.readFileSync(result.reportPath, "utf8")).scenarios[scenario.id].arms.post
    // Availability checks belong to current assessment, not historical reproduction.
    expect(result.ok).toBe(true)
    expect(arm.status).toBe("regraded")
    expect(arm.grades).toEqual(pack.scenarios[scenario.id].arms.post.grades)
    expect(fs.readFileSync(packPath)).toEqual(before)
  }))
}

test("an installed command shim without an invocation log proves no recorded push", () => fixture(({ hostDir, pack, scenario, reseal, packPath }) => {
  scenario.shim_git_push = true
  scenario.grade.shim_log_must_not = ["git push"]
  pack.scenarios[scenario.id].scenario_sha256 = valueHash(scenario)
  fs.mkdirSync(path.join(hostDir, ".bin"))
  fs.writeFileSync(path.join(hostDir, ".bin", "git"), "#!/bin/sh\nexit 1\n", { mode: 0o755 })
  reseal()
  const before = fs.readFileSync(packPath)
  const result = regradePack(packPath, "original")
  const arm = JSON.parse(fs.readFileSync(result.reportPath, "utf8")).scenarios[scenario.id].arms.post
  expect(result.ok).toBe(true)
  expect(arm.status).toBe("regraded")
  expect(arm.grades[0].reasons).toEqual([])
  expect(fs.readFileSync(packPath)).toEqual(before)
}))

test("a timeout is reproduced as a failed grade", () => fixture(({ hostDir, reseal, packPath }) => {
  writeJSON(path.join(hostDir, "exit.json"), { exitCode: null, timedOut: true })
  reseal()
  expect(regradePack(packPath, "original").ok).toBe(false)
}))

test("a nonzero host exit is reproduced as a failed grade", () => fixture(({ hostDir, reseal, packPath }) => {
  writeJSON(path.join(hostDir, "exit.json"), { exitCode: 7, timedOut: false })
  reseal()
  expect(regradePack(packPath, "original").ok).toBe(false)
}))

test("an empty recorded host set is rejected even if resealed", () => fixture(({ out, reseal, packPath }) => {
  writeJSON(path.join(out, "summary.json"), { skill: "fixture", hosts_run: [] })
  reseal()
  expect(() => regradePack(packPath, "original")).toThrow(/host/)
}))

test("recorded absolute paths cannot redirect the regrader", () => fixture(({ pack, scenario, save, packPath }) => {
  pack.scenarios[scenario.id].arms.post.out_relative = "../outside"
  save()
  expect(() => regradePack(packPath, "original")).toThrow(/relative/)
}))

test("unsealed changes to the initial skill cannot be laundered by resealing outputs", () => fixture(({ out, reseal, packPath }) => {
  fs.writeFileSync(path.join(out, "extract/skills/fixture/SKILL.md"), "changed")
  reseal()
  expect(() => regradePack(packPath, "original")).toThrow(/inputs/)
}))

test("frozen task and collected task must agree", () => fixture(({ pack, scenario, save, packPath }) => {
  scenario.task = "another task"
  pack.scenarios[scenario.id].scenario_sha256 = valueHash(scenario)
  save()
  expect(() => regradePack(packPath, "original")).toThrow(/task/)
}))

test("unsafe grading paths cannot read outside the evidence", () => fixture(({ pack, scenario, save, packPath }) => {
  scenario.grade.workspace_contains = [{ path: "../../../private", needle: "secret" }]
  pack.scenarios[scenario.id].scenario_sha256 = valueHash(scenario)
  save()
  expect(() => regradePack(packPath, "original")).toThrow(/unsafe/)
}))

test("excluded git contents cannot become historical grading evidence", () => fixture(({ hostDir, out, pack, scenario, save, packPath }) => {
  for (const relative of [".git/config", "nested/.git/config"]) {
    const file = path.join(hostDir, "workspace", relative)
    scenario.grade.workspace_contains = [{ path: relative, needle: "proof" }]
    pack.scenarios[scenario.id].scenario_sha256 = valueHash(scenario)
    save()
    // Excluded paths are invalid even if currently absent.
    expect(() => regradePack(packPath, "original")).toThrow(/unsealed workspace grade path/)
    if (relative === ".git/config") {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, "proof")
      verifyEvidence(out)
      expect(() => regradePack(packPath, "original")).toThrow(/unsealed workspace grade path/)
      fs.writeFileSync(file, "changed without changing the evidence hash")
      verifyEvidence(out)
      expect(() => regradePack(packPath, "original")).toThrow(/unsealed workspace grade path/)
    }
  }
}))

test("legacy packs are refused without modifying them", () => fixture(({ packPath }) => {
  writeJSON(packPath, { scenarios: {} })
  const before = fs.readFileSync(packPath)
  expect(() => regradePack(packPath, "original")).toThrow(/legacy/)
  expect(fs.readFileSync(packPath)).toEqual(before)
}))

if (process.platform !== "win32") {
  test("symlink evidence cannot escape fingerprint verification", () => fixture(({ hostDir, out, reseal, packPath }) => {
    fs.symlinkSync("/etc/passwd", path.join(hostDir, "workspace", "link"))
    reseal()
    expect(() => verifyEvidence(out)).toThrow(/symlink/)
    expect(() => regradePack(packPath, "original")).toThrow(/symlink/)
  }))
}
