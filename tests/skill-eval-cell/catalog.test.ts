import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import {
  ISSUE_1482_BASE_REF,
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

  test("issue #1482 scenarios use the exact pre-change baseline", () => {
    const issue1482 = new Set([
      "ce-plan/no-implement",
      "ce-work/requirements-only-stops",
      "ce-work/return-to-caller-no-pr",
      "lfg/plan-first",
    ])

    expect(
      SCENARIOS.filter((scenario) => issue1482.has(scenario.id)).map((scenario) => [
        scenario.id,
        scenario.baseline_ref,
      ]),
    ).toEqual(
      [...issue1482].map((id) => [id, ISSUE_1482_BASE_REF]),
    )
    expect(SCENARIOS.find((scenario) => scenario.id === "ce-code-review/report-only-default")?.baseline_ref).toBeUndefined()
  })

  test("WAVE1 ids exist in the catalog", () => {
    const ids = new Set(SCENARIOS.map((s) => s.id))
    expect(WAVE1.filter((id) => !ids.has(id))).toEqual([])
  })

  test("every scenario skill exists at PRE_SWEEP_REF and POST_SWEEP_REF", () => {
    const missing: string[] = []
    for (const scenario of SCENARIOS) {
      if (!gitShowExists(PRE_SWEEP_REF, scenario.skill)) {
        missing.push(`${scenario.skill} missing at ${PRE_SWEEP_REF}`)
      }
      if (!gitShowExists(POST_SWEEP_REF, scenario.skill)) {
        missing.push(`${scenario.skill} missing at ${POST_SWEEP_REF}`)
      }
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

  test("workspace_read paths exist in the scenario fixture", () => {
    const missing: string[] = []
    for (const s of SCENARIOS) {
      if (!s.grade.workspace_read?.length) continue
      if (!s.fixture) {
        missing.push(`${s.id}: workspace_read without a fixture`)
        continue
      }
      for (const rel of s.grade.workspace_read) {
        if (!fs.existsSync(path.join(REPO_ROOT, s.fixture, rel))) {
          missing.push(`${s.id}: ${rel} missing under ${s.fixture}`)
        }
      }
    }
    expect(missing).toEqual([])
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
        "ce-babysit-pr/check-only-answer-reactivates-source:references/tick.md",
        "ce-babysit-pr/behind-reads-branch-currency:references/branch-currency.md",
        "ce-babysit-pr/pipeline-returns-canonical-human-decision:references/pipeline.md",
        "ce-babysit-pr/pipeline-returns-canonical-human-decision:references/report.md",
        "ce-brainstorm/lightweight-ends-in-chat:references/phase-0.md",
        "ce-brainstorm/lookup-not-ask:references/interaction-rules.md",
        "ce-brainstorm/standard-scope-routes-to-file:references/phase-0.md",
        "ce-brainstorm/verdict-routes-to-pov:references/phase-0.md",
        "ce-brainstorm/write-plan-reads-plan-write:references/plan-write.md",
        "ce-commit-push-pr/description-only-no-commit:references/pr-description-writing.md",
        "ce-commit-push-pr/babysit-off-preserves-human-decision:references/apply-and-handoff.md",
        "ce-debug/pipeline-convergent-fix:references/pipeline-mode.md",
        "ce-doc-review/routine-fix-no-product-lens:references/persona-selection.md",
        "ce-doc-review/settled-origin-no-product-lens:references/persona-selection.md",
        "ce-doc-review/staked-position-keeps-product-lens:references/persona-selection.md",
        "ce-doc-review/strategic-weight-keeps-product-lens:references/persona-selection.md",
        "ce-debug/pipeline-divergent-defer:references/pipeline-mode.md",
        "ce-handoff/resume-asks-does-not-act:references/resume.md",
        "ce-ideate/unidentified-subject-reads-scope-gates:references/scope-gates.md",
        "ce-plan/chat-brief-small-no-file:references/output-contracts.md",
        "ce-plan/config-model-reaches-authoring-gate:references/reasoning-elevation.md",
        "ce-plan/direct-trivial-stays-in-chat:references/output-contracts.md",
        "ce-plan/no-implement:references/output-mode.md",
        "ce-plan/no-implement:references/resume.md",
        "ce-plan/objective-above-the-changed-component:references/plan-sections.md",
        "ce-plan/objective-holdable-without-the-rest-of-the-plan:references/plan-sections.md",
      "ce-polish/https-server-uses-actual-url:references/run.md",
        "ce-polish/start-server-reads-run:references/run.md",
        "ce-pov/oracle-dispatches-peers:references/cross-model-panel.md",
        "ce-pov/stay-read-only:references/method.md",
        "ce-riffrec-feedback-analysis/quick-notes:references/analyzer.md",
        "ce-riffrec-feedback-analysis/quick-notes:references/quick-bug-report.md",
        "ce-riffrec-feedback-analysis/setup-before-recording:references/install-riffrec.md",
        "ce-resolve-pr-feedback/pipeline-no-merge:references/pipeline-mode.md",
        "ce-resolve-pr-feedback/pipeline-returns-complete-human-decision:references/evaluation-rubric.md",
        "ce-resolve-pr-feedback/pipeline-returns-complete-human-decision:references/pipeline-mode.md",
        "ce-test-xcode/missing-mcp-stops:references/setup-and-build.md",
        "ce-test-xcode/swiftui-inline-link-fallback:references/test-and-report.md",
        "ce-work/behavior-fix-routes-to-review:references/input-triage.md",
        "ce-work/requirements-only-stops:references/input-triage.md",
        "ce-work/return-to-caller-no-pr:references/input-triage.md",
        "ce-work/return-to-caller-no-pr:references/return-to-caller.md",
        "lfg/plan-first:references/plan-brief.md",
      ].sort(),
    )
  })

  test("the 8KB sweep has no in-progress skills left", () => {
    expect(SCENARIOS.filter((s) => s.cohort === "in-progress").map((s) => s.id)).toEqual([])
  })

  test("feature-only decision rows are explicitly post-only", () => {
    expect(SCENARIOS.filter((s) => s.post_only).map((s) => s.id).sort()).toEqual([
      "ce-babysit-pr/announced-review-that-finished-reads-ready",
      "ce-babysit-pr/announced-review-with-nothing-to-show-waits",
      "ce-babysit-pr/check-only-answer-reactivates-source",
      "ce-babysit-pr/moved-evidence-restores-the-ordinary-window",
      "ce-babysit-pr/pipeline-returns-canonical-human-decision",
      "ce-babysit-pr/silent-reviewer-of-an-earlier-head-still-waits",
      "ce-babysit-pr/timed-out-review-is-finished-not-approved",
      "ce-babysit-pr/unrelated-terminal-work-is-not-the-review",
      "ce-commit-push-pr/babysit-off-preserves-human-decision",
      "ce-compound-refresh/guidance-survives-implementation-conflict",
      "ce-debug/pipeline-divergent-defer",
      "ce-plan/config-model-reaches-authoring-gate",
      "ce-resolve-pr-feedback/pipeline-returns-complete-human-decision",
    ])
  })

  test("the post arm resolves the working tree, not a commit", () => {
    expect(POST_SWEEP_REF).toBe(WORKTREE_REF)
  })

  test("a read-only restraint row also carries a positive probe", () => {
    // Under read_only the forbidden mutation is impossible, so must_exclude alone
    // can never fail. Something that observes the stated decision has to be present.
    const vacuous = SCENARIOS.filter((s) => {
      if (!s.read_only || !s.grade.must_exclude?.length) return false
      return (
        !s.grade.must_include?.length &&
        !s.grade.files_read_post?.length &&
        !s.grade.workspace_read?.length
      )
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
