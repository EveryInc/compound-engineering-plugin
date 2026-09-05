import { randomUUID } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import type { Scenario } from "./catalog"
import { gradeArm, type EvalArm, type ArmGrade } from "./grade"
import { PACK_SCHEMA_VERSION, containedPath, graderFingerprint, sha256, valueHash, verifyEvidence, verifyWorkspaceGradePaths, writeJSON } from "./provenance"

/** No catalog lookup, archived source execution, saved-command replay, or source-pack mutation. */
export function regradePack(packPath: string, useCurrentGrader = false): { reportPath: string; ok: boolean } {
  if (!fs.lstatSync(packPath).isFile()) throw new Error("pack must be a regular file")
  const originalBytes = fs.readFileSync(packPath)
  const pack = JSON.parse(originalBytes.toString("utf8"))
  if (pack.schema_version !== PACK_SCHEMA_VERSION || !pack.scenarios ||
      !pack.grader || !Array.isArray(pack.grader.entries) ||
      valueHash(pack.grader.entries) !== pack.grader.sha256) {
    throw new Error("pack lacks frozen provenance; legacy packs cannot be reproduced safely")
  }
  const currentGrader = graderFingerprint()
  const changedGrader = currentGrader.sha256 !== pack.grader.sha256
  if (changedGrader && !useCurrentGrader) {
    throw new Error("grader changed; use the original checkout or explicitly pass --use-current-grader")
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
    const scenario = row.scenario_snapshot
    if (!scenario || scenario.id !== id || valueHash(scenario) !== row.scenario_sha256 || !row.arms) {
      throw new Error(`frozen scenario missing or changed: ${id}`)
    }
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
      if (fs.readFileSync(path.join(out, "task.md"), "utf8") !== scenario.task) {
        throw new Error("frozen task differs from the collected task")
      }
      // Evidence verification already refuses symlinks. Missing workspace files
      // remain grade failures; traversal and fingerprint exclusions are invalid inputs.
      verifyWorkspaceGradePaths((scenario.grade.workspace_contains ?? []).map((check) => check.path))
      const grade = gradeArm({ out, scenario, arm: arm as EvalArm })
      verifyEvidence(out, info.evidence_sha256)
      results[arm] = {
        status: "regraded", ...grade,
        original_grade: { grades: info.grades, ok: info.ok, pointer_ok: info.pointer_ok },
      }
      ok = ok && grade.ok && grade.grades.length > 0
    }
    rows[id] = { scenario_sha256: row.scenario_sha256, arms: results }
  }
  if (count === 0) throw new Error("pack contains no arms")
  if (graderFingerprint().sha256 !== currentGrader.sha256) throw new Error("grader changed while regrading")
  if (sha256(fs.readFileSync(packPath)) !== sha256(originalBytes)) throw new Error("source pack changed while regrading")
  const reportPath = path.join(root, `${path.basename(packPath, ".json")}.regrade-${randomUUID()}.json`)
  writeJSON(reportPath, {
    schema_version: 1, created_at: new Date().toISOString(),
    assessment: changedGrader ? "changed-grader" : "original-grader",
    source_pack: path.basename(packPath), source_pack_sha256: sha256(originalBytes),
    original_grader: pack.grader, used_grader: currentGrader,
    scenarios: rows, ok,
  }, true)
  return { reportPath, ok }
}

if (import.meta.main) {
  try {
    const [packPath, ...flags] = process.argv.slice(2)
    if (!packPath || flags.some((flag) => flag !== "--use-current-grader")) {
      throw new Error("usage: bun tests/skill-eval-cell/regrade.ts <pack.json> [--use-current-grader]")
    }
    const result = regradePack(packPath, flags.includes("--use-current-grader"))
    console.log(result.reportPath)
    process.exitCode = result.ok ? 0 : 1
  } catch (error) {
    console.error(error)
    process.exitCode = 2
  }
}
