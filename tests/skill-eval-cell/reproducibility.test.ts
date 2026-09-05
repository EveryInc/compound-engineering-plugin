import { test } from "bun:test"
import assert from "node:assert/strict"
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
  const pack = {
    schema_version: PACK_SCHEMA_VERSION, grader: graderFingerprint(),
    scenarios: { [scenario.id]: {
      scenario_snapshot: scenario, scenario_sha256: valueHash(scenario),
      arms: { post: {
        ...gradeArm({ out, scenario, arm: "post" }), status: "graded",
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
  const result = regradePack(packPath)
  assert.equal(result.ok, true)
  assert.notEqual(result.reportPath, packPath)
  assert.deepEqual(fs.readFileSync(packPath), before)
  const report = JSON.parse(fs.readFileSync(result.reportPath, "utf8"))
  assert.equal(report.assessment, "original-grader")
  assert.equal(report.source_pack_sha256, sha256(before))
}))

test("successive regrades produce distinct files", () => fixture(({ packPath }) => {
  assert.notEqual(regradePack(packPath).reportPath, regradePack(packPath).reportPath)
}))

test("changed frozen criteria are rejected", () => fixture(({ pack, scenario, save, packPath }) => {
  pack.scenarios[scenario.id].scenario_snapshot.grade.must_include = ["not present"]
  save()
  assert.throws(() => regradePack(packPath), /scenario/)
}))

test("changed grader needs explicit consent and gets a distinct assessment", () => fixture(({ pack, save, packPath }) => {
  pack.grader.entries[0].sha256 = "a".repeat(64)
  pack.grader.sha256 = valueHash(pack.grader.entries)
  save()
  assert.throws(() => regradePack(packPath), /grader changed/)
  const result = regradePack(packPath, true)
  assert.equal(JSON.parse(fs.readFileSync(result.reportPath, "utf8")).assessment, "changed-grader")
}))

test("changed stdout is detected before grading", () => fixture(({ hostDir, packPath }) => {
  fs.writeFileSync(path.join(hostDir, "stdout.txt"), "changed")
  assert.throws(() => regradePack(packPath), /evidence/)
}))

test("deleted exit evidence is not a vacuous pass", () => fixture(({ hostDir, packPath }) => {
  fs.unlinkSync(path.join(hostDir, "exit.json"))
  assert.throws(() => regradePack(packPath))
}))

test("added workspace files invalidate the evidence", () => fixture(({ hostDir, packPath }) => {
  fs.writeFileSync(path.join(hostDir, "workspace", "unexpected.txt"), "extra")
  assert.throws(() => regradePack(packPath), /evidence/)
}))

test("a relocated whole pack regrades without archived absolute paths", () => fixture(({ root }) => {
  const relocated = fs.mkdtempSync(path.join(os.tmpdir(), "ce-regrade-moved-"))
  try {
    fs.cpSync(root, relocated, { recursive: true })
    assert.equal(regradePack(path.join(relocated, "pack.json")).ok, true)
  } finally { fs.rmSync(relocated, { recursive: true, force: true }) }
}))

test("a collection error remains ungraded rather than a pass", () => fixture(({ pack, scenario, save, packPath }) => {
  pack.scenarios[scenario.id].arms.post.status = "collection-error"
  save()
  const result = regradePack(packPath)
  assert.equal(result.ok, false)
  assert.equal(JSON.parse(fs.readFileSync(result.reportPath, "utf8")).scenarios[scenario.id].arms.post.status, "not-regraded")
}))

test("a timeout is reproduced as a failed grade", () => fixture(({ hostDir, reseal, packPath }) => {
  writeJSON(path.join(hostDir, "exit.json"), { exitCode: null, timedOut: true })
  reseal()
  assert.equal(regradePack(packPath).ok, false)
}))

test("a nonzero host exit is reproduced as a failed grade", () => fixture(({ hostDir, reseal, packPath }) => {
  writeJSON(path.join(hostDir, "exit.json"), { exitCode: 7, timedOut: false })
  reseal()
  assert.equal(regradePack(packPath).ok, false)
}))

test("an empty recorded host set is rejected even if resealed", () => fixture(({ out, reseal, packPath }) => {
  writeJSON(path.join(out, "summary.json"), { skill: "fixture", hosts_run: [] })
  reseal()
  assert.throws(() => regradePack(packPath), /host/)
}))

test("recorded absolute paths cannot redirect the regrader", () => fixture(({ pack, scenario, save, packPath }) => {
  pack.scenarios[scenario.id].arms.post.out_relative = "../outside"
  save()
  assert.throws(() => regradePack(packPath), /relative/)
}))

test("unsealed changes to the initial skill cannot be laundered by resealing outputs", () => fixture(({ out, reseal, packPath }) => {
  fs.writeFileSync(path.join(out, "extract/skills/fixture/SKILL.md"), "changed")
  reseal()
  assert.throws(() => regradePack(packPath), /inputs/)
}))

test("frozen task and collected task must agree", () => fixture(({ pack, scenario, save, packPath }) => {
  scenario.task = "another task"
  pack.scenarios[scenario.id].scenario_sha256 = valueHash(scenario)
  save()
  assert.throws(() => regradePack(packPath), /task/)
}))

test("unsafe grading paths cannot read outside the evidence", () => fixture(({ pack, scenario, save, packPath }) => {
  scenario.grade.workspace_contains = [{ path: "../../../private", needle: "secret" }]
  pack.scenarios[scenario.id].scenario_sha256 = valueHash(scenario)
  save()
  assert.throws(() => regradePack(packPath), /unsafe/)
}))

test("excluded git contents cannot become historical grading evidence", () => fixture(({ hostDir, out, pack, scenario, save, packPath }) => {
  for (const relative of [".git/config", "nested/.git/config"]) {
    const file = path.join(hostDir, "workspace", relative)
    scenario.grade.workspace_contains = [{ path: relative, needle: "proof" }]
    pack.scenarios[scenario.id].scenario_sha256 = valueHash(scenario)
    save()
    // Excluded paths are invalid even if currently absent.
    assert.throws(() => regradePack(packPath), /unsealed workspace grade path/)
    if (relative === ".git/config") {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, "proof")
      verifyEvidence(out)
      assert.throws(() => regradePack(packPath), /unsealed workspace grade path/)
      fs.writeFileSync(file, "changed without changing the evidence hash")
      verifyEvidence(out)
      assert.throws(() => regradePack(packPath), /unsealed workspace grade path/)
    }
  }
}))

test("legacy packs are refused without modifying them", () => fixture(({ packPath }) => {
  writeJSON(packPath, { scenarios: {} })
  const before = fs.readFileSync(packPath)
  assert.throws(() => regradePack(packPath), /legacy/)
  assert.deepEqual(fs.readFileSync(packPath), before)
}))

if (process.platform !== "win32") {
  test("symlink evidence cannot escape fingerprint verification", () => fixture(({ hostDir, out, reseal, packPath }) => {
    fs.symlinkSync("/etc/passwd", path.join(hostDir, "workspace", "link"))
    reseal()
    assert.throws(() => verifyEvidence(out), /symlink/)
    assert.throws(() => regradePack(packPath), /symlink/)
  }))
}
