/**
 * Run catalog scenarios against the pre-sweep skill bodies, then main.
 *
 *   bun tests/skill-eval-cell/pack.ts --list
 *   bun tests/skill-eval-cell/pack.ts --wave1 --arm ab
 *   bun tests/skill-eval-cell/pack.ts --id ce-babysit-pr/refuse-unasked-update --arm ab
 */
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  POST_SWEEP_REF,
  PRE_SWEEP_REF,
  scenariosMatching,
  type Cohort,
  type Scenario,
} from "./catalog"
import { arg, flag } from "./cli"
import { REPO_ROOT } from "./extract"
import { gradeArm, type EvalArm } from "./grade"
import { PACK_SCHEMA_VERSION, graderFingerprint, prepareOutput, valueHash, verifyEvidence, verifyWorkspaceGradePaths, writeJSON } from "./provenance"

type Arm = EvalArm | "ab"

function resolveArmRef(scenario: Scenario, arm: EvalArm): string | null {
  if (arm === "pre") return scenario.baseline_ref ?? PRE_SWEEP_REF
  if (arm === "post") return POST_SWEEP_REF
  if (arm === "preview") return scenario.preview_ref ?? null
  return null
}

function armsFor(scenario: Scenario, requested: Arm): EvalArm[] {
  if (scenario.post_only) {
    if (requested === "pre") return []
    if (requested === "preview") return scenario.preview_ref ? ["preview"] : []
    return ["post"]
  }
  if (requested === "pre") return ["pre"]
  if (requested === "post") return ["post"]
  if (requested === "preview") return scenario.preview_ref ? ["preview"] : []
  return hasBaseline(scenario) ? ["pre", "post"] : ["post"]
}

/** A row has an A/B pair when it was resized in the sweep or carries its own baseline. */
function hasBaseline(scenario: Scenario): boolean {
  return scenario.cohort === "resized" || Boolean(scenario.baseline_ref)
}

