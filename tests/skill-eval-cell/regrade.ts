import { randomUUID } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { scenarioById, type Grade, type Scenario } from "./catalog"
import { REPO_ROOT } from "./extract"
import { gradeArm, type EvalArm, type ArmGrade } from "./grade"
import { PACK_SCHEMA_VERSION, containedPath, fingerprint, graderFingerprint, sha256, valueHash, verifyEvidence, verifyWorkspaceGradePaths, writeJSON } from "./provenance"

export type RegradeMode = "current" | "original"

/** Criteria can change; a recorded run still answers its original task under its original controls. */
function collectionContext(scenario: Scenario) {
  return {
    skill: scenario.skill, task: scenario.task, fixture: scenario.fixture ?? null,
    read_only: scenario.read_only, timeout_secs: scenario.timeout_secs ?? 600,
    git_init: scenario.git_init ?? false, git_remote: scenario.git_remote ?? false,
    git_untracked: scenario.git_untracked ?? [], git_staged: scenario.git_staged ?? [],
    shim_git_push: scenario.shim_git_push ?? false, shim_gh_pr: scenario.shim_gh_pr ?? false,
  }
}

/** An absent observation mechanism cannot prove the absence of an action. */
function missingObservations(out: string, scenario: Scenario, grade: Grade): string | undefined {
  const summary = JSON.parse(fs.readFileSync(path.join(out, "summary.json"), "utf8"))
  for (const host of summary.hosts_run) {
    const dir = path.join(out, "hosts", host)
    if ((grade.git || grade.committed_must?.length || grade.committed_must_not?.length) &&
        fs.readFileSync(path.join(dir, "git-status.txt"), "utf8").startsWith("(not a git repo)")) {
      return `${host}: Git observations required by the criteria were not collected`
    }
    if (grade.shim_log_must_not?.length) {
      const bins = [scenario.shim_git_push ? "git" : null, scenario.shim_gh_pr ? "gh" : null].filter(Boolean) as string[]
      if (bins.length === 0 || bins.some((bin) => !fs.existsSync(path.join(dir, ".bin", bin)))) {
        return `${host}: command shims required by the criteria were not installed`
      }
    }
    if (grade.workspace_contains?.length && !fs.existsSync(path.join(dir, "workspace"))) {
      return `${host}: workspace observations required by the criteria were not collected`
    }
  }
}

