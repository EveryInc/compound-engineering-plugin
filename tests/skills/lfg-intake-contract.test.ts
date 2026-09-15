import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8")
}

// lfg's front half became an outcome spine with four routes to a work source
// (2026-09). The body keeps the work-source invariant and the route summary;
// references/intake.md owns the routes, and two new return-to-caller seams
// (ce-debug, ce-brainstorm) feed it. These pins hold the seams together: each
// side is edited independently, so a renamed token or status on one end must
// fail here rather than in a live run.

const lfg = readRepoFile("skills/lfg/SKILL.md")
const intake = readRepoFile("skills/lfg/references/intake.md")
const debugReturnGate = readRepoFile("skills/lfg/references/debug-return.md")
const debugReturn = readRepoFile("skills/ce-debug/references/return-to-caller.md")
const debugSkill = readRepoFile("skills/ce-debug/SKILL.md")
const brainstormSkill = readRepoFile("skills/ce-brainstorm/SKILL.md")
const brainstormHandoff = readRepoFile("skills/ce-brainstorm/references/handoff.md")
const workTriage = readRepoFile("skills/ce-work/references/input-triage.md")
const workReturnGate = readRepoFile("skills/lfg/references/work-return.md")
const planBrief = readRepoFile("skills/lfg/references/plan-brief.md")
const reviewFollowup = readRepoFile("skills/lfg/references/review-followup.md")
const shippingTail = readRepoFile("skills/lfg/references/shipping.md")