function runCell(scenario: Scenario, arm: EvalArm, out: string, hosts?: string) {
  const ref = resolveArmRef(scenario, arm)
  if (!ref) throw new Error(`${scenario.id}: no ref for arm ${arm}`)
  const taskFile = path.join(path.dirname(out), `${arm}-task.md`)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(taskFile, scenario.task, { flag: "wx" })
  const argv = [
    "bun",
    path.join(import.meta.dir, "run.ts"),
    "--skill",
    scenario.skill,
    "--ref",
    ref,
    "--task-file",
    taskFile,
    "--out",
    out,
    "--timeout-secs",
    String(scenario.timeout_secs ?? 600),
  ]
  if (scenario.read_only) argv.push("--read-only")
  if (scenario.git_init) argv.push("--git-init")
  if (scenario.git_untracked?.length) argv.push("--git-untracked", scenario.git_untracked.join(","))
  if (scenario.git_staged?.length) argv.push("--git-staged", scenario.git_staged.join(","))
  if (scenario.git_remote) argv.push("--git-remote")
  if (scenario.shim_git_push) {
    argv.push("--shim-git-push")
    if (typeof scenario.shim_git_push === "object") {
      argv.push(
        "--shim-git-push-requires-head-marker",
        scenario.shim_git_push.requiredHeadMarkerPath,
      )
    }
  }
  if (scenario.shim_gh_pr) argv.push("--shim-gh-pr")
  if (scenario.fixture) argv.push("--fixture", path.join(REPO_ROOT, scenario.fixture))
  if (hosts) argv.push("--hosts", hosts)
  const r = spawnSync(argv[0], argv.slice(1), {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
  fs.writeFileSync(path.join(path.dirname(out), `${arm}-collector-stdout.txt`), r.stdout ?? "")
  fs.writeFileSync(path.join(path.dirname(out), `${arm}-collector-stderr.txt`), r.stderr ?? "")
  if (r.status !== 0) {
    throw new Error(
      `${scenario.id} ${arm} cell failed (exit ${r.status})\n${r.stderr}\n${r.stdout}`,
    )
  }
  return r.stdout.trim()
}

function selectedScenarios(): Scenario[] {
  return scenariosMatching({
    id: arg("--id"),
    skill: arg("--skill"),
    cohort: arg("--cohort") as Cohort | undefined,
    wave1: flag("--wave1"),
  })
}

function main() {
  const cohort = arg("--cohort")
  if (cohort && !["resized", "in-progress", "untouched"].includes(cohort)) {
    console.error("usage: --cohort resized|in-progress|untouched")
    process.exit(2)
  }
  if (flag("--list")) {
    for (const s of selectedScenarios()) {
      const ab = s.post_only ? "post-only" : hasBaseline(s) ? "A/B" : "post-only"
      console.log(`${s.id}\t${s.cohort}\t${ab}\t${s.key_behavior}\t${s.read_only ? "ro" : "live"}`)
    }
    return
  }

  const requested = (arg("--arm", "ab") ?? "ab") as Arm
  if (!["pre", "post", "preview", "ab"].includes(requested)) {
    console.error("usage: --arm pre|post|preview|ab")
    process.exit(2)
  }
  const hosts = arg("--hosts")
  const selected = selectedScenarios()
  if (selected.length === 0) {
    console.error("no scenarios matched")
    process.exit(2)
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const explicitOut = arg("--out")
  const root = prepareOutput(explicitOut ?? fs.mkdtempSync(path.join(os.tmpdir(), `ce-skill-eval-pack-${stamp}-`)))
  const pack: Record<string, unknown> = {
    schema_version: PACK_SCHEMA_VERSION, root, arm: requested,
    started_at: new Date().toISOString(), grader: graderFingerprint(), scenarios: {},
  }
  const packPath = path.join(root, "pack.json")
  writeJSON(packPath, pack)

  for (const scenario of selected) {
    const arms = armsFor(scenario, requested)
    if (arms.length === 0) {
      console.error(`warning: ${scenario.id} has no ${requested} arm; skip`)
      continue
    }
    const snapshot = JSON.parse(JSON.stringify(scenario)) as Scenario
    const row: Record<string, unknown> = {
      id: scenario.id, skill: scenario.skill,
      scenario_snapshot: snapshot, scenario_sha256: valueHash(snapshot), arms: {},
    }
    ;(pack.scenarios as Record<string, unknown>)[scenario.id] = row
    for (const arm of arms) {
      const out = path.join(root, scenario.id.replaceAll("/", "__"), arm)
      console.error(`running ${scenario.id} ${arm} → ${out}`)
      const info: Record<string, unknown> = {
        out, out_relative: path.relative(root, out).split(path.sep).join("/"),
        status: "collecting", ok: false,
      }
      ;(row.arms as Record<string, unknown>)[arm] = info
      writeJSON(packPath, pack)
      try {
        verifyWorkspaceGradePaths((snapshot.grade.workspace_contains ?? []).map((check) => check.path))
        info.summary = runCell(snapshot, arm, out, hosts)
        verifyEvidence(out)
        info.evidence_sha256 = valueHash(JSON.parse(fs.readFileSync(path.join(out, "evidence-manifest.json"), "utf8")))
        if (graderFingerprint().sha256 !== (pack.grader as { sha256: string }).sha256) {
          throw new Error("grader changed during collection")
        }
        const graded = gradeArm({ out, scenario: snapshot, arm })
        if (graded.grades.length === 0) throw new Error("no host results were collected")
        Object.assign(info, graded, { status: "graded" })
      } catch (error) {
        Object.assign(info, { status: "collection-error", error: String(error), ok: false })
      }
      writeJSON(packPath, pack)
    }
    ;(pack.scenarios as Record<string, unknown>)[scenario.id] = row
  }

  pack.finished_at = new Date().toISOString()
  writeJSON(packPath, pack)
  console.log(packPath)
  // Exit status is the verdict: a caller running this as a check must not read a
  // failed arm as a pass. The artifact is written first so failures stay diagnosable.
  const evaluated = Object.values(pack.scenarios as Record<string, any>).flatMap((row) =>
    Object.keys(row.arms as Record<string, any>),
  )
  if (evaluated.length === 0) {
    console.error(`no ${requested} arm exists for any selected scenario; nothing ran`)
    process.exit(2)
  }
  const failed = Object.values(pack.scenarios as Record<string, any>).flatMap((row) =>
    Object.entries(row.arms as Record<string, any>)
      .filter(([, info]) => !info.ok)
      .map(([arm]) => `${row.id} ${arm}`),
  )
  if (failed.length > 0) {
    console.error(`failed: ${failed.join(", ")}`)
    process.exit(1)
  }
}

try { main() } catch (error) {
  console.error(error)
  process.exitCode = 2
}
