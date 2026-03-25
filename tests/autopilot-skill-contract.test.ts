import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8")
}

describe("autopilot skill contract", () => {
  test("lfg defines the marker, manifest, gates, and deprecation path", async () => {
    const lfg = await readRepoFile("plugins/compound-engineering/skills/lfg/SKILL.md")
    const slfg = await readRepoFile("plugins/compound-engineering/skills/slfg/SKILL.md")

    expect(lfg).toContain("[ce-autopilot manifest=.context/compound-engineering/autopilot/<run-id>/session.json] ::")
    expect(lfg).toContain(".context/compound-engineering/autopilot/<run-id>/session.json")
    expect(lfg).toContain("`requirements`")
    expect(lfg).toContain("`plan`")
    expect(lfg).toContain("`implementation`")
    expect(lfg).toContain("`review`")
    expect(lfg).toContain("`verification`")
    expect(lfg).toContain("`wrap_up`")
    expect(lfg).toContain("`status` = `active | completed | aborted`")
    expect(lfg).toContain("`schema_version`")
    expect(lfg).toContain("`route` = `direct | lightweight | full`")
    expect(lfg).toContain("`implementation_mode` = `standard | swarm`")
    expect(lfg).toContain("`state` = `complete | skipped | pending | blocked | unknown`")
    expect(lfg).toContain("`current_gate` (optional, advisory only; recompute from gate state on resume)")
    expect(lfg).toContain("`artifacts.requirements_doc | artifacts.plan_doc`")
    expect(lfg).toContain("`ref` only for `review`, `verification`, and `wrap_up`")
    expect(lfg).toContain("if the setting is missing, assume `standard`")
    expect(lfg).toContain("An open PR does not mean the run is done.")
    expect(lfg).toContain("If `$ARGUMENTS` is empty, do not assess complexity yet. Route to **Full pipeline** so it can first check whether there is resumable work")
    expect(lfg).toContain("If one does not exist, reconstruct one conservatively using this algorithm:")
    expect(lfg).toContain("Never infer those gates complete from an open PR alone")
    expect(lfg).toContain("if `gates.review.ref` exists and does not match the current HEAD")
    expect(lfg).toContain("if `gates.verification.ref` exists and does not match the current HEAD")
    expect(lfg).toContain("if `gates.wrap_up.ref` exists and does not match the current HEAD")
    expect(lfg).toContain("After each downstream skill returns, update the manifest evidence, recompute the first unmet gate")
    expect(lfg).toContain("update `artifacts.plan_doc` in the autopilot manifest")
    expect(lfg).toContain("<plan-path-from-artifacts.plan_doc>")
    expect(lfg).toContain("Do not gate this check on the first unmet gate still being `plan`")
    expect(lfg).toContain("Direct and lightweight routes still create a lightweight manifest immediately.")
    expect(lfg).toContain("Treat `test-browser` and `feature-video` as best-effort by default.")
    expect(lfg).toContain("Output `<promise>DONE</promise>` only when all required gates are `complete` or `skipped`.")
    expect(lfg).toContain("If the run is only waiting on external CI, report that explicitly instead of claiming completion.")
    expect(lfg).not.toContain("`mode` = `autopilot`")
    expect(lfg).not.toContain("`artifacts.requirements_doc | artifacts.plan_doc | artifacts.decision_log`")

    expect(slfg).toContain("[DEPRECATED] Compatibility wrapper")
    expect(slfg).toContain("Immediately route to `lfg`")
    expect(slfg).toContain("explicit swarm request in the forwarded input")
    expect(slfg).toContain("Do not duplicate routing logic, manifest logic, or downstream skill-calling rules here.")
  })

  test("decision-owner skills declare marker parsing and role ordering", async () => {
    const brainstorm = await readRepoFile("plugins/compound-engineering/skills/ce-brainstorm/SKILL.md")
    const plan = await readRepoFile("plugins/compound-engineering/skills/ce-plan/SKILL.md")
    const deepenPlan = await readRepoFile("plugins/compound-engineering/skills/deepen-plan/SKILL.md")
    const work = await readRepoFile("plugins/compound-engineering/skills/ce-work/SKILL.md")
    const workBeta = await readRepoFile("plugins/compound-engineering/skills/ce-work-beta/SKILL.md")

    for (const content of [brainstorm, plan, deepenPlan, work]) {
      expect(content).toContain("[ce-autopilot manifest=.context/compound-engineering/autopilot/<run-id>/session.json] ::")
      expect(content).toContain("Validate that the manifest describes an active autopilot run")
    }

    expect(workBeta).toContain("[ce-autopilot manifest=.context/compound-engineering/autopilot/<run-id>/session.json] ::")
    expect(workBeta).toContain("Validate that the manifest describes an active autopilot run")

    expect(brainstorm).toContain("`Product Manager > Designer > Engineer`")
    expect(brainstorm).toContain("**May decide automatically**")
    expect(brainstorm).toContain("**Must ask**")
    expect(brainstorm).toContain("**Must log**")
    expect(brainstorm).toContain("set `gates.requirements.state = complete`")

    expect(plan).toContain("`Engineer > Product Manager > Designer`")
    expect(plan).toContain("Dominant decision criteria:")
    expect(plan).toContain("update the manifest's `artifacts.plan_doc`")
    expect(plan).toContain("prefer the document whose topic and problem frame most closely match the current feature description")
    expect(plan).not.toContain("most recent matching document automatically")
    expect(plan).not.toContain("Pipeline Mode")

    expect(deepenPlan).toContain("`Engineer > Product Manager > Designer`")
    expect(deepenPlan).toContain("keep the canonical decision rows in the run-scoped `decisions.md`")
    expect(deepenPlan).toContain("fall back to the manifest's `artifacts.plan_doc` when present")

    expect(work).toContain("`Engineer > Designer > Product Manager`")
    expect(work).toContain("`Local Leverage`")
    expect(work).toContain("execution discoveries")
    expect(work).toContain("Treat `manifest.implementation_mode=swarm` as the explicit swarm opt-in")
    expect(work).toContain("active autopilot manifest sets `implementation_mode=swarm`")
    expect(work).toContain("owner of `gates.implementation`")
    expect(work).toContain("reviewable checkpoint")
    expect(work).toContain("update `gates.implementation.evidence`")
    expect(work).toContain('if [ -n "$(git status --porcelain)" ]; then')
    expect(work).toContain("Only pull before branching when the worktree is clean")

    expect(workBeta).toContain("Treat `manifest.implementation_mode=swarm` as the explicit swarm opt-in")
    expect(workBeta).toContain("active autopilot manifest sets `implementation_mode=swarm`")
    expect(workBeta).toContain('if [ -n "$(git status --porcelain)" ]; then')
    expect(workBeta).toContain("Only pull before branching when the worktree is clean")
  })

  test("utility skills and review utility use the shared autopilot contract", async () => {
    const review = await readRepoFile("plugins/compound-engineering/skills/ce-review/SKILL.md")
    const setup = await readRepoFile("plugins/compound-engineering/skills/setup/SKILL.md")
    const documentReview = await readRepoFile("plugins/compound-engineering/skills/document-review/SKILL.md")
    const schema = await readRepoFile(
      "plugins/compound-engineering/skills/document-review/references/findings-schema.json",
    )
    const browser = await readRepoFile("plugins/compound-engineering/skills/test-browser/SKILL.md")
    const featureVideo = await readRepoFile("plugins/compound-engineering/skills/feature-video/SKILL.md")
    const agents = await readRepoFile("plugins/compound-engineering/AGENTS.md")
    const readme = await readRepoFile("plugins/compound-engineering/README.md")

    expect(review).toContain("[ce-autopilot manifest=.context/compound-engineering/autopilot/<run-id>/session.json] ::")
    expect(review).toContain("Default to `mode:autofix` when no explicit mode token remains")
    expect(review).toContain("owner of `gates.review`")
    expect(review).toContain("`gates.review.state = complete`")
    expect(review).toContain("`gates.review.ref = current HEAD`")

    expect(setup).toContain("preserve the current `implementation_mode` unless the user explicitly changes it during setup")
    expect(setup).toContain("implementation_mode: {existing value or chosen value, default standard}")
    expect(setup).toContain("How should lfg handle implementation by default?")

    expect(documentReview).toContain("review utility, not a primary decision-maker")
    expect(documentReview).toContain("`mechanical-fix`")
    expect(documentReview).toContain("`bounded-decision`")
    expect(documentReview).toContain("`must-ask`")
    expect(documentReview).toContain("`note`")

    expect(schema).toContain('"finding_class"')
    expect(schema).toContain('"mechanical-fix"')
    expect(schema).toContain('"bounded-decision"')
    expect(schema).toContain('"must-ask"')
    expect(schema).toContain('"note"')

    expect(browser).toContain("Treat this skill as an autopilot contract consumer, not a substantive decision owner")
    expect(browser).toContain("Do not append substantive product or implementation decisions to the autopilot decision log")
    expect(browser).toContain("Treat `verification` as best-effort by default")
    expect(browser).toContain("`gates.verification.state = skipped`")
    expect(browser).toContain("`gates.verification.state = complete`")
    expect(browser).toContain("`gates.verification.ref = current HEAD`")
    expect(browser).toContain("`gates.verification.state = pending`")

    expect(featureVideo).toContain("Treat this skill as an autopilot contract consumer, not a substantive decision owner")
    expect(featureVideo).toContain("Do not append substantive product or implementation decisions to the autopilot decision log")
    expect(featureVideo).toContain("Treat `wrap_up` as best-effort by default")
    expect(featureVideo).toContain("`gates.wrap_up.state = skipped`")
    expect(featureVideo).toContain("`gates.wrap_up.state = complete`")
    expect(featureVideo).toContain("`gates.wrap_up.ref = current HEAD`")

    expect(agents).toContain("`lfg` is the only top-level autopilot entrypoint")
    expect(agents).toContain("[ce-autopilot manifest=.context/compound-engineering/autopilot/<run-id>/session.json] ::")
    expect(agents).toContain("execution skills must honor the active manifest's `implementation_mode` during autopilot")
    expect(agents).toContain("direct and lightweight routes still create lightweight manifests")
    expect(agents).toContain("late-stage gate completions may carry a HEAD `ref`")

    expect(readme).toContain("Deprecated compatibility wrapper that routes to `/lfg` with swarm mode enabled")
    expect(readme).toContain("resumes from the first unmet workflow gate")
    expect(readme).toContain("Browser testing and feature-video remain best-effort by default")
  })
})