/** Assess sealed observations with trusted local code; never execute archives or replace the source pack. */
export function regradePack(packPath: string, mode: RegradeMode = "current"): { reportPath: string; ok: boolean } {
  if (mode !== "current" && mode !== "original") throw new Error("mode must be current or original")
  if (!fs.lstatSync(packPath).isFile()) throw new Error("pack must be a regular file")
  const originalBytes = fs.readFileSync(packPath)
  const pack = JSON.parse(originalBytes.toString("utf8"))
  if (pack.schema_version !== PACK_SCHEMA_VERSION || !pack.scenarios ||
      !pack.grader || !Array.isArray(pack.grader.entries) ||
      valueHash(pack.grader.entries) !== pack.grader.sha256) {
    throw new Error("pack lacks frozen provenance; legacy packs are not supported")
  }
  const currentGrader = graderFingerprint()
  const changedGrader = currentGrader.sha256 !== pack.grader.sha256
  if (mode === "original" && changedGrader) {
    throw new Error("grader changed; original mode requires a trusted checkout matching the recorded grader")
  }
  const root = path.dirname(path.resolve(packPath))
  const rows: Record<string, unknown> = {}
  let ok = true
  let count = 0
  for (const [id, raw] of Object.entries(pack.scenarios)) {
    const row = raw as {
      scenario_snapshot: Scenario; scenario_sha256: string;
      arms: Record<string, { status: string; out_relative: string; evidence_sha256: string } & Partial<ArmGrade>>;
    }
    const original = row.scenario_snapshot
    if (!original || original.id !== id || valueHash(original) !== row.scenario_sha256 || !row.arms) {
      throw new Error(`frozen scenario missing or changed: ${id}`)
    }
    const current = mode === "current" ? scenarioById(id) : original
    // Copy the selected criteria once; later catalog edits cannot change this assessment.
    const usedGrade: Grade | null = current ? JSON.parse(JSON.stringify(current.grade)) : null
    const contextChanged = current && valueHash(collectionContext(current)) !== valueHash(collectionContext(original))
    const results: Record<string, unknown> = {}
    for (const [arm, info] of Object.entries(row.arms)) {
      if (!["pre", "post", "preview"].includes(arm)) throw new Error(`invalid arm: ${arm}`)
      count++
      if (info.status !== "graded") {
        ok = false
        results[arm] = { status: "not-regraded", original_status: info.status, ok: false }
        continue
      }
      if (!/^[a-f0-9]{64}$/.test(info.evidence_sha256 ?? "")) throw new Error("missing evidence hash")
      const out = containedPath(root, info.out_relative)
      verifyEvidence(out, info.evidence_sha256)
      if (fs.readFileSync(path.join(out, "task.md"), "utf8") !== original.task) {
        throw new Error("frozen task differs from the collected task")
      }
      let unavailable = !current ? "scenario is absent from the current catalog" :
        contextChanged ? "task or collection controls changed; collect a new run" : undefined
      if (!unavailable && mode === "current" && current?.fixture) {
        const fixture = path.join(REPO_ROOT, current.fixture)
        const input = JSON.parse(fs.readFileSync(path.join(out, "input-manifest.json"), "utf8"))
        if (!fs.existsSync(fixture) || fingerprint(fixture).sha256 !== input.initial_workspace.sha256) {
          unavailable = "fixture contents changed; collect a new run"
        }
      }
      if (usedGrade) {
        verifyWorkspaceGradePaths((usedGrade.workspace_contains ?? []).map((check) => check.path))
        if (mode === "current") unavailable ??= missingObservations(out, original, usedGrade)
      }
      if (unavailable || !usedGrade) {
        ok = false
        results[arm] = { status: "not-assessable", reason: unavailable, ok: false }
        continue
      }
      const grade = gradeArm({ out, scenario: { ...original, grade: usedGrade }, arm: arm as EvalArm })
      verifyEvidence(out, info.evidence_sha256)
      results[arm] = {
        status: "regraded", ...grade,
        original_grade: { grades: info.grades, ok: info.ok, pointer_ok: info.pointer_ok },
      }
      ok = ok && grade.ok && grade.grades.length > 0
    }
    rows[id] = {
      scenario_sha256: row.scenario_sha256,
      original_grade_sha256: valueHash(original.grade),
      used_grade: usedGrade, used_grade_sha256: usedGrade ? valueHash(usedGrade) : null,
      arms: results,
    }
  }
  if (count === 0) throw new Error("pack contains no arms")
  if (graderFingerprint().sha256 !== currentGrader.sha256) throw new Error("grader changed while regrading")
  if (sha256(fs.readFileSync(packPath)) !== sha256(originalBytes)) throw new Error("source pack changed while regrading")
  const reportPath = path.join(root, `${path.basename(packPath, ".json")}.regrade-${randomUUID()}.json`)
  writeJSON(reportPath, {
    schema_version: 1, created_at: new Date().toISOString(), mode, grader_changed: changedGrader,
    source_pack: path.basename(packPath), source_pack_sha256: sha256(originalBytes),
    original_grader: pack.grader, used_grader: currentGrader,
    scenarios: rows, ok,
  }, true)
  return { reportPath, ok }
}

if (import.meta.main) {
  try {
    const [packPath, ...flags] = process.argv.slice(2)
    const mode = flags.length === 0 ? "current" : flags[1]
    if (!packPath || (flags.length !== 0 && (flags.length !== 2 || flags[0] !== "--mode")) ||
        (mode !== "current" && mode !== "original")) {
      throw new Error("usage: bun tests/skill-eval-cell/regrade.ts <pack.json> [--mode current|original]")
    }
    const result = regradePack(packPath, mode)
    console.log(result.reportPath)
    process.exitCode = result.ok ? 0 : 1
  } catch (error) {
    console.error(error)
    process.exitCode = 2
  }
}