describe("lfg work source and routes", () => {
  test("the body names the routes and the intake owner before any step", () => {
    const routeClause = lfg.indexOf("**Route by what the request is.**")
    const runHeading = lfg.indexOf("## The run")
    expect(routeClause).toBeGreaterThan(-1)
    expect(routeClause).toBeLessThan(runHeading)
    expect(lfg).toContain("references/intake.md")
    for (const child of ["`ce-debug`", "`ce-pov`", "`ce-brainstorm`", "`ce-plan`", "`ce-prototype`", "`ce-explain`", "`ce-ideate`"]) {
      expect(lfg.slice(routeClause, runHeading)).toContain(child)
    }
  })

  test("only a verified plan or a fixed debug return is a work source, and nothing is discovered on disk", () => {
    expect(lfg).toMatch(/only two things qualify/)
    expect(lfg).toMatch(/`fixed` return from `ce-debug`/)
    expect(lfg).toMatch(/Never search the plans directory/)
    // ce-work's blank-invocation discovery exists; lfg must never reach it.
    expect(workTriage).toContain("**Blank invocation latest-plan discovery:**")
    expect(intake).toMatch(/`lfg` never invokes `ce-work` blank/)
  })

  test("a same-session plan goes straight to ce-work; older or requirements-only plans go through ce-plan", () => {
    expect(intake).toMatch(/wrote in this session[\s\S]{0,200}invokes `ce-work` on it directly/)
    expect(intake).toMatch(/requirements-only artifact, or a path to a plan from an earlier session[\s\S]{0,120}invoke `ce-plan`/)
    // The this-run gate stays on the plan route; plan-brief records the bypass.
    expect(lfg).toContain("a plan file `ce-plan` reported writing this run")
    expect(planBrief).toMatch(/bypasses `ce-plan` per `references\/intake\.md`/)
  })

  test("every ce-pov grade has a rule and the verdict never becomes a settled decision", () => {
    for (const grade of ["Adopt", "Trial", "Reject", "Hold", "Not-our-problem", "Blocked"]) {
      expect(intake).toContain(grade)
    }
    expect(intake).toMatch(/never as a settled decision/)
    expect(lfg).toMatch(/only a verdict that supports the change continues/)
    // A judgment-only request ends at the verdict; route 3 needs change intent (Codex round 2).
    expect(lfg).toMatch(/a judgment with nothing to build ends at the verdict/)
    expect(intake).toMatch(/Judgment on the way to a change\.\*\* The request asks for a change to the code/)
    // Codex round 3: a plan path alone does not select the plan route.
    expect(intake).toMatch(/Plan path\.\*\* The request asks for a plan to be carried out or continued/)
  })

  test("a non-code result ends the run at that skill, with no branch", () => {
    expect(intake).toMatch(/A result that is not a code change/)
    expect(intake).toMatch(/with no branch, no work source/)
    expect(lfg).toMatch(/that invocation is the whole run/)
    expect(intake).toMatch(/The examples are not the list; the host's skill catalog is/)
  })

  test("interaction is limited to ce-brainstorm with a human present", () => {
    expect(lfg).toMatch(/Ask the user only through `ce-brainstorm`, and only when a human is present/)
    expect(intake).toMatch(/When no human is present, take route 6/)
  })

  test("compound runs before shipping so the learning is in the PR at open", () => {
    const compound = lfg.indexOf("7. Invoke the `ce-compound` skill")
    const ship = lfg.indexOf("invoke the `ce-commit-push-pr` skill")
    expect(compound).toBeGreaterThan(-1)
    expect(compound).toBeLessThan(ship)
    expect(lfg).toContain("mode:non-interactive")
    expect(reviewFollowup).toContain("## Step 7 — compound before shipping")
  })
})

describe("ce-debug return-to-caller seam (ce-debug <-> lfg)", () => {
  const STATUSES = ["fixed", "diagnosed-no-fix", "needs-human", "blocked"]
  const DEBUG_RETURN_FIELDS = [
    "status",
    "root_cause",
    "changed_files",
    "head_sha",
    "branch",
    "pre_fix_scope",
    "verification_evidence",
    "residuals",
    "issue_of_record",
    "behavior_change",
    "standalone_shipping_skipped",
  ]

  test("ce-debug documents the mode, its exact status vocabulary, and no push", () => {
    expect(debugSkill).toContain("**`mode:return-to-caller`**")
    expect(debugSkill).toContain("references/return-to-caller.md")
    expect(debugSkill).toContain("`fixed | diagnosed-no-fix | needs-human | blocked`")
    expect(debugReturn).toMatch(/never pushes and never asks/)
    expect(debugReturn).toMatch(/Branch\*\* rule in Phase 3 applies in full/)
    expect(debugReturn).toContain("mode:pipeline")
  })

  test("both ends name the same statuses and return fields", () => {
    for (const status of STATUSES) {
      expect(debugReturn, `ce-debug must define ${status}`).toContain(`\`${status}\``)
    }
    expect(debugReturnGate).toContain("Only `status: fixed` advances")
    for (const status of ["diagnosed-no-fix", "needs-human", "blocked"]) {
      expect(debugReturnGate, `lfg gate must stop on ${status}`).toContain(`\`${status}\``)
    }
    for (const field of DEBUG_RETURN_FIELDS) {
      // ce-debug documents the field as a JSON key; lfg's gate names it in backticks.
      expect(debugReturn, `ce-debug must return ${field}`).toMatch(new RegExp('"' + field + '":'))
      expect(debugReturnGate, `lfg must require ${field}`).toMatch(new RegExp("`" + field + "(?:`|:)"))
    }
  })

  test("the debug gate requires the same evidence facts the ce-work gate requires", () => {
    for (const phrase of [
      "existing tests inspected",
      "tests added/changed",
      "red failure or characterization",
      "verification run",
      "deliberate test exception",
      "Do NOT decide the test strategy inside LFG",
    ]) {
      expect(workReturnGate).toContain(phrase)
      expect(debugReturnGate).toContain(phrase)
    }
    expect(debugReturnGate).toMatch(/There is no recovery invocation on this route/)
  })

  test("the defect route ships only what the user offered", () => {
    // Codex rounds 1-3 on #1702 each found a new edge in a mechanism-shaped gate; the
    // block is stated as its goal and safe direction, and ce-debug returns facts only.
    expect(debugReturn).toMatch(/"pre_fix_scope"/)
    expect(debugReturn).toMatch(/"dirty_files"/)
    expect(debugReturn).toMatch(/"commits_beyond_base"/)
    expect(debugReturn).toMatch(/carries no verdict about what the user offered/)
    expect(debugReturnGate).toMatch(/Before any step in this run pushes, a review-fix commit included, decide whether everything that push would publish is offered/)
    expect(debugReturnGate).toMatch(/When it is not, or you cannot tell, hold/)
    expect(reviewFollowup).toMatch(/when everything the push would publish is work the user offered/)
    expect(shippingTail).not.toContain("git add -A && git commit")
    expect(shippingTail).toMatch(/Never `git add -A`/)
  })

  test("a prototype route requires a human present on both ends", () => {
    expect(intake).toMatch(/runs only when a human is present \(the same condition route 4 uses\)/)
    const prototype = readRepoFile("skills/ce-prototype/SKILL.md")
    expect(prototype).not.toMatch(/no person to experience the prototype — LFG/)
    expect(prototype).toMatch(/a calling skill that reports no human is present/)
  })

  test("the shipping steps name a substitute for every consumer of the plan path", () => {
    for (const consumer of ["`ce-simplify-code`", "`ce-code-review`", "`ce-commit-push-pr`", "`ce-compound`"]) {
      expect(debugReturnGate).toContain(consumer)
    }
    expect(reviewFollowup).toMatch(/On the defect route[^\n]*omit `plan:`/)
    expect(shippingTail).toMatch(/On the defect route[^\n]*`root_cause` and `issue_of_record`/)
    expect(shippingTail).toMatch(/On the defect route there is no plan: make no next-work offer/)
  })
})

describe("ce-brainstorm return-to-caller seam (ce-brainstorm <-> lfg)", () => {
  const BRAINSTORM_RETURN_FIELDS = ["status", "result_kind", "artifact_path", "brief", "resolve_before_planning"]

  test("ce-brainstorm documents the mode in the body and the return in the handoff owner", () => {
    expect(brainstormSkill).toContain("**`mode:return-to-caller`**")
    expect(brainstormSkill).toMatch(/no menu, no `lfg` or `ce-plan` invocation/)
    expect(brainstormHandoff).toContain("#### 4.0 Return to the caller instead of presenting options")
    expect(brainstormHandoff).toMatch(/never an invocation of `lfg` or\s+`ce-plan` from here/)
    for (const field of BRAINSTORM_RETURN_FIELDS) {
      expect(brainstormHandoff).toContain(`\`${field}\``)
      expect(intake).toContain(`\`${field}\``)
    }
  })

  test("lfg treats an artifact as the plan route and a brief as a feature description, never a work source", () => {
    expect(intake).toMatch(/An `artifact` result enters route 1/)
    expect(intake).toMatch(/A `brief` result enters route 6/)
    expect(brainstormHandoff).toMatch(/A `brief` is a feature description[^.]*not a plan and\s+not a work source/)
    // The interactive menu's own lfg option still hands over the artifact path.
    expect(brainstormHandoff).toContain("Ship it autonomously with `lfg`")
  })
})

// 2026-09-14: an lfg run ended its turn after ce-debug's return-to-caller
// output because the callee said "emit ... as the final output" and nothing at
// the caller said to continue. Children run inline, so a return is text the
// caller wrote and no event resumes it. Each callee return contract must not
// claim the turn, and lfg's completion rule must resume the next step.
describe("inline child returns do not end the caller's turn", () => {
  const calleeReturns: Record<string, string> = {
    "skills/ce-debug/SKILL.md": debugSkill,
    "skills/ce-debug/references/return-to-caller.md": debugReturn,
    "skills/ce-debug/references/pipeline-mode.md": readRepoFile("skills/ce-debug/references/pipeline-mode.md"),
    "skills/ce-work/references/return-to-caller.md": readRepoFile("skills/ce-work/references/return-to-caller.md"),
    "skills/ce-brainstorm/references/handoff.md": brainstormHandoff,
    "skills/ce-compound/references/report.md": readRepoFile("skills/ce-compound/references/report.md"),
    "skills/ce-plan/references/plan-handoff.md": readRepoFile("skills/ce-plan/references/plan-handoff.md"),
    "skills/ce-pov/references/invocation.md": readRepoFile("skills/ce-pov/references/invocation.md"),
    "skills/ce-doc-review/references/synthesis-and-presentation.md": readRepoFile("skills/ce-doc-review/references/synthesis-and-presentation.md"),
  }

  test("callee return contracts say the return ends the skill, not the turn", () => {
    for (const [file, body] of Object.entries(calleeReturns)) {
      expect(body, `${file} must not present the return as the final output`).not.toMatch(/as the final output/)
      expect(body, `${file} must state the return ends the skill, not the turn`).toMatch(/ends this skill, not the turn/)
    }
  })

  test("lfg's completion rule resumes the next step after a child return", () => {
    const taskVisibility = readRepoFile("skills/lfg/references/task-visibility.md")
    expect(lfg).toMatch(/a child skill's return resumes the next numbered step in the same turn/)
    expect(taskVisibility).toMatch(/Its return ends the child, not the run: after writing or reading it, continue with the next numbered step in the same turn/)
  })
})
