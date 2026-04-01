import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8")
}

describe("ce:work review contract", () => {
  test("requires code review before shipping", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-work/SKILL.md")

    // Phase 3 has a mandatory code review step (not optional)
    expect(content).toContain("2. **Code Review**")
    expect(content).not.toContain("Consider Code Review")
    expect(content).not.toContain("Code Review** (Optional)")

    // Two-tier rubric
    expect(content).toContain("**Tier 1: Inline self-review**")
    expect(content).toContain("**Tier 2: Full review (default)**")
    expect(content).toContain("ce:review")
    expect(content).toContain("mode:autofix")

    // Quality checklist includes review
    expect(content).toContain("Code review completed (inline self-review or full `ce:review`)")
  })

  test("delegates commit and PR to dedicated skills", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-work/SKILL.md")

    expect(content).toContain("`git-commit-push-pr` skill")
    expect(content).toContain("`git-commit` skill")

    // Should not contain inline PR templates or attribution placeholders
    expect(content).not.toContain("gh pr create")
    expect(content).not.toContain("[HARNESS_URL]")
  })

  test("ce:work-beta mirrors review and commit delegation", async () => {
    const beta = await readRepoFile("plugins/compound-engineering/skills/ce-work-beta/SKILL.md")

    // Both have mandatory review
    expect(beta).toContain("2. **Code Review**")
    expect(beta).not.toContain("Consider Code Review")

    // Both delegate to git skills
    expect(beta).toContain("`git-commit-push-pr` skill")
    expect(beta).toContain("`git-commit` skill")
    expect(beta).not.toContain("gh pr create")
  })

  test("includes per-task testing deliberation in execution loop", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-work/SKILL.md")

    // Testing deliberation exists in the execution loop
    expect(content).toContain("Assess testing coverage")

    // Deliberation is between "Run tests after changes" and "Mark task as completed"
    const runTestsIdx = content.indexOf("Run tests after changes")
    const assessIdx = content.indexOf("Assess testing coverage")
    const markDoneIdx = content.indexOf("Mark task as completed")
    expect(runTestsIdx).toBeLessThan(assessIdx)
    expect(assessIdx).toBeLessThan(markDoneIdx)
  })

  test("quality checklist says 'Testing addressed' not 'Tests pass'", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-work/SKILL.md")

    // New language present
    expect(content).toContain("Testing addressed")

    // Old language fully removed
    expect(content).not.toContain("Tests pass (run project's test command)")
    expect(content).not.toContain("- All tests pass")
  })

  test("ce:work-beta mirrors testing deliberation and checklist changes", async () => {
    const beta = await readRepoFile("plugins/compound-engineering/skills/ce-work-beta/SKILL.md")

    // Testing deliberation in loop
    expect(beta).toContain("Assess testing coverage")

    // New checklist language
    expect(beta).toContain("Testing addressed")

    // Old language removed
    expect(beta).not.toContain("Tests pass (run project's test command)")
    expect(beta).not.toContain("- All tests pass")
  })
})

describe("ce:work codex delegation contract", () => {
  test("has argument parsing with delegate tokens", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-work/SKILL.md")

    // Argument parsing section exists with delegation tokens
    expect(content).toContain("## Argument Parsing")
    expect(content).toContain("`delegate:codex`")
    expect(content).toContain("`delegate:local`")

    // Resolution chain present
    expect(content).toContain("### Settings Resolution Chain")
    expect(content).toContain("work_delegate")
    expect(content).toContain("compound-engineering.local.md")
  })

  test("argument-hint includes delegate:codex for discoverability", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-work/SKILL.md")

    expect(content).toContain("argument-hint:")
    expect(content).toContain("delegate:codex")
  })

  test("has codex delegation mode section with all subsections", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-work/SKILL.md")

    // Main section
    expect(content).toContain("## Codex Delegation Mode")

    // Pre-delegation checks
    expect(content).toContain("### Pre-Delegation Checks")
    expect(content).toContain("CODEX_SANDBOX")
    expect(content).toContain("command -v codex")

    // Prompt template
    expect(content).toContain("### Prompt Template")
    expect(content).toContain("<task>")
    expect(content).toContain("<constraints>")
    expect(content).toContain("<output_contract>")

    // Result schema
    expect(content).toContain("### Result Schema")
    expect(content).toContain("result-schema.json")

    // Execution loop
    expect(content).toContain("### Execution Loop")
    expect(content).toContain("codex exec")

    // Circuit breaker
    expect(content).toContain("consecutive_failures")
    expect(content).toContain("3 consecutive failures")
  })

  test("delegation routing gate in Phase 1 Step 4", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-work/SKILL.md")

    // Delegation gate appears before strategy table
    const gateIdx = content.indexOf("Delegation routing gate")
    const strategyTableIdx = content.indexOf("| **Inline**")
    expect(gateIdx).toBeGreaterThan(0)
    expect(gateIdx).toBeLessThan(strategyTableIdx)
  })

  test("delegation branches in Phase 2 task loop", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-work/SKILL.md")

    // Task loop has delegation branch before standard implementation
    expect(content).toContain("If delegation_active: branch to the Codex Delegation Execution Loop")
  })

  test("swarm mode has mutual exclusion note", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-work/SKILL.md")

    expect(content).toContain("Mutual exclusion with delegation mode")
    expect(content).toContain("Delegation mode and swarm mode are mutually exclusive")
  })

  test("has clean-baseline preflight and rollback procedure", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-work/SKILL.md")

    expect(content).toContain("Clean-baseline preflight")
    expect(content).toContain("git status --short")
    expect(content).toContain("git checkout -- . && git clean -fd")
  })

  test("has result classification table with all categories", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-work/SKILL.md")

    expect(content).toContain("CLI failure")
    expect(content).toContain("Task failure")
    expect(content).toContain("Partial success")
    expect(content).toContain("Verify failure")
    expect(content).toContain("Success")
  })

  test("has mixed-model attribution guidance", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-work/SKILL.md")

    expect(content).toContain("### Mixed-Model Attribution")
  })

  test("has frontend design guidance ported from beta", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-work/SKILL.md")

    expect(content).toContain("**Frontend Design Guidance**")
    expect(content).toContain("`frontend-design` skill")
  })
})

