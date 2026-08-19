import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import {
  POST_SWEEP_REF,
  PRE_SWEEP_REF,
  SCENARIOS,
  WAVE1,
  scenarioHasDecisionGrade,
} from "./catalog"
import { REPO_ROOT, WORKTREE_REF } from "./extract"

const skillsDir = path.join(REPO_ROOT, "skills")

function shippedSkills(): string[] {
  return fs
    .readdirSync(skillsDir)
    .filter((name) => fs.existsSync(path.join(skillsDir, name, "SKILL.md")))
    .sort()
}

function gitPathExists(ref: string, gitPath: string): boolean {
  if (ref === WORKTREE_REF) return fs.existsSync(path.join(REPO_ROOT, gitPath))
  return spawnSync("git", ["cat-file", "-e", `${ref}:${gitPath}`], { cwd: REPO_ROOT }).status === 0
}

function gitShowExists(ref: string, skill: string): boolean {
  return gitPathExists(ref, `skills/${skill}/SKILL.md`)
}

describe("skill-eval-cell catalog", () => {
  test("every scenario grades a decision or an artifact", () => {
    expect(SCENARIOS.filter((s) => !scenarioHasDecisionGrade(s)).map((s) => s.id)).toEqual([])
  })

  test("catalog skills are a subset of shipped skills", () => {
    const shipped = new Set(shippedSkills())
    expect(SCENARIOS.map((s) => s.skill).filter((name) => !shipped.has(name))).toEqual([])
  })

  test("scenario ids are unique", () => {
    const ids = SCENARIOS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test("WAVE1 ids exist in the catalog", () => {
    const ids = new Set(SCENARIOS.map((s) => s.id))
    expect(WAVE1.filter((id) => !ids.has(id))).toEqual([])
  })

  test("every scenario skill exists at PRE_SWEEP_REF and POST_SWEEP_REF", () => {
    const missing: string[] = []
    for (const skill of new Set(SCENARIOS.map((s) => s.skill))) {
      if (!gitShowExists(PRE_SWEEP_REF, skill)) missing.push(`${skill} missing at ${PRE_SWEEP_REF}`)
      if (!gitShowExists(POST_SWEEP_REF, skill)) missing.push(`${skill} missing at ${POST_SWEEP_REF}`)
    }
    expect(missing).toEqual([])
  })

  test("fixture paths exist and tasks are non-empty", () => {
    const bad: string[] = []
    for (const s of SCENARIOS) {
      if (!s.task.trim()) bad.push(`${s.id}: empty task`)
      if (s.fixture && !fs.existsSync(path.join(REPO_ROOT, s.fixture))) {
        bad.push(`${s.id}: missing fixture ${s.fixture}`)
      }
    }
    expect(bad).toEqual([])
  })

  test("files_read_post pointers exist on the arm that grades them", () => {
    const missing: string[] = []
    for (const s of SCENARIOS) {
      for (const rel of s.grade.files_read_post ?? []) {
        const refs = [POST_SWEEP_REF, ...(s.preview_ref ? [s.preview_ref] : [])]
        for (const ref of refs) {
          if (!gitPathExists(ref, `skills/${s.skill}/${rel}`)) {
            missing.push(`${s.id}: ${rel} missing at ${ref}`)
          }
        }
      }
    }
    expect(missing).toEqual([])
  })

  test("required-read files are only the load-bearing ones", () => {
    const listed = SCENARIOS.flatMap((s) =>
      (s.grade.files_read_post ?? []).map((rel) => `${s.id}:${rel}`),
    ).sort()
    expect(listed).toEqual(
      [
        "ce-babysit-pr/behind-reads-branch-currency:references/branch-currency.md",
        "ce-brainstorm/verdict-routes-to-pov:references/phase-0.md",
        "ce-brainstorm/write-plan-reads-plan-write:references/plan-write.md",
        "ce-commit-push-pr/description-only-no-commit:references/pr-description-writing.md",
        "ce-debug/pipeline-convergent-fix:references/pipeline-mode.md",
        "ce-debug/pipeline-divergent-defer:references/pipeline-mode.md",
        "ce-handoff/resume-asks-does-not-act:references/resume.md",
        "ce-ideate/unidentified-subject-reads-scope-gates:references/scope-gates.md",
        "ce-pov/oracle-dispatches-peers:references/cross-model-panel.md",
        "ce-pov/stay-read-only:references/method.md",
        "ce-resolve-pr-feedback/pipeline-no-merge:references/pipeline-mode.md",
        "lfg/plan-first:references/plan-brief.md",
      ].sort(),
    )
  })

  test("the 8KB sweep has no in-progress skills left", () => {
    expect(SCENARIOS.filter((s) => s.cohort === "in-progress").map((s) => s.id)).toEqual([])
  })

  test("the post arm resolves the working tree, not a commit", () => {
    expect(POST_SWEEP_REF).toBe(WORKTREE_REF)
  })

  test("a read-only restraint row also carries a positive probe", () => {
    // Under read_only the forbidden mutation is impossible, so must_exclude alone
    // can never fail. Something that observes the stated decision has to be present.
    const vacuous = SCENARIOS.filter((s) => {
      if (!s.read_only || !s.grade.must_exclude?.length) return false
      return !s.grade.must_include?.length && !s.grade.files_read_post?.length
    }).map((s) => s.id)
    expect(vacuous).toEqual([])
  })

  test("preview refs are only on in-progress skills and resolve when set", () => {
    const bad: string[] = []
    const resolved = new Map<string, boolean>()
    for (const s of SCENARIOS) {
      if (s.preview_ref && s.cohort !== "in-progress") bad.push(`${s.id}: preview_ref on ${s.cohort}`)
      if (!s.preview_ref) continue
      let ok = resolved.get(s.preview_ref)
      if (ok === undefined) {
        const r = spawnSync("git", ["rev-parse", "--verify", s.preview_ref], { cwd: REPO_ROOT })
        ok = r.status === 0
        resolved.set(s.preview_ref, ok)
      }
      if (!ok) bad.push(`${s.id}: preview_ref ${s.preview_ref} does not resolve`)
    }
    expect(bad).toEqual([])
  })
})