describe("ce:work-beta delegation supersession", () => {
  test("external delegate mode is marked superseded", async () => {
    const beta = await readRepoFile("plugins/compound-engineering/skills/ce-work-beta/SKILL.md")

    expect(beta).toContain("## External Delegate Mode (Superseded)")
    expect(beta).toContain("delegate:codex")
    expect(beta).toContain("Superseded")
  })

  test("enabling section is marked superseded", async () => {
    const beta = await readRepoFile("plugins/compound-engineering/skills/ce-work-beta/SKILL.md")

    expect(beta).toContain("### Enabling External Delegation (Superseded)")
  })
})

describe("ce:plan external-delegate removal", () => {
  test("no longer emits Execution target: external-delegate", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-plan/SKILL.md")

    // Old tag removed from execution posture signals
    expect(content).not.toContain("add `Execution target: external-delegate`")

    // Old tag removed from execution note examples
    expect(content).not.toContain("Execution note: Execution target: external-delegate")

    // Replaced with delegation-aware guidance
    expect(content).toContain("delegate:codex")
  })
})

describe("ce:brainstorm review contract", () => {
  test("requires document review before handoff", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-brainstorm/SKILL.md")

    // Phase 3.5 exists and runs document-review
    expect(content).toContain("### Phase 3.5: Document Review")
    expect(content).toContain("`document-review` skill")

    // Phase 3 and Phase 4 are extracted to references for token optimization
    expect(content).toContain("`references/requirements-capture.md`")
    expect(content).toContain("`references/handoff.md`")

    // Handoff option is for additional passes, not the first review (now in extracted reference)
    const handoff = await readRepoFile("plugins/compound-engineering/skills/ce-brainstorm/references/handoff.md")
    expect(handoff).toContain("**Run additional document review**")
    expect(handoff).not.toContain("**Review and refine**")
  })
})

describe("ce:plan testing contract", () => {
  test("flags blank test scenarios on feature-bearing units as incomplete", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-plan/SKILL.md")

    // Phase 5.1 review checklist addresses blank test scenarios
    expect(content).toContain("blank or missing test scenarios")
    expect(content).toContain("Test expectation: none")

    // Template comment mentions the annotation convention
    expect(content).toContain("Test expectation: none -- [reason]")
  })
})

describe("ce:plan review contract", () => {
  test("requires document review after confidence check", async () => {
    // Document review instructions extracted to references/plan-handoff.md
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-plan/references/plan-handoff.md")

    // Phase 5.3.8 runs document-review before final checks (5.3.9)
    expect(content).toContain("## 5.3.8 Document Review")
    expect(content).toContain("`document-review` skill")

    // Document review must come before final checks so auto-applied edits are validated
    const docReviewIdx = content.indexOf("5.3.8 Document Review")
    const finalChecksIdx = content.indexOf("5.3.9 Final Checks")
    expect(docReviewIdx).toBeLessThan(finalChecksIdx)
  })

  test("SKILL.md stub points to plan-handoff reference", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-plan/SKILL.md")

    // Stub references the handoff file and marks document review as mandatory
    expect(content).toContain("`references/plan-handoff.md`")
    expect(content).toContain("Document review is mandatory")
  })

  test("uses headless mode in pipeline context", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-plan/references/plan-handoff.md")

    // Pipeline mode runs document-review headlessly, not skipping it
    expect(content).toContain("document-review` with `mode:headless`")
    expect(content).not.toContain("skip document-review and return control")
  })

  test("handoff options recommend ce:work after review", async () => {
    const content = await readRepoFile("plugins/compound-engineering/skills/ce-plan/references/plan-handoff.md")

    // ce:work is recommended (review already happened)
    expect(content).toContain("**Start `/ce:work`** - Begin implementing this plan in the current environment (recommended)")

    // Document review option is for additional passes
    expect(content).toContain("**Run additional document review**")

    // No conditional ordering based on plan depth (review already ran)
    expect(content).not.toContain("**Options when document-review is recommended:**")
    expect(content).not.toContain("**Options for Standard or Lightweight plans:**")
  })
})
